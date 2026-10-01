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
await db.exec('ALTER TABLE members ADD COLUMN IF NOT EXISTS email_verified_at timestamptz');
// Apply every checked-in additive migration twice against the fresh schema.
for(let pass=0;pass<2;pass++)for(const filename of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())await db.exec(fs.readFileSync(new URL('../migrations/'+filename,import.meta.url),'utf8'));
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
const mail=[];let providerStatus=202,providerHook=null;
globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.sendgrid.com/v3/mail/send');const payload=JSON.parse(options.body);assert.ok(payload.personalizations[0].to.every(({email})=>email.endsWith('@example.com')),'synthetic mail only');mail.push(payload);if(providerHook){const hook=providerHook;providerHook=null;await hook()}return new Response(null,{status:providerStatus})};
async function call(api,{as='owner',body,query='',cookie}={}){const response=await api.fetch(new Request(`https://isolated.example/api/test?${query}`,{method:body===undefined?'GET':'POST',headers:{cookie:cookie??(as?`chempat_member=${tokens[as]}; chempat_session=${tokens[as]}`:'')},...(body===undefined?{}:{body:JSON.stringify(body)})}));return {status:response.status,data:await response.json()}}
const action=(action,id,as='owner',extra={})=>call(connection,{as,body:{action,id,...extra}});
const inbox=async(as='owner')=>{const r=await call(connection,{as,query:'inbox=1'});assert.equal(r.status,200,JSON.stringify(r.data));return r.data};
let sequence=0;
async function invite({sender='owner',prospect=null,channel='email',status='invited',date=null,expired=false,shared=null,recipientName='Named recipient',recipientEmail=channel==='qr'?'':'explicit@example.com'}={}){
 const token=(++sequence).toString(16).padStart(64,'0'),id=hash(token);
 await sql`INSERT INTO invitations(token_hash,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,sender_member_id,channel,expires_at,created_at) VALUES(${id},${'hidden-sender@example.com'},${sender},${photo},'[0,1,2,0,1]'::jsonb,${recipientName},${recipientEmail},${ids[sender]},${channel},now()+${expired?'-1 day':'1 day'}::interval,coalesce(${date}::timestamptz,now()))`;
 await sql`INSERT INTO connection_state(invitation_hash,prospect_member_id,prospect_name,prospect_photo,prospect_answers,status,messages,prospect_email) VALUES(${id},${ids[prospect]||null},${prospect},${photo},'[1,2,0,1,2]'::jsonb,${status},'[{"by":"member","text":"private chat"}]'::jsonb,${shared})`;
 return {id,token};
}
const state=async id=>(await sql`SELECT * FROM connection_state WHERE invitation_hash=${id}`)[0];
const clear=async()=>{assert.equal(beforeTransaction,null,'race hook must have run');assert.equal(providerHook,null,'provider hook must have run');await db.exec('DELETE FROM invitations; DELETE FROM member_blocks')};
const history=async(as='owner',query='freezer=1')=>{const r=await call(connection,{as,query});assert.equal(r.status,200,JSON.stringify(r.data));return r.data};
const trash=async(as='owner',cursor='')=>history(as,'trash=1'+(cursor?'&cursor='+encodeURIComponent(cursor):''));
const visible=async(id,as='owner')=>(await inbox(as)).connections.find(row=>row.id===id);
const privateHistory=row=>{for(const key of ['messages','photo','answers','prospect_photo','sender_photo','prospect_answers','own_answers','sender_answers','prospect_phone','prospect_email','intended_email'])assert.equal(key in row,false,key);assert(!JSON.stringify(row).includes('hidden-sender'))};
const requestId=label=>hash('synthetic-reinvite-'+label);
const prepare=(id,kind='vibe',as='owner')=>action('prepareReinvite',id,as,{kind});
const reinvite=(id,kind='vibe',as='owner',label=id,extra={})=>action('reinvite',id,as,{kind,requestId:requestId(label),...extra});
const tokenFromMail=payload=>{const token=payload.content.find(item=>item.type==='text/plain')?.value.match(/[?&](?:invite|friend)=([a-f0-9]{64})/)?.[1];assert.ok(token,'fresh mail contains an invitation token');return token};
const invitation=async id=>(await sql`SELECT * FROM invitations WHERE token_hash=${id}`)[0];
const signedOutBound=async(kind,token)=>{const preview=await call(kind==='friend'?friend:connection,{as:null,query:'invite='+token});assert.equal(preview.status,kind==='friend'?200:401);assert.equal(preview.data.requiresSignIn,true);if(kind==='friend')assert.deepEqual(preview.data,{kind:'friend',status:'signInRequired',requiresSignIn:true});for(const key of ['name','photo','answers','recipient','recipient_name','recipient_email','sender_name','sender_photo','sender_answers','prospect_name','prospect_photo','intended_email'])assert.equal(key in preview.data,false,'signed-out target preview: '+key);assert(!JSON.stringify(preview.data).includes('@example.com'))};

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

