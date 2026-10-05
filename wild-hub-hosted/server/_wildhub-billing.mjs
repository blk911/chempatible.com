import {createHash,randomUUID} from 'node:crypto';

// Deliberately inert: no environment reads, SDK import, credentials, HTTP route or startup work.
const SANDBOX=Symbol('Wild Hub Stripe sandbox adapter');
const uuidPattern=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const digest=value=>createHash('sha256').update(value).digest('hex');
const entityId=value=>typeof value==='string'?value:value?.id;
const key=(hubId,userId)=>`${hubId}:${userId}`;
const assert=(condition,code,message=code)=>{if(!condition)throw Object.assign(new Error(message),{code});};
const uuid=value=>{assert(typeof value==='string'&&uuidPattern.test(value),'invalid_id');return value.toLowerCase();};
const stripeId=(value,prefix)=>typeof value==='string'&&(prefix==='cs'?/^cs_test_[A-Za-z0-9]+$/:new RegExp(`^${prefix}_[A-Za-z0-9]+$`)).test(value);
const metadataKeys=['checkoutId','hubId','userId','membershipRevision','kind','planKey','platformAccountId','destinationAccountId'];
const metadataFor=intent=>Object.fromEntries(metadataKeys.map(name=>[name,intent[name]]));
const seconds=value=>Number.isSafeInteger(value)&&value>0;
function assertMetadata(object,intent){for(const name of metadataKeys)assert(object?.metadata?.[name]===intent[name],'metadata_mismatch');}
function assertTest(object){assert(object?.livemode===false,'live_mode_forbidden');return object;}

/** The injected factory must construct the official SDK with the supplied key.
 * No client is constructed unless a test key and explicit webhook secret are supplied.
 * _wildhub-stripe.mjs supplies the pinned official SDK; this port also accepts test doubles.
 */
export function createStripeSandboxAdapter({makeClient,secretKey,webhookSecret,platformAccountId,apiVersion}={}) {
  assert(typeof secretKey==='string'&&/^(?:sk|rk)_test_[A-Za-z0-9]+$/.test(secretKey),'test_key_required');
  assert(typeof webhookSecret==='string'&&/^whsec_[A-Za-z0-9]+$/.test(webhookSecret),'webhook_secret_required');
  assert(typeof makeClient==='function','client_factory_required');
  assert(stripeId(platformAccountId,'acct'),'platform_account_required');
  const client=makeClient(secretKey);
  assert(client?.checkout?.sessions?.create&&client.checkout.sessions.retrieve&&client.checkout.sessions.expire&&client.checkout.sessions.listLineItems&&client?.subscriptions?.retrieve&&client.subscriptions.cancel&&client?.invoices?.retrieve&&client?.paymentIntents?.retrieve&&client?.accounts?.retrieve&&client?.webhooks?.constructEvent,'invalid_client');
  async function verifyPlatform(){assert((await client.accounts.retrieve()).id===platformAccountId,'platform_account_mismatch');}
  return Object.freeze({
    [SANDBOX]:true,platformAccountId,
    async createSession(params,idempotencyKey){await verifyPlatform();return assertTest(await client.checkout.sessions.create(params,{idempotencyKey}));},
    async retrieveSession(id){return assertTest(await client.checkout.sessions.retrieve(id));},
    async expireSession(id,idempotencyKey){await verifyPlatform();return assertTest(await client.checkout.sessions.expire(id,{}, {idempotencyKey}));},
    async listSessionItems(id){return client.checkout.sessions.listLineItems(id,{limit:2});},
    async retrieveSubscription(id){return assertTest(await client.subscriptions.retrieve(id));},
    async cancelSubscription(id){await verifyPlatform();return assertTest(await client.subscriptions.cancel(id,{invoice_now:false,prorate:false}));},
    async retrieveInvoice(id){return assertTest(await client.invoices.retrieve(id));},
    async retrievePaymentIntent(id){return assertTest(await client.paymentIntents.retrieve(id));},
    async verify(rawBody,signature){
      assert(typeof rawBody==='string'||rawBody instanceof Uint8Array,'raw_body_required');
      const bytes=Buffer.from(rawBody);
      assert(bytes.length>0&&bytes.length<=1_048_576,'webhook_body_size');
      assert(typeof signature==='string'&&signature.length>0&&signature.length<=4096,'signature_required');
      let event;try{event=await client.webhooks.constructEvent(bytes,signature,webhookSecret,300);}catch{assert(false,'invalid_signature');}
      assertTest(event);if(apiVersion)assert(event.api_version===apiVersion,'webhook_api_version_mismatch');await verifyPlatform();return event;
    }
  });
}

