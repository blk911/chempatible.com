// Actual endpoint SQL on disposable local PostgreSQL. No live database, account,
// mail service, or external network is used. PGlite serializes transactions; the
// concurrent-request cases cover outcome invariants, and lock-order assertions
// plus race hooks cover revalidation rather than claiming a multi-server load test.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {WILDCARD_LIMIT,WILDCARD_CATEGORIES,getWildcardQuestion} from '../api/_wildcard-questions.mjs';

process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
process.env.DATABASE_URL='postgres://local-wildcard-tests-only';
if(process.env.WILDCARD_TEST_MODE==='live')Object.assign(process.env,{CHEMPAT_RELEASE_MODE:'live',VERCEL:'1',VERCEL_PROJECT_ID:'prj_gtV01YIqkEfAfvdSbVopIfy2VpnJ',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'live'});
const root=new URL('../',import.meta.url),db=new PGlite();
for(let pass=0;pass<2;pass++){
 await db.exec(fs.readFileSync(new URL('schema.sql',root),'utf8'));
 await db.exec('ALTER TABLE members ADD COLUMN IF NOT EXISTS email_verified_at timestamptz');
 for(const name of fs.readdirSync(new URL('migrations/',root)).filter(x=>x.endsWith('.sql')).sort())await db.exec(fs.readFileSync(new URL('migrations/'+name,root),'utf8'));
}
const hash=s=>createHash('sha256').update(s).digest('hex');
const ids={owner:'11111111-1111-4111-8111-111111111111',visitor:'22222222-2222-4222-8222-222222222222',other:'33333333-3333-4333-8333-333333333333'};
const tokens={owner:'a'.repeat(64),visitor:'b'.repeat(64),other:'c'.repeat(64)};
const questions=WILDCARD_CATEGORIES.flatMap(c=>c.questions),q=index=>questions[index].id;
const initialMessages=[{by:'member',text:'Existing private conversation'},{by:'prospect',text:'A reply',reactions:{member:'like'}}];
let beforeTransaction=null,beforeRead=null,afterLocks=null,failAt=null,transactions=0,reads=0,sequence=0;
const run=async(executor,{text,values=[]})=>(await executor.query(text,values)).rows;
const sql={query:async(text,values=[])=>{
 reads++;
 if(beforeRead&&beforeRead.matches(text)){const hook=beforeRead;beforeRead=null;await hook.run()}
 return run(db,{text,values});
},transaction:async(build,options)=>{
 assert.equal(options?.isolationLevel,'ReadCommitted');transactions++;
 if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;await hook()}
 return db.transaction(async tx=>{
  const statements=build({query:(text,values=[])=>({text,values})});
  assert.equal(statements.length,4);
  assert.match(statements[0].text,/SELECT id FROM members[\s\S]*ORDER BY id FOR UPDATE/,'stable participant locks first');
  assert.match(statements[1].text,/SELECT invitation_hash FROM connection_state[\s\S]*FOR UPDATE/,'connection lock second');
  assert.match(statements[2].text,/WITH eligible AS[\s\S]*m\.id='[a-f0-9-]+'::uuid/,'account identity remains bound after lock wait');
  const results=[];
  for(let index=0;index<statements.length;index++){
   if(index===2&&afterLocks){const hook=afterLocks;afterLocks=null;await hook(tx)}
   if(failAt===index){failAt=null;throw Error('Synthetic wildcard statement failure')}
   results.push(await run(tx,statements[index]));
  }
  if(failAt==='commit'){failAt=null;throw Error('Synthetic wildcard commit failure')}
  return results;
 });
}};
globalThis.__wildcardAnswersSql=sql;
const source=fs.readFileSync(new URL('api/wildcards.mjs',root),'utf8')
 .replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__wildcardAnswersSql;')
 .replace(/from '\.\/(.*?)\.mjs'/g,(_,name)=>`from '${new URL('api/'+name+'.mjs',root).href}'`);
assert.ok(source.includes('const neon=()=>globalThis.__wildcardAnswersSql;'));
const api=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
globalThis.fetch=async()=>{throw Error('Unexpected external request in local wildcard tests')};