// Freeze permanently ends exactly one invitation for both participants. It does
// not close another A–B invitation or a third member's C–B conversation.
let pair=await invite({prospect:'visitor',status:'chat'});
const parallel=await invite({prospect:'visitor',channel:'friend',status:'chat'});
const unrelated=await invite({sender:'other',prospect:'visitor',status:'chat'});
let result=await action('freeze',pair.id);assert.equal(result.status,200);assert.equal(result.data.connection.freezerAction,'freeze');assert.ok(result.data.connection.frozenAt);assert.ok(result.data.connection.endedAt);assert.equal(result.data.connection.location,'freezer');assert.equal(result.data.connection.canTrash,true);assert.equal(result.data.connection.canRestore,false);assert.equal(result.data.connection.canReinvite,true);
const frozen=(await visible(pair.id));privateHistory(frozen);assert.equal(frozen.historyEmail,'explicit@example.com');
assert.equal((await state(pair.id)).status,'ended');assert.equal((await state(pair.id)).messages.length,1,'history is retained in storage');
for(const as of ['owner','visitor']){const row=await visible(pair.id,as);assert.equal(row.location,'freezer');privateHistory(row);assert.equal((await action('message',pair.id,as,{text:'must not append'})).status,409);assert.equal((await action('react',pair.id,as,{index:0,reaction:'like'})).status,409)}
assert.equal((await state(parallel.id)).status,'chat');assert.equal((await state(unrelated.id)).status,'chat');
assert.equal((await action('message',unrelated.id,'other',{text:'unrelated remains open'})).status,200);
assert.equal((await call(connection,{as:'visitor',query:'invite='+pair.token})).status,410,'old Vibe token is dead');
assert.equal((await action('unfreeze',pair.id,'other')).status,404);assert.ok((await action('unfreeze',pair.id)).status>=400,'old unfreeze cannot reopen consent');
assert.equal((await visible(pair.id,'visitor')).historyEmail,null);
const endedAt=(await state(pair.id)).ended_at,actionAt=frozen.freezerActionAt;
assert.equal((await action('freeze',pair.id)).status,200);assert.equal((await state(pair.id)).ended_at.toISOString(),endedAt.toISOString());assert.equal((await visible(pair.id)).freezerActionAt,actionAt,'repeat Freeze preserves its original action time');

// Trash is a personal, recoverable location. Restore returns the same ended
// history record to Freezer without reviving its chat or invitation token.
assert.equal((await action('trash',pair.id,'other')).status,404);
result=await action('trash',pair.id);assert.equal(result.status,200);assert.equal(result.data.connection.location,'trash');assert.equal(result.data.connection.canRestore,true);assert.equal(result.data.connection.canTrash,false);privateHistory(result.data.connection);
const trashedAt=result.data.connection.trashedAt;assert.ok(trashedAt);
assert.equal(await visible(pair.id),undefined);assert(!(await history()).connections.some(row=>row.id===pair.id));assert.equal((await trash()).connections[0].id,pair.id);assert.equal((await visible(pair.id,'visitor')).location,'freezer');assert.equal((await trash('visitor')).connections.length,0);
assert.equal((await action('trash',pair.id)).data.connection.trashedAt,trashedAt,'repeat Trash preserves first trash time');
result=await action('restore',pair.id);assert.equal(result.status,200);assert.equal(result.data.connection.location,'freezer');assert.equal(result.data.connection.status,'ended');assert.equal(result.data.connection.endedAt,frozen.endedAt);assert.equal(result.data.connection.freezerActionAt,actionAt);assert.equal(result.data.connection.canRestore,false);assert.equal((await trash()).connections.length,0);assert.equal((await state(pair.id)).messages.length,1);assert.equal((await action('message',pair.id,'visitor',{text:'still closed'})).status,409);assert.equal((await call(connection,{as:'visitor',query:'invite='+pair.token})).status,410);
assert.equal((await action('restore',pair.id)).status,200,'repeat Restore is harmless');

// Unclaimed counterpart cannot be inferred from delivery email or forged kind/ID.
await clear();pair=await invite({channel:'friend'});
assert.equal((await inbox()).connections[0].canCancel,true);assert.equal((await inbox()).connections[0].canBlock,false);
assert.equal((await action('block',pair.id,'owner',{kind:'vibe',blockedId:ids.visitor})).status,409);
assert.equal((await action('cancel',pair.id,'visitor')).status,404);
result=await action('cancel',pair.id);assert.equal(result.status,200);assert.equal(result.data.connection.freezerAction,'cancel');assert.ok(result.data.connection.endedAt);
assert.ok((await action('unfreeze',pair.id)).status>=400);
assert.equal((await call(friend,{as:'visitor',body:{action:'accept',token:pair.token}})).status,410);
assert.equal((await action('cancel',pair.id)).status,200,'repeat cancel is idempotent');
assert.equal((await sql`SELECT * FROM member_blocks`).length,0);

// A historically closed invite requires no backfill, guessed identity, or fake dates.
await clear();pair=await invite({channel:'friend',date:'2025-01-02T03:04:05Z'});
await sql`UPDATE invitations SET recipient_name='',recipient_email='' WHERE token_hash=${pair.id}`;
await sql`UPDATE connection_state SET status='ended',ended_by='member',ended_at='2025-01-03T04:05:06Z' WHERE invitation_hash=${pair.id}`;
let old=(await inbox()).connections[0];assert.equal(old.freezerAction,'cancel');assert.equal(old.frozenAt,null);assert.equal(new Date(old.freezerActionAt).toISOString(),'2025-01-03T04:05:06.000Z');assert.equal(old.historyEmail,null);assert.equal((await sql`SELECT * FROM connection_visibility`).length,0);
await sql`UPDATE connection_state SET ended_at=NULL WHERE invitation_hash=${pair.id}`;assert.equal((await inbox()).connections[0].freezerActionAt,null);assert.equal((await action('cancel',pair.id)).status,200);assert.equal((await sql`SELECT * FROM connection_visibility`).length,0,'retry does not manufacture missing legacy dates');
assert.equal((await action('trash',pair.id)).status,200);assert.equal((await action('restore',pair.id)).status,200);assert.equal((await state(pair.id)).ended_at,null);assert.equal((await visible(pair.id)).freezerActionAt,null,'Trash/Restore cannot manufacture a missing legacy end time');

