// Explicit future-hosting adapters. Neither is constructed by the local runner
// or hosted entrypoint, and neither reads environment variables or creates keys.
const address=value=>typeof value==='string'&&/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(value)&&!/[\r\n]/.test(value);

export function createWildHubMailAdapter({sendgridKey,from,recipients,fetchImpl}={}) {
  if(typeof sendgridKey!=='string'||sendgridKey.length<20||!address(from)||!Array.isArray(recipients)||!recipients.length||recipients.some(value=>!address(value))||typeof fetchImpl!=='function')throw Error('Explicit scoped mail credential, verified sender, approved recipients and transport are required.');
  const allowed=new Set(recipients.map(value=>value.toLowerCase()));
  const failure=(message,delivery)=>Object.assign(new Error(message),{delivery});
  return Object.freeze({
    deliveryMode:'provider',supportsIdempotency:false,
    async send(message) {
      if(!address(message?.to)||!allowed.has(message.to.toLowerCase())||!['otp','invite','request','approval'].includes(message.kind)||typeof message.subject!=='string'||message.subject.length>200||/[\r\n]/.test(message.subject)||typeof message.text!=='string'||message.text.length>20000)throw failure('Mail is outside the approved test scope.','not_accepted');
      if(['request','approval'].includes(message.kind)&&(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(message.notificationId||'')||message.idempotencyKey!==`wh-notification-${message.notificationId}`))throw failure('Mail is outside the approved test scope.','not_accepted');
      let response;
      try {
        response=await fetchImpl('https://api.sendgrid.com/v3/mail/send',{
          method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
          headers:{authorization:`Bearer ${sendgridKey}`,'content-type':'application/json'},
          body:JSON.stringify({personalizations:[{to:[{email:message.to.toLowerCase()}],...(['request','approval'].includes(message.kind)?{custom_args:{wild_hub_notification:message.notificationId}}:{})}],from:{email:from,name:'Wild Hub'},subject:message.subject,content:[{type:'text/plain',value:message.text}],tracking_settings:{click_tracking:{enable:false,enable_text:false},open_tracking:{enable:false}}})
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
