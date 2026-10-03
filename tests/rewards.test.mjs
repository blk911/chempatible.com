// Real rewards SQL against disposable local PostgreSQL. This suite never uses
// deployed databases, real accounts, mail providers, or external network calls.
process.env.CHEMPAT_REVIEW_DATA = 'isolated-confirmed';
process.env.DATABASE_URL = 'postgres://local-rewards-tests-only';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

const db = new PGlite();
const root = new URL('../', import.meta.url);
for (let pass = 0; pass < 2; pass++) {
  await db.exec(fs.readFileSync(new URL('schema.sql', root), 'utf8'));
  await db.exec('ALTER TABLE members ADD COLUMN IF NOT EXISTS email_verified_at timestamptz');
  for (const name of fs.readdirSync(new URL('migrations/', root)).filter(x => x.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(new URL('migrations/' + name, root), 'utf8'));
  }
}
const hash = value => createHash('sha256').update(value).digest('hex');
const ids = {owner:'11111111-1111-4111-8111-111111111111', visitor:'22222222-2222-4222-8222-222222222222', other:'33333333-3333-4333-8333-333333333333'};
const tokens = {owner:'a'.repeat(64), visitor:'b'.repeat(64), other:'c'.repeat(64)};
const photo = 'data:image/jpeg;base64,AA==';
const firstFive = [0,1,2,0,1];
const tenAnswers = [...firstFive,2,0,1,2,0];
const phones = {owner:'+12025550111',visitor:'+12025550222',other:'+12025550333'};
const answersFor = (level,choice=0) => Object.fromEntries(Array.from({length:5},(_,index)=>[level===2?`base-${index+6}`:`r${level}-${index+1}`,choice]));
const partialFor = level => Object.fromEntries(Object.entries(answersFor(level)).slice(0,2));

// Keep Neon statement ordering/transactions intact while running actual SQL.
const template = (strings,values) => {
  assert.ok(Array.isArray(strings.raw),'Neon-compatible SQL template');
  return {text:strings.reduce((out,part,index)=>out+(index?`$${index}`:'')+part,''),values};
};
const run = async(executor,statement)=>(await executor.query(statement.text,statement.values)).rows;
let beforeTransaction=null,beforeRead=null,failTransactionAt=null;
let transactionCount=0,queryCount=0;
async function query(statement) {
  queryCount++;
  if(beforeRead&&beforeRead.matches(statement.text)) {const hook=beforeRead;beforeRead=null;await hook.run()}
  return run(db,statement);
}
const sql=(strings,...values)=>query(template(strings,values));
sql.query=(text,values=[])=>query({text,values});
sql.transaction=async(callback,options)=>{
  assert.equal(options?.isolationLevel,'ReadCommitted');
  transactionCount++;
  if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;await hook()}
  return db.transaction(async executor=>{
    const tx=(strings,...values)=>template(strings,values);
    tx.query=(text,values=[])=>({text,values});
    const statements=callback(tx);
    assert.ok(Array.isArray(statements));
    assert.match(statements[0].text,/members[\s\S]*FOR UPDATE/,'member rows lock before reward mutations');
    assert.match(statements[0].text,/ORDER BY id FOR UPDATE/,'all participants use stable member lock ordering');
    const results=[];
    for(let index=0;index<statements.length;index++){
      if(failTransactionAt===index){failTransactionAt=null;throw Error('Synthetic rewards transaction failure')}
      results.push(await run(executor,statements[index]));
    }
    if(failTransactionAt==='commit'){failTransactionAt=null;throw Error('Synthetic rewards commit failure')}
    return results;
  });
};
globalThis.__rewardsSql=sql;
async function loadApi(name){
  const source=fs.readFileSync(new URL(`api/${name}.mjs`,root),'utf8')
    .replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__rewardsSql;')
    .replace(/from '\.\/(.*?)\.mjs'/g,(_,dependency)=>`from '${new URL(`api/${dependency}.mjs`,root).href}'`);
  assert.ok(source.includes('const neon=()=>globalThis.__rewardsSql;'),'real API uses the isolated SQL adapter');
  return (await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
}
const rewards=await loadApi('rewards'),connection=await loadApi('connection');
const {REWARDS,REWARD_ROUNDS,getRewardRound,validRewardAnswers}=await import(new URL('api/_reward-rounds.mjs',root));
globalThis.fetch=async()=>{throw Error('Unexpected external request in isolated rewards test')};

let sequence=0;
async function invite({sender='owner',prospect='visitor',status='chat',channel='email'}={}){
  const id=hash('isolated-rewards-'+(++sequence));
  await sql`INSERT INTO invitations(token_hash,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,sender_member_id,channel,expires_at) VALUES(${id},${`${sender}@example.com`},${sender},${photo},'[0,1,2,0,1]'::jsonb,'Private recipient','recipient@example.com',${ids[sender]},${channel},now()+interval '1 day')`;
  await sql`INSERT INTO connection_state(invitation_hash,prospect_member_id,prospect_name,prospect_photo,prospect_answers,prospect_email,prospect_phone,status,messages) VALUES(${id},${ids[prospect]||null},'Private prospect',${photo},'[1,2,0,1,2]'::jsonb,'legacy-email@example.com','legacy-private-phone',${status},'[{"by":"member","text":"Existing private conversation"}]'::jsonb)`;
  return id;
}
async function call({as='owner',body,query='',cookie,method,rawBody,headers={},api=rewards}={}){
  const requestHeaders={cookie:cookie??(as?`chempat_member=${tokens[as]}`:''),'content-type':'application/json',...(ids[as]?{'x-chempat-member-id':ids[as]}:{})};
  for(const [name,value] of Object.entries(headers)){if(value===null||value===undefined)delete requestHeaders[name];else requestHeaders[name]=value}
  const response=await api.fetch(new Request('https://isolated.example/api/rewards?'+query,{
    method:method||(body===undefined&&rawBody===undefined?'GET':'POST'),
    headers:requestHeaders,
    ...((body===undefined&&rawBody===undefined)?{}:{body:rawBody??JSON.stringify(body)}),
    ...(rawBody instanceof ReadableStream?{duplex:'half'}:{})
  }));
  assert.equal(response.headers.get('cache-control'),'no-store','private responses must not cache');
  return {status:response.status,data:await response.json()};
}
const read=(as='owner',id)=>call({as,query:id===undefined?'':'connection='+id});
const status=(result,expected=200,label='')=>assert.equal(result.status,expected,`${label}: ${JSON.stringify(result.data)}`);
async function action(operation,level,as='owner',extra={}){
  const body={action:operation,level,answers:answersFor(level),...extra};
  if(['save','complete'].includes(operation)&&!Object.hasOwn(extra,'draftRevision'))body.draftRevision=(await read(as)).data.draftRevision;
  return call({as,body});
}
async function complete(level,as='owner',extra={}){const result=await action('complete',level,as,extra);status(result,200,`complete level ${level}`);return result}
async function advance(level,as='owner'){
  let result=await read(as);status(result);
  while(result.data.level<level)result=await complete(result.data.level+1,as);
  return result;
}
const offer=(id,as='owner',phone=phones[as],extra={})=>call({as,body:{action:'offerPhone',connectionId:id,phone,...extra}});
const withdraw=(id,as='owner')=>call({as,body:{action:'withdrawPhone',connectionId:id}});
const messages=async id=>(await sql`SELECT messages FROM connection_state WHERE invitation_hash=${id}`)[0].messages;
const rewardTables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE '%reward%' OR tablename LIKE '%phone%') ORDER BY tablename")).rows.map(row=>row.tablename);
async function snapshot(){
  const result={};
  for(const table of rewardTables)result[table]=(await db.query(`SELECT * FROM ${table} ORDER BY 1,2`)).rows;
  result.members=(await db.query('SELECT id,answers,name,contact,photo FROM members ORDER BY id')).rows;
  return result;
}
async function core(id){return (await sql`SELECT c.status,c.prospect_answers,c.prospect_email,c.prospect_phone,i.sender_answers,i.sender_email,m.contact,m.photo,m.name FROM connection_state c JOIN invitations i ON i.token_hash=c.invitation_hash JOIN members m ON m.id=i.sender_member_id WHERE c.invitation_hash=${id}`)[0]}
async function setBase(as,answers){await sql`UPDATE members SET answers=${JSON.stringify(answers)}::jsonb WHERE id=${ids[as]}`}
async function reset(){
  assert.equal(beforeTransaction,null,'write race hook ran');assert.equal(beforeRead,null,'read race hook ran');failTransactionAt=null;
  await db.exec('DELETE FROM invitations;DELETE FROM members');
  for(const [name,id] of Object.entries(ids))await sql`INSERT INTO members(id,session_hash,name,contact,photo,answers,email_verified_at) VALUES(${id},${hash(tokens[name])},${name},${`${name}@example.com`},${photo},${JSON.stringify(firstFive)}::jsonb,now())`;
}
function privateView(result){
  const encoded=JSON.stringify(result.data);
  for(const secret of ['session_hash','recipient@example.com','legacy-email@example.com','legacy-private-phone','Private recipient','Private prospect','Existing private conversation','data:image/'])assert.equal(encoded.includes(secret),false,'private unrelated field: '+secret);
}
let passed=0;const failures=[];
async function test(name,runTest){
  try{await reset();await runTest();passed++;console.log('ok - '+name)}
  catch(error){failures.push({name,error});console.error('FAIL - '+name+'\n'+error.stack);beforeTransaction=null;beforeRead=null;failTransactionAt=null}
}

