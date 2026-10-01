process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {calls as opsCalls} from './ops-stub.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const raw='a'.repeat(64),id=hash(raw),owner='b'.repeat(64),visitor='c'.repeat(64),stranger='d'.repeat(64),photo='data:image/jpeg;base64,AA==';
const member={token_hash:id,created_at:'2026-09-30T17:42:32.000Z',sender_member_id:'owner',sender_email:'owner@example.com',sender_name:'Cindy',sender_photo:photo,sender_answers:[0,1,2,0,1,2,0,1,2,0],recipient_name:'Mike',recipient_email:'private-invite@example.com',channel:'email'};
const state={prospect_member_id:null,claim_hash:null,prospect_name:null,prospect_photo:null,prospect_answers:[],prospect_phone:null,prospect_email:null,status:'invited',messages:[]};
const ids=new Map([[hash(owner),'owner'],[hash(visitor),'visitor'],[hash(stranger),'stranger']]);
let race=false,failFinalize=false;
const validEmailSession='f'.repeat(64);
async function sql(strings,...v){const q=strings.join('?').replace(/\s+/g,' ').trim();
 if(q.includes('ORDER BY id FOR UPDATE')||q.startsWith('SELECT 1 FROM member_blocks'))return [];
 if(q.startsWith('SELECT v.frozen_at'))return [{}];
 if(q.startsWith('SELECT email FROM email_sessions'))return v[0]===hash(validEmailSession)?[{email:'owner@example.com'}]:[];
 if(q.startsWith('SELECT id FROM members'))return ids.has(v[0])?[{id:ids.get(v[0])}]:[];
 if(q.startsWith('SELECT name FROM members'))return v[0]===hash(visitor)?[{name:'Mike'}]:[];
 if(q.startsWith('SELECT i.token_hash,i.created_at,i.sender_name'))return v[0]===id?[{...member,...state}]:[];
 if(q.startsWith('SELECT i.token_hash AS id'))return (v[0]===member.sender_member_id||v[0]===state.prospect_member_id)&&!(member.channel==='qr'&&!state.claim_hash&&member.expires_at<Date.now())?[{...member,...state,id,claimed:!!state.claim_hash}]:[];
 if(q.startsWith('UPDATE connection_state SET claim_hash=')){if(state.claim_hash||member.expires_at<Date.now())return [];state.claim_hash=v[0];return [{claim_hash:state.claim_hash}]}
 if(race){race=false;state.status='ended';return []}
 if(q.startsWith('UPDATE connection_state SET prospect_name=')&&q.includes("status='firstResults'")){if(state.status!==v[5])return [];Object.assign(state,{prospect_name:v[0],prospect_photo:v[1],prospect_answers:JSON.parse(v[2]),prospect_member_id:v[3],status:'firstResults'});return [{status:state.status}]}
 if(q.startsWith('UPDATE connection_state SET prospect_name=')&&q.includes("status='request'")){if(state.status!==v[6])return [];Object.assign(state,{prospect_name:v[0],prospect_phone:v[1],prospect_email:v[2],prospect_photo:v[3],status:'request'});return [{status:state.status}]}
 if(q.startsWith('UPDATE connection_state SET status=?')){if(state.status!==v[2])return [];state.status=v[0];return [{status:state.status}]}
 if(q.startsWith("UPDATE connection_state SET status='chatRequested'")){if(state.status!=='nextResults')return [];state.status='chatRequested';return [{status:state.status}]}
 if(q.startsWith('WITH locked AS')){if(!['secondFive','chat'].includes(state.status)||member.sender_answers.length!==5)return [];member.sender_answers=JSON.parse(v[1]);return [{token_hash:id}]}
 if(q.startsWith('UPDATE connection_state SET prospect_answers=')){if(!['secondFive','chat'].includes(state.status)||state.prospect_answers.length!==5)return [];state.prospect_answers=JSON.parse(v[0]);return [{invitation_hash:id}]}
 if(q.startsWith('UPDATE connection_state c SET status=CASE')){if(failFinalize){failFinalize=false;throw Error('Synthetic finalize interruption')}if(['secondFive','chat'].includes(state.status)&&member.sender_answers.length===10&&state.prospect_answers.length===10){state.status=state.status==='chat'?'chat':'nextResults';return [{status:state.status}]}return []}
 if(q.startsWith('UPDATE connection_state SET prospect_email=')){if(state.status!==v[2])return [];state.prospect_email=v[0];state.status='email';return [{status:state.status}]}
 if(q.startsWith('UPDATE connection_state SET messages=jsonb_set')){const [path,index,,by,reaction]=v;assert.equal(Number(path),index);if(!state.messages[index])return [];state.messages[index].reactions={...state.messages[index].reactions,[by]:reaction};return [{messages:state.messages}]}
 if(q.startsWith('UPDATE connection_state SET messages=')){state.messages.push(...JSON.parse(v[0]));return [{messages:state.messages}]}
 throw Error('Unmocked SQL '+q)
}
sql.transaction=async build=>{const results=[];for(const next of build((s,...v)=>()=>sql(s,...v)))results.push(await next());return results};
sql.query=async(q,v)=>{const rows=await sql([q],...v);const history=['ended','declined'].includes(state.status);return q.includes('AND NOT (v.frozen_at')?(history?[]:rows):(history?rows:[])};
globalThis.__sql=sql;process.env.DATABASE_URL='postgres://test';
let source=fs.readFileSync(new URL('../api/connection.mjs',import.meta.url),'utf8').replace("'./_reinvite.mjs'",`'${new URL('../api/_reinvite.mjs',import.meta.url).href}'`).replace("'./_connections.mjs'",`'${new URL('../api/_connections.mjs',import.meta.url).href}'`).replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__sql;').replace("import * as ops from './_ops.mjs';",'const ops=globalThis.__ops;').replace("import {reviewGate} from './_review.mjs';",`import {reviewGate} from '${new URL('../api/_review.mjs',import.meta.url).href}';`);
const api=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const headers=token=>token?{cookie:`chempat_member=${token}`} : {};
const call=async(body,token)=>{const r=await api.fetch(new Request('https://example.com/api/connection',{method:'POST',headers:headers(token),body:JSON.stringify(body)}));return [r.status,await r.json()]};
const get=async(query,token)=>{const r=await api.fetch(new Request('https://example.com/api/connection?'+query,{headers:headers(token)}));return [r.status,await r.json()]};
const first={action:'first',token:raw,photo,answers:[1,1,2,0,0]};
const second={action:'second',id,answers:[1,1,2,0,0,2,1,0,1,2]};
const inbox=async(token=owner)=>(await get('inbox=1',token))[1].connections;
function hidden(row){for(const key of ['prospect_email','prospect_phone','recipient_email'])if(key in row)assert.equal(row[key],null);assert(!JSON.stringify({...row,historyEmail:null}).includes('private-invite@example.com'));if(row.side==='prospect')assert.equal(row.historyEmail,null)}
assert.equal((await get('invite='+raw))[1].answers.length,0);
assert.equal((await call(first))[0],401);
assert.equal((await call(first,owner))[0],401,'inviter cannot answer own invitation');
assert.equal((await call(first,visitor))[0],200);
assert.equal(state.prospect_member_id,'visitor','account bound atomically with reveal');
assert.equal((await call(first,visitor))[0],409,'answers cannot be rewritten after reveal');
assert.equal((await get('invite='+raw))[0],403,'logout cannot reopen linked invitation with raw token');
assert.equal((await get('invite='+raw,stranger))[0],403);
assert.equal((await get('invite='+raw,visitor))[1].answers.length,5);
let received=(await inbox(visitor))[0];assert.equal(received.side,'prospect');assert.equal(received.id,id);assert.equal(received.sender_name,'Cindy');assert.equal(received.sender_answers.length,5);
assert.deepEqual(await inbox(stranger),[]);
assert.equal((await get('inbox=1'))[0],401);
assert.equal((await call(second,visitor))[0],400,'next five require inviter agreement');
assert.equal((await call({action:'request',id,name:'Mike',contact:'mike@example.com',photo},visitor))[0],200);
hidden((await inbox())[0]);
assert.equal((await call({action:'decision',id,decision:'accept'},visitor))[0],404,'recipient cannot accept own request');
assert.equal((await call({action:'decision',id,decision:'accept'},stranger))[0],404);
assert.equal((await call({action:'decision',id,decision:'accept'},owner))[1].status,'secondFive');
assert.equal((await get('invite='+raw,visitor))[1].answers.length,5,'second five hidden before both answer');
assert.equal((await call({action:'message',id,text:'Too early'},owner))[0],409);
assert.equal((await call({action:'chat',id},visitor))[0],409);
assert.equal((await call({...second,answers:Array(10).fill(0)},visitor))[0],400,'first five immutable');
assert.equal((await call(second,stranger))[0],404);
assert.equal((await call(second,visitor))[1].answers.length,10);assert.equal(state.status,'nextResults');assert.equal((await inbox(visitor))[0].status,'secondResults');
assert.equal((await get('invite='+raw,visitor))[1].answers.length,10);
hidden((await inbox())[0]);
assert.equal((await call(second,visitor))[0],200,'identical completion retry is safe');assert.equal((await call({...second,answers:[...second.answers.slice(0,9),0]},visitor))[0],400,'revealed next five cannot change');
assert.equal((await call({action:'email',id,email:'shared@example.com'},visitor))[0],400);
assert.equal((await call({action:'message',id,text:'Too early'},visitor))[0],409);
assert.equal((await call({action:'chat',id},visitor))[1].status,'chatRequested');
assert.equal((await call({action:'message',id,text:'Still too early'},visitor))[0],409);
assert.equal((await call({action:'decision',id,decision:'accept'},owner))[1].status,'chat');
assert.equal((await call({action:'message',id,text:'Hello'},visitor))[1].messages[0].by,'prospect');
assert.equal((await call({action:'message',id,text:'Hi'},owner))[1].messages[1].by,'member');
assert.equal((await call({action:'react',id,index:0,reaction:'like'},owner))[1].messages[0].reactions.member,'like');
hidden((await inbox())[0]);
assert.equal((await call({action:'email',id,email:'shared@example.com'},visitor))[0],200);
assert.equal((await inbox())[0].prospect_email,'shared@example.com');assert.equal((await inbox())[0].recipient_email,null,'sharing a different address never exposes original recipient address');
assert.equal((await call({action:'report',id,reason:'harassment'},visitor))[0],200);assert.equal(opsCalls.at(-1).side,'prospect');
assert.equal((await call({action:'unmatch',id},owner))[0],200);assert.equal(opsCalls.at(-1).side,'member');
assert.equal((await call({action:'unmatch',id},stranger))[0],404);
state.status='ended';hidden((await inbox())[0]);assert.equal((await get('invite='+raw,visitor))[0],410,'ended token has no reveal payload');assert.equal((await call({action:'email',id,email:'again@example.com'},visitor))[0],400);
// Null/invalid sessions must never inherit unlinked rows or skip member verification.
assert.equal((await call(null,owner))[0],400);
assert.equal((await call([],owner))[0],400);
assert.equal((await call({action:'message',id,text:'Anonymous'}))[0],401);
assert.equal((await call({action:'message',id,text:'Unknown'},'e'.repeat(64)))[0],401);
assert.equal((await call({action:'unmatch',id}))[0],404);
assert.equal((await call({action:'report',id,reason:'harassment'}))[0],404);
const bound=state.prospect_member_id;state.prospect_member_id=null;state.status='chat';
assert.equal((await call({action:'message',token:raw,text:'No login'}))[0],401,'unlinked bearer cannot skip verification by omitting account');
assert.equal((await call({action:'request',token:raw,name:'Other',contact:'other@example.com',photo}))[0],401);
state.prospect_member_id=bound;
// Session rotation preserves member-ID recovery and revokes the previous cookie.
const renewed='f'.repeat(64);ids.delete(hash(visitor));ids.set(hash(renewed),'visitor');
assert.equal((await get('inbox=1',visitor))[0],401);assert.equal((await call({action:'message',id,text:'Old cookie'},visitor))[0],401);
assert.equal((await inbox(renewed))[0].side,'prospect');assert.equal((await call({action:'message',id,text:'Recovered'},renewed))[0],200);
ids.delete(hash(renewed));ids.set(hash(visitor),'visitor');
// Legacy chat survives; it still cannot reveal answers that were never mutually completed.
state.status='chat';state.prospect_answers=first.answers;assert.equal((await get('invite='+raw,visitor))[1].answers.length,5);assert.equal((await call({action:'message',id,text:'Legacy'},visitor))[0],200);
assert.equal((await call(second,visitor))[0],200);assert.equal(state.status,'chat','completing a legacy chat keeps the already-open chat');assert.equal((await call(second,visitor))[0],200,'identical chat retry is safe');
// Claimed pairs survive QR expiry and login re-entry; unclaimed codes cannot be used.
member.channel='qr';member.expires_at=new Date(Date.now()-1000);state.claim_hash=hash('claim');assert.equal((await inbox(visitor)).length,1);assert.equal((await get('invite='+raw,visitor))[0],200);
state.claim_hash=null;state.prospect_member_id=null;state.status='invited';assert.equal((await get('invite='+raw,visitor))[0],410);assert.equal((await call(first,visitor))[0],404);assert.equal((await inbox(owner)).length,0);
// A simultaneous end must not be resurrected or leak a successful reveal response.
member.channel='email';state.status='invited';race=true;assert.equal((await call(first,visitor))[0],409);assert.equal(state.status,'ended');
// A concurrent safety action wins over every gameplay transition.
state.prospect_member_id='visitor';state.prospect_answers=first.answers;state.status='secondFive';race=true;
assert.equal((await call(second,visitor))[0],409);assert.equal(state.status,'ended');
state.status='chatRequested';race=true;assert.equal((await call({action:'decision',id,decision:'accept'},owner))[0],409);assert.equal(state.status,'ended');
state.status='chat';state.prospect_answers=second.answers;race=true;assert.equal((await call({action:'email',id,email:'shared@example.com'},visitor))[0],409);assert.equal(state.status,'ended');
state.status='chat';race=true;assert.equal((await call({action:'message',id,text:'Concurrent'},visitor))[0],409);assert.equal(state.status,'ended');
// Moderation uses the derived authenticated member and never prevents safety actions.
const originalStanding=globalThis.__ops.standing,originalVerified=globalThis.__ops.requireVerified;
globalThis.__ops.standing=async(_sql,actor)=>{assert.equal(actor,'visitor');return {error:'Paused'}};
assert.equal((await call({action:'message',id,text:'Blocked'},visitor))[0],403);
assert.equal((await call({action:'report',id,reason:'harassment'},visitor))[0],200);assert.equal(opsCalls.at(-1).actorId,'visitor');assert.equal(opsCalls.at(-1).side,'prospect');
globalThis.__ops.standing=originalStanding;
globalThis.__ops.requireVerified=async(_sql,actor)=>{assert.equal(actor,'visitor');return {error:'Verify',needsVerify:true}};
assert.equal((await call({action:'message',id,text:'Unverified'},visitor))[0],403);
assert.equal((await call({action:'unmatch',id},visitor))[0],200);
globalThis.__ops.requireVerified=originalVerified;
// Legacy secondResults already permitted chat; its access survives without granting new flows consent.
state.status='secondResults';state.prospect_answers=second.answers;
assert.equal((await inbox(visitor))[0].status,'chat');assert.equal((await inbox(owner))[0].status,'chat');
assert.equal((await get('invite='+raw,visitor))[1].status,'chat');assert.equal((await get('invite='+raw,visitor))[1].answers.length,10);
assert.equal((await call({action:'message',id,text:'Legacy second results'},visitor))[0],200);
assert.equal((await call({action:'react',id,index:0,reaction:'like'},visitor))[0],200);
assert.equal((await call({action:'chat',id},visitor))[0],409,'legacy chat does not need another consent request');
assert.equal((await call({action:'email',id,email:'legacy@example.com'},visitor))[0],200);
// Five-answer inviter: either completion order stays private until BOTH have ten.
const originalMemberAnswers=[...member.sender_answers];
for(const order of [[visitor,owner],[owner,visitor]]){
 member.sender_answers=originalMemberAnswers.slice(0,5);state.prospect_answers=[...first.answers];state.status='secondFive';state.prospect_member_id='visitor';member.channel='email';
 const mine={action:'second',id,answers:originalMemberAnswers};
 const firstResult=await call(order[0]===owner?mine:second,order[0]);assert.equal(firstResult[0],200);assert.equal(state.status,'secondFive');assert.equal(firstResult[1].answers.length,5);
 assert.equal((await get('invite='+raw,visitor))[1].answers.length,5);assert.equal((await inbox(owner))[0].prospect_answers.length,5);assert.equal((await call({action:'chat',id},visitor))[0],409);
 const finalResult=await call(order[1]===owner?mine:second,order[1]);assert.equal(finalResult[0],200);assert.equal(state.status,'nextResults');assert.equal(finalResult[1].answers.length,10);
}
// Recover a save that committed before finalization failed; don't strand the pair.
member.sender_answers=originalMemberAnswers;state.prospect_answers=[...first.answers];state.status='secondFive';failFinalize=true;
const oldError=console.error;console.error=()=>{};try{assert.equal((await call(second,visitor))[0],500)}finally{console.error=oldError}assert.equal(state.prospect_answers.length,10);assert.equal(state.status,'secondFive');
assert.equal((await call(second,visitor))[0],200);assert.equal(state.status,'nextResults');
// Null IDs are not identities: a legacy QR with no linked sender can still be claimed.
member.sender_member_id=null;member.channel='qr';member.expires_at=new Date(Date.now()+900000);state.prospect_member_id=null;state.claim_hash=null;state.status='invited';
assert.equal((await get('invite='+raw))[0],200);assert(state.claim_hash);
console.log('Connection privacy, staged mutual consent, account recovery, authorization, expiry and race tests passed');

