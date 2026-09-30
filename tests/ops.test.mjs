process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
process.env.DATABASE_URL='postgres://test-secret';process.env.SENDGRID_API_KEY='test';
const hash=s=>createHash('sha256').update(s).digest('hex');
const mail=[];globalThis.fetch=async(url,opt)=>{mail.push(JSON.parse(opt.body));return {ok:true,status:202}};
const ops=await import('../api/_ops.mjs');

// In-memory stand-in for the tables _ops.mjs touches.
const members={},connections={},reports=[],activity=[],codes={};
const bad={id:'22222222-2222-4222-8222-222222222222',name:'Mike',contact:'bad@example.com',suspended_until:null,blocked_at:null,admin_notes:[]};
members[bad.id]=bad;
async function sql(strings,...v){const q=strings.join('?').replace(/\s+/g,' ').trim();
 if(/^(CREATE|ALTER)/.test(q))return [];
 if(q.startsWith('SELECT email_verified_at FROM members WHERE id='))return members[v[0]]?[{email_verified_at:members[v[0]].email_verified_at??null}]:[];
 if(q.startsWith('INSERT INTO activity')){activity.push({kind:v[0],member_id:v[1],connection_id:v[2],detail:JSON.parse(v[3])});return []}
 if(q.startsWith('SELECT suspended_until,blocked_at FROM members WHERE id='))return members[v[0]]?[members[v[0]]]:[];
 if(q.startsWith('SELECT suspended_until,blocked_at FROM members WHERE contact='))return Object.values(members).filter(m=>m.contact===v[0]&&(m.blocked_at||m.suspended_until>new Date()));
 if(q.startsWith('SELECT id FROM members WHERE session_hash='))return v[0]===hash('c'.repeat(64))?[{id:bad.id}]:[];
 if(q.startsWith('SELECT id FROM members WHERE contact='))return Object.values(members).filter(m=>m.contact===v[0]).map(m=>({id:m.id}));
 if(q.startsWith('UPDATE connection_state SET prospect_member_id=')){const c=connections[v[1]];if(c&&!c.prospect_member_id)c.prospect_member_id=v[0];return []}
 if(q.startsWith('SELECT i.token_hash,i.sender_member_id'))return connections[v[0]]?[connections[v[0]]]:[];
 if(q.startsWith('INSERT INTO reports')){const [id,connection_id,reporter_side,,, reported_member_id,,,reason]=v;if(reports.some(r=>r.connection_id===connection_id&&r.reporter_side===reporter_side))return [];reports.push({id,connection_id,reporter_side,reported_member_id,reason,status:'open',chat:JSON.parse(v[10])});return [{id}]}
 if(q.startsWith("UPDATE connection_state SET status='ended'")){Object.assign(connections[v[1]],{status:'ended',ended_by:v[0]});return []}
 if(q.startsWith('SELECT count(*)::int AS n FROM reports'))return [{n:reports.filter(r=>r.reported_member_id===v[0]&&r.status!=='dismissed').length}];
 if(q.startsWith('UPDATE members SET admin_notes='))return members[v[1]].admin_notes.push(...JSON.parse(v[0])),[];
 if(q.startsWith('UPDATE members SET suspended_until=now()+')){const m=members[v[1]];if(!m.blocked_at)m.suspended_until=new Date(Date.now()+parseInt(v[0])*86400000);return []}
 if(q.startsWith('UPDATE members SET blocked_at=coalesce')){members[v[0]].blocked_at??=new Date();return []}
 if(q.startsWith('SELECT last_sent_at FROM email_codes'))return codes[v[0]]?[codes[v[0]]]:[];
 if(q.startsWith('INSERT INTO email_codes')){codes[v[0]]={code_hash:v[1],last_sent_at:new Date(),attempts:0};return []}
 if(q.startsWith('UPDATE email_codes SET attempts'))return codes[v[0]]&&codes[v[0]].attempts++<5?[{code_hash:codes[v[0]].code_hash}]:[];
 if(q.startsWith('DELETE FROM email_codes')){delete codes[v[0]];return []}
 if(q.startsWith('SELECT name,contact FROM members WHERE id='))return members[v[0]]?[members[v[0]]]:[];
 if(q.startsWith('DELETE FROM reports WHERE reporter_member_id=')){for(let i=reports.length-1;i>=0;i--)if(reports[i].reported_member_id===v[1]||reports[i].reporter_member_id===v[0])reports.splice(i,1);return []}
 if(q.startsWith('DELETE FROM activity WHERE member_id=')){for(let i=activity.length-1;i>=0;i--)if(activity[i].member_id===v[0])activity.splice(i,1);return []}
 if(q.startsWith("UPDATE connection_state SET prospect_name='Deleted member'")){for(const c of Object.values(connections))if(c.prospect_member_id===v[0]||c.prospect_email===v[1]||c.prospect_phone===v[2])Object.assign(c,{prospect_name:'Deleted member',prospect_email:null,prospect_phone:null,prospect_member_id:null,messages:[],status:c.status==='invited'?'invited':'ended'});return []}
 if(q.startsWith("UPDATE invitations SET recipient_name='Deleted member'"))return [];
 if(q.startsWith('DELETE FROM invitations WHERE sender_member_id=')){for(const [k,c] of Object.entries(connections))if(c.sender_member_id===v[0]||c.sender_email===v[1])delete connections[k];return []}
 if(q.startsWith('DELETE FROM email_sessions'))return [];
 if(q.startsWith('DELETE FROM members WHERE id=')){delete members[v[0]];return []}
 throw Error('Unmocked SQL '+q);
}
sql.transaction=async queries=>Promise.all(queries);
const connection=(n,extra={})=>{const id=String(n).repeat(64).slice(0,64);connections[id]={token_hash:id,sender_member_id:'11111111-1111-4111-8111-111111111111',sender_name:'Cindy',sender_email:'cindy@example.com',status:'chat',prospect_member_id:bad.id,prospect_name:'Mike',prospect_email:'bad@example.com',prospect_phone:null,messages:[{by:'prospect',text:'hey',at:'2026-09-26T20:00:00Z'}],...extra};return id};