await test('authentication, session cookies, revoked sessions, and supported methods fail closed',async()=>{
  for(const cookie of ['',`chempat_session=${tokens.owner}`,'chempat_member=bad',`chempat_member=${tokens.owner.toUpperCase()}`])status(await call({cookie}),401);
  status(await call({cookie:'chempat_member='+'d'.repeat(64)}),403);
  status(await call({cookie:`extra=1; chempat_member=${tokens.owner}; another=2`}));
  for(const method of ['PUT','PATCH','DELETE'])status(await call({method}),405);
  await sql`UPDATE members SET session_hash=${hash('rotated-session')} WHERE id=${ids.owner}`;
  status(await read(),403);status(await action('complete',2,'owner',{draftRevision:0}),403);
});

await test('account-bound headers prevent stale tabs from acting or reading as a different signed-in member',async()=>{
  const before=await snapshot(),transactions=transactionCount,body={action:'complete',level:2,answers:answersFor(2),draftRevision:0};
  for(const expected of [null,'',ids.visitor,'not-a-member'])status(await call({body,headers:{'x-chempat-member-id':expected}}),403,'missing or mismatched POST account binding');
  status(await call({body,cookie:`chempat_member=${tokens.visitor}`}),403,'owner tab with visitor cookie cannot complete visitor answers');
  status(await call({cookie:`chempat_member=${tokens.visitor}`}),403,'owner tab with visitor cookie cannot read visitor answers');
  status(await call({headers:{'x-chempat-member-id':ids.visitor}}),403,'mismatched explicit GET account');
  status(await call({headers:{'x-chempat-member-id':null}}),200,'direct GETs may omit the binding');
  assert.equal(transactionCount,transactions);assert.deepEqual(await snapshot(),before);
  status(await call({body}));assert.equal((await read()).data.level,2);assert.equal((await read('visitor')).data.level,1);
  const id=await invite();await advance(2,'visitor');const consentBefore=await snapshot(),oldMessages=await messages(id);
  for(const operation of ['offerPhone','withdrawPhone'])status(await call({cookie:`chempat_member=${tokens.visitor}`,body:{action:operation,connectionId:id,phone:phones.owner}}),403,'stale account tab cannot change phone consent');
  assert.deepEqual(await snapshot(),consentBefore);assert.deepEqual(await messages(id),oldMessages);
});

