// Executes the candidate's real PostgreSQL SQL in a disposable local PGlite DB.
// No network, real accounts, deployed configuration, or provider delivery.
process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
process.env.DATABASE_URL='postgres://local-freezer-tests-only';
process.env.SENDGRID_API_KEY='synthetic-provider-key';
process.env.CHEMPAT_REVIEW_EMAILS='owner@example.com,visitor@example.com,other@example.com';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
await db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
await db.exec('ALTER TABLE members ADD COLUMN email_verified_at timestamptz');
const migration=fs.readFileSync(new URL('../migrations/20261001_connection_freezer.sql',import.meta.url),'utf8');
await db.exec(migration); // Repeatable additive migration.
const hash=x=>createHash('sha256').update(x).digest('hex'),photo='data:image/jpeg;base64,AA==';
const ids={owner:'11111111-1111-4111-8111-111111111111',visitor:'22222222-2222-4222-8222-222222222222',other:'33333333-3333-4333-8333-333333333333'};
const tokens={owner:'a'.repeat(64),visitor:'b'.repeat(64),other:'c'.repeat(64)};
for(const [name,id] of Object.entries(ids))await db.query('INSERT INTO members(id,session_hash,name,contact,photo,answers,email_verified_at) VALUES($1,$2,$3,$4,$5,$6,now())',[id,hash(tokens[name]),name,`${name}@example.com`,photo,JSON.stringify([0,1,2,0,1])]);
await db.query('INSERT INTO email_sessions VALUES($1,$2,now()+interval \'1 day\')',[hash(tokens.owner),'owner@example.com']);
await db.query("INSERT INTO email_sessions VALUES($1,$2,now()+interval '1 day')",[hash(tokens.visitor),'visitor@example.com']);
const query=(strings,values)=>({text:strings.reduce((q,p,i)=>q+(i?`$${i}`:'')+p,''),values});
const run=async(executor,q)=>(await executor.query(q.text,q.values)).rows;
const sql=(strings,...values)=>run(db,query(strings,values));
sql.query=async(text,values)=>(await db.query(text,values)).rows;
let beforeTransaction=null,transactions=0;
sql.transaction=async(fn,options)=>{
 assert.equal(options.isolationLevel,'ReadCommitted');transactions++;
 if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;await hook()}
 return db.transaction(async tx=>{const statements=fn((strings,...values)=>{assert.ok(Array.isArray(strings.raw),'compatible Neon template tag');return query(strings,values)});assert.match(statements[0].text,/ORDER BY id FOR UPDATE/);const result=[];for(const statement of statements)result.push(await run(tx,statement));return result});
};
globalThis.__freezerSql=sql;
const safetyCalls=[];
globalThis.__freezerOps={standing:async()=>null,requireVerified:async()=>null,log:async()=>{},linkProspect:async()=>{},memberIdFromToken:async(_sql,token)=>Object.keys(tokens).find(name=>tokens[name]===token)?ids[Object.keys(tokens).find(name=>tokens[name]===token)]:null,endConnection:async(_sql,args)=>{safetyCalls.push(args);return {status:200,body:{ok:true}}}};
async function load(name){const src=fs.readFileSync(new URL(`../api/${name}.mjs`,import.meta.url),'utf8').replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__freezerSql;').replace("import * as ops from './_ops.mjs';",'const ops=globalThis.__freezerOps;').replace(/from '\.\/(.*?)\.mjs'/g,(_,name)=>`from '${new URL(`../api/${name}.mjs`,import.meta.url).href}'`);return (await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'))).default}
const connection=await load('connection'),friend=await load('friend'),email=await load('email');
const mail=[];globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.sendgrid.com/v3/mail/send');mail.push(JSON.parse(options.body));return new Response(null,{status:202})};
async function call(api,{as='owner',body,query='',cookie}={}){const response=await api.fetch(new Request(`https://isolated.example/api/test?${query}`,{method:body===undefined?'GET':'POST',headers:{cookie:cookie??(as?`chempat_member=${tokens[as]}; chempat_session=${tokens[as]}`:'')},...(body===undefined?{}:{body:JSON.stringify(body)})}));return {status:response.status,data:await response.json()}}
const action=(action,id,as='owner',extra={})=>call(connection,{as,body:{action,id,...extra}});
const inbox=async(as='owner')=>{const r=await call(connection,{as,query:'inbox=1'});assert.equal(r.status,200,JSON.stringify(r.data));return r.data};
let sequence=0;
async function invite({sender='owner',prospect=null,channel='email',status='invited',date=null,expired=false,shared=null}={}){
 const token=(++sequence).toString(16).padStart(64,'0'),id=hash(token);
 await sql`INSERT INTO invitations(token_hash,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,sender_member_id,channel,expires_at,created_at) VALUES(${id},${'hidden-sender@example.com'},${sender},${photo},'[0,1,2,0,1]'::jsonb,${'Named recipient'},${channel==='qr'?'':'explicit@example.com'},${ids[sender]},${channel},now()+${expired?'-1 day':'1 day'}::interval,coalesce(${date}::timestamptz,now()))`;
 await sql`INSERT INTO connection_state(invitation_hash,prospect_member_id,prospect_name,prospect_photo,prospect_answers,status,messages,prospect_email) VALUES(${id},${ids[prospect]||null},${prospect},${photo},'[1,2,0,1,2]'::jsonb,${status},'[{"by":"member","text":"private chat"}]'::jsonb,${shared})`;
 return {id,token};
}
const state=async id=>(await sql`SELECT * FROM connection_state WHERE invitation_hash=${id}`)[0];
const clear=async()=>{await db.exec('DELETE FROM invitations; DELETE FROM member_blocks')};

