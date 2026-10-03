// Real discovery SQL, disposable local PostgreSQL via PGlite. No network,
// deployed database, accounts, mail, or third-party data is used by this suite.
process.env.CHEMPAT_REVIEW_DATA = 'isolated-confirmed';
process.env.DATABASE_URL = 'postgres://local-discovery-tests-only';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

const db = new PGlite();
const root = new URL('../', import.meta.url);
// All bootstrap DDL and every additive migration must remain repeatable.
for (let pass = 0; pass < 2; pass++) {
  await db.exec(fs.readFileSync(new URL('schema.sql', root), 'utf8'));
  // Existing account verification is normally initialized by _ops.ensureOps.
  await db.exec('ALTER TABLE members ADD COLUMN IF NOT EXISTS email_verified_at timestamptz');
  for (const name of fs.readdirSync(new URL('migrations/', root)).filter(x => x.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(new URL('migrations/' + name, root), 'utf8'));
  }
}
const hash = value => createHash('sha256').update(value).digest('hex');
const ids = {owner:'11111111-1111-4111-8111-111111111111', visitor:'22222222-2222-4222-8222-222222222222', other:'33333333-3333-4333-8333-333333333333'};
const tokens = {owner:'a'.repeat(64), visitor:'b'.repeat(64), other:'c'.repeat(64)};
const photo = 'data:image/jpeg;base64,AA==';
for (const [name,id] of Object.entries(ids)) {
  await db.query('INSERT INTO members(id,session_hash,name,contact,photo,answers,email_verified_at) VALUES($1,$2,$3,$4,$5,$6,now())', [id,hash(tokens[name]),name,`${name}@example.com`,photo,'[0,1,2,0,1]']);
}