async function call({as='owner',body,query='',headers={},cookie,method,rawBody}={}){
 const requestHeaders={cookie:cookie??(as?`chempat_member=${tokens[as]}`:''),'content-type':'application/json',...(ids[as]?{'x-chempat-member-id':ids[as]}:{})};
 for(const [key,value] of Object.entries(headers)){if(value===null)delete requestHeaders[key];else requestHeaders[key]=value}
 const res=await api.fetch(new Request('https://isolated.example/api/wildcards?'+query,{method:method||(body===undefined&&rawBody===undefined?'GET':'POST'),headers:requestHeaders,
  ...((body===undefined&&rawBody===undefined)?{}:{body:rawBody??JSON.stringify(body)}),...(rawBody instanceof ReadableStream?{duplex:'half'}:{})}));
 assert.equal(res.headers.get('cache-control'),'no-store');return {status:res.status,data:await res.json()};
}
const read=(id,as='owner',extra={})=>call({as,query:'connection='+id,...extra});
const ask=(id,index=0,as='owner',requestId=`request-${++sequence}`,extra={})=>call({as,body:{action:'ask',connectionId:id,questionId:q(index),requestId,...extra}});
const status=(result,expected=200)=>assert.equal(result.status,expected,JSON.stringify(result.data));
async function invite({sender='owner',prospect='visitor',status='chat',channel='email'}={}){
 const id=hash('wildcard-connection-'+(++sequence));
 await db.query(`INSERT INTO invitations(token_hash,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,sender_member_id,channel,expires_at)
 VALUES($1,'sender@example.com','Private sender','data:image/jpeg;base64,AA==','[0,1,2,0,1]','Private recipient','recipient@example.com',$2,$3,now()+interval '1 day')`,[id,ids[sender],channel]);
 await db.query(`INSERT INTO connection_state(invitation_hash,prospect_member_id,prospect_name,prospect_answers,prospect_email,prospect_phone,status,messages)
 VALUES($1,$2,'Private prospect','[1,2,0,1,2]','private@example.com','private-phone',$3,$4::jsonb)`,[id,ids[prospect]||null,status,JSON.stringify(initialMessages)]);
 return id;
}
const level=async(as,value)=>db.query('UPDATE member_reward_state SET completed_level=$2 WHERE member_id=$1',[ids[as],value]);
const messages=async id=>(await db.query('SELECT messages FROM connection_state WHERE invitation_hash=$1',[id])).rows[0].messages;
const ledger=async()=>(await db.query('SELECT * FROM connection_wildcard_asks ORDER BY invitation_hash,member_id,slot')).rows;
const core=async id=>(await db.query(`SELECT c.status,c.ended_at,c.prospect_member_id,c.prospect_answers,c.prospect_email,c.prospect_phone,i.sender_answers,i.sender_email,i.channel FROM connection_state c JOIN invitations i ON i.token_hash=c.invitation_hash WHERE c.invitation_hash=$1`,[id])).rows[0];
async function reset(){
 assert.equal(beforeTransaction,null,'before-transaction hook ran');assert.equal(beforeRead,null,'before-read hook ran');assert.equal(afterLocks,null,'after-locks hook ran');failAt=null;
 await db.exec('DELETE FROM invitations;DELETE FROM members');
 for(const [name,id] of Object.entries(ids)){
  await db.query(`INSERT INTO members(id,session_hash,name,contact,photo,answers,email_verified_at) VALUES($1,$2,$3,$4,'data:image/jpeg;base64,AA==','[0,1,2,0,1]',now())`,[id,hash(tokens[name]),name,`${name}@example.com`]);
  await db.query('INSERT INTO member_reward_state(member_id,completed_level) VALUES($1,3)',[id]);
 }
}
function privacy(result){for(const secret of ['session_hash','@example.com','private-phone','data:image/','Private prospect','Existing private conversation',ids.visitor])assert.equal(JSON.stringify(result.data).includes(secret),false,secret+' stays private')}
let passed=0,failed=0;
async function test(name,body){try{await reset();await body();passed++;console.log('ok - '+name)}catch(error){failed++;console.error('FAIL - '+name+'\n'+error.stack);beforeTransaction=null;beforeRead=null;afterLocks=null;failAt=null}}

const answer=(id,index=0,as='visitor',requestId=`answer-${++sequence}`,text='A quiet walk together.',extra={})=>call({as,body:{action:'answer',connectionId:id,questionId:q(index),requestId,answer:text,...extra}});
const summary=(as='owner',extra={})=>call({as,query:'summary=1',...extra});
const states=async()=>(await db.query('SELECT * FROM connection_wildcard_answers ORDER BY invitation_hash,question_id')).rows;
const answered=async()=>(await states()).filter(row=>row.answered_at);
const card=(result,index=0)=>result.data.cards.find(card=>card.questionId===q(index));

