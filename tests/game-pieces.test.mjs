// Disposable local PostgreSQL only. Real API SQL and atomic source triggers;
// PGlite serializes transactions, so race hooks + lock assertions cover safety
// without claiming a multi-server deadlock/load test.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {REWARD_ROUNDS} from '../api/_reward-rounds.mjs';
import {WILDCARD_CATEGORIES} from '../api/_wildcard-questions.mjs';
process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';process.env.DATABASE_URL='postgres://local-game-piece-tests-only';
if(process.env.GAME_PIECE_TEST_MODE==='live')Object.assign(process.env,{CHEMPAT_RELEASE_MODE:'live',VERCEL:'1',VERCEL_PROJECT_ID:'prj_gtV01YIqkEfAfvdSbVopIfy2VpnJ',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'live'});
const root=new URL('../',import.meta.url),db=new PGlite(),baseMigration=fs.readFileSync(new URL('migrations/20261006_game_pieces.sql',root),'utf8'),friendMigration=fs.readFileSync(new URL('migrations/20261007_friend_wildcards.sql',root),'utf8'),migration=baseMigration+'\n'+friendMigration;
await db.exec(fs.readFileSync(new URL('schema.sql',root),'utf8'));
await db.exec('ALTER TABLE members ADD COLUMN IF NOT EXISTS email_verified_at timestamptz');
await db.exec(migration);await db.exec(migration);
const hash=s=>createHash('sha256').update(s).digest('hex');
const ids={owner:'11111111-1111-4111-8111-111111111111',visitor:'22222222-2222-4222-8222-222222222222',other:'33333333-3333-4333-8333-333333333333'};
const tokens={owner:'a'.repeat(64),visitor:'b'.repeat(64),other:'c'.repeat(64)};
const photo='data:image/jpeg;base64,/9gR/9k=',five=[0,1,2,0,1],ten=[...five,2,0,1,2,0],visit='visit-one-123',nextVisit='visit-two-123';
let beforeTransaction=null,beforeRead=null,afterLocks=null,failCommit=false,sequence=0,transactions=0;
const run=async(executor,{text,values=[]})=>(await executor.query(text,values)).rows;
const sql=(strings,...values)=>sql.query(strings.reduce((out,part,index)=>out+(index?'$'+index:'')+part,''),values);
sql.query=async(text,values=[])=>{
 if(beforeRead&&beforeRead.matches(text)){const hook=beforeRead;beforeRead=null;await hook.run()}
 return run(db,{text,values});
};
sql.transaction=async(build,options)=>{
 assert.equal(options?.isolationLevel,'ReadCommitted');transactions++;
 if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;await hook()}
 return db.transaction(async tx=>{
  const statement=(strings,...values)=>({text:strings.reduce((out,part,index)=>out+(index?'$'+index:'')+part,''),values});
  statement.query=(text,values=[])=>({text,values});
  const statements=build(statement);
  assert.match(statements[0].text,/ORDER BY id FOR UPDATE/);
  if(statements.some(s=>s.text.includes('UPDATE game_piece_events e SET'))){
   assert.equal(statements.length,3);assert.match(statements[1].text,/connection_state.*FOR UPDATE/);
   assert.match(statements[2].text,/m\.session_hash=\$1 AND m\.id='[a-f0-9-]+'::uuid/);
  }
  const result=[];
  for(let i=0;i<statements.length;i++){
   if(i===2&&afterLocks){const hook=afterLocks;afterLocks=null;await hook(tx)}
   result.push(await run(tx,statements[i]));
  }
  if(failCommit){failCommit=false;throw Error('Synthetic rollback')}
  return result;
 });
};
globalThis.__gamePieceSql=sql;
async function loadApi(name){
 const source=fs.readFileSync(new URL('api/'+name+'.mjs',root),'utf8').replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__gamePieceSql;').replace(/from '\.\/(.*?)\.mjs'/g,(_,name)=>`from '${new URL('api/'+name+'.mjs',root).href}'`);
 return (await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
}
const feed=await loadApi('game-pieces'),rewards=await loadApi('rewards'),wildcards=await loadApi('wildcards'),directory=await loadApi('reward-directory'),connection=await loadApi('connection'),friend=await loadApi('friend');
globalThis.fetch=async()=>{throw Error('Unexpected external call in game piece tests')};
async function call({api=feed,as='owner',body,rawBody,query='visit='+visit,headers={},cookie,method}={}){
 const h=new Headers({cookie:cookie??(as?'chempat_member='+tokens[as]:''),'content-type':'application/json',...(as?{'x-chempat-member-id':ids[as]}:{})});
 for(const [key,value] of Object.entries(headers)){if(value===null)h.delete(key);else h.set(key,value)}
 const hasBody=body!==undefined||rawBody!==undefined;
 const response=await api.fetch(new Request('https://isolated.example/api/test?'+query,{method:method||(hasBody?'POST':'GET'),headers:h,...(hasBody?{body:rawBody??JSON.stringify(body)}:{}),...(rawBody instanceof ReadableStream?{duplex:'half'}:{})}));
 assert.equal(response.headers.get('cache-control'),'no-store');return {status:response.status,data:await response.json()};
}
const status=(result,expected=200)=>assert.equal(result.status,expected,JSON.stringify(result.data));
const read=(as='owner',extra={})=>call({as,...extra});
const hydrate=(piece,as='owner',extra={})=>read(as,{query:'visit='+visit+'&piece='+piece.id+'&connection='+piece.connectionId,...extra});
const ack=async(piece,action='seen',as='owner',extra={})=>{const result=await call({as,body:{id:piece.id,version:piece.version,receiptRevision:piece.receiptRevision,action,visit,...extra}});if(result.status===200)piece.receiptRevision=result.data.receiptRevision;return result};
const pieces=async(as='owner',kind)=>{const r=await read(as);status(r);return r.data.pieces.filter(p=>!kind||p.kind===kind)};
const ledger=async()=>(await db.query('SELECT * FROM game_piece_events ORDER BY id')).rows;
const setLevel=async(value,as='owner')=>{
 await db.query('UPDATE members SET answers=$2 WHERE id=$1',[ids[as],JSON.stringify(value>=2?ten:value===1?five:[])]);
 if(value>=3)await db.query('INSERT INTO member_reward_state(member_id,completed_level) VALUES($1,$2) ON CONFLICT(member_id) DO UPDATE SET completed_level=excluded.completed_level',[ids[as],value]);
};
async function invite({sender='owner',prospect='visitor',channel='email',state='chat',bound=true,answers=five,id=hash('game-piece-'+(++sequence))}={}){
 await db.query(`INSERT INTO invitations(token_hash,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,sender_member_id,channel) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,sender+'@example.com',sender,photo,JSON.stringify(answers),prospect,prospect+'@example.com',ids[sender],channel]);
 await db.query('INSERT INTO connection_state(invitation_hash,prospect_member_id,prospect_name,prospect_answers,status,messages) VALUES($1,$2,$3,$4,$5,$6)',[id,bound?ids[prospect]:null,prospect,JSON.stringify(bound?answers:[]),state,'[{"by":"member","text":"private ordinary chat"}]']);if(channel==='qr'&&bound)await db.query('UPDATE connection_state SET claim_hash=$2 WHERE invitation_hash=$1',[id,hash('synthetic-claim')]);return id;
}
const phone=(id,as='owner',number='+12025550111')=>call({api:rewards,as,body:{action:'offerPhone',connectionId:id,phone:number}});
const withdraw=(id,as='owner')=>call({api:rewards,as,body:{action:'withdrawPhone',connectionId:id}});
const publish=(action,as='owner')=>call({api:directory,as,body:{action}});
const question=WILDCARD_CATEGORIES[0].questions[0].id;
const ask=(id,as='owner',requestId='ask-request-123')=>call({api:wildcards,as,body:{action:'ask',connectionId:id,questionId:question,requestId}});
const answer=(id,as='visitor')=>call({api:wildcards,as,body:{action:'answer',connectionId:id,questionId:question,requestId:'answer-request-123',answer:'private structured answer'}});
async function reset(){
 assert.equal(beforeTransaction,null);assert.equal(beforeRead,null);assert.equal(afterLocks,null);failCommit=false;
 await db.exec('DELETE FROM invitations;DELETE FROM members;DELETE FROM game_piece_events;DELETE FROM game_piece_pairs;DELETE FROM activity');
 for(const [name,id] of Object.entries(ids))await db.query('INSERT INTO members(id,session_hash,name,contact,photo,answers,email_verified_at) VALUES($1,$2,$3,$4,$5,$6,now())',[id,hash(tokens[name]),name,name+'@example.com',photo,JSON.stringify(five)]);
}
let passed=0,failed=0;
async function test(name,fn){try{await reset();await fn();passed++;console.log('ok - '+name)}catch(error){failed++;console.error('FAIL - '+name+'\n'+error.stack);beforeTransaction=null;beforeRead=null;afterLocks=null;failCommit=false}}
function privateOnly(result){
 const text=JSON.stringify(result);
 for(const secret of ['@example.com','data:image','+12025550111','private ordinary chat','private structured answer','base-6','r3-1','session_hash','sender_answers','prospect_answers','video_mime','held_visit','recipient_id'])assert.equal(text.includes(secret),false,secret+' stays private');
}

await test('migration is additive, idempotent, future-only and contains no privilege or member lock expansion',async()=>{
 await invite();const before=await ledger();await db.exec(migration);await db.exec(migration);assert.deepEqual(await ledger(),before);
 assert.doesNotMatch(migration,/SECURITY\s+DEFINER|\bGRANT\b|REFERENCES\s+members|FOR\s+(?:UPDATE|KEY SHARE)/i);
 assert.equal((await db.query("SELECT count(*)::int AS count FROM pg_constraint WHERE conrelid IN('game_piece_events'::regclass,'game_piece_pairs'::regclass) AND contype='f'")).rows[0].count,0);
 // Simulate existing data at rollout without relying on source timestamps.
 await db.exec('DELETE FROM game_piece_events;DELETE FROM game_piece_pairs');await db.exec(migration);
 assert.equal((await ledger()).length,0);assert.equal((await db.query('SELECT * FROM game_piece_pairs')).rows.length,1);await db.exec("UPDATE connection_state SET updated_at=now(),messages=messages||'[]'::jsonb");assert.equal((await ledger()).length,0);
});

await test('rollout snapshots preserve existing pair IDs without historical pieces or malformed recipients',async()=>{
 const id=await invite(),friendId=await invite({channel:'friend'});await invite({bound:false});await invite({channel:'friend',state:'invited',bound:false});await invite({channel:'friend',state:'declined'});await invite({prospect:'owner'});
 await db.exec('DELETE FROM game_piece_events;DELETE FROM game_piece_pairs');await db.exec(migration);
 const pairs=(await db.query('SELECT * FROM game_piece_pairs')).rows;assert.equal(pairs.length,2);assert.equal(pairs.find(p=>p.invitation_hash===id).connection_kind,'vibe');assert.equal(pairs.find(p=>p.invitation_hash===friendId).connection_kind,'friend');assert.equal((await ledger()).length,0);
 await db.query('UPDATE connection_state SET prospect_member_id=$2 WHERE invitation_hash=$1',[id,ids.other]);await db.exec(migration);assert.equal((await db.query('SELECT prospect_member_id FROM game_piece_pairs WHERE invitation_hash=$1',[id])).rows[0].prospect_member_id,ids.visitor);
 await setLevel(3);assert.equal((await ledger()).length,0);
});

await test('first-five starts only at a true bound romantic pair, and never repeats on unchanged writes',async()=>{
 const id=await invite({state:'invited',bound:false});assert.equal((await ledger()).length,0);
 await db.query("UPDATE connection_state SET prospect_member_id=$2,prospect_answers=$3,status='firstResults' WHERE invitation_hash=$1",[id,ids.visitor,JSON.stringify(five)]);
 assert.equal((await ledger()).length,2);let p=(await pieces('owner'))[0];assert.equal(p.kind,'step-complete');assert.equal(p.level,1);assert.equal(p.actorId,ids.visitor);assert.equal(p.target.type,'connection');assert.equal(p.status,'waiting');assert.equal((await pieces('visitor'))[0].status,'your-turn');
 await db.query("UPDATE connection_state SET prospect_answers=$2,updated_at=now() WHERE invitation_hash=$1",[id,JSON.stringify(five)]);assert.equal((await ledger()).length,2);
 await invite({channel:'friend'});await invite({bound:false});assert.equal((await ledger()).length,2);privateOnly(await read());
});
await test('unverified QR binding is hidden until both members verify without losing the first-five event',async()=>{
 await db.query('UPDATE members SET email_verified_at=NULL WHERE id=$1',[ids.visitor]);await invite({state:'firstResults',channel:'qr'});assert.equal((await ledger()).length,2);
 assert.equal((await pieces()).length,0);status(await read('visitor'),403);
 await db.query('UPDATE members SET email_verified_at=now() WHERE id=$1',[ids.visitor]);assert.equal((await pieces()).length,1);
});
await test('both next-five source hooks emit metadata only before reveal or chat consent',async()=>{
 const id=await invite({state:'secondFive'});await db.query('UPDATE invitations SET sender_answers=$2 WHERE token_hash=$1',[id,JSON.stringify(ten)]);
 let p=(await pieces('visitor')).find(p=>p.level===2);assert.equal(p.status,'your-turn');privateOnly(p);
 await db.query('UPDATE connection_state SET prospect_answers=$2 WHERE invitation_hash=$1',[id,JSON.stringify(ten)]);
 p=(await pieces('owner')).find(p=>p.level===2);assert.equal(p.status,'waiting');
 await db.query("UPDATE connection_state SET status='nextResults' WHERE invitation_hash=$1",[id]);privateOnly(await read());
 await db.query('UPDATE invitations SET sender_answers=$2 WHERE token_hash=$1',[id,JSON.stringify(ten)]);assert.equal((await ledger()).filter(e=>e.level===2).length,2);
});
await test('continue and chat transitions have explicit actor/recipient mapping and obsolete actions disappear',async()=>{
 const id=await invite({state:'firstResults'});
 await db.query("UPDATE connection_state SET status='request' WHERE invitation_hash=$1",[id]);assert.equal((await pieces('owner','continue-request')).length,1);assert.equal((await pieces('visitor','continue-request')).length,0);
 await db.query("UPDATE connection_state SET status='secondFive' WHERE invitation_hash=$1",[id]);assert.equal((await pieces('owner','continue-request')).length,0);assert.equal((await pieces('visitor','continue-ready')).length,1);
 await db.query('UPDATE invitations SET sender_answers=$2 WHERE token_hash=$1',[id,JSON.stringify(ten)]);await db.query("UPDATE connection_state SET prospect_answers=$2,status='chatRequested' WHERE invitation_hash=$1",[id,JSON.stringify(ten)]);
 assert.equal((await pieces('owner','chat-request')).length,1);assert.equal((await pieces('visitor','continue-ready')).length,0);
 await db.query("UPDATE connection_state SET status='chat' WHERE invitation_hash=$1",[id]);assert.equal((await pieces('owner','chat-request')).length,0);assert.equal((await pieces('visitor','chat-ready')).length,1);
});
await test('actual reward completion hooks all five steps exactly once and leave private answers out',async()=>{
 await invite();for(const round of REWARD_ROUNDS){
  const current=await call({api:rewards,query:''});status(current);
  const body={action:'complete',level:round.level,answers:Object.fromEntries(round.questions.map(q=>[q.id,1])),draftRevision:current.data.draftRevision};
  status(await call({api:rewards,body}));status(await call({api:rewards,body}));
 }
 const list=await pieces('visitor','step-complete');assert.deepEqual(list.map(p=>p.level),[1,2,3,4,5]);list.forEach(p=>assert.equal(p.target.type,'connection'));privateOnly(await read('visitor'));
 assert.equal((await pieces('visitor','directory-listed')).length,0);assert.equal((await pieces('visitor','intro-published')).length,0);
});
await test('actor-only profile confirmation creates no counterpart piece or phone offer',async()=>{
 await setLevel(2);await setLevel(2,'visitor');const id=await invite(),before=await ledger();
 status(await call({api:rewards,body:{action:'confirmProfilePhone',phone:'+12025550111',phoneRevision:0}}));assert.deepEqual(await ledger(),before);assert.equal((await pieces('visitor','phone-offer')).length,0);
 assert.equal((await db.query('SELECT * FROM reward_phone_offers WHERE invitation_hash=$1',[id])).rows.length,0);
});
await test('actual phone offers, same-number retries, changes, withdrawal/reoffer and mutual consent stay metadata-only',async()=>{
 await setLevel(2);await setLevel(2,'visitor');const id=await invite();status(await phone(id));status(await phone(id));
 let p=(await pieces('visitor','phone-offer'))[0];assert.equal(p.status,'your-turn');assert.equal((await ledger()).filter(e=>e.kind==='phone-offer').length,1);
 status(await ack(p,'hold','visitor'));status(await phone(id,'owner','+12025550222'));let next=(await pieces('visitor','phone-offer'))[0];assert.notEqual(next.id,p.id);assert.equal((await pieces('visitor','phone-offer')).length,1);
 status(await withdraw(id));assert.equal((await pieces('visitor','phone-offer')).length,0);status(await ack(next,'handled','visitor'),404);
 status(await phone(id));p=(await pieces('visitor','phone-offer'))[0];assert.notEqual(p.id,next.id);status(await phone(id,'visitor','+442079460222'));assert.equal((await pieces('visitor','phone-offer'))[0].status,'answered');privateOnly(await read('visitor'));
 await db.query("UPDATE connection_state SET status='nextResults' WHERE invitation_hash=$1",[id]);assert.equal((await pieces('visitor','phone-offer')).length,0);
});
await test('listing and published intro require existing viewer/author levels, consent, and media restrictions',async()=>{
 await setLevel(5);await setLevel(3,'visitor');const id=await invite();status(await publish('list'));
 await db.query("UPDATE reward_directory_profile SET video=decode('00010203','hex'),video_mime='video/mp4',duration_seconds=2 WHERE member_id=$1",[ids.owner]);status(await publish('publishVideo'));status(await publish('publishVideo'));
 assert.equal((await ledger()).filter(e=>e.kind==='intro-published').length,1);assert.equal((await pieces('visitor','directory-listed')).length,0);assert.equal((await pieces('visitor','intro-published')).length,0);
 await setLevel(4,'visitor');let p=(await pieces('visitor','intro-published'))[0];assert.equal(p.target.memberId,ids.owner);privateOnly(await read('visitor'));
 status(await publish('hideVideo'));assert.equal((await pieces('visitor','intro-published')).length,0);status(await publish('publishVideo'));assert.notEqual((await pieces('visitor','intro-published'))[0].id,p.id);
 status(await publish('unlist'));assert.equal((await pieces('visitor','directory-listed')).length,0);assert.equal((await pieces('visitor','intro-published')).length,0);status(await publish('list'));assert.equal((await pieces('visitor','directory-listed')).length,1);
 const old=await invite({state:'ended'});assert.equal((await pieces('visitor','directory-listed')).length,0);await db.query('DELETE FROM invitations WHERE token_hash=$1',[old]);assert.equal((await pieces('visitor','directory-listed')).length,1);
 await db.query("UPDATE connection_state SET status='ended' WHERE invitation_hash=$1",[id]);assert.equal((await pieces('visitor')).length,0);
});
await test('actual wildcard sibling CTE atomically emits original-recipient ask then asker-only answer with no quota cost',async()=>{
 await setLevel(3);const id=await invite();const sent=await ask(id);status(sent);status(await ask(id));
 const incoming=await pieces('visitor','wildcard-ask');assert.equal(incoming.length,1);assert.equal(incoming[0].questionId,question);assert.equal(incoming[0].status,'your-turn');assert.equal((await pieces('owner','wildcard-ask')).length,0);
 assert.equal((await ledger()).filter(e=>e.kind==='wildcard-ask').length,1);const reply=await answer(id);status(reply);assert.equal(reply.data.remaining,0);status(await answer(id));
 assert.equal((await pieces('visitor','wildcard-ask')).length,0);const answered=await pieces('owner','wildcard-answer');assert.equal(answered.length,1);assert.equal(answered[0].status,'answered');assert.equal((await pieces('visitor','wildcard-answer')).length,0);privateOnly(await read());
 assert.equal((await db.query('SELECT count(*)::int AS count FROM connection_wildcard_asks')).rows[0].count,1);
});
await test('legacy wildcard rows lacking immutable reply snapshots and ordinary chat never become pieces',async()=>{
 const id=await invite();const before=await ledger();
 await db.query("INSERT INTO connection_wildcard_asks(invitation_hash,member_id,request_id,question_id,slot,message) VALUES($1,$2,'legacy-ask-123',$3,1,$4)",[id,ids.owner,question,JSON.stringify({by:'member',text:'Legacy question'})]);
 await db.query("UPDATE connection_state SET messages=messages||$2::jsonb WHERE invitation_hash=$1",[id,JSON.stringify([{by:'prospect',text:'ordinary chat',wildcardAnswerTo:question}])]);
 assert.deepEqual(await ledger(),before);assert.equal((await pieces('visitor','wildcard-ask')).length,0);
});
await test('seen is durable, Hold defers one visit, resume records seen, and handling never resurrects',async()=>{
 await invite();const p=(await pieces())[0];assert.equal(p.shouldPrompt,true);status(await ack(p));let next=(await pieces())[0];assert.ok(next.observedAt);assert.equal(next.shouldPrompt,false);
 assert.equal((await read('owner',{query:'visit='+nextVisit})).data.pieces[0].shouldPrompt,false);
 status(await ack(p,'hold'));next=(await pieces())[0];assert.equal(next.held,true);assert.equal(next.shouldPrompt,false);assert.equal((await read()).data.pendingCount,1);
 next=(await read('owner',{query:'visit='+nextVisit})).data.pieces[0];assert.equal(next.held,false);assert.equal(next.shouldPrompt,true);
 status(await ack(p,'seen','owner',{visit:nextVisit}));assert.equal((await read('owner',{query:'visit='+nextVisit})).data.pieces[0].shouldPrompt,false);
 status(await ack(p,'handled'));status(await ack(p,'handled'));status(await ack(p,'hold'));status(await ack(p,'seen'));assert.equal((await pieces()).length,0);assert.equal((await read()).data.pendingCount,0);
 assert.equal((await ledger()).find(e=>String(e.id)===p.id).held_visit,null);
});
await test('wrong recipient, logout, expired/rotated tokens, and missing/stale POST member bindings cannot write',async()=>{
 await invite();const p=(await pieces())[0];status(await ack(p,'seen','visitor'),404);status(await ack(p,'seen','other'),404);status(await read(null),401);
 status(await read('owner',{cookie:'chempat_member='+'d'.repeat(64)}),403);
 for(const value of [null,'',ids.visitor])status(await call({body:{action:'hold',id:p.id,version:1,receiptRevision:p.receiptRevision,visit},headers:{'x-chempat-member-id':value}}),403);
 assert.equal((await ledger()).find(e=>String(e.id)===p.id).observed_at,null);
 await db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.owner,hash('d'.repeat(64))]);status(await read(),403);
});
await test('GET projects fresh bound actor after token rotation or token reassignment between reads',async()=>{
 await invite();beforeRead={matches:t=>t.includes('SELECT coalesce((SELECT jsonb_agg'),run:async()=>{
  await db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.owner,hash('d'.repeat(64))]);await db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.other,hash(tokens.owner)]);
 }};status(await read(),403);
});
await test('POST reauthorizes rotated sessions and original pair after participant locks',async()=>{
 await invite();const p=(await pieces())[0];afterLocks=tx=>tx.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.owner,hash('d'.repeat(64))]);status(await ack(p,'hold'),409);assert.equal((await ledger()).find(e=>String(e.id)===p.id).observed_at,null);
});
await test('moved or swapped original participants never inherit pieces or create new counterpart events',async()=>{
 const id=await invite(),before=(await ledger()).length;
 await db.query('UPDATE connection_state SET prospect_member_id=$2 WHERE invitation_hash=$1',[id,ids.other]);assert.equal((await pieces()).length,0);assert.equal((await pieces('other')).length,0);
 await setLevel(3);assert.equal((await ledger()).length,before);
 await db.query('UPDATE invitations SET sender_member_id=$2 WHERE token_hash=$1',[id,ids.visitor]);assert.equal((await pieces('visitor')).length,0);
});
await test('block, freeze, Trash, end, suspension and revoked verification hide feed and refuse state writes',async()=>{
 const id=await invite(),p=(await pieces())[0];
 const transitions=[
  ["INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)",[ids.owner,ids.visitor],'DELETE FROM member_blocks'],
  ["INSERT INTO connection_visibility(member_id,invitation_hash,frozen_at,action) VALUES($1,$2,now(),'freeze')",[ids.visitor,id],'DELETE FROM connection_visibility'],
  ["INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES($1,$2,'unfreeze',now())",[ids.visitor,id],'DELETE FROM connection_visibility'],
  ["UPDATE members SET blocked_at=now() WHERE id=$1",[ids.visitor],'UPDATE members SET blocked_at=NULL'],
  ["UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=$1",[ids.visitor],'UPDATE members SET suspended_until=NULL'],
  ["UPDATE members SET email_verified_at=NULL WHERE id=$1",[ids.visitor],'UPDATE members SET email_verified_at=now()'],
  ["UPDATE connection_state SET ended_at=now() WHERE invitation_hash=$1",[id],'UPDATE connection_state SET ended_at=NULL'],
  ["UPDATE connection_state SET status='ended' WHERE invitation_hash=$1",[id],"UPDATE connection_state SET status='chat'"]
 ];
 for(const [query,args,undo] of transitions){await db.query(query,args);assert.equal((await pieces()).length,0);status(await ack(p,'seen'),404);await db.exec(undo)}
 assert.equal((await pieces()).length,1);
});
await test('post-lock lifecycle mutation rejects handling and leaves receipt untouched',async()=>{
 const id=await invite(),p=(await pieces())[0];afterLocks=tx=>tx.query("INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES($1,$2,'unfreeze',now())",[ids.visitor,id]);status(await ack(p,'handled'),409);assert.equal((await ledger()).find(e=>String(e.id)===p.id).observed_at,null);
});
await test('intended-recipient mismatch and unsupported source deletion cannot revive stale actions',async()=>{
 await setLevel(3);const id=await invite();status(await ask(id));const p=(await pieces('visitor','wildcard-ask'))[0];
 await db.query('UPDATE invitations SET intended_member_id=$2 WHERE token_hash=$1',[id,ids.other]);assert.equal((await pieces('visitor')).length,0);status(await ack(p,'handled','visitor'),404);
 await db.query('UPDATE invitations SET intended_member_id=NULL WHERE token_hash=$1',[id]);await db.query('DELETE FROM connection_wildcard_answers WHERE invitation_hash=$1',[id]);assert.equal((await pieces('visitor','wildcard-ask')).length,0);status(await ack(p,'seen','visitor'),404);
 await db.query('DELETE FROM connection_state WHERE invitation_hash=$1',[id]);assert.equal((await ledger()).length,0);assert.equal((await db.query('SELECT * FROM game_piece_pairs')).rows.length,0);
});
await test('trigger and source changes roll back atomically on failure, including actual wildcard transaction',async()=>{
 await setLevel(3);const id=await invite(),before=await ledger();failCommit=true;status(await ask(id),500);assert.deepEqual(await ledger(),before);assert.equal((await db.query('SELECT * FROM connection_wildcard_asks')).rows.length,0);
 await db.exec("CREATE FUNCTION fail_piece_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic piece insert failure'; END $$; CREATE TRIGGER fail_piece_test BEFORE INSERT ON game_piece_events FOR EACH ROW EXECUTE FUNCTION fail_piece_test()");
 try{await assert.rejects(()=>db.query("UPDATE connection_state SET status='request' WHERE invitation_hash=$1",[id]));assert.equal((await db.query('SELECT status FROM connection_state WHERE invitation_hash=$1',[id])).rows[0].status,'chat');assert.deepEqual(await ledger(),before)}finally{await db.exec('DROP TRIGGER fail_piece_test ON game_piece_events;DROP FUNCTION fail_piece_test()')}
 status(await ask(id));assert.equal((await pieces('visitor','wildcard-ask')).length,1);
});
await test('malformed, oversized, unknown, cross-origin and non-JSON receipt requests do not mutate',async()=>{
 await invite();const p=(await pieces())[0],before=transactions,body={action:'seen',id:p.id,version:1,receiptRevision:p.receiptRevision,visit};
 for(const change of [{id:1},{id:'0'},{id:'9223372036854775808'},{version:2},{visit:'short'},{action:'answer'},{level:5}])status(await call({body:{...body,...change}}),400);
 status(await call({body,headers:{origin:'https://attacker.example'}}),403);status(await call({body,headers:{'content-type':'text/plain'}}),415);status(await call({body,headers:{'content-length':'2049'}}),413);status(await call({rawBody:JSON.stringify({...body,pad:'x'.repeat(2048)})}),413);status(await read('owner',{query:''}),400);
 assert.equal(transactions,before);assert.equal((await ledger()).find(e=>String(e.id)===p.id).observed_at,null);
});

await test('receipt CAS stops late same-visit and old-visit seen from overwriting a newer Hold',async()=>{
 await invite();const p=(await pieces())[0],stale={...p};status(await ack(p,'hold'));status(await ack(stale,'seen'),409);
 assert.equal((await pieces())[0].held,true);assert.equal((await read('owner',{query:'visit='+nextVisit})).data.pieces[0].shouldPrompt,true);
 const oldVisitSnapshot={...p};status(await ack(p,'hold','owner',{visit:nextVisit}));status(await ack(oldVisitSnapshot,'seen'),409);
 assert.equal((await read('owner',{query:'visit='+nextVisit})).data.pieces[0].held,true);
 const newer=(await read('owner',{query:'visit=visit-three-123'})).data.pieces[0];status(await ack(newer,'seen','owner',{visit:'visit-three-123'}));assert.equal((await read('owner',{query:'visit=visit-three-123'})).data.pieces[0].shouldPrompt,false);
 status(await ack(stale,'handled'));assert.equal((await pieces()).length,0);status(await ack(oldVisitSnapshot,'hold'));assert.equal((await pieces()).length,0);
});
await test('cursor pagination makes arrivals after one hundred seen or held pieces reachable',async()=>{
 for(let i=0;i<102;i++)await invite();const first=await read();status(first);assert.equal(first.data.pieces.length,100);assert.equal(first.data.pendingCount,102);assert.ok(first.data.nextCursor);
 await db.query('UPDATE game_piece_events SET observed_at=now(),held_visit=$2 WHERE recipient_id=$1 AND id<=$3::bigint',[ids.owner,visit,first.data.nextCursor]);
 const last=await read('owner',{query:'visit='+visit+'&after='+first.data.nextCursor});status(last);assert.equal(last.data.pieces.length,2);assert.equal(last.data.nextCursor,null);assert.ok(last.data.pieces.every(p=>p.shouldPrompt));assert.equal(last.data.pendingCount,102);
 status(await read('owner',{query:'visit='+visit+'&after=invalid'}),400);
});


await test('bounded hydration recovers the fifty-first connection using the exact established inbox projection',async()=>{
 const first=await invite();for(let i=0;i<50;i++)await invite();
 const inbox=await call({api:connection,query:'inbox=1'});status(inbox);assert.equal(inbox.data.connections.length,50);assert.equal(inbox.data.connections.some(c=>c.id===first),false);
 const p=(await pieces()).find(p=>p.connectionId===first);const h=await hydrate(p);status(h);assert.equal(h.data.connection.id,first);assert.equal(h.data.connection.side,'member');assert.equal(h.data.connection.location,'active');assert.equal(h.data.piece.id,p.id);
 const visible=inbox.data.connections[0],visiblePiece=(await pieces()).find(p=>p.connectionId===visible.id);assert.deepEqual((await hydrate(visiblePiece)).data.connection,visible);
 const recipientInbox=await call({api:connection,as:'visitor',query:'inbox=1'});status(recipientInbox);const otherVisible=recipientInbox.data.connections[0],otherPiece=(await pieces('visitor')).find(p=>p.connectionId===otherVisible.id);assert.deepEqual((await hydrate(otherPiece,'visitor')).data.connection,otherVisible);
});
await test('hydration preserves early-answer, contact, and pre-chat visibility for both original sides',async()=>{
 const id=await invite({state:'secondFive'});await db.query('UPDATE invitations SET sender_answers=$2 WHERE token_hash=$1',[id,JSON.stringify(ten)]);
 await db.query("UPDATE connection_state SET prospect_phone='+12025550111',prospect_email='private-gated@example.invalid' WHERE invitation_hash=$1",[id]);
 const own=(await pieces('owner'))[0],other=(await pieces('visitor'))[0];let h=await hydrate(own);status(h);assert.equal(h.data.connection.own_answers.length,10);assert.equal(h.data.connection.prospect_answers.length,5);assert.deepEqual(h.data.connection.messages,[]);assert.equal(h.data.connection.prospect_phone,null);assert.equal(h.data.connection.prospect_email,null);
 h=await hydrate(other,'visitor');status(h);assert.equal(h.data.connection.answers.length,5);assert.equal(h.data.connection.sender_answers.length,5);assert.equal(h.data.connection.own_answers.length,5);assert.deepEqual(h.data.connection.messages,[]);
 await db.query("UPDATE connection_state SET prospect_answers=$2,status='nextResults' WHERE invitation_hash=$1",[id,JSON.stringify(ten)]);h=await hydrate(other,'visitor');assert.equal(h.data.connection.answers.length,10);assert.equal(h.data.connection.status,'secondResults');assert.deepEqual(h.data.connection.messages,[]);
 await db.query("UPDATE connection_state SET status='chat' WHERE invitation_hash=$1",[id]);h=await hydrate(own);assert.equal(h.data.connection.messages.length,1);assert.equal(h.data.connection.prospect_email,null);assert.equal(h.data.connection.prospect_phone,null);
 await db.query("UPDATE connection_state SET status='email' WHERE invitation_hash=$1",[id]);h=await hydrate(own);assert.equal(h.data.connection.prospect_email,'private-gated@example.invalid');assert.equal(h.data.connection.prospect_phone,null);
 for(const secret of ['session_hash','recipient_id','sender_member_id','prospect_member_id','claim_hash','hydrated_piece'])assert.equal(JSON.stringify(h.data).includes(secret),false,secret+' is not a raw-row leak');
});
await test('hydration requires the actual eligible piece, original recipient and matching connection',async()=>{
 const id=await invite(),p=(await pieces())[0],other=await invite();status(await hydrate(p,'visitor'),404);status(await hydrate(p,'other'),404);status(await hydrate(p,null),401);
 status(await read('owner',{query:'visit='+visit+'&piece='+p.id+'&connection='+other}),404);
 status(await read('owner',{query:'visit='+visit+'&connection='+id}),400);status(await read('owner',{query:'visit='+visit+'&piece='+p.id}),400);
 await db.query('UPDATE connection_state SET prospect_member_id=$2 WHERE invitation_hash=$1',[id,ids.other]);status(await hydrate(p),404);
});
await test('hydration rechecks session and lifecycle in the statement selecting private source data',async()=>{
 const id=await invite(),p=(await pieces())[0];beforeRead={matches:t=>t.includes('AS hydrated_piece'),run:()=>db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.owner,hash('e'.repeat(64))])};status(await hydrate(p),404);
 await db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.owner,hash(tokens.owner)]);beforeRead={matches:t=>t.includes('AS hydrated_piece'),run:()=>db.query("UPDATE connection_state SET status='ended' WHERE invitation_hash=$1",[id])};status(await hydrate(p),404);
});
await test('hydration cannot bypass source-specific phone, directory or wildcard revocation',async()=>{
 await setLevel(5);await setLevel(4,'visitor');const id=await invite();status(await phone(id));const offer=(await pieces('visitor','phone-offer'))[0];status(await hydrate(offer,'visitor'));status(await withdraw(id));status(await hydrate(offer,'visitor'),404);
 status(await publish('list'));const listed=(await pieces('visitor','directory-listed'))[0];status(await publish('unlist'));status(await hydrate(listed,'visitor'),404);
 status(await ask(id));const card=(await pieces('visitor','wildcard-ask'))[0];status(await answer(id));status(await hydrate(card,'visitor'),404);
});


await test('observed-piece refresh keeps a resolved older chat usable without resurrecting its action',async()=>{
 await setLevel(3);const id=await invite();status(await ask(id));const card=(await pieces('visitor','wildcard-ask'))[0];
 const query='visit='+visit+'&piece='+card.id+'&connection='+id+'&refresh=1';status(await read('visitor',{query}),404);
 status(await ack(card,'seen','visitor'));status(await read('visitor',{query}));status(await answer(id));status(await hydrate(card,'visitor'),404);
 const refreshed=await read('visitor',{query});status(refreshed);assert.deepEqual(Object.keys(refreshed.data),['connection']);assert.equal(refreshed.data.connection.id,id);assert.ok(refreshed.data.connection.messages.some(m=>m.text==='private structured answer'));
 status(await read('owner',{query}),404);status(await read('other',{query}),404);assert.equal((await pieces('visitor','wildcard-ask')).length,0);
 await db.query('DELETE FROM connection_wildcard_answers WHERE invitation_hash=$1',[id]);status(await read('visitor',{query}));status(await hydrate(card,'visitor'),404);
 await db.query("UPDATE connection_state SET status='ended' WHERE invitation_hash=$1",[id]);status(await read('visitor',{query}),404);
});
await test('handled-piece refresh still rechecks original recipient, session, pair, freeze and block',async()=>{
 const id=await invite(),p=(await pieces())[0];status(await ack(p,'handled'));const query='visit='+visit+'&piece='+p.id+'&connection='+id+'&refresh=1';status(await read('owner',{query}));
 await db.query("INSERT INTO connection_visibility(member_id,invitation_hash,frozen_at,action) VALUES($1,$2,now(),'freeze')",[ids.visitor,id]);status(await read('owner',{query}),404);await db.exec('DELETE FROM connection_visibility');
 await db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.owner,ids.visitor]);status(await read('owner',{query}),404);await db.exec('DELETE FROM member_blocks');
 await db.query('UPDATE connection_state SET prospect_member_id=$2 WHERE invitation_hash=$1',[id,ids.other]);status(await read('owner',{query}),404);await db.query('UPDATE connection_state SET prospect_member_id=$2 WHERE invitation_hash=$1',[id,ids.visitor]);
 beforeRead={matches:t=>t.includes('AS hydrated_piece'),run:()=>db.query('UPDATE members SET session_hash=$2 WHERE id=$1',[ids.owner,hash('e'.repeat(64))])};status(await read('owner',{query}),404);
});
await test('expired unclaimed QR rows and unsupported wildcard source IDs do not offer actions',async()=>{
 const id=await invite({channel:'qr'}),p=(await pieces())[0];status(await hydrate(p));
 await db.query('UPDATE connection_state SET claim_hash=NULL WHERE invitation_hash=$1',[id]);assert.equal((await pieces()).length,0);status(await hydrate(p),404);
 const other=await invite();await db.query("INSERT INTO connection_wildcard_asks(invitation_hash,member_id,request_id,question_id,slot,message) VALUES($1,$2,'unsupported-123','wc-unknown-1',1,$3)",[other,ids.owner,JSON.stringify({by:'member',text:'unsupported catalog item'})]);
 await db.query("INSERT INTO connection_wildcard_answers(invitation_hash,question_id,sender_member_id,prospect_member_id,member_id) VALUES($1,'wc-unknown-1',$2,$3,$3)",[other,ids.owner,ids.visitor]);assert.equal((await pieces('visitor','wildcard-ask')).length,0);
});


await test('first-choice and required next-five pieces resolve from source success without any client receipt',async()=>{
 const id=await invite({state:'firstResults'});const first=(await pieces('visitor')).find(p=>p.level===1);assert.equal(first.status,'your-turn');assert.equal(first.observedAt,null);
 await db.query("UPDATE connection_state SET status='request' WHERE invitation_hash=$1",[id]);assert.equal((await pieces('visitor')).some(p=>p.id===first.id),false);
 // Sender's reciprocal first-five piece was informational and remains available.
 assert.equal((await pieces('owner')).filter(p=>p.level===1).length,1);
 await db.query("UPDATE connection_state SET status='secondFive' WHERE invitation_hash=$1",[id]);await db.query('UPDATE invitations SET sender_answers=$2 WHERE token_hash=$1',[id,JSON.stringify(ten)]);
 const second=(await pieces('visitor')).find(p=>p.level===2);assert.equal(second.status,'your-turn');assert.equal(second.observedAt,null);
 await db.query('UPDATE connection_state SET prospect_answers=$2 WHERE invitation_hash=$1',[id,JSON.stringify(ten)]);
 assert.equal((await pieces('visitor')).some(p=>p.id===second.id),false);assert.equal((await pieces('visitor','continue-ready')).length,0);status(await hydrate(second,'visitor'),404);
 // Counterpart completion after one's own pair answers are already saved is
 // genuinely informational, rather than an outstanding answer obligation.
 assert.equal((await pieces('owner')).filter(p=>p.level===2).length,1);
});

await test('deployment gate fails closed without touching the database',async()=>{
 const old=process.env.CHEMPAT_REVIEW_DATA,mode=process.env.CHEMPAT_RELEASE_MODE;delete process.env.CHEMPAT_REVIEW_DATA;delete process.env.CHEMPAT_RELEASE_MODE;status(await read(),503);process.env.CHEMPAT_REVIEW_DATA=old;if(mode)process.env.CHEMPAT_RELEASE_MODE=mode;
});
await test('real friend acceptance preserves canonical ID and emits only future wildcard ask and answer pieces',async()=>{
 await setLevel(3);const token=hash('accepted-friend-token'),id=hash(token);await invite({id,channel:'friend',state:'invited',bound:false,answers:[]});
 await db.query("UPDATE invitations SET expires_at=now()+interval '1 day' WHERE token_hash=$1",[id]);
 status(await ask(id),404);assert.equal((await db.query('SELECT * FROM game_piece_pairs WHERE invitation_hash=$1',[id])).rows.length,0);
 const accepted=await call({api:friend,as:'visitor',body:{action:'accept',token}});status(accepted);assert.equal(accepted.data.id,id);assert.equal(accepted.data.kind,'friend');
 const pair=(await db.query('SELECT * FROM game_piece_pairs WHERE invitation_hash=$1',[id])).rows[0];assert.equal(pair.connection_kind,'friend');assert.equal(pair.prospect_member_id,ids.visitor);assert.deepEqual(await ledger(),[]);
 status(await ask(id));const incoming=(await pieces('visitor'))[0];assert.equal(incoming.kind,'wildcard-ask');assert.equal(incoming.target.type,'wildcard');assert.equal(incoming.target.questionId,question);assert.equal(incoming.target.connectionId,id);assert.equal(incoming.status,'your-turn');assert.equal(incoming.actorId,ids.owner);assert.equal((await pieces('owner')).length,0);
 const hydrated=await hydrate(incoming,'visitor');status(hydrated);assert.equal(hydrated.data.connection.kind,'friend');assert.equal(hydrated.data.connection.claimed,true);assert.deepEqual(hydrated.data.connection.own_answers,[]);assert.deepEqual(hydrated.data.connection.sender_answers,[]);assert.equal(hydrated.data.connection.prospect_phone,null);assert.equal(hydrated.data.connection.prospect_email,null);
 const inbox=await call({api:connection,as:'visitor',query:'inbox=1'});status(inbox);assert.deepEqual(hydrated.data.connection,inbox.data.connections.find(c=>c.id===id));
 status(await ack(incoming,'seen','visitor'));const reply=await answer(id);status(reply);assert.equal(reply.data.eligible,false);assert.equal(reply.data.remaining,0);status(await answer(id));
 assert.deepEqual(await pieces('visitor'),[]);const returned=(await pieces('owner'))[0];assert.equal(returned.kind,'wildcard-answer');assert.equal(returned.status,'answered');assert.equal(returned.actorId,ids.visitor);assert.equal(returned.connectionId,id);status(await hydrate(returned));
 assert.equal((await ledger()).length,2);assert.equal((await db.query('SELECT * FROM connection_wildcard_asks')).rows.length,1);privateOnly(await read());
 // A duplicate invitation is a spent alias and must never become a target.
 const duplicateToken=hash('duplicate-friend-token'),duplicateId=hash(duplicateToken);await invite({id:duplicateId,channel:'friend',state:'invited',bound:false,answers:[]});await db.query("UPDATE invitations SET expires_at=now()+interval '1 day' WHERE token_hash=$1",[duplicateId]);
 const duplicate=await call({api:friend,as:'visitor',body:{action:'accept',token:duplicateToken}});status(duplicate);assert.equal(duplicate.data.id,id);assert.equal(duplicate.data.alreadyConnected,true);status(await ask(duplicateId),404);assert.equal((await db.query('SELECT * FROM game_piece_pairs WHERE invitation_hash=$1',[duplicateId])).rows.length,0);
});
await test('friend prospect can ask and the original sender receives the answer action below Level 3',async()=>{
 await setLevel(3,'visitor');const id=await invite({channel:'friend',answers:[]});status(await ask(id,'visitor'));const incoming=(await pieces('owner'))[0];assert.equal(incoming.actorId,ids.visitor);assert.equal(incoming.kind,'wildcard-ask');status(await hydrate(incoming));status(await answer(id,'owner'));const result=(await pieces('visitor'))[0];assert.equal(result.kind,'wildcard-answer');assert.equal(result.actorId,ids.owner);assert.equal((await pieces('owner')).length,0);
});
await test('friend feed cannot widen phone, profile, progress or other Vibe event access',async()=>{
 const id=await invite({channel:'friend',answers:[]});await setLevel(5);await setLevel(5,'visitor');status(await phone(id),409);
 for(const kind of ['step-complete','continue-request','continue-ready','chat-request','chat-ready','phone-offer','directory-listed','intro-published']){
  await db.query('SELECT game_piece_emit($1,$2,$3,$4,3::smallint)',[id,ids.owner,kind,'friend-forbidden-'+kind]);
 }
 assert.deepEqual(await ledger(),[]);status(await publish('list'));assert.deepEqual(await ledger(),[]);
 status(await ask(id));assert.equal((await pieces('visitor')).length,1);
 // Even malformed stored non-wildcard events fail both feed and hydration.
 await db.query("INSERT INTO game_piece_events(invitation_hash,sender_member_id,prospect_member_id,actor_id,recipient_id,kind,source_key,level) VALUES($1,$2,$3,$2,$3,'step-complete','step-3',3)",[id,ids.owner,ids.visitor]);
 const raw=(await ledger()).at(-1);assert.equal((await pieces('visitor')).length,1);status(await hydrate({id:String(raw.id),connectionId:id},'visitor'),404);
});
await test('friend feed, receipts and hydration recheck lifecycle, recipient binding and immutable kind',async()=>{
 const changes=[
  id=>db.query("UPDATE connection_state SET status='invited' WHERE invitation_hash=$1",[id]),
  id=>db.query('UPDATE connection_state SET ended_at=now() WHERE invitation_hash=$1',[id]),
  id=>db.query('UPDATE connection_state SET claim_hash=$2 WHERE invitation_hash=$1',[id,hash('spent-link')]),
  id=>db.query("UPDATE invitations SET channel='email' WHERE token_hash=$1",[id]),
  id=>db.query('UPDATE invitations SET intended_member_id=$2 WHERE token_hash=$1',[id,ids.other]),
  id=>db.query("UPDATE invitations SET intended_email='other@example.com' WHERE token_hash=$1",[id]),
  id=>db.query('UPDATE connection_state SET prospect_member_id=$2 WHERE invitation_hash=$1',[id,ids.other]),
  id=>db.query("INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES($1,$2,'freeze',now())",[ids.owner,id]),
  id=>db.query("INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES($1,$2,'unfreeze',now())",[ids.visitor,id]),
  ()=>db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.visitor,ids.owner]),
  ()=>db.query('UPDATE members SET blocked_at=now() WHERE id=$1',[ids.owner]),
  ()=>db.query("UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=$1",[ids.owner]),
  ()=>db.query('UPDATE members SET email_verified_at=NULL WHERE id=$1',[ids.owner])
 ];
 for(const change of changes){await reset();await setLevel(3);const id=await invite({channel:'friend',answers:[]});status(await ask(id));const piece=(await pieces('visitor'))[0];await change(id);assert.deepEqual(await pieces('visitor'),[]);status(await hydrate(piece,'visitor'),404);status(await ack(piece,'seen','visitor'),404);assert.equal((await ledger())[0].observed_at,null)}
});
await test('friend rollout and function rollback preserve immutable pairs, ledger and receipt history',async()=>{
 await setLevel(3);const id=await invite({channel:'friend',answers:[]});status(await ask(id));const piece=(await pieces('visitor'))[0];status(await ack(piece,'hold','visitor'));
 const events=await ledger(),pairs=(await db.query('SELECT * FROM game_piece_pairs ORDER BY invitation_hash')).rows,asks=(await db.query('SELECT * FROM connection_wildcard_asks')).rows;
 await db.exec(friendMigration);await db.exec(friendMigration);assert.deepEqual(await ledger(),events);assert.deepEqual((await db.query('SELECT * FROM game_piece_pairs ORDER BY invitation_hash')).rows,pairs);assert.deepEqual((await db.query('SELECT * FROM connection_wildcard_asks')).rows,asks);
 const previousFunctions=baseMigration.slice(baseMigration.indexOf('CREATE OR REPLACE FUNCTION game_piece_capture'),baseMigration.indexOf('CREATE OR REPLACE FUNCTION game_piece_member_event'));
 await db.exec(previousFunctions);assert.deepEqual(await ledger(),events);await db.query("SELECT game_piece_emit($1,$2,'wildcard-ask','rollback-does-not-emit')",[id,ids.owner]);assert.deepEqual(await ledger(),events);await db.exec(friendMigration);
 status(await answer(id));assert.equal((await pieces('owner','wildcard-answer')).length,1);
});

await db.close();console.log(`${passed} game-piece tests passed; ${failed} failed`);if(failed)process.exitCode=1;