// A named reservation is only Created until the existing provider-success event
// proves it was sent. Missing/legacy logs and QR creation remain conservative.
for(const [channel,event] of [['email','invite_emailed'],['friend','friend_invited']]){
 await clear();const invitation=await invite({channel});
 assert.equal((await inbox()).connections[0].invitationDateLabel,'Created','reserved/named is not proof of send');
 await sql`INSERT INTO activity(kind,connection_id) VALUES(${event},${invitation.id})`;
 assert.equal((await inbox()).connections[0].invitationDateLabel,'Sent');
 const result=await action('freeze',invitation.id);assert.equal(result.data.connection.invitationDateLabel,'Sent');
 assert.equal((await inbox()).connections[0].invitationDateLabel,'Sent','history preserves actual sending evidence');
 if(channel==='friend'){
  await sql`UPDATE invitations SET recipient_name='',recipient_email='' WHERE token_hash=${invitation.id}`;
  assert.equal((await inbox()).connections[0].invitationDateLabel,'Created','old unnamed friend links remain Created');
 }
}
await clear();const createdQr=await invite({channel:'qr'});
await sql`INSERT INTO activity(kind,connection_id) VALUES('invite_emailed',${createdQr.id})`;
assert.equal((await inbox()).connections[0].invitationDateLabel,'Created');
await clear();

// Personal freezes persist across messages, do not modify the peer, and redact poll payloads.
let pair=await invite({prospect:'visitor',status:'chat'});
let result=await action('freeze',pair.id);assert.equal(result.status,200);assert.equal(result.data.connection.freezerAction,'freeze');assert.ok(result.data.connection.frozenAt);assert.equal(result.data.connection.canBlock,true);
assert.equal((await state(pair.id)).status,'chat');assert.equal((await inbox('visitor')).connections[0].freezerAction,null);
let frozen=(await inbox()).connections[0];for(const key of ['messages','prospect_photo','sender_photo','prospect_answers','own_answers','sender_answers'])assert.equal(key in frozen,false,key);
assert.equal(frozen.historyEmail,'explicit@example.com');assert(!JSON.stringify(frozen).includes('hidden-sender'));
assert.equal((await action('message',pair.id,'visitor',{text:'New message'})).status,200);
assert.equal((await inbox()).connections[0].frozenAt,frozen.frozenAt,'message never unfreezes');
assert.equal((await action('unfreeze',pair.id,'other')).status,404);
assert.equal((await action('unfreeze',pair.id)).status,200);assert.equal((await inbox()).connections[0].messages.length,2);
assert.equal((await inbox('visitor')).connections[0].historyEmail,null);

// Unclaimed counterpart cannot be inferred from delivery email or forged kind/ID.
await clear();pair=await invite({channel:'friend'});
assert.equal((await inbox()).connections[0].canCancel,true);assert.equal((await inbox()).connections[0].canBlock,false);
assert.equal((await action('block',pair.id,'owner',{kind:'vibe',blockedId:ids.visitor})).status,409);
assert.equal((await action('freeze',pair.id)).status,200);
assert.equal((await action('cancel',pair.id,'visitor')).status,404);
result=await action('cancel',pair.id);assert.equal(result.status,200);assert.equal(result.data.connection.freezerAction,'cancel');assert.ok(result.data.connection.endedAt);
assert.equal((await action('unfreeze',pair.id)).status,409);
assert.equal((await call(friend,{as:'visitor',body:{action:'accept',token:pair.token}})).status,410);
assert.equal((await action('cancel',pair.id)).status,200,'repeat cancel is idempotent');
assert.equal((await sql`SELECT * FROM member_blocks`).length,0);

