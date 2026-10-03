// Synthetic PGlite integration only. No deployed database, real members, mail,
// provider calls or remotely hosted media are used.
process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
// Run the complete same synthetic suite in trusted production mode on demand.
// DATABASE_URL is always overwritten below and all SQL stays in PGlite.
if(process.env.REWARD_TEST_MODE==='live')Object.assign(process.env,{CHEMPAT_RELEASE_MODE:'live',VERCEL:'1',VERCEL_PROJECT_ID:'prj_gtV01YIqkEfAfvdSbVopIfy2VpnJ',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'live'});
process.env.DATABASE_URL='postgres://synthetic-reward-requests-only';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const root=new URL('../',import.meta.url),db=new PGlite();
for(let pass=0;pass<2;pass++){
 await db.exec(fs.readFileSync(new URL('schema.sql',root),'utf8'));await db.exec('ALTER TABLE members ADD COLUMN IF NOT EXISTS email_verified_at timestamptz');
 for(const name of fs.readdirSync(new URL('migrations/',root)).filter(x=>x.endsWith('.sql')).sort())await db.exec(fs.readFileSync(new URL('migrations/'+name,root),'utf8'));
}
const hash=value=>createHash('sha256').update(value).digest('hex');
const ids={sender:'11111111-1111-4111-8111-111111111111',target:'22222222-2222-4222-8222-222222222222',other:'33333333-3333-4333-8333-333333333333'};
const tokens={sender:'a'.repeat(64),target:'b'.repeat(64),other:'c'.repeat(64)};
const jpeg=Buffer.from([255,216,42,255,217]),jpeg2=Buffer.from([255,216,19,255,217]);
const photo=bytes=>'data:image/jpeg;base64,'+bytes.toString('base64');
const senderAnswers=[0,1,2,0,1,2,2,1,0,0],targetAnswers=[2,1,0,2,1,0,0,1,2,2];
for(const [name,id] of Object.entries(ids)){
 await db.query('INSERT INTO members(id,session_hash,name,contact,photo,answers,email_verified_at) VALUES($1,$2,$3,$4,$5,$6,now())',[id,hash(tokens[name]),name+' PrivateSurname',name+'@example.com',photo(name==='sender'?jpeg:jpeg2),JSON.stringify(name==='sender'?senderAnswers:targetAnswers)]);
 await db.query("INSERT INTO member_reward_state(member_id,completed_level,answers) VALUES($1,4,'{\"private\":\"must not leak\"}')",[id]);
}
const template=(strings,values)=>({text:strings.reduce((q,part,index)=>q+(index?'$'+index:'')+part,''),params:values});
const run=async(executor,statement)=>(await executor.query(statement.text,statement.params)).rows;
let beforeRead=null,beforeTransaction=null,failAt=null,queries=0,transactions=0;
const sql=(strings,...values)=>run(db,template(strings,values));
sql.query=async(text,params=[])=>{queries++;if(beforeRead&&beforeRead.matches(text)){const hook=beforeRead;beforeRead=null;await hook.run()}return run(db,{text,params})};
sql.transaction=async(build,options)=>{
 transactions++;assert.equal(options?.isolationLevel,'ReadCommitted');if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;await hook()}
 return db.transaction(async executor=>{
  const tx=(strings,...values)=>template(strings,values);tx.query=(text,params=[])=>({text,params});const statements=build(tx);
  assert.match(statements[0].text,/ORDER BY id FOR UPDATE/,'pair member locks are ordered');
  if(statements.some(s=>/SET status='accepted'/.test(s.text)))assert.match(statements[1].text,/reward_discovery_requests.*FOR UPDATE/,'acceptance locks request row after members');
  const rows=[];for(let index=0;index<statements.length;index++){if(failAt===index){failAt=null;throw Error('Synthetic failed transaction')}rows.push(await run(executor,statements[index]))}return rows;
 });
};
globalThis.__rewardRequestsSql=sql;
async function load(name){const source=fs.readFileSync(new URL('api/'+name+'.mjs',root),'utf8').replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__rewardRequestsSql;').replace(/from '\.\/(.*?)\.mjs'/g,(_,dep)=>`from '${new URL('api/'+dep+'.mjs',root).href}'`);return (await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default}
const api=await load('reward-requests'),connections=await load('connection');
globalThis.fetch=async()=>{throw Error('Unexpected external call in synthetic request tests')};
async function response({as='sender',body,query='',headers={},cookie,method,rawBody}={}){
 const h=new Headers({'content-type':'application/json',cookie:cookie??(as?'chempat_member='+tokens[as]:''),...(as?{'x-chempat-member-id':ids[as]}:{})});for(const [key,value] of Object.entries(headers)){if(value===null)h.delete(key);else h.set(key,value)}
 const hasBody=body!==undefined||rawBody!==undefined,result=await api.fetch(new Request('https://isolated.example/api/reward-requests?'+query,{method:method||(hasBody?'POST':'GET'),headers:h,...(hasBody?{body:rawBody??JSON.stringify(body)}:{})}));
 assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(result.headers.get('x-content-type-options'),'nosniff');return result;
}
async function call(options){const res=await response(options);return {status:res.status,data:await res.json()}}
const request=(as='sender',target='target')=>call({as,body:{action:'request',targetId:ids[target]}});
const action=(action,id,as='target')=>call({as,body:{action,id}});
const preview=(id,as='target',extra={})=>response({as,query:'photo='+id,...extra});
async function hiddenOutgoing(id){const data=(await call()).data;assert.equal(data.incoming.length,0);assert.equal(data.outgoing.length,1);assert.equal(data.outgoing[0].id,id);assert.equal(data.outgoing[0].memberId,ids.target);assert.equal(data.outgoing[0].name,'target');assert.equal(data.outgoing[0].photo,null);assert.deepEqual(Object.keys(data.outgoing[0]).sort(),['expiresAt','id','memberId','name','photo']);return data.outgoing[0]}

const status=(res,value)=>assert.equal(res.status,value,JSON.stringify(res.data));
const count=async table=>(await db.query('SELECT count(*) AS n FROM '+table)).rows[0].n;
async function pending(){const res=await request();status(res,200);assert.equal(res.data.status,'pending');assert.equal(res.data.connectionId,null);return res.data.id}
async function reset(){
 assert.equal(beforeTransaction,null);assert.equal(beforeRead,null);failAt=null;
 await db.exec('DELETE FROM reward_discovery_requests;DELETE FROM invitations;DELETE FROM member_blocks;DELETE FROM reward_directory_profile');await db.query('DELETE FROM members WHERE id NOT IN($1,$2,$3)',Object.values(ids));await db.exec("UPDATE members SET session_hash='reset:'||id::text");
 for(const [name,id] of Object.entries(ids)){
  await db.query('UPDATE members SET session_hash=$1,name=$2,photo=$3,answers=$4,email_verified_at=now(),blocked_at=NULL,suspended_until=NULL WHERE id=$5',[hash(tokens[name]),name+' PrivateSurname',photo(name==='sender'?jpeg:jpeg2),JSON.stringify(name==='sender'?senderAnswers:targetAnswers),id]);
  await db.query('UPDATE member_reward_state SET completed_level=4 WHERE member_id=$1',[id]);
  await db.query('INSERT INTO reward_directory_profile(member_id,listed,photo,display_name) VALUES($1,$2,$3,$4)',[id,name!=='sender',photo(name==='sender'?jpeg:jpeg2),name]);
 }
}
let sequence=0;
async function prior({state='ended',reverse=false,mode=null,unclaimed=false}={}){
 const id=hash('prior-request-pair-'+(++sequence)),sender=reverse?'target':'sender',target=reverse?'sender':'target';
 await db.query("INSERT INTO invitations(token_hash,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,sender_member_id,intended_member_id,channel) VALUES($1,'','Old',$2,'[]','Old',$3,$4,$5,'email')",[id,photo(jpeg),target+'@example.com',ids[sender],unclaimed?ids[target]:null]);
 await db.query('INSERT INTO connection_state(invitation_hash,prospect_member_id,status) VALUES($1,$2,$3)',[id,unclaimed?null:ids[target],state]);
 if(mode)await db.query(`INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at,trashed_at) VALUES($1,$2,'freeze',now(),${mode==='trash'?'now()':'NULL'})`,[ids.sender,id]);return id;
}
async function existingInbox(as){const res=await connections.fetch(new Request('https://isolated.example/api/connection?inbox=1',{headers:{cookie:'chempat_member='+tokens[as]}}));status(res,200);return res.json()}
let passed=0,failures=[];
async function test(name,fn){try{await reset();await fn();passed++;console.log('ok - '+name)}catch(error){failures.push(name);console.error('FAIL - '+name+'\n'+error.stack);beforeTransaction=null;beforeRead=null;failAt=null}}

await test('migration is additive/repeatable and request preview never exposes answers or contacts',async()=>{
 assert.equal(await count('reward_discovery_requests'),0);assert.deepEqual((await call()).data,{incoming:[],outgoing:[]});const id=await pending();assert.equal(await count('invitations'),0);assert.equal(await count('connection_state'),0);assert.equal(await count('activity'),0);
 const own=(await call()).data,target=(await call({as:'target'})).data;
 assert.equal(own.outgoing[0].memberId,ids.target);assert.equal(target.incoming[0].memberId,ids.sender);assert.equal(target.incoming[0].name,'sender');assert.equal(target.incoming[0].photo,'/api/reward-requests?photo='+id);assert.equal(own.incoming.length,0);assert.equal(target.outgoing.length,0);assert.deepEqual((await call({as:'other'})).data,{incoming:[],outgoing:[]});
 for(const secret of ['@example.com','PrivateSurname','answers','first_five','contact','phone','data:image','must not leak','session_hash'])assert.equal(JSON.stringify([own,target]).includes(secret),false,secret);
 const row=(await db.query('SELECT * FROM reward_discovery_requests WHERE id=$1',[id])).rows[0];assert.deepEqual(row.sender_first_five,senderAnswers.slice(0,5));assert.ok((new Date(row.expires_at)-new Date(row.created_at))/86400000===7);
});
await test('unlisted sender shares only explicit request snapshot with target and nobody else',async()=>{
 const id=await pending();status(await preview(id,'other'),404);status(await preview(id,null),401);
 const received=await preview(id);status(received,200);assert.deepEqual(Buffer.from(await received.arrayBuffer()),jpeg);
 const sent=await preview(id,'sender');status(sent,200);assert.deepEqual(Buffer.from(await sent.arrayBuffer()),jpeg2);
 await db.query('UPDATE members SET name=$1,photo=$2 WHERE id=$3',['Edited PrivateSurname',photo(jpeg2),ids.sender]);assert.equal((await call({as:'target'})).data.incoming[0].name,'sender');assert.deepEqual(Buffer.from(await (await preview(id)).arrayBuffer()),jpeg);
 assert.equal((await db.query('SELECT listed FROM reward_directory_profile WHERE member_id=$1',[ids.sender])).rows[0].listed,false);
});
await test('request repeats are exact and reversed requests never autoaccept or duplicate',async()=>{
 const id=await pending(),before=(await db.query('SELECT * FROM reward_discovery_requests')).rows;status(await request(),200);assert.equal((await request()).data.id,id);assert.deepEqual((await db.query('SELECT * FROM reward_discovery_requests')).rows,before);
 await db.query('UPDATE reward_directory_profile SET listed=true WHERE member_id=$1',[ids.sender]);status(await request('target','sender'),409);assert.equal(await count('reward_discovery_requests'),1);assert.equal(await count('invitations'),0);
});
await test('accept atomically creates one member-bound existing firstResults connection without contact or email',async()=>{
 const id=await pending();const result=await action('accept',id);status(result,200);assert.equal(result.data.status,'accepted');assert.match(result.data.connectionId,/^[a-f0-9]{64}$/);
 const inv=(await db.query('SELECT * FROM invitations')).rows[0],pair=(await db.query('SELECT * FROM connection_state')).rows[0];assert.equal(inv.token_hash,result.data.connectionId);assert.equal(inv.sender_member_id,ids.sender);assert.equal(inv.intended_member_id,ids.target);assert.equal(inv.sender_email,'');assert.equal(inv.recipient_email,'');assert.equal(inv.channel,'email');assert.equal(inv.expires_at,null);assert.deepEqual(inv.sender_answers,senderAnswers.slice(0,5));
 assert.equal(pair.prospect_member_id,ids.target);assert.equal(pair.status,'firstResults');assert.deepEqual(pair.prospect_answers,targetAnswers.slice(0,5));assert.equal(pair.prospect_phone,null);assert.equal(pair.prospect_email,null);assert.deepEqual(pair.messages,[]);assert.equal(await count('activity'),0);
 assert.deepEqual((await call()).data,{incoming:[],outgoing:[]});assert.deepEqual((await call({as:'target'})).data,{incoming:[],outgoing:[]});status(await preview(id),404);
 const senderInbox=await existingInbox('sender'),targetInbox=await existingInbox('target');assert.equal(senderInbox.connections[0].id,inv.token_hash);assert.equal(targetInbox.connections[0].id,inv.token_hash);assert.equal(senderInbox.connections[0].side,'member');assert.equal(targetInbox.connections[0].side,'prospect');assert.equal(senderInbox.connections[0].status,'firstResults');assert.equal(targetInbox.connections[0].status,'firstResults');assert.deepEqual(targetInbox.connections[0].sender_answers,senderAnswers.slice(0,5));assert.equal(senderInbox.connections[0].prospect_email,null);
});
await test('accept preserves offered sender first five despite private edits and uses target current five',async()=>{
 const id=await pending(),edited=[1,1,1,1,1,0,0,0,0,0];await db.query('UPDATE members SET answers=$1 WHERE id=$2',[JSON.stringify(edited),ids.sender]);status(await request(),200);await db.query('UPDATE members SET answers=$1 WHERE id=$2',[JSON.stringify(edited),ids.target]);
 status(await action('accept',id),200);assert.deepEqual((await db.query('SELECT sender_answers FROM invitations')).rows[0].sender_answers,senderAnswers.slice(0,5));assert.deepEqual((await db.query('SELECT prospect_answers FROM connection_state')).rows[0].prospect_answers,edited.slice(0,5));
});
await test('accept retries are idempotent and never copy later answers or create a second connection',async()=>{
 const id=await pending(),first=await action('accept',id);status(first,200);const before=(await db.query('SELECT * FROM invitations')).rows;await db.query("UPDATE members SET answers='[1,1,1,1,1,0,0,0,0,0]' WHERE id=$1",[ids.target]);
 const repeat=await action('accept',id);status(repeat,200);assert.deepEqual(repeat.data,first.data);assert.equal(await count('invitations'),1);assert.equal(await count('connection_state'),1);assert.deepEqual((await db.query('SELECT * FROM invitations')).rows,before);const duplicate=await request();status(duplicate,200);assert.equal(duplicate.data.connectionId,first.data.connectionId);
});
await test('only target accepts/passes and only sender cancels; arbitrary UUIDs confer no authority',async()=>{
 const id=await pending();for(const operation of ['accept','pass'])status(await action(operation,id,'sender'),409);status(await action('cancel',id,'target'),409);
 for(const operation of ['accept','pass','cancel']){status(await action(operation,id,'other'),404);status(await action(operation,randomUUID(),'target'),404)}
 assert.equal((await db.query('SELECT status FROM reward_discovery_requests')).rows[0].status,'pending');assert.equal(await count('invitations'),0);
});
await test('pass and cancellation are idempotent, hide previews and prevent new/reverse spam',async()=>{
 for(const [operation,actor,expected] of [['pass','target','passed'],['cancel','sender','cancelled']]){
  const id=await pending();const result=await action(operation,id,actor);status(result,200);assert.equal(result.data.status,expected);assert.deepEqual((await action(operation,id,actor)).data,result.data);status(await preview(id),404);status(await action('accept',id),409);status(await request(),409);
  await db.query('UPDATE reward_directory_profile SET listed=true WHERE member_id=$1',[ids.sender]);status(await request('target','sender'),409);assert.equal(await count('reward_discovery_requests'),1);assert.equal(await count('invitations'),0);assert.deepEqual((await call()).data,{incoming:[],outgoing:[]});await reset();
 }
});
await test('expiry hides requests and previews and cannot be extended by retries',async()=>{
 const id=await pending();await db.query("UPDATE reward_discovery_requests SET expires_at=now()-interval '1 second' WHERE id=$1",[id]);assert.deepEqual((await call({as:'target'})).data,{incoming:[],outgoing:[]});status(await preview(id),404);status(await request(),409);status(await action('accept',id),409);status(await action('cancel',id,'sender'),200);assert.equal(await count('invitations'),0);
});
await test('target must be currently listed; removing listing immediately hides requests and denies transitions',async()=>{
 const id=await pending();await db.query('UPDATE reward_directory_profile SET listed=false WHERE member_id=$1',[ids.target]);await hiddenOutgoing(id);assert.deepEqual((await call({as:'target'})).data,{incoming:[],outgoing:[]});status(await preview(id),404);status(await request(),404);status(await action('accept',id),409);status(await action('cancel',id,'sender'),200);
});
await test('blocks both directions and prior ended/frozen/trashed pairs suppress all request access',async()=>{
 const changes=[()=>db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.sender,ids.target]),()=>db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.target,ids.sender]),()=>prior(),()=>prior({reverse:true}),()=>prior({state:'declined'}),()=>prior({state:'chat',mode:'freeze'}),()=>prior({state:'chat',mode:'trash'}),()=>prior({unclaimed:true})];
 for(const change of changes){const id=await pending();await change();const before=await count('invitations');await hiddenOutgoing(id);assert.deepEqual((await call({as:'target'})).data,{incoming:[],outgoing:[]});status(await preview(id),404);status(await request(),404);status(await action('accept',id),409);status(await action('cancel',id,'sender'),200);assert.equal(await count('invitations'),before);await reset()}
});
await test('sender can withdraw after target unlists; later relisting never revives withdrawn consent',async()=>{
 const id=await pending();await db.query('UPDATE reward_directory_profile SET listed=false WHERE member_id=$1',[ids.target]);await hiddenOutgoing(id);status(await preview(id,'sender'),404);
 status(await action('cancel',id,'sender'),200);await db.query('UPDATE reward_directory_profile SET listed=true WHERE member_id=$1',[ids.target]);status(await action('accept',id),409);status(await request(),409);assert.equal(await count('invitations'),0);assert.equal((await db.query('SELECT status FROM reward_discovery_requests')).rows[0].status,'cancelled');
});
await test('pass/cancel remain available with unavailable counterparts or expired requests but never accepted ones',async()=>{
 for(const [operation,actor,counterpart] of [['cancel','sender','target'],['pass','target','sender']])for(const change of ['blocked','suspended','unverified','level','expired']){
  const id=await pending();
  if(change==='blocked')await db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids[counterpart],ids[actor]]);
  if(change==='suspended')await db.query("UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=$1",[ids[counterpart]]);
  if(change==='unverified')await db.query('UPDATE members SET email_verified_at=NULL WHERE id=$1',[ids[counterpart]]);
  if(change==='level')await db.query('UPDATE member_reward_state SET completed_level=3 WHERE member_id=$1',[ids[counterpart]]);
  if(change==='expired')await db.query("UPDATE reward_discovery_requests SET expires_at=now()-interval '1 second' WHERE id=$1",[id]);
  if(operation==='cancel'&&change!=='expired')await hiddenOutgoing(id);
  status(await action(operation,id,actor),200);assert.equal((await db.query('SELECT status FROM reward_discovery_requests')).rows[0].status,operation==='cancel'?'cancelled':'passed');assert.equal(await count('invitations'),0);await reset();
 }
 const id=await pending();status(await action('accept',id),200);await db.query('UPDATE reward_directory_profile SET listed=false WHERE member_id=$1',[ids.target]);status(await action('cancel',id,'sender'),409);status(await action('pass',id),409);assert.equal((await db.query('SELECT status FROM reward_discovery_requests')).rows[0].status,'accepted');
});
await test('historical outgoing metadata never substitutes fresh hidden profile details',async()=>{
 const id=await pending();await db.query('UPDATE reward_directory_profile SET listed=false,display_name=$1,photo=$2 WHERE member_id=$3',['Never expose this changed name',photo(jpeg),ids.target]);await db.query('UPDATE members SET name=$1,contact=$2 WHERE id=$3',['Hidden private new name','private-changed@example.com',ids.target]);const outgoing=await hiddenOutgoing(id);
 assert.equal(JSON.stringify(outgoing).includes('changed'),false);status(await preview(id,'sender'),404);status(await call({as:'other'}),200);assert.deepEqual((await call({as:'other'})).data,{incoming:[],outgoing:[]});status(await action('cancel',id,'other'),404);
});
await test('both members require verified standing and level4 without legacy-answer shortcuts',async()=>{
 for(const name of ['sender','target'])for(const mutation of ['email_verified_at=NULL','blocked_at=now()',"suspended_until=now()+interval '1 day'",'level3']){
  const id=await pending();if(mutation==='level3')await db.query('UPDATE member_reward_state SET completed_level=3 WHERE member_id=$1',[ids[name]]);else await db.query('UPDATE members SET '+mutation+' WHERE id=$1',[ids[name]]);
  status(await request(),name==='sender'?403:404);status(await action('accept',id),name==='target'?403:409);status(await preview(id),name==='target'?403:404);assert.equal(await count('invitations'),0);await reset();
 }
});
await test('authentication, method, body, same-origin and expected-account controls fail closed',async()=>{
 for(const cookie of ['', 'chempat_member=bad','chempat_member='+tokens.sender+'bad'])status(await call({cookie}),401);status(await call({cookie:'chempat_member='+'e'.repeat(64)}),403);
 for(const method of ['PUT','PATCH','DELETE'])status(await call({method}),405);status(await request('sender','sender'),404);
 for(const body of [[],{}, {action:'request',targetId:'bad'}, {action:'request',targetId:ids.target,answers:[0]}, {action:'accept',id:ids.target,memberId:ids.sender}])status(await call({body}),400);
 status(await call({rawBody:'{'}),400);status(await call({rawBody:' '.repeat(1025)}),413);status(await call({body:{action:'request',targetId:ids.target},headers:{'content-length':'9999'}}),413);status(await call({body:{action:'request',targetId:ids.target},headers:{'content-type':'text/plain'}}),415);status(await call({body:{action:'request',targetId:ids.target},headers:{origin:'https://evil.example'}}),403);
 for(const expected of [null,'',ids.other,'bad'])status(await call({body:{action:'request',targetId:ids.target},headers:{'x-chempat-member-id':expected}}),403);status(await call({headers:{'x-chempat-member-id':ids.target}}),403);status(await call({headers:{'x-chempat-member-id':null}}),200);assert.equal(await count('reward_discovery_requests'),0);
});
await test('request refuses missing/invalid first five and target acceptance cannot reveal invalid answers',async()=>{
 for(const answers of ['[]','[0,1,2]','[0,1,2,0,9]','[0,1,2,0,"1"]']){await db.query('UPDATE members SET answers=$1 WHERE id=$2',[answers,ids.sender]);status(await request(),404)}await reset();const id=await pending();await db.query("UPDATE members SET answers='[0,1,2]' WHERE id=$1",[ids.target]);status(await action('accept',id),409);assert.equal(await count('invitations'),0);
});
await test('ordered member locks recheck target listing/block/lifecycle before creating a request',async()=>{
 for(const change of [()=>db.query('UPDATE reward_directory_profile SET listed=false WHERE member_id=$1',[ids.target]),()=>db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.target,ids.sender]),()=>prior(),()=>db.query('UPDATE member_reward_state SET completed_level=3 WHERE member_id=$1',[ids.target])]){
  beforeTransaction=change;status(await request(),409);assert.equal(await count('reward_discovery_requests'),0);await reset();
 }
});
await test('session rotation/reassignment during a lock wait cannot redirect a request or transition',async()=>{
 for(const operation of ['request','accept','pass','cancel']){
  const id=operation==='request'?null:await pending(),as=['accept','pass'].includes(operation)?'target':'sender';
  beforeTransaction=async()=>{await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('rotated'),ids[as]]);await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash(tokens[as]),ids.other])};
  status(operation==='request'?await request():await action(operation,id,as),409);assert.equal(await count('invitations'),0);if(id)assert.equal((await db.query('SELECT status FROM reward_discovery_requests')).rows[0].status,'pending');else assert.equal(await count('reward_discovery_requests'),0);await reset();
 }
});
await test('unlisting, blocking, expiry and standing races cannot create a connection after target clicks Accept',async()=>{
 for(const change of [()=>db.query('UPDATE reward_directory_profile SET listed=false WHERE member_id=$1',[ids.target]),()=>db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.target,ids.sender]),()=>db.query("UPDATE reward_discovery_requests SET expires_at=now()-interval '1 second'"),()=>db.query('UPDATE members SET blocked_at=now() WHERE id=$1',[ids.sender])]){
  const id=await pending();beforeTransaction=change;status(await action('accept',id),409);assert.equal(await count('invitations'),0);assert.equal(await count('connection_state'),0);await reset();
 }
});
await test('read snapshot revalidates actor and pair for metadata and private photo bytes',async()=>{
 for(const query of ['', 'photo']){
  const id=await pending();beforeRead={matches:text=>text.startsWith('WITH '),run:()=>db.query('UPDATE reward_directory_profile SET listed=false WHERE member_id=$1',[ids.target])};const res=await response({as:'target',query:query?'photo='+id:''});status(res,query?404:200);if(!query)assert.deepEqual(await res.json(),{incoming:[],outgoing:[]});await reset();
  const next=await pending();beforeRead={matches:text=>text.startsWith('WITH '),run:async()=>{await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('rotated'),ids.target]);await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash(tokens.target),ids.other])}};status(await response({as:'target',query:query?'photo='+next:''}),query?404:403);await reset();
 }
});
await test('acceptance SQL failure rolls back invitation, connection and status together',async()=>{
 const id=await pending();
 // A database constraint failure after invitations are inserted inside the CTE
 // proves PostgreSQL rolls back all three tables, not just the status update.
 await db.exec("ALTER TABLE connection_state ADD CONSTRAINT synthetic_reject_first_results CHECK(status<>'firstResults')");
 status(await action('accept',id),503);assert.equal(await count('invitations'),0);assert.equal(await count('connection_state'),0);assert.equal((await db.query('SELECT status FROM reward_discovery_requests')).rows[0].status,'pending');await db.exec('ALTER TABLE connection_state DROP CONSTRAINT synthetic_reject_first_results');status(await action('accept',id),200);
});
await test('list payload is capped at50 in each direction and photos remain authenticated routes',async()=>{
 await db.query('UPDATE reward_directory_profile SET listed=true WHERE member_id=$1',[ids.sender]);
 for(const direction of ['incoming','outgoing'])for(let index=0;index<55;index++){
  const member=randomUUID();await db.query("INSERT INTO members(id,session_hash,name,contact,photo,answers,email_verified_at) VALUES($1,$2,'Synthetic','never-return@example.com',$3,'[0,1,2,0,1]',now())",[member,hash(member),photo(jpeg)]);await db.query('INSERT INTO member_reward_state(member_id,completed_level) VALUES($1,4)',[member]);await db.query("INSERT INTO reward_directory_profile(member_id,listed,photo,display_name) VALUES($1,true,$2,'Synthetic')",[member,photo(jpeg)]);
  await db.query("INSERT INTO reward_discovery_requests(id,sender_id,target_id,sender_name,sender_photo,target_name,target_photo,sender_first_five) VALUES($1,$2,$3,'Synthetic',$4,'Synthetic',$4,'[0,1,2,0,1]')",[randomUUID(),direction==='incoming'?member:ids.sender,direction==='incoming'?ids.sender:member,photo(jpeg)]);
 }
 const res=await call();status(res,200);assert.equal(res.data.incoming.length,50);assert.equal(res.data.outgoing.length,50);assert.ok(JSON.stringify(res.data).length<40000);assert.equal(JSON.stringify(res.data).includes('data:image'),false);
});
await test('photo MIME/HEAD checks and missing migrations fail closed without auto-initializing schema',async()=>{
 const id=await pending();const head=await preview(id,'target',{method:'HEAD',headers:{'x-chempat-member-id':null}});status(head,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('content-type'),'image/jpeg');assert.equal(head.headers.get('cross-origin-resource-policy'),'same-origin');status(await call({query:'photo=bad'}),404);
 await db.query('UPDATE reward_discovery_requests SET sender_photo=$1 WHERE id=$2',[photo(Buffer.from('<svg>not jpeg</svg>')),id]);status(await preview(id),404);
 await db.exec('DROP TABLE reward_discovery_requests');status(await call(),503);assert.equal((await db.query("SELECT to_regclass('reward_discovery_requests') AS name")).rows[0].name,null);await db.exec(fs.readFileSync(new URL('migrations/20261003_reward_requests.sql',root),'utf8'));
});
await test('approved production reaches member authentication; spoofed or incomplete deployment identity stays blocked',async()=>{
 const keys=['CHEMPAT_RELEASE_MODE','CHEMPAT_REVIEW_DATA','VERCEL','VERCEL_PROJECT_ID','VERCEL_ENV','VERCEL_GIT_COMMIT_REF'],names=[...keys,'DATABASE_URL'],saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 const live={CHEMPAT_RELEASE_MODE:'live',VERCEL:'1',VERCEL_PROJECT_ID:'prj_gtV01YIqkEfAfvdSbVopIfy2VpnJ',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'live'};
 const configure=values=>{for(const key of keys)delete process.env[key];for(const [key,value] of Object.entries(values))if(value!==undefined)process.env[key]=value};
 const reads=queries,writes=transactions;
 const spoof={host:'chempatible.com','x-forwarded-host':'chempatible.com','x-vercel-project-id':live.VERCEL_PROJECT_ID,'x-vercel-env':'production','x-vercel-git-commit-ref':'live','x-chempat-release-mode':'live'};
 try{
  const blocked=[{},...Object.keys(live).map(key=>({...live,[key]:undefined})),{...live,VERCEL:'0'},{...live,VERCEL_PROJECT_ID:'prj_development'},{...live,VERCEL_ENV:'preview'},{...live,VERCEL_GIT_COMMIT_REF:'main'},{...live,CHEMPAT_RELEASE_MODE:'LIVE'},{...live,CHEMPAT_RELEASE_MODE:'review',CHEMPAT_REVIEW_DATA:'isolated-confirmed'}];
  for(const config of blocked){configure(config);status(await call({as:null,query:'live=true&releaseMode=live',headers:spoof}),503);status(await call({as:null,body:{action:'list',releaseMode:'live'},headers:spoof}),503)}
  configure(live);status(await call({as:null}),401);status(await call({as:null,body:{action:'list'}}),401);status(await response({as:null,query:'photo='+randomUUID()}),401);
  configure({CHEMPAT_REVIEW_DATA:'isolated-confirmed'});status(await call({as:null}),401);
  delete process.env.DATABASE_URL;status(await call(),503);
  assert.equal(queries,reads,'blocked and signed-out probes never query private data');assert.equal(transactions,writes,'deployment probes never mutate data');
  process.env.DATABASE_URL=saved.DATABASE_URL;configure(live);status(await call(),200);
  status(await call({headers:{'x-chempat-member-id':'ffffffff-ffff-4fff-8fff-ffffffffffff'}}),403,'trusted production does not bypass account binding');
 }finally{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
});
await db.close();if(failures.length){console.error(`${failures.length} failed; ${passed} passed`);process.exitCode=1}else console.log(`Reward requests: ${passed} consent, privacy, inbox, idempotency and race groups passed`);