await test('four original five-question rounds have stable unique IDs and strict choices',async()=>{
  assert.equal(REWARDS.length,5);assert.deepEqual(REWARD_ROUNDS.map(round=>round.level),[2,3,4,5]);
  const allIds=[];
  for(const round of REWARD_ROUNDS){
    assert.equal(getRewardRound(round.level),round);assert.equal(round.questions.length,5);assert.equal(round.reward,REWARDS[round.level-1]);
    assert.deepEqual(round.questions.map(question=>question.id),Object.keys(answersFor(round.level)));
    for(const question of round.questions){assert.ok(question.text);assert.deepEqual(question.choices.map(choice=>choice.value),[0,1,2]);assert.ok(question.choices.every(choice=>choice.label));allIds.push(question.id)}
    for(const choice of [0,1,2])assert.equal(validRewardAnswers(round,answersFor(round.level,choice),true),true);
    assert.equal(validRewardAnswers(round,{},false),true);assert.equal(validRewardAnswers(round,{},true),false);
    assert.equal(validRewardAnswers(round,Object.assign(Object.create({inherited:0}),answersFor(round.level)),true),false);
    const getterAnswers={...answersFor(round.level)};Object.defineProperty(getterAnswers,round.questions[0].id,{get(){throw Error('Question getters must never be executed')},enumerable:true});
    assert.equal(validRewardAnswers(round,getterAnswers,true),false);
    assert.equal(validRewardAnswers(round,{...answersFor(round.level),[Symbol('hidden')]:0},true),false);
  }
  assert.equal(new Set(allIds).size,20);assert.equal(getRewardRound(0),null);assert.equal(getRewardRound('2'),null);
});

await test('repeatable additive migrations enforce reward, revision, consent, and event constraints',async()=>{
  for(const table of ['member_reward_state','reward_connection_events','reward_phone_offers'])assert.ok(rewardTables.includes(table));
  const id=await invite();
  for(const answers of ['[]','null','1'])await assert.rejects(()=>sql`INSERT INTO member_reward_state(member_id,answers) VALUES(${ids.owner},${answers}::jsonb)`);
  for(const completed of [-1,6])await assert.rejects(()=>sql`INSERT INTO member_reward_state(member_id,completed_level) VALUES(${ids.owner},${completed})`);
  await assert.rejects(()=>sql`INSERT INTO member_reward_state(member_id,revision) VALUES(${ids.owner},-1)`);
  await assert.rejects(()=>sql`INSERT INTO reward_phone_offers(invitation_hash,member_id,phone) VALUES(${id},${ids.owner},'not a phone')`);
  await assert.rejects(()=>sql`INSERT INTO reward_connection_events(invitation_hash,member_id,event_key) VALUES(${id},${ids.owner},'forged-level')`);
  status(await complete(2));status(await complete(2,'visitor'));status(await offer(id));
  const before=await snapshot(),migration=fs.readFileSync(new URL('migrations/20261003_member_rewards.sql',root),'utf8');await db.exec(migration);await db.exec(migration);
  assert.deepEqual(await snapshot(),before,'rerunning the migration changes no saved state');
});

await test('deployment review and database configuration fail before private reads or writes',async()=>{
  const oldDatabase=process.env.DATABASE_URL,oldReview=process.env.CHEMPAT_REVIEW_DATA;
  const reads=queryCount,transactions=transactionCount;
  try{
    delete process.env.DATABASE_URL;status(await read(),503);status(await action('complete',2,'owner',{draftRevision:0}),503);
    process.env.DATABASE_URL=oldDatabase;delete process.env.CHEMPAT_REVIEW_DATA;
    status(await read(),503);status(await action('complete',2,'owner',{draftRevision:0}),503);
    assert.equal(queryCount,reads);assert.equal(transactionCount,transactions);
  }finally{process.env.DATABASE_URL=oldDatabase;process.env.CHEMPAT_REVIEW_DATA=oldReview}
});

await test('levels one and two use actual saved base answers and ignore client projections',async()=>{
  let result=await read();status(result);assert.equal(result.data.level,1);assert.equal(result.data.nextLevel,2);assert.equal(result.data.draftRevision,0);privateView(result);
  assert.ok(Array.isArray(result.data.rounds));assert.equal(result.data.rounds.length,4);
  result=await call({query:'level=5&completed=true&memberId='+ids.visitor});status(result);assert.equal(result.data.level,1);
  await setBase('owner',tenAnswers);result=await read();status(result);assert.equal(result.data.level,2);assert.equal(result.data.nextLevel,3);
  await setBase('owner',firstFive);assert.equal((await read()).data.level,1,'base progress is not inferred from client flags');
  for(const answers of [[],[0,1,2,0]]){await setBase('owner',answers);result=await read();assert.equal(result.data.level,0);assert.equal(result.data.nextLevel,1);status(await action('complete',2),409,'first five cannot be skipped')}
  assert.equal((await db.query('SELECT count(*)::integer AS total FROM member_reward_state')).rows[0].total,0,'GET does not invent personal progress');
});

await test('malformed requests, unknown question keys, bad choices, and revisions cannot change progress',async()=>{
  const before=await snapshot();
  for(const rawBody of ['{','null','[]','"string"'])status(await call({rawBody}),400);
  for(const body of [{action:'delete'},{action:'complete',level:1,answers:{}},{action:'complete',level:6,answers:{}},{action:'complete',level:'2',answers:answersFor(2)}])status(await call({body}),400);
  for(const level of [2,3,4,5]){
    if(level>2)await advance(level-1);
    const original=await snapshot(),key=Object.keys(answersFor(level))[0];
    const invalid=[undefined,null,[],1,'answers',{unknown:0},{...answersFor(level),[key]:null},{...answersFor(level),[key]:-1},{...answersFor(level),[key]:3},{...answersFor(level),[key]:'0'},{...answersFor(level),[key]:false},{...answersFor(level),[key]:0.5},{...answersFor(level),unknown:1}];
    for(const answers of invalid)for(const operation of ['save','complete'])status(await action(operation,level,'owner',{answers}),400,`${operation} malformed answers`);
    for(const draftRevision of [undefined,null,'0',-1,0.5,{},[],2147483647,Number.MAX_SAFE_INTEGER])for(const operation of ['save','complete'])status(await action(operation,level,'owner',{draftRevision}),400,`${operation} malformed revision`);
    status(await action('complete',level,'owner',{answers:partialFor(level)}),400,'five answers are required');
    assert.deepEqual(await snapshot(),original,'invalid payloads never write');
  }
  assert.deepEqual(before.members.map(member=>member.id),(await snapshot()).members.map(member=>member.id));
});

