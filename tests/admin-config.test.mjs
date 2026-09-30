import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHmac} from 'node:crypto';

process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
process.env.CHEMPAT_REVIEW_EMAILS='admin@example.com';
process.env.DATABASE_URL='postgres://test-only';
process.env.ADMIN_SESSION_SECRET='test-only-signing-key';
process.env.SENDGRID_API_KEY='test-only';
let networkCalls=0,databaseConnections=0;
globalThis.fetch=async()=>{networkCalls++;throw Error('Unexpected network access')};
globalThis.__adminConfigSql=()=>{databaseConnections++;throw Error('Unconfigured admin connected to the database')};
const rawAdmin=fs.readFileSync(new URL('../api/admin.mjs',import.meta.url),'utf8');
const request=(path='/admin',cookie='')=>new Request('https://admin.example'+path,{headers:{cookie}});
const cookieFor=email=>{
 const expires=Date.now()+60000;
 return `chempat_admin=${expires}.${createHmac('sha256',process.env.ADMIN_SESSION_SECRET).update(`admin|${email}|${expires}`).digest('hex')}`;
};

// A blank identity or malformed environment value must never become an admin.
const invalid=[undefined,'','   ','not-an-email','@example.com','admin@example','one@example.com,two@example.com','one@example.com;two@example.com','admin@example.com\r\nBcc: other@example.com','a'.repeat(244)+'@example.com'];
for(const [index,value] of invalid.entries()){
 if(value===undefined)delete process.env.CHEMPAT_ADMIN_EMAIL;else process.env.CHEMPAT_ADMIN_EMAIL=value;
 const opsUrl=new URL(`../api/_ops.mjs?admin-config-invalid=${index}`,import.meta.url).href;
 const ops=await import(opsUrl);
 const middleware=(await import(`../middleware.js?admin-config-invalid=${index}`)).default;
 assert.equal(ops.ADMIN_EMAIL,'');
 assert.throws(()=>ops.signAdmin('',Date.now()+60000),/not configured/);
 for(const identity of ['',value||'','admin@example.com']){
  const cookie=cookieFor(identity);
  assert.equal(ops.readAdmin(request('/admin',cookie)),null);
  assert.equal((await middleware(request('/admin',cookie))).status,307);
  assert.equal((await middleware(request('/admin-ops.js',cookie))).status,401);
 }
 const source=rawAdmin.replace("'./_review.mjs'",JSON.stringify(new URL('../api/_review.mjs',import.meta.url).href)).replace("import {neon} from '@neondatabase/serverless';",'const neon=globalThis.__adminConfigSql;').replace("'./_ops.mjs'",JSON.stringify(opsUrl));
 const admin=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
 for(const action of ['start','verify','block']){
  const response=await admin.fetch(new Request('https://admin.example/api/admin',{method:'POST',headers:{'content-type':'application/json',cookie:cookieFor('')},body:JSON.stringify({action,email:value||'',code:'123456'})}));
  assert.equal(response.status,503);
  assert.equal(response.headers.get('set-cookie'),null);
 }
 assert.equal((await admin.fetch(request('/api/admin?view=me',cookieFor('')))).status,503);
 if(index===0){
  const queries=[],logged=[];
  const sql=async(strings)=>{
   const query=strings.join('?').replace(/\s+/g,' ').trim();queries.push(query);
   if(query.startsWith('SELECT i.token_hash'))return [{status:'chat',sender_name:'Reporter',prospect_member_id:'reported-member',prospect_name:'Reported',prospect_email:'reported@example.com',messages:[]}];
   if(query.startsWith('INSERT INTO reports'))return [{id:'report-id'}];
   if(query.startsWith('SELECT count(*)'))return [{n:3}];
   return [];
  };
  const originalError=console.error;console.error=(...args)=>logged.push(args.map(String).join(' '));
  try{
   const result=await ops.endConnection(sql,{id:'connection-id',side:'member',actorId:'reporter-member',report:{reason:'harassment',note:'Test report'}});
   assert.equal(result.status,200);
  }finally{console.error=originalError}
  assert.ok(queries.some(query=>query.startsWith('INSERT INTO reports')),'report remains stored');
  assert.ok(queries.some(query=>query.startsWith("UPDATE connection_state SET status='ended'")),'reported connection remains closed');
  assert.ok(queries.some(query=>query.startsWith('UPDATE members SET suspended_until=now()+')),'third-strike suspension remains applied');
  assert.ok(logged.some(line=>line.includes('Report alert error:')&&line.includes('Admin email is not configured.')),'undelivered alert is logged');
 }
}
assert.equal(databaseConnections,0,'missing admin configuration fails before database connection');
assert.equal(networkCalls,0,'invalid or missing admin addresses never receive mail');

process.env.CHEMPAT_ADMIN_EMAIL='  Admin@Example.COM  ';
const ops=await import('../api/_ops.mjs?admin-config-valid');
const middleware=(await import('../middleware.js?admin-config-valid')).default;
assert.equal(ops.ADMIN_EMAIL,'admin@example.com');
const cookie=`chempat_admin=${ops.signAdmin(ops.ADMIN_EMAIL,Date.now()+60000)}`;
assert.equal(ops.readAdmin(request('/admin',cookie)),'admin@example.com');
assert.equal((await middleware(request('/admin',cookie))).headers.get('x-middleware-next'),'1');
assert.equal(ops.readAdmin(request('/admin',cookieFor('other@example.com'))),null);
delete process.env.ADMIN_SESSION_SECRET;delete process.env.DATABASE_URL;
assert.throws(()=>ops.signAdmin(ops.ADMIN_EMAIL,Date.now()+60000),/not configured/);
assert.equal(ops.readAdmin(request('/admin',cookie)),null);
assert.equal((await middleware(request('/admin',cookie))).status,307);
console.log('Admin configuration fails closed without a valid explicit address/key; reports and moderation remain stored');
