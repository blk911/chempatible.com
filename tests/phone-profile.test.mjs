// Actual reward/profile SQL in disposable local PostgreSQL (PGlite). No external
// database, real member, email, SMS, credentials, or network requests are used.
process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
if(process.env.REWARD_TEST_MODE==='live')Object.assign(process.env,{CHEMPAT_RELEASE_MODE:'live',VERCEL:'1',VERCEL_PROJECT_ID:'prj_gtV01YIqkEfAfvdSbVopIfy2VpnJ',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'live'});
process.env.DATABASE_URL='postgres://synthetic-private-phone-only';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const root=new URL('../',import.meta.url),db=new PGlite();
const migration=fs.readFileSync(new URL('migrations/20261006_member_phone_profile.sql',root),'utf8');
for(let pass=0;pass<2;pass++){
 await db.exec(fs.readFileSync(new URL('schema.sql',root),'utf8'));
 await db.exec('ALTER TABLE members ADD COLUMN IF NOT EXISTS email_verified_at timestamptz');
 for(const name of fs.readdirSync(new URL('migrations/',root)).filter(name=>name.endsWith('.sql')).sort())await db.exec(fs.readFileSync(new URL('migrations/'+name,root),'utf8'));
}
const hash=value=>createHash('sha256').update(value).digest('hex');
const ids={owner:'11111111-1111-4111-8111-111111111111',visitor:'22222222-2222-4222-8222-222222222222',other:'33333333-3333-4333-8333-333333333333'};
const tokens={owner:'a'.repeat(64),visitor:'b'.repeat(64),other:'c'.repeat(64)};
const phones={owner:'+12025550111',visitor:'+442079460222',other:'+61491570333'};
const photo='data:image/jpeg;base64,/9gR/9k=',firstFive=[0,1,2,0,1],ten=[...firstFive,2,0,1,2,0];
let beforeTransaction=null,beforeRead=null,failAt=null,afterStatement=null,queryCount=0,transactionCount=0;
const template=(strings,values)=>({text:strings.reduce((out,part,index)=>out+(index?`$${index}`:'')+part,''),values});
const run=async(executor,statement)=>(await executor.query(statement.text,statement.values)).rows;
async function query(statement){queryCount++;if(beforeRead&&beforeRead.matches(statement.text)){const hook=beforeRead;beforeRead=null;await hook.run()}return run(db,statement)}
const sql=(strings,...values)=>query(template(strings,values));
sql.query=(text,values=[])=>query({text,values});
sql.transaction=async(build,options)=>{
 assert.equal(options?.isolationLevel,'ReadCommitted');transactionCount++;
 if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;await hook()}
 return db.transaction(async executor=>{
  const tx=(strings,...values)=>template(strings,values);tx.query=(text,values=[])=>({text,values});
  const statements=build(tx);assert.match(statements[0].text,/ORDER BY id FOR UPDATE/);
  if(statements.some(statement=>statement.text.includes('INSERT INTO member_phone_profile'))){
   const boundMember=statements[1].text.match(/m\.id='([a-f0-9-]+)'::uuid/)?.[1];
   assert.ok(boundMember);assert.deepEqual(statements[0].values,[boundMember],'profile locks exactly the initially authorized member');
   for(const index of [1,2]){
    assert.match(statements[index].text,/m\.session_hash=\$1 AND m\.id='[a-f0-9-]+'::uuid/,'post-lock authorization remains account-bound');
    assert.match(statements[index].text,/email_verified_at IS NOT NULL/);assert.match(statements[index].text,/blocked_at IS NULL/);assert.match(statements[index].text,/suspended_until<=now\(\)/);
   }
   assert.match(statements[2].text,/WHERE level>=2/);
  }
  const results=[];
  for(let index=0;index<statements.length;index++){
   if(failAt===index){failAt=null;throw Error('Synthetic transaction failure')}
   results.push(await run(executor,statements[index]));
   if(afterStatement?.index===index){const hook=afterStatement;afterStatement=null;await hook.run(executor)}
  }
  if(failAt==='commit'){failAt=null;throw Error('Synthetic commit failure')}
  return results;
 });
};
globalThis.__phoneProfileSql=sql;
async function loadApi(name){
 const source=fs.readFileSync(new URL('api/'+name+'.mjs',root),'utf8')
  .replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__phoneProfileSql;')
  .replace(/from '\.\/(.*?)\.mjs'/g,(_,dependency)=>`from '${new URL('api/'+dependency+'.mjs',root).href}'`);
 assert.ok(source.includes('const neon=()=>globalThis.__phoneProfileSql;'));
 return (await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
}
const rewards=await loadApi('rewards'),connection=await loadApi('connection'),directory=await loadApi('reward-directory'),requests=await loadApi('reward-requests'),wildcards=await loadApi('wildcards');
globalThis.fetch=async()=>{throw Error('Unexpected external request in private phone tests')};
async function call({as='owner',body,rawBody,query='',method,cookie,headers={},api=rewards}={}){
 const requestHeaders=new Headers({cookie:cookie??(as?'chempat_member='+tokens[as]:''),'content-type':'application/json',...(as?{'x-chempat-member-id':ids[as]}:{})});
 for(const [key,value] of Object.entries(headers)){if(value===null)requestHeaders.delete(key);else requestHeaders.set(key,value)}
 const hasBody=body!==undefined||rawBody!==undefined;
 const response=await api.fetch(new Request('https://isolated.example/api/test?'+query,{method:method||(hasBody?'POST':'GET'),headers:requestHeaders,...(hasBody?{body:rawBody??JSON.stringify(body)}:{}),...(rawBody instanceof ReadableStream?{duplex:'half'}:{})}));
 assert.equal(response.headers.get('cache-control'),'no-store');return {status:response.status,data:await response.json()};
}
const status=(result,expected=200,label='')=>assert.equal(result.status,expected,label+': '+JSON.stringify(result.data));
const confirm=(phone=phones.owner,phoneRevision=0,options={})=>call({...options,body:{action:'confirmProfilePhone',phone,phoneRevision}});
const read=(as='owner',id)=>call({as,query:id?'connection='+id:''});
const profiles=async()=>(await db.query('SELECT * FROM member_phone_profile ORDER BY member_id')).rows;
const setLevel=async(level,as='owner')=>{
 await db.query('UPDATE members SET answers=$1 WHERE id=$2',[JSON.stringify(level>=2?ten:level===1?firstFive:[]),ids[as]]);
 if(level>=3)await db.query('INSERT INTO member_reward_state(member_id,completed_level,answers) VALUES($1,$2,$3) ON CONFLICT(member_id) DO UPDATE SET completed_level=excluded.completed_level',[ids[as],level,'{"private":"unshared"}']);
};
let sequence=0;
async function invite({status='chat',channel='email',sender='owner',prospect='visitor'}={}){
 const id=hash('phone-profile-pair-'+(++sequence));
 await db.query('INSERT INTO invitations(token_hash,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,sender_member_id,channel,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval \'1 day\')',[id,sender+'@example.com',sender,photo,JSON.stringify(firstFive),prospect,prospect+'@example.com',ids[sender],channel]);
 await db.query('INSERT INTO connection_state(invitation_hash,prospect_member_id,prospect_name,prospect_photo,prospect_answers,prospect_phone,status,messages) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,ids[prospect],prospect,photo,JSON.stringify(firstFive),phones.visitor,status,'[{"by":"member","text":"Existing conversation"}]']);return id;
}
async function snapshot(){
 const result={},tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 for(const {tablename} of tables)result[tablename]=(await db.query(`SELECT * FROM ${tablename}`)).rows.map(row=>JSON.stringify(row)).sort();
 return result;
}
async function reset(){
 assert.equal(beforeTransaction,null);assert.equal(beforeRead,null);assert.equal(afterStatement,null);failAt=null;
 await db.exec('DELETE FROM invitations;DELETE FROM members;DELETE FROM activity');
 for(const [name,id] of Object.entries(ids))await db.query('INSERT INTO members(id,session_hash,name,contact,photo,answers,email_verified_at) VALUES($1,$2,$3,$4,$5,$6,now())',[id,hash(tokens[name]),name,name+'@example.com',photo,JSON.stringify(ten)]);
}
let passed=0,failures=[];
async function test(name,fn){try{await reset();await fn();passed++;console.log('ok - '+name)}catch(error){failures.push(name);console.error('FAIL - '+name+'\n'+error.stack);beforeTransaction=null;beforeRead=null;afterStatement=null;failAt=null}}

await test('additive migration is rerunnable and never backfills, confirms, or shares a legacy number',async()=>{
 await db.query('UPDATE members SET contact=$1 WHERE id=$2',[phones.owner,ids.owner]);const before=await snapshot();
 await db.exec(migration);await db.exec(migration);assert.deepEqual(await snapshot(),before);assert.deepEqual(await profiles(),[]);
 const result=await read();status(result);assert.deepEqual(result.data.phoneProfile,{phone:phones.owner,confirmedAt:null,revision:0});assert.deepEqual(await snapshot(),before);
 status(await confirm());const saved=await snapshot();await db.exec(migration);assert.deepEqual(await snapshot(),saved);
});
await test('database constraints require a normalized number, confirmed timestamp, revision and member owner',async()=>{
 const constraints=(await db.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='member_phone_profile'::regclass")).rows.map(row=>row.definition).join('\n');
 assert.match(constraints,/PRIMARY KEY \(member_id\)/);assert.match(constraints,/FOREIGN KEY \(member_id\) REFERENCES members\(id\) ON DELETE CASCADE/);assert.match(constraints,/CHECK.*phone/);assert.match(constraints,/CHECK.*revision/);
 for(const phone of ['2025550111','+02025550111','+12','+1234567890123456','+1 202 555 0111',null])await assert.rejects(()=>db.query('INSERT INTO member_phone_profile(member_id,phone) VALUES($1,$2)',[ids.owner,phone]));
 for(const revision of [-1,0,2147483648,null])await assert.rejects(()=>db.query('INSERT INTO member_phone_profile(member_id,phone,revision) VALUES($1,$2,$3)',[ids.owner,phones.owner,revision]));
 await assert.rejects(()=>db.query('INSERT INTO member_phone_profile(member_id,phone,confirmed_at) VALUES($1,$2,NULL)',[ids.owner,phones.owner]));
 await assert.rejects(()=>db.query('INSERT INTO member_phone_profile(member_id,phone) VALUES($1,$2)',['ffffffff-ffff-4fff-8fff-ffffffffffff',phones.owner]));
 status(await confirm());await db.query('DELETE FROM members WHERE id=$1',[ids.owner]);assert.deepEqual(await profiles(),[]);
});
await test('missing profile stays empty even when counterpart, legacy connection and offered phones exist',async()=>{
 const id=await invite();await db.query('UPDATE members SET contact=$1 WHERE id=$2',[phones.visitor,ids.visitor]);
 await db.query('INSERT INTO reward_phone_offers(invitation_hash,member_id,phone) VALUES($1,$2,$3)',[id,ids.owner,phones.other]);
 for(const result of [await read(),await read('owner',id)]){status(result);assert.deepEqual(result.data.phoneProfile,{phone:null,confirmedAt:null,revision:0})}
 assert.deepEqual(await profiles(),[]);
});
await test('only a valid own legacy phone prefills; email, malformed and another account never do',async()=>{
 for(const value of ['owner@example.com','2025550111','+02025550111','+12','not a phone','+1 202 555 0111 ext 9','+1234567\n']){
  await db.query('UPDATE members SET contact=$1 WHERE id=$2',[value,ids.owner]);assert.equal((await read()).data.phoneProfile.phone,null,value);
 }
 await db.query('UPDATE members SET contact=$1 WHERE id=$2',[' +1 (202) 555-0111 ',ids.owner]);
 assert.deepEqual((await read()).data.phoneProfile,{phone:phones.owner,confirmedAt:null,revision:0});assert.equal((await read('visitor')).data.phoneProfile.phone,null);
 assert.deepEqual(await profiles(),[]);
});
await test('confirm normalizes and persists private profile with server timestamp and optimistic revision',async()=>{
 const before=await read();const result=await confirm(' +1 (202) 555-0111 ');status(result);
 assert.equal(result.data.phoneProfile.phone,phones.owner);assert.equal(result.data.phoneProfile.revision,1);assert.ok(Number.isFinite(Date.parse(result.data.phoneProfile.confirmedAt)));
 const {phoneProfile,...other}=result.data,{phoneProfile:old,...rest}=before.data;assert.deepEqual(other,rest,'no progress, balance, round or connection projection changes');
 assert.deepEqual((await read()).data.phoneProfile,phoneProfile);
 const row=(await profiles())[0];assert.equal(row.member_id,ids.owner);assert.equal(row.phone,phones.owner);assert.equal(row.confirmed_at.toISOString(),phoneProfile.confirmedAt);
});
await test('saved profile supersedes legacy contact and can be edited or explicitly reconfirmed',async()=>{
 await db.query('UPDATE members SET contact=$1 WHERE id=$2',[phones.visitor,ids.owner]);
 status(await confirm());assert.equal((await read()).data.phoneProfile.phone,phones.owner);
 let result=await confirm('+44 20.7946.0222',1);status(result);assert.equal(result.data.phoneProfile.phone,phones.visitor);assert.equal(result.data.phoneProfile.revision,2);
 result=await confirm(phones.visitor,2);status(result);assert.equal(result.data.phoneProfile.revision,3);assert.ok(result.data.phoneProfile.confirmedAt);
 assert.equal((await db.query('SELECT contact FROM members WHERE id=$1',[ids.owner])).rows[0].contact,phones.visitor,'login contact is not rewritten');
});
await test('validation rejects malformed numbers, coercions, extra sharing fields and invalid revisions without writes',async()=>{
 const before=await snapshot();
 for(const value of [undefined,null,'',123,[],{},true,'2025550111','0012025550111','+02025550111','+12','+1234567890123456','+1/202/5550111','+1 202 555 0111 ext9','+1\t2025550111','+12025550111\n','＋12025550111','+١٢٠٢٥٥٥٠١١١',' '.repeat(65)+phones.owner])status(await call({body:{action:'confirmProfilePhone',phone:value,phoneRevision:0}}),400);
 for(const phoneRevision of [undefined,null,'0',-1,0.5,{},[],true,2147483647,Number.MAX_SAFE_INTEGER])status(await call({body:{action:'confirmProfilePhone',phone:phones.owner,phoneRevision}}),400);
 for(const extra of [{memberId:ids.visitor},{connectionId:'a'.repeat(64)},{confirmedAt:'2020-01-01'},{shared:true},{verified:true},{phone:{number:phones.owner}}])status(await call({body:{action:'confirmProfilePhone',phone:phones.owner,phoneRevision:0,...extra}}),400);
 assert.deepEqual(await snapshot(),before);
 for(const value of ['+1234567','+123456789012345']){status(await confirm(value,(await read()).data.phoneProfile.revision));assert.equal((await read()).data.phoneProfile.phone,value)}
});
await test('Level 0 and 1 cannot save; earned Level 2 through 5 work independently of connections',async()=>{
 for(const level of [0,1]){await setLevel(level);const before=await snapshot();status(await confirm(),403);assert.deepEqual(await snapshot(),before)}
 for(const level of [2,3,4,5]){await setLevel(level);const result=await confirm(phones.owner,(await read()).data.phoneProfile.revision);status(result);assert.equal(result.data.level,level);assert.deepEqual(result.data.connections,[])}
});
await test('first completion of Step 2 returns empty or unconfirmed prefill but never creates a phone profile',async()=>{
 for(const contact of ['owner@example.com',phones.owner]){
  await reset();await setLevel(1);await db.query('UPDATE members SET contact=$1 WHERE id=$2',[contact,ids.owner]);
  const result=await call({body:{action:'complete',level:2,answers:Object.fromEntries(Array.from({length:5},(_,i)=>['base-'+(i+6),i%3])),draftRevision:0}});status(result);assert.equal(result.data.level,2);assert.equal(result.data.phoneProfile.phone,contact===phones.owner?phones.owner:null);assert.equal(result.data.phoneProfile.confirmedAt,null);assert.deepEqual(await profiles(),[]);
 }
});
await test('private save never changes rewards, directory, answers, chat, wildcards or pair phone offers',async()=>{
 const id=await invite();await setLevel(5);await setLevel(5,'visitor');
 await db.query('INSERT INTO reward_directory_profile(member_id,listed,photo,display_name) VALUES($1,true,$2,$3)',[ids.owner,photo,'owner']);
 const offer=await call({body:{action:'offerPhone',connectionId:id,phone:phones.other}});status(offer);
 const before=await snapshot();status(await confirm());const after=await snapshot();delete before.member_phone_profile;delete after.member_phone_profile;assert.deepEqual(after,before);
 const pair=(await read('owner',id)).data.connection.phone;assert.equal(pair.ownPhone,phones.other);assert.equal(pair.shared,false);
});
await test('phone profile never leaks to connection inbox, counterpart reward state, directory, requests or wildcards',async()=>{
 const id=await invite();await setLevel(5);await setLevel(5,'visitor');status(await confirm());
 await db.query('INSERT INTO reward_directory_profile(member_id,listed,photo,display_name) VALUES($1,true,$2,$3)',[ids.owner,photo,'owner']);
 const responses=[await read('visitor'),await read('visitor',id),await read('other'),await call({api:connection,as:'visitor',query:'inbox=1'}),await call({api:directory,as:'visitor',query:'directory=1'}),await call({api:directory,as:'visitor',query:'profile=1'}),await call({api:requests,as:'visitor'}),await call({api:wildcards,as:'visitor',query:'connection='+id})];
 for(const result of responses){status(result);assert.equal(JSON.stringify(result.data).includes(phones.owner),false,JSON.stringify(result.data))}
 const ownPair=await read('owner',id);status(ownPair);assert.equal(JSON.stringify(ownPair.data.connection).includes(phones.owner),false);assert.equal(ownPair.data.phoneProfile.phone,phones.owner);
});
await test('different accounts maintain independent private profiles and revisions',async()=>{
 status(await confirm());status(await confirm(phones.visitor,0,{as:'visitor'}));
 const owner=(await read()).data.phoneProfile,visitor=(await read('visitor')).data.phoneProfile;
 assert.equal(owner.phone,phones.owner);assert.equal(visitor.phone,phones.visitor);assert.equal(owner.revision,1);assert.equal(visitor.revision,1);
 status(await confirm(phones.other,1,{as:'visitor'}));assert.deepEqual((await read()).data.phoneProfile,owner);assert.equal((await read('visitor')).data.phoneProfile.revision,2);
 assert.equal((await profiles()).length,2);assert.equal((await read('other')).data.phoneProfile.phone,null);
});
await test('eligible pair readiness shares confirmation booleans without profile numbers, timestamps or automatic offers',async()=>{
 const id=await invite();let own=(await read('owner',id)).data.connection.phone;
 assert.equal(own.ownProfileConfirmed,false);assert.equal(own.otherProfileConfirmed,false);
 status(await confirm());
 own=(await read('owner',id)).data.connection.phone;let other=(await read('visitor',id)).data.connection.phone;
 assert.equal(own.ownProfileConfirmed,true);assert.equal(own.otherProfileConfirmed,false);assert.equal(other.ownProfileConfirmed,false);assert.equal(other.otherProfileConfirmed,true);
 status(await confirm(phones.visitor,0,{as:'visitor'}));
 for(const as of ['owner','visitor']){
  const result=await read(as,id);status(result);const phone=result.data.connection.phone;
  assert.equal(phone.ownProfileConfirmed,true);assert.equal(phone.otherProfileConfirmed,true);assert.equal(phone.ownOffered,false);assert.equal(phone.otherOffered,false);assert.equal(phone.shared,false);
  assert.equal('ownPhone' in phone,false);assert.equal('otherPhone' in phone,false);assert.equal('confirmedAt' in phone,false);assert.equal('otherConfirmedAt' in phone,false);
  assert.equal(JSON.stringify(phone).includes(phones.owner),false);assert.equal(JSON.stringify(phone).includes(phones.visitor),false);
 }
 assert.equal((await db.query('SELECT count(*)::int AS total FROM reward_phone_offers')).rows[0].total,0);
 const stranger=await read('other',id);status(stranger,404);assert.equal('connection' in stranger.data,false);
 for(const item of (await read('other')).data.connections)assert.equal('phone' in item,false);
});
await test('legacy contact and existing explicit offers are not mislabeled as new profile confirmation or blocked retroactively',async()=>{
 const id=await invite();await db.query('UPDATE members SET contact=$1 WHERE id=$2',[phones.owner,ids.owner]);
 for(const as of ['owner','visitor'])status(await call({as,body:{action:'offerPhone',connectionId:id,phone:phones[as]}}));
 const phone=(await read('owner',id)).data.connection.phone;
 assert.equal(phone.ownProfileConfirmed,false);assert.equal(phone.otherProfileConfirmed,false);assert.equal(phone.ownOffered,true);assert.equal(phone.otherOffered,true);assert.equal(phone.shared,true);
 assert.equal(phone.ownPhone,phones.owner);assert.equal(phone.otherPhone,phones.visitor);assert.deepEqual(await profiles(),[]);
 status(await confirm(phones.other));const saved=(await read('owner',id)).data.connection.phone;
 assert.equal(saved.ownProfileConfirmed,true);assert.equal(saved.ownPhone,phones.owner,'confirming an edited profile cannot rewrite an existing explicit offer');assert.equal(saved.shared,true);
});
await test('pair readiness is hidden for Friend, lower-level, lifecycle-restricted and changed-account projections',async()=>{
 const gates=[
  ['friend',id=>db.query("UPDATE invitations SET channel='friend' WHERE token_hash=$1",[id]),200],
  ['lower level',()=>setLevel(1,'visitor'),200],
  ['ended',id=>db.query('UPDATE connection_state SET ended_at=now() WHERE invitation_hash=$1',[id]),404],
  ['frozen',id=>db.query("INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES($1,$2,'freeze',now())",[ids.visitor,id]),404],
  ['trashed',id=>db.query("INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES($1,$2,'unfreeze',now())",[ids.visitor,id]),404],
  ['blocked pair',()=>db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.visitor,ids.owner]),404],
  ['counterpart suspended',()=>db.query("UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=$1",[ids.visitor]),404],
  ['counterpart unverified',()=>db.query('UPDATE members SET email_verified_at=NULL WHERE id=$1',[ids.visitor]),404],
  ['actor reassigned',async()=>{await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('readiness-unused'),ids.owner]);await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash(tokens.owner),ids.other])},404]
 ];
 for(const [label,restrict,expected] of gates){
  await reset();const id=await invite();status(await confirm());status(await confirm(phones.visitor,0,{as:'visitor'}));
  beforeRead={matches:text=>text.startsWith('WITH eligible AS'),run:()=>restrict(id)};
  const result=await read('owner',id);status(result,expected,label);
  if(expected===200){assert.equal(result.data.connection.phone.ownProfileConfirmed,false);assert.equal(result.data.connection.phone.otherProfileConfirmed,false)}else assert.equal('connection' in result.data,false);
  assert.equal(JSON.stringify(result.data).includes(phones.visitor),false,label+' does not leak a profile phone');
 }
});
await test('friend-only, pre-chat, frozen, trashed, blocked and ended pairs do not prevent private profile save or reopen pair gates',async()=>{
 const changes=[
  ['friend',async id=>db.query("UPDATE invitations SET channel='friend' WHERE token_hash=$1",[id])],
  ['firstResults',async id=>db.query("UPDATE connection_state SET status='firstResults' WHERE invitation_hash=$1",[id])],
  ['secondFive',async id=>db.query("UPDATE connection_state SET status='secondFive' WHERE invitation_hash=$1",[id])],
  ['nextResults',async id=>db.query("UPDATE connection_state SET status='nextResults' WHERE invitation_hash=$1",[id])],
  ['chatRequested',async id=>db.query("UPDATE connection_state SET status='chatRequested' WHERE invitation_hash=$1",[id])],
  ['ended',async id=>db.query("UPDATE connection_state SET ended_at=now() WHERE invitation_hash=$1",[id])],
  ['frozen',async id=>db.query("INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES($1,$2,'freeze',now())",[ids.visitor,id])],
  ['trashed',async id=>db.query("INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES($1,$2,'unfreeze',now())",[ids.visitor,id])],
  ['blocked pair',async()=>db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.visitor,ids.owner])],
  ['blocked counterpart',async()=>db.query('UPDATE members SET blocked_at=now() WHERE id=$1',[ids.visitor])]
 ];
 for(const [label,change] of changes){
  await reset();const id=await invite();await change(id);const before=await snapshot();status(await confirm(),200,label);
  const after=await snapshot();delete before.member_phone_profile;delete after.member_phone_profile;assert.deepEqual(after,before,label);
  const pair=await read('owner',id);if(label==='friend'){status(pair);assert.equal(pair.data.connection.phone.eligible,false)}else status(pair,404,label);
  status(await call({body:{action:'offerPhone',connectionId:id,phone:phones.owner}}),409,label);
 }
});
await test('missing, stale and cross-account authorization fail before profile reads or writes',async()=>{
 const before=await snapshot(),transactions=transactionCount;
 for(const cookie of ['', 'chempat_session='+tokens.owner,'chempat_member=bad','chempat_member='+tokens.owner.toUpperCase(),'chempat_member='+tokens.owner+'bad'])status(await confirm(phones.owner,0,{cookie}),401);
 status(await confirm(phones.owner,0,{cookie:'chempat_member='+'d'.repeat(64)}),403);
 for(const expected of [null,'',ids.visitor,'malformed'])status(await confirm(phones.owner,0,{headers:{'x-chempat-member-id':expected}}),403);
 status(await confirm(phones.owner,0,{cookie:'chempat_member='+tokens.visitor}),403);status(await call({cookie:'chempat_member='+tokens.visitor}),403);
 assert.equal(transactionCount,transactions);assert.deepEqual(await snapshot(),before);
});
await test('unverified, blocked, suspended and rotated accounts cannot read or confirm a stored phone',async()=>{
 for(const change of ['email_verified_at=NULL','blocked_at=now()',"suspended_until=now()+interval '1 day'",`session_hash='${hash('rotated')}'`]){
  await reset();status(await confirm());await db.query('UPDATE members SET '+change+' WHERE id=$1',[ids.owner]);const before=await snapshot();
  for(const result of [await read(),await confirm(phones.visitor,1)]){status(result,403);assert.equal(JSON.stringify(result.data).includes(phones.owner),false)}assert.deepEqual(await snapshot(),before);
 }
 await reset();await db.query("UPDATE members SET suspended_until=now()-interval '1 day' WHERE id=$1",[ids.owner]);status(await confirm());
});
await test('origin, JSON and bounded-body guards apply before any private phone write',async()=>{
 const body={action:'confirmProfilePhone',phone:phones.owner,phoneRevision:0},before=await snapshot();
 for(const origin of ['https://evil.example','null','https://isolated.example.evil.example'])status(await call({body,headers:{origin}}),403);
 for(const contentType of ['text/plain','application/x-www-form-urlencoded',''])status(await call({body,headers:{'content-type':contentType}}),415);
 for(const rawBody of ['{','null','[]','"value"'])status(await call({rawBody}),400);
 for(const length of ['-1','bad','1.5','16385'])status(await call({body,headers:{'content-length':length}}),413);
 status(await call({rawBody:JSON.stringify({...body,padding:'🐾'.repeat(5000)}),headers:{'content-length':'1'}}),413);
 let cancelled=false;const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(4096).fill(120))},cancel(){cancelled=true}});status(await call({rawBody:stream}),413);assert.equal(cancelled,true);
 assert.deepEqual(await snapshot(),before);status(await call({body,headers:{origin:'https://isolated.example','content-type':'application/json; charset=utf-8'}}));
});
await test('stale and future revisions conflict without overwriting or reconfirming the current phone',async()=>{
 status(await confirm(phones.owner,1),409,'a future revision cannot create an absent profile');status(await confirm());const before=await snapshot();
 for(const [phone,revision] of [[phones.owner,0],[phones.visitor,0],[phones.visitor,2]]){const result=await confirm(phone,revision);status(result,409);assert.equal(result.data.phoneConflict,true);assert.equal(JSON.stringify(result.data).includes(phones.owner),false)}
 assert.deepEqual(await snapshot(),before);status(await confirm(phones.visitor,(await read()).data.phoneProfile.revision));assert.equal((await read()).data.phoneProfile.phone,phones.visitor);
});
await test('parallel same-revision saves produce one winner and one conflict',async()=>{
 const results=await Promise.all([confirm(phones.owner),confirm(phones.visitor)]);assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
 const winner=results.find(result=>result.status===200);assert.equal((await profiles()).length,1);assert.deepEqual((await read()).data.phoneProfile,winner.data.phoneProfile);assert.equal(winner.data.phoneProfile.revision,1);
});
await test('save during a lock wait wins; the older in-flight consent cannot overwrite it',async()=>{
 let protectedState;beforeTransaction=async()=>{status(await confirm(phones.visitor));protectedState=await snapshot()};
 const result=await confirm();status(result,409);assert.equal(result.data.phoneConflict,true);assert.deepEqual(await snapshot(),protectedState);
});
await test('post-lock checks reject lost session, standing, account reassignment and earned level',async()=>{
 const changes=[
  ['unverified',()=>db.query('UPDATE members SET email_verified_at=NULL WHERE id=$1',[ids.owner])],
  ['blocked',()=>db.query('UPDATE members SET blocked_at=now() WHERE id=$1',[ids.owner])],
  ['suspended',()=>db.query("UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=$1",[ids.owner])],
  ['rotated',()=>db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('wait-rotation'),ids.owner])],
  ['reassigned',async()=>{await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('wait-unused'),ids.owner]);await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash(tokens.owner),ids.visitor])}],
  ['level revoked',()=>setLevel(1)]
 ];
 for(const [label,change] of changes){
  await reset();let protectedState;beforeTransaction=async()=>{await change();protectedState=await snapshot()};const result=await confirm();status(result,403,label);assert.deepEqual(await snapshot(),protectedState);assert.equal('phoneProfile' in result.data,false);
 }
});
await test('authorization is repeated in the write, not only the post-lock preflight',async()=>{
 // This hook simulates a changed authorization snapshot before the write. Real
 // member updates obey PostgreSQL row locks; PGlite cannot model lock contention.
 afterStatement={index:1,run:executor=>executor.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('changed-after-preflight'),ids.owner])};
 status(await confirm(),409);assert.deepEqual(await profiles(),[]);
});
await test('GET and post-save projection stay bound when a session is revoked or reassigned',async()=>{
 for(const reassign of [false,true]){
  await reset();status(await confirm());beforeRead={matches:text=>text.startsWith('WITH owner AS'),run:async()=>{await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('read-unused'),ids.owner]);if(reassign)await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash(tokens.owner),ids.visitor])}};
  const result=await read();status(result,404);assert.equal('phoneProfile' in result.data,false);assert.equal(JSON.stringify(result.data).includes(phones.owner),false);
 }
 await reset();beforeRead={matches:text=>text.startsWith('WITH owner AS'),run:()=>db.query('UPDATE members SET blocked_at=now() WHERE id=$1',[ids.owner])};
 const result=await confirm();status(result,403);assert.equal('phoneProfile' in result.data,false);assert.equal((await profiles()).length,1,'committed private save survives a subsequent standing change without disclosure');
});
await test('failed transactions roll back atomically, log no phone data, and retry safely',async()=>{
 for(const point of [1,2,'commit']){
  await reset();const before=await snapshot();failAt=point;const oldError=console.error,logs=[];console.error=(...args)=>logs.push(args);
  let result;try{result=await confirm()}finally{console.error=oldError}status(result,500);assert.deepEqual(logs,[['Reward request failed.']]);assert.deepEqual(await snapshot(),before);
  status(await confirm());const saved=await snapshot();status(await confirm(),409);assert.deepEqual(await snapshot(),saved,'lost-response retry cannot duplicate or change confirmation');
 }
});
await test('incoming phone summary includes only explicit peer offers and never auto-queues sender waiting or shared exchanges',async()=>{
 const id=await invite(),summary=as=>call({as,query:'phoneRequests=1'}),offer=as=>call({as,body:{action:'offerPhone',connectionId:id,phone:phones[as]}});
 let result=await summary('owner');status(result);assert.deepEqual(result.data,{phoneRequests:[]});
 status(await confirm(phones.visitor,0,{as:'visitor'}));assert.deepEqual((await summary('owner')).data,{phoneRequests:[]},'profile confirmation alone is not a request');
 status(await offer('owner'));assert.deepEqual((await summary('owner')).data,{phoneRequests:[]},'sender waiting has no automatic incoming modal');
 result=await summary('visitor');status(result);assert.equal(result.data.phoneRequests.length,1);assert.equal(result.data.phoneRequests[0].connectionId,id);assert.ok(Number.isFinite(Date.parse(result.data.phoneRequests[0].offeredAt)));
 status(await offer('visitor'));for(const as of ['owner','visitor'])assert.deepEqual((await summary(as)).data,{phoneRequests:[]},'shared exchanges have nothing to answer');
 status(await call({body:{action:'withdrawPhone',connectionId:id}}));assert.equal((await summary('owner')).data.phoneRequests[0].connectionId,id);assert.deepEqual((await summary('visitor')).data,{phoneRequests:[]});
 status(await call({as:'visitor',body:{action:'withdrawPhone',connectionId:id}}));assert.deepEqual((await summary('owner')).data,{phoneRequests:[]});
});
await test('phone summary is minimal, private, stably ordered and read-only across repeated Hold-style refreshes',async()=>{
 const first=await invite(),second=await invite({prospect:'other'}),third=await invite({sender:'visitor',prospect:'owner'});
 status(await confirm());status(await confirm(phones.visitor,0,{as:'visitor'}));
 for(const [id,as] of [[first,'visitor'],[second,'other'],[third,'visitor']])status(await call({as,body:{action:'offerPhone',connectionId:id,phone:phones[as]}}));
 await db.query("UPDATE reward_phone_offers SET offered_at='2026-10-01T01:00:00Z' WHERE invitation_hash IN($1,$2)",[first,third]);await db.query("UPDATE reward_phone_offers SET offered_at='2026-10-02T01:00:00Z' WHERE invitation_hash=$1",[second]);
 const before=await snapshot();let expected;
 for(let n=0;n<3;n++){
  const result=await call({query:'phoneRequests=1'});status(result);assert.deepEqual(Object.keys(result.data),['phoneRequests']);
  assert.deepEqual(result.data.phoneRequests.map(item=>item.connectionId),[second,...[first,third].sort()]);
  for(const item of result.data.phoneRequests)assert.deepEqual(Object.keys(item).sort(),['connectionId','offeredAt']);
  for(const secret of [...Object.values(phones),'@example.com','phoneProfile','confirmedAt','profileConfirmed','Existing conversation','answers','photo'])assert.equal(JSON.stringify(result.data).includes(secret),false,secret);
  if(expected)assert.deepEqual(result.data,expected);expected=result.data;
 }
 assert.deepEqual(await snapshot(),before,'reading or holding a summary consumes no offers, levels, answers or consent');
 const stranger=await call({as:'other',query:'phoneRequests=1'});status(stranger);assert.deepEqual(stranger.data,{phoneRequests:[]});
 status(await call({query:'phoneRequests=1&connection='+first}),400);
});
await test('incoming phone summary excludes Friend, non-chat, lower-level and all lifecycle or counterpart standing restrictions',async()=>{
 const gates=[
  ['friend',id=>db.query("UPDATE invitations SET channel='friend' WHERE token_hash=$1",[id])],
  ...['invited','firstResults','secondFive','nextResults','chatRequested','ended','declined'].map(state=>[state,id=>db.query('UPDATE connection_state SET status=$1 WHERE invitation_hash=$2',[state,id])]),
  ['ended timestamp',id=>db.query('UPDATE connection_state SET ended_at=now() WHERE invitation_hash=$1',[id])],
  ['owner lower level',()=>setLevel(1)],['peer lower level',()=>setLevel(1,'visitor')],
  ['frozen',id=>db.query("INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES($1,$2,'freeze',now())",[ids.visitor,id])],
  ['trashed',id=>db.query("INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES($1,$2,'unfreeze',now())",[ids.owner,id])],
  ['blocked pair',()=>db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.visitor,ids.owner])],
  ['peer blocked',()=>db.query('UPDATE members SET blocked_at=now() WHERE id=$1',[ids.visitor])],
  ['peer suspended',()=>db.query("UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=$1",[ids.visitor])],
  ['peer unverified',()=>db.query('UPDATE members SET email_verified_at=NULL WHERE id=$1',[ids.visitor])]
 ];
 for(const [label,restrict] of gates){
  await reset();const id=await invite();status(await call({as:'visitor',body:{action:'offerPhone',connectionId:id,phone:phones.visitor}}));await restrict(id);const before=await snapshot();
  const result=await call({query:'phoneRequests=1'});status(result);assert.deepEqual(result.data,{phoneRequests:[]},label);assert.deepEqual(await snapshot(),before);
 }
 for(const state of ['chat','secondResults','email','tests']){
  await reset();const id=await invite({status:state});status(await call({as:'visitor',body:{action:'offerPhone',connectionId:id,phone:phones.visitor}}));assert.equal((await call({query:'phoneRequests=1'})).data.phoneRequests[0].connectionId,id,state);
 }
});
await test('incoming phone summary rechecks lifecycle and account binding in the projection statement',async()=>{
 const changes=[
  ['peer frozen',id=>db.query("INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES($1,$2,'freeze',now())",[ids.visitor,id]),200],
  ['actor blocked',()=>db.query('UPDATE members SET blocked_at=now() WHERE id=$1',[ids.owner]),403],
  ['actor suspended',()=>db.query("UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=$1",[ids.owner]),403],
  ['actor unverified',()=>db.query('UPDATE members SET email_verified_at=NULL WHERE id=$1',[ids.owner]),403],
  ['rotated',()=>db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('summary-rotation'),ids.owner]),403],
  ['reassigned',async()=>{await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('summary-unused'),ids.owner]);await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash(tokens.owner),ids.visitor])},403]
 ];
 for(const [label,change,expected] of changes){
  await reset();const id=await invite();status(await call({as:'visitor',body:{action:'offerPhone',connectionId:id,phone:phones.visitor}}));
  beforeRead={matches:text=>text.startsWith('WITH owner AS')&&text.includes(' AS phone_requests'),run:()=>change(id)};
  const result=await call({query:'phoneRequests=1'});status(result,expected,label);
  if(expected===200)assert.deepEqual(result.data,{phoneRequests:[]});else{assert.equal(result.data.sessionExpired,true);assert.equal('phoneRequests' in result.data,false)}
  assert.equal(JSON.stringify(result.data).includes(id),false);assert.equal(JSON.stringify(result.data).includes(phones.visitor),false);
 }
 await reset();status(await call({query:'phoneRequests=1',cookie:''}),401);status(await call({query:'phoneRequests=1',headers:{'x-chempat-member-id':ids.visitor}}),403);
});
await test('blocked deployment or absent storage never reaches private SQL',async()=>{
 const keys=['CHEMPAT_RELEASE_MODE','CHEMPAT_REVIEW_DATA','VERCEL','VERCEL_PROJECT_ID','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','DATABASE_URL'];const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));const before=queryCount;
 try{
  process.env.CHEMPAT_RELEASE_MODE='blocked';status(await read(),503);status(await confirm(),503);
  for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value}delete process.env.DATABASE_URL;
  status(await read(),503);status(await confirm(),503);assert.equal(queryCount,before);
 }finally{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
});
console.log(`Private phone profile integration: ${passed} passed; ${failures.length} failed; ${transactionCount} real SQL transactions; ${queryCount} reads`);
await db.close();if(failures.length)process.exitCode=1;
