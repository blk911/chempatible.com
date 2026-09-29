import fs from 'node:fs';
import {calls as opsCalls} from './ops-stub.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const raw='a'.repeat(64),id=createHash('sha256').update(raw).digest('hex');
const member={token_hash:id,sender_email:'member@example.com',sender_name:'Cindy',sender_photo:'data:image/jpeg;base64,AA==',sender_answers:[0,1,2,0,1,2,0,1,2,0],recipient_name:'Mike',recipient_email:'mike@example.com'};
const state={invitation_hash:id,prospect_name:null,prospect_photo:null,prospect_answers:[],prospect_phone:null,prospect_email:null,status:'invited',messages:[]};
async function sql(strings,...v){const q=strings.join('?').replace(/\s+/g,' ').trim();
 if(q.startsWith('SELECT i.token_hash,i.sender_name'))return v[0]===id?[{...member,...state}]:[];
 if(q.startsWith('SELECT email FROM email_sessions'))return v[0]===createHash('sha256').update('b'.repeat(64)).digest('hex')?[{email:'member@example.com'}]:[];
 if(q.startsWith('SELECT i.token_hash AS id'))return [{...state,id,recipient_name:member.recipient_name,recipient_email:member.recipient_email}];
 if(q.startsWith('UPDATE connection_state SET prospect_name=')&&q.includes("status='firstResults'")){Object.assign(state,{prospect_name:v[0],prospect_photo:v[1],prospect_answers:JSON.parse(v[2]),status:'firstResults'});return []}
 if(q.startsWith('UPDATE connection_state SET prospect_name=')&&q.includes("status='request'")){Object.assign(state,{prospect_name:v[0],prospect_phone:v[1],prospect_email:v[2],prospect_photo:v[3],status:'request'});return []}
 if(q.startsWith('UPDATE connection_state c SET status=')){assert.equal(v[1],id);assert.equal(v[2],'member@example.com');state.status=v[0];return [{status:v[0]}]}
 if(q.startsWith('UPDATE connection_state SET prospect_answers=')){state.prospect_answers=JSON.parse(v[0]);state.status='secondResults';return []}
 if(q.startsWith('UPDATE connection_state SET prospect_email=')){state.prospect_email=v[0];state.status='email';return []}
 if(q.startsWith('SELECT token_hash FROM invitations'))return [{token_hash:id}];
 if(q.startsWith('UPDATE connection_state SET messages=jsonb_set')){const [path,index,,by,reaction]=v;assert.equal(Number(path),index);if(!state.messages[index])return [];state.messages[index].reactions={...state.messages[index].reactions,[by]:reaction};return [{messages:state.messages}]}
 if(q.startsWith('UPDATE connection_state SET messages=')){state.messages.push(...JSON.parse(v[0]));return [{messages:state.messages}]}
 throw Error('Unmocked SQL '+q)
}
let source=fs.readFileSync(new URL('../api/connection.mjs',import.meta.url),'utf8').replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__sql;').replace("import * as ops from './_ops.mjs';",'const ops=globalThis.__ops;').replace("import {ensureConnectionSchema} from './connection-schema.mjs';",'const ensureConnectionSchema=async()=>{};').replace("import {ensureQrSchema} from './qr-schema.mjs';",'const ensureQrSchema=async()=>{};');globalThis.__sql=sql;process.env.DATABASE_URL='postgres://test';
const {default:api}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const call=async(body,cookie)=>{let r=await api.fetch(new Request('https://chempatible.com/api/connection',{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie:`chempat_session=${'b'.repeat(64)}`}:{})},body:JSON.stringify(body)}));return [r.status,await r.json()]};
const get=async(query,cookie)=>{let r=await api.fetch(new Request('https://chempatible.com/api/connection?'+query,{headers:cookie?{cookie:`chempat_session=${'b'.repeat(64)}`}:{}}));return [r.status,await r.json()]};
assert.equal((await get('invite='+raw))[1].answers.length,0);
assert.equal((await call({action:'first',token:raw,photo:member.sender_photo,answers:[1,1,2,0,0]}))[0],200);
assert.equal((await get('inbox=1',true))[1].connections[0].status,'firstResults');
assert.equal((await call({action:'request',token:raw,name:'Mike',contact:'mike@example.com',photo:member.sender_photo}))[0],200);
assert.equal(state.prospect_email,'mike@example.com');assert.equal(state.prospect_phone,null);
assert.equal((await call({action:'decision',id,decision:'accept'},true))[1].status,'chat');
assert.equal((await get('invite='+raw))[1].answers.length,10);
assert.equal((await call({action:'message',token:raw,text:'Hello!'}))[1].messages.length,1);
assert.equal((await call({action:'message',id,text:'Hi Mike!'},true))[1].messages.length,2);
assert.equal((await call({action:'message',id,photo:member.sender_photo},true))[1].messages[2].photo,member.sender_photo);
assert.equal((await call({action:'react',id,index:0,reaction:'like'},true))[1].messages[0].reactions.member,'like');
assert.equal((await call({action:'react',token:raw,index:0,reaction:'dislike'}))[1].messages[0].reactions.prospect,'dislike');
assert.equal((await call({action:'react',id,index:99,reaction:'like'},true))[0],409);
assert.equal((await call({action:'second',token:raw,answers:[1,1,2,0,0,2,1,0,1,2]}))[0],200);
assert.equal((await call({action:'email',token:raw,email:'mike@example.com'}))[0],200);
assert.equal((await get('inbox=1',true))[1].connections[0].prospect_email,'mike@example.com');
assert.ok(['first_five','request','accept','message','next_five','email_shared'].every(k=>opsCalls.some(c=>c.kind===k)),'every step is logged');
assert.equal(opsCalls.filter(c=>c.kind==='link').length,2,'the invitee is linked to their member page');
assert.equal((await call({action:'report',token:raw,reason:'harassment',note:'Rude'}))[0],200);
let ended=opsCalls.filter(c=>c.kind==='end').at(-1);assert.equal(ended.side,'prospect');assert.equal(ended.id,id);assert.equal(ended.report.reason,'harassment');
assert.equal((await call({action:'unmatch',id},true))[0],200);
ended=opsCalls.filter(c=>c.kind==='end').at(-1);assert.equal(ended.side,'member');assert.equal(ended.report,null);
assert.equal((await call({action:'unmatch',id})) [0],401,'members must be signed in to unmatch');
state.status='ended';const closed=(await get('inbox=1',true))[1].connections[0];assert.equal(closed.prospect_email,null);assert.equal(closed.messages.length,0);
assert.equal((await get('invite='+raw))[1].messages.length,0,'an ended chat is hidden from both sides');
console.log('Cross-browser API transitions passed');