// Explicit sharing is retained after closing; request contact never becomes history.
await clear();pair=await invite({channel:'qr',prospect:'visitor',status:'ended',shared:'explicit-share@example.com'});
assert.equal((await inbox()).connections[0].historyEmail,null,'stored request/contact without explicit-share evidence stays private');
await sql`INSERT INTO activity(kind,connection_id) VALUES('email_shared',${pair.id})`;
assert.equal((await inbox()).connections[0].historyEmail,'explicit-share@example.com');
assert.equal((await inbox('visitor')).connections[0].historyEmail,null);
await sql`UPDATE connection_state SET status='email' WHERE invitation_hash=${pair.id}`;
assert.equal((await action('freeze',pair.id)).data.connection.historyEmail,'explicit-share@example.com');
assert.equal((await inbox()).connections[0].location,'freezer');assert.equal((await inbox()).connections[0].historyEmail,'explicit-share@example.com','explicitly shared address survives permanent Freeze');

// Legacy email/tests status itself records explicit sharing even when its old
// activity event is absent. Closing the interaction must retain that evidence.
for(const status of ['email','tests'])for(const operation of ['freeze','block']){
 await clear();pair=await invite({channel:'qr',prospect:'visitor',status,shared:'explicit-share@example.com'});
 assert.equal((await sql`SELECT * FROM activity WHERE connection_id=${pair.id} AND kind='email_shared'`).length,0);assert.equal((await visible(pair.id)).historyEmail,'explicit-share@example.com');
 result=await action(operation,pair.id);assert.equal(result.status,200);assert.equal(result.data.connection.historyEmail,'explicit-share@example.com');assert.equal((await visible(pair.id)).historyEmail,'explicit-share@example.com');assert.equal((await visible(pair.id,'visitor')).historyEmail,null);
 assert.equal((await action('trash',pair.id)).status,200);assert.equal((await action('restore',pair.id)).status,200);assert.equal((await visible(pair.id)).historyEmail,'explicit-share@example.com');
}

// Pending-only cancel cannot win after acceptance, including stale pre-read race.
await clear();pair=await invite({channel:'friend'});
beforeTransaction=async()=>{await sql`UPDATE connection_state SET status='chat',prospect_member_id=${ids.visitor} WHERE invitation_hash=${pair.id}`};
assert.equal((await action('cancel',pair.id)).status,409);assert.equal((await state(pair.id)).status,'chat');assert.equal((await sql`SELECT * FROM connection_visibility`).length,0);

// Block ends both kinds and directions, preserves report history, hides all secrets,
// and prevents old links, binding, chat, reactions, contact sharing, and delivery.
await clear();pair=await invite({prospect:'visitor',channel:'friend',status:'chat'});
const unaffected=await invite({sender:'other',prospect:'visitor',status:'chat'});
const reverse=await invite({sender:'visitor',prospect:'owner',status:'chat'}),pending=await invite(),qr=await invite({channel:'qr'}),friendLink=await invite({channel:'friend'});
result=await action('block',pair.id);assert.equal(result.status,200);assert.equal(result.data.connection.blockedByMe,true);assert.equal((await state(reverse.id)).status,'ended');assert.equal((await state(unaffected.id)).status,'chat','A–B block must not affect C–B');assert.equal((await sql`SELECT * FROM member_blocks`).length,1);
assert.ok((await action('unfreeze',pair.id)).status>=400);assert.equal((await action('block',pair.id)).status,200);assert.equal((await sql`SELECT * FROM member_blocks`).length,1);
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

// Both people may own independent blocks. Trash and Restore do not revoke either
// block; Unblock deletes only the caller's block, and never restores old consent.
assert.equal((await action('block',pair.id,'visitor')).status,200);assert.equal((await sql`SELECT * FROM member_blocks`).length,2);
const blockedTime=(await state(pair.id)).ended_at;
assert.equal((await visible(pair.id)).canUnblock,true);assert.equal((await visible(pair.id,'visitor')).canUnblock,true);
assert.equal((await action('trash',pair.id)).status,200);assert.equal((await action('restore',pair.id)).status,200);assert.equal((await sql`SELECT * FROM member_blocks`).length,2);
assert.equal((await action('unblock',pair.id,'other')).status,404);
assert.equal((await action('unblock',pair.id)).status,200);assert.equal((await sql`SELECT * FROM member_blocks`).length,1);assert.equal((await sql`SELECT blocker_id FROM member_blocks`)[0].blocker_id,ids.visitor);
assert.equal((await visible(pair.id)).blockedByMe,false);assert.equal((await visible(pair.id)).canUnblock,false);assert.equal((await visible(pair.id)).canReinvite,false);assert.equal((await visible(pair.id,'visitor')).blockedByMe,true);
assert.equal((await action('unblock',pair.id)).status,200,'repeated Unblock cannot remove the other member’s block');assert.equal((await sql`SELECT * FROM member_blocks`).length,1);
const stillBlocked=await reinvite(pair.id,'friend');assert.equal(stillBlocked.status,403);assert.equal(mail.length,mailBefore);
assert.equal((await action('unblock',pair.id,'visitor')).status,200);assert.equal((await sql`SELECT * FROM member_blocks`).length,0);assert.equal((await state(pair.id)).status,'ended');assert.equal((await state(pair.id)).ended_at.toISOString(),blockedTime.toISOString());assert.equal((await visible(pair.id)).canReinvite,true);
assert.equal((await call(friend,{as:'visitor',body:{action:'accept',token:pair.token}})).status,410);