await test('both original participants see explicit waiting then answered cards and bounded public fields',async()=>{
 const id=await invite(),sent=await ask(id);status(sent);
 let owner=await read(id),recipient=await read(id,'visitor');
 assert.equal(card(owner).direction,'outgoing');assert.equal(card(owner).status,'waiting');assert.equal(card(owner).canAnswer,false);assert.equal(card(owner).reply,null);
 assert.equal(card(recipient).direction,'incoming');assert.equal(card(recipient).canAnswer,true);assert.deepEqual(card(owner).ask,card(recipient).ask);
 assert.deepEqual(Object.keys(card(owner)).sort(),['ask','canAnswer','categoryId','direction','questionId','reply','status']);
 assert.deepEqual(Object.keys(card(owner).ask).sort(),['at','by','id','text']);
 assert.equal(owner.data.answerMaxLength,1000);assert.equal(owner.data.legacyAskCount,0);privacy(owner);privacy(recipient);
 const result=await answer(id);status(result);assert.equal(result.data.replayed,false);
 assert.match(result.data.message.id,/^wildcard-answer:[a-f0-9]{64}$/);assert.equal(result.data.message.by,'prospect');assert.equal(result.data.message.wildcardAnswerTo,q(0));
 assert.deepEqual((await messages(id)).at(-1),result.data.message);
 owner=await read(id);recipient=await read(id,'visitor');
 assert.equal(card(owner).status,'answered');assert.equal(card(recipient).status,'answered');assert.equal(card(recipient).canAnswer,false);
 assert.equal(card(owner).reply.text,'A quiet walk together.');assert.deepEqual(card(owner).reply,card(recipient).reply);
 assert.equal((await states()).length,1);assert.equal((await answered()).length,1);assert.equal((await ledger()).length,1);
});

await test('a Level0-2 recipient reads and answers without wildcard charge or sharing other rewards',async()=>{
 for(const value of [0,1,2]){
  await reset();const id=await invite();await level('visitor',value);await db.query("UPDATE members SET answers='[]' WHERE id=$1",[ids.visitor]);
  status(await ask(id));const before=await core(id),askRows=await ledger();
  let result=await read(id,'visitor');status(result);assert.equal(result.data.eligible,false);assert.equal(result.data.categories.length,0);assert.equal(result.data.remaining,0);assert.equal(card(result).canAnswer,true);
  result=await answer(id);status(result);assert.equal(result.data.eligible,false);assert.equal(card(result).status,'answered');
  assert.deepEqual(await core(id),before);assert.deepEqual(await ledger(),askRows);assert.equal((await db.query('SELECT completed_level FROM member_reward_state WHERE member_id=$1',[ids.visitor])).rows[0].completed_level,value);
  assert.equal((await db.query('SELECT * FROM reward_phone_offers')).rows.length,0);
  status(await ask(id,1,'visitor'),409);await level('visitor',3);assert.equal((await read(id,'visitor')).data.remaining,3);
 }
});

await test('sender and recipient reverse correctly for a prospect ask; answering also works after own quota exhausted',async()=>{
 const id=await invite();status(await ask(id,0,'visitor'));
 for(let index=1;index<=3;index++)status(await ask(id,index));
 const owner=await read(id);assert.equal(owner.data.remaining,0);assert.equal(card(owner).direction,'incoming');assert.equal(card(owner).canAnswer,true);
 const result=await answer(id,0,'owner');status(result);assert.equal(result.data.remaining,0);assert.equal(result.data.message.by,'member');assert.equal((await ledger()).length,4);
});

await test('same reply request replays exactly once after refresh; changed text or key cannot edit',async()=>{
 const id=await invite();status(await ask(id));const result=await answer(id,0,'visitor','exact-answer','  Hello\nworld  ');status(result);assert.equal(result.data.message.text,'Hello\nworld');
 for(let i=0;i<3;i++){const replay=await answer(id,0,'visitor','exact-answer','Hello\nworld');status(replay);assert.equal(replay.data.replayed,true);assert.deepEqual(replay.data.message,result.data.message)}
 let rejected=await answer(id,0,'visitor','exact-answer','Changed');status(rejected,409);assert.equal(rejected.data.requestConflict,true);
 rejected=await answer(id,0,'visitor','different-answer','Hello\nworld');status(rejected,409);assert.equal(rejected.data.answerExists,true);
 assert.equal((await answered()).length,1);assert.equal((await messages(id)).length,4);assert.equal(card(await read(id)).reply.text,'Hello\nworld');
});

