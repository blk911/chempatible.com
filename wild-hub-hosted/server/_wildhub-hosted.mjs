// Dedicated Wild Hub HTTP boundary. This module never loads environment variables.
import {timingSafeEqual} from 'node:crypto';
import {renderWildHubQr} from './_wildhub-qr.mjs';

export const WILD_HUB_HOSTED_PROJECT='prj_74yUHa6mrd6AZBII9pdAg6cOjKPN';
export const WILD_HUB_CANONICAL_ORIGIN='https://bsidevibes.com';
export const HOSTED_BODY_BYTES=4*1024*1024;
export const HOSTED_HEADERS=Object.freeze({
  'cache-control':'private, no-store',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'x-robots-tag':'noindex, nofollow, noarchive',
  'referrer-policy':'no-referrer',
  'cross-origin-resource-policy':'same-origin',
  'permissions-policy':'camera=(self), microphone=(), geolocation=(), payment=()',
  'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
});
const response=(value,status=200)=>Response.json({ok:status<400,...value},{status,headers:HOSTED_HEADERS});
const fail=(status,code,message)=>response({error:{code,message}},status);
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const email=/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i;

/** Validate a new-project-only configuration before constructing any provider. */
export function readWildHubHostedConfig(env={}) {
  if(env.WH_MODE!=='isolated-test'||env.VERCEL_PROJECT_ID!==WILD_HUB_HOSTED_PROJECT)throw Error('Wild Hub project is not enabled.');
  let origin,databaseUrl;
  try {origin=new URL(env.WH_ORIGIN);databaseUrl=new URL(env.WH_DATABASE_URL);}catch {throw Error('Wild Hub configuration is incomplete.');}
  // Configuration selects ONE origin; accepting the chosen apex here does not
  // make it an additional request origin or relax any handler/service gate.
  if(origin.protocol!=='https:'||origin.origin!==env.WH_ORIGIN||origin.username||origin.password||origin.port||!origin.hostname.endsWith('.vercel.app')&&env.WH_ORIGIN!==WILD_HUB_CANONICAL_ORIGIN)throw Error('Wild Hub needs its approved exact HTTPS origin.');
  if(!['postgres:','postgresql:'].includes(databaseUrl.protocol)||!databaseUrl.hostname.endsWith('.neon.tech')||databaseUrl.hostname!==env.WH_DB_HOST||databaseUrl.hash||databaseUrl.port&&databaseUrl.port!=='5432'||databaseUrl.searchParams.getAll('sslmode').length!==1||databaseUrl.searchParams.get('sslmode')!=='require'||[...databaseUrl.searchParams.keys()].some(key=>!['sslmode','channel_binding'].includes(key))||databaseUrl.searchParams.getAll('channel_binding').length>1||databaseUrl.searchParams.has('channel_binding')&&databaseUrl.searchParams.get('channel_binding')!=='require')throw Error('Wild Hub needs its isolated TLS database.');
  let password;try{password=decodeURIComponent(databaseUrl.password);}catch{throw Error('Invalid database credential.');}
  if(!password||password.includes('\0'))throw Error('An explicit independent database password is required.');
  if(!/^[a-z_][a-z0-9_]{2,62}$/.test(env.WH_DB_NAME||'')||!/^wild_hub_[a-z0-9_]+$/.test(env.WH_DB_ROLE||'')||decodeURIComponent(databaseUrl.pathname.slice(1))!==env.WH_DB_NAME||decodeURIComponent(databaseUrl.username)!==env.WH_DB_ROLE)throw Error('Wild Hub database identity is incomplete.');
  if(!/^wild-hub-[a-z0-9-]{8,80}$/.test(env.WH_ISOLATION_ID||'')||!/^.{64,}$/.test(env.WH_SESSION_SECRET||''))throw Error('Wild Hub isolation settings are incomplete.');
  const recipients=(env.WH_TEST_EMAILS||'').split(',').map(v=>v.trim().toLowerCase());
  if(recipients.length!==2||new Set(recipients).size!==2||recipients.some(v=>!email.test(v))||!email.test(env.WH_MAIL_FROM||'')||!/^SG\.[\w-]+\.[\w-]+$/.test(env.WH_SENDGRID_KEY||''))throw Error('Wild Hub test mail configuration is incomplete.');
  if(env.WH_BILLING_ENABLED&&!['true','false'].includes(env.WH_BILLING_ENABLED))throw Error('Invalid sandbox mode.');
  let billingConfig=null;
  if(env.WH_BILLING_ENABLED==='true'){
    if(!/^(?:sk|rk)_test_[A-Za-z0-9]+$/.test(env.WH_STRIPE_KEY||'')||!/^whsec_[A-Za-z0-9]+$/.test(env.WH_STRIPE_WEBHOOK_SECRET||'')||!/^acct_[A-Za-z0-9]+$/.test(env.WH_STRIPE_SANDBOX_ACCOUNT||'')||typeof env.WH_JOBS_SECRET!=='string'||env.WH_JOBS_SECRET.length<64)throw Error('Isolated Stripe sandbox credentials are incomplete.');
    try{billingConfig=JSON.parse(env.WH_STRIPE_CONFIG);}catch{throw Error('Sandbox plans are incomplete.');}
    if(billingConfig?.mode!=='test'||billingConfig.origin!==origin.origin||billingConfig.platformAccountId!==env.WH_STRIPE_SANDBOX_ACCOUNT||!billingConfig.hubs||Object.keys(billingConfig.hubs).length!==1)throw Error('Sandbox settings do not match the approved test service.');
  }
  if(env.WH_JOBS_SECRET&&env.WH_JOBS_SECRET.length<64)throw Error('Independent jobs secret is incomplete.');
  return Object.freeze({origin:origin.origin,dbHost:databaseUrl.hostname,dbPassword:password,database:env.WH_DB_NAME,role:env.WH_DB_ROLE,isolationId:env.WH_ISOLATION_ID,secret:env.WH_SESSION_SECRET,recipients:Object.freeze(recipients),mailFrom:env.WH_MAIL_FROM,sendgridKey:env.WH_SENDGRID_KEY,billingEnabled:Boolean(billingConfig),billingConfig,stripeKey:env.WH_STRIPE_KEY,stripeWebhookSecret:env.WH_STRIPE_WEBHOOK_SECRET,sandboxAccount:env.WH_STRIPE_SANDBOX_ACCOUNT,jobsSecret:env.WH_JOBS_SECRET||null});
}

