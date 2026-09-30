process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
process.env.DATABASE_URL='postgres://test';process.env.SENDGRID_API_KEY='test';delete process.env.CHEMPAT_SMS;
const hash=s=>createHash('sha256').update(s).digest('hex');
const mail=[];globalThis.fetch=async(url,opt)=>{mail.push(JSON.parse(opt.body));return {ok:true,status:202}};
const memberToken='c'.repeat(64),sessionToken='d'.repeat(64);
const cindy={id:'11111111-1111-4111-8111-111111111111',name:'Cindy',contact:'cindy@example.com',photo:'data:image/jpeg;base64,AA==',answers:[0,1,2,0,1,2,0,1,2,0],session_hash:hash(memberToken)};
const codes={},sessions=new Map([[hash(sessionToken),'cindy@example.com']]),activity=[],inserted=[];
async function sql(strings,...v){const q=strings.join('?').replace(/\s+/g,' ').trim();
 if(/^(CREATE|ALTER)/.test(q))return [];
 if(q.startsWith('INSERT INTO activity')){activity.push(v[0]);return []}
 if(q.startsWith('SELECT id FROM members WHERE session_hash='))return v[0]===cindy.session_hash?[{id:cindy.id}]:[];
 if(q.startsWith('DELETE FROM email_sessions WHERE token_hash='))return sessions.delete(v[0]),[];
 if(q.startsWith('SELECT email FROM email_sessions WHERE token_hash='))return sessions.has(v[0])?[{email:sessions.get(v[0])}]:[];
 if(q.startsWith('SELECT suspended_until,blocked_at FROM members WHERE contact='))return [];
 if(q.startsWith('INSERT INTO members')){inserted.push({contact:v[3],verified:v[6]!==null});return [{id:'new',name:v[2],contact:v[3],verified:v[6]!==null}]}
 if(q.startsWith('SELECT last_sent_at FROM email_codes'))return codes[v[0]]?[codes[v[0]]]:[];
 if(q.startsWith('SELECT id FROM members WHERE contact='))return v[0]===cindy.contact?[{id:cindy.id}]:[];
 if(q.startsWith('INSERT INTO email_codes')){codes[v[0]]={code_hash:v[1],last_sent_at:new Date(),attempts:0};return []}
 if(q.startsWith('UPDATE email_codes SET attempts'))return codes[v[0]]&&codes[v[0]].attempts++<5?[{code_hash:codes[v[0]].code_hash}]:[];
 if(q.startsWith('DELETE FROM email_codes')){delete codes[v[0]];return []}
 if(q.startsWith('UPDATE members SET session_hash=')){if(v[1]!==cindy.contact)return [];cindy.session_hash=v[0];const {session_hash,...m}=cindy;return [{...m,verified:true}]}
 if(q.startsWith('INSERT INTO email_sessions')){sessions.set(v[0],v[1]);return []}
 throw Error('Unmocked SQL '+q);
}
const src=fs.readFileSync(new URL('../api/member.mjs',import.meta.url),'utf8').replace("import {reviewGate} from './_review.mjs';",`import {reviewGate} from '${new URL('../api/_review.mjs',import.meta.url).href}';`).replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__memberSql;').replace("'./_ops.mjs'",`'${new URL('../api/_ops.mjs',import.meta.url).href}'`);
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

// Codes go to any valid email (sign-up needs them too), lead the subject for the phone's notification, and one a minute.
assert.equal((await post({action:'code_start',email:'not-an-email'})).status,400);
assert.equal((await post({action:'code_start',email:'Newbie@Example.com'})).status,200);
assert.equal(mail.at(-1).personalizations[0].to[0].email,'newbie@example.com');
const newbieCode=mail.at(-1).subject.match(/^(\d{6}) is your Chempatibility code$/)?.[1];assert.ok(newbieCode,'the code leads the subject line');
assert.equal((await post({action:'code_start',email:'newbie@example.com'})).status,429,'one code a minute');
// A new email: the code proves it, and there's no page to open yet.
const fresh=await post({action:'code_verify',email:'newbie@example.com',code:newbieCode});
assert.equal(fresh.status,200);assert.deepEqual(fresh.body,{existing:false,email:'newbie@example.com'});
const provenSession=fresh.cookies.find(c=>c.startsWith('chempat_session='))?.match(/^chempat_session=([a-f0-9]{64});/)?.[1];assert.ok(provenSession);
assert.equal(fresh.cookies.some(c=>c.startsWith('chempat_member=')),false);
// Registering with the proven email marks the page confirmed; without it the page starts unconfirmed.
const page={name:'Newbie',photo:cindy.photo,answers:[],agreed:true};
assert.equal((await post({action:'register',...page,contact:'newbie@example.com'},`chempat_session=${provenSession}`)).body.member.verified,true);
assert.equal((await post({action:'register',...page,contact:'other@example.com'})).body.member.verified,false);
assert.equal((await post({action:'register',...page,contact:'other2@example.com'},`chempat_session=${provenSession}`)).body.member.verified,false,'a code for one email does not prove another');
// One page per email.
const dup=await post({action:'register',...page,contact:'cindy@example.com'});
assert.equal(dup.status,409);assert.equal(dup.body.exists,true);
// An email that already has a page: the code opens it.
await post({action:'code_start',email:'Cindy@Example.com'});
const code=mail.at(-1).subject.match(/^\d{6}/)[0];
assert.equal((await post({action:'code_verify',email:'cindy@example.com',code:code==='000000'?'111111':'000000'})).status,400);
const signedIn=await post({action:'code_verify',email:'cindy@example.com',code});
assert.equal(signedIn.status,200);assert.equal(signedIn.body.existing,true);assert.equal(signedIn.body.member.name,'Cindy');assert.equal(signedIn.body.member.verified,true);assert.equal(signedIn.body.member.session_hash,undefined);
const opened=signedIn.cookies.find(c=>c.startsWith('chempat_member='))?.match(/^chempat_member=([a-f0-9]{64});/)?.[1];
assert.ok(opened);assert.equal(cindy.session_hash,hash(opened),'the new cookie opens the page');assert.notEqual(opened,memberToken);
assert.ok(signedIn.cookies.some(c=>/^chempat_session=[a-f0-9]{64};/.test(c)),'email is proven for sending invitations');
assert.ok(activity.includes('signin'));
assert.equal((await post({action:'code_verify',email:'cindy@example.com',code})).status,400,'codes work once');
// The old sign-in action names still work.
assert.equal((await post({action:'signin_start',email:'late@example.com'})).status,200);
console.log('Member log out, email codes, confirmed sign-up, one page per email, and email-only contact passed');