await test('answer request keys cannot migrate across questions, but remain scoped per member and connection',async()=>{
 const id=await invite();status(await ask(id,0));status(await ask(id,1));status(await ask(id,2,'visitor'));
 status(await answer(id,0,'visitor','shared-request'));
 const conflict=await answer(id,1,'visitor','shared-request');status(conflict,409);assert.equal(conflict.data.requestConflict,true);assert.equal(card(await read(id),1).status,'waiting');
 status(await answer(id,2,'owner','shared-request'));
 const other=await invite();status(await ask(other));status(await answer(other,0,'visitor','shared-request'));assert.equal((await answered()).length,3);
});

await test('parallel identical replies emit once, conflicting replies have one winner, and opposite actions coexist',async()=>{
 const id=await invite();status(await ask(id));let results=await Promise.all(Array.from({length:6},()=>answer(id,0,'visitor','parallel-answer')));
 results.forEach(result=>status(result));assert.equal(results.filter(result=>!result.data.replayed).length,1);assert.equal((await messages(id)).length,4);
 const conflict=await invite();status(await ask(conflict));results=await Promise.all([answer(conflict,0,'visitor','parallel-first','First'),answer(conflict,0,'visitor','parallel-second','Second')]);
 assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);assert.equal((await messages(conflict)).length,4);
 const both=await invite();status(await ask(both,0));status(await ask(both,1,'visitor'));
 results=await Promise.all([answer(both,0,'visitor','parallel-to-owner'),answer(both,1,'owner','parallel-to-visitor'),ask(both,2,'owner','parallel-new-ask')]);
 results.forEach(result=>status(result));assert.equal((await messages(both)).length,7);assert.equal((await read(both)).data.cards.length,3);
});

await test('an existing ask and its original opposite member are required; ordinary chat cannot answer',async()=>{
 const id=await invite();status(await answer(id),404);status(await ask(id));
 status(await answer(id,0,'owner'),403);status(await answer(id,0,'other'),404);status(await answer(id,1),404);
 const unrelated=await invite({sender:'owner',prospect:'other'});status(await answer(unrelated,0,'other'),404);
 await db.query(`UPDATE connection_state SET messages=messages||$2::jsonb WHERE invitation_hash=$1`,[id,JSON.stringify([{by:'prospect',text:'I replied in ordinary chat',wildcardAnswerTo:q(0)}])]);
 assert.equal(card(await read(id)).status,'waiting');assert.equal((await answered()).length,0);status(await answer(id));assert.equal((await answered()).length,1);
});

await test('malformed, oversized, cross-origin, non-JSON and stale-account answers never write',async()=>{
 const id=await invite();status(await ask(id));const before=transactions;
 for(const text of [null,5,{},[],true,'',' \t\n ','x'.repeat(1001),'hello\u0000','hello\u0007','hello\u007f'])status(await answer(id,0,'visitor',undefined,text),400);
 for(const extra of [{questionId:'__proto__'},{requestId:'short'},{connectionId:'bad'},{action:'edit'}])status(await answer(id,0,'visitor',undefined,'Valid',extra),400);
 const body={action:'answer',connectionId:id,questionId:q(0),requestId:'valid-answer',answer:'Valid'};
 for(const expected of [null,'',ids.owner,'bad'])status(await call({as:'visitor',body,headers:{'x-chempat-member-id':expected}}),403);
 status(await call({as:'visitor',body,headers:{origin:'https://attacker.example'}}),403);status(await call({as:'visitor',body,headers:{'content-type':'text/plain'}}),415);
 status(await call({as:'visitor',body,headers:{'content-length':'4097'}}),413);status(await call({as:'visitor',rawBody:JSON.stringify({...body,padding:'x'.repeat(4096)})}),413);
 assert.equal(transactions,before);assert.equal((await answered()).length,0);assert.equal((await messages(id)).length,3);
 const result=await answer(id,0,'visitor',undefined,'<script>alert("plain text only")</script>\n'+ 'x'.repeat(950),{by:'member',memberId:ids.owner,remaining:99,message:{text:'forged'}});status(result);assert.equal(result.data.message.by,'prospect');assert.ok(result.data.message.text.startsWith('<script>'));assert.equal(result.data.remaining,3);
});

