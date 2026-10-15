// Disposable local PostgreSQL and synthetic inboxes only. No live credentials.
process.env.CHEMPAT_REVIEW_EMAILS='cindy@example.com,newbie@example.com,late@example.com';
process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
process.env.DATABASE_URL='postgres://synthetic-member-sessions';process.env.SENDGRID_API_KEY='synthetic';delete process.env.CHEMPAT_SMS;
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),root=new URL('../',import.meta.url);
const migration=fs.readFileSync(new URL('migrations/20261015_member_device_sessions.sql',root),'utf8'),schema=fs.readFileSync(new URL('schema.sql',root),'utf8');
assert.ok(schema.endsWith(migration),'fresh schema matches the deployment migration');
await db.exec(schema.slice(0,-migration.length));
await db.exec('ALTER TABLE members ADD COLUMN IF NOT EXISTS email_verified_at timestamptz');
const hash=s=>createHash('sha256').update(s).digest('hex');
const template=(strings,values)=>({text:strings.reduce((out,part,i)=>out+(i?`$${i}`:'')+part,''),values});
const run=async(executor,{text,values})=>(await executor.query(text,values)).rows;
let afterFirstTransactionStatement=null;
const sql=(strings,...values)=>run(db,template(strings,values));sql.query=(text,values=[])=>run(db,{text,values});
sql.transaction=(build)=>db.transaction(async tx=>{const tag=(strings,...values)=>template(strings,values);tag.query=(text,values=[])=>({text,values});const results=[];for(const q of build(tag)){results.push(await run(tx,q));if(results.length===1&&afterFirstTransactionStatement){const hook=afterFirstTransactionStatement;afterFirstTransactionStatement=null;await hook(tx)}}return results});
globalThis.__memberSql=sql;
const mail=[];globalThis.fetch=async(url,opt)=>{assert.equal(url,'https://api.sendgrid.com/v3/mail/send');mail.push(JSON.parse(opt.body));return {ok:true,status:202}};
async function load(name){const src=fs.readFileSync(new URL('api/'+name+'.mjs',root),'utf8').replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__memberSql;').replace(/from '\.\/(.*?)\.mjs'/g,(_,path)=>`from '${new URL('api/'+path+'.mjs',root).href}'`);return (await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'))).default}
const api=await load('member'),emailApi=await load('email');
const id='11111111-1111-4111-8111-111111111111',legacy='c'.repeat(64),proof='d'.repeat(64),photo='data:image/jpeg;base64,AA==';
await sql`INSERT INTO members(id,session_hash,name,contact,photo,answers) VALUES(${id},${hash(legacy)},${'Cindy'},${'cindy@example.com'},${photo},${'[0,1,2,0,1]'})`;
await sql`INSERT INTO email_sessions(token_hash,email,expires_at) VALUES(${hash(proof)},${'cindy@example.com'},now()+interval '30 days')`;
await db.exec(migration);
assert.equal((await sql`SELECT count(*)::int AS n FROM member_sessions WHERE token_hash=${hash(legacy)} AND member_id=${id}`)[0].n,1,'migration imports the existing hash without minting a token');
assert.equal((await sql`SELECT count(*)::int AS n FROM member_sessions s JOIN members m ON m.id=s.member_id WHERE s.created_at=m.updated_at AND s.expires_at=m.updated_at+interval '180 days'`)[0].n,1,'legacy server expiry is fixed to the preexisting timestamp');
const call=async(body,cookie='',expected=id,target=api)=>{const r=await target.fetch(new Request('https://duhwild.com/api/member',{headers:{'content-type':'application/json',cookie,...(expected?{'x-chempat-member-id':expected}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})}));assert.equal(r.headers.get('cache-control'),'no-store');return {status:r.status,body:await r.json(),cookies:r.headers.getSetCookie()}};
const token=(result,name='chempat_member')=>result.cookies.find(c=>c.startsWith(name+'='))?.match(/^[^=]+=([a-f0-9]{64});/)?.[1];
const cookie=(member,proof)=>[member&&'chempat_member='+member,proof&&'chempat_session='+proof].filter(Boolean).join('; ');
const code=()=>mail.at(-1).subject.match(/^\d{6}/)[0];
const start=async(email='cindy@example.com',target=api)=>{await sql`UPDATE email_codes SET last_sent_at=now()-interval '2 minutes' WHERE email=${target===api?'member:'+email:email}`;const result=await call({action:target===api?'code_start':'start',email},'',id,target);assert.equal(result.status,200,JSON.stringify(result.body));assert.ok(result.body.challengeId);assert.ok(Date.parse(result.body.expiresAt)>Date.now());assert.ok(Date.parse(result.body.resendAt)>Date.now());return {...result.body,code:code()}};
const verify=(c,email='cindy@example.com',target=api)=>call({action:target===api?'code_verify':'verify',email,code:c.code,challengeId:c.challengeId},'',id,target);