// Unconfirmed emails can't play past the reveal; confirmed ones and visitors without a page pass.
assert.equal((await ops.requireVerified(sql,bad.id)).needsVerify,true);
bad.email_verified_at=new Date();assert.equal(await ops.requireVerified(sql,bad.id),null);assert.equal(await ops.requireVerified(sql,null),null);

// Strike ladder: 1-2 flag, 3 suspends 30 days, 4+ blocks.
assert.deepEqual([1,2,3,4,5].map(ops.strikeAction),['flag','flag','suspend','block','block']);

// Unmatch ends the connection without a report.
const quiet=connection(9,{prospect_member_id:null});
assert.equal((await ops.endConnection(sql,{id:quiet,side:'member',actorId:null,report:null})).status,200);
assert.equal(connections[quiet].status,'ended');assert.equal(reports.length,0);assert.equal(activity.at(-1).kind,'unmatch');

// Bad reasons and missing connections are refused.
assert.equal((await ops.endConnection(sql,{id:connection(8),side:'member',report:{reason:'nope'}})).status,400);
assert.equal((await ops.endConnection(sql,{id:'0'.repeat(64),side:'member',report:null})).status,404);

// Reports 1 and 2 flag and leave a private note; report 3 suspends; report 4 blocks.
for(const [n,expect] of [[1,null],[2,null],[3,'suspended'],[4,'blocked']]){
 const id=connection(n);
 const result=await ops.endConnection(sql,{id,side:'member',actorId:'11111111-1111-4111-8111-111111111111',report:{reason:'harassment',note:'Kept texting'}});
 assert.equal(result.status,200);assert.equal(connections[id].status,'ended');
 assert.equal(bad.admin_notes.length,n);assert.match(bad.admin_notes.at(-1).text,new RegExp(`^Report ${n}: Harassment`));
 const verdict=await ops.standing(sql,bad.id);
 if(!expect)assert.equal(verdict,null);
 if(expect==='suspended'){assert.match(verdict.error,/paused until/);assert.ok(bad.suspended_until>new Date(Date.now()+29*86400000));assert.ok(activity.some(a=>a.kind==='auto_suspend'))}
 if(expect==='blocked'){assert.match(verdict.error,/can no longer play/);assert.ok(activity.some(a=>a.kind==='auto_block'))}
}
assert.equal(mail.length,4);assert.equal(mail[0].personalizations[0].to[0].email,'blk911@gmail.com');assert.match(mail[2].content[0].value,/suspended 30 days/);
assert.equal(reports[0].chat.length,1,'the chat is kept with the report');

// The same side can't report one connection twice; the other side can.
assert.equal((await ops.endConnection(sql,{id:connection(1),side:'member',report:{reason:'fake'}})).status,409);
assert.equal((await ops.endConnection(sql,{id:connection(5,{prospect_member_id:null}),side:'member',report:{reason:'fake'}})).status,200);
assert.equal(reports.at(-1).reported_member_id,bad.id,'unlinked reports match the member by contact');

// A blocked contact can't sign up again.
assert.match((await ops.standingByContact(sql,'bad@example.com')).error,/can no longer play/);
assert.equal(await ops.standingByContact(sql,'fine@example.com'),null);
assert.equal(await ops.standing(sql,null),null);

