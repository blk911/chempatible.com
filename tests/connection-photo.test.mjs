import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
process.env.DATABASE_URL='postgres://synthetic-photo-history-only';
const db=new PGlite();
await db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
const tokens=['a','b','c'].map(x=>x.repeat(64));
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const jpegA=Buffer.from([255,216,1,255,217]),jpegB=Buffer.from([255,216,2,255,217]);
const photo=bytes=>'data:image/jpeg;base64,'+bytes.toString('base64');
for(let n=0;n<3;n++)await db.query('INSERT INTO members(id,session_hash,name,contact,photo) VALUES($1,$2,$3,$4,$5)',[ids[n],hash(tokens[n]),'Synthetic '+n,`synthetic${n}@example.com`,photo(jpegA)]);
const invitation='d'.repeat(64),unclaimed='e'.repeat(64);
for(const id of [invitation,unclaimed]){
 await db.query("INSERT INTO invitations(token_hash,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,sender_member_id) VALUES($1,'','Synthetic sender',$2,'[]','','',$3)",[id,photo(jpegA),ids[0]]);
 await db.query("INSERT INTO connection_state(invitation_hash,prospect_member_id,prospect_photo,status) VALUES($1,$2,$3,'ended')",[id,id===invitation?ids[1]:null,id===invitation?photo(jpegB):null]);
}
let queries=0;
globalThis.__photoHistorySql=async(strings,...values)=>{queries++;return (await db.query(strings.reduce((q,part,n)=>q+(n?'$'+n:'')+part,''),values)).rows};
const source=fs.readFileSync(new URL('../api/connection-photo.mjs',import.meta.url),'utf8').replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__photoHistorySql;').replace("'./_review.mjs'",JSON.stringify(new URL('../api/_review.mjs',import.meta.url).href));
const api=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const call=(id=invitation,token=tokens[0],method='GET')=>api.fetch(new Request('https://isolated.example/api/connection-photo?id='+id,{method,headers:token?{cookie:'chempat_member='+token}:{}}));
for(const [token,expected] of [[tokens[0],jpegB],[tokens[1],jpegA]]){
 const response=await call(invitation,token);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),expected);
 assert.equal(response.headers.get('content-type'),'image/jpeg');assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('cross-origin-resource-policy'),'same-origin');
}
assert.equal((await call(invitation,tokens[2])).status,404,'other pair cannot fetch photo');
assert.equal((await call(invitation,null)).status,401,'link alone provides no authority');
assert.equal((await call(invitation,'f'.repeat(64))).status,404,'rotated or invalid member session fails');
assert.equal((await call(unclaimed)).status,404,'unaccepted named recipient does not expose a profile photo');
assert.equal((await call('../other')).status,404);
assert.equal((await call(invitation,tokens[0],'POST')).status,405);
const head=await call(invitation,tokens[0],'HEAD');assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),String(jpegB.length));
await db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids[0],ids[1]]);
assert.equal((await call()).status,200,'block does not erase already-shared private history');
await db.query("INSERT INTO connection_visibility(member_id,invitation_hash,frozen_at,action,trashed_at) VALUES($1,$2,now(),'freeze',now())",[ids[0],invitation]);
assert.equal((await call()).status,200,'personal Trash retains recoverable shared history');
for(const invalid of ['data:text/html;base64,PGgxPm5vPC9oMT4=',photo(Buffer.from('<svg>not a JPEG</svg>')),'data:image/jpeg;base64,'+'A'.repeat(250000)]){
 await db.query('UPDATE connection_state SET prospect_photo=$1 WHERE invitation_hash=$2',[invalid,invitation]);
 assert.equal((await call()).status,404,'unsafe/corrupt/oversized payload is not rendered');
}
delete process.env.CHEMPAT_REVIEW_DATA;const before=queries;assert.equal((await call()).status,503);assert.equal(queries,before,'review gate blocks before database');
await db.close();
console.log('Connection photo history: participant ownership, cross-pair denial, pending privacy, Trash/Block retention, MIME bounds and fail-closed review guard pass');
