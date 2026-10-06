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
globalThis.__wildcardsSql=sql;
const source=fs.readFileSync(new URL('api/wildcards.mjs',root),'utf8')
 .replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__wildcardsSql;')
 .replace(/from '\.\/(.*?)\.mjs'/g,(_,name)=>`from '${new URL('api/'+name+'.mjs',root).href}'`);
assert.ok(source.includes('const neon=()=>globalThis.__wildcardsSql;'));
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

await test('original catalog is stable, category-first, unscored and bounded',async()=>{
 assert.equal(WILDCARD_LIMIT,3);assert.equal(WILDCARD_CATEGORIES.length,5);
 assert.equal(new Set(questions.map(q=>q.id)).size,30);assert.equal(new Set(questions.map(q=>q.text)).size,30);
 for(const c of WILDCARD_CATEGORIES){assert.ok(c.title.length<40);assert.equal(c.questions.length,6);for(const item of c.questions){assert.match(item.id,/^wc-[a-z]+-\d+$/);assert.ok(item.text.length<200);assert.deepEqual(getWildcardQuestion(item.id),{...item,categoryId:c.id})}}
 for(const id of ['unknown','constructor','__proto__',null,3,{}])assert.equal(getWildcardQuestion(id),null);
});

await test('deployment configuration, signed-out requests and methods fail closed before database reads',async()=>{
 const names=['DATABASE_URL','CHEMPAT_REVIEW_DATA','CHEMPAT_RELEASE_MODE','VERCEL','VERCEL_PROJECT_ID','VERCEL_ENV','VERCEL_GIT_COMMIT_REF'];
 const saved=Object.fromEntries(names.map(k=>[k,process.env[k]])),before=reads;
 try{
  delete process.env.DATABASE_URL;status(await read('a'.repeat(64)),503);
  process.env.DATABASE_URL=saved.DATABASE_URL;for(const k of names.filter(k=>k!=='DATABASE_URL'))delete process.env[k];
  status(await call({headers:{'x-chempat-release-mode':'live','x-vercel-project-id':'prj_gtV01YIqkEfAfvdSbVopIfy2VpnJ'}}),503);
 }finally{for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
 for(const cookie of ['','chempat_member=bad','chempat_member='+tokens.owner.toUpperCase(),'chempat_session='+tokens.owner])status(await call({cookie}),401);
 for(const method of ['PUT','PATCH','DELETE'])status(await call({method}),405);
 assert.equal(reads,before);assert.equal((await ledger()).length,0);
});

await test('verified account cookies, member headers and outsider membership are authoritative',async()=>{
 const id=await invite();status(await call({cookie:'chempat_member='+'f'.repeat(64)}),403);
 for(const expected of [null,'',ids.visitor,'bad'])status(await call({body:{action:'ask',connectionId:id,questionId:q(0),requestId:'request-header'},headers:{'x-chempat-member-id':expected}}),403);
 status(await read(id,'owner',{headers:{'x-chempat-member-id':ids.visitor}}),403);
 status(await read(id,'owner',{headers:{'x-chempat-member-id':null}}));
 status(await read(id,'other'),404);status(await ask(id,0,'other'),404);
 status(await call({cookie:`chempat_member=${tokens.visitor}`,body:{action:'ask',connectionId:id,questionId:q(0),requestId:'request-staletab'}}),403);
 assert.equal((await ledger()).length,0);
});

await test('personal Level 3 unlocks three per connection without requiring partner Level 3',async()=>{
 const id=await invite();await level('visitor',1);
 let result=await read(id);status(result);assert.equal(result.data.eligible,true);assert.equal(result.data.remaining,3);assert.equal(result.data.categories.length,5);privacy(result);
 result=await read(id,'visitor');status(result);assert.equal(result.data.eligible,false);assert.equal(result.data.remaining,0);assert.deepEqual(result.data.categories,[]);
 status(await ask(id,0,'visitor'),409);status(await ask(id,0));
 await level('visitor',3);result=await read(id,'visitor');assert.equal(result.data.remaining,3);assert.deepEqual(result.data.usedQuestionIds,[q(0)]);
 for(const l of [0,1,2]){await level('owner',l);result=await read(id);assert.equal(result.data.eligible,false);status(await ask(id,1,'owner',undefined,{level:5,eligible:true,remaining:999}),409)}
 await db.query(`UPDATE members SET answers='[0,1,2,0,1,2,0,1,2,0]' WHERE id=$1`,[ids.owner]);assert.equal((await read(id)).data.eligible,false,'second-five legacy answers cannot unlock Level 3');
});

await test('all current and legacy open romantic chat states preserve normal connection fields',async()=>{
 for(const state of ['chat','secondResults','email','tests']){
  const id=await invite({status:state}),original=await core(id);const result=await ask(id);status(result);privacy(result);
  assert.deepEqual(await core(id),original);assert.deepEqual((await messages(id)).slice(0,2),initialMessages);
  assert.deepEqual((await messages(id))[2],result.data.message);assert.equal(result.data.message.by,'member');assert.equal(result.data.message.text,questions[0].text);
  assert.equal(result.data.message.wildcardQuestionId,q(0));assert.equal(result.data.message.wildcardCategoryId,WILDCARD_CATEGORIES[0].id);assert.ok(Date.parse(result.data.message.at));
  assert.match(result.data.message.id,/^wildcard:[a-f0-9]{64}$/);
 }
});

await test('level upgrades never bypass mutual chat, friend separation, identified pair or lifecycle consent',async()=>{
 for(const state of ['invited','firstResults','request','second','nextResults','chatRequested','ended','declined']){const id=await invite({status:state});status(await read(id),404);status(await ask(id),404)}
 for(const props of [{channel:'friend'},{prospect:null},{prospect:'owner'}]){const id=await invite(props);status(await read(id),404);status(await ask(id),404)}
 const changes=[
  id=>db.query('UPDATE connection_state SET ended_at=now() WHERE invitation_hash=$1',[id]),
  id=>db.query(`INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES($1,$2,'freeze',now())`,[ids.visitor,id]),
  id=>db.query(`INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES($1,$2,'unfreeze',now())`,[ids.owner,id]),
  ()=>db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.owner,ids.visitor]),
  ()=>db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.visitor,ids.owner]),
  ()=>db.query('UPDATE members SET blocked_at=now() WHERE id=$1',[ids.visitor]),
  ()=>db.query("UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=$1",[ids.visitor]),
  ()=>db.query('UPDATE members SET email_verified_at=NULL WHERE id=$1',[ids.visitor])
 ];
 for(const change of changes){await reset();const id=await invite();await change(id);status(await read(id),404);status(await ask(id),404);assert.equal((await ledger()).length,0)}
 for(const expr of ['email_verified_at=NULL','blocked_at=now()',"suspended_until=now()+interval '1 day'"]){await reset();const id=await invite();await db.exec(`UPDATE members SET ${expr} WHERE id='${ids.owner}'`);status(await read(id),403);status(await ask(id),403)}
 await reset();const id=await invite();await db.exec("UPDATE members SET suspended_until=now()-interval '1 day'");status(await read(id));
});

