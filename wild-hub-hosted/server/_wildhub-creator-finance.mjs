// Read-only creator ledger projection. No credentials, SDK, provider requests,
// account sessions, payouts or payment mutations are constructed here.
const idPattern=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const rows=async(tx,sql,params)=>{const result=await tx.query(sql,params);return Array.isArray(result)?result:result.rows;};
const fail=(status,code)=>{throw Object.assign(new Error(code),{status,code});};
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const count=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0)fail(503,'finance_unavailable');return n;};
const label=value=>typeof value==='string'&&value.trim()?value.trim().slice(0,50):'Former member';
const status=(value,allowed)=>allowed.includes(value)?value:'unknown';
const PAGE_SIZE=20;

export function createWildHubCreatorFinanceReader({billingEnabled=false,billingConfig=null}={}) {
  const settings=billingConfig?structuredClone(billingConfig):null;
  return async({tx,hubId,userId}={})=>{
    if(typeof tx?.query!=='function'||!idPattern.test(hubId||'')||!idPattern.test(userId||''))fail(400,'invalid_id');
    // The service checks and locks the current actor/hub before invoking this
    // reader. Repeat ownership here so the seam cannot be used with another hub.
    const owned=(await rows(tx,"SELECT h.owner_id FROM public.wh_hubs h JOIN public.wh_users u ON u.id=h.owner_id WHERE h.id=$1 AND h.owner_id=$2 AND u.standing='active' AND u.verified_at IS NOT NULL",[hubId,userId]))[0];
    if(!owned)fail(403,'host_required');
    const parameters=[hubId,PAGE_SIZE+1];
    const counts=(await rows(tx,"SELECT (SELECT count(*) FROM public.wh_billing_records c JOIN public.wh_billing_records s ON s.namespace='subscriptions' AND s.record_key=c.value->>'subscriptionId' AND s.value->>'checkoutId'=c.record_key WHERE c.namespace='checkouts' AND c.value->>'hubId'=$1 AND c.value->>'kind'='membership') AS subscriptions, (SELECT count(*) FROM public.wh_billing_records g JOIN public.wh_billing_records c ON c.namespace='checkouts' AND c.record_key=g.record_key AND c.value->>'kind'='support' AND c.value->>'hubId'=g.value->>'hubId' AND c.value->>'userId'=g.value->>'userId' WHERE g.namespace='support' AND g.value->>'hubId'=$1 AND g.value->>'checkoutId'=g.record_key) AS gifts, (SELECT count(*) FROM public.wh_billing_records c WHERE c.namespace='checkouts' AND c.value->>'hubId'=$1 AND c.value->>'kind' IN ('membership','support')) AS checkouts",[hubId]))[0];
    if(!counts)fail(503,'finance_unavailable');
    // Select only display fields. Checkout URLs, customer/account IDs, payment
    // IDs, webhook bodies, cancellation errors and secrets never enter output.
    const subscriptions=await rows(tx,"SELECT c.record_key AS id, u.name AS member_name, s.value->>'status' AS status, s.value->>'paidUntil' AS paid_until, c.value->>'createdAt' AS created_at FROM public.wh_billing_records c JOIN public.wh_billing_records s ON s.namespace='subscriptions' AND s.record_key=c.value->>'subscriptionId' AND s.value->>'checkoutId'=c.record_key LEFT JOIN public.wh_users u ON u.id::text=c.value->>'userId' AND u.standing='active' WHERE c.namespace='checkouts' AND c.value->>'hubId'=$1 AND c.value->>'kind'='membership' ORDER BY c.value->>'createdAt' DESC NULLS LAST,c.record_key DESC LIMIT $2",parameters);
    const gifts=await rows(tx,"SELECT g.record_key AS id,u.name AS member_name,g.value->'amount' AS amount,g.value->>'currency' AS currency,g.value->>'recordedAt' AS recorded_at FROM public.wh_billing_records g JOIN public.wh_billing_records c ON c.namespace='checkouts' AND c.record_key=g.record_key AND c.value->>'kind'='support' AND c.value->>'hubId'=g.value->>'hubId' AND c.value->>'userId'=g.value->>'userId' LEFT JOIN public.wh_users u ON u.id::text=g.value->>'userId' AND u.standing='active' WHERE g.namespace='support' AND g.value->>'hubId'=$1 AND g.value->>'checkoutId'=g.record_key ORDER BY g.value->>'recordedAt' DESC NULLS LAST,g.record_key DESC LIMIT $2",parameters);
    const history=await rows(tx,"SELECT c.record_key AS id,u.name AS member_name,c.value->>'kind' AS kind,c.value->>'state' AS status,c.value->>'createdAt' AS created_at FROM public.wh_billing_records c LEFT JOIN public.wh_users u ON u.id::text=c.value->>'userId' AND u.standing='active' WHERE c.namespace='checkouts' AND c.value->>'hubId'=$1 AND c.value->>'kind' IN ('membership','support') ORDER BY c.value->>'createdAt' DESC NULLS LAST,c.record_key DESC LIMIT $2",parameters);
    const configured=billingEnabled===true&&settings?.mode==='test'&&settings.hubs?.[hubId]?.hostUserId===userId;
    const reason=configured?'Stripe sandbox payments are configured. Creator embedded components and payout reporting are not enabled.':'Stripe is not connected for this community. Payment setup and approved plans are required.';
    const unavailable='Stripe Connect account setup, permissions and a verified provider connection are required.';
    const summary={recordedSubscriptions:count(counts.subscriptions),recordedGifts:count(counts.gifts),recordedCheckouts:count(counts.checkouts)};
    const list=(values,total,map)=>({items:values.slice(0,PAGE_SIZE).map(map),total,hasMore:values.length>PAGE_SIZE,limit:PAGE_SIZE});
    return {
      available:true,source:'wild-hub-ledger',testMode:true,
      provider:{name:'stripe',status:configured?'sandbox_configured':'not_connected',billingEnabled:configured,componentsEnabled:false,reason},
      terms:{subscriptionPlatformFeePercent:10,giftPlatformFeePercent:null,giftFeeStatus:'not_agreed',pricesFinalized:false},
      summary,
      subscriptions:list(subscriptions,summary.recordedSubscriptions,r=>({id:r.id,memberName:label(r.member_name),status:status(r.status,['active','trialing','past_due','unpaid','canceled','incomplete','incomplete_expired','paused']),paidUntil:date(r.paid_until),createdAt:date(r.created_at)})),
      gifts:list(gifts,summary.recordedGifts,r=>({id:r.id,memberName:label(r.member_name),amount:Number.isSafeInteger(r.amount)&&r.amount>=0?r.amount:null,currency:/^[a-z]{3}$/.test(r.currency||'')?r.currency:null,recordedAt:date(r.recorded_at)})),
      history:list(history,summary.recordedCheckouts,r=>({id:r.id,memberName:label(r.member_name),kind:r.kind,status:status(r.status,['creating','open','complete','expired','cancelled']),createdAt:date(r.created_at)})),
      payouts:{available:false,reason:unavailable,balance:null,items:null},
      components:{
        payments:{type:'payments',available:false,reason:unavailable},
        payouts:{type:'payouts-list',available:false,reason:unavailable},
        account:{type:'account-management',available:false,reason:'Account management and onboarding require a chosen Connect account model and creator approval.'}
      }
    };
  };
}