await test('moving, replacing, or swapping either original participant makes cards, summaries, asks and answers unavailable',async()=>{
 const changes=[
  id=>db.query('UPDATE connection_state SET prospect_member_id=$2 WHERE invitation_hash=$1',[id,ids.other]),
  id=>db.query('UPDATE invitations SET sender_member_id=$2 WHERE token_hash=$1',[id,ids.other]),
  async id=>{await db.query('UPDATE invitations SET sender_member_id=$2 WHERE token_hash=$1',[id,ids.visitor]);await db.query('UPDATE connection_state SET prospect_member_id=$2 WHERE invitation_hash=$1',[id,ids.owner])}
 ];
 for(const change of changes){await reset();const id=await invite();status(await ask(id));const original=await states();await change(id);
  for(const as of ['owner','visitor','other']){status(await read(id,as),404);status(await answer(id,0,as),404);status(await ask(id,1,as),404);assert.deepEqual((await summary(as)).data.connections,[])}
  assert.deepEqual(await states(),original);assert.equal((await messages(id)).length,3);
 }
});

await test('all chat consent, lifecycle, moderation and recipient-binding guards apply to reads, answers and summaries',async()=>{
 const changes=[
  id=>db.query("UPDATE connection_state SET status='chatRequested' WHERE invitation_hash=$1",[id]),
  id=>db.query('UPDATE connection_state SET ended_at=now() WHERE invitation_hash=$1',[id]),
  id=>db.query("UPDATE invitations SET channel='friend' WHERE token_hash=$1",[id]),
  id=>db.query(`INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES($1,$2,'freeze',now())`,[ids.visitor,id]),
  id=>db.query(`INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES($1,$2,'unfreeze',now())`,[ids.owner,id]),
  ()=>db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.visitor,ids.owner]),
  ()=>db.query('UPDATE members SET blocked_at=now() WHERE id=$1',[ids.owner]),
  ()=>db.query("UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=$1",[ids.owner]),
  ()=>db.query('UPDATE members SET email_verified_at=NULL WHERE id=$1',[ids.owner]),
  id=>db.query('UPDATE invitations SET intended_member_id=$2 WHERE token_hash=$1',[id,ids.other]),
  id=>db.query("UPDATE invitations SET intended_email='other@example.com' WHERE token_hash=$1",[id])
 ];
 for(const change of changes){await reset();const id=await invite();status(await ask(id));await change(id);status(await read(id,'visitor'),404);status(await answer(id),404);assert.deepEqual((await summary('visitor')).data.connections,[]);assert.equal((await answered()).length,0)}
});

await test('answer write revalidates session, original role and lifecycle after participant/connection lock waits',async()=>{
 const changes=[
  ()=>db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.visitor,hash('rotated')]),
  ()=>db.query('UPDATE members SET email_verified_at=NULL WHERE id=$1',[ids.visitor]),
  ()=>db.query('UPDATE members SET blocked_at=now() WHERE id=$1',[ids.owner]),
  ()=>db.query("UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=$1",[ids.visitor]),
  id=>db.query("UPDATE connection_state SET status='ended' WHERE invitation_hash=$1",[id]),
  id=>db.query('UPDATE connection_state SET ended_at=now() WHERE invitation_hash=$1',[id]),
  id=>db.query("UPDATE invitations SET channel='friend' WHERE token_hash=$1",[id]),
  id=>db.query('UPDATE connection_state SET prospect_member_id=$2 WHERE invitation_hash=$1',[id,ids.other]),
  id=>db.query('UPDATE invitations SET sender_member_id=$2 WHERE token_hash=$1',[id,ids.other]),
  id=>db.query(`INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES($1,$2,'freeze',now())`,[ids.owner,id]),
  id=>db.query(`INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES($1,$2,'unfreeze',now())`,[ids.visitor,id]),
  ()=>db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.owner,ids.visitor]),
  async()=>{await db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.visitor,hash('unused-answer')]);await db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.owner,hash(tokens.visitor)])}
 ];
 for(const change of changes){await reset();const id=await invite();status(await ask(id));beforeTransaction=()=>change(id);status(await answer(id),409);assert.equal((await answered()).length,0);assert.equal((await messages(id)).length,3)}
 await reset();const id=await invite();status(await ask(id));afterLocks=tx=>tx.query('UPDATE members SET blocked_at=now() WHERE id=$1',[ids.owner]);status(await answer(id),409);assert.equal((await answered()).length,0);
});