function configured(input) {
  const config=structuredClone(input);
  assert(config.mode==='test','test_mode_required');
  const url=new URL(config.origin);
  assert(url.origin===config.origin&&(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))),'invalid_origin');
  assert(config.connectModel==='destination','destination_model_required');
  assert(config.subscriptionFeePercent===10,'subscription_fee_must_be_ten_percent');
  assert(config.hubs&&Object.keys(config.hubs).length>0,'hub_config_required');
  for(const [hubId,hub] of Object.entries(config.hubs)) {
    uuid(hubId);uuid(hub.hostUserId);
    assert(stripeId(hub.destinationAccountId,'acct'),'destination_required');
    for(const kind of ['membership','support']) {
      const plans=hub[kind]||{};
      for(const [planKey,plan] of Object.entries(plans)) {
        assert(/^[a-z][a-z0-9_-]{0,49}$/.test(planKey),'invalid_plan_key');
        assert(plan.label===undefined||typeof plan.label==='string'&&plan.label.trim().length>0&&plan.label.length<=80,'invalid_plan_label');
        assert(stripeId(plan.priceId,'price')&&stripeId(plan.productId,'prod'),'invalid_price');
        assert(/^[a-z]{3}$/.test(plan.currency)&&Number.isSafeInteger(plan.unitAmount)&&plan.unitAmount>0,'invalid_amount');
        if(kind==='membership')assert(['day:1','month:1','month:3','year:1'].includes(`${plan.interval}:${plan.intervalCount}`),'invalid_interval');
        else assert(plan.interval===undefined&&plan.applicationFeeAmount===undefined,'support_fee_not_authorized');
      }
    }
  }
  return config;
}

/** Store contract: transaction(cb) is serializable and commits only on success.
 * tx.get/put/delete operate durable namespaced records. tx.getContext reads authoritative
 * admission/standing. tx.putPaidEntitlement atomically writes the separate SQL projection.
 * See docs/WILD-HUB-BILLING.md. Never pass request-body identity as userId.
 */
