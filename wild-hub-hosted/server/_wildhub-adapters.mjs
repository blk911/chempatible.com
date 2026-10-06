// Explicit hosted adapters receive validated configuration. They never read
// ambient environment variables or create credentials.
import {createHash} from 'node:crypto';
const address=value=>typeof value==='string'&&value.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(value)&&!/[\r\n]/.test(value);

export const OPEN_BETA_MAIL_LIMITS=Object.freeze({globalMinute:20,globalDay:500,recipientDay:20});
export function createWildHubRegistrationPolicy({mode='allowlist',recipients=[]}={}) {
  if(!['allowlist','open-beta'].includes(mode)||!Array.isArray(recipients)||recipients.some(value=>!address(value))||mode==='allowlist'&&!recipients.length)throw Error('An explicit registration policy is required.');
  const allowed=new Set(recipients.map(value=>value.toLowerCase()));
  return Object.freeze({mode,allows:value=>address(value)&&(mode==='open-beta'||allowed.has(value.toLowerCase()))});
}

/** Reserve all send-attempt budgets before provider I/O. Failed/uncertain sends
 * remain charged. Fixed transaction lock order enforces shared limits across
 * instances; rejected reservations roll back without consuming slots. */
export function createWildHubMailBudget({db,now=()=>Date.now(),limits=OPEN_BETA_MAIL_LIMITS}={}) {
  if(typeof db?.transaction!=='function'||typeof now!=='function'||!limits||Object.keys(limits).some(key=>!Object.hasOwn(OPEN_BETA_MAIL_LIMITS,key)))throw Error('A durable email budget is required.');
  const ceilings=Object.freeze({...OPEN_BETA_MAIL_LIMITS,...limits});
  if(Object.values(ceilings).some(value=>!Number.isInteger(value)||value<1||value>1_000_000))throw Error('Invalid email budget.');
  return async message=>{
    if(!address(message?.to)||!['otp','invite','request','approval'].includes(message?.kind))throw Error('A valid email recipient and purpose are required.');
    const instant=now();if(!Number.isSafeInteger(instant)||instant<0)throw Error('Invalid email budget clock.');
    // Community activity cannot consume a person's sign-in allowance. Both
    // categories still share the fixed provider-wide minute and daily budget.
    const category=message.kind==='otp'?'otp':'community';
    const buckets=[['mail:global-day',86_400_000,ceilings.globalDay],['mail:global-minute',60_000,ceilings.globalMinute],[`mail:recipient-${category}-day:`+message.to.toLowerCase(),86_400_000,ceilings.recipientDay]];
    await db.transaction(async tx=>{
      for(const [key,period,maximum]of buckets){
        const bucket=Math.floor(instant/period),digest=createHash('sha256').update(key).digest('hex');
        const result=await tx.query('INSERT INTO wh_rate_limits(key,bucket,count) VALUES($1,$2,1) ON CONFLICT(key,bucket) DO UPDATE SET count=wh_rate_limits.count+1 WHERE wh_rate_limits.count<$3 RETURNING count',[digest,bucket,maximum]);
        if(!(Array.isArray(result)?result:result.rows)?.length)throw Object.assign(Error('Email sending is temporarily limited.'),{code:'mail_budget_exceeded',delivery:'not_accepted',retryAfter:Math.max(1,Math.ceil(((bucket+1)*period-instant)/1000))});
      }
    });
  };
}