assert.equal((await call()).status,401);
assert.equal((await call(undefined,cookie(legacy))).status,200,'legacy session was preserved');
assert.equal((await call({action:'register',name:'Mike',contact:'202-555-0100',photo,answers:[],agreed:true})).status,400,'no phone authentication');
assert.equal((await call({action:'code_start',email:'bad'})).status,400);
assert.equal((await call({action:'code_start',email:'unapproved@example.com'})).status,403);
const newbie=await start('newbie@example.com');
assert.equal((await call({action:'code_start',email:'newbie@example.com'})).status,429);
const newProof=await verify(newbie,'newbie@example.com');assert.deepEqual(newProof.body,{existing:false,email:'newbie@example.com'});
assert.equal(token(newProof),undefined);
const signup=await call({action:'register',name:'Newbie',contact:'newbie@example.com',photo,answers:[],agreed:true},cookie(null,token(newProof,'chempat_session')));
assert.equal(signup.status,200);assert.equal(signup.body.member.verified,true);assert.equal((await call(undefined,cookie(token(signup)))).status,200);
assert.equal((await call({action:'register',name:'Cindy',contact:'cindy@example.com',photo,answers:[],agreed:true})).status,409);

const first=await start();assert.equal(mail.at(-1).from.email,'hello@duhwild.com');assert.equal(mail.at(-1).reply_to.email,'hello@chempatible.com');const bad={...first,code:first.code==='000000'?'111111':'000000'};
assert.equal((await verify(bad)).status,400);
const phone=await verify(first);assert.equal(phone.status,200);assert.equal(phone.body.member.id,id);assert.equal(phone.body.member.session_hash,undefined);
const phoneToken=token(phone),phoneProof=token(phone,'chempat_session');assert.ok(phoneToken);assert.ok(phoneProof);
for(const c of phone.cookies)assert.match(c,/HttpOnly; Secure; SameSite=Lax; Path=\//);
assert.match(phone.cookies.find(c=>c.startsWith('chempat_member=')),/Max-Age=15552000/);
assert.equal((await verify(first)).status,400,'OTP single use');
const computer=await verify(await start());const computerToken=token(computer),computerProof=token(computer,'chempat_session');assert.ok(computerToken);
assert.notEqual(phoneToken,computerToken);
for(const t of [legacy,phoneToken,computerToken])assert.equal((await call(undefined,cookie(t))).status,200,'devices coexist');
assert.equal((await sql`SELECT session_hash FROM members WHERE id=${id}`)[0].session_hash,hash(legacy),'new login never rotates another session');
assert.equal((await call({action:'answers',answers:[0,1,2,0,1]},cookie(phoneToken))).status,200);
assert.equal((await call({action:'logout',scope:'all'},cookie(computerToken),'22222222-2222-4222-8222-222222222222')).status,409,'stale tab cannot sign out new account');
assert.equal((await call(undefined,cookie(computerToken))).status,200);
const out=await call({action:'logout'},cookie(phoneToken,phoneProof)+`; chempat_pair_${'a'.repeat(16)}=${'e'.repeat(64)}`);
assert.equal(out.status,200);for(const name of ['chempat_member','chempat_session',`chempat_pair_${'a'.repeat(16)}`])assert.ok(out.cookies.some(c=>c.startsWith(name+'=;')&&c.includes('Max-Age=0')));
assert.equal((await call(undefined,cookie(phoneToken))).status,401,'copied cookie is revoked');
assert.equal((await call(undefined,cookie(computerToken))).status,200,'other device remains');
assert.equal((await sql`SELECT token_hash FROM email_sessions WHERE token_hash=${hash(phoneProof)}`).length,0);
assert.equal((await call({action:'logout'})).status,200,'repeat logout harmless');
const snapshot=await sql`SELECT * FROM member_sessions ORDER BY token_hash`;
await db.exec(fs.readFileSync(new URL('migrations/20261015_member_device_sessions.sql',root),'utf8'));
await db.exec(fs.readFileSync(new URL('migrations/20261015_member_device_sessions.sql',root),'utf8'));
assert.deepEqual(await sql`SELECT * FROM member_sessions ORDER BY token_hash`,snapshot,'migration does not extend/revive sessions');
assert.equal((await call(undefined,cookie(phoneToken))).status,401);
assert.equal((await call({action:'logout',scope:'all'},cookie(computerToken,computerProof))).status,200);
for(const t of [legacy,phoneToken,computerToken])assert.equal((await call(undefined,cookie(t))).status,401);
assert.equal((await sql`SELECT token_hash FROM email_sessions WHERE email=${'cindy@example.com'}`).length,0,'all-device logout removes old unbound and new proofs');

const challenge=await start();const raced=await Promise.all([verify(challenge),verify(challenge)]);
assert.deepEqual(raced.map(r=>r.status).sort(),[200,400],'concurrent OTP verify yields exactly one credential');
const live=token(raced.find(r=>r.status===200));
await sql`UPDATE member_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=${hash(live)}`;
assert.equal((await call(undefined,cookie(live))).status,401,'server enforces expiry');
assert.equal((await call({action:'answers',answers:[0,1,2,0,1]},cookie(live))).status,404,'expired cookie cannot mutate');
assert.equal((await sql`SELECT count(*)::int AS n FROM member_sessions WHERE expires_at>created_at+interval '180 days'`)[0].n,0);
const exhausted=await start();for(let i=0;i<5;i++)assert.equal((await verify({...exhausted,code:exhausted.code==='000000'?'111111':'000000'})).status,400);
assert.equal((await verify(exhausted)).status,400,'five attempts hard limit');
const old=await start(),replacement=await start();assert.equal((await verify({...replacement,challengeId:old.challengeId})).status,400,'old challenge cannot consume new code');assert.equal((await verify(replacement)).status,200);
const expired=await start();await sql`UPDATE email_codes SET expires_at=now()-interval '1 second' WHERE email=${'member:cindy@example.com'}`;assert.equal((await verify(expired)).status,400);
await sql`UPDATE email_codes SET last_sent_at=now()-interval '2 minutes' WHERE email=${'member:cindy@example.com'}`;
const sends=mail.length,starts=await Promise.all([call({action:'code_start',email:'cindy@example.com'}),call({action:'code_start',email:'cindy@example.com'})]);assert.deepEqual(starts.map(r=>r.status).sort(),[200,429]);assert.equal(mail.length,sends+1,'concurrent resend sends once');
const emailChallenge=await start('cindy@example.com',emailApi);const emailRaced=await Promise.all([verify(emailChallenge,'cindy@example.com',emailApi),verify(emailChallenge,'cindy@example.com',emailApi)]);assert.deepEqual(emailRaced.map(r=>r.status).sort(),[200,400],'email proof path atomically consumes OTP too');
// Re-authentication in this browser replaces only its own token/proof, so a
// later this-device sign-out leaves no old credential from this browser alive.
const original=await verify(await start()),originalToken=token(original),originalProof=token(original,'chempat_session');
const otherDevice=await verify(await start()),otherToken=token(otherDevice);
const reauth=await start();const replacementLogin=await call({action:'code_verify',email:'cindy@example.com',code:reauth.code,challengeId:reauth.challengeId},cookie(originalToken,originalProof));
assert.equal(replacementLogin.status,200);
assert.equal((await call(undefined,cookie(originalToken))).status,401);
assert.equal((await sql`SELECT token_hash FROM email_sessions WHERE token_hash=${hash(originalProof)}`).length,0);
assert.equal((await call(undefined,cookie(otherToken))).status,200,'reauth keeps a different browser signed in');
assert.equal((await call({action:'logout'},cookie(token(replacementLogin),token(replacementLogin,'chempat_session')))).status,200);
assert.equal((await call(undefined,cookie(token(replacementLogin)))).status,401);
assert.equal((await call(undefined,cookie(otherToken))).status,200);
// Every private API uses the same expiring/revocable server authority.
for(const name of ['member-profile','rewards','reward-directory','reward-requests','wildcards','discovery','game-pieces','datecards','connection']){
 const target=await load(name),response=await target.fetch(new Request('https://duhwild.com/api/'+name+'?inbox=1',{headers:{cookie:cookie(live),'x-chempat-member-id':id}}));
 assert.ok([401,403].includes(response.status),name+' rejects expired session: '+response.status);
}
const photoApi=await load('connection-photo');
assert.equal((await photoApi.fetch(new Request('https://duhwild.com/api/connection-photo?id='+'f'.repeat(64),{headers:{cookie:cookie(live)}}))).status,404);
// A request losing authority while waiting for the account lock cannot revoke
// credentials from a newer login, even if its old preflight found the account.
const staleLogin=await verify(await start()),staleToken=token(staleLogin),newerToken='9'.repeat(64);
afterFirstTransactionStatement=async tx=>{
 await tx.query('UPDATE member_sessions SET revoked_at=now() WHERE token_hash=$1',[hash(staleToken)]);
 await tx.query("INSERT INTO member_sessions(token_hash,member_id,expires_at) VALUES($1,$2,now()+interval '180 days')",[hash(newerToken),id]);
};
assert.equal((await call({action:'logout',scope:'all'},cookie(staleToken))).status,409);
assert.equal((await call(undefined,cookie(newerToken))).status,200,'stale logout leaves newer login intact');
console.log('Member signup, recoverable OTP metadata, atomic rate/attempt/replay limits, independent device sessions, expiry, revocation, stale-tab logout and safe migration reruns passed');
await db.close();