// Neon transactions queue both tagged templates and tx.query calls. PGlite
// executes their real parameterized statements in the same transaction/order.
const template = (strings, values) => {
  assert.ok(Array.isArray(strings.raw), 'Neon-compatible SQL template');
  return {text:strings.reduce((out,part,index) => out + (index ? `$${index}` : '') + part, ''), values};
};
const run = async (executor, statement) => (await executor.query(statement.text,statement.values)).rows;
const sql = (strings,...values) => run(db,template(strings,values));
let beforeTransaction = null, beforeRead = null, failTransactionAt = null;
let transactionCount = 0, queryCount = 0;
sql.query = async (text,values=[]) => {
  queryCount++;
  if (beforeRead && beforeRead.matches(text)) {const hook=beforeRead;beforeRead=null;await hook.run()}
  return run(db,{text,values});
};
sql.transaction = async (callback,options) => {
  assert.equal(options?.isolationLevel,'ReadCommitted');
  transactionCount++;
  if (beforeTransaction) {const hook=beforeTransaction;beforeTransaction=null;await hook()}
  return db.transaction(async executor => {
    const tx=(strings,...values)=>template(strings,values);
    tx.query=(text,values=[])=>({text,values});
    const statements=callback(tx);
    assert.ok(Array.isArray(statements));
    assert.match(statements[0].text,/ORDER BY id FOR UPDATE/, 'stable pair member lock order');
    if (statements.some(statement=>/discovery_(?:drafts|pieces|players|games|events)/.test(statement.text))) {
      assert.match(statements[1].text,/connection_state.*FOR UPDATE/, 'connection is locked before discovery mutations');
    }
    const results=[];
    for (let index=0;index<statements.length;index++) {
      if (failTransactionAt === index) {failTransactionAt=null;throw Error('Synthetic transaction failure')}
      results.push(await run(executor,statements[index]));
    }
    return results;
  });
};
globalThis.__discoverySql=sql;
async function loadApi(name) {
  const source=fs.readFileSync(new URL(`api/${name}.mjs`,root),'utf8')
    .replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__discoverySql;')
    .replace(/from '\.\/(.*?)\.mjs'/g,(_,dependency)=>`from '${new URL(`api/${dependency}.mjs`,root).href}'`);
  assert.ok(source.includes('const neon=()=>globalThis.__discoverySql;'), 'real API uses isolated SQL adapter');
  return (await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
}
const discovery=await loadApi('discovery'),connection=await loadApi('connection');
// Imported production code must never cause network/provider calls in this test.
globalThis.fetch=async()=>{throw Error('Unexpected external request in isolated discovery test')};
const {MODULES,getModule,validateAnswers,scoreAnswers}=await import(new URL('api/_discovery-modules.mjs',root));
assert.ok(MODULES.length>=1);
const module=MODULES[0];
// Fixtures follow public choices; never copy an implementation scoring key.
const answersFor=(item,choice=0)=>Object.fromEntries(item.questions.map(question=>[question.id,item.scale[choice % item.scale.length].value]));
const full=answersFor(module), alternate=answersFor(module,1);
assert.equal(validateAnswers(module,full,{complete:true}),true,'fixture answers are valid');
const partial=Object.fromEntries(Object.entries(full).slice(0,2));
const badStatus=(result,status,label)=>assert.equal(result.status,status,`${label || ''}: ${JSON.stringify(result.data)}`);
let sequence=0;
async function invite({sender='owner',prospect='visitor',status='chat',channel='email'}={}) {
  const id=hash('isolated-discovery-'+(++sequence));
  await sql`INSERT INTO invitations(token_hash,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,sender_member_id,channel,expires_at) VALUES(${id},${`${sender}@example.com`},${sender},${photo},'[0,1,2,0,1]'::jsonb,'Private recipient','recipient@example.com',${ids[sender]},${channel},now()+interval '1 day')`;
  await sql`INSERT INTO connection_state(invitation_hash,prospect_member_id,prospect_name,prospect_photo,prospect_answers,status,messages) VALUES(${id},${ids[prospect]||null},'Private prospect',${photo},'[1,2,0,1,2]'::jsonb,${status},'[{"by":"member","text":"Existing private conversation"}]'::jsonb)`;
  return id;
}
async function call({as='owner',body,query='',cookie,method,rawBody,api=discovery}={}) {
  const response=await api.fetch(new Request('https://isolated.example/api/discovery?'+query,{
    method:method||(body===undefined&&rawBody===undefined?'GET':'POST'),
    headers:{cookie:cookie??(as?`chempat_member=${tokens[as]}`:''),'content-type':'application/json'},
    ...((body===undefined&&rawBody===undefined)?{}:{body:rawBody??JSON.stringify(body)})
  }));
  assert.equal(response.headers.get('cache-control'),'no-store','private API responses must not cache');
  return {status:response.status,data:await response.json()};
}
async function action(operation,id,as='owner',extra={}) {
  const body={action:operation,connectionId:id,moduleId:module.id,...extra};
  if (['save','complete'].includes(operation) && !Object.hasOwn(extra,'draftRevision')) {
    const current=await read(body.connectionId,as),item=getModule(body.moduleId,body.version);
    body.draftRevision=current.data.games?.find(game=>game.moduleId===body.moduleId&&game.version===item?.version)?.own.draftRevision??0;
  }
  return call({as,body});
}
const read=(id,as='owner')=>call({as,query:'connection='+id});
const pieceList=(as='owner')=>call({as,query:'pieces=1'});
const game=(result,id=module.id,version=module.version)=>result.data.games.find(x=>x.moduleId===id&&x.version===version);
const dbRows=(table)=>sql.query(`SELECT * FROM ${table} ORDER BY 1,2,3`);
async function snapshot() {
  const output={};
  for (const table of ['discovery_games','discovery_players','discovery_drafts','discovery_pieces','discovery_events']) output[table]=await dbRows(table);
  return output;
}
const messages=async id=>(await sql`SELECT messages FROM connection_state WHERE invitation_hash=${id}`)[0].messages;
const eventNotes=async id=>(await messages(id)).filter(message=>message.gameEvent);
async function reset() {
  assert.equal(beforeTransaction,null,'write race hook ran');
  assert.equal(beforeRead,null,'read race hook ran');
  failTransactionAt=null;
  await db.exec('DELETE FROM invitations;DELETE FROM discovery_drafts;DELETE FROM discovery_pieces;DELETE FROM member_blocks');
  for (const name of Object.keys(ids)) await sql`UPDATE members SET session_hash=${hash(tokens[name])},email_verified_at=now(),blocked_at=NULL,suspended_until=NULL WHERE id=${ids[name]}`;
}
async function start(id,as='owner',extra={}) {const result=await action('start',id,as,extra);badStatus(result,200,'start');return result}
async function complete(id,as='owner',answers=full,extra={}) {const result=await action('complete',id,as,{answers,...extra});badStatus(result,200,'complete');return result}
async function finish(id,as='owner',answers=full) {await start(id,as);return complete(id,as,answers)}
function privatePeer(result) {
  for (const item of result.data.games) {
    assert.deepEqual(Object.keys(item.other).sort(),['completed','consent','started']);
    assert.equal('answers' in item.other,false,'counterpart answers never projected');
    assert.equal('result' in item.other,false,'counterpart result never projected before mutual reveal');
  }
  const encoded=JSON.stringify(result.data);
  for(const secret of ['session_hash','recipient@example.com','Private recipient','Private prospect','Existing private conversation','data:image/'])assert.equal(encoded.includes(secret),false,'private unrelated data: '+secret);
}
let passed=0;const failures=[];
async function test(name,runTest) {
  try {await reset();await runTest();passed++;console.log('ok - '+name)}
  catch(error) {failures.push({name,error});console.error('FAIL - '+name+'\n'+error.stack);beforeTransaction=null;beforeRead=null;failTransactionAt=null}
}

await test('migration constraints and repeatability preserve personal pieces separately from connections',async()=>{
  const id=await invite();
  await assert.rejects(()=>sql`INSERT INTO discovery_drafts(member_id,module_id,version,answers) VALUES(${ids.owner},${module.id},${module.version},'[]'::jsonb)`);
  await assert.rejects(()=>sql`INSERT INTO discovery_pieces(member_id,module_id,version,result) VALUES(${ids.owner},${module.id},${module.version},'[]'::jsonb)`);
  await sql`INSERT INTO discovery_games(invitation_hash,module_id,version) VALUES(${id},${module.id},${module.version})`;
  await assert.rejects(()=>sql`INSERT INTO discovery_players(invitation_hash,module_id,version,member_id,shared_at) VALUES(${id},${module.id},${module.version},${ids.owner},now())`);
});

await test('additive revision migration upgrades legacy drafts without changing their answers',async()=>{
  await sql`INSERT INTO discovery_drafts(member_id,module_id,version,answers) VALUES(${ids.owner},${module.id},${module.version},${JSON.stringify(partial)}::jsonb)`;
  // Emulate the prior discovery schema only inside this disposable database.
  await db.exec('ALTER TABLE discovery_drafts DROP COLUMN revision');
  const legacy=await dbRows('discovery_drafts');
  const migration=fs.readFileSync(new URL('migrations/20261003_discovery_games.sql',root),'utf8');
  await db.exec(migration);await db.exec(migration);
  const upgraded=await dbRows('discovery_drafts');assert.equal(upgraded[0].revision,0);
  const {revision,...preserved}=upgraded[0];assert.deepEqual(preserved,legacy[0]);
});

await test('authentication, cookie parsing, revoked sessions, and supported HTTP methods',async()=>{
  const id=await invite();
  for(const cookie of ['', 'chempat_session='+tokens.owner, 'chempat_member=bad', 'chempat_member='+tokens.owner.toUpperCase()])badStatus(await call({cookie,query:'connection='+id}),401,'invalid member session');
  badStatus(await call({cookie:'chempat_member='+'d'.repeat(64),query:'connection='+id}),403,'unknown token');
  badStatus(await call({cookie:'extra=1; chempat_member='+tokens.owner+'; another=2',query:'connection='+id}),200);
  for(const method of ['PUT','PATCH','DELETE'])badStatus(await call({method}),405);
  await sql`UPDATE members SET session_hash=${hash('new-token')} WHERE id=${ids.owner}`;
  badStatus(await read(id),403);badStatus(await pieceList(),403);badStatus(await action('start',id),403);
});

await test('deployment and database configuration fail closed before querying private data',async()=>{
  const id=await invite(),oldDatabase=process.env.DATABASE_URL,oldReview=process.env.CHEMPAT_REVIEW_DATA;
  const previousReads=queryCount,previousTransactions=transactionCount;
  try {
    delete process.env.DATABASE_URL;
    badStatus(await read(id),503);badStatus(await action('start',id),503);
    process.env.DATABASE_URL=oldDatabase;
    delete process.env.CHEMPAT_REVIEW_DATA;
    badStatus(await read(id),503);badStatus(await action('start',id),503);
    assert.equal(queryCount,previousReads);assert.equal(transactionCount,previousTransactions);
  } finally {process.env.DATABASE_URL=oldDatabase;process.env.CHEMPAT_REVIEW_DATA=oldReview}
});

await test('only two identified members in an active non-Friend connection can access games',async()=>{
  const id=await invite();
  badStatus(await read(id),200);badStatus(await read(id,'visitor'),200);
  const before=await snapshot();
  badStatus(await read(id,'other'),404);
  for(const operation of ['start','save','complete','share','reuse'])badStatus(await action(operation,id,'other',{answers:full,memberId:ids.owner}),404,operation);
  assert.deepEqual(await snapshot(),before);
  for(const options of [{channel:'friend'},{prospect:null},{prospect:'owner'},{status:'invited'},{status:'firstResults'},{status:'secondFive'},{status:'ended'}]){
    const blocked=await invite(options);badStatus(await read(blocked),404,JSON.stringify(options));badStatus(await action('start',blocked),404);
  }
  for(const status of ['chat','secondResults','email','tests']){const active=await invite({status});badStatus(await read(active),200,status);await start(active)}
  badStatus(await read('f'.repeat(64)),404);
});

await test('freeze, personal Trash, bidirectional blocks, and account standing are enforced',async()=>{
  const restrictions=[
    async id=>sql`INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES(${ids.owner},${id},'freeze',now())`,
    async id=>sql`INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES(${ids.visitor},${id},'freeze',now())`,
    async id=>sql`INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES(${ids.owner},${id},'unfreeze',now())`,
    async id=>sql`INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES(${ids.visitor},${id},'unfreeze',now())`,
    async()=>sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.owner},${ids.visitor})`,
    async()=>sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.visitor},${ids.owner})`,
    async()=>sql`UPDATE members SET blocked_at=now() WHERE id=${ids.visitor}`,
    async()=>sql`UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=${ids.visitor}`
  ];
  for(const restrict of restrictions){await reset();const id=await invite();await restrict(id);badStatus(await read(id),404);badStatus(await action('start',id),404);assert.equal((await dbRows('discovery_games')).length,0)}
  for(const column of ['email_verified_at=NULL','blocked_at=now()',"suspended_until=now()+interval '1 day'"]){await reset();const id=await invite();await db.exec(`UPDATE members SET ${column} WHERE id='${ids.owner}'`);badStatus(await read(id),403);badStatus(await pieceList(),403);badStatus(await action('start',id),403)}
  await reset();const id=await invite();await sql`UPDATE members SET suspended_until=now()-interval '1 day' WHERE id IN(${ids.owner},${ids.visitor})`;badStatus(await read(id),200);
});