export function createWildHubMailAdapter({sendgridKey,from,recipients,registrationMode='allowlist',beforeSend=null,fetchImpl}={}) {
  if(typeof sendgridKey!=='string'||sendgridKey.length<20||!address(from)||!Array.isArray(recipients)||typeof fetchImpl!=='function'||beforeSend!==null&&typeof beforeSend!=='function'||registrationMode==='open-beta'&&typeof beforeSend!=='function')throw Error('Explicit scoped mail credential, verified sender, recipient policy, budget and transport are required.');
  const policy=createWildHubRegistrationPolicy({mode:registrationMode,recipients});
  const failure=(message,delivery)=>Object.assign(new Error(message),{delivery});
  return Object.freeze({
    deliveryMode:'provider',supportsIdempotency:false,
    async send(message) {
      if(!policy.allows(message?.to)||!['otp','invite','request','approval'].includes(message.kind)||typeof message.subject!=='string'||message.subject.length>200||/[\r\n]/.test(message.subject)||typeof message.text!=='string'||message.text.length>20000)throw failure('Mail is outside the approved scope.','not_accepted');
      if(['request','approval'].includes(message.kind)&&(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(message.notificationId||'')||message.idempotencyKey!==`wh-notification-${message.notificationId}`))throw failure('Mail is outside the approved test scope.','not_accepted');
      if(beforeSend)try{await beforeSend({to:message.to.toLowerCase(),kind:message.kind});}catch(issue){const rejected=failure('Email sending is temporarily unavailable.','not_accepted');if(issue?.code==='mail_budget_exceeded'&&Number.isInteger(issue.retryAfter)&&issue.retryAfter>=1&&issue.retryAfter<=86400)Object.assign(rejected,{code:issue.code,retryAfter:issue.retryAfter});throw rejected;}
      let response;
      try {
        response=await fetchImpl('https://api.sendgrid.com/v3/mail/send',{
          method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
          headers:{authorization:`Bearer ${sendgridKey}`,'content-type':'application/json'},
          body:JSON.stringify({personalizations:[{to:[{email:message.to.toLowerCase()}],...(['request','approval'].includes(message.kind)?{custom_args:{wild_hub_notification:message.notificationId}}:{})}],from:{email:from,name:'BsideVibes'},subject:message.subject,content:[{type:'text/plain',value:message.text}],tracking_settings:{click_tracking:{enable:false,enable_text:false},open_tracking:{enable:false}}})
        });
      } catch {throw failure('The mail provider did not confirm acceptance.','uncertain');}
      // 202 confirms provider acceptance, not inbox delivery. Never surface
      // provider response bodies, credentials or recipients through errors.
      if(response.status!==202)throw failure('The mail provider did not confirm acceptance.',response.status>=400&&response.status<500&&response.status!==408?'not_accepted':'uncertain');
      return {accepted:true};
    }
  });
}

export function createWildHubPostgresAdapter({pool,isolationId,database,role}={}) {
  if(!pool?.connect||typeof isolationId!=='string'||!/^wild-hub-[a-z0-9-]{8,80}$/.test(isolationId)||typeof database!=='string'||!database||typeof role!=='string'||!role)throw Error('Explicit isolated pool, database, role and instance marker are required.');
  let verified=false;
  async function verify(client,{inventory=false}={}) {
    const identity=await client.query('SELECT current_database() AS database, current_user AS role');
    if(identity.rows?.[0]?.database!==database||identity.rows?.[0]?.role!==role)throw Error('Wild Hub database identity mismatch.');
    const marker=await client.query("SELECT value FROM public.wh_instance WHERE key='isolation_id'");
    if(marker.rows?.length!==1||marker.rows[0].value!==isolationId)throw Error('Wild Hub isolation marker mismatch.');
    if(inventory){
      const tables=await client.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_schema NOT LIKE 'pg\\_%' ESCAPE '\\' AND table_type='BASE TABLE'");
      if(tables.rows.some(row=>row.table_schema!=='public'||!row.table_name.startsWith('wh_')))throw Error('Wild Hub requires a dedicated database.');
    }
  }
  async function connectionTransaction(callback) {
    const client=await pool.connect();let started=false,stage='begin',discard;
    try {
      await client.query('BEGIN');started=true;stage='query';
      // Put pg_temp explicitly last: otherwise PostgreSQL implicitly searches
      // temporary relations first. No inherited user schema can shadow wh_*.
      await client.query('SET LOCAL search_path TO pg_catalog, public, pg_temp');
      const value=await callback({query:(sql,params)=>client.query(sql,params)});
      stage='commit';await client.query('COMMIT');started=false;return value;
    } catch(error) {
      if(stage==='begin'||stage==='commit')discard=error;
      if(started)try{await client.query('ROLLBACK')}catch(rollbackError){discard=rollbackError}
      throw error;
    } finally {client.release(discard)}
  }
  async function transaction(callback) {
    if(!verified)throw Error('Verify the isolated database before use.');
    return connectionTransaction(async tx=>{await verify(tx);return callback(tx)});
  }
  return Object.freeze({
    async verifyIsolation(){
      verified=false;await connectionTransaction(tx=>verify(tx,{inventory:true}));
      verified=true;return {verified:true,database,role,isolationId};
    },
    transaction,
    query:(sql,params)=>transaction(tx=>tx.query(sql,params))
  });
}