await test('bounded body parsing rejects oversized byte streams and forged content lengths without writes',async()=>{
  const before=await snapshot(),body={action:'complete',level:2,answers:answersFor(2),draftRevision:0};
  for(const length of ['-1','garbage','1.5','16385','999999999999999999999999'])status(await call({body,headers:{'content-length':length}}),413);
  status(await call({rawBody:JSON.stringify({...body,padding:'x'.repeat(17000)})}),413);
  status(await call({rawBody:JSON.stringify({...body,padding:'🐾'.repeat(5000)}),headers:{'content-length':'1'}}),413,'byte limit, not JavaScript character count');
  let cancelled=false;
  const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(4096).fill(120))},cancel(){cancelled=true}});
  status(await call({rawBody:stream}),413);assert.equal(cancelled,true,'oversized chunked input is cancelled promptly');
  assert.deepEqual(await snapshot(),before);
  status(await call({body,headers:{'content-length':'1'}}));
});

await test('reward mutations reject foreign origins and non-JSON content types',async()=>{
  const body={action:'complete',level:2,answers:answersFor(2),draftRevision:0},before=await snapshot(),transactions=transactionCount;
  for(const origin of ['https://unrelated.example','null','https://isolated.example.evil.example'])status(await call({body,headers:{origin}}),403);
  for(const type of ['text/plain','application/x-www-form-urlencoded','multipart/form-data'])status(await call({body,headers:{'content-type':type}}),415);
  assert.equal(transactionCount,transactions);assert.deepEqual(await snapshot(),before);
  status(await call({body,headers:{origin:'https://isolated.example','content-type':'application/json; charset=utf-8'}}));
});

await test('progression cannot skip rounds and drafts are private, resumable, and revisioned',async()=>{
  const before=await snapshot();
  for(const level of [3,4,5])for(const operation of ['save','complete'])status(await action(operation,level),409,'cannot skip rounds');
  assert.deepEqual(await snapshot(),before);
  let result=await action('save',2,'owner',{answers:partialFor(2)});status(result);assert.equal(result.data.level,1);assert.equal(result.data.draftRevision,1);
  assert.deepEqual((await read()).data.answers,partialFor(2));assert.deepEqual((await read('visitor')).data.answers,{});
  assert.deepEqual((await sql`SELECT answers FROM members WHERE id=${ids.owner}`)[0].answers,firstFive,'partial round two is not published into base answers');
  result=await complete(2);assert.equal(result.data.level,2);assert.equal(result.data.nextLevel,3);assert.equal(result.data.draftRevision,2);
  assert.deepEqual((await sql`SELECT answers FROM members WHERE id=${ids.owner}`)[0].answers,[...firstFive,0,0,0,0,0]);
  for(const level of [3,4,5]){
    const previous=result.data.draftRevision;
    result=await action('save',level,'owner',{answers:partialFor(level)});status(result);assert.equal(result.data.level,level-1);assert.equal(result.data.draftRevision,previous+1);
    result=await complete(level);assert.equal(result.data.level,level);assert.equal(result.data.draftRevision,previous+2);
    assert.equal((await read('visitor')).data.level,1,'progress belongs only to the authenticated member');
  }
  assert.equal(result.data.nextLevel,null);assert.equal(result.data.nextReward,null);
  const stored=(await db.query('SELECT completed_level,answers,revision FROM member_reward_state WHERE member_id=$1',[ids.owner])).rows[0];
  assert.equal(stored.completed_level,5);assert.equal(stored.revision,result.data.draftRevision);assert.equal(Object.keys(stored.answers).length,20);
  if(rewardTables.includes('reward_directory_profile'))assert.equal((await db.query('SELECT count(*)::integer AS total FROM reward_directory_profile')).rows[0].total,0,'earning photo/video eligibility never opts a member into discovery or publishes media');
});

await test('final answers and levels are server-owned; completed earlier rounds stay immutable',async()=>{
  const result=await complete(2,'owner',{memberId:ids.visitor,score:999,completed:true,completedLevel:5,upgraded:true,shared:true,result:{text:'FORGED REWARD'}});
  assert.equal(result.data.level,2);assert.equal((await read('visitor')).data.level,1);
  const before=await snapshot();
  status(await action('save',2,'owner',{answers:answersFor(2,2)}),409);
  status(await action('complete',2,'owner',{answers:answersFor(2,2),draftRevision:0}));
  assert.deepEqual(await snapshot(),before,'repeat completion does not overwrite answers or bump the revision');
  await complete(3);const after=await snapshot();
  status(await action('save',2,'owner',{answers:answersFor(2,1)}),409);
  status(await action('complete',2,'owner',{answers:answersFor(2,1),draftRevision:0}));
  assert.deepEqual(await snapshot(),after,'completed old rounds never regress higher progress');
  assert.equal(JSON.stringify(after).includes('FORGED REWARD'),false);
});

await test('CAS rejects stale saves and completions without overwriting drafts or earning a level',async()=>{
  for(const operation of ['save','complete']){
    await reset();status(await action('save',2,'owner',{answers:partialFor(2),draftRevision:0}));
    const newer=await action('save',2,'owner',{answers:answersFor(2,1),draftRevision:1});status(newer);assert.equal(newer.data.draftRevision,2);
    const before=await snapshot();status(await action(operation,2,'owner',{answers:answersFor(2,2),draftRevision:1}),409);
    assert.deepEqual(await snapshot(),before);assert.deepEqual((await read()).data.answers,answersFor(2,1));assert.equal((await read()).data.level,1);
  }
  await reset();const before=await snapshot();
  for(const operation of ['save','complete'])status(await action(operation,2,'owner',{draftRevision:10}),409,'missing state cannot accept an invented revision');
  assert.deepEqual(await snapshot(),before);
});

