process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
import fs from 'node:fs';
import {calls as opsCalls} from './ops-stub.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const memberToken='a'.repeat(64),visitorToken='b'.repeat(64),photo='data:image/jpeg;base64,AA==';
const member={id:'11111111-1111-4111-8111-111111111111',name:'Cindy',contact:'cindy@example.com',photo,answers:[0,1,2,0,1,2,0,1,2,0]};
let invitation=null,state=null;
async function sql(strings,...values){const query=strings.join('?').replace(/\s+/g,' ').trim();
 if(query.includes('ORDER BY id FOR UPDATE')||query.startsWith('SELECT 1 FROM member_blocks'))return [];
 if(query.startsWith('SELECT v.frozen_at'))return [{}];
 if(query.startsWith('SELECT id,name,contact,photo,answers FROM members'))return values[0]===hash(memberToken)?[member]:[];
 if(query.startsWith('SELECT id FROM members'))return values[0]===hash(memberToken)?[{id:member.id}]:values[0]===hash(visitorToken)?[{id:'visitor-id'}]:[];
 if(query.startsWith('SELECT name FROM members'))return values[0]===hash(visitorToken)?[{name:'Mike'}]:[];
 if(query.startsWith('INSERT INTO invitations')){invitation={token_hash:values[0],sender_email:values[1],sender_name:values[2],sender_photo:values[3],sender_answers:JSON.parse(values[4]),recipient_name:values[5],recipient_email:values[6],sender_member_id:values[7],channel:values[8],expires_at:new Date(Date.now()+900000)};return []}
 if(query.startsWith('INSERT INTO connection_state')){state={token_hash:values[0],claim_hash:null,status:'invited',prospect_name:null,prospect_photo:null,prospect_answers:[],prospect_phone:null,prospect_email:null,messages:[]};return []}
 if(query.startsWith('SELECT i.token_hash,i.created_at,i.sender_name'))return invitation&&values[0]===invitation.token_hash?[{...invitation,...state}]:[];
 if(query.startsWith('UPDATE connection_state SET claim_hash=')){if(state.claim_hash||invitation.expires_at<Date.now())return [];state.claim_hash=values[0];return [{claim_hash:state.claim_hash}]}
 if(query.startsWith('SELECT i.token_hash AS id'))return [{...invitation,id:invitation.token_hash,recipient_name:'',recipient_email:'',channel:'qr',claimed:!!state.claim_hash,...state}];
 if(query.startsWith('UPDATE connection_state SET prospect_name=')&&query.includes("status='firstResults'")){Object.assign(state,{prospect_name:values[0],prospect_photo:values[1],prospect_answers:JSON.parse(values[2]),prospect_member_id:values[3],status:'firstResults'});return [{status:state.status}]}
 if(query.startsWith('UPDATE connection_state SET prospect_name=')&&query.includes("status='request'")){Object.assign(state,{prospect_name:values[0],prospect_phone:values[1],prospect_email:values[2],prospect_photo:values[3],status:'request'});return [{status:state.status}]}
 if(query.startsWith('UPDATE connection_state SET status=')){assert.equal(values[1],invitation.token_hash);assert.equal(values[2],state.status);state.status=values[0];return [{status:state.status}]}
 if(query.startsWith('SELECT token_hash FROM invitations'))return [{token_hash:invitation.token_hash}];
 if(query.startsWith('UPDATE connection_state SET messages=')){state.messages.push(...JSON.parse(values[0]));return [{messages:state.messages}]}
 throw Error('Unmocked QR SQL '+query);
}
sql.transaction=async build=>{const results=[];for(const next of build((s,...v)=>()=>sql(s,...v)))results.push(await next());return results};
sql.query=async(q,v)=>q.includes('AND NOT (v.frozen_at')?sql([q],...v):[];
globalThis.__qrSql=sql;process.env.DATABASE_URL='postgres://test';
const qrSource=fs.readFileSync(new URL('../api/qr.mjs',import.meta.url),'utf8').replace("import {reviewGate} from './_review.mjs';",`import {reviewGate} from '${new URL('../api/_review.mjs',import.meta.url).href}';`).replace("'./_connections.mjs'",`'${new URL('../api/_connections.mjs',import.meta.url).href}'`).replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__qrSql;').replace("import * as ops from './_ops.mjs';",'const ops=globalThis.__ops;');
const qrApi=(await import('data:text/javascript;base64,'+Buffer.from(qrSource).toString('base64'))).default;
const connSource=fs.readFileSync(new URL('../api/connection.mjs',import.meta.url),'utf8').replace("import {reviewGate} from './_review.mjs';",`import {reviewGate} from '${new URL('../api/_review.mjs',import.meta.url).href}';`).replace("'./_connections.mjs'",`'${new URL('../api/_connections.mjs',import.meta.url).href}'`).replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__qrSql;').replace("import * as ops from './_ops.mjs';",'const ops=globalThis.__ops;');
const connection=(await import('data:text/javascript;base64,'+Buffer.from(connSource).toString('base64'))).default;
const memberCookie=`chempat_member=${memberToken}`;
const create=()=>qrApi.fetch(new Request('https://chempatible.com/api/qr',{method:'POST',headers:{cookie:memberCookie}}));
const initial=await create(),code=await initial.json();assert.equal(initial.status,200);assert.match(code.url,/^https:\/\/chempatible\.com\/\?invite=[a-f0-9]{64}$/);const svg=await (await import('qrcode')).default.toString(code.url,{type:'svg'});assert.match(svg,/<svg[^>]*>/);assert.equal(invitation.sender_member_id,member.id);assert.equal(invitation.channel,'qr');assert.equal(state.token_hash,code.id);
const get=(cookie='')=>connection.fetch(new Request(`https://chempatible.com/api/connection?invite=${code.url.split('invite=')[1]}`,{headers:cookie?{cookie}:{}}));
assert.equal((await get(memberCookie)).status,409,'The inviter cannot claim their own QR');
const first=await get();assert.equal(first.status,200);assert.equal((await first.json()).name,'Cindy');assert(first.headers.get('set-cookie'));const guestCookie=first.headers.get('set-cookie').split(';')[0];
assert.equal((await get()).status,409,'A second browser cannot take the pair');assert.equal((await get(guestCookie)).status,200,'The first phone can return');
const post=(body,cookie='')=>connection.fetch(new Request('https://chempatible.com/api/connection',{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)}));
const token=code.url.split('invite=')[1],visitorCookie=`${guestCookie}; chempat_member=${visitorToken}`;
assert.equal((await post({action:'first',token,photo,answers:[1,1,2,0,0]})).status,401,'Another browser cannot submit the five');
assert.equal((await post({action:'first',token,photo,answers:[1,1,2,0,0]},`${guestCookie}; chempat_member=${visitorToken}`)).status,200);
assert.equal(state.prospect_name,'Mike');
assert.equal((await get(guestCookie)).status,403,'Old QR cookie alone cannot resume linked account');assert.equal((await get(visitorCookie)).status,200);
assert.equal((await post({action:'request',token,photo,name:'Mike',contact:'mike@example.com'},visitorCookie)).status,200);
const inbox=await connection.fetch(new Request('https://chempatible.com/api/connection?inbox=1',{headers:{cookie:memberCookie}}));assert.equal(inbox.status,200);assert.equal((await inbox.json()).connections[0].status,'request');
assert.equal((await post({action:'decision',id:code.id,decision:'accept'},memberCookie)).status,200);
assert.equal(state.status,'secondFive');
assert.equal((await post({action:'message',token,text:'Premature chat'},visitorCookie)).status,409);
state.status='chat'; // Existing chats stay usable; staged path is covered in connection.test.mjs
assert.equal((await post({action:'message',token,text:'Hey Cindy'},visitorCookie)).status,200);
assert.equal((await post({action:'message',id:code.id,text:'Hey Mike'},memberCookie)).status,200);
assert.equal(state.messages.length,2);
const newer=await create(),next=await newer.json();assert.notEqual(next.id,code.id,'Each code gets a new pair ID');
invitation.expires_at=new Date(Date.now()-1000);
const expired=await connection.fetch(new Request(next.url));assert.equal(expired.status,410);
const devCode=await qrApi.fetch(new Request('https://chempatible-dev.vercel.app/api/qr',{method:'POST',headers:{cookie:memberCookie}}));assert.match((await devCode.json()).url,/^https:\/\/chempatible-dev\.vercel\.app\/\?invite=[a-f0-9]{64}$/);
console.log('QR creation, first-phone claim, pair ownership, expiration, and chat passed');

member.answers=member.answers.slice(0,5);assert.equal((await create()).status,200);assert.equal(invitation.sender_answers.length,5,"five-answer inviter creates QR without padding");