async function boundedBytes(request,maximum) {
  if(Number(request.headers.get('content-length'))>maximum)throw Object.assign(Error('Request too large.'),{status:413,code:'body_too_large'});
  const reader=request.body?.getReader(),chunks=[];let size=0;
  if(reader)while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>maximum){await reader.cancel();throw Object.assign(Error('Request too large.'),{status:413,code:'body_too_large'});}chunks.push(next.value);}
  return Buffer.concat(chunks);
}
function secured(result) {
  const headers=new Headers(result.headers);for(const [key,value] of Object.entries(HOSTED_HEADERS))headers.set(key,value);
  return new Response(result.body,{status:result.status,headers});
}
function sameSecret(provided,expected) {
  if(typeof expected!=='string'||expected.length<64||typeof provided!=='string')return false;
  const a=Buffer.from(provided),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);
}

/** Service and billing are injected only after database isolation succeeds.
 * Jobs are bounded, server-only work. Failures never undo member revocation.
 */
export function createWildHubHostedHandler({service,origin,billing=null,dispatchNotifications=null,schedule=()=>{},jobsSecret=null,mailDeliveryMode='provider',onError=()=>{}}={}) {
  if(typeof service!=='function'||new URL(origin).origin!==origin||!origin.startsWith('https://'))throw Error('Verified HTTPS service required.');
  async function jobs(){
    const result={};
    if(dispatchNotifications)try{result.mail=await dispatchNotifications({limit:10});}catch{onError('notification_job_failed');}
    if(billing)try{result.reconciliation=await billing.reconcileMembershipEvents({limit:20});result.cancellation=await billing.runCancellationJobs({limit:10});}catch{onError('billing_job_failed');}
    return result;
  }
  function backgroundJobs(){
    // Once service/provider work commits, scheduling failure must not change the
    // response. Catch the promise even if a runtime declines to keep it alive.
    const work=jobs().catch(()=>onError('background_job_failed'));
    try{schedule(work);}catch{onError('background_schedule_failed');}
  }
  async function authenticated(request){
    const checked=await service(new Request(`${origin}/api/wildhub?action=me`,{headers:{cookie:request.headers.get('cookie')||''}}));
    if(!checked.ok)return {failure:secured(checked)};
    const body=await checked.json();
    if(!body.user?.verified||body.user.standing!=='active'||!uuid.test(body.user.id))return {failure:fail(401,'sign_in_required','Sign in to continue.')};
    return {user:body.user};
  }
  return async request=>{
    try {
      const url=new URL(request.url);
      if(url.origin!==origin)return fail(403,'origin_mismatch','Use the approved Wild Hub test address.');
      if(!['GET','HEAD','POST'].includes(request.method))return fail(405,'method_not_allowed','Method not allowed.');
      const webhook=url.pathname==='/api/wildhub-webhook',jobRoute=url.pathname==='/api/wildhub-jobs';
      if(request.method==='POST'&&!webhook&&!jobRoute&&(request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')==='cross-site'))return fail(403,'origin_mismatch','This request needs the same Wild Hub test page.');
      if(url.pathname==='/api/wildhub-config'){
        if(request.method!=='GET')return fail(405,'method_not_allowed','Method not allowed.');
        return response({environment:'isolated-test',emailMode:mailDeliveryMode,billingEnabled:Boolean(billing),testMode:true,videoEnabled:false,bodyBytes:HOSTED_BODY_BYTES});
      }
      if(url.pathname==='/api/wildhub-qr')return secured(await renderWildHubQr(request,{origin}));
      if(jobRoute){
        if(request.method!=='POST'||!sameSecret(request.headers.get('authorization')?.replace(/^Bearer /,''),jobsSecret))return fail(404,'not_found','Not found.');
        if(Number(request.headers.get('content-length')||0)>0)return fail(400,'unexpected_body','No body is accepted.');
        return response({jobs:await jobs()});
      }
      if(webhook){
        if(!billing)return fail(503,'billing_disabled','Stripe sandbox is not configured.');
        if(request.method!=='POST')return fail(405,'method_not_allowed','Method not allowed.');
        const result=await billing.handleWebhook({rawBody:await boundedBytes(request,1_048_576),signature:request.headers.get('stripe-signature')});
        backgroundJobs();return response(result);
      }
      if(url.pathname==='/api/wildhub'){
        let forwarded=request;
        if(request.method==='POST')forwarded=new Request(request.url,{method:'POST',headers:request.headers,body:await boundedBytes(request,HOSTED_BODY_BYTES)});
        const result=await service(forwarded);
        if(request.method==='POST'&&result.ok)backgroundJobs();
        return secured(result);
      }
      if(url.pathname!=='/api/wildhub-billing')return fail(404,'not_found','Not found.');
      const action=url.searchParams.get('action');
      if(!['config','status','checkout'].includes(action))return fail(404,'not_found','Not found.');
      if(request.method!==(action==='checkout'?'POST':'GET'))return fail(405,'method_not_allowed','Method not allowed.');
      const identity=await authenticated(request);if(identity.failure)return identity.failure;
      if(!billing){if(action==='checkout')return fail(503,'billing_disabled','Stripe sandbox is not configured.');return response({enabled:false,testMode:true,membership:[],support:[],checkout:null});}
      if(action==='checkout'){
        if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))return fail(415,'json_required','Use application/json.');
        let input;try{input=JSON.parse((await boundedBytes(request,16384)).toString('utf8'));}catch(error){if(error.status)throw error;return fail(400,'invalid_json','Invalid JSON body.');}
        if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['hubId','kind','planKey','requestKey','expectedRevision'].includes(k)))return fail(400,'unexpected_field','Invalid checkout fields.');
        return response(await billing.createCheckout({userId:identity.user.id,input}));
      }
      const hubId=url.searchParams.get('hubId');if(!uuid.test(hubId||'')||[...url.searchParams.keys()].some(k=>!['action','hubId'].includes(k)))return fail(400,'invalid_id','Choose a valid circle.');
      return response(await billing[action==='config'?'getConfig':'getStatus']({userId:identity.user.id,hubId}));
    }catch(error){
      const safeCodes=new Set(['approved_members_only','account_unavailable','hub_unavailable','admission_changed','idempotency_conflict','checkout_closed','subscription_already_pending','plan_not_allowed','invalid_input','invalid_request_key','unexpected_field','invalid_id','invalid_signature','webhook_body_size','event_replay_mismatch','live_mode_forbidden']);
      if(error.status===413)return fail(413,'body_too_large','This test upload is too large. Choose a smaller photo.');
      if(safeCodes.has(error.code))return fail(['invalid_signature','invalid_id','invalid_input','invalid_request_key','unexpected_field','webhook_body_size'].includes(error.code)?400:409,error.code,'This action could not be completed. Refresh your community status and try again.');
      onError('hosted_request_failed');return fail(503,'service_unavailable','Wild Hub is temporarily unavailable. Try again shortly.');
    }
  };
}