// Blocking a known pair also retires their unaccepted named invitations in
// either direction and kind when the destination matches the current verified
// account. It never binds those pending recipients, or affects C–B or QR codes.
await clear();pair=await invite({prospect:'visitor',channel:'friend',status:'chat'});
const namedPending=[];
for(const channel of ['friend','email'])for(const [sender,recipient] of [['owner','visitor'],['visitor','owner']])for(const binding of ['original','intended']){
 const pending=await invite({sender,channel,recipientEmail:binding==='original'?`${recipient}@example.com`:''});
 if(binding==='intended')await sql`UPDATE invitations SET intended_email=${`${recipient}@example.com`} WHERE token_hash=${pending.id}`;
 namedPending.push({...pending,channel,recipient});
}
const genericQr=await invite({channel:'qr',recipientName:''});const thirdPartyPending=await invite({sender:'other',channel:'friend',recipientEmail:'visitor@example.com'});const thirdPartyChat=await invite({sender:'other',prospect:'visitor',status:'chat'});const staleAddress=await invite({recipientEmail:'old-visitor@example.com'});
assert.equal((await action('block',pair.id)).status,200);
for(const pending of namedPending){const stored=await state(pending.id);assert.equal(stored.status,'ended','known-pair block closes named pending links');assert.equal(stored.prospect_member_id,null,'email match must not manufacture accepted identity')}
for(const id of [genericQr.id,thirdPartyPending.id,staleAddress.id])assert.equal((await state(id)).status,'invited');assert.equal((await state(thirdPartyChat.id)).status,'chat');
assert.equal((await action('unblock',pair.id)).status,200);
for(const pending of namedPending){const old=pending.channel==='friend'?await call(friend,{as:pending.recipient,body:{action:'accept',token:pending.token}}):await call(connection,{as:pending.recipient,query:'invite='+pending.token});assert.equal(old.status,410,'Unblock cannot revive a retired named token');assert.equal((await state(pending.id)).prospect_member_id,null)}
// A current but unverified contact is not evidence that a pending email belongs
// to the blocked member. Already identified pair connections still close.
await clear();pair=await invite({prospect:'visitor',status:'chat'});const unverifiedPending=await invite({recipientEmail:'visitor@example.com'});const unverifiedBound=await invite({channel:'friend',recipientEmail:''});await sql`UPDATE invitations SET intended_email='visitor@example.com' WHERE token_hash=${unverifiedBound.id}`;
await sql`UPDATE members SET email_verified_at=NULL WHERE id=${ids.visitor}`;
assert.equal((await action('block',pair.id)).status,200);assert.equal((await state(pair.id)).status,'ended');assert.equal((await state(unverifiedPending.id)).status,'invited');assert.equal((await state(unverifiedBound.id)).status,'invited');await sql`UPDATE members SET email_verified_at=now() WHERE id=${ids.visitor}`;

// Write-time predicate defeats a block inserted after the action's initial read.
await clear();pair=await invite({prospect:'visitor',status:'chat'});
beforeTransaction=async()=>{await sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.visitor},${ids.owner})`};
assert.equal((await action('message',pair.id,'owner',{text:'must not append'})).status,409);assert.equal((await state(pair.id)).messages.length,1);
await clear();pair=await invite();
beforeTransaction=async()=>{await sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.visitor},${ids.owner})`};
assert.equal((await call(connection,{as:'visitor',body:{action:'first',token:pair.token,photo,answers:[0,1,2,0,1]}})).status,409);assert.equal((await state(pair.id)).prospect_member_id,null);