await test('request validation rejects malformed actions, identifiers, versions, and answer payloads without writes',async()=>{
  const id=await invite();const before=await snapshot();
  for(const rawBody of ['{','null','[]','"string"'])badStatus(await call({rawBody}),400);
  for(const query of ['', 'connection=bad', 'connection='+id.toUpperCase()])badStatus(await call({query}),400);
  for(const extra of [{action:'delete'},{action:null},{moduleId:'missing'},{moduleId:null},{moduleId:{}},{connectionId:'bad'},{connectionId:null},{version:'unpublished-version'},{version:{}},{version:99}])badStatus(await action('start',id,'owner',extra),400,JSON.stringify(extra));
  const first=Object.keys(full)[0];
  const invalidAnswers=[undefined,null,[],1,'answers',{unknown:0},{...full,[first]:null},{...full,[first]:-1},{...full,[first]:999},{...full,[first]:'0'},{...full,[first]:false},{...full,[first]:0.5},{...full,unknown:1}];
  for(const answers of invalidAnswers)for(const operation of ['save','complete'])badStatus(await action(operation,id,'owner',{answers}),400,operation+' '+JSON.stringify(answers));
  badStatus(await action('complete',id,'owner',{answers:partial}),400,'incomplete answer set');
  assert.deepEqual(await snapshot(),before);
});