await test('an answer arriving during the preflight wait wins once and repeat recovery returns the same result',async()=>{
 const id=await invite();status(await ask(id));let first;
 beforeTransaction=async()=>{first=await answer(id,0,'visitor','race-answer');status(first)};
 const replay=await answer(id,0,'visitor','race-answer');status(replay);assert.equal(replay.data.replayed,true);assert.deepEqual(replay.data.message,first.data.message);assert.equal((await messages(id)).length,4);
 const other=await invite();status(await ask(other));beforeTransaction=async()=>{status(await answer(other,0,'visitor','winner-answer','Winner'))};status(await answer(other,0,'visitor','loser-answer','Loser'),409);assert.equal(card(await read(other)).reply.text,'Winner');
});

await test('read and summary reauthorization stops reassigned session or newly hidden pair leaks',async()=>{
 const changes=[
  async()=>{await db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.visitor,hash('unused-read')]);await db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.other,hash(tokens.visitor)])},
  id=>db.query('UPDATE connection_state SET ended_at=now() WHERE invitation_hash=$1',[id]),
  id=>db.query('UPDATE connection_state SET prospect_member_id=$2 WHERE invitation_hash=$1',[id,ids.other])
 ];
 for(const change of changes){for(const summarize of [false,true]){await reset();const id=await invite();status(await ask(id));beforeRead={matches:text=>text.startsWith('WITH eligible AS'),run:()=>change(id)};
  const result=await (summarize?summary('visitor'):read(id,'visitor'));status(result,summarize?200:404);if(summarize)assert.deepEqual(result.data.connections,[]);else assert.equal('cards' in result.data,false)
 }}
});

await test('summary discovers incoming cards on unselected connections without exposing card content or contacts',async()=>{
 const first=await invite(),second=await invite(),unrelated=await invite({sender:'owner',prospect:'other'});
 status(await ask(first));status(await ask(first,1,'visitor'));status(await ask(second));status(await ask(unrelated));await level('visitor',1);
 let result=await summary('visitor');status(result);assert.equal(result.data.connections.length,2);
 assert.deepEqual(result.data.connections.find(row=>row.id===first),{id:first,pendingIncoming:1,pendingOutgoing:1});
 assert.deepEqual(result.data.connections.find(row=>row.id===second),{id:second,pendingIncoming:1,pendingOutgoing:0});
 for(const row of result.data.connections)assert.deepEqual(Object.keys(row).sort(),['id','pendingIncoming','pendingOutgoing']);privacy(result);assert.equal(JSON.stringify(result.data).includes(questions[0].text),false);
 status(await answer(first));result=await summary('visitor');assert.equal(result.data.connections.find(row=>row.id===first).pendingIncoming,0);
 await db.query(`INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES($1,$2,'freeze',now())`,[ids.owner,second]);assert.equal((await summary('visitor')).data.connections.length,1);
});

await test('answer statement and commit failures atomically roll back reply state and chat; retries remain usable',async()=>{
 for(const point of [2,3,'commit']){
  await reset();const id=await invite();status(await ask(id));const original=await states(),chat=await messages(id);failAt=point;
  const logger=console.error;let logged=false;console.error=(...args)=>{logged=true;assert.deepEqual(args,['Wildcard request failed.'])};
  let result;try{result=await answer(id,0,'visitor','rollback-answer')}finally{console.error=logger}
  status(result,500);assert.ok(logged);assert.deepEqual(await states(),original);assert.deepEqual(await messages(id),chat);
  result=await answer(id,0,'visitor','rollback-answer');status(result);assert.equal(result.data.replayed,false);assert.equal((await answered()).length,1);assert.equal((await messages(id)).length,4);
 }
});