// Fresh block predicates also protect QR claim, Friend acceptance, reactions,
// and second-round writes, even when stale state still looks active.
for(const operation of ['qr','friend','react','second']){
 await clear();pair=await invite({channel:operation==='qr'?'qr':operation==='friend'?'friend':'email',prospect:['qr','friend'].includes(operation)?null:'visitor',status:['qr','friend'].includes(operation)?'invited':operation==='second'?'secondFive':'chat'});
  beforeTransaction=async()=>{await sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.visitor},${ids.owner})`};
 const result=operation==='qr'?await call(connection,{as:'visitor',query:'invite='+pair.token}):operation==='friend'?await call(friend,{as:'visitor',body:{action:'accept',token:pair.token}}):await action(operation,pair.id,'owner',{index:0,reaction:'like',answers:[0,1,2,0,1,0,1,2,0,1]});
 assert.equal(result.status,409,operation);
 const unchanged=await state(pair.id);assert.equal(unchanged.claim_hash,null);assert.equal(unchanged.messages[0].reactions,undefined);
 if(['qr','friend'].includes(operation))assert.equal(unchanged.prospect_member_id,null);
 if(operation==='second')assert.equal((await sql`SELECT jsonb_array_length(sender_answers) AS count FROM invitations WHERE token_hash=${pair.id}`)[0].count,5);
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
 const attempted=await action('freeze',pair.id);assert.ok([200,409].includes(attempted.status));
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

// An active connection must first be explicitly ended before Trash/Re-invite.
// Legacy soft freezes are still live; reading them must not silently change
// either party’s consent or manufacture a terminal timestamp.
await clear();pair=await invite({prospect:'visitor',status:'chat'});
assert.equal((await visible(pair.id)).location,'active');assert.equal((await visible(pair.id)).canTrash,false);assert.equal((await action('trash',pair.id)).status,409);assert.equal((await prepare(pair.id)).status,409);
await sql`INSERT INTO connection_visibility(member_id,invitation_hash,frozen_at,action,action_at) VALUES(${ids.owner},${pair.id},'2025-01-02T00:00:00Z','freeze','2025-01-02T00:00:00Z')`;
const beforeMigration={state:await state(pair.id),invitation:await invitation(pair.id),visibility:(await sql`SELECT * FROM connection_visibility WHERE invitation_hash=${pair.id}`)[0]};
await db.exec(fs.readFileSync(new URL('../migrations/20261001_connection_trash.sql',import.meta.url),'utf8'));
assert.deepEqual({state:await state(pair.id),invitation:await invitation(pair.id),visibility:(await sql`SELECT * FROM connection_visibility WHERE invitation_hash=${pair.id}`)[0]},beforeMigration,'additive migration leaves live legacy data and dates unchanged');
const legacy=await visible(pair.id);assert.equal(legacy.legacyFrozen,true);assert.equal(legacy.canFreeze,true);assert.equal((await state(pair.id)).status,'chat');assert.equal((await state(pair.id)).ended_at,null);assert.equal((await action('trash',pair.id)).status,409);assert.equal((await prepare(pair.id)).status,409);
assert.equal((await action('freeze',pair.id)).status,200);assert.equal((await state(pair.id)).status,'ended');assert.ok((await state(pair.id)).ended_at);assert.equal((await action('trash',pair.id)).status,200);

// Anonymous expired QR links have no guessed person to re-invite or block.
await clear();pair=await invite({channel:'qr',expired:true,recipientName:''});
const mystery=await visible(pair.id);assert.equal(mystery.location,'freezer');assert.equal(mystery.canTrash,true);assert.equal(mystery.canBlock,false);assert.equal(mystery.canReinvite,false);
assert.equal((await action('block',pair.id,'owner',{blockedId:ids.visitor})).status,409);const unknownDestination=await prepare(pair.id);assert.ok(unknownDestination.status===409||unknownDestination.status===200&&unknownDestination.data.canSend===false);assert.equal((await action('trash',pair.id)).status,200);assert.equal((await trash()).connections[0].id,pair.id);assert.equal((await action('restore',pair.id)).data.connection.location,'freezer');

// Friend re-invites snapshot the current sender profile and need no Vibe
// answers. Delivery targets the known member without disclosing their account
// email or allowing a forged target, and acceptance requires fresh consent.
await clear();pair=await invite({channel:'friend',prospect:'visitor',status:'chat',recipientEmail:''});
assert.equal((await action('freeze',pair.id)).status,200);
await sql`UPDATE members SET name='Current Owner',photo='data:image/jpeg;base64,QkI=',answers='[]'::jsonb WHERE id=${ids.owner}`;
let prepared=await prepare(pair.id,'friend');assert.equal(prepared.status,200);assert.equal(prepared.data.destination,'member');assert.equal(prepared.data.recipient.email,null);assert.equal(prepared.data.canSend,true);assert.equal(prepared.data.needsAnswers,false);assert.ok(prepared.data.recipient.name);assert(!JSON.stringify(prepared.data).includes('visitor@example.com'));
assert.equal((await prepare(pair.id,'vibe')).status,409,'the requested kind cannot change the stored invitation kind');
assert.equal((await prepare(pair.id,'friend','other')).status,404);assert.equal((await prepare(pair.id,'friend',null)).status,401);const reversePreparation=await prepare(pair.id,'friend','visitor');assert.equal(reversePreparation.status,200);assert.equal(reversePreparation.data.destination,'member');assert.equal(reversePreparation.data.recipient.email,null);assert(!JSON.stringify(reversePreparation.data).includes('owner@example.com'));

const beforeFriend=mail.length;
result=await reinvite(pair.id,'friend','owner','friend-fresh',{recipient:{name:'Forged',email:'other@example.com'},intended_member_id:ids.other,sender_answers:[2,2,2,2,2]});assert.equal(result.status,200,JSON.stringify(result.data));assert.match(result.data.id,/^[a-f0-9]{64}$/);assert.notEqual(result.data.id,pair.id);assert.equal(result.data.kind,'friend');assert.equal(mail.length,beforeFriend+1);assert.equal(mail.at(-1).personalizations[0].to[0].email,'visitor@example.com');
let fresh=await invitation(result.data.id),freshState=await state(result.data.id),freshToken=tokenFromMail(mail.at(-1));
await signedOutBound('friend',freshToken);
assert.equal(fresh.token_hash,hash(freshToken));assert.equal(fresh.sender_name,'Current Owner');assert.equal(fresh.sender_photo,'data:image/jpeg;base64,QkI=');assert.deepEqual(fresh.sender_answers,[]);assert.equal(fresh.intended_member_id,ids.visitor);assert.equal(fresh.reinvite_from,pair.id);assert.equal(fresh.delivery_status,'sent');assert.equal(freshState.status,'invited');assert.equal(freshState.prospect_member_id,null);assert.deepEqual(freshState.messages,[]);
assert.equal((await call(friend,{as:'other',body:{action:'accept',token:freshToken}})).status,403,'forwarded member-bound token cannot bind C');assert.equal((await state(fresh.token_hash)).prospect_member_id,null);
assert.equal((await call(friend,{as:'visitor',body:{action:'accept',token:freshToken}})).status,200,'B explicitly accepts fresh invitation');assert.equal((await state(fresh.token_hash)).status,'chat');assert.equal((await state(pair.id)).status,'ended');assert.equal((await call(friend,{as:'visitor',body:{action:'accept',token:pair.token}})).status,410);
assert.equal((await reinvite(pair.id,'friend','owner','friend-fresh')).data.id,fresh.token_hash);assert.equal(mail.length,beforeFriend+1,'same requestId never sends twice even after acceptance');
const duplicate=await invite({channel:'friend',recipientEmail:'visitor@example.com'});const recovered=await call(friend,{as:'visitor',body:{action:'accept',token:duplicate.token}});assert.equal(recovered.status,200);assert.equal(recovered.data.id,fresh.token_hash);assert.equal(recovered.data.alreadyConnected,true,'an older ended invitation does not defeat active-friend duplicate recovery');
await sql`UPDATE members SET name='owner',photo=${photo},answers='[0,1,2,0,1]'::jsonb WHERE id=${ids.owner}`;

// Vibe re-invites use only the current first five answers. A missing current
// profile is reported before send; old invitation answers cannot satisfy it.
await clear();pair=await invite({channel:'qr',prospect:'visitor',status:'chat',recipientEmail:''});assert.equal((await action('freeze',pair.id)).status,200);
await sql`UPDATE members SET answers='[]'::jsonb WHERE id=${ids.owner}`;
prepared=await prepare(pair.id);assert.equal(prepared.status,200);assert.equal(prepared.data.needsAnswers,true);assert.equal(prepared.data.canSend,false);const beforeMissing=mail.length;assert.equal((await reinvite(pair.id)).status,400);assert.equal(mail.length,beforeMissing);
const currentAnswers=[2,2,1,1,0,0,0,2,1,2];await sql`UPDATE members SET name='Fresh Vibe Owner',answers=${JSON.stringify(currentAnswers)}::jsonb WHERE id=${ids.owner}`;
prepared=await prepare(pair.id);assert.equal(prepared.data.canSend,true);assert.equal(prepared.data.needsAnswers,false);assert.equal(prepared.data.destination,'member');assert.equal(prepared.data.recipient.email,null);
result=await reinvite(pair.id);assert.equal(result.status,200,JSON.stringify(result.data));fresh=await invitation(result.data.id);freshToken=tokenFromMail(mail.at(-1));assert.equal(fresh.intended_member_id,ids.visitor);assert.equal(fresh.sender_name,'Fresh Vibe Owner');assert.deepEqual(fresh.sender_answers,currentAnswers.slice(0,5));assert.equal((await state(fresh.token_hash)).status,'invited');assert.equal((await state(fresh.token_hash)).prospect_member_id,null);
await signedOutBound('vibe',freshToken);
assert.equal((await call(connection,{as:'other',query:'invite='+freshToken})).status,403);assert.equal((await call(connection,{as:'other',body:{action:'first',token:freshToken,photo,answers:[1,1,1,1,1]}})).status,403);assert.equal((await state(fresh.token_hash)).prospect_member_id,null);
assert.equal((await call(connection,{as:'visitor',body:{action:'first',token:freshToken,photo,answers:[1,1,1,1,1]}})).status,200);assert.equal((await state(fresh.token_hash)).prospect_member_id,ids.visitor);assert.equal((await state(pair.id)).status,'ended');
for(const as of ['owner','visitor']){const row=await visible(fresh.token_hash,as);assert(!JSON.stringify(row).includes('visitor@example.com'),'internal member delivery address must not become public history')}
await sql`UPDATE members SET name='owner',answers='[0,1,2,0,1]'::jsonb WHERE id=${ids.owner}`;

// A named but unclaimed invitation can be re-sent only to its original email.
// It never becomes a blockable identity from that address alone. A new token is
// bound only when the intended, verified email account explicitly accepts it.
for(const channel of ['friend','email']){
 await clear();pair=await invite({channel,recipientEmail:'visitor@example.com'});const kind=channel==='friend'?'friend':'vibe';
 assert.equal((await action('block',pair.id,'owner',{blockedId:ids.visitor})).status,409);assert.equal((await action('freeze',pair.id)).status,200);
 prepared=await prepare(pair.id,kind);assert.equal(prepared.status,200);assert.equal(prepared.data.destination,'email');assert.equal(prepared.data.recipient.email,'visitor@example.com');assert.equal(prepared.data.canSend,true);
 result=await reinvite(pair.id,kind);assert.equal(result.status,200,JSON.stringify(result.data));fresh=await invitation(result.data.id);freshToken=tokenFromMail(mail.at(-1));assert.equal(fresh.intended_member_id,null);assert.equal(fresh.intended_email,'visitor@example.com');assert.equal((await state(fresh.token_hash)).prospect_member_id,null);
 await signedOutBound(kind,freshToken);
 const accept=as=>channel==='friend'?call(friend,{as,body:{action:'accept',token:freshToken}}):call(connection,{as,body:{action:'first',token:freshToken,photo,answers:[0,0,0,0,0]}});
 assert.equal((await accept('other')).status,403);assert.equal((await state(fresh.token_hash)).prospect_member_id,null);
 await sql`UPDATE members SET email_verified_at=NULL WHERE id=${ids.visitor}`;assert.equal((await accept('visitor')).status,403,'matching contact alone is not verified email ownership');assert.equal((await state(fresh.token_hash)).prospect_member_id,null);await sql`UPDATE members SET email_verified_at=now() WHERE id=${ids.visitor}`;
 assert.equal((await accept('visitor')).status,200);assert.equal((await state(fresh.token_hash)).prospect_member_id,ids.visitor);assert.equal((await state(pair.id)).status,'ended');
}

// Canceling or expiring an unaccepted member-bound re-invitation does not
// erase the known destination. A further invitation has its own token and
// consent, and still keeps the private account email out of history metadata.
for(const channel of ['friend','email'])for(const terminal of ['cancel','expired']){
 await clear();const kind=channel==='friend'?'friend':'vibe';pair=await invite({channel,prospect:'visitor',status:'chat',recipientEmail:''});assert.equal((await action('freeze',pair.id)).status,200);
 const first=await reinvite(pair.id,kind);assert.equal(first.status,200);const firstId=first.data.id,firstToken=tokenFromMail(mail.at(-1));assert.equal((await state(firstId)).prospect_member_id,null);assert.equal((await invitation(firstId)).intended_member_id,ids.visitor);
 if(terminal==='cancel')assert.equal((await action('cancel',firstId)).status,200);else await sql`UPDATE invitations SET expires_at=now()-interval '1 day' WHERE token_hash=${firstId}`;
 assert.equal((await visible(firstId)).location,'freezer');const again=await prepare(firstId,kind);assert.equal(again.status,200,JSON.stringify(again.data));assert.equal(again.data.destination,'member');assert.equal(again.data.recipient.email,null);assert.equal(again.data.canSend,true);
 const second=await reinvite(firstId,kind);assert.equal(second.status,200,JSON.stringify(second.data));assert.notEqual(second.data.id,firstId);assert.notEqual(second.data.id,pair.id);assert.equal((await invitation(second.data.id)).intended_member_id,ids.visitor);assert.equal((await state(second.data.id)).status,'invited');assert.equal((await state(second.data.id)).prospect_member_id,null);
 const oldLink=channel==='friend'?await call(friend,{as:'visitor',body:{action:'accept',token:firstToken}}):await call(connection,{as:'visitor',query:'invite='+firstToken});assert.equal(oldLink.status,410);assert.equal((await state(firstId)).prospect_member_id,null);assert(!JSON.stringify(await visible(second.data.id)).includes('visitor@example.com'));
}

// Source cleanup uses ON DELETE SET NULL. A bound Vibe's expiry must remain
// enforced after that cleanup, while its known destination supports a fresh
// invitation instead of reopening the expired token.
for(const binding of ['member','email']){
 await clear();pair=await invite({prospect:binding==='member'?'visitor':null,status:binding==='member'?'chat':'invited',recipientEmail:binding==='member'?'':'visitor@example.com'});assert.equal((await action('freeze',pair.id)).status,200);
 const sent=await reinvite(pair.id);assert.equal(sent.status,200);const expiredId=sent.data.id,expiredToken=tokenFromMail(mail.at(-1));await sql`DELETE FROM invitations WHERE token_hash=${pair.id}`;assert.equal((await invitation(expiredId)).reinvite_from,null);await sql`UPDATE invitations SET expires_at=now()-interval '1 day' WHERE token_hash=${expiredId}`;
 assert.equal((await visible(expiredId)).location,'freezer');assert.equal((await call(connection,{as:'visitor',query:'invite='+expiredToken})).status,410);const failedClaim=await call(connection,{as:'visitor',body:{action:'first',token:expiredToken,photo,answers:[0,0,0,0,0]}});assert.ok([403,404,409,410].includes(failedClaim.status));assert.equal((await state(expiredId)).prospect_member_id,null);
 const prepared=await prepare(expiredId);assert.equal(prepared.status,200);assert.equal(prepared.data.canSend,true);assert.equal(prepared.data.destination,binding);const replacement=await reinvite(expiredId);assert.equal(replacement.status,200);assert.notEqual(replacement.data.id,expiredId);assert.equal((await state(replacement.data.id)).status,'invited');assert.equal((await state(replacement.data.id)).prospect_member_id,null);
}

// In-flight and uncertain deliveries are persistent idempotent reservations.
// A second identical request may report pending, but must never call mail twice.
await clear();pair=await invite({prospect:'visitor',status:'chat'});assert.equal((await action('freeze',pair.id)).status,200);
const beforeConcurrent=mail.length;let duringSend;
providerHook=async()=>{duringSend=await reinvite(pair.id,'vibe','owner','in-flight');assert.ok([200,202,409].includes(duringSend.status));assert.equal(mail.length,beforeConcurrent+1)};
result=await reinvite(pair.id,'vibe','owner','in-flight');assert.equal(result.status,200);assert.equal(mail.length,beforeConcurrent+1);assert.equal((await reinvite(pair.id,'vibe','owner','in-flight')).data.id,result.data.id);assert.equal((await sql`SELECT token_hash FROM invitations WHERE reinvite_from=${pair.id}`).length,1);
assert.equal((await reinvite(pair.id,'vibe','owner','invalid',{requestId:'short'})).status,400);
await clear();pair=await invite({prospect:'visitor',status:'chat'});assert.equal((await action('freeze',pair.id)).status,200);
const beforeUncertain=mail.length;providerStatus=503;const savedError=console.error;console.error=()=>{};
try{result=await reinvite(pair.id,'vibe','owner','uncertain')}finally{providerStatus=202;console.error=savedError}
assert.ok(result.status>=400);assert.equal(mail.length,beforeUncertain+1);const uncertain=(await sql`SELECT * FROM invitations WHERE reinvite_from=${pair.id}`)[0];assert.ok(uncertain,'uncertain delivery reservation survives provider error');assert.equal(uncertain.delivery_status,'uncertain');
const retried=await reinvite(pair.id,'vibe','owner','uncertain');assert.ok([200,202,409,503].includes(retried.status));assert.equal(mail.length,beforeUncertain+1,'blind retry cannot duplicate an uncertain mail');assert.equal((await sql`SELECT * FROM invitations WHERE reinvite_from=${pair.id}`).length,1);

// A block committed after preparation but before the reservation prevents all
// delivery, while stale writes cannot resurrect an invitation after Freeze.
await clear();pair=await invite({prospect:'visitor',status:'chat'});assert.equal((await action('freeze',pair.id)).status,200);const beforeRace=mail.length;
beforeTransaction=async()=>{await sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.visitor},${ids.owner})`};assert.ok([403,409].includes((await reinvite(pair.id)).status));assert.equal(mail.length,beforeRace);assert.equal((await sql`SELECT * FROM invitations WHERE reinvite_from=${pair.id}`).length,0);
await clear();pair=await invite({prospect:'visitor',status:'chat'});beforeTransaction=async()=>assert.equal((await action('freeze',pair.id)).status,200);assert.equal((await action('message',pair.id,'visitor',{text:'stale'})).status,409);assert.equal((await state(pair.id)).messages.length,1);