await test('start is explicit, answer drafts resume privately, and another participant never receives private answers',async()=>{
  const id=await invite();
  let result=await read(id);assert.deepEqual(result.data.games,[]);assert.deepEqual(result.data.pieces,[]);assert.deepEqual(result.data.modules,MODULES);
  for(const operation of ['save','complete','share','reuse'])badStatus(await action(operation,id,'owner',{answers:full}),409,operation+' before start');
  assert.equal((await dbRows('discovery_games')).length,0,'invalid action does not enroll');
  result=await start(id);assert.equal(game(result).own.started,true);assert.equal(game(result).own.completed,false);assert.equal(game(result).own.consent,false);assert.deepEqual(game(result).own.answers,{});
  badStatus(await action('save',id,'owner',{answers:partial}),200);result=await read(id);assert.deepEqual(game(result).own.answers,partial);assert.equal(game(result).own.result,null);
  result=await read(id,'visitor');privatePeer(result);assert.deepEqual(game(result).own.answers,{});assert.deepEqual(game(result).other,{started:true,completed:false,consent:false});assert.equal(game(result).sharedResults,null);
  await start(id,'visitor');badStatus(await action('save',id,'visitor',{answers:alternate}),200);assert.deepEqual(game(await read(id)).own.answers,partial);assert.deepEqual(game(await read(id,'visitor')).own.answers,alternate);
  badStatus(await action('save',id,'owner',{answers:full}),200);assert.deepEqual(game(await read(id)).own.answers,full);
  assert.deepEqual((await messages(id))[0],{by:'member',text:'Existing private conversation'},'game writes preserve existing chat');
});

