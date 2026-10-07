// Real endpoint PostgreSQL projections on a disposable local PGlite database.
// Identity refresh never changes the original invitation or accepted snapshots.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {currentConnectionIdentities} from '../api/_connection-identity.mjs';
import {WILDCARD_CATEGORIES} from '../api/_wildcard-questions.mjs';
process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
process.env.DATABASE_URL='postgres://local-profile-identity-only';
const root=new URL('../',import.meta.url),db=new PGlite();
await db.exec(fs.readFileSync(new URL('schema.sql',root),'utf8'));
await db.exec('ALTER TABLE members ADD COLUMN IF NOT EXISTS email_verified_at timestamptz');
const hash=value=>createHash('sha256').update(value).digest('hex');
const ids={owner:'11111111-1111-4111-8111-111111111111',visitor:'22222222-2222-4222-8222-222222222222',other:'33333333-3333-4333-8333-333333333333',fourth:'44444444-4444-4444-8444-444444444444'};
const tokens={owner:'a'.repeat(64),visitor:'b'.repeat(64),other:'c'.repeat(64),fourth:'d'.repeat(64)};
const snapshotPhoto='data:image/jpeg;base64,AA==',photo=name=>'data:image/jpeg;base64,'+Buffer.from(name).toString('base64');
const five=[0,1,2,0,1],ten=[...five,...five],messages=[{by:'member',text:'Original name in a historic message'}];
let beforeIdentity=null,sequence=0;
const sql=(strings,...values)=>sql.query(strings.reduce((out,part,index)=>out+(index?'$'+index:'')+part,''),values);
sql.query=async(text,values=[])=>{
 if(beforeIdentity&&text.includes('FROM jsonb_to_recordset')){const hook=beforeIdentity;beforeIdentity=null;await hook()}
 return (await db.query(text,values)).rows;
};
sql.transaction=async(build)=>db.transaction(async tx=>{
 const tagged=(strings,...values)=>({text:strings.reduce((out,part,index)=>out+(index?'$'+index:'')+part,''),values});
 tagged.query=(text,values=[])=>({text,values});
 const result=[];for(const statement of build(tagged))result.push((await tx.query(statement.text,statement.values)).rows);return result;
});
globalThis.__identitySql=sql;
async function load(name){
 const source=fs.readFileSync(new URL('api/'+name+'.mjs',root),'utf8').replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__identitySql;').replace(/from '\.\/(.*?)\.mjs'/g,(_,name)=>`from '${new URL('api/'+name+'.mjs',root).href}'`);
 return (await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
}
const connection=await load('connection'),wildcards=await load('wildcards'),gamePieces=await load('game-pieces');
globalThis.fetch=async()=>{throw Error('External requests are forbidden in identity tests')};
async function call(api,query,as='owner',extraHeaders={}){
 const response=await api.fetch(new Request('https://isolated.example/api/test?'+query,{headers:{...(as?{cookie:'chempat_member='+tokens[as],'x-chempat-member-id':ids[as]}:{}),...extraHeaders}}));
 assert.equal(response.headers.get('cache-control'),'no-store');
 return {status:response.status,data:await response.json()};
}
const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.data));return result.data};
const inbox=async(as='owner')=>ok(await call(connection,'inbox=1',as)).connections;
const stored=async id=>(await db.query('SELECT i.*,c.* FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.token_hash=$1',[id])).rows[0];
async function invite({sender='owner',prospect='visitor',state='chat',channel='email',bound=true,intended=null,email=null,expires=false}={}){
 const raw=(++sequence).toString(16).padStart(64,'0'),id=hash(raw);
 await db.query(`INSERT INTO invitations(token_hash,sender_member_id,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,channel,expires_at,intended_member_id,intended_email)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+$10::interval,$11,$12)`,[id,ids[sender],sender+'@example.com','Sent '+sender,snapshotPhoto,JSON.stringify(ten),'Typed '+prospect,prospect+'@example.com',channel,expires?'-1 day':'1 day',intended?ids[intended]:null,email]);
 await db.query(`INSERT INTO connection_state(invitation_hash,prospect_member_id,prospect_name,prospect_photo,prospect_answers,status,messages,claim_hash)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,bound?ids[prospect]:null,bound?'Accepted '+prospect:null,bound?snapshotPhoto:null,JSON.stringify(bound?ten:[]),state,JSON.stringify(messages),channel==='qr'&&bound?hash('claim-'+id):null]);
 return {id,raw};
}
async function reset(){
 assert.equal(beforeIdentity,null);
 await db.exec('DELETE FROM invitations; DELETE FROM members; DELETE FROM game_piece_events; DELETE FROM game_piece_pairs; DELETE FROM activity');
 for(const [name,id] of Object.entries(ids)){
  await db.query('INSERT INTO members(id,session_hash,name,contact,photo,answers,email_verified_at) VALUES($1,$2,$3,$4,$5,$6,now())',[id,hash(tokens[name]),'Live '+name,name+'@example.com',photo(name),JSON.stringify(ten)]);
  await db.query('INSERT INTO member_reward_state(member_id,completed_level) VALUES($1,3)',[id]);
 }
}
let passed=0,failed=0;
async function test(name,run){try{await reset();await run();passed++;console.log('ok - '+name)}catch(error){failed++;console.error('FAIL - '+name+'\n'+error.stack);beforeIdentity=null}}
const assertSnapshot=row=>{
 assert.equal(row.sender_name,'Sent owner');assert.equal(row.sender_photo,snapshotPhoto);
 assert.equal(row.prospect_name,'Accepted visitor');assert.equal(row.prospect_photo,snapshotPhoto);
};
const assertNoCurrent=value=>assert.equal(JSON.stringify(value).includes('Live '),false,JSON.stringify(value));
await test('both directions and reverse invitations show current bound names and photos without writes or duplicate members',async()=>{
 const first=await invite(),reverse=await invite({sender:'visitor',prospect:'owner'});
 const before=await stored(first.id);
 let owner=await inbox(),visitor=await inbox('visitor');
 assert.equal(owner.find(row=>row.id===first.id).prospect_name,'Live visitor');
 assert.equal(owner.find(row=>row.id===first.id).prospect_photo,photo('visitor'));
 assert.equal(visitor.find(row=>row.id===first.id).sender_name,'Live owner');
 assert.equal(visitor.find(row=>row.id===first.id).sender_photo,photo('owner'));
 assert.equal(owner.find(row=>row.id===reverse.id).sender_name,'Live visitor');
 assert.equal(visitor.find(row=>row.id===reverse.id).prospect_name,'Live owner');
 const direct=ok(await call(connection,'invite='+first.raw,'visitor'));
 assert.equal(direct.name,'Live owner');assert.equal(direct.photo,photo('owner'));assert.equal(direct.prospectName,'Live visitor');
 await db.query('UPDATE members SET name=$2,photo=$3 WHERE id=$1',[ids.owner,'Edited owner',photo('edited')]);
 assert.equal(ok(await call(connection,'invite='+first.raw,'visitor')).name,'Edited owner');
 assert.equal((await inbox('visitor')).find(row=>row.id===first.id).sender_photo,photo('edited'));
 assert.deepEqual(await stored(first.id),before);assert.equal((await db.query('SELECT count(*)::integer AS total FROM members')).rows[0].total,4);
 assert.deepEqual(direct.messages,messages);assert.deepEqual(direct.answers,ten);
});
await test('every accepted Vibe stage has current identity while reveal and chat gates stay intact',async()=>{
 for(const state of ['firstResults','request','secondFive','nextResults','chatRequested','chat','secondResults','email','tests']){
  const pair=await invite({state});
  const view=ok(await call(connection,'invite='+pair.raw,'visitor'));
  assert.equal(view.name,'Live owner',state);assert.equal(view.prospectPhoto,photo('visitor'),state);
  assert.equal(view.answers.length,['firstResults','request','secondFive'].includes(state)?5:10,state);
  assert.deepEqual(view.messages,['chat','secondResults','email','tests'].includes(state)?messages:[],state);
 }
});
await test('accepted claimed QR remains current after link expiry; an older frozen pair stays historical beside a fresh pair',async()=>{
 const qr=await invite({channel:'qr',expires:true});
 assert.equal(ok(await call(connection,'invite='+qr.raw,'visitor')).name,'Live owner');
 assert.equal((await inbox()).find(row=>row.id===qr.id).prospect_photo,photo('visitor'));
 const old=await invite();await db.query("UPDATE connection_state SET status='ended',ended_at=now() WHERE invitation_hash=$1",[old.id]);
 const current=await invite();
 const rows=await inbox('visitor');assert.equal(rows.find(row=>row.id===old.id).sender_name,'Sent owner');assert.equal(rows.find(row=>row.id===current.id).sender_name,'Live owner');
 assert.equal('sender_photo' in rows.find(row=>row.id===old.id),false);
});
await test('canonical accepted friends use current identity; duplicate and unregistered friend links keep snapshots',async()=>{
 const pair=await invite({channel:'friend'});
 const view=ok(await call(connection,'invite='+pair.raw,'visitor'));
 assert.equal(view.kind,'friend');assert.equal(view.name,'Live owner');assert.deepEqual(view.answers,[]);
 assert.equal((await inbox())[0].prospect_name,'Live visitor');
 await db.query('DELETE FROM game_piece_pairs WHERE invitation_hash=$1',[pair.id]);
 assert.equal(ok(await call(connection,'invite='+pair.raw,'visitor')).name,'Sent owner');
 await db.query('UPDATE connection_state SET claim_hash=$2 WHERE invitation_hash=$1',[pair.id,hash('duplicate')]);
 assert.equal(ok(await call(connection,'invite='+pair.raw,'visitor')).name,'Sent owner');
});
await test('anonymous pending invitations and typed-email or intended-ID targets reveal only saved invitation identity',async()=>{
 const pending=await invite({state:'invited',bound:false});
 assert.equal(ok(await call(connection,'invite='+pending.raw,null)).name,'Sent owner');
 assert.equal(ok(await call(connection,'invite='+pending.raw,'other')).name,'Sent owner');
 const target=await invite({state:'invited',bound:false,intended:'visitor',email:'visitor@example.com'});
 assert.equal(ok(await call(connection,'invite='+target.raw,'visitor')).name,'Sent owner');
 assert.equal((await call(connection,'invite='+target.raw,'other')).status,403);
 assert.equal((await call(connection,'invite='+target.raw,null)).status,401);
 assertNoCurrent(await inbox());assert.deepEqual(await inbox('other'),[]);
 const boundPending=await invite({state:'invited'});
 assert.equal(ok(await call(connection,'invite='+boundPending.raw,'visitor')).name,'Sent owner');
});
await test('inactive relationships retain snapshots for either participant including either participant freezes and trash',async()=>{
 for(const change of ['ended','declined','ended_at','owner-freeze','visitor-freeze','owner-trash','visitor-trash','owner-block','visitor-block']){
  await reset();const pair=await invite();
  if(['ended','declined'].includes(change))await db.query('UPDATE connection_state SET status=$2 WHERE invitation_hash=$1',[pair.id,change]);
  else if(change==='ended_at')await db.query('UPDATE connection_state SET ended_at=now() WHERE invitation_hash=$1',[pair.id]);
  else if(change.endsWith('block')){const who=change.split('-')[0],other=who==='owner'?'visitor':'owner';await db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids[who],ids[other]])}
  else {const [who,action]=change.split('-');await db.query("INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at,trashed_at) VALUES($1,$2,$3,CASE WHEN $3='freeze' THEN now() END,CASE WHEN $3='unfreeze' THEN now() END)",[ids[who],pair.id,action==='freeze'?'freeze':'unfreeze'])}
  assertNoCurrent(await inbox());assertNoCurrent(await inbox('visitor'));
  const result=await call(connection,'invite='+pair.raw,'visitor');assertNoCurrent(result.data);
  assertSnapshot(await stored(pair.id));
 }
});
await test('blocked, suspended or unverified members cannot expand profile identity visibility',async()=>{
 for(const who of ['owner','visitor'])for(const field of ['blocked_at','suspended_until','email_verified_at']){
  await reset();const pair=await invite();
  await db.query(`UPDATE members SET ${field}=${field==='email_verified_at'?'NULL':"now()+interval '1 day'"} WHERE id=$1`,[ids[who]]);
  assertNoCurrent(await inbox());assertNoCurrent(await inbox('visitor'));
  assert.equal(ok(await call(connection,'invite='+pair.raw,'visitor')).name,'Sent owner');
 }
});
await test('unrelated sessions, changed exact pair, wrong target and expired unclaimed QR cannot resolve current identity',async()=>{
 const pair=await invite(),row=await stored(pair.id);
 const stranger=await currentConnectionIdentities(sql,[row],{member:ids.other,session:hash(tokens.other)});assertSnapshot(stranger[0]);
 const wrongSession=await currentConnectionIdentities(sql,[row],{member:ids.visitor,session:hash(tokens.other)});assertSnapshot(wrongSession[0]);
 await db.query('UPDATE connection_state SET prospect_member_id=$2 WHERE invitation_hash=$1',[pair.id,ids.other]);
 assertSnapshot((await currentConnectionIdentities(sql,[row],{member:ids.owner,session:hash(tokens.owner)}))[0]);
 const target=await invite({intended:'other'});assertNoCurrent((await inbox()).find(x=>x.id===target.id));
 const email=await invite({email:'other@example.com'});assertNoCurrent((await inbox()).find(x=>x.id===email.id));
 const qr=await invite({channel:'qr',expires:true});await db.query('UPDATE connection_state SET claim_hash=NULL WHERE invitation_hash=$1',[qr.id]);
 assertNoCurrent((await inbox()).find(x=>x.id===qr.id));
});
await test('missing member and mismatched immutable pair records fall back without inferring ownership',async()=>{
 const pair=await invite();
 await db.query('UPDATE game_piece_pairs SET prospect_member_id=$2 WHERE invitation_hash=$1',[pair.id,ids.other]);
 assertNoCurrent(await inbox());assert.equal(ok(await call(connection,'invite='+pair.raw,'visitor')).name,'Sent owner');
 await db.query('DELETE FROM members WHERE id=$1',[ids.visitor]);
 assert.equal((await inbox()).find(row=>row.id===pair.id).prospect_name,'Accepted visitor');
 assert.equal((await inbox()).find(row=>row.id===pair.id).prospect_photo,snapshotPhoto);
});
await test('optional expected-member headers reject switched-account reads and actions before exposure or mutation',async()=>{
 const pair=await invite();
 for(const query of ['inbox=1','freezer=1','trash=1','invite='+pair.raw]){
  const denied=await call(connection,query,'visitor',{'x-chempat-member-id':ids.owner});
  assert.equal(denied.status,403);assert.equal(denied.data.sessionExpired,true);assertNoCurrent(denied.data);assert.equal('connections' in denied.data,false);
 }
 const before=await stored(pair.id);
 const denied=await connection.fetch(new Request('https://isolated.example/api/connection',{method:'POST',headers:{cookie:'chempat_member='+tokens.visitor,'x-chempat-member-id':ids.owner,'content-type':'application/json'},body:JSON.stringify({action:'freeze',id:pair.id})}));
 assert.equal(denied.status,403);assert.equal((await denied.json()).sessionExpired,true);assert.deepEqual(await stored(pair.id),before);
 const anonymous=await call(connection,'invite='+pair.raw,null,{'x-chempat-member-id':ids.visitor});assert.equal(anonymous.status,403);assert.equal(anonymous.data.sessionExpired,true);
 const legacy=await connection.fetch(new Request('https://isolated.example/api/connection?inbox=1',{headers:{cookie:'chempat_member='+tokens.owner}}));assert.equal(legacy.status,200);
});
await test('late session rotation and reassignment or pair mutation cannot crosswire the profile overlay',async()=>{
 for(const race of ['rotate','reassign','pair']){
  await reset();const pair=await invite();
  beforeIdentity=async()=>{
   if(race==='pair')await db.query('UPDATE connection_state SET prospect_member_id=$2 WHERE invitation_hash=$1',[pair.id,ids.other]);
   else {await db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.owner,hash('rotated')]);if(race==='reassign')await db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.other,hash(tokens.owner)])}
  };
  const view=(await inbox()).find(row=>row.id===pair.id);assert.equal(view.prospect_name,'Accepted visitor',race);assert.equal(view.prospect_photo,snapshotPhoto,race);
 }
});
await test('empty current fields safely fall back without substituting a different account or typed recipient',async()=>{
 const pair=await invite();await db.query("UPDATE members SET name='',photo='' WHERE id=$1",[ids.visitor]);
 const row=(await inbox()).find(row=>row.id===pair.id);assert.equal(row.prospect_name,'Accepted visitor');assert.equal(row.prospect_photo,snapshotPhoto);
 const view=ok(await call(connection,'invite='+pair.raw,'visitor'));assert.equal(view.name,'Live owner');assert.equal(view.prospectName,'Accepted visitor');
});
await test('wildcard targets and hydration use current counterpart identity for both directions and friends',async()=>{
 for(const channel of ['email','friend']){
  const pair=await invite({channel});
  for(const as of ['owner','visitor']){
   const other=as==='owner'?'visitor':'owner';
   const targets=ok(await call(wildcards,'targets=1',as));assert.equal(targets.connections.find(row=>row.id===pair.id).name,'Live '+other);
   const view=ok(await call(wildcards,'connection='+pair.id+'&hydrate=1',as)).connection;
   assert.equal(as==='owner'?view.prospect_name:view.sender_name,'Live '+other);
   assert.equal(as==='owner'?view.prospect_photo:view.sender_photo,photo(other));
   assert.deepEqual(view.messages,messages);if(channel==='friend')assert.deepEqual(view.own_answers,[]);
  }
  assert.equal((await call(wildcards,'connection='+pair.id+'&hydrate=1','other')).status,404);
 }
});
await test('game-piece actor names and hydrated headers refresh from exact authorized profiles, with historical content unchanged',async()=>{
 const pair=await invite();
 await db.query("SELECT game_piece_emit($1,$2,'chat-ready','chat')",[pair.id,ids.owner]);
 for(const as of ['owner','visitor']){
  const other=as==='owner'?'visitor':'owner';
  const feed=ok(await call(gamePieces,'visit=profile-identity',as));const piece=feed.pieces.find(row=>row.connectionId===pair.id&&row.actorId===ids[other]);
  assert.ok(piece,as);assert.equal(piece.actorName,'Live '+other);
  const view=ok(await call(gamePieces,'visit=profile-identity&piece='+piece.id+'&connection='+pair.id,as));
  assert.equal(view.piece.actorName,'Live '+other);assert.equal(as==='owner'?view.connection.prospect_name:view.connection.sender_name,'Live '+other);
  assert.equal(as==='owner'?view.connection.prospect_photo:view.connection.sender_photo,photo(other));assert.deepEqual(view.connection.messages,messages);
  assert.equal((await call(gamePieces,'visit=profile-identity&piece='+piece.id+'&connection='+pair.id,'other')).status,404);
 }
 const before=await stored(pair.id);assertSnapshot(before);
});
await test('accepted friend wildcard game pieces share the same refreshed identities and block gates',async()=>{
 const pair=await invite({channel:'friend'}),question=WILDCARD_CATEGORIES[0].questions[0].id;
 const response=await wildcards.fetch(new Request('https://isolated.example/api/wildcards',{method:'POST',headers:{cookie:'chempat_member='+tokens.owner,'x-chempat-member-id':ids.owner,'content-type':'application/json'},body:JSON.stringify({action:'ask',connectionId:pair.id,questionId:question,requestId:'friend-profile-question'})}));
 assert.equal(response.status,200,await response.text());
 const feed=ok(await call(gamePieces,'visit=profile-identity','visitor')),piece=feed.pieces.find(row=>row.connectionId===pair.id);
 assert.ok(piece);assert.equal(piece.actorName,'Live owner');
 const view=ok(await call(gamePieces,'visit=profile-identity&piece='+piece.id+'&connection='+pair.id,'visitor'));
 assert.equal(view.connection.sender_name,'Live owner');assert.equal(view.connection.sender_photo,photo('owner'));assert.deepEqual(view.connection.sender_answers,[]);
 await db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.owner,ids.visitor]);
 assert.equal((await call(gamePieces,'visit=profile-identity&piece='+piece.id+'&connection='+pair.id,'visitor')).status,404);
 assert.equal((await call(wildcards,'connection='+pair.id+'&hydrate=1','visitor')).status,404);
});
await db.close();
console.log(`${passed} profile identity tests passed; ${failed} failed`);
if(failed)process.exitCode=1;