await test('reinvitation recipient binding remains enforced for the prospect',async()=>{
 const id=await invite();await db.query('UPDATE invitations SET intended_member_id=$2 WHERE token_hash=$1',[id,ids.other]);status(await read(id,'visitor'),404);status(await ask(id,0,'visitor'),404);
 await db.query("UPDATE invitations SET intended_member_id=NULL,intended_email='other@example.com' WHERE token_hash=$1",[id]);status(await ask(id,0,'visitor'),404);
 await db.query("UPDATE invitations SET intended_email='VISITOR@example.com' WHERE token_hash=$1",[id]);status(await ask(id,0,'visitor'));
});

await test('malformed, oversized, cross-origin and non-JSON writes make no changes',async()=>{
 const id=await invite(),before=transactions;
 for(const rawBody of ['{','null','[]','"string"'])status(await call({rawBody}),400);
 for(const query of ['', 'connection=bad','connection='+id.toUpperCase()])status(await call({query}),400);
 for(const extra of [{action:'reset'},{connectionId:'bad'},{questionId:'__proto__'},{questionId:'base-6'},{requestId:1},{requestId:'short'},{requestId:'x'.repeat(129)},{requestId:'bad request'}])status(await ask(id,0,'owner','request-malformed',extra),400);
 const body={action:'ask',connectionId:id,questionId:q(0),requestId:'request-headers'};
 status(await call({body,headers:{origin:'https://attacker.example'}}),403);
 status(await call({body,headers:{'content-type':'text/plain'}}),415);
 status(await call({body,headers:{'content-length':'4097'}}),413);
 status(await call({rawBody:JSON.stringify({...body,padding:'x'.repeat(4096)})}),413);
 const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('x'.repeat(4097)));controller.close()}});
 status(await call({rawBody:stream}),413);assert.equal(transactions,before);assert.deepEqual(await messages(id),initialMessages);assert.equal((await ledger()).length,0);
 status(await ask(id,0,'owner','request-canonical',{text:'Client text must not be sent',by:'prospect',categoryId:'forged',memberId:ids.visitor,remaining:999}));
 assert.equal((await messages(id))[2].text,questions[0].text);assert.equal((await messages(id))[2].by,'member');
});