await test('completion earns immutable personal pieces and private results; both people must explicitly share',async()=>{
  const id=await invite();await start(id);await start(id,'visitor');
  badStatus(await action('save',id,'owner',{answers:full}),200);badStatus(await action('save',id,'visitor',{answers:alternate}),200);
  let result=await complete(id);const original=scoreAnswers(module,full);assert.deepEqual(game(result).own.result,original);assert.equal(game(result).own.consent,false);assert.equal(game(result).revealed,false);assert.equal(game(result).sharedResults,null);
  result=await read(id,'visitor');privatePeer(result);assert.equal(game(result).other.completed,true);assert.equal(game(result).sharedResults,null);assert.equal(game(result).own.result,null);assert.deepEqual(result.data.pieces,[]);
  await complete(id,'visitor',alternate);result=await action('share',id);badStatus(result,200);assert.equal(game(result).own.consent,true);assert.equal(game(result).revealed,false);assert.equal(game(result).sharedResults,null);
  result=await read(id,'visitor');privatePeer(result);assert.equal(game(result).sharedResults,null);assert.equal(game(result).other.consent,true);
  result=await action('share',id,'visitor');badStatus(result,200);assert.equal(game(result).revealed,true);assert.deepEqual(game(result).sharedResults,{own:scoreAnswers(module,alternate),other:original});
  result=await read(id);privatePeer(result);assert.deepEqual(game(result).sharedResults,{own:original,other:scoreAnswers(module,alternate)});
  assert.equal('answers' in game(result).sharedResults.other,false);assert.deepEqual(game(result).own.answers,full,'own drafts remain own');
  const ownPiece=(await pieceList()).data.pieces[0];assert.equal(ownPiece.moduleId,module.id);assert.deepEqual(ownPiece.result,original);assert.equal('answers' in ownPiece,false);
  assert.deepEqual((await pieceList('other')).data.pieces,[],'third party has no pieces');
  await complete(id,'owner',alternate);assert.deepEqual(game(await read(id)).own.result,original,'repeat completion cannot overwrite earned piece');
  badStatus(await action('save',id,'owner',{answers:alternate}),409);assert.deepEqual(game(await read(id)).own.answers,full,'completed piece answers are immutable');
});

await test('completion saves final answers and ignores client-supplied scores, identities, and consent',async()=>{
  const id=await invite();
  let result=await action('start',id,'owner',{memberId:ids.visitor,consent:true,sharedAt:new Date().toISOString(),completed:true});
  badStatus(result,200);assert.equal(game(result).own.consent,false);assert.equal(game(result).own.completed,false);assert.equal(game(result).other.started,false);
  badStatus(await action('save',id,'owner',{answers:partial}),200);
  result=await action('complete',id,'owner',{answers:full,memberId:ids.visitor,result:{summary:'FORGED RESULT'},consent:true,shared:true});
  badStatus(result,200);assert.deepEqual(game(result).own.answers,full,'final payload replaces an earlier partial save');assert.deepEqual(game(result).own.result,scoreAnswers(module,full));assert.equal(game(result).own.consent,false);assert.equal(game(result).other.completed,false);
  const stored=await dbRows('discovery_pieces');assert.equal(stored.length,1);assert.equal(stored[0].member_id,ids.owner);assert.equal(JSON.stringify(stored).includes('FORGED RESULT'),false);
  const outsider=await call({as:'other',query:`pieces=1&memberId=${ids.owner}&connection=${id}`});assert.deepEqual(outsider.data.pieces,[]);
  const otherId=await invite({prospect:'other'});await start(otherId);
  badStatus(await action('save',otherId,'owner',{answers:alternate}),409,'earned pieces cannot be edited in a new pair');
  badStatus(await action('complete',otherId,'owner',{answers:alternate}),409,'complete cannot silently reuse a pre-existing global piece');
  badStatus(await action('share',otherId),409,'share cannot implicitly attach a pre-existing piece');
  result=await read(otherId);assert.equal(game(result).own.completed,false);assert.equal(game(result).own.consent,false);assert.equal(game(result).own.result,null);assert.equal((await eventNotes(otherId)).length,1);
  badStatus(await action('reuse',otherId),200,'only explicit reuse offers the piece');
});

