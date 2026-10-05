// Preparation only: no environment reads, credentials, SDK import, persistence,
// HTTP route, or startup work. Nothing in this module enables the runtime.
const fail=code=>{throw Object.assign(new Error(code),{code});};
const check=(value,code)=>{if(!value)fail(code);};
const accountId=value=>typeof value==='string'&&/^acct_[A-Za-z0-9]+$/.test(value);
const uuidPattern=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const uuid=value=>{check(typeof value==='string'&&uuidPattern.test(value),'connect_invalid_id');return value.toLowerCase();};
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const paymentFeatures=Object.freeze([
  'capture_payments','refund_management','dispute_management',
  'smart_disputes_management','destination_on_behalf_of_charge_management'
]);

/** Fixed server allowlist. Never merge browser-provided components or features.
 * Payouts list has no money-movement or bank-account-collection controls.
 */
export function buildWildHubConnectAccountSessionParams(connectedAccountId) {
  check(accountId(connectedAccountId),'connect_account_required');
  return {
    account:connectedAccountId,
    components:{
      payments:{enabled:true,features:Object.fromEntries(paymentFeatures.map(name=>[name,false]))},
      payouts_list:{enabled:true}
    }
  };
}

/** Validate the effective permissions as well as account/mode/expiry. Stripe
 * includes disabled components with default features; only enabled components
 * grant access. Return only the transient secret, never the raw provider object.
 */
export function readWildHubConnectClientSecret(session,connectedAccountId,now=Date.now()) {
  check(accountId(connectedAccountId),'connect_account_required');
  check(session?.object==='account_session','connect_invalid_session');
  check(session.livemode===false,'connect_test_mode_required');
  check(session.account===connectedAccountId,'connect_account_mismatch');
  check(typeof session.client_secret==='string'&&session.client_secret.length>0&&session.client_secret.trim()===session.client_secret,'connect_client_secret_missing');
  check(Number.isFinite(now)&&Number.isSafeInteger(session.expires_at)&&session.expires_at>Math.floor(now/1000),'connect_session_expired');
  const components=session.components,features=components?.payments?.features;
  check(record(components)&&components.payments?.enabled===true&&components.payouts_list?.enabled===true,'connect_components_mismatch');
  check(record(features)&&Object.keys(features).length===paymentFeatures.length&&paymentFeatures.every(name=>features[name]===false),'connect_features_mismatch');
  check(record(components.payouts_list.features)&&Object.keys(components.payouts_list.features).length===0,'connect_features_mismatch');
  for(const [name,component] of Object.entries(components)) {
    if(!['payments','payouts_list'].includes(name))check(component?.enabled===false,'connect_components_mismatch');
  }
  return Object.freeze({client_secret:session.client_secret});
}

function configure(input) {
  check(record(input)&&input.mode==='test','connect_test_mode_required');
  check(accountId(input.platformAccountId),'connect_platform_account_required');
  check(record(input.hubs)&&Object.keys(input.hubs).length>0,'connect_hub_allowlist_required');
  const hubs=new Map(),accounts=new Set();
  for(const [id,hub] of Object.entries(input.hubs)) {
    const hubId=uuid(id);
    check(!hubs.has(hubId)&&record(hub)&&hub.approved===true,'connect_hub_not_approved');
    const hostUserId=uuid(hub.hostUserId);
    check(accountId(hub.connectedAccountId)&&hub.connectedAccountId!==input.platformAccountId,'connect_account_required');
    check(!accounts.has(hub.connectedAccountId),'connect_account_mapping_ambiguous');
    accounts.add(hub.connectedAccountId);
    hubs.set(hubId,Object.freeze({hostUserId,connectedAccountId:hub.connectedAccountId}));
  }
  return {platformAccountId:input.platformAccountId,hubs};
}

/** Server-only sandbox seam, deliberately absent from runtime/HTTP routing.
 * `request` is the original authenticated server Request, never a JSON user ID.
 * resolveOwnerContext must independently authenticate that Request on each call
 * and read current user, hub, and owner membership from authoritative storage.
 * Account mapping is an explicitly approved server configuration, not request data.
 * Enabling this factory is useful for offline tests; real provider setup and any
 * exposed endpoint need separate authorization and security review.
 */
export function createWildHubConnectGateway({enabled=false,provider,resolveOwnerContext,config,now=()=>Date.now()}={}) {
  if(enabled!==true)return Object.freeze({createAccountSession:async()=>fail('creator_connect_disabled')});
  const settings=configure(config);
  check(typeof provider?.createAccountSession==='function'&&typeof provider?.diagnostics==='function','connect_sandbox_provider_required');
  check(typeof resolveOwnerContext==='function','connect_owner_resolver_required');
  check(typeof now==='function','connect_clock_required');
  const diagnostic=provider.diagnostics();
  check(diagnostic?.provider==='stripe'&&diagnostic.testMode===true&&diagnostic.platformAccountId===settings.platformAccountId,'connect_sandbox_provider_required');
  async function currentOwner(request,hubId,mapping) {
    let context;
    try{context=await resolveOwnerContext({request,hubId});}catch{fail('connect_owner_context_unavailable');}
    const user=context?.user,hub=context?.hub,membership=context?.membership;
    check(user?.authenticated===true&&user.id===mapping.hostUserId&&user.verified===true&&user.standing==='active'&&user.profileComplete===true,'connect_owner_required');
    check(hub?.id===hubId&&hub.ownerId===user.id&&hub.hostActive===true,'connect_owner_required');
    check(membership?.role==='owner'&&membership.status==='active','connect_owner_required');
  }
  return Object.freeze({
    async createAccountSession({request,input}={}) {
      check(request instanceof Request,'connect_request_required');
      check(record(input)&&Object.keys(input).length===1&&Object.hasOwn(input,'hubId'),'connect_unexpected_field');
      const hubId=uuid(input.hubId),mapping=settings.hubs.get(hubId);
      check(mapping,'connect_hub_not_approved');
      await currentOwner(request,hubId,mapping);
      let session;
      try{session=await provider.createAccountSession(mapping.connectedAccountId);}catch{fail('connect_provider_unavailable');}
      // Reauthenticate before releasing a credential after an asynchronous call.
      await currentOwner(request,hubId,mapping);
      return readWildHubConnectClientSecret(session,mapping.connectedAccountId,now());
    }
  });
}