await test('a newer draft while a request waits for its lock wins over stale save and complete',async()=>{
  for(const operation of ['save','complete']){
    await reset();status(await action('save',2,'owner',{answers:partialFor(2),draftRevision:0}));
    let protectedData;
    beforeTransaction=async()=>{status(await action('save',2,'owner',{answers:answersFor(2,2),draftRevision:1}));protectedData=await snapshot()};
    status(await action(operation,2,'owner',{answers:answersFor(2,1),draftRevision:1}),409);
    assert.equal(beforeTransaction,null);assert.deepEqual(await snapshot(),protectedData);
  }
});

await test('verified account standing is enforced for personal progress',async()=>{
  for(const change of ['email_verified_at=NULL','blocked_at=now()',"suspended_until=now()+interval '1 day'"]){
    await reset();await db.exec(`UPDATE members SET ${change} WHERE id='${ids.owner}'`);
    status(await read(),403);status(await action('save',2,'owner',{draftRevision:0}),403);status(await action('complete',2,'owner',{draftRevision:0}),403);
  }
  await reset();await sql`UPDATE members SET suspended_until=now()-interval '1 day' WHERE id=${ids.owner}`;status(await read());status(await complete(2));
});

await test('session rotation and standing changes after validation prevent personal writes',async()=>{
  const changes=[
    ['rotated session',async()=>sql`UPDATE members SET session_hash=${hash('race-session')} WHERE id=${ids.owner}`],
    ['lost verification',async()=>sql`UPDATE members SET email_verified_at=NULL WHERE id=${ids.owner}`],
    ['blocked member',async()=>sql`UPDATE members SET blocked_at=now() WHERE id=${ids.owner}`],
    ['suspended member',async()=>sql`UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=${ids.owner}`]
  ];
  for(const operation of ['save','complete'])for(const [label,change] of changes){
    await reset();const before=await snapshot();beforeTransaction=change;
    status(await action(operation,2,'owner',{draftRevision:0}),409,operation+' / '+label);
    assert.equal(beforeTransaction,null);assert.deepEqual(await snapshot(),before,label+' cannot advance progress');
  }
});

await test('a token reassigned during lock waits never retargets personal progress or phone consent',async()=>{
  const reassign=async()=>{
    await sql`UPDATE members SET session_hash=${hash('unused-owner-session')} WHERE id=${ids.owner}`;
    await sql`UPDATE members SET session_hash=${hash(tokens.owner)} WHERE id=${ids.visitor}`;
  };
  for(const [operation,level] of [['save',2],['complete',2],['complete',3],['offerPhone',null],['withdrawPhone',null]]){
    await reset();const id=await invite();
    if(level===3||level===null){await advance(2);await advance(2,'visitor')}
    if(operation==='withdrawPhone')status(await offer(id,'visitor'));
    const before=await snapshot(),oldMessages=await messages(id),revision=(await read()).data.draftRevision;
    beforeTransaction=reassign;
    const body=level===null?{action:operation,connectionId:id,phone:phones.owner}:{action:operation,level,answers:answersFor(level),draftRevision:revision};
    status(await call({body}),409,operation+' after token reassignment');assert.equal(beforeTransaction,null);
    assert.deepEqual(await snapshot(),before,'same token cannot write into the newly signed-in account');assert.deepEqual(await messages(id),oldMessages,'no upgrade note for a substituted actor');
    const profiles=(await db.query('SELECT id,session_hash FROM members ORDER BY id')).rows;
    assert.equal(profiles.find(member=>member.id===ids.visitor).session_hash,hash(tokens.owner),'fixture really transfers the original token to the other member');
  }
});

await test('phone sharing requires both saved level two and two explicit offers',async()=>{
  const id=await invite(),original=await core(id);
  status(await offer(id),409);await complete(2);status(await offer(id),409,'counterpart needs level two');await complete(2,'visitor');
  let result=await read('owner',id);status(result);privateView(result);assert.equal(result.data.connection.phone.shared,false);
  result=await offer(id);status(result);assert.equal(result.data.connection.phone.ownOffered,true);assert.equal(result.data.connection.phone.otherOffered,false);assert.equal(result.data.connection.phone.shared,false);
  result=await read('visitor',id);status(result);assert.equal(result.data.connection.phone.ownOffered,false);assert.equal(result.data.connection.phone.otherOffered,true);assert.equal(result.data.connection.phone.shared,false);assert.equal(JSON.stringify(result.data).includes(phones.owner),false,'unilateral phone never leaks to counterpart');
  result=await offer(id,'visitor');status(result);assert.equal(result.data.connection.phone.shared,true);assert.equal(result.data.connection.phone.otherPhone,phones.owner);assert.equal(result.data.connection.phone.ownPhone,phones.visitor);
  result=await read('owner',id);assert.equal(result.data.connection.phone.otherPhone,phones.visitor);assert.equal(result.data.connection.phone.ownPhone,phones.owner);privateView(result);
  assert.deepEqual(await core(id),original,'phone consent leaves email, legacy phones, and relationship state untouched');
});

await test('phone withdrawal immediately hides both directions and each connection needs its own offer',async()=>{
  const first=await invite(),second=await invite({prospect:'other'});for(const as of ['owner','visitor','other'])await advance(2,as);
  status(await offer(first));status(await offer(first,'visitor'));
  let result=await read('owner',second);status(result);assert.equal(result.data.connection.phone.shared,false);assert.equal(result.data.connection.phone.ownOffered,false);
  assert.equal(JSON.stringify(result.data).includes(phones.visitor),false);
  result=await withdraw(first);status(result);assert.equal(result.data.connection.phone.shared,false);assert.equal(result.data.connection.phone.ownOffered,false);assert.equal(JSON.stringify(result.data).includes(phones.visitor),false);
  result=await read('visitor',first);assert.equal(result.data.connection.phone.shared,false);assert.equal(result.data.connection.phone.otherOffered,false);assert.equal(JSON.stringify(result.data).includes(phones.owner),false);
  status(await withdraw(first));status(await offer(first));assert.equal((await read('owner',first)).data.connection.phone.shared,true,'new explicit consent restores the still-offered other number');
  assert.equal(JSON.stringify((await read('other')).data).includes(phones.owner),false,'personal progress never leaks another pair’s phones');
});