await test('draft revisions reject stale cross-connection saves and completions without losing newer answers',async()=>{
  const first=await invite(),second=await invite({prospect:'other'});
  await start(first);await start(second);
  assert.equal(game(await read(first)).own.draftRevision,0);
  const absent=await snapshot();
  for(const draftRevision of [undefined,null,'0',-1,0.5,{},[],2**31-1,2**31,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1])for(const operation of ['save','complete']){
    badStatus(await action(operation,first,'owner',{answers:full,draftRevision}),400,operation+' invalid revision '+JSON.stringify(draftRevision));
  }
  assert.deepEqual(await snapshot(),absent,'invalid revisions have no side effects');
  for(const draftRevision of [10,2**31-2])for(const operation of ['save','complete'])badStatus(await action(operation,first,'owner',{answers:full,draftRevision}),409,'nonzero revision cannot create a missing draft');
  assert.deepEqual(await snapshot(),absent);
  let result=await action('save',first,'owner',{answers:partial,draftRevision:0});
  badStatus(result,200);assert.equal(game(result).own.draftRevision,1);
  const fromSecond=game(await read(second));assert.equal(fromSecond.own.draftRevision,1);assert.deepEqual(fromSecond.own.answers,partial);
  const newest={...full,[Object.keys(full)[0]]:5};
  result=await action('save',second,'owner',{answers:newest,draftRevision:1});
  badStatus(result,200);assert.equal(game(result).own.draftRevision,2);
  const protectedData=await snapshot(),protectedMessages=await messages(first);
  for(const operation of ['save','complete']){
    badStatus(await action(operation,first,'owner',{answers:alternate,draftRevision:1}),409,operation+' with stale draft');
    assert.deepEqual(await snapshot(),protectedData,'stale '+operation+' cannot alter personal data or earn a piece');
    assert.deepEqual(await messages(first),protectedMessages,'no completion note on conflict');
  }
  const latest=game(await read(first));assert.deepEqual(latest.own.answers,newest);assert.equal(latest.own.draftRevision,2);assert.equal(latest.own.completed,false);assert.deepEqual((await pieceList()).data.pieces,[]);
  result=await action('complete',first,'owner',{answers:newest,draftRevision:2});badStatus(result,200);
  assert.equal(game(result).own.draftRevision,3);assert.deepEqual(game(result).own.result,scoreAnswers(module,newest));
  const finished=await snapshot(),finishedMessages=await messages(first);
  result=await action('complete',first,'owner',{answers:alternate,draftRevision:0});badStatus(result,200,'completed request is safely idempotent even with an old revision');
  assert.deepEqual(await snapshot(),finished);assert.deepEqual(await messages(first),finishedMessages);assert.deepEqual(game(result).own.answers,newest);
});

await test('a newer save between request validation and transaction blocks stale save and stale completion',async()=>{
  for(const operation of ['save','complete']){
    await reset();const first=await invite(),second=await invite({prospect:'other'});
    await start(first);await start(second);
    badStatus(await action('save',first,'owner',{answers:partial,draftRevision:0}),200);
    let newestState,newestMessages;
    beforeTransaction=async()=>{
      const advanced=await action('save',second,'owner',{answers:full,draftRevision:1});badStatus(advanced,200);assert.equal(game(advanced).own.draftRevision,2);
      newestState=await snapshot();newestMessages=await messages(first);
    };
    badStatus(await action(operation,first,'owner',{answers:alternate,draftRevision:1}),409,'stale '+operation+' after lock wait');
    assert.equal(beforeTransaction,null);assert.deepEqual(await snapshot(),newestState);assert.deepEqual(await messages(first),newestMessages);assert.deepEqual((await pieceList()).data.pieces,[]);
    const latest=game(await read(first));assert.deepEqual(latest.own.answers,full);assert.equal(latest.own.draftRevision,2);assert.equal(latest.own.completed,false);
  }
});

await test('a piece earned in another connection while this request waits cannot be silently linked or overwritten',async()=>{
  const first=await invite(),second=await invite({prospect:'other'});
  await start(first);await start(second);
  badStatus(await action('save',first,'owner',{answers:partial,draftRevision:0}),200);
  let protectedData,protectedMessages;
  beforeTransaction=async()=>{
    const won=await action('complete',second,'owner',{answers:alternate,draftRevision:1});badStatus(won,200);assert.equal(game(won).own.completed,true);
    protectedData=await snapshot();protectedMessages=await messages(first);
  };
  badStatus(await action('complete',first,'owner',{answers:full,draftRevision:1}),409);
  assert.deepEqual(await snapshot(),protectedData);assert.deepEqual(await messages(first),protectedMessages);
  const pending=game(await read(first));assert.equal(pending.own.completed,false);assert.equal(pending.own.consent,false);assert.equal(pending.own.result,null);
  assert.deepEqual((await pieceList()).data.pieces[0].result,scoreAnswers(module,alternate));
  const reused=await action('reuse',first);badStatus(reused,200);assert.deepEqual(game(reused).own.result,scoreAnswers(module,alternate));
});