// History is separately bounded and reachable beyond 50 newer active rows.
await clear();
for(let i=0;i<53;i++)await invite({date:'2026-09-01T00:00:00Z'});
for(let i=0;i<55;i++)await invite({channel:'friend',expired:true,date:`2024-01-01T00:00:00.${String(i).padStart(6,'0')}Z`});
const page1=await inbox();assert.equal(page1.connections.length,100);assert.ok(page1.freezerCursor);assert.equal(page1.connections.filter(x=>x.freezerAction==='expired').length,50);
const page2=await call(connection,{query:'freezer=1&cursor='+encodeURIComponent(page1.freezerCursor)});assert.equal(page2.status,200);assert.equal(page2.data.connections.length,5);assert.equal(page2.data.freezerCursor,null);assert.equal(new Set([...page1.connections,...page2.data.connections].map(x=>x.id)).size,105);
assert.equal((await call(connection,{query:'freezer=1&cursor=garbage'})).status,400);
assert.deepEqual((await inbox('other')).connections,[]);
// Trash has its own bounded cursor and is excluded from both default and
// Freezer pages. Equal timestamps must paginate without duplicates or gaps.
await clear();
for(let i=0;i<55;i++){const row=await invite({prospect:'visitor',status:'ended',date:'2025-01-01T00:00:00Z'});assert.equal((await action('trash',row.id)).status,200)}
const live=await invite({prospect:'visitor',status:'chat'});const kept=await invite({prospect:'visitor',status:'ended'});
const trash1=await trash();assert.equal(trash1.connections.length,50);assert.ok(trash1.trashCursor);assert.equal(trash1.connections.every(row=>row.location==='trash'),true);trash1.connections.forEach(privateHistory);
const trash2=await trash('owner',trash1.trashCursor);assert.equal(trash2.connections.length,5);assert.equal(trash2.trashCursor,null);assert.equal(new Set([...trash1.connections,...trash2.connections].map(row=>row.id)).size,55);
assert.deepEqual(new Set((await inbox()).connections.map(row=>row.id)),new Set([live.id,kept.id]));assert.deepEqual((await history()).connections.map(row=>row.id),[kept.id]);assert.equal((await trash('visitor')).connections.length,0);
assert.equal((await call(connection,{query:'trash=1&cursor=garbage'})).status,400);assert.equal((await call(connection,{as:null,query:'trash=1'})).status,401);
assert.equal((await action('restore',trash2.connections[0].id)).status,200);assert.equal((await visible(trash2.connections[0].id)).location,'freezer');
assert.ok(transactions>10);
// The existing admin deletion workflow must remain compatible with the new
// intended-member FK. Close and tombstone targeted links before deleting a
// member so recreating the same verified address cannot claim their old links.
await clear();
ids.deleted='44444444-4444-4444-8444-444444444444';tokens.deleted='d'.repeat(64);
await sql`INSERT INTO members(id,session_hash,name,contact,photo,answers,email_verified_at) VALUES(${ids.deleted},${hash(tokens.deleted)},'Deletion fixture','deleted@example.com',${photo},'[0,1,2,0,1]'::jsonb,now())`;
const deletedTargets=[];
for(const channel of ['friend','email'])for(const binding of ['member','email']){
 const target=await invite({channel,recipientName:'Deletion fixture',recipientEmail:binding==='email'?'deleted@example.com':''});
 await sql`UPDATE invitations SET intended_member_id=${binding==='member'?ids.deleted:null},intended_email=${binding==='email'?'deleted@example.com':null} WHERE token_hash=${target.id}`;
 deletedTargets.push({...target,channel,binding});
}
await sql`INSERT INTO email_sessions(token_hash,email,expires_at) VALUES(${hash(tokens.deleted)},'deleted@example.com',now()+interval '1 day')`;
globalThis.__freezerOps.ADMIN_EMAIL='admin@example.com';globalThis.__freezerOps.readAdmin=()=> 'admin@example.com';globalThis.__freezerOps.ensureOps=async()=>{};
const admin=await load('admin'),beforeDeleteMail=mail.length;
result=await call(admin,{body:{action:'delete_member',id:ids.deleted}});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal((await sql`SELECT id FROM members WHERE id=${ids.deleted}`).length,0);assert.equal((await sql`SELECT * FROM email_sessions WHERE email='deleted@example.com'`).length,0);assert.equal(mail.length,beforeDeleteMail);
for(const target of deletedTargets){const stored=await invitation(target.id),connectionState=await state(target.id);assert.equal(stored.intended_member_id,null,'deleted recipient FK released');assert.equal(stored.intended_email,'deleted:'+target.id,'non-email tombstone cannot match a new account');assert.equal(stored.recipient_name,'Deleted member');assert.equal(stored.recipient_email,'');assert.equal(connectionState.status,'ended');assert.ok(connectionState.ended_at);assert.equal(connectionState.prospect_member_id,null)}
ids.recreated='55555555-5555-4555-8555-555555555555';tokens.recreated='e'.repeat(64);
await sql`INSERT INTO members(id,session_hash,name,contact,photo,answers,email_verified_at) VALUES(${ids.recreated},${hash(tokens.recreated)},'New account same address','deleted@example.com',${photo},'[0,1,2,0,1]'::jsonb,now())`;
for(const target of deletedTargets){const kind=target.channel==='friend'?'friend':'vibe';const claim=target.channel==='friend'?await call(friend,{as:'recreated',body:{action:'accept',token:target.token}}):await call(connection,{as:'recreated',body:{action:'first',token:target.token,photo,answers:[0,0,0,0,0]}});assert.ok([403,410].includes(claim.status),JSON.stringify(claim));assert.equal((await state(target.id)).status,'ended');assert.equal((await state(target.id)).prospect_member_id,null);assert.equal((await visible(target.id)).canReinvite,false);assert.equal((await prepare(target.id,kind)).status,409)}
assert.equal((await call(admin,{body:{action:'delete_member',id:ids.deleted}})).status,404);assert.equal(mail.length,beforeDeleteMail,'deletion and failed claims never deliver invitations');
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
console.log('Freezer/Trash actual-SQL lifecycle, privacy, reinvite consent, idempotency, block guards, stale-write races, and pagination passed');
