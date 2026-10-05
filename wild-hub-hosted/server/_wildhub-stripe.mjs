import Stripe from 'stripe';
import {createStripeSandboxAdapter} from './_wildhub-billing.mjs';

export const WILD_HUB_STRIPE_SDK_VERSION='23.0.0';
export const WILD_HUB_STRIPE_API_VERSION='2026-09-30.endive';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const check=(value,code)=>{if(!value)fail(code);};
const accountId=value=>typeof value==='string'&&/^acct_[A-Za-z0-9]+$/.test(value);

/** Official SDK composition for an explicitly approved isolated sandbox.
 * Construction performs no requests and reads no environment/credential files.
 * The default transport is disabled. Configure credentials securely before enabling it.
 * expectedSandboxAccountId must be independently verified in the sandbox dashboard:
 * a test key alone cannot distinguish a general sandbox from legacy test mode.
 */
export function createWildHubStripeProvider({
  secretKey,webhookSecret,expectedSandboxAccountId,connectedAccountIds,
  providerRequestsEnabled=false,fetchImpl=globalThis.fetch
}={}) {
  check(Stripe.PACKAGE_VERSION===WILD_HUB_STRIPE_SDK_VERSION&&Stripe.API_VERSION===WILD_HUB_STRIPE_API_VERSION,'stripe_version_mismatch');
  check(typeof secretKey==='string'&&/^(?:sk|rk)_test_[A-Za-z0-9]+$/.test(secretKey),'test_key_required');
  check(typeof webhookSecret==='string'&&/^whsec_[A-Za-z0-9]+$/.test(webhookSecret),'webhook_secret_required');
  check(accountId(expectedSandboxAccountId),'sandbox_account_required');
  check(Array.isArray(connectedAccountIds)&&connectedAccountIds.length>0&&connectedAccountIds.every(id=>accountId(id)&&id!==expectedSandboxAccountId),'connected_account_allowlist_required');
  check(typeof fetchImpl==='function','stripe_transport_required');
  const destinations=new Set(connectedAccountIds);
  const requestsAllowed=providerRequestsEnabled===true;
  function requireRequests(){check(requestsAllowed,'provider_requests_disabled');}
  const transport=async(url,init)=>{
    requireRequests();
    const parsed=new URL(url),headers=new Headers(init.headers);
    check(parsed.protocol==='https:'&&parsed.hostname==='api.stripe.com'&&parsed.port===''&&!parsed.username&&!parsed.password&&parsed.pathname.startsWith('/v1/'),'stripe_transport_origin_forbidden');
    check(!headers.has('stripe-account')&&!headers.has('stripe-context'),'stripe_account_override_forbidden');
    check(headers.get('stripe-version')===WILD_HUB_STRIPE_API_VERSION,'stripe_api_version_mismatch');
    return fetchImpl(url,{...init,redirect:'error'});
  };
  const sdk=new Stripe(secretKey,{
    apiVersion:WILD_HUB_STRIPE_API_VERSION,maxNetworkRetries:0,timeout:10000,
    telemetry:false,appInfo:{name:'Wild Hub isolated sandbox',version:'1'},
    httpClient:Stripe.createFetchHttpClient(transport)
  });
  let verified=null,verification=null,verifiedAt=null;
  async function verifySandbox(){
    requireRequests();
    if(verification)return verification;
    verification=(async()=>{
      const account=await sdk.accounts.retrieve();
      check(account?.object==='account'&&account.id===expectedSandboxAccountId&&!account.deleted,'sandbox_account_mismatch');
      const balance=await sdk.balance.retrieve();
      check(balance?.object==='balance'&&balance.livemode===false,'sandbox_test_mode_required');
      verified=account;verifiedAt=new Date().toISOString();
      return {verified:true,testMode:true,accountId:expectedSandboxAccountId,apiVersion:WILD_HUB_STRIPE_API_VERSION};
    })();
    try{return await verification;}catch(error){verified=null;verifiedAt=null;throw error;}finally{verification=null;}
  }
  async function ensureVerified(){requireRequests();if(!verified)await verifySandbox();}
  async function call(method,...args){await ensureVerified();return method(...args);}
  async function requireDestination(params){
    const destination=params.mode==='subscription'?params.subscription_data?.transfer_data?.destination:params.payment_intent_data?.transfer_data?.destination;
    check(destinations.has(destination),'destination_not_allowed');
    await ensureVerified();
    const account=await sdk.accounts.retrieve(destination);
    check(account?.object==='account'&&account.id===destination&&!account.deleted&&account.capabilities?.transfers==='active','destination_not_ready');
  }
  // A narrow facade, never the raw SDK, reaches the domain adapter.
  const client={
    accounts:{retrieve:async()=>{await ensureVerified();return {id:verified.id};}},
    checkout:{sessions:{
      create:async(params,options)=>{await requireDestination(params);return sdk.checkout.sessions.create(params,options);},
      retrieve:(...args)=>call(sdk.checkout.sessions.retrieve.bind(sdk.checkout.sessions),...args),
      listLineItems:(...args)=>call(sdk.checkout.sessions.listLineItems.bind(sdk.checkout.sessions),...args),
      expire:(...args)=>call(sdk.checkout.sessions.expire.bind(sdk.checkout.sessions),...args)
    }},
    subscriptions:{retrieve:(...args)=>call(sdk.subscriptions.retrieve.bind(sdk.subscriptions),...args),cancel:(...args)=>call(sdk.subscriptions.cancel.bind(sdk.subscriptions),...args)},
    invoices:{retrieve:(...args)=>call(sdk.invoices.retrieve.bind(sdk.invoices),...args)},
    paymentIntents:{retrieve:(...args)=>call(sdk.paymentIntents.retrieve.bind(sdk.paymentIntents),...args)},
    webhooks:{constructEvent:(...args)=>sdk.webhooks.constructEvent(...args)}
  };
  const stripe=createStripeSandboxAdapter({makeClient:()=>client,secretKey,webhookSecret,platformAccountId:expectedSandboxAccountId,apiVersion:WILD_HUB_STRIPE_API_VERSION});
  return Object.freeze({
    stripe,verifySandbox,
    diagnostics:()=>({provider:'stripe',requestsEnabled:requestsAllowed,testMode:true,verified:Boolean(verified),verifiedAt,apiVersion:WILD_HUB_STRIPE_API_VERSION,sdkVersion:WILD_HUB_STRIPE_SDK_VERSION})
  });
}