await test('each member gets exactly three and questions are unique across the entire connection',async()=>{
 const id=await invite();
 for(let i=0;i<3;i++){const result=await ask(id,i);status(result);assert.equal(result.data.remaining,2-i);assert.equal(result.data.replayed,false)}
 let result=await ask(id,3);status(result,409);assert.equal(result.data.quotaReached,true);
 result=await ask(id,0,'visitor');status(result,409);assert.equal(result.data.usedQuestion,true);assert.equal(result.data.remaining,3);
 for(let i=3;i<6;i++){result=await ask(id,i,'visitor');status(result);assert.equal(result.data.remaining,5-i);assert.equal(result.data.message.by,'prospect')}
 result=await ask(id,6,'visitor');status(result,409);assert.equal(result.data.quotaReached,true);
 assert.equal((await ledger()).length,6);assert.equal((await messages(id)).length,8);
 for(const as of ['owner','visitor']){const data=(await read(id,as)).data;assert.equal(data.remaining,0);assert.equal(data.usedQuestionIds.length,6);assert.deepEqual(data.categories,WILDCARD_CATEGORIES,'fresh reads preserve question positions so the UI can mask all used IDs');assert.ok(data.usedQuestionIds.every(id=>data.categories.some(c=>c.questions.some(item=>item.id===id))))}
});

await test('new connections have separate allowances and can reuse questions from another connection',async()=>{
 const first=await invite(),second=await invite();for(let i=0;i<3;i++)status(await ask(first,i));
 const result=await ask(second,0);status(result);assert.equal(result.data.remaining,2);assert.equal((await read(first)).data.remaining,0);
 assert.equal((await messages(first)).length,5);assert.equal((await messages(second)).length,3);
});

await test('same request retries return the same message without spending twice, even after exhaustion',async()=>{
 const id=await invite(),first=await ask(id,0,'owner','retry-original');status(first);
 for(let i=0;i<3;i++){const again=await ask(id,0,'owner','retry-original');status(again);assert.equal(again.data.remaining,2);assert.equal(again.data.replayed,true);assert.deepEqual(again.data.message,first.data.message)}
 const conflict=await ask(id,1,'owner','retry-original');status(conflict,409);assert.equal(conflict.data.requestConflict,true);
 status(await ask(id,1));status(await ask(id,2));const exhaustedReplay=await ask(id,0,'owner','retry-original');status(exhaustedReplay);assert.equal(exhaustedReplay.data.remaining,0);assert.deepEqual(exhaustedReplay.data.message,first.data.message);
 status(await ask(id,3,'visitor','retry-original'));assert.equal((await messages(id)).length,6);assert.equal((await ledger()).length,4,'idempotency keys are scoped to each member');
});

await test('simultaneous distinct asks cannot overspend, and opposite-side identical questions emit once',async()=>{
 const id=await invite();const results=await Promise.all(Array.from({length:8},(_,i)=>ask(id,i,'owner',`parallel-${i}`)));
 assert.equal(results.filter(r=>r.status===200).length,3);assert.equal(results.filter(r=>r.status===409).length,5);assert.equal((await ledger()).length,3);assert.equal((await messages(id)).length,5);
 await reset();const pair=await invite();const same=await Promise.all([ask(pair,0,'owner','owner-question'),ask(pair,0,'visitor','visitor-question')]);
 assert.deepEqual(same.map(r=>r.status).sort(),[200,409]);assert.equal((await ledger()).length,1);assert.equal((await messages(pair)).length,3);
 const remaining=await Promise.all(['owner','visitor'].map(async as=>(await read(pair,as)).data.remaining));assert.equal(remaining.reduce((a,b)=>a+b),5);
});