export function createWildHubBilling({enabled=false,stripe,store,config,now=()=>Date.now(),newId=randomUUID}={}) {
  const disabled=async()=>{assert(false,'billing_disabled');};
  if(enabled!==true)return Object.freeze({createCheckout:disabled,handleWebhook:disabled,getConfig:disabled,getStatus:disabled,reconcileMembershipEvents:disabled,runCancellationJobs:disabled,listCancellationJobs:disabled});
  assert(stripe?.[SANDBOX]===true,'sandbox_adapter_required');
  assert(typeof store?.transaction==='function','transactional_store_required');
  const settings=configured(config);
  assert(settings.platformAccountId===stripe.platformAccountId,'platform_account_mismatch');
  const stamp=()=>new Date(now()).toISOString();
  const admissionErrors=new Set(['account_unavailable','hub_unavailable','approved_members_only','admission_changed']);
  async function ensureCancellationJob(tx,intent,{eventId=null,subscriptionId=null}={}) {
    if(intent.kind!=='membership')return null;
    const previous=await tx.get('cancellation_jobs',intent.checkoutId);
    if(previous&&!(previous.status==='complete'&&subscriptionId&&previous.cancelledSubscriptionId!==subscriptionId)&&!(previous.status==='needs_review'&&intent.sessionId))return previous;
    const job={...(previous||{}),checkoutId:intent.checkoutId,hubId:intent.hubId,userId:intent.userId,membershipRevision:intent.membershipRevision,eventId:eventId||previous?.eventId||null,status:'pending',attempts:previous?.attempts||0,createdAt:previous?.createdAt||stamp(),retryAt:stamp(),lastError:null};
    await tx.put('cancellation_jobs',intent.checkoutId,job);return job;
  }
  function allowedPlan(hubId,kind,planKey) {
    const hub=settings.hubs[hubId],plan=hub?.[kind]?.[planKey];
    assert(hub&&Object.hasOwn(settings.hubs,hubId)&&['membership','support'].includes(kind)&&plan&&Object.hasOwn(hub[kind],planKey),'plan_not_allowed');
    return {hub,plan};
  }
  async function context(tx,hubId,userId,hub,revision) {
    const current=await tx.getContext(hubId,userId);
    assert(current?.user?.id===userId&&current.user.verified===true&&current.user.standing==='active'&&current.user.profileComplete===true,'account_unavailable');
    assert(current.hub?.id===hubId&&current.hub.ownerId===hub.hostUserId&&current.hub.hostActive===true,'hub_unavailable');
    const member=current.membership;
    assert(member?.status==='active'&&member.role==='member'&&uuidPattern.test(member.accessRevision),'approved_members_only');
    if(revision)assert(member.accessRevision===revision,'admission_changed');
    return current;
  }
  function checkoutParams(intent) {
    const {plan}=allowedPlan(intent.hubId,intent.kind,intent.planKey),metadata=metadataFor(intent);
    const params={mode:intent.kind==='membership'?'subscription':'payment',line_items:[{price:plan.priceId,quantity:1}],client_reference_id:intent.checkoutId,metadata,
      success_url:`${settings.origin}/?billing=success`,cancel_url:`${settings.origin}/?billing=cancel`,
      allowed_payment_method_types:['card'],allow_promotion_codes:false,automatic_tax:{enabled:false}};
    if(intent.kind==='membership')params.subscription_data={metadata,application_fee_percent:10,transfer_data:{destination:intent.destinationAccountId}};
    else params.payment_intent_data={metadata,transfer_data:{destination:intent.destinationAccountId}};
    return params;
  }
  function validateSession(session,intent,{complete=false}={}) {
    assert(stripeId(session.id,'cs'),'invalid_session');assertMetadata(session,intent);
    assert(session.client_reference_id===intent.checkoutId&&session.mode===(intent.kind==='membership'?'subscription':'payment'),'session_binding_mismatch');
    if(intent.sessionId)assert(session.id===intent.sessionId,'session_binding_mismatch');
    if(complete)assert(session.status==='complete','checkout_incomplete');
    if(session.url){const url=new URL(session.url);assert(url.protocol==='https:'&&url.hostname==='checkout.stripe.com'&&url.port===''&&url.username===''&&url.password==='','unsafe_checkout_url');}
  }
  async function validateSessionItems(session,intent) {
    const {plan}=allowedPlan(intent.hubId,intent.kind,intent.planKey);
    const items=await stripe.listSessionItems(session.id);
    assert(items?.has_more===false&&items.data?.length===1,'unexpected_line_items');
    const line=items.data[0];validatePrice(line.price,plan,intent.kind);
    assert(line.quantity===1&&line.amount_total===plan.unitAmount&&line.currency===plan.currency,'checkout_amount_mismatch');
    assert(session.currency===plan.currency&&session.amount_total===plan.unitAmount,'checkout_amount_mismatch');
    assert(!session.total_details||session.total_details.amount_discount===0&&session.total_details.amount_tax===0&&session.total_details.amount_shipping===0,'unexpected_adjustment');
  }
  function validatePrice(price,plan,kind) {
    assert(price?.livemode===false&&price.id===plan.priceId&&entityId(price.product)===plan.productId&&price.currency===plan.currency&&price.unit_amount===plan.unitAmount,'price_mismatch');
    if(kind==='membership')assert(price.recurring?.interval===plan.interval&&price.recurring.interval_count===plan.intervalCount&&(!price.recurring.usage_type||price.recurring.usage_type==='licensed'),'price_mismatch');
    else assert(!price.recurring,'support_must_be_one_time');
  }
  async function createCheckout({userId,input}={}) {
    userId=uuid(userId);
    assert(input&&typeof input==='object'&&!Array.isArray(input),'invalid_input');
    assert(Object.keys(input).every(name=>['hubId','kind','planKey','requestKey','expectedRevision'].includes(name)),'unexpected_field');
    const hubId=uuid(input.hubId),expectedRevision=uuid(input.expectedRevision),{hub,plan}=allowedPlan(hubId,input.kind,input.planKey);
    assert(typeof input.requestKey==='string'&&/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestKey),'invalid_request_key');
    const requestId=digest(`${userId}:${input.requestKey}`);
    const intent=await store.transaction(async tx=>{
      const current=await context(tx,hubId,userId,hub,expectedRevision);
      const priorId=await tx.get('requests',requestId);
      if(priorId){
        const prior=await tx.get('checkouts',priorId);
        assert(prior&&prior.userId===userId&&prior.hubId===hubId&&prior.kind===input.kind&&prior.planKey===input.planKey&&prior.membershipRevision===current.membership.accessRevision,'idempotency_conflict');
        assert(!['expired','cancelled'].includes(prior.state),'checkout_closed');return prior;
      }
      if(input.kind==='membership')assert(!await tx.get('membership_slots',key(hubId,userId)),'subscription_already_pending');
      const checkoutId=uuid(newId());
      const result={checkoutId,hubId,userId,kind:input.kind,planKey:input.planKey,membershipRevision:current.membership.accessRevision,platformAccountId:settings.platformAccountId,destinationAccountId:hub.destinationAccountId,priceId:plan.priceId,createdAt:stamp(),state:'creating'};
      assert(!await tx.get('checkouts',checkoutId),'duplicate_checkout_id');
      await tx.put('checkouts',checkoutId,result);await tx.put('requests',requestId,checkoutId);
      if(input.kind==='membership')await tx.put('membership_slots',key(hubId,userId),checkoutId);
      return result;
    });
    if(intent.sessionId)return {checkoutId:intent.checkoutId,sessionId:intent.sessionId,url:intent.url,kind:intent.kind,testMode:true};
    // A crash or timeout retries identical parameters and the same Stripe idempotency key.
    // Do not automatically retry beyond Stripe's retention window (see documentation).
    assert(now()-Date.parse(intent.createdAt)<23*60*60*1000,'checkout_reconciliation_required');
    const session=await stripe.createSession(checkoutParams(intent),`wild-hub-test:${intent.checkoutId}`);
    validateSession(session,intent);assert(session.status==='open'&&session.url,'checkout_not_open');
    const outcome=await store.transaction(async tx=>{
      const saved=await tx.get('checkouts',intent.checkoutId);
      assert(saved&&(!saved.sessionId||saved.sessionId===session.id),'session_binding_mismatch');
      const recorded={...saved,sessionId:session.id,url:session.url,state:saved.sessionId?saved.state:'open'};
      await tx.put('checkouts',intent.checkoutId,recorded);
      try{await context(tx,intent.hubId,intent.userId,hub,intent.membershipRevision);}catch(error){if(!admissionErrors.has(error.code))throw error;await ensureCancellationJob(tx,recorded);return {denied:error.code};}
      return {checkoutId:intent.checkoutId,sessionId:session.id,url:session.url,kind:intent.kind,testMode:true};
    });
    if(outcome.denied)assert(false,outcome.denied);return outcome;
  }
  async function releaseSlot(tx,intent) {
    if(await tx.get('membership_slots',key(intent.hubId,intent.userId))===intent.checkoutId)await tx.delete('membership_slots',key(intent.hubId,intent.userId));
  }
  async function sessionEvent(tx,event) {
    const object=event.data.object;
    assert(stripeId(object.id,'cs'),'invalid_session');
    const session=await stripe.retrieveSession(object.id);let intent=await tx.get('checkouts',session.metadata?.checkoutId),itemsValidated=false;
    assert(intent,'checkout_not_recorded');validateSession(session,intent);
    if(!intent.sessionId){
      assert(intent.state==='creating','checkout_not_recorded');await validateSessionItems(session,intent);itemsValidated=true;
      intent={...intent,sessionId:session.id,url:session.url||null};await tx.put('checkouts',intent.checkoutId,intent);
      if(await tx.get('cancellation_jobs',intent.checkoutId))await ensureCancellationJob(tx,intent,{subscriptionId:entityId(session.subscription)||null});
    }
    if(event.type==='checkout.session.expired') {
      assert(session.status==='expired'&&!session.subscription,'checkout_not_expired');
      await tx.put('checkouts',intent.checkoutId,{...intent,state:'expired'});
      if(intent.kind==='membership')await releaseSlot(tx,intent);
      return {status:'expired'};
    }
    validateSession(session,intent,{complete:true});if(!itemsValidated)await validateSessionItems(session,intent);
    assert(session.payment_status==='paid','payment_not_paid');
    if(intent.kind==='support') {
      assert(!session.subscription&&stripeId(entityId(session.payment_intent),'pi'),'support_must_be_one_time');
      const payment=await stripe.retrievePaymentIntent(entityId(session.payment_intent));
      assertMetadata(payment,intent);
      assert(payment.id===entityId(session.payment_intent)&&payment.status==='succeeded'&&payment.amount===session.amount_total&&payment.amount_received===session.amount_total&&payment.currency===session.currency,'support_payment_mismatch');
      assert(entityId(payment.transfer_data?.destination)===intent.destinationAccountId&&!payment.application_fee_amount&&(payment.transfer_data.amount==null||payment.transfer_data.amount===payment.amount),'payee_mismatch');
      await tx.put('support',intent.checkoutId,{checkoutId:intent.checkoutId,hubId:intent.hubId,userId:intent.userId,paymentIntentId:entityId(session.payment_intent),amount:session.amount_total,currency:session.currency,destinationAccountId:intent.destinationAccountId,recordedAt:stamp()});
    } else assert(stripeId(entityId(session.subscription),'sub')&&stripeId(entityId(session.customer),'cus'),'subscription_binding_missing');
    const completed={...intent,state:'complete',subscriptionId:entityId(session.subscription)||null,customerId:entityId(session.customer)||null};
    await tx.put('checkouts',intent.checkoutId,completed);
    if(intent.kind==='membership'){
      const {hub}=allowedPlan(intent.hubId,intent.kind,intent.planKey);
      try{await context(tx,intent.hubId,intent.userId,hub,intent.membershipRevision);}catch(error){if(!admissionErrors.has(error.code))throw error;await ensureCancellationJob(tx,completed,{subscriptionId:completed.subscriptionId});}
    }
    // A checkout receipt is never an entitlement. Only a reconciled paid invoice can grant it.
    return {status:intent.kind==='support'?'support_recorded':'subscription_recorded',granted:false};
  }
  function invoiceSubscription(invoice){return entityId(invoice.parent?.subscription_details?.subscription)||entityId(invoice.subscription);}
  function subscriptionPeriod(subscription,item) {
    return {start:item.current_period_start??subscription.current_period_start,end:item.current_period_end??subscription.current_period_end};
  }
  async function subscriptionEvent(tx,event) {
    const object=event.data.object;
    let subscriptionId;
    if(event.type==='invoice.paid') {
      assert(stripeId(object.id,'in'),'invalid_invoice');
      subscriptionId=invoiceSubscription(await stripe.retrieveInvoice(object.id));
    } else subscriptionId=object.id;
    assert(stripeId(subscriptionId,'sub'),'invalid_subscription');
    const previous=await tx.get('subscriptions',subscriptionId);
    if(previous&&event.created<previous.lastEventCreated)return {status:'stale',granted:false};
    // Retrieval and projection are serialized by the store, including equal-timestamp events.
    const subscription=await stripe.retrieveSubscription(subscriptionId);
    assert(subscription.id===subscriptionId,'subscription_binding_mismatch');
    const intent=await tx.get('checkouts',subscription.metadata?.checkoutId);
    assert(intent?.sessionId&&intent.kind==='membership','checkout_not_recorded');assertMetadata(subscription,intent);
    const {hub,plan}=allowedPlan(intent.hubId,intent.kind,intent.planKey);
    assert(subscription.application_fee_percent===10&&entityId(subscription.transfer_data?.destination)===intent.destinationAccountId&&(subscription.transfer_data.amount_percent==null||subscription.transfer_data.amount_percent===100),'payee_mismatch');
    assert(subscription.items?.has_more===false&&subscription.items.data?.length===1,'unexpected_line_items');
    const item=subscription.items.data[0];validatePrice(item.price,plan,'membership');assert(item.quantity===1,'quantity_mismatch');
    const session=await stripe.retrieveSession(intent.sessionId);validateSession(session,intent,{complete:true});await validateSessionItems(session,intent);
    assert(entityId(session.subscription)===subscriptionId&&entityId(session.customer)===entityId(subscription.customer)&&stripeId(entityId(subscription.customer),'cus'),'subscription_binding_mismatch');
    if(previous)assert(previous.checkoutId===intent.checkoutId,'subscription_binding_mismatch');
    assert(!intent.subscriptionId||intent.subscriptionId===subscriptionId,'subscription_binding_mismatch');
    if(await tx.get('membership_slots',key(intent.hubId,intent.userId))!==intent.checkoutId){await ensureCancellationJob(tx,intent,{subscriptionId});return {status:'superseded_subscription',granted:false};}
    let admitted=true;try{await context(tx,intent.hubId,intent.userId,hub,intent.membershipRevision);}catch(error){if(admissionErrors.has(error.code))admitted=false;else throw error;}
    if(!admitted)await ensureCancellationJob(tx,intent,{subscriptionId});
    let paidUntil=null,invoiceId=null;
    if(subscription.status==='active'&&admitted) {
      invoiceId=entityId(subscription.latest_invoice);assert(stripeId(invoiceId,'in'),'paid_invoice_required');
      const invoice=await stripe.retrieveInvoice(invoiceId);
      assert(invoice.id===invoiceId&&invoiceSubscription(invoice)===subscriptionId&&entityId(invoice.customer)===entityId(subscription.customer),'invoice_binding_mismatch');
      assert(invoice.status==='paid'&&['subscription_create','subscription_cycle'].includes(invoice.billing_reason),'paid_invoice_required');
      assert(invoice.currency===plan.currency&&invoice.amount_paid===plan.unitAmount&&invoice.amount_due===plan.unitAmount&&invoice.total===plan.unitAmount,'invoice_amount_mismatch');
      assert(invoice.lines?.has_more===false&&invoice.lines.data?.length===1,'unexpected_line_items');
      const line=invoice.lines.data[0],linePrice=entityId(line.pricing?.price_details?.price)||entityId(line.price);
      assert(linePrice===plan.priceId&&line.quantity===1&&line.amount===plan.unitAmount&&line.currency===plan.currency&&!line.proration&&!line.parent?.subscription_item_details?.proration,'invoice_line_mismatch');
      const period=subscriptionPeriod(subscription,item);
      assert(seconds(period.start)&&seconds(period.end)&&period.end>period.start&&line.period?.start===period.start&&line.period?.end===period.end,'invoice_period_mismatch');
      const end=subscription.cancel_at?Math.min(period.end,subscription.cancel_at):period.end;
      assert(!subscription.cancel_at||seconds(subscription.cancel_at),'invalid_cancellation');
      if(period.start*1000<=now()&&end*1000>now())paidUntil=new Date(end*1000).toISOString();
    }
    const projection={hubId:intent.hubId,userId:intent.userId,membershipRevision:intent.membershipRevision,subscriptionId,destinationAccountId:intent.destinationAccountId,status:paidUntil?'active':'revoked',paidUntil,updatedAt:stamp()};
    await tx.putPaidEntitlement(projection);
    await tx.put('subscriptions',subscriptionId,{checkoutId:intent.checkoutId,lastEventCreated:Math.max(previous?.lastEventCreated||0,event.created),status:subscription.status,invoiceId,paidUntil});
    await tx.put('checkouts',intent.checkoutId,{...intent,state:['canceled','incomplete_expired'].includes(subscription.status)?'cancelled':'complete',subscriptionId,customerId:entityId(subscription.customer)});
    if(['canceled','incomplete_expired'].includes(subscription.status))await releaseSlot(tx,intent);
    return {status:paidUntil?'entitlement_recorded':'entitlement_revoked',granted:Boolean(paidUntil)};
  }
  async function handleWebhook({rawBody,signature}={}) {
    const event=await stripe.verify(rawBody,signature);
    assert(stripeId(event.id,'evt')&&seconds(event.created)&&event.created<=Math.floor(now()/1000)+300&&typeof event.type==='string','invalid_event');
    assert(!event.account&&!event.context,'connected_account_event_forbidden');
    const payloadHash=digest(Buffer.from(rawBody));
    return store.transaction(async tx=>{
      const previous=await tx.get('events',event.id);
      if(previous){assert(previous.payloadHash===payloadHash,'event_replay_mismatch');return {...previous.result,replayed:true};}
      let result={status:'ignored',granted:false};
      if(['checkout.session.completed','checkout.session.expired'].includes(event.type)){assertTest(event.data?.object);result=await sessionEvent(tx,event);}
      else if(['invoice.paid','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)){assertTest(event.data?.object);result=await subscriptionEvent(tx,event);}
      await tx.put('events',event.id,{payloadHash,type:event.type,created:event.created,result,processedAt:stamp()});
      return {...result,replayed:false};
    });
  }
  function batchSize(value){assert(Number.isInteger(value)&&value>=1&&value<=100,'invalid_batch_size');return value;}
  async function reconcileMembershipEvents({limit=25}={}) {
    limit=batchSize(limit);
    return store.transaction(async tx=>{
      const events=await tx.listMembershipEvents(limit);let jobs=0;
      for(const event of events){
        uuid(event.id);uuid(event.hubId);uuid(event.userId);uuid(event.membershipRevision);assert(['removed','left','blocked'].includes(event.kind),'invalid_membership_event');
        if(await tx.get('membership_event_receipts',event.id))continue;
        for(const intent of await tx.listMembershipCheckouts(event.hubId,event.userId,event.membershipRevision)){
          assert(intent.kind==='membership'&&intent.hubId===event.hubId&&intent.userId===event.userId&&intent.membershipRevision===event.membershipRevision,'invalid_membership_event');
          if(!await tx.get('cancellation_jobs',intent.checkoutId))jobs++;
          await ensureCancellationJob(tx,intent,{eventId:event.id,subscriptionId:intent.subscriptionId});
        }
        await tx.put('membership_event_receipts',event.id,{processedAt:stamp(),kind:event.kind});
      }
      return {events:events.length,jobs};
    });
  }
  async function cancelForJob(tx,job) {
    let intent=await tx.get('checkouts',job.checkoutId);
    assert(intent?.kind==='membership'&&intent.hubId===job.hubId&&intent.userId===job.userId&&intent.membershipRevision===job.membershipRevision,'cancellation_binding_mismatch');
    let session;
    if(intent.sessionId)session=await stripe.retrieveSession(intent.sessionId);
    else {
      // Recover the same provider request, never create a second checkout or guess its ID.
      assert(now()-Date.parse(intent.createdAt)<23*3600000,'checkout_reconciliation_required');
      session=await stripe.createSession(checkoutParams(intent),`wild-hub-test:${intent.checkoutId}`);
      validateSession(session,intent);intent={...intent,sessionId:session.id,url:session.url||null};
      await tx.put('checkouts',intent.checkoutId,intent);
    }
    validateSession(session,intent);
    if(session.status==='open'){
      session=await stripe.expireSession(session.id,`wild-hub-test-expire:${intent.checkoutId}`);
      validateSession(session,intent);assert(session.status==='expired','session_expiration_unconfirmed');
    }
    let cancelledSubscriptionId=null;
    if(session.status==='expired')assert(!session.subscription,'session_binding_mismatch');
    else {
      validateSession(session,intent,{complete:true});
      cancelledSubscriptionId=entityId(session.subscription);
      assert(stripeId(cancelledSubscriptionId,'sub')&&(!intent.subscriptionId||intent.subscriptionId===cancelledSubscriptionId),'subscription_binding_mismatch');
      const validate=sub=>{
        assert(sub.id===cancelledSubscriptionId&&entityId(sub.customer)===entityId(session.customer)&&stripeId(entityId(sub.customer),'cus'),'subscription_binding_mismatch');
        assertMetadata(sub,intent);
        assert(entityId(sub.transfer_data?.destination)===intent.destinationAccountId,'payee_mismatch');
      };
      let sub=await stripe.retrieveSubscription(cancelledSubscriptionId);validate(sub);
      // A superseded job may cancel its own old subscription, but cannot alter a newer grant.
      if(await tx.get('membership_slots',key(intent.hubId,intent.userId))===intent.checkoutId){
        await tx.putPaidEntitlement({hubId:intent.hubId,userId:intent.userId,membershipRevision:intent.membershipRevision,subscriptionId:cancelledSubscriptionId,destinationAccountId:intent.destinationAccountId,status:'revoked',paidUntil:null,updatedAt:stamp()});
      }
      if(!['canceled','incomplete_expired'].includes(sub.status)){sub=await stripe.cancelSubscription(cancelledSubscriptionId);validate(sub);assert(sub.status==='canceled','subscription_cancellation_unconfirmed');}
    }
    await tx.put('checkouts',intent.checkoutId,{...intent,state:cancelledSubscriptionId?'cancelled':'expired',...(cancelledSubscriptionId?{subscriptionId:cancelledSubscriptionId}:{})});
    await releaseSlot(tx,intent);
    return {cancelledSubscriptionId,expiredSessionId:cancelledSubscriptionId?null:session.id};
  }
  async function runCancellationJobs({limit=25}={}) {
    limit=batchSize(limit);
    const candidates=await store.transaction(tx=>tx.listCancellationJobs({dueAt:stamp(),limit}));
    const results=[];
    for(const candidate of candidates){
      results.push(await store.transaction(async tx=>{
        const job=await tx.get('cancellation_jobs',candidate.checkoutId);
        if(!job||!['pending','retry'].includes(job.status)||Date.parse(job.retryAt)>now())return {checkoutId:candidate.checkoutId,status:'skipped'};
        const attempted={...job,attempts:job.attempts+1,lastAttemptAt:stamp()};
        let result;
        try{result={...attempted,...await cancelForJob(tx,job),status:'complete',completedAt:stamp(),retryAt:null,lastError:null};}
        catch(error){
          const needsReview=error.code==='checkout_reconciliation_required';
          result={...attempted,status:needsReview?'needs_review':'retry',lastError:needsReview?'checkout_reconciliation_required':'provider_or_validation_failure',retryAt:needsReview?null:new Date(now()+Math.min(3600000,30000*2**Math.min(job.attempts,7))).toISOString()};
        }
        await tx.put('cancellation_jobs',job.checkoutId,result);
        return {checkoutId:job.checkoutId,status:result.status,attempts:result.attempts,lastError:result.lastError,retryAt:result.retryAt};
      }));
    }
    return {jobs:results};
  }
  async function listCancellationJobs({limit=50}={}){
    const jobs=await store.transaction(tx=>tx.listCancellationJobs({limit:batchSize(limit)}));
    return jobs.map(job=>({checkoutId:job.checkoutId,hubId:job.hubId,userId:job.userId,membershipRevision:job.membershipRevision,status:job.status,attempts:job.attempts,nextRetryAt:job.retryAt,lastError:job.lastError,completedAt:job.completedAt||null,cancelledSubscriptionId:job.cancelledSubscriptionId||null,expiredSessionId:job.expiredSessionId||null}));
  }
  async function memberRead(tx,hubId,userId){
    const hub=settings.hubs[hubId];assert(hub&&Object.hasOwn(settings.hubs,hubId),'plan_not_allowed');
    const current=await tx.getContext(hubId,userId);
    assert(current?.user?.id===userId&&current.user.verified===true&&current.user.standing==='active','account_unavailable');
    assert(current.hub?.id===hubId&&current.hub.ownerId===hub.hostUserId&&current.hub.hostActive===true,'hub_unavailable');
    return {hub,current,canCheckout:current.user.profileComplete===true&&current.membership?.status==='active'&&current.membership?.role==='member'};
  }
  async function getConfig({userId,hubId}={}){
    userId=uuid(userId);hubId=uuid(hubId);
    return store.transaction(async tx=>{
      const {hub,canCheckout}=await memberRead(tx,hubId,userId);
      const options=kind=>Object.entries(hub[kind]||{}).map(([planKey,plan])=>({planKey,label:plan.label||planKey,unitAmount:plan.unitAmount,currency:plan.currency,...(kind==='membership'?{interval:plan.interval,intervalCount:plan.intervalCount}:{})}));
      return {enabled:true,testMode:true,hubId,canCheckout,membership:options('membership'),support:options('support')};
    });
  }
  async function getStatus({userId,hubId}={}){
    userId=uuid(userId);hubId=uuid(hubId);
    return store.transaction(async tx=>{
      const {current,canCheckout}=await memberRead(tx,hubId,userId),intent=await tx.getLatestMembershipCheckout(hubId,userId);
      if(!intent)return {enabled:true,testMode:true,hubId,canCheckout,membershipStatus:current.membership?.status||'none',checkout:null,cancellation:null};
      assert(intent.hubId===hubId&&intent.userId===userId&&intent.kind==='membership','status_binding_mismatch');
      const job=await tx.get('cancellation_jobs',intent.checkoutId),subscription=intent.subscriptionId?await tx.get('subscriptions',intent.subscriptionId):null;
      return {enabled:true,testMode:true,hubId,canCheckout,membershipStatus:current.membership?.status||'none',checkout:{checkoutId:intent.checkoutId,planKey:intent.planKey,status:intent.state,subscriptionStatus:intent.state==='cancelled'?'canceled':subscription?.status||null,paidUntil:current.membership?.status==='active'&&current.membership.accessRevision===intent.membershipRevision&&intent.state!=='cancelled'?subscription?.paidUntil||null:null},cancellation:job?{status:job.status,nextRetryAt:job.retryAt||null}:null};
    });
  }
  return Object.freeze({createCheckout,handleWebhook,getConfig,getStatus,reconcileMembershipEvents,runCancellationJobs,listCancellationJobs});
}

/** Explicit durable adapter. It does not connect, provision or apply migrations.
 * The database must already contain both approved schemas. One transaction-scoped
 * advisory lock serializes this starter ledger, including canonical provider reads.
 */
export function createWildHubBillingStore({db}={}) {
  assert(typeof db?.transaction==='function','transactional_database_required');
  const namespaces=new Set(['requests','checkouts','membership_slots','subscriptions','events','support','membership_event_receipts','cancellation_jobs']);
  const rows=async(tx,sql,params=[])=>{const result=await tx.query(sql,params);return Array.isArray(result)?result:result.rows;};
  return Object.freeze({transaction:callback=>db.transaction(async sqlTx=>{
    await sqlTx.query('SELECT pg_advisory_xact_lock(1464353353)');
    const check=(namespace,id)=>assert(namespaces.has(namespace)&&typeof id==='string'&&id.length>0&&id.length<=200,'invalid_ledger_key');
    return callback({
      async get(namespace,id){check(namespace,id);return (await rows(sqlTx,'SELECT value FROM wh_billing_records WHERE namespace=$1 AND record_key=$2',[namespace,id]))[0]?.value;},
      async put(namespace,id,value){check(namespace,id);await sqlTx.query('INSERT INTO wh_billing_records(namespace,record_key,value) VALUES($1,$2,$3::jsonb) ON CONFLICT(namespace,record_key) DO UPDATE SET value=EXCLUDED.value',[namespace,id,JSON.stringify(value)]);},
      async delete(namespace,id){check(namespace,id);await sqlTx.query('DELETE FROM wh_billing_records WHERE namespace=$1 AND record_key=$2',[namespace,id]);},
      async getContext(hubId,userId){
        // Match service actor -> hub locking. Never lock the host row after the hub:
        // host moderation holds its actor row before waiting for this same hub.
        // NO KEY UPDATE also permits the removal outbox's FK KEY SHARE check.
        await sqlTx.query('SELECT id FROM wh_users WHERE id=$1 FOR NO KEY UPDATE',[uuid(userId)]);
        await sqlTx.query('SELECT id FROM wh_hubs WHERE id=$1 FOR UPDATE',[uuid(hubId)]);
        const found=(await rows(sqlTx,`SELECT u.id,u.verified_at,u.standing,u.name,u.photo_id,u.acknowledged_at,h.id AS hub_id,h.owner_id,host.standing AS host_standing,host.verified_at AS host_verified_at,m.role,m.status,m.access_revision FROM wh_users u JOIN wh_hubs h ON h.id=$1 JOIN wh_users host ON host.id=h.owner_id LEFT JOIN wh_memberships m ON m.hub_id=h.id AND m.user_id=u.id WHERE u.id=$2`,[hubId,userId]))[0];
        if(!found)return null;
        return {user:{id:found.id,verified:Boolean(found.verified_at),standing:found.standing,profileComplete:Boolean(found.name&&found.photo_id&&found.acknowledged_at)},hub:{id:found.hub_id,ownerId:found.owner_id,hostActive:found.host_standing==='active'&&Boolean(found.host_verified_at)},membership:found.status?{role:found.role,status:found.status,accessRevision:found.access_revision}:null};
      },
      async putPaidEntitlement(value){
        await sqlTx.query(`INSERT INTO wh_billing_entitlements(hub_id,user_id,membership_revision,subscription_id,destination_account_id,status,paid_until,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(hub_id,user_id,membership_revision) DO UPDATE SET subscription_id=EXCLUDED.subscription_id,destination_account_id=EXCLUDED.destination_account_id,status=EXCLUDED.status,paid_until=EXCLUDED.paid_until,updated_at=EXCLUDED.updated_at`,[value.hubId,value.userId,value.membershipRevision,value.subscriptionId,value.destinationAccountId,value.status,value.paidUntil,value.updatedAt]);
      },
      async listMembershipEvents(limit){return rows(sqlTx,`SELECT e.id,e.hub_id AS "hubId",e.user_id AS "userId",e.membership_revision AS "membershipRevision",e.kind,e.created_at AS "createdAt" FROM wh_membership_events e WHERE NOT EXISTS(SELECT 1 FROM wh_billing_records b WHERE b.namespace='membership_event_receipts' AND b.record_key=e.id::text) ORDER BY e.created_at,e.id LIMIT $1`,[limit]);},
      async listMembershipCheckouts(hubId,userId,revision){return (await rows(sqlTx,`SELECT value FROM wh_billing_records WHERE namespace='checkouts' AND value->>'kind'='membership' AND value->>'hubId'=$1 AND value->>'userId'=$2 AND value->>'membershipRevision'=$3`,[hubId,userId,revision])).map(row=>row.value);},
      async getLatestMembershipCheckout(hubId,userId){return (await rows(sqlTx,`SELECT value FROM wh_billing_records WHERE namespace='checkouts' AND value->>'kind'='membership' AND value->>'hubId'=$1 AND value->>'userId'=$2 ORDER BY value->>'createdAt' DESC,record_key DESC LIMIT 1`,[hubId,userId]))[0]?.value;},
      async listCancellationJobs({dueAt,limit}){return (await rows(sqlTx,`SELECT value FROM wh_billing_records WHERE namespace='cancellation_jobs' AND ($1::text IS NULL OR (value->>'status' IN ('pending','retry') AND (value->>'retryAt')::timestamptz <= $1::timestamptz)) ORDER BY value->>'createdAt',record_key LIMIT $2`,[dueAt||null,limit])).map(row=>row.value);}
    });
  })});
}

/** Read-only seam for createWildHubService; must use the service's current transaction. */
export async function readWildHubPaidEntitlement({tx,hubId,userId,membershipRevision,now}) {
  assert(typeof tx?.query==='function'&&Number.isFinite(now),'invalid_entitlement_reader');
  const result=await tx.query(`SELECT paid_until AS "paidUntil" FROM wh_billing_entitlements WHERE hub_id=$1 AND user_id=$2 AND membership_revision=$3 AND status='active' AND paid_until>$4 LIMIT 1`,[uuid(hubId),uuid(userId),uuid(membershipRevision),new Date(now).toISOString()]);
  const found=(Array.isArray(result)?result:result.rows)?.[0];
  if(!found||!Number.isFinite(new Date(found.paidUntil).getTime())||new Date(found.paidUntil).getTime()<=now)return null;
  return {paidUntil:new Date(found.paidUntil).toISOString()};
}