// A historically closed invite requires no backfill, guessed identity, or fake dates.
await clear();pair=await invite({channel:'friend',date:'2025-01-02T03:04:05Z'});
await sql`UPDATE invitations SET recipient_name='',recipient_email='' WHERE token_hash=${pair.id}`;
await sql`UPDATE connection_state SET status='ended',ended_by='member',ended_at='2025-01-03T04:05:06Z' WHERE invitation_hash=${pair.id}`;
let old=(await inbox()).connections[0];assert.equal(old.freezerAction,'cancel');assert.equal(old.frozenAt,null);assert.equal(new Date(old.freezerActionAt).toISOString(),'2025-01-03T04:05:06.000Z');assert.equal(old.historyEmail,null);assert.equal((await sql`SELECT * FROM connection_visibility`).length,0);
await sql`UPDATE connection_state SET ended_at=NULL WHERE invitation_hash=${pair.id}`;assert.equal((await inbox()).connections[0].freezerActionAt,null);assert.equal((await action('cancel',pair.id)).status,200);assert.equal((await sql`SELECT * FROM connection_visibility`).length,0,'retry does not manufacture missing legacy dates');

// Explicit sharing is retained after closing; request contact never becomes history.
await clear();pair=await invite({channel:'qr',prospect:'visitor',status:'ended',shared:'explicit-share@example.com'});
assert.equal((await inbox()).connections[0].historyEmail,null,'stored request/contact without explicit-share evidence stays private');
await sql`INSERT INTO activity(kind,connection_id) VALUES('email_shared',${pair.id})`;
assert.equal((await inbox()).connections[0].historyEmail,'explicit-share@example.com');
assert.equal((await inbox('visitor')).connections[0].historyEmail,null);
await sql`UPDATE connection_state SET status='email' WHERE invitation_hash=${pair.id}`;
assert.equal((await action('freeze',pair.id)).data.connection.historyEmail,'explicit-share@example.com');
await sql`UPDATE connection_state SET status='ended',ended_by='prospect',ended_at=now() WHERE invitation_hash=${pair.id}`;
assert.equal((await inbox()).connections[0].freezerAction,'ended','closed state outranks an earlier personal freeze');

// Pending-only cancel cannot win after acceptance, including stale pre-read race.
await clear();pair=await invite({channel:'friend'});
beforeTransaction=async()=>{await sql`UPDATE connection_state SET status='chat',prospect_member_id=${ids.visitor} WHERE invitation_hash=${pair.id}`};
assert.equal((await action('cancel',pair.id)).status,409);assert.equal((await state(pair.id)).status,'chat');assert.equal((await sql`SELECT * FROM connection_visibility`).length,0);