await test('simultaneous identical request replays are successful but append only once',async()=>{
 const id=await invite(),results=await Promise.all(Array.from({length:5},()=>ask(id,0,'owner','same-request')));
 results.forEach(r=>status(r));assert.equal(results.filter(r=>!r.data.replayed).length,1);results.forEach(r=>assert.deepEqual(r.data.message,results[0].data.message));
 assert.equal((await ledger()).length,1);assert.equal((await messages(id)).length,3);
});

await test('committed competing asks between preflight and transaction are counted before allocating',async()=>{
 const id=await invite();status(await ask(id,0));status(await ask(id,1));
 beforeTransaction=async()=>{status(await ask(id,2,'owner','race-winner'))};const result=await ask(id,3,'owner','race-loser');status(result,409);assert.equal(result.data.quotaReached,true);assert.equal((await ledger()).length,3);
 await reset();const same=await invite();beforeTransaction=async()=>{status(await ask(same,0,'visitor','visitor-winner'))};const duplicate=await ask(same,0,'owner','owner-loser');status(duplicate,409);assert.equal(duplicate.data.usedQuestion,true);assert.equal(duplicate.data.remaining,3);
});

await test('session, standing, level, pair and lifecycle changes during lock waits prevent writes',async()=>{
 const restrictions=[
  ()=>db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.owner,hash('rotated')]),
  ()=>db.query('UPDATE members SET email_verified_at=NULL WHERE id=$1',[ids.owner]),
  ()=>db.query('UPDATE members SET blocked_at=now() WHERE id=$1',[ids.owner]),
  ()=>db.query("UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=$1",[ids.visitor]),
  ()=>level('owner',2),
  id=>db.query("UPDATE connection_state SET status='ended' WHERE invitation_hash=$1",[id]),
  id=>db.query('UPDATE connection_state SET ended_at=now() WHERE invitation_hash=$1',[id]),
  id=>db.query("UPDATE connection_state SET status='chatRequested' WHERE invitation_hash=$1",[id]),
  id=>db.query("UPDATE invitations SET channel='friend' WHERE token_hash=$1",[id]),
  id=>db.query('UPDATE connection_state SET prospect_member_id=$2 WHERE invitation_hash=$1',[id,ids.other]),
  id=>db.query('UPDATE invitations SET sender_member_id=$2 WHERE token_hash=$1',[id,ids.other]),
  id=>db.query(`INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES($1,$2,'freeze',now())`,[ids.visitor,id]),
  id=>db.query(`INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES($1,$2,'unfreeze',now())`,[ids.owner,id]),
  ()=>db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.visitor,ids.owner])
 ];
 for(const change of restrictions){await reset();const id=await invite();beforeTransaction=()=>change(id);status(await ask(id),409);assert.equal(beforeTransaction,null);assert.equal((await ledger()).length,0);assert.deepEqual(await messages(id),initialMessages)}
 // The actor's old token is transferred to the other person, not just removed.
 await reset();const id=await invite();beforeTransaction=async()=>{await db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.owner,hash('unused')]);await db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.visitor,hash(tokens.owner)])};
 status(await ask(id),409);assert.equal((await ledger()).length,0);assert.deepEqual(await messages(id),initialMessages);
});

await test('eligibility is revalidated by write statements, not only before acquiring locks',async()=>{
 const id=await invite();afterLocks=tx=>tx.query('UPDATE member_reward_state SET completed_level=2 WHERE member_id=$1',[ids.owner]);status(await ask(id),409);assert.equal((await ledger()).length,0);assert.deepEqual(await messages(id),initialMessages);
});