await test('phone payload validation and third-party identity spoofing never alter consent',async()=>{
  const id=await invite();for(const as of ['owner','visitor'])await advance(2,as);const before=await snapshot();
  for(const phone of [undefined,null,'',123,[],{},'not a phone','a'.repeat(100),'+12'])status(await call({body:{action:'offerPhone',connectionId:id,phone}}),400);
  for(const connectionId of [undefined,null,'bad',id.toUpperCase()])status(await call({body:{action:'offerPhone',connectionId,phone:phones.owner}}),400);
  status(await offer(id,'other',phones.other,{memberId:ids.owner}),409);status(await withdraw(id,'other'),409);assert.deepEqual(await snapshot(),before);
  status(await offer(id,'owner',phones.owner,{memberId:ids.visitor,shared:true,otherOffered:true}));
  const result=await read('visitor',id);assert.equal(result.data.connection.phone.ownOffered,false);assert.equal(result.data.connection.phone.shared,false);assert.equal(JSON.stringify(result.data).includes(phones.owner),false);
});

await test('only current active participants see pair rewards; Friend connections never share phones',async()=>{
  for(const as of ['owner','visitor','other'])await advance(2,as);
  const friendId=await invite({channel:'friend'}),friend=await read('owner',friendId);status(friend);assert.equal(friend.data.connection.phone.eligible,false);status(await offer(friendId),409);status(await withdraw(friendId));
  for(const options of [{prospect:null},{prospect:'owner'},{status:'invited'},{status:'firstResults'},{status:'secondFive'},{status:'ended'},{status:'declined'}]){
    const id=await invite(options);status(await read('owner',id),404,JSON.stringify(options));status(await offer(id),409);status(await withdraw(id),409);
  }
  for(const state of ['chat','secondResults','email','tests']){const id=await invite({status:state});status(await read('owner',id));status(await read('visitor',id));status(await offer(id));status(await read('other',id),404)}
  status(await read('owner','f'.repeat(64)),404);for(const id of ['bad','A'.repeat(64)])status(await read('owner',id),400);
});

await test('ended timestamps, freeze, Trash, blocks, and counterpart standing hide pair rewards',async()=>{
  const restrictions=[
    ['ended timestamp with stale chat status',async id=>sql`UPDATE connection_state SET ended_at=now() WHERE invitation_hash=${id}`],
    ['owner freeze',async id=>sql`INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES(${ids.owner},${id},'freeze',now())`],
    ['other freeze',async id=>sql`INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES(${ids.visitor},${id},'freeze',now())`],
    ['owner Trash',async id=>sql`INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES(${ids.owner},${id},'unfreeze',now())`],
    ['other Trash',async id=>sql`INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES(${ids.visitor},${id},'unfreeze',now())`],
    ['owner block',async()=>sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.owner},${ids.visitor})`],
    ['other block',async()=>sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.visitor},${ids.owner})`],
    ['blocked counterpart',async()=>sql`UPDATE members SET blocked_at=now() WHERE id=${ids.visitor}`],
    ['suspended counterpart',async()=>sql`UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=${ids.visitor}`],
    ['unverified counterpart',async()=>sql`UPDATE members SET email_verified_at=NULL WHERE id=${ids.visitor}`]
  ];
  for(const [label,restrict] of restrictions){
    await reset();const id=await invite();await advance(2);await advance(2,'visitor');status(await offer(id));status(await offer(id,'visitor'));await restrict(id);
    status(await read('owner',id),404,label);status(await offer(id),409,label);status(await withdraw(id),409,label);
    const result=await read();status(result);assert.equal(result.data.level,2,'personal achievement remains accessible');assert.equal(JSON.stringify(result.data).includes(phones.visitor),false);
    assert.equal(result.data.connections.some(item=>item.id===id),false,label+' is absent from the status list');
    if(label==='ended timestamp with stale chat status')assert.equal((await core(id)).status,'chat','timestamp alone closes access even before a legacy status is repaired');
  }
});