// Block ends both kinds and directions, preserves report history, hides all secrets,
// and prevents old links, binding, chat, reactions, contact sharing, and delivery.
await clear();pair=await invite({prospect:'visitor',channel:'friend',status:'chat'});
const reverse=await invite({sender:'visitor',prospect:'owner',status:'chat'}),pending=await invite(),qr=await invite({channel:'qr'}),friendLink=await invite({channel:'friend'});
result=await action('block',pair.id);assert.equal(result.status,200);assert.equal(result.data.connection.blockedByMe,true);assert.equal((await state(reverse.id)).status,'ended');assert.equal((await sql`SELECT * FROM member_blocks`).length,1);
assert.equal((await action('unfreeze',pair.id)).status,409);assert.equal((await action('block',pair.id)).status,200);assert.equal((await sql`SELECT * FROM member_blocks`).length,1);
for(const [id,as] of [[pair.id,'owner'],[pair.id,'visitor'],[reverse.id,'owner'],[reverse.id,'visitor']])for(const operation of ['message','react','second','email','chat','request','decision'])assert.equal((await action(operation,id,as,{text:'blocked',index:0,reaction:'like',answers:Array(10).fill(1),email:'share@example.com',name:'test',photo,decision:'accept'})).status,403,operation);
assert.equal((await call(connection,{as:'visitor',body:{action:'first',token:pending.token,photo,answers:[0,1,2,0,1]}})).status,403);
assert.equal((await call(connection,{as:'visitor',query:'invite='+qr.token})).status,403);assert.equal((await state(qr.id)).claim_hash,null);
assert.equal((await call(friend,{as:'visitor',body:{action:'accept',token:friendLink.token}})).status,403);
assert.equal((await call(friend,{as:'visitor',query:'invite='+friendLink.token})).data.status,'unavailable');
for(const as of ['owner','visitor'])assert.equal((await action('report',pair.id,as,{reason:'harassment'})).status,200,'blocked/ended pairs keep safety reporting');
assert.deepEqual(safetyCalls.slice(-2).map(x=>x.side),['member','prospect']);
const mailBefore=mail.length;
for(const [api,actionName] of [[friend,'create'],[email,'send']])for(const [as,target] of [['owner','visitor'],['visitor','owner']]){
 const send=await call(api,{as,body:{action:actionName,recipient:{name:target,email:`${target}@example.com`}}});assert([403,401].includes(send.status),JSON.stringify(send));
}
assert.equal(mail.length,mailBefore,'blocked invitations never call provider');
for(const as of ['owner','visitor'])for(const row of (await inbox(as)).connections.filter(x=>[pair.id,reverse.id].includes(x.id))){assert.equal('messages' in row,false);assert.equal('sender_answers' in row,false);assert.equal(row.status,'ended')}

// Write-time predicate defeats a block inserted after the action's initial read.
await clear();pair=await invite({prospect:'visitor',status:'chat'});
beforeTransaction=async()=>{await sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.visitor},${ids.owner})`};
assert.equal((await action('message',pair.id,'owner',{text:'must not append'})).status,409);assert.equal((await state(pair.id)).messages.length,1);
await clear();pair=await invite();
beforeTransaction=async()=>{await sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.visitor},${ids.owner})`};
assert.equal((await call(connection,{as:'visitor',body:{action:'first',token:pair.token,photo,answers:[0,1,2,0,1]}})).status,409);assert.equal((await state(pair.id)).prospect_member_id,null);

// Fresh block predicates also protect QR claim, Friend acceptance, reactions,
// second-round writes, and thaw, even when stale state still looks active.
for(const operation of ['qr','friend','react','second','unfreeze']){
 await clear();pair=await invite({channel:operation==='qr'?'qr':operation==='friend'?'friend':'email',prospect:['qr','friend'].includes(operation)?null:'visitor',status:['qr','friend'].includes(operation)?'invited':operation==='second'?'secondFive':'chat'});
 if(operation==='unfreeze')assert.equal((await action('freeze',pair.id)).status,200);
 beforeTransaction=async()=>{await sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.visitor},${ids.owner})`};
 const result=operation==='qr'?await call(connection,{as:'visitor',query:'invite='+pair.token}):operation==='friend'?await call(friend,{as:'visitor',body:{action:'accept',token:pair.token}}):await action(operation,pair.id,'owner',{index:0,reaction:'like',answers:[0,1,2,0,1,0,1,2,0,1]});
 assert.equal(result.status,409,operation);
 const unchanged=await state(pair.id);assert.equal(unchanged.claim_hash,null);assert.equal(unchanged.messages[0].reactions,undefined);
 if(['qr','friend'].includes(operation))assert.equal(unchanged.prospect_member_id,null);
 if(operation==='second')assert.equal((await sql`SELECT jsonb_array_length(sender_answers) AS count FROM invitations WHERE token_hash=${pair.id}`)[0].count,5);
 if(operation==='unfreeze')assert.ok((await sql`SELECT frozen_at FROM connection_visibility WHERE invitation_hash=${pair.id}`)[0].frozen_at);
}
// Cancel commits before a stale Friend accept or Vibe first-five binding.
for(const channel of ['friend','email']){
 await clear();pair=await invite({channel});
 beforeTransaction=async()=>assert.equal((await action('cancel',pair.id)).status,200);
 const result=channel==='friend'?await call(friend,{as:'visitor',body:{action:'accept',token:pair.token}}):await call(connection,{as:'visitor',body:{action:'first',token:pair.token,photo,answers:[0,1,2,0,1]}});
 assert.equal(result.status,409);assert.equal((await state(pair.id)).status,'ended');assert.equal((await state(pair.id)).prospect_member_id,null);
}

// Visibility writes cannot overwrite block/cancel history after a stale read.
for(const terminal of ['block','cancel']){
 await clear();pair=await invite({prospect:terminal==='block'?'visitor':null,status:terminal==='block'?'chat':'invited'});
 let terminalAt;
 beforeTransaction=async()=>{const ended=await action(terminal,pair.id);assert.equal(ended.status,200);terminalAt=ended.data.connection.freezerActionAt};
 assert.equal((await action('freeze',pair.id)).status,409);
 const row=(await inbox()).connections[0];assert.equal(row.freezerAction,terminal);assert.equal(row.freezerActionAt,terminalAt);
}
await clear();pair=await invite({channel:'friend',expired:true});
assert.equal((await action('cancel',pair.id)).status,409);assert.equal((await state(pair.id)).ended_at,null);assert.equal((await inbox()).connections[0].freezerAction,'expired');

// A QR's initial expiry ends only unclaimed codes. A claimed, unbound QR
// remains pending and can still be canceled after its initial scan window.
await clear();pair=await invite({channel:'qr',expired:true});
await sql`UPDATE connection_state SET claim_hash=${'f'.repeat(64)} WHERE invitation_hash=${pair.id}`;
assert.equal((await inbox()).connections[0].canCancel,true);assert.equal((await action('cancel',pair.id)).status,200);
await clear();pair=await invite({channel:'friend'});
await sql`UPDATE invitations SET expires_at=NULL WHERE token_hash=${pair.id}`;
assert.equal((await inbox()).connections[0].freezerAction,'expired');assert.equal((await inbox()).connections[0].freezerActionAt,null);

// Block wins a race immediately before email/Friend send reservation; no provider call.
for(const [api,operation] of [[friend,'create'],[email,'send']]){
 await clear();const before=mail.length;
 beforeTransaction=async()=>{await sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.visitor},${ids.owner})`};
 assert.equal((await call(api,{body:{action:operation,recipient:{name:'Visitor',email:'visitor@example.com'}}})).status,403);
 assert.equal(mail.length,before);assert.equal((await sql`SELECT * FROM invitations`).length,0);
}

