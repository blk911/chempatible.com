import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
process.env.DATABASE_URL='postgres://test';process.env.SENDGRID_API_KEY='test';delete process.env.CHEMPAT_SMS;
const hash=s=>createHash('sha256').update(s).digest('hex');
const mail=[];globalThis.fetch=async(url,opt)=>{mail.push(JSON.parse(opt.body));return {ok:true,status:202}};
const memberToken='c'.repeat(64),sessionToken='d'.repeat(64);
const cindy={id:'11111111-1111-4111-8111-111111111111',name:'Cindy',contact:'cindy@example.com',photo:'data:image/jpeg;base64,AA==',answers:[0,1,2,0,1,2,0,1,2,0],session_hash:hash(memberToken)};
const codes={},sessions=new Set([hash(sessionToken)]),activity=[];
async function sql(strings,...v){const q=strings.join('?').replace(/\s+/g,' ').trim();
 if(/^(CREATE|ALTER)/.test(q))return [];
 if(q.startsWith('INSERT INTO activity')){activity.push(v[0]);return []}
 if(q.startsWith('SELECT id FROM members WHERE session_hash='))return v[0]===cindy.session_hash?[{id:cindy.id}]:[];
 if(q.startsWith('DELETE FROM email_sessions WHERE token_hash='))return sessions.delete(v[0]),[];
 if(q.startsWith('SELECT last_sent_at FROM email_codes'))return codes[v[0]]?[codes[v[0]]]:[];
 if(q.startsWith('SELECT id FROM members WHERE contact='))return v[0]===cindy.contact?[{id:cindy.id}]:[];
 if(q.startsWith('INSERT INTO email_codes')){codes[v[0]]={code_hash:v[1],last_sent_at:new Date(),attempts:0};return []}
 if(q.startsWith('UPDATE email_codes SET attempts'))return codes[v[0]]&&codes[v[0]].attempts++<5?[{code_hash:codes[v[0]].code_hash}]:[];
 if(q.startsWith('DELETE FROM email_codes')){delete codes[v[0]];return []}
 if(q.startsWith('UPDATE members SET session_hash=')){if(v[1]!==cindy.contact)return [];cindy.session_hash=v[0];const {session_hash,...m}=cindy;return [m]}
 if(q.startsWith('INSERT INTO email_sessions')){sessions.add(v[0]);return []}
 throw Error('Unmocked SQL '+q);
}
const src=fs.readFileSync(new URL('../api/member.mjs',import.meta.url),'utf8').replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__memberSql;').replace("'./_ops.mjs'",`'${new URL('../api/_ops.mjs',import.meta.url).href}'`);
globalThis.__memberSql=sql;
const api=(await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'))).default;
const post=async(body,cookie='')=>{const r=await api.fetch(new Request('https://chempatible.com/api/member',{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify(body)}));return {status:r.status,body:await r.json(),cookies:r.headers.getSetCookie()}};

// Email only at launch: a cell number is refused until CHEMPAT_SMS=on.
assert.equal((await post({action:'register',name:'Mike',contact:'303-555-1234',photo:cindy.photo,answers:[],agreed:true})).status,400);

// Log out clears the member, email and scanned-code cookies, and ends the email session.
const out=await post({action:'logout'},`chempat_member=${memberToken}; chempat_session=${sessionToken}; chempat_pair_${'a'.repeat(16)}=${'e'.repeat(64)}`);
assert.equal(out.status,200);
for(const name of ['chempat_member','chempat_session',`chempat_pair_${'a'.repeat(16)}`])assert.ok(out.cookies.some(c=>c.startsWith(`${name}=;`)&&c.includes('Max-Age=0')),`${name} is cleared`);
assert.equal(sessions.has(hash(sessionToken)),false);assert.ok(activity.includes('logout'));
assert.equal((await post({action:'logout'})).status,200,'logging out twice is harmless');

// Sign in: unknown emails get the same answer and no email; known emails get a code.
assert.equal((await post({action:'signin_start',email:'nobody@example.com'})).status,200);assert.equal(mail.length,0);
assert.equal((await post({action:'signin_start',email:'not-an-email'})).status,400);
assert.equal((await post({action:'signin_start',email:'Cindy@Example.com'})).status,200);assert.equal(mail.length,1);assert.equal(mail[0].personalizations[0].to[0].email,'cindy@example.com');
assert.equal((await post({action:'signin_start',email:'cindy@example.com'})).status,429,'one code a minute');
const code=mail[0].content[0].value.match(/\d{6}/)[0];
assert.equal((await post({action:'signin_verify',email:'cindy@example.com',code:code==='000000'?'111111':'000000'})).status,400);
const signedIn=await post({action:'signin_verify',email:'cindy@example.com',code});
assert.equal(signedIn.status,200);assert.equal(signedIn.body.member.name,'Cindy');assert.equal(signedIn.body.member.session_hash,undefined);
const fresh=signedIn.cookies.find(c=>c.startsWith('chempat_member='))?.match(/^chempat_member=([a-f0-9]{64});/)?.[1];
assert.ok(fresh);assert.equal(cindy.session_hash,hash(fresh),'the new cookie opens the page');assert.notEqual(fresh,memberToken);
assert.ok(signedIn.cookies.some(c=>/^chempat_session=[a-f0-9]{64};/.test(c)),'email is verified for sending invitations');
assert.ok(activity.includes('signin'));
assert.equal((await post({action:'signin_verify',email:'cindy@example.com',code})).status,400,'codes work once');
console.log('Member log out, email sign-in, and email-only contact passed');