await test('optional discovery never removes ordinary chat access or changes the core connection answers',async()=>{
  for(const status of ['chat','secondResults','email','tests']){
    await reset();const id=await invite({status});
    const original=(await sql`SELECT c.status,c.prospect_answers,i.sender_answers,m.answers FROM connection_state c JOIN invitations i ON i.token_hash=c.invitation_hash JOIN members m ON m.id=i.sender_member_id WHERE c.invitation_hash=${id}`)[0];
    const chat=async(as,text)=>{const result=await call({api:connection,as,body:{action:'message',id,text}});badStatus(result,200,'chat at '+status);assert.ok((await messages(id)).some(message=>message.text===text))};
    await chat('owner','Before optional discovery');
    await start(id);await chat('visitor','While a game is incomplete');
    await complete(id);await chat('owner','After a private result');
    await finish(id,'visitor',alternate);await action('share',id);await action('share',id,'visitor');
    await chat('visitor','After mutual reveal');
    const after=(await sql`SELECT c.status,c.prospect_answers,i.sender_answers,m.answers FROM connection_state c JOIN invitations i ON i.token_hash=c.invitation_hash JOIN members m ON m.id=i.sender_member_id WHERE c.invitation_hash=${id}`)[0];
    assert.deepEqual(after,original);
    const inbox=await call({api:connection,query:'inbox=1'});badStatus(inbox,200);assert.ok(inbox.data.connections.find(item=>item.id===id)?.messages.some(message=>message.text==='After mutual reveal'));
  }
});

await test('started, finished, and shared-reveal notes are exactly-once across retries',async()=>{
  const id=await invite();
  for(const as of ['owner','visitor']){
    await start(id,as);await start(id,as);await complete(id,as);await complete(id,as);badStatus(await action('share',id,as),200);badStatus(await action('share',id,as),200);
  }
  const notes=await eventNotes(id),stored=await dbRows('discovery_events');
  assert.equal(notes.length,5);assert.equal(stored.length,5);assert.equal(new Set(notes.map(note=>note.id)).size,5);
  assert.deepEqual(notes.map(note=>note.gameEvent).sort(),[`started:${ids.owner}`,`started:${ids.visitor}`,`finished:${ids.owner}`,`finished:${ids.visitor}`,'reveal-ready'].sort());
  for(const note of notes){assert.equal(note.by,'system');assert.ok(note.at);assert.ok(note.text.includes(module.title));assert.equal('answers' in note,false);assert.equal('result' in note,false)}
  const players=await dbRows('discovery_players');const snapshots=JSON.stringify(players);
  for(const as of ['owner','visitor']){await start(id,as);await complete(id,as);await action('share',id,as);await action('reuse',id,as)}
  assert.equal(JSON.stringify(await dbRows('discovery_players')),snapshots,'retries preserve original lifecycle timestamps');assert.deepEqual(await eventNotes(id),notes);
});

await test('earned pieces survive ended/deleted connections, and each new pair requires an explicit offer',async()=>{
  const first=await invite();await finish(first);badStatus(await action('share',first),200);const piece=(await pieceList()).data.pieces[0];
  await sql`UPDATE connection_state SET status='ended',ended_at=now() WHERE invitation_hash=${first}`;
  badStatus(await read(first),404);assert.deepEqual((await pieceList()).data.pieces,[piece]);
  const second=await invite({prospect:'other'});let result=await read(second);assert.deepEqual(result.data.games,[]);assert.deepEqual(result.data.pieces,[piece]);
  result=await start(second);assert.equal(game(result).own.completed,false);assert.equal(game(result).own.consent,false);assert.equal(game(result).own.result,null,'start does not silently attach an earned piece');
  result=await read(second,'other');privatePeer(result);assert.equal(game(result).other.completed,false);assert.equal(game(result).other.consent,false);assert.equal(game(result).sharedResults,null);
  result=await action('reuse',second);badStatus(result,200);assert.equal(game(result).own.completed,true);assert.equal(game(result).own.consent,true);assert.deepEqual(game(result).own.result,piece.result);assert.equal(game(result).revealed,false);
  result=await read(second,'other');privatePeer(result);assert.equal(game(result).sharedResults,null);badStatus(await action('reuse',second,'other'),409,'cannot reuse somebody else’s piece');
  await finish(second,'other',alternate);badStatus(await action('share',second,'other'),200);assert.equal(game(await read(second)).revealed,true);
  await sql`DELETE FROM invitations WHERE token_hash=${first}`;assert.deepEqual((await pieceList()).data.pieces,[piece]);
  const third=await invite();result=await action('reuse',third);badStatus(result,200);assert.equal(game(result).own.started,true);assert.equal(game(result).own.consent,true);assert.equal(game(result).other.started,false);assert.equal(game(result).revealed,false);
});