const staleInbox=await api.fetch(new Request('https://example.com/api/connection?inbox=1',{headers:{cookie:`chempat_member=${'9'.repeat(64)}; chempat_session=${validEmailSession}`}}));
assert.equal(staleInbox.status,401,'valid email session cannot mask revoked member cookie');
assert.equal((await staleInbox.json()).sessionExpired,true);
const legacyInbox=await api.fetch(new Request('https://example.com/api/connection?inbox=1',{headers:{cookie:`chempat_session=${validEmailSession}`}}));
assert.equal(legacyInbox.status,200,'legacy email-only session path is retained');

state.status='chat';member.sender_member_id='owner';state.prospect_member_id='visitor';member.channel='email';
assert.equal((await call({action:'message',id,photo:'data:text/html;base64,PHNjcmlwdD4='},owner))[0],400);
assert.equal((await call({action:'message',id,photo:'data:image/jpeg;base64,'+'A'.repeat(250001)},owner))[0],400);
assert.equal((await call({action:'message',id,photo},stranger))[0],404,'another account cannot attach to this pair');
state.status='ended';assert.equal((await call({action:'message',id,photo},owner))[0],409,'ended chat cannot receive images');

assert.equal((await inbox(owner))[0].invitedAt,'2026-09-30T17:42:32.000Z','real invitation timestamp is exposed');