// Admin cookie: valid for the admin until it expires; tampering or expiry fails.
const req=cookie=>new Request('https://chempatible.com/admin',{headers:{cookie}});
const good=ops.signAdmin(ops.ADMIN_EMAIL,Date.now()+60000);
assert.equal(ops.readAdmin(req(`chempat_admin=${good}`)),'blk911@gmail.com');
assert.equal(ops.readAdmin(req(`chempat_admin=${good.slice(0,-1)}0`)),null);
assert.equal(ops.readAdmin(req(`chempat_admin=${ops.signAdmin(ops.ADMIN_EMAIL,Date.now()-1000)}`)),null);
assert.equal(ops.readAdmin(req(`chempat_admin=${ops.signAdmin('someone@example.com',Date.now()+60000)}`)),null);
assert.equal(ops.readAdmin(req('')),null);

// The page gate accepts exactly the cookies the admin API accepts.
const middleware=(await import('../middleware.js')).default;
assert.equal(await middleware(req(`chempat_admin=${good}`)),undefined);
const bounced=await middleware(req(''));assert.equal(bounced.status,307);assert.equal(new URL(bounced.headers.get('location')).pathname,'/admin-login');
assert.equal((await middleware(new Request('https://chempatible.com/admin-ops.js'))).status,401);
assert.equal((await middleware(req(`chempat_admin=${good.slice(0,-1)}0`))).status,307);

// Admin API: only the admin address gets a code, codes sign in once, and data needs the cookie.
const src=fs.readFileSync(new URL('../api/admin.mjs',import.meta.url),'utf8').replace("import {reviewGate} from './_review.mjs';",`import {reviewGate} from '${new URL('../api/_review.mjs',import.meta.url).href}';`).replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__adminSql;').replace("'./_ops.mjs'",`'${new URL('../api/_ops.mjs',import.meta.url).href}'`);
globalThis.__adminSql=sql;
const admin=(await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'))).default;
const post=async(body,cookie='')=>{const r=await admin.fetch(new Request('https://chempatible.com/api/admin',{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify(body)}));return [r.status,await r.json(),r.headers.get('set-cookie')]};
mail.length=0;
assert.equal((await post({action:'start',email:'intruder@example.com'}))[0],200);assert.equal(mail.length,0,'no code for other addresses');
assert.equal((await post({action:'start',email:'BLK911@gmail.com'}))[0],200);assert.equal(mail.length,1);assert.equal(mail[0].personalizations[0].to[0].email,'blk911@gmail.com');
assert.equal((await post({action:'start',email:'blk911@gmail.com'}))[0],429,'one code a minute');
const code=mail[0].content[0].value.match(/\d{6}/)[0];
assert.equal((await post({action:'verify',email:'blk911@gmail.com',code:code==='000000'?'111111':'000000'}))[0],400);
const [ok,,setCookie]=await post({action:'verify',email:'blk911@gmail.com',code});
assert.equal(ok,200);assert.match(setCookie,/chempat_admin=\d+\.[a-f0-9]{64}; HttpOnly; Secure; SameSite=Strict/);
assert.equal((await post({action:'verify',email:'blk911@gmail.com',code}))[0],400,'codes work once');
const session=setCookie.split(';')[0];
const view=async(q,cookie='')=>{const r=await admin.fetch(new Request('https://chempatible.com/api/admin?'+q,{headers:{cookie}}));return [r.status,await r.json()]};
assert.equal((await view('view=me'))[0],401);
assert.deepEqual(await view('view=me',session),[200,{email:'blk911@gmail.com'}]);
assert.equal((await post({action:'block',id:bad.id}))[0],401,'admin actions need the cookie');
assert.ok(activity.some(a=>a.kind==='admin_login'));
// Delete member: admin only, removes the member and scrubs them from connections they joined.
const joined=connection(7);connections[joined].prospect_phone=null;
assert.equal((await post({action:'delete_member',id:bad.id}))[0],401);
assert.equal((await post({action:'delete_member',id:'33333333-3333-4333-8333-333333333333'},session))[0],404);
assert.equal((await post({action:'delete_member',id:bad.id},session))[0],200);
assert.equal(members[bad.id],undefined);
assert.equal(reports.some(r=>r.reported_member_id===bad.id),false);
assert.equal(activity.some(a=>a.member_id===bad.id),false);
assert.deepEqual([connections[joined].prospect_name,connections[joined].prospect_email,connections[joined].prospect_member_id,connections[joined].messages.length,connections[joined].status],['Deleted member',null,null,0,'ended']);
assert.equal(activity.at(-1).kind,'admin_delete');assert.equal(activity.at(-1).detail.name,'Mike');
assert.equal((await post({action:'delete_member',id:bad.id},session))[0],404,'already gone');
console.log('Moderation strikes, admin sign-in, page gate, and member delete passed');
