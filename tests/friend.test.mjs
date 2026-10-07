process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
process.env.DATABASE_URL='postgres://local-test-only';
process.env.SENDGRID_API_KEY='isolated-fake-provider-key';
process.env.CHEMPAT_REVIEW_EMAILS='owner@example.com,visitor@example.com,other@example.com,fourth@example.com';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const hash=value=>createHash('sha256').update(value).digest('hex');
const photo='data:image/jpeg;base64,AA==',secretPhoto='data:image/jpeg;base64,BBBB';
const tokens={owner:'a'.repeat(64),visitor:'b'.repeat(64),other:'c'.repeat(64),fourth:'d'.repeat(64)};
const ids={owner:'11111111-1111-4111-8111-111111111111',visitor:'22222222-2222-4222-8222-222222222222',other:'33333333-3333-4333-8333-333333333333',fourth:'44444444-4444-4444-8444-444444444444'};
await db.exec(`CREATE TABLE members(id uuid PRIMARY KEY,session_hash text UNIQUE,name text,photo text,answers jsonb DEFAULT '[]',contact text,email_verified_at timestamptz,suspended_until timestamptz,blocked_at timestamptz); CREATE TABLE invitations(token_hash text PRIMARY KEY,created_at timestamptz DEFAULT now(),sender_email text NOT NULL,sender_name text,sender_photo text,sender_answers jsonb NOT NULL,recipient_name text,recipient_email text,sender_member_id uuid,channel text,expires_at timestamptz); CREATE TABLE connection_state(invitation_hash text PRIMARY KEY REFERENCES invitations(token_hash) ON DELETE CASCADE,prospect_member_id uuid,prospect_name text,prospect_photo text,prospect_answers jsonb DEFAULT '[]',prospect_phone text,prospect_email text,status text DEFAULT 'invited',claim_hash text,messages jsonb DEFAULT '[]',updated_at timestamptz DEFAULT now()); CREATE TABLE email_sessions(token_hash text,email text,expires_at timestamptz);`);
await db.exec("CREATE TABLE activity(kind text,connection_id text); ALTER TABLE connection_state ADD COLUMN ended_at timestamptz; ALTER TABLE connection_state ADD COLUMN ended_by text");
await db.exec(fs.readFileSync(new URL('../migrations/20261001_connection_freezer.sql',import.meta.url),'utf8'));
await db.exec(fs.readFileSync(new URL('../migrations/20261001_connection_trash.sql',import.meta.url),'utf8'));
// Current profile projection fails closed without a registered accepted pair.
// Full-schema acceptance/identity integration is covered by profile-identity.
await db.exec("CREATE TABLE game_piece_pairs(invitation_hash text PRIMARY KEY,sender_member_id uuid,prospect_member_id uuid,connection_kind text NOT NULL DEFAULT 'vibe')");
for(const [name,id] of Object.entries(ids))await db.query('INSERT INTO members(id,session_hash,name,photo,contact,email_verified_at) VALUES($1,$2,$3,$4,$5,now())',[id,hash(tokens[name]),name,photo,`${name}@example.com`]);
const query=(strings,values)=>({text:strings.reduce((out,part,index)=>out+(index?`$${index}`:'')+part,''),values});
async function run(executor,{text,values}){return (await executor.query(text,values)).rows}
const sql=(strings,...values)=>run(db,query(strings,values));
sql.query=async(text,values)=>(await db.query(text,values)).rows;
let beforeTransaction=null,transactionCount=0;
sql.transaction=async(fn,options)=>{
 assert.equal(options.isolationLevel,'ReadCommitted');transactionCount++;
 if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;await hook()}
 return db.transaction(async tx=>{
  const statements=fn((strings,...values)=>query(strings,values));
  assert.match(statements[0].text,/ORDER BY id FOR UPDATE/);
  const rows=[];for(const statement of statements)rows.push(await run(tx,statement));return rows;
 });
};
const logs=[];
globalThis.__friendSql=sql;
globalThis.__friendOps={
 memberIdFromToken:async(_sql,token)=>{const row=await sql`SELECT id FROM members WHERE session_hash=${hash(token||'')}`;return row[0]?.id||null},
 standing:async(_sql,id)=>{const [m]=await sql`SELECT suspended_until,blocked_at FROM members WHERE id=${id}`;return m?.blocked_at||m?.suspended_until&&new Date(m.suspended_until)>new Date()?{error:'Paused'}:null},
 requireVerified:async(_sql,id)=>{const [m]=await sql`SELECT email_verified_at FROM members WHERE id=${id}`;return m?.email_verified_at?null:{error:'Verify',needsVerify:true}},
 log:async(_sql,kind,data)=>logs.push({kind,...data}),
 endConnection:async(_sql,args)=>{logs.push({kind:'end',...args});await sql`UPDATE connection_state SET status='ended' WHERE invitation_hash=${args.id}`;return {status:200,body:{ok:true,status:'ended'}}}
};
async function load(name){const source=fs.readFileSync(new URL(`../api/${name}.mjs`,import.meta.url),'utf8').replace("'./_connections.mjs'",`'${new URL('../api/_connections.mjs',import.meta.url).href}'`).replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__friendSql;').replace("import * as ops from './_ops.mjs';",'const ops=globalThis.__friendOps;').replace(/from '\.\/(.*?)\.mjs'/g,(_,name)=>`from '${new URL(`../api/${name}.mjs`,import.meta.url).href}'`);return (await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default}
const mail=[];let providerStatus=202;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 assert.equal(url,'https://api.sendgrid.com/v3/mail/send','all mail uses the isolated provider stub');
 assert.equal(options.headers.authorization,'Bearer isolated-fake-provider-key');
 const body=JSON.parse(options.body);assert.ok(body.personalizations[0].to.every(({email})=>email.endsWith('@example.com')));
 mail.push(body);return new Response(null,{status:providerStatus});
};
const friend=await load('friend'),connection=await load('connection');
async function call(api,{body,query='',as,cookie,method}={}){const response=await api.fetch(new Request(`https://untrusted.example/api/test${query?'?'+query:''}`,{method:method||(body===undefined?'GET':'POST'),headers:{...(as?{cookie:`chempat_member=${tokens[as]||as}`}:{cookie:cookie||''})},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}));return {status:response.status,data:await response.json(),headers:response.headers}}
const create=async(as='owner',extra={})=>{const response=await call(friend,{as,body:{action:'create',recipient:{name:as==='visitor'?'Owner Friend':'Visitor Friend',email:as==='visitor'?'owner@example.com':'visitor@example.com'},...extra}});assert.equal(response.status,200);assert.equal(response.data.kind,'friend');assert.match(response.data.token,/^[a-f0-9]{64}$/);assert.equal(response.data.id,hash(response.data.token));assert.equal(response.data.url,`/friend?friend=${response.data.token}`);assert.equal(response.data.code,response.data.token.slice(0,8).toUpperCase());assert.ok(response.data.recipient.name);assert.match(response.data.recipient.email,/@example\.com$/);assert.equal(response.headers.get('cache-control'),'no-store');return response.data};
const accept=(invite,as='visitor',extra={})=>call(friend,{as,body:{action:'accept',token:invite.token,...extra}});
const decline=(invite,as='visitor',extra={})=>call(friend,{as,body:{action:'decline',token:invite.token,...extra}});
const preview=(invite,as)=>call(friend,{as,query:'invite='+invite.token});
const inbox=async as=>{const result=await call(connection,{as,query:'inbox=1'});assert.equal(result.status,200);return result.data.connections};
const state=async id=>(await sql`SELECT * FROM connection_state WHERE invitation_hash=${id}`)[0];
const clear=()=>db.exec('DELETE FROM invitations');
const privacy=row=>{
 for(const key of ['answers','prospectAnswers','sender_answers','prospect_answers','own_answers'])if(key in row)assert.deepEqual(row[key],[],key);
 for(const key of ['recipient_email','prospect_email','prospectEmail','prospect_phone','prospectPhone'])if(key in row)assert.equal(row[key],null,key);
 assert(!JSON.stringify({...row,historyEmail:null}).includes('@example.com'));assert(!JSON.stringify({...row,historyEmail:null}).includes('secret-recipient'));if(row.side==='prospect')assert.equal(row.historyEmail,null);
};