await test('read snapshot reauthorization stops session reassignment or lifecycle leaks',async()=>{
 const restrictions=[
  async()=>{await db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.owner,hash('unused-read')]);await db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.visitor,hash(tokens.owner)])},
  id=>db.query('UPDATE connection_state SET ended_at=now() WHERE invitation_hash=$1',[id]),
  ()=>db.query('UPDATE members SET blocked_at=now() WHERE id=$1',[ids.visitor])
 ];
 for(const change of restrictions){await reset();const id=await invite();status(await ask(id));beforeRead={matches:text=>text.startsWith('WITH eligible AS'),run:()=>change(id)};const result=await read(id);status(result,404);assert.equal('usedQuestionIds' in result.data,false);assert.equal('message' in result.data,false)}
});

await test('request replay cannot revive a frozen, blocked, or ended connection',async()=>{
 const id=await invite();status(await ask(id,0,'owner','before-ended'));await db.query("UPDATE connection_state SET status='ended',ended_at=now() WHERE invitation_hash=$1",[id]);status(await ask(id,0,'owner','before-ended'),404);
 assert.equal((await ledger()).length,1);assert.equal((await messages(id)).length,3);
});

await test('statement and commit failures roll back both the ledger and appended message; retry stays usable',async()=>{
 for(const point of [2,3,'commit']){
  await reset();const id=await invite();failAt=point;
  const original=console.error;let logged=false;console.error=(...args)=>{logged=true;assert.deepEqual(args,['Wildcard request failed.'],'do not log private SQL parameters')};
  let result;try{result=await ask(id,0,'owner','retry-rollback')}finally{console.error=original}
  status(result,500);assert.ok(logged);assert.deepEqual(await ledger(),[]);assert.deepEqual(await messages(id),initialMessages);assert.equal((await read(id)).data.remaining,3);
  result=await ask(id,0,'owner','retry-rollback');status(result);assert.equal(result.data.replayed,false);assert.equal(result.data.remaining,2);assert.equal((await messages(id)).length,3);
 }
});

await test('additive migration is repeatable and unique/check/FK constraints bound the ledger',async()=>{
 const id=await invite();status(await ask(id));const before=await ledger(),chat=await messages(id),migration=fs.readFileSync(new URL('migrations/20261006_connection_wildcards.sql',root),'utf8');
 await db.exec(migration);await db.exec(migration);assert.deepEqual(await ledger(),before);assert.deepEqual(await messages(id),chat);
 const insert=(member,request,question,slot,message='{}',connection=id)=>db.query('INSERT INTO connection_wildcard_asks(invitation_hash,member_id,request_id,question_id,slot,message) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[connection,member,request,question,slot,message]);
 await assert.rejects(()=>insert(ids.owner,'another-request',q(1),1),'member slot unique');
 await assert.rejects(()=>insert(ids.visitor,'another-request',q(0),1),'question unique across pair');
 await assert.rejects(()=>insert(ids.owner,before[0].request_id,q(1),2),'request unique per member');
 for(const slot of [0,4])await assert.rejects(()=>insert(ids.owner,'invalid-slot',q(1),slot));
 await assert.rejects(()=>insert(ids.owner,'short',q(1),2));await assert.rejects(()=>insert(ids.owner,'invalid-question','forged',2));await assert.rejects(()=>insert(ids.owner,'invalid-message',q(1),2,'[]'));
 await assert.rejects(()=>insert('ffffffff-ffff-4fff-8fff-ffffffffffff','missing-member',q(1),2));await assert.rejects(()=>insert(ids.owner,'missing-connection',q(1),2,'{}','f'.repeat(64)));
 const constraints=(await db.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='connection_wildcard_asks'::regclass")).rows;
 assert.ok(constraints.some(c=>c.conname==='connection_wildcard_question_once'));assert.ok(constraints.some(c=>c.conname==='connection_wildcard_member_slot'));assert.equal(constraints.filter(c=>c.definition.includes('ON DELETE CASCADE')).length,2);
 await db.query('DELETE FROM invitations WHERE token_hash=$1',[id]);assert.deepEqual(await ledger(),[],'existing cascade lifecycle applies');
});

console.log(`Wildcards integration: ${passed} passed; ${failed} failed; ${transactions} SQL transactions; ${reads} reads`);
await db.close();if(failed)process.exitCode=1;