await test('all shipped modules complete independently and unknown historical versions cannot surface',async()=>{
  const id=await invite();
  for(const item of MODULES){const answers=answersFor(item);await start(id,'owner',{moduleId:item.id,version:item.version});await complete(id,'owner',answers,{moduleId:item.id,version:item.version});assert.deepEqual(game(await read(id),item.id,item.version).own.result,scoreAnswers(item,answers))}
  assert.equal((await pieceList()).data.pieces.length,MODULES.length);
  await sql`INSERT INTO discovery_games(invitation_hash,module_id,version) VALUES(${id},${module.id},'future-hidden')`;
  await sql`INSERT INTO discovery_pieces(member_id,module_id,version,result) VALUES(${ids.owner},${module.id},'future-hidden','{"private":"historical-result"}'::jsonb)`;
  assert.equal((await pieceList()).data.pieces.length,MODULES.length);assert.equal((await read(id)).data.games.length,MODULES.length);
  badStatus(await action('reuse',id,'owner',{version:'future-hidden'}),400);
  assert.equal(JSON.stringify((await read(id)).data).includes('historical-result'),false);
});

await test('lifecycle, membership, standing, and session changes immediately before every transaction prevent all writes',async()=>{
  const changes=[
    ['ended',async id=>sql`UPDATE connection_state SET status='ended',ended_at=now() WHERE invitation_hash=${id}`],
    ['frozen',async id=>sql`INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES(${ids.visitor},${id},'freeze',now())`],
    ['trashed',async id=>sql`INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES(${ids.owner},${id},'unfreeze',now())`],
    ['blocked',async()=>sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.visitor},${ids.owner})`],
    ['suspended actor',async()=>sql`UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=${ids.owner}`],
    ['suspended counterpart',async()=>sql`UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=${ids.visitor}`],
    ['blocked actor',async()=>sql`UPDATE members SET blocked_at=now() WHERE id=${ids.owner}`],
    ['unverified actor',async()=>sql`UPDATE members SET email_verified_at=NULL WHERE id=${ids.owner}`],
    ['rotated session',async()=>sql`UPDATE members SET session_hash=${hash('rotation')} WHERE id=${ids.owner}`],
    ['changed participant',async id=>sql`UPDATE invitations SET sender_member_id=${ids.other} WHERE token_hash=${id}`],
    ['changed to Friend',async id=>sql`UPDATE invitations SET channel='friend' WHERE token_hash=${id}`]
  ];
  for(const operation of ['start','save','complete','share','reuse'])for(const [label,mutate] of changes){
    await reset();const id=await invite();
    if(['save','complete'].includes(operation))await start(id);
    if(operation==='share')await finish(id);
    if(operation==='reuse'){const old=await invite({prospect:'other'});await finish(old)}
    const before=await snapshot(),oldMessages=await messages(id);let ran=false;
    beforeTransaction=async()=>{ran=true;await mutate(id)};
    const result=await action(operation,id,'owner',{answers:full});
    badStatus(result,409,operation+' / '+label);assert.equal(ran,true);assert.deepEqual(await snapshot(),before,operation+' / '+label+' cannot mutate game state');assert.deepEqual(await messages(id),oldMessages,'no progress events after '+label);
  }
});

await test('read-time reauthorization prevents stale session and relationship snapshots leaking games or pieces',async()=>{
  const id=await invite();await finish(id);await finish(id,'visitor',alternate);await action('share',id);await action('share',id,'visitor');
  beforeRead={matches:text=>text.startsWith('WITH eligible AS'),run:async()=>sql`UPDATE members SET session_hash=${hash('read-rotation')} WHERE id=${ids.owner}`};
  badStatus(await read(id),404);assert.equal(beforeRead,null);
  await sql`UPDATE members SET session_hash=${hash(tokens.owner)} WHERE id=${ids.owner}`;
  beforeRead={matches:text=>text.startsWith('SELECT p.module_id'),run:async()=>sql`UPDATE members SET blocked_at=now() WHERE id=${ids.owner}`};
  const result=await pieceList();badStatus(result,200);assert.deepEqual(result.data.pieces,[]);
});

await test('transaction failures roll back game enrollment and events atomically',async()=>{
  const id=await invite();const before=await snapshot(),oldMessages=await messages(id);
  failTransactionAt=4;
  const originalError=console.error;let logged=false;console.error=(...args)=>{logged=true;assert.match(String(args[0]),/Discovery error/)};
  let result;try{result=await action('start',id)}finally{console.error=originalError}
  badStatus(result,500);assert.equal(logged,true);assert.deepEqual(await snapshot(),before);assert.deepEqual(await messages(id),oldMessages);
  await start(id);assert.equal((await eventNotes(id)).length,1,'retry succeeds after a rolled-back start');
});

console.log(`Discovery integration: ${passed} passed; ${failures.length} failed; ${transactionCount} real SQL transactions; ${queryCount} reads`);
await db.close();
if(failures.length)process.exitCode=1;