assert.equal((await call(friend,{body:{action:'create'}})).status,401);
assert.equal((await call(friend,{as:'f'.repeat(64),body:{action:'create'}})).status,401);
for(const body of [null,[],0,'{broken'])assert.equal((await call(friend,{as:'owner',body})).status,400);
assert.equal((await call(friend,{method:'DELETE'})).status,405);
for(const action of ['create','accept','decline']){
 await sql`UPDATE members SET email_verified_at=NULL WHERE id=${ids.owner}`;
 assert.equal((await call(friend,{as:'owner',body:{action,token:'e'.repeat(64)}})).status,403);
 await sql`UPDATE members SET email_verified_at=now(),suspended_until=now()+interval '1 day' WHERE id=${ids.owner}`;
 assert.equal((await call(friend,{as:'owner',body:{action,token:'e'.repeat(64)}})).status,403);
 await sql`UPDATE members SET suspended_until=NULL,blocked_at=now() WHERE id=${ids.owner}`;
 assert.equal((await call(friend,{as:'owner',body:{action,token:'e'.repeat(64)}})).status,403);
 await sql`UPDATE members SET blocked_at=NULL WHERE id=${ids.owner}`;
}
await sql`UPDATE members SET photo='bad' WHERE id=${ids.owner}`;
assert.equal((await call(friend,{as:'owner',body:{action:'create',photo}})).status,400,'client cannot repair or spoof server profile');
await sql`UPDATE members SET photo=${photo} WHERE id=${ids.owner}`;
// Creating a friend invitation requires an explicit name, email, and available mail provider.
const beforeInvalid=mail.length;
for(const recipient of [undefined,{}, {name:'',email:'visitor@example.com'},{name:'Visitor',email:'invalid'}]){
 const result=await call(friend,{as:'owner',body:{action:'create',recipient}});assert.equal(result.status,400);
}
assert.equal(mail.length,beforeInvalid);assert.equal((await sql`SELECT * FROM invitations`).length,0);
delete process.env.SENDGRID_API_KEY;
assert.equal((await call(friend,{as:'owner',body:{action:'create',recipient:{name:'Visitor',email:'visitor@example.com'}}})).status,503);
process.env.SENDGRID_API_KEY='isolated-fake-provider-key';
const originalError=console.error,expectedErrors=[];console.error=(...args)=>expectedErrors.push(args);
try{
 const blocked=await call(friend,{as:'owner',body:{action:'create',recipient:{name:'Not approved',email:'unapproved@example.com'}}});
 assert.equal(blocked.status,500);assert.equal(mail.length,beforeInvalid,'review recipient guard prevents provider calls');
 assert.equal((await sql`SELECT * FROM invitations`).length,0,'review rejection rolls back pending invitation');
 providerStatus=503;
 assert.equal((await call(friend,{as:'owner',body:{action:'create',recipient:{name:'Visitor',email:'visitor@example.com'}}})).status,500);
 assert.equal((await sql`SELECT * FROM invitations`).length,0,'provider failure rolls back pending invitation');
 assert.equal((await sql`SELECT * FROM connection_state`).length,0,'provider failure leaves no orphan connection');
 assert.equal(expectedErrors.length,2);
}finally{console.error=originalError;providerStatus=202}
const invite=await create('owner',{name:'Spoofed',photo:secretPhoto,answers:Array(10).fill(2),kind:'vibe'});
const stored=(await sql`SELECT * FROM invitations WHERE token_hash=${invite.id}`)[0];
assert.equal(stored.channel,'friend');assert.equal(stored.sender_name,'owner');assert.equal(stored.sender_photo,photo);assert.deepEqual(stored.sender_answers,[]);assert.equal(stored.sender_email,'');assert.equal(stored.recipient_email,'visitor@example.com');assert.equal(stored.recipient_name,'Visitor Friend');assert.deepEqual(invite.recipient,{name:'Visitor Friend',email:'visitor@example.com'});
const invitationMail=mail.at(-1);assert.deepEqual(invitationMail.personalizations,[{to:[{email:'visitor@example.com'}]}]);assert.equal(invitationMail.from.name,'Duh Wild');assert.equal(invitationMail.subject,'owner invited you to Duh Wild');assert.match(invitationMail.content[0].value,/Hey Visitor,/);assert.match(invitationMail.content[0].value,/Come try Duh Wild with me/);assert.ok(invitationMail.content.every(c=>c.value.includes(`https://untrusted.example/friend?friend=${invite.token}`)));assert.equal(invitationMail.attachments[0].content,'AA==');
const pendingRow=(await inbox('owner'))[0];assert.equal(pendingRow.recipient_name,'Visitor Friend');assert.equal(pendingRow.claimed,false);privacy(pendingRow);
assert(Math.abs(new Date(stored.expires_at)-Date.now()-7*86400000)<10000);
assert.equal((await state(invite.id)).status,'invited');assert.equal((await state(invite.id)).prospect_member_id,null);
assert.deepEqual(Object.keys((await preview(invite)).data).sort(),['expiresAt','kind','name','photo','status']);
assert.equal((await preview(invite)).data.status,'invited');assert.equal((await state(invite.id)).prospect_member_id,null,'GET never consumes a friend link');
const ownPreview=(await preview(invite,'owner')).data;
assert.deepEqual(ownPreview,{kind:'friend',status:'own',invitationStatus:'invited',expiresAt:(await preview(invite)).data.expiresAt});
assert.equal((await preview(invite,'visitor')).data.canDecline,true);
assert.equal((await preview(invite,'other')).data.canDecline,false);
assert(!JSON.stringify(ownPreview).includes(ids.owner));assert(!JSON.stringify(ownPreview).includes('@example.com'));
assert.equal((await call(connection,{query:'invite='+invite.token})).status,403,'connection token path never reveals unclaimed friend state');
assert.equal((await call(connection,{as:'visitor',query:'invite='+invite.token})).status,403);
assert.equal((await accept(invite,'owner')).status,409,'no self-invitation');
assert.equal((await accept(invite,'visitor',{name:'Forged',photo:secretPhoto,answers:Array(10).fill(1)})).status,200);
assert.equal((await state(invite.id)).prospect_name,'visitor');assert.equal((await state(invite.id)).prospect_photo,photo);assert.deepEqual((await state(invite.id)).prospect_answers,[]);
const attempts=transactionCount;
assert.equal((await accept(invite)).data.id,invite.id);assert.equal(transactionCount,attempts,'same-account retry does not mutate');
assert.equal((await accept(invite,'other')).status,409);
const used=(await preview(invite)).data;assert.deepEqual(Object.keys(used).sort(),['expiresAt','kind','status']);assert.equal(used.status,'used');
assert.equal((await call(connection,{query:'invite='+invite.token})).status,403);
assert.equal((await call(connection,{as:'other',query:'invite='+invite.token})).status,403);
assert.equal((await call(connection,{as:'visitor',query:'invite='+invite.token})).data.kind,'friend');
assert.deepEqual(await inbox('other'),[]);
for(const as of ['owner','visitor']){const own=(await inbox(as))[0];assert.equal(own.kind,'friend');privacy(own)}
// Even corrupt legacy answer/contact columns never leak through a friend view.
await sql`UPDATE invitations SET sender_answers='[2,2,2,2,2,2,2,2,2,2]',sender_email='owner@example.com',recipient_email='secret-recipient@example.com' WHERE token_hash=${invite.id}`;
await sql`UPDATE connection_state SET prospect_answers='[1,1,1,1,1,1,1,1,1,1]',prospect_email='visitor@example.com',prospect_phone='1234567890' WHERE invitation_hash=${invite.id}`;
for(const as of ['owner','visitor'])privacy((await inbox(as))[0]);privacy((await call(connection,{as:'visitor',query:'invite='+invite.token})).data);
for(const action of ['first','request','decision','second','chat','email'])for(const as of ['owner','visitor']){
 const result=await call(connection,{as,body:{action,id:invite.id,token:invite.token,kind:'vibe',channel:'email',answers:Array(10).fill(1),photo,name:'visitor',contact:'expose@example.com',email:'expose@example.com',decision:'accept'}});
 assert.equal(result.status,409,`${action} cannot turn friend into Vibe`);
}
assert.equal((await call(connection,{as:'other',body:{action:'message',id:invite.id,text:'intruder',kind:'friend'}})).status,404);
assert.equal((await call(connection,{body:{action:'message',token:invite.token,text:'anonymous'}})).status,401);
assert.equal((await call(connection,{cookie:`chempat_session=${tokens.owner}`,body:{action:'unmatch',id:invite.id}})).status,404);
for(const [as,text] of [['owner','Hi'],['visitor','Hello']])assert.equal((await call(connection,{as,body:{action:'message',id:invite.id,text}})).status,200);
assert.equal((await call(connection,{as:'owner',body:{action:'react',id:invite.id,index:1,reaction:'like'}})).data.messages[1].reactions.member,'like');
assert.equal((await call(connection,{as:'visitor',body:{action:'message',id:invite.id,photo}})).status,200);
await sql`UPDATE invitations SET expires_at=now()-interval '1 day' WHERE token_hash=${invite.id}`;
assert.equal((await accept(invite)).status,200,'accepted friend survives invitation expiry');
assert.equal((await call(connection,{as:'visitor',query:'invite='+invite.token})).status,200);
const duplicate=await create();const duplicateAccepted=await accept(duplicate);assert.equal(duplicateAccepted.data.id,invite.id);assert.equal(duplicateAccepted.data.alreadyConnected,true);assert.equal((await state(duplicate.id)).status,'declined');assert.equal((await accept(duplicate)).data.id,invite.id);assert.equal((await accept(duplicate,'other')).status,409);assert.equal((await inbox('visitor')).length,1,'redundant consumed invites are hidden');
const reverse=await create('visitor');assert.equal((await accept(reverse,'owner')).data.id,invite.id,'reverse-direction link reuses same pair');
assert.equal((await call(connection,{as:'visitor',body:{action:'report',id:invite.id,reason:'harassment'}})).status,200);assert.equal(logs.at(-1).actorId,ids.visitor);assert.equal(logs.at(-1).side,'prospect');
assert.equal((await accept(invite)).status,410);assert.equal((await accept(duplicate)).status,410,'canonical ended chat is never reopened by duplicate retry');
assert.equal((await preview(invite)).data.status,'closed');
assert.equal((await call(connection,{as:'owner',body:{action:'message',id:invite.id,text:'reopen'}})).status,409);
const afterEnd=await create();assert.equal((await accept(afterEnd)).status,200,'fresh consent is allowed after an ended interaction when neither person blocked');assert.equal((await state(afterEnd.id)).prospect_member_id,ids.visitor);assert.equal((await state(invite.id)).status,'ended','new acceptance never reopens the old interaction');
await clear();
const expiring=await create();await sql`UPDATE invitations SET expires_at=now()-interval '1 second' WHERE token_hash=${expiring.id}`;
assert.equal((await preview(expiring)).data.status,'expired');assert.equal('name' in (await preview(expiring)).data,false);assert.equal((await accept(expiring)).status,410);assert.equal((await inbox('owner')).length,1);assert.equal((await inbox('owner'))[0].freezerAction,'expired');
const closed=await create();await sql`UPDATE connection_state SET status='ended' WHERE invitation_hash=${closed.id}`;assert.equal((await accept(closed)).status,410);
const revoked=await create();assert.equal((await call(connection,{as:'other',body:{action:'unmatch',id:revoked.id}})).status,404);assert.equal((await call(connection,{as:'owner',body:{action:'unmatch',id:revoked.id}})).status,200,'inviter can revoke an unaccepted friend link');assert.equal((await accept(revoked)).status,410);
const declined=await create();await sql`UPDATE connection_state SET status='declined' WHERE invitation_hash=${declined.id}`;assert.equal((await accept(declined)).status,410);
const paused=await create();await sql`UPDATE members SET blocked_at=now() WHERE id=${ids.owner}`;assert.equal((await preview(paused)).data.status,'unavailable');assert.equal((await accept(paused)).status,403);await sql`UPDATE members SET blocked_at=NULL WHERE id=${ids.owner}`;
const missing=await create('fourth');await sql`DELETE FROM members WHERE id=${ids.fourth}`;assert.equal((await preview(missing)).data.status,'unavailable');assert.equal((await accept(missing)).status,403);
await clear();
// Named email delivery still yields a shareable one-use link. It binds to the
// first verified accepting account, not to the original delivery address.
const sharedLink=await create();assert.equal(sharedLink.recipient.email,'visitor@example.com');
assert.equal((await accept(sharedLink,'other')).status,200);assert.equal((await state(sharedLink.id)).prospect_member_id,ids.other);
assert.equal((await accept(sharedLink,'visitor')).status,409,'the named email recipient cannot take over a consumed link');
assert.equal((await call(connection,{as:'visitor',query:'invite='+sharedLink.token})).status,403);
assert.equal((await accept(sharedLink,'other')).data.id,sharedLink.id,'the actual accepting account can recover its chat');
await clear();
// Pass requires the verified intended recipient. An anonymous bearer or a
// different verified account cannot cancel somebody else's shareable link.
const pass=await create();
assert.equal((await decline(pass,null)).status,401);
assert.equal((await decline(pass,'f'.repeat(64))).status,401);
assert.equal((await decline(pass,'owner')).status,409);
assert.equal((await decline(pass,'other',{recipient_email:'other@example.com',intended_member_id:ids.other})).status,403);
assert.equal((await state(pass.id)).status,'invited');
await sql`UPDATE members SET email_verified_at=NULL WHERE id=${ids.visitor}`;
assert.equal((await preview(pass,'visitor')).data.canDecline,false);
assert.equal((await decline(pass)).data.needsVerify,true);
await sql`UPDATE members SET email_verified_at=now(),photo=NULL,name=NULL,answers='[]' WHERE id=${ids.visitor}`;
const beforePassMail=mail.length,passLogs=logs.length;
assert.deepEqual((await decline(pass,'visitor',{name:'Forged',photo:secretPhoto,answers:[1,2],email:'expose@example.com'})).data,{ok:true,kind:'friend',status:'declined'});
const passedState=await state(pass.id);
assert.equal(passedState.status,'declined');assert.equal(passedState.prospect_member_id,ids.visitor);
assert.equal(passedState.prospect_name,null);assert.equal(passedState.prospect_photo,null);assert.deepEqual(passedState.prospect_answers,[]);
assert.equal(passedState.prospect_phone,null);assert.equal(passedState.prospect_email,null);assert.equal(passedState.claim_hash,null);
assert.equal(passedState.ended_by,'prospect');assert.ok(passedState.ended_at);assert.deepEqual(passedState.messages,[]);
assert.equal(mail.length,beforePassMail,'Pass sends no email');assert.equal(logs.length,passLogs+1);assert.equal(logs.at(-1).kind,'friend_declined');
assert.equal((await preview(pass)).data.status,'closed');assert.equal((await preview(pass,'owner')).data.invitationStatus,'closed');
assert.equal((await decline(pass)).status,200);assert.equal(logs.length,passLogs+1,'retry does not log another decline');assert.deepEqual(await state(pass.id),passedState,'retry preserves all state and dates');
await sql`UPDATE members SET photo=${photo},name='visitor' WHERE id=${ids.visitor}`;
assert.equal((await accept(pass)).status,410,'a Pass cannot be reopened by Accept');assert.equal((await decline(pass,'other')).status,403);
for(const as of ['owner','visitor']){
 const history=(await inbox(as))[0];assert.equal(history.status,'declined');assert.equal(history.location,'freezer');assert.equal(history.freezerAction,'declined');assert.equal(history.endedBy,'prospect');privacy(history);
 for(const key of ['photo','sender_photo','prospect_photo','prospectPhoto','claimed','messages'])assert.equal(key in history,false,`Pass history excludes ${key}`);
 assert.equal((await call(connection,{as,body:{action:'message',id:pass.id,text:'must not open chat'}})).status,409);
}
assert.deepEqual(await inbox('other'),[]);assert.equal((await call(connection,{as:'visitor',query:'invite='+pass.token})).status,410);
await sql`UPDATE invitations SET expires_at=now()-interval '1 day' WHERE token_hash=${pass.id}`;
assert.equal((await decline(pass)).status,200,'a recorded Pass can be retried after invitation expiry');assert.deepEqual(await state(pass.id),passedState);
await sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.owner},${ids.visitor})`;
assert.equal((await decline(pass)).status,403,'block is checked before idempotent recovery');assert.deepEqual(await state(pass.id),passedState);
await sql`DELETE FROM member_blocks`;
await clear();
// Reinvites retain their stronger account/email binding, including for Pass.
for(const binding of ['member','email']){
 const bound=await create();
 await sql`UPDATE invitations SET intended_member_id=${binding==='member'?ids.visitor:null},intended_email=${binding==='email'?'visitor@example.com':'other@example.com'} WHERE token_hash=${bound.id}`;
 assert.equal((await preview(bound)).data.status,'signInRequired');assert.equal((await preview(bound,'other')).status,403);
 assert.equal((await preview(bound,'owner')).data.status,'own','sender state precedes recipient-only preview checks');
 assert.equal((await decline(bound,'owner')).status,409);assert.equal((await decline(bound,'other')).status,403);assert.equal((await accept(bound,'other')).status,403);
 assert.equal((await preview(bound,'visitor')).data.canDecline,true);assert.equal((await decline(bound)).status,200);
 assert.equal((await decline(bound)).status,200);
 await clear();
}
// The explicit member binding takes precedence over a stale delivery address.
const rebound=await create();await sql`UPDATE invitations SET intended_member_id=${ids.other} WHERE token_hash=${rebound.id}`;
assert.equal((await decline(rebound,'visitor')).status,403);assert.equal((await decline(rebound,'other')).status,200);
await clear();
for(const closedStatus of ['ended','declined']){
 const closedPass=await create();await sql`UPDATE connection_state SET status=${closedStatus} WHERE invitation_hash=${closedPass.id}`;
 const before=await state(closedPass.id);assert.equal((await decline(closedPass)).status,410);assert.deepEqual(await state(closedPass.id),before);
}
const expiredPass=await create();await sql`UPDATE invitations SET expires_at=now()-interval '1 second' WHERE token_hash=${expiredPass.id}`;
const expiredState=await state(expiredPass.id);assert.equal((await decline(expiredPass)).status,410);assert.deepEqual(await state(expiredPass.id),expiredState);
const blockedPass=await create();await sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.visitor},${ids.owner})`;
assert.equal((await decline(blockedPass)).status,403);assert.equal((await preview(blockedPass,'visitor')).data.status,'unavailable');assert.equal((await state(blockedPass.id)).status,'invited');
await sql`DELETE FROM member_blocks`;
const acceptedPass=await create();assert.equal((await accept(acceptedPass)).status,200);
const acceptedState=await state(acceptedPass.id);assert.equal((await decline(acceptedPass)).status,409);assert.deepEqual(await state(acceptedPass.id),acceptedState);
const duplicatePass=await create();assert.equal((await accept(duplicatePass)).data.id,acceptedPass.id);
const duplicateState=await state(duplicatePass.id);assert.equal((await decline(duplicatePass)).status,409,'a spent duplicate is not a successful Pass');assert.deepEqual(await state(duplicatePass.id),duplicateState);
await clear();
// Actual SQL arbitration, in both arrival orders, leaves precisely one choice.
for(const firstChoice of ['accept','decline']){
 const choice=await create();const operations={accept:()=>accept(choice),decline:()=>decline(choice)};
 const outcomes=await Promise.all([operations[firstChoice](),operations[firstChoice==='accept'?'decline':'accept']()]);
 assert.equal(outcomes.filter(result=>result.status===200).length,1);
 const result=await state(choice.id);assert(['chat','declined'].includes(result.status));assert.equal(result.prospect_member_id,ids.visitor);
 if(result.status==='declined'){assert.equal(result.prospect_photo,null);assert.equal(result.claim_hash,null);assert.deepEqual(result.prospect_answers,[])}
 await clear();
}
const repeatedPass=await create();const repeatOutcomes=await Promise.all([decline(repeatedPass),decline(repeatedPass)]);
assert(repeatOutcomes.every(result=>result.status===200));assert.equal(logs.filter(item=>item.kind==='friend_declined'&&item.connection===repeatedPass.id).length,1);
await clear();
// Every fresh guard is exercised after the request's optimistic pre-read.
for(const interruption of ['accept','freeze','expire','senderPause','recipientPause','senderVerify','recipientVerify','rotate','memberBinding','emailBinding','deliveryEmail','contact','block']){
 const target=await create();let interruptedState;
 beforeTransaction=async()=>{
  if(interruption==='accept')assert.equal((await accept(target)).status,200);
  if(interruption==='freeze'){await sql`UPDATE connection_state SET status='ended',ended_by='member',ended_at=now() WHERE invitation_hash=${target.id}`;await sql`INSERT INTO connection_visibility(member_id,invitation_hash,frozen_at,action) VALUES(${ids.owner},${target.id},now(),'freeze')`}
  if(interruption==='expire')await sql`UPDATE invitations SET expires_at=now()-interval '1 day' WHERE token_hash=${target.id}`;
  if(interruption==='senderPause')await sql`UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=${ids.owner}`;
  if(interruption==='recipientPause')await sql`UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=${ids.visitor}`;
  if(interruption==='senderVerify')await sql`UPDATE members SET email_verified_at=NULL WHERE id=${ids.owner}`;
  if(interruption==='recipientVerify')await sql`UPDATE members SET email_verified_at=NULL WHERE id=${ids.visitor}`;
  if(interruption==='rotate')await sql`UPDATE members SET session_hash=${hash('e'.repeat(64))} WHERE id=${ids.visitor}`;
  if(interruption==='memberBinding')await sql`UPDATE invitations SET intended_member_id=${ids.other} WHERE token_hash=${target.id}`;
  if(interruption==='emailBinding')await sql`UPDATE invitations SET intended_email='other@example.com' WHERE token_hash=${target.id}`;
  if(interruption==='deliveryEmail')await sql`UPDATE invitations SET recipient_email='other@example.com' WHERE token_hash=${target.id}`;
  if(interruption==='contact')await sql`UPDATE members SET contact='changed@example.com' WHERE id=${ids.visitor}`;
  if(interruption==='block')await sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.owner},${ids.visitor})`;
  interruptedState=await state(target.id);
 };
 assert.equal((await decline(target)).status,409,interruption);assert.deepEqual(await state(target.id),interruptedState,`${interruption} wins over a stale Pass`);
 await sql`UPDATE members SET email_verified_at=now(),suspended_until=NULL WHERE id IN (${ids.owner},${ids.visitor})`;
 await sql`UPDATE members SET session_hash=${hash(tokens.visitor)},contact='visitor@example.com' WHERE id=${ids.visitor}`;
 await sql`DELETE FROM member_blocks`;await clear();
}
const retryGuard=await create();assert.equal((await decline(retryGuard)).status,200);
const retryState=await state(retryGuard.id);
for(const interruption of ['rotate','block']){
 beforeTransaction=async()=>{if(interruption==='rotate')await sql`UPDATE members SET session_hash=${hash('e'.repeat(64))} WHERE id=${ids.visitor}`;else await sql`INSERT INTO member_blocks(blocker_id,blocked_id) VALUES(${ids.owner},${ids.visitor})`};
 assert.equal((await decline(retryGuard)).status,409,`fresh ${interruption} guard on retry`);assert.deepEqual(await state(retryGuard.id),retryState);
 await sql`UPDATE members SET session_hash=${hash(tokens.visitor)} WHERE id=${ids.visitor}`;await sql`DELETE FROM member_blocks`;
}
await clear();
const race=await create();const raced=await Promise.all([accept(race,'visitor'),accept(race,'other')]);assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);const winner=(await state(race.id)).prospect_member_id;assert([ids.visitor,ids.other].includes(winner));
await clear();
const pairOne=await create(),pairTwo=await create('visitor');const pairRace=await Promise.all([accept(pairOne,'visitor'),accept(pairTwo,'owner')]);assert(pairRace.every(r=>r.status===200));assert.equal(pairRace[0].data.id,pairRace[1].data.id);assert.equal((await sql`SELECT invitation_hash FROM connection_state WHERE status='chat'`).length,1);
await clear();
for(const interruption of ['end','expire','pause','rotate']){
 const target=await create();
 beforeTransaction=async()=>{if(interruption==='end')await sql`UPDATE connection_state SET status='ended' WHERE invitation_hash=${target.id}`;if(interruption==='expire')await sql`UPDATE invitations SET expires_at=now()-interval '1 day' WHERE token_hash=${target.id}`;if(interruption==='pause')await sql`UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=${ids.owner}`;if(interruption==='rotate')await sql`UPDATE members SET session_hash=${hash('e'.repeat(64))} WHERE id=${ids.visitor}`};
 assert.equal((await accept(target)).status,409,interruption);assert.equal((await state(target.id)).prospect_member_id,null);
 await sql`UPDATE members SET suspended_until=NULL WHERE id=${ids.owner}`;await sql`UPDATE members SET session_hash=${hash(tokens.visitor)} WHERE id=${ids.visitor}`;
}
// Explicit blocks govern future contact; an ended Vibe alone does not block a fresh Friend invitation.
await clear();
const endedVibe=await create();await sql`UPDATE invitations SET channel='qr' WHERE token_hash=${endedVibe.id}`;await sql`UPDATE connection_state SET status='ended',prospect_member_id=${ids.visitor},claim_hash=${hash('old-qr-claim')} WHERE invitation_hash=${endedVibe.id}`;
const recontact=await create();assert.equal((await accept(recontact)).status,200);assert.equal((await state(recontact.id)).prospect_member_id,ids.visitor);assert.equal((await state(endedVibe.id)).status,'ended');
await clear();
// Supplying friend as a client kind does not turn an ordinary invitation into chat.
const vibe=await create();await sql`UPDATE invitations SET channel='email',sender_answers='[0,1,2,0,1]' WHERE token_hash=${vibe.id}`;
assert.equal((await accept(vibe,'visitor',{kind:'friend'})).status,404);assert.equal((await preview(vibe)).status,404);
assert.equal((await call(connection,{as:'visitor',body:{action:'message',token:vibe.token,text:'skip consent',kind:'friend'}})).status,409);
assert.equal((await state(vibe.id)).status,'invited');
globalThis.fetch=originalFetch;
await db.close();
console.log('Friend creation, own-invite preview, PostgreSQL atomic acceptance/Pass, duplicate/retry recovery, privacy, recipient authorization, expiry, moderation, and race guards passed');