// History is separately bounded and reachable beyond 50 newer active rows.
await clear();
for(let i=0;i<53;i++)await invite({date:'2026-09-01T00:00:00Z'});
for(let i=0;i<55;i++)await invite({channel:'friend',expired:true,date:`2024-01-01T00:00:00.${String(i).padStart(6,'0')}Z`});
const page1=await inbox();assert.equal(page1.connections.length,100);assert.ok(page1.freezerCursor);assert.equal(page1.connections.filter(x=>x.freezerAction==='expired').length,50);
const page2=await call(connection,{query:'freezer=1&cursor='+encodeURIComponent(page1.freezerCursor)});assert.equal(page2.status,200);assert.equal(page2.data.connections.length,5);assert.equal(page2.data.freezerCursor,null);assert.equal(new Set([...page1.connections,...page2.data.connections].map(x=>x.id)).size,105);
assert.equal((await call(connection,{query:'freezer=1&cursor=garbage'})).status,400);
assert.deepEqual((await inbox('other')).connections,[]);
assert.ok(transactions>10);
// Compile the guarded batch through the production Neon client as well. Its
// fetch hook is fully stubbed; this catches tag/parameter transport differences.
const {neon,neonConfig}=await import('@neondatabase/serverless');
const {lockedWrite}=await import('../api/_connections.mjs');
const previousFetch=neonConfig.fetchFunction;
let compiled;
neonConfig.fetchFunction=async(_url,options)=>{compiled=JSON.parse(options.body);return {ok:true,json:async()=>({results:compiled.queries.map(()=>({fields:[],rows:[]}))})}};
try{
 await lockedWrite(neon('postgres://synthetic@unit.invalid/isolated'),pair.id,ids.owner,tx=>tx`UPDATE connection_state SET status='chat' WHERE invitation_hash=${pair.id} RETURNING invitation_hash`);
 assert.match(compiled.queries[0].query,/ORDER BY id FOR UPDATE/);assert.match(compiled.queries[1].query,/NOT EXISTS.*member_blocks/s);assert.equal(compiled.queries[1].params.at(-1),pair.id);
}finally{neonConfig.fetchFunction=previousFetch}
await db.close();
console.log('Freezer actual-SQL privacy, cancellation, block guards, stale-write races, delivery, and bounded history passed');
