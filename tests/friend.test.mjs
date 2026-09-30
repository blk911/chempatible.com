process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
process.env.DATABASE_URL='postgres://local-test-only';
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
for(const [name,id] of Object.entries(ids))await db.query('INSERT INTO members(id,session_hash,name,photo,contact,email_verified_at) VALUES($1,$2,$3,$4,$5,now())',[id,hash(tokens[name]),name,photo,`${name}@private.test`]);
const query=(strings,values)=>({text:strings.reduce((out,part,index)=>out+(index?`$${index}`:'')+part,''),values});
async function run(executor,{text,values}){return (await executor.query(text,values)).rows}
const sql=(strings,...values)=>run(db,query(strings,values));
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
 standing:async(_sql,id)=>{const [m]=await sql`SELECT suspended_until,blocked_at FROM members WHERE id=${id}`;return m?.blocked_at||m?.suspended_until&&new Date(m.suspended_until)>new Date()?{error:'Paused'}:null},
 requireVerified:async(_sql,id)=>{const [m]=await sql`SELECT email_verified_at FROM members WHERE id=${id}`;return m?.email_verified_at?null:{error:'Verify',needsVerify:true}},
 log:async(_sql,kind,data)=>logs.push({kind,...data}),
 endConnection:async(_sql,args)=>{logs.push({kind:'end',...args});await sql`UPDATE connection_state SET status='ended' WHERE invitation_hash=${args.id}`;return {status:200,body:{ok:true,status:'ended'}}}
};
async function load(name){const source=fs.readFileSync(new URL(`../api/${name}.mjs`,import.meta.url),'utf8').replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__friendSql;').replace("import * as ops from './_ops.mjs';",'const ops=globalThis.__friendOps;').replace("import {reviewGate} from './_review.mjs';",`import {reviewGate} from '${new URL('../api/_review.mjs',import.meta.url).href}';`);return (await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default}
const friend=await load('friend'),connection=await load('connection');
async function call(api,{body,query='',as,cookie,method}={}){const response=await api.fetch(new Request(`https://untrusted.example/api/test${query?'?'+query:''}`,{method:method||(body===undefined?'GET':'POST'),headers:{...(as?{cookie:`chempat_member=${tokens[as]||as}`}:{cookie:cookie||''})},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}));return {status:response.status,data:await response.json(),headers:response.headers}}
const create=async(as='owner',extra={})=>{const response=await call(friend,{as,body:{action:'create',...extra}});assert.equal(response.status,200);assert.equal(response.data.kind,'friend');assert.match(response.data.token,/^[a-f0-9]{64}$/);assert.equal(response.data.id,hash(response.data.token));assert.equal(response.data.url,`/friend?friend=${response.data.token}`);assert.equal(response.headers.get('cache-control'),'no-store');return response.data};
const accept=(invite,as='visitor',extra={})=>call(friend,{as,body:{action:'accept',token:invite.token,...extra}});
const preview=invite=>call(friend,{query:'invite='+invite.token});
const inbox=async as=>{const result=await call(connection,{as,query:'inbox=1'});assert.equal(result.status,200);return result.data.connections};
const state=async id=>(await sql`SELECT * FROM connection_state WHERE invitation_hash=${id}`)[0];
const clear=()=>db.exec('DELETE FROM invitations');
const privacy=row=>{
 for(const key of ['answers','prospectAnswers','sender_answers','prospect_answers','own_answers'])if(key in row)assert.deepEqual(row[key],[],key);
 for(const key of ['recipient_email','prospect_email','prospectEmail','prospect_phone','prospectPhone'])if(key in row)assert.equal(row[key],null,key);
 assert(!JSON.stringify(row).includes('@private.test'));assert(!JSON.stringify(row).includes('secret-recipient'));
};

assert.equal((await call(friend,{body:{action:'create'}})).status,401);
assert.equal((await call(friend,{as:'f'.repeat(64),body:{action:'create'}})).status,401);
for(const body of [null,[],0,'{broken'])assert.equal((await call(friend,{as:'owner',body})).status,400);
assert.equal((await call(friend,{method:'DELETE'})).status,405);
for(const action of ['create','accept']){
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
const invite=await create('owner',{name:'Spoofed',photo:secretPhoto,answers:Array(10).fill(2),kind:'vibe'});
const stored=(await sql`SELECT * FROM invitations WHERE token_hash=${invite.id}`)[0];
assert.equal(stored.channel,'friend');assert.equal(stored.sender_name,'owner');assert.equal(stored.sender_photo,photo);assert.deepEqual(stored.sender_answers,[]);assert.equal(stored.sender_email,'');assert.equal(stored.recipient_email,'');assert.equal(stored.recipient_name,'');
assert(Math.abs(new Date(stored.expires_at)-Date.now()-7*86400000)<10000);
assert.equal((await state(invite.id)).status,'invited');assert.equal((await state(invite.id)).prospect_member_id,null);
assert.deepEqual(Object.keys((await preview(invite)).data).sort(),['expiresAt','kind','name','photo','status']);
assert.equal((await preview(invite)).data.status,'invited');assert.equal((await state(invite.id)).prospect_member_id,null,'GET never consumes a friend link');
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
await sql`UPDATE invitations SET sender_answers='[2,2,2,2,2,2,2,2,2,2]',sender_email='owner@private.test',recipient_email='secret-recipient@private.test' WHERE token_hash=${invite.id}`;
await sql`UPDATE connection_state SET prospect_answers='[1,1,1,1,1,1,1,1,1,1]',prospect_email='visitor@private.test',prospect_phone='1234567890' WHERE invitation_hash=${invite.id}`;
for(const as of ['owner','visitor'])privacy((await inbox(as))[0]);privacy((await call(connection,{as:'visitor',query:'invite='+invite.token})).data);
for(const action of ['first','request','decision','second','chat','email'])for(const as of ['owner','visitor']){
 const result=await call(connection,{as,body:{action,id:invite.id,token:invite.token,kind:'vibe',channel:'email',answers:Array(10).fill(1),photo,name:'visitor',contact:'expose@private.test',email:'expose@private.test',decision:'accept'}});
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
const afterEnd=await create();assert.equal((await accept(afterEnd)).status,409,'fresh links cannot undo an ended friend pair');assert.equal((await state(afterEnd.id)).prospect_member_id,null);
await clear();
const expiring=await create();await sql`UPDATE invitations SET expires_at=now()-interval '1 second' WHERE token_hash=${expiring.id}`;
assert.equal((await preview(expiring)).data.status,'expired');assert.equal('name' in (await preview(expiring)).data,false);assert.equal((await accept(expiring)).status,410);assert.equal((await inbox('owner')).length,0);
const closed=await create();await sql`UPDATE connection_state SET status='ended' WHERE invitation_hash=${closed.id}`;assert.equal((await accept(closed)).status,410);
const revoked=await create();assert.equal((await call(connection,{as:'other',body:{action:'unmatch',id:revoked.id}})).status,404);assert.equal((await call(connection,{as:'owner',body:{action:'unmatch',id:revoked.id}})).status,200,'inviter can revoke an unaccepted friend link');assert.equal((await accept(revoked)).status,410);
const declined=await create();await sql`UPDATE connection_state SET status='declined' WHERE invitation_hash=${declined.id}`;assert.equal((await accept(declined)).status,410);
const paused=await create();await sql`UPDATE members SET blocked_at=now() WHERE id=${ids.owner}`;assert.equal((await preview(paused)).data.status,'unavailable');assert.equal((await accept(paused)).status,403);await sql`UPDATE members SET blocked_at=NULL WHERE id=${ids.owner}`;
const missing=await create('fourth');await sql`DELETE FROM members WHERE id=${ids.fourth}`;assert.equal((await preview(missing)).data.status,'unavailable');assert.equal((await accept(missing)).status,403);
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
// An ended Vibe cannot be bypassed with a friend invitation.
await clear();
const endedVibe=await create();await sql`UPDATE invitations SET channel='qr' WHERE token_hash=${endedVibe.id}`;await sql`UPDATE connection_state SET status='ended',prospect_member_id=${ids.visitor},claim_hash=${hash('old-qr-claim')} WHERE invitation_hash=${endedVibe.id}`;
const recontact=await create();assert.equal((await accept(recontact)).status,409);assert.equal((await state(recontact.id)).prospect_member_id,null);
await clear();
// Supplying friend as a client kind does not turn an ordinary invitation into chat.
const vibe=await create();await sql`UPDATE invitations SET channel='email',sender_answers='[0,1,2,0,1]' WHERE token_hash=${vibe.id}`;
assert.equal((await accept(vibe,'visitor',{kind:'friend'})).status,404);assert.equal((await preview(vibe)).status,404);
assert.equal((await call(connection,{as:'visitor',body:{action:'message',token:vibe.token,text:'skip consent',kind:'friend'}})).status,409);
assert.equal((await state(vibe.id)).status,'invited');
await db.close();
console.log('Friend creation, PostgreSQL atomic acceptance, duplicate/retry recovery, privacy, authorization, expiry, moderation, and race guards passed');