await test('connection lifecycle and authentication changes while phone requests wait prevent writes',async()=>{
  const changes=[
    ['ended',async id=>sql`UPDATE connection_state SET status='ended',ended_at=now() WHERE invitation_hash=${id}`],
    ['ended timestamp with stale chat status',async id=>sql`UPDATE connection_state SET ended_at=now() WHERE invitation_hash=${id}`],
    ['frozen',async id=>sql`INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES(${ids.visitor},${id},'freeze',now())`],
    ['trashed',async id=>sql`INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES(${ids.owner},${id},'unfreeze',now())`],
    ['blocked pair',async()=>sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.visitor},${ids.owner})`],
    ['suspended counterpart',async()=>sql`UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=${ids.visitor}`],
    ['unverified actor',async()=>sql`UPDATE members SET email_verified_at=NULL WHERE id=${ids.owner}`],
    ['rotated session',async()=>sql`UPDATE members SET session_hash=${hash('phone-race')} WHERE id=${ids.owner}`],
    ['changed participant',async id=>sql`UPDATE invitations SET sender_member_id=${ids.other} WHERE token_hash=${id}`],
    ['changed to Friend',async id=>sql`UPDATE invitations SET channel='friend' WHERE token_hash=${id}`]
  ];
  for(const operation of ['offerPhone','withdrawPhone'])for(const [label,change] of changes){
    await reset();const id=await invite();await advance(2);await advance(2,'visitor');if(operation==='withdrawPhone')status(await offer(id));
    const before=await snapshot(),oldMessages=await messages(id);beforeTransaction=()=>change(id);
    const result=await call({body:{action:operation,connectionId:id,phone:phones.owner}});
    if(operation==='withdrawPhone'&&label==='changed to Friend'){
      status(result);assert.equal(result.data.connection.phone.shared,false);assert.equal(result.data.connection.phone.eligible,false);
      assert.equal((await db.query('SELECT count(*)::integer AS total FROM reward_phone_offers WHERE invitation_hash=$1',[id])).rows[0].total,0,'withdrawal can safely revoke an offer after a channel change');
    }else{status(result,409,operation+' / '+label);assert.deepEqual(await snapshot(),before)}
    assert.equal(beforeTransaction,null);assert.deepEqual(await messages(id),oldMessages);
  }
});

await test('level three awards an individual badge and exactly one note per current eligible connection',async()=>{
  const romantic=await invite(),friend=await invite({channel:'friend'}),unrelated=await invite({sender:'visitor',prospect:'other'});
  await advance(2);assert.equal((await read('owner',romantic)).data.connection.ownUpgraded,false);
  const oldRomantic=await core(romantic),oldFriend=await core(friend);
  await complete(3);
  for(const id of [romantic,friend]){
    const own=(await read('owner',id)).data.connection,other=(await read('visitor',id)).data.connection;
    assert.equal(own.ownUpgraded,true);assert.equal(own.otherUpgraded,false);assert.equal(own.upgraded,false);
    assert.equal(other.ownUpgraded,false);assert.equal(other.otherUpgraded,true);assert.equal(other.upgraded,true,'one member reaching level three is sufficient');
    const notes=(await messages(id)).filter(message=>message.gameEvent==='level-3-upgrade');assert.equal(notes.length,1);
    assert.equal(notes[0].by,'system');assert.equal(notes[0].id,'reward:level-3:'+ids.owner);assert.ok(notes[0].at);assert.match(notes[0].text,/owner.*Getting closer/);
    assert.equal(JSON.stringify(notes).includes('r3-'),false,'notes contain no private answers');
  }
  assert.equal((await messages(unrelated)).length,1,'only the earning member’s current contacts are notified');
  const list=(await read('visitor')).data.connections;
  for(const id of [romantic,friend])assert.equal(list.find(item=>item.id===id).upgraded,true);
  const before=await snapshot(),romanticMessages=await messages(romantic),friendMessages=await messages(friend);
  for(let retry=0;retry<3;retry++)status(await action('complete',3,'owner',{answers:answersFor(3,2),draftRevision:0}));
  assert.deepEqual(await snapshot(),before);assert.deepEqual(await messages(romantic),romanticMessages);assert.deepEqual(await messages(friend),friendMessages);
  await advance(3,'visitor');
  for(const id of [romantic,friend]){
    const notes=(await messages(id)).filter(message=>message.gameEvent==='level-3-upgrade');assert.equal(notes.length,2);assert.equal(new Set(notes.map(note=>note.id)).size,2);
    const state=(await read('owner',id)).data.connection;assert.equal(state.ownUpgraded,true);assert.equal(state.otherUpgraded,true);
  }
  assert.deepEqual(await core(romantic),oldRomantic);assert.deepEqual(await core(friend),oldFriend);
});

await test('bound first-results and second-five contacts receive status while notes and phones wait for chat',async()=>{
  for(const state of ['firstResults','secondFive']){
    await reset();const id=await invite({status:state}),original=await core(id);await advance(2);await advance(2,'visitor');await complete(3);
    const own=(await read('owner')).data.connections.find(item=>item.id===id),other=(await read('visitor')).data.connections.find(item=>item.id===id);
    assert.ok(own,state+' appears in the earning member’s status list');assert.ok(other,state+' appears in the contact’s status list');
    assert.equal(own.ownUpgraded,true);assert.equal(own.otherUpgraded,false);assert.equal(other.upgraded,true);assert.equal(other.otherUpgraded,true);
    const notes=(await messages(id)).filter(message=>message.gameEvent==='level-3-upgrade');assert.equal(notes.length,1);assert.equal(notes[0].id,'reward:level-3:'+ids.owner);
    assert.deepEqual(await core(id),original,'earning status does not prematurely change the relationship stage');
    for(const as of ['owner','visitor']){
      status(await read(as,id),404,'phone-specific pair projection still requires chat');status(await offer(id,as),409);status(await withdraw(id,as),409);
      const inbox=await call({api:connection,as,query:'inbox=1'});status(inbox);assert.deepEqual(inbox.data.connections.find(item=>item.id===id).messages,[],'normal chat keeps the upgrade note hidden before chat opens');
      status(await call({api:connection,as,body:{action:'message',id,text:'Not open yet'}}),409);
    }
    await sql`UPDATE connection_state SET status='chat' WHERE invitation_hash=${id}`;
    const open=await read('owner',id);status(open);assert.equal(open.data.connection.phone.eligible,true);
    status(await offer(id));status(await offer(id,'visitor'));assert.equal((await read('owner',id)).data.connection.phone.shared,true);
    const inbox=await call({api:connection,query:'inbox=1'});status(inbox);
    assert.equal(inbox.data.connections.find(item=>item.id===id).messages.filter(message=>message.gameEvent==='level-3-upgrade').length,1,'stored status note becomes visible once chat opens');
    status(await action('complete',3,'owner',{draftRevision:0}));assert.equal((await messages(id)).filter(message=>message.gameEvent==='level-3-upgrade').length,1,'opening chat and replaying completion never duplicates the note');
  }
});

await test('level three notifies no ended, declined, frozen, trashed, blocked, unverified, or suspended contact',async()=>{
  const restrictions=[
    ['ended',async id=>sql`UPDATE connection_state SET status='ended' WHERE invitation_hash=${id}`],
    ['declined',async id=>sql`UPDATE connection_state SET status='declined' WHERE invitation_hash=${id}`],
    ['ended timestamp with stale chat status',async id=>sql`UPDATE connection_state SET ended_at=now() WHERE invitation_hash=${id}`],
    ['frozen',async id=>sql`INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES(${ids.visitor},${id},'freeze',now())`],
    ['trashed',async id=>sql`INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES(${ids.owner},${id},'unfreeze',now())`],
    ['blocked',async()=>sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.visitor},${ids.owner})`],
    ['unverified',async()=>sql`UPDATE members SET email_verified_at=NULL WHERE id=${ids.visitor}`],
    ['suspended',async()=>sql`UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=${ids.visitor}`]
  ];
  for(const [label,restrict] of restrictions){
    await reset();const id=await invite();await advance(2);const oldMessages=await messages(id);
    beforeTransaction=()=>restrict(id);const result=await complete(3);assert.equal(result.data.level,3,'personal progress still earns its reward');
    assert.deepEqual(await messages(id),oldMessages,'no upgrade disclosure to '+label+' contact');
    assert.equal((await db.query('SELECT count(*)::integer AS total FROM reward_connection_events')).rows[0].total,0);
    assert.equal(result.data.connections.some(item=>item.id===id),false,'ineligible contact badge is not projected');
  }
});

