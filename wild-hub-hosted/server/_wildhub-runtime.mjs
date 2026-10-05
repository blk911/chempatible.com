// Imported only by the dedicated wild-hub-hosted project, never api/wildhub.mjs.
import {Pool,neonConfig} from '@neondatabase/serverless';
import sharp from 'sharp';
import {waitUntil} from '@vercel/functions';
import {createWildHubPostgresAdapter,createWildHubMailAdapter} from './_wildhub-adapters.mjs';
import {createWildHubService} from './_wildhub-service.mjs';
import {createWildHubHostedHandler,readWildHubHostedConfig,HOSTED_HEADERS} from './_wildhub-hosted.mjs';
import {createWildHubStripeProvider} from './_wildhub-stripe.mjs';
import {createWildHubBilling,createWildHubBillingStore,readWildHubPaidEntitlement} from './_wildhub-billing.mjs';
import {createWildHubCreatorFinanceReader} from './_wildhub-creator-finance.mjs';

let cached;
export async function initializeWildHubRuntime({env,poolFactory=options=>new Pool(options),fetchImpl=fetch,schedule=waitUntil}={}) {
  const config=readWildHubHostedConfig(env);
  const allowed=new Set(config.recipients),emailAllowed=address=>allowed.has(address.toLowerCase());
  if(typeof globalThis.WebSocket==='function')neonConfig.webSocketConstructor=globalThis.WebSocket;
  // Explicit fields prevent driver query-string overrides and ambient PG*
  // credential fallback. The original URL is never passed to the driver.
  const pool=poolFactory({host:config.dbHost,port:5432,database:config.database,user:config.role,password:config.dbPassword,ssl:{rejectUnauthorized:true},application_name:'wild-hub-isolated-test',max:3,connectionTimeoutMillis:8000,idleTimeoutMillis:10000});
  try {
    const db=createWildHubPostgresAdapter({pool,isolationId:config.isolationId,database:config.database,role:config.role});
    await db.verifyIsolation();
    const mail=createWildHubMailAdapter({sendgridKey:config.sendgridKey,from:config.mailFrom,recipients:config.recipients,fetchImpl});
    let billing=null;
    if(config.billingEnabled){
      const provider=createWildHubStripeProvider({secretKey:config.stripeKey,webhookSecret:config.stripeWebhookSecret,expectedSandboxAccountId:config.sandboxAccount,connectedAccountIds:Object.values(config.billingConfig.hubs).map(hub=>hub.destinationAccountId),providerRequestsEnabled:true,fetchImpl});
      billing=createWildHubBilling({enabled:true,stripe:provider.stripe,store:createWildHubBillingStore({db}),config:config.billingConfig});
    }
    const service=createWildHubService({db,mail,origin:config.origin,secret:config.secret,sharp,emailAllowed,secureCookies:true,scheduleNotifications:schedule,readPaidEntitlement:config.billingEnabled?readWildHubPaidEntitlement:async()=>null,readCreatorFinance:createWildHubCreatorFinanceReader({billingEnabled:config.billingEnabled,billingConfig:config.billingConfig})});
    const handler=createWildHubHostedHandler({service,origin:config.origin,billing,dispatchNotifications:service.dispatchNotifications,schedule,jobsSecret:config.jobsSecret,mailDeliveryMode:'provider'});
    return {handler,close:()=>pool.end()};
  }catch(error){try{await pool.end();}catch{}throw error;}
}

export async function wildHubFetch(request) {
  try {
    // No environment values are consulted during imports/builds. A failed
    // preflight is not cached, so approved secure configuration can recover.
    if(!cached)cached=initializeWildHubRuntime({env:process.env}).catch(error=>{cached=null;throw error;});
    return await (await cached).handler(request);
  }catch {
    return Response.json({ok:false,error:{code:'not_configured',message:'The isolated Wild Hub test service is being configured.'}},{status:503,headers:HOSTED_HEADERS});
  }
}