await test('ask failures include pending-pair registration in rollback; migration preserves all existing rows',async()=>{
 for(const point of [2,3,'commit']){
  await reset();const id=await invite();failAt=point;const logger=console.error;console.error=()=>{};try{status(await ask(id),500)}finally{console.error=logger}
  assert.deepEqual(await states(),[]);assert.deepEqual(await ledger(),[]);assert.deepEqual(await messages(id),initialMessages);status(await ask(id));assert.equal((await states()).length,1);
 }
 const id=await invite();status(await ask(id));status(await answer(id));const original={asks:await ledger(),answers:await states(),chat:await messages(id)};
 const migration=fs.readFileSync(new URL('migrations/20261006_wildcard_answers.sql',root),'utf8');await db.exec(migration);await db.exec(migration);
 assert.deepEqual(await ledger(),original.asks);assert.deepEqual(await states(),original.answers);assert.deepEqual(await messages(id),original.chat);
 const constraints=(await db.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='connection_wildcard_answers'::regclass")).rows;
 assert.ok(constraints.some(row=>row.definition.includes('FOREIGN KEY (invitation_hash, question_id) REFERENCES connection_wildcard_asks')));assert.ok(constraints.some(row=>row.conname==='connection_wildcard_answer_request_once'));
 await assert.rejects(()=>db.query('UPDATE connection_wildcard_answers SET message=$2::jsonb WHERE invitation_hash=$1',[id,JSON.stringify({})]));
 await assert.rejects(()=>db.query('UPDATE connection_wildcard_answers SET request_id=NULL WHERE invitation_hash=$1',[id]));
 await assert.rejects(()=>db.query('UPDATE connection_wildcard_answers SET message=$2::jsonb WHERE invitation_hash=$1',[id,JSON.stringify({text:'x'.repeat(1001)})]));
 await assert.rejects(()=>db.query('UPDATE connection_wildcard_answers SET question_id=$2 WHERE invitation_hash=$1',[id,q(29)]));
 await db.query('DELETE FROM invitations WHERE token_hash=$1',[id]);assert.equal((await states()).filter(row=>row.invitation_hash===id).length,0);
});

await test('in-statement registration and chat-append failures cannot leave partial ask or answer state',async()=>{
 const id=await invite();
 await db.exec(`ALTER TABLE connection_wildcard_answers ADD CONSTRAINT synthetic_registration_failure CHECK(member_id<>'${ids.visitor}'::uuid)`);
 const logger=console.error;console.error=()=>{};
 try{status(await ask(id,0,'owner','registration-failure'),500)}finally{console.error=logger;await db.exec('ALTER TABLE connection_wildcard_answers DROP CONSTRAINT synthetic_registration_failure')}
 assert.deepEqual(await ledger(),[]);assert.deepEqual(await states(),[]);assert.deepEqual(await messages(id),initialMessages);
 status(await ask(id,0,'owner','registration-failure'));const original=await states();
 await db.exec('ALTER TABLE connection_state ADD CONSTRAINT synthetic_append_failure CHECK(jsonb_array_length(messages)<=3)');
 console.error=()=>{};
 try{status(await answer(id,0,'visitor','append-failure'),500)}finally{console.error=logger;await db.exec('ALTER TABLE connection_state DROP CONSTRAINT synthetic_append_failure')}
 assert.deepEqual(await states(),original);assert.equal((await messages(id)).length,3);
 const result=await answer(id,0,'visitor','append-failure','x'.repeat(1000));status(result);assert.equal(result.data.message.text.length,1000);assert.equal((await answered()).length,1);
});

await test('historical asks are preserved read-only in chat/quota and never gain guessed recipients or answers',async()=>{
 const id=await invite(),message={by:'member',text:questions[0].text,id:'legacy-ask',at:new Date().toISOString(),wildcardQuestionId:q(0),wildcardCategoryId:'everyday'};
 await db.query('INSERT INTO connection_wildcard_asks(invitation_hash,member_id,request_id,question_id,slot,message) VALUES($1,$2,$3,$4,1,$5::jsonb)',[id,ids.owner,'legacy-request',q(0),JSON.stringify(message)]);
 await db.query('UPDATE connection_state SET messages=messages||jsonb_build_array($2::jsonb) WHERE invitation_hash=$1',[id,JSON.stringify(message)]);
 const before=await ledger(),chat=await messages(id);
 for(const as of ['owner','visitor']){const result=await read(id,as);status(result);assert.deepEqual(result.data.cards,[]);assert.equal(result.data.legacyAskCount,1);assert.deepEqual((await summary(as)).data.connections,[])}
 assert.equal((await read(id)).data.remaining,2);status(await answer(id),404);status(await ask(id,0,'owner','legacy-request'));assert.deepEqual(await ledger(),before);assert.deepEqual(await messages(id),chat);assert.deepEqual(await states(),[]);
});

console.log(`Wildcard answers integration: ${passed} passed; ${failed} failed; ${transactions} SQL transactions; ${reads} reads`);
await db.close();if(failed)process.exitCode=1;