await test('stale level-three completion cannot publish a note after another request wins the race',async()=>{
  const first=await invite();await advance(2);const revision=(await read()).data.draftRevision;let protectedState,protectedMessages;
  beforeTransaction=async()=>{
    status(await action('complete',3,'owner',{answers:answersFor(3,1),draftRevision:revision}));
    // A newly formed contact was not present when level three was earned.
    await invite({prospect:'other'});protectedState=await snapshot();protectedMessages=await messages(first);
  };
  status(await action('complete',3,'owner',{answers:answersFor(3,2),draftRevision:revision}),409);
  assert.deepEqual(await snapshot(),protectedState);assert.deepEqual(await messages(first),protectedMessages);
  assert.equal((await db.query('SELECT count(*)::integer AS total FROM reward_connection_events')).rows[0].total,1,'stale completion cannot fan out a fresh note');
});

await test('read reauthorization prevents revoked sessions, bad standing, and hidden pairs leaking data',async()=>{
  beforeRead={matches:text=>text.startsWith('WITH owner AS'),run:async()=>sql`UPDATE members SET session_hash=${hash('own-read-rotation')} WHERE id=${ids.owner}`};
  status(await read(),404);assert.equal(beforeRead,null);
  const changes=[
    ['session revoked',async()=>sql`UPDATE members SET session_hash=${hash('pair-read-rotation')} WHERE id=${ids.owner}`],
    ['actor blocked',async()=>sql`UPDATE members SET blocked_at=now() WHERE id=${ids.owner}`],
    ['ended timestamp with stale chat status',async id=>sql`UPDATE connection_state SET ended_at=now() WHERE invitation_hash=${id}`],
    ['counterpart frozen',async id=>sql`INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES(${ids.visitor},${id},'freeze',now())`]
  ];
  for(const [label,change] of changes){
    await reset();const id=await invite();await advance(2);await advance(2,'visitor');status(await offer(id));status(await offer(id,'visitor'));
    beforeRead={matches:text=>text.startsWith('WITH eligible AS'),run:()=>change(id)};
    const result=await read('owner',id);status(result,404,label);assert.equal(beforeRead,null);assert.equal(JSON.stringify(result.data).includes(phones.visitor),false);
  }
  await reset();await advance(3);
  beforeRead={matches:text=>text.startsWith('WITH owner AS'),run:async()=>sql`UPDATE members SET blocked_at=now() WHERE id=${ids.owner}`};
  const result=await read();status(result,404,'account standing changed before atomic own and connection projection');assert.equal(beforeRead,null);assert.equal('answers' in result.data,false);assert.equal('connections' in result.data,false);
});

await test('token reassignment between authorization and personal or phone reads cannot expose the replacement account',async()=>{
  for(const boundary of ['WITH owner AS','WITH eligible AS']){
    await reset();const id=await invite();await advance(2);await advance(2,'visitor');status(await offer(id));status(await offer(id,'visitor'));
    beforeRead={matches:text=>text.startsWith(boundary),run:async()=>{
      await sql`UPDATE members SET session_hash=${hash('unused-read-session')} WHERE id=${ids.owner}`;
      await sql`UPDATE members SET session_hash=${hash(tokens.owner)} WHERE id=${ids.visitor}`;
    }};
    const result=await read('owner',boundary==='WITH eligible AS'?id:undefined);status(result,404,boundary+' remains bound to the originally verified account');assert.equal(beforeRead,null);
    assert.equal('answers' in result.data,false);assert.equal('connection' in result.data,false);assert.equal(JSON.stringify(result.data).includes(phones.visitor),false);
  }
});

await test('transaction failures atomically roll back second-five publication and level-three fanout',async()=>{
  for(const level of [2,3]){
    await reset();const id=await invite();if(level===3)await advance(2);const before=await snapshot(),oldMessages=await messages(id);
    // Inject after all statements have executed but before commit to prove the
    // member answers, achievement, event ledger, and chat note form one unit.
    failTransactionAt='commit';
    const originalError=console.error;let logged=false;console.error=(...args)=>{logged=true;assert.deepEqual(args,['Reward request failed.'],'logs contain no SQL parameters or private payloads')};
    let result;try{result=await action('complete',level)}finally{console.error=originalError}
    status(result,500);assert.equal(logged,true);assert.deepEqual(await snapshot(),before);assert.deepEqual(await messages(id),oldMessages);
    await complete(level);assert.equal((await read()).data.level,level);
    if(level===3)assert.equal((await messages(id)).filter(message=>message.gameEvent==='level-3-upgrade').length,1);
  }
});

await test('optional levels and rewards preserve normal chat and existing connection fields',async()=>{
  for(const state of ['chat','secondResults','email','tests']){
    await reset();const id=await invite({status:state}),original=await core(id);
    const chat=async(as,text)=>{const result=await call({api:connection,as,body:{action:'message',id,text}});status(result);assert.ok((await messages(id)).some(message=>message.text===text))};
    await chat('owner','Before reward rounds');await advance(3);await chat('visitor','While other member is level one');await advance(3,'visitor');
    status(await offer(id));status(await offer(id,'visitor'));await chat('owner','After optional rewards');
    assert.deepEqual(await core(id),original);assert.deepEqual((await messages(id))[0],{by:'member',text:'Existing private conversation'});
    const inbox=await call({api:connection,query:'inbox=1'});status(inbox);assert.ok(inbox.data.connections.find(item=>item.id===id)?.messages.some(message=>message.text==='After optional rewards'));
  }
});

console.log(`Rewards integration: ${passed} passed; ${failures.length} failed; ${transactionCount} real SQL transactions; ${queryCount} reads`);
await db.close();
if(failures.length)process.exitCode=1;
