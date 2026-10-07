// Exercise the actual endpoint and SQL in disposable local PostgreSQL (PGlite).
// No external database, credentials, real members, browser or email is used.
process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
if(process.env.REWARD_TEST_MODE==='live')Object.assign(process.env,{CHEMPAT_RELEASE_MODE:'live',VERCEL:'1',VERCEL_PROJECT_ID:'prj_gtV01YIqkEfAfvdSbVopIfy2VpnJ',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'live'});
process.env.DATABASE_URL='postgres://synthetic-member-profile-only';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {validProfilePhoto} from '../api/_member-profile.mjs';

const root=new URL('../',import.meta.url),db=new PGlite();
await db.exec(fs.readFileSync(new URL('schema.sql',root),'utf8'));
await db.exec('ALTER TABLE members ADD COLUMN IF NOT EXISTS email_verified_at timestamptz');
for(const name of fs.readdirSync(new URL('migrations/',root)).filter(name=>name.endsWith('.sql')).sort())await db.exec(fs.readFileSync(new URL('migrations/'+name,root),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const ids={owner:'11111111-1111-4111-8111-111111111111',visitor:'22222222-2222-4222-8222-222222222222',other:'33333333-3333-4333-8333-333333333333'};
const tokens={owner:'a'.repeat(64),visitor:'b'.repeat(64),other:'c'.repeat(64)};
// Real 8x8 JPEGs, generated locally from a plain synthetic color with Pillow.
const photo='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAcFBQYFBAcGBgYIBwcICxILCwoKCxYPEA0SGhYbGhkWGRgcICgiHB4mHhgZIzAkJiorLS4tGyIyNTEsNSgsLSz/2wBDAQcICAsJCxULCxUsHRkdLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCz/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDjqKKK+9PiT//Z';
const progressive='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAcFBQYFBAcGBgYIBwcICxILCwoKCxYPEA0SGhYbGhkWGRgcICgiHB4mHhgZIzAkJiorLS4tGyIyNTEsNSgsLSz/2wBDAQcICAsJCxULCxUsHRkdLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCz/wgARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUAQEAAAAAAAAAAAAAAAAAAAAF/9oADAMBAAIQAxAAAAGMHhP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAn//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/An//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgADAAAAEPv/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==';
const jpeg=Buffer.from(photo.split(',')[1],'base64'),dataUrl=bytes=>'data:image/jpeg;base64,'+bytes.toString('base64');
const alternatePhoto=dataUrl(Buffer.concat([jpeg.subarray(0,2),Buffer.from([255,254,0,5,110,101,119]),jpeg.subarray(2)]));
const ten=[0,1,2,0,1,2,0,1,2,0],pairId=hash('synthetic-existing-pair');
let beforeTransaction=null,beforeRead=null,afterStatement=null,failAt=null,queryCount=0,transactionCount=0;
const statements=[];
const template=(strings,values)=>({text:strings.reduce((out,part,index)=>out+(index?`$${index}`:'')+part,''),values});
const run=async(executor,statement)=>(await executor.query(statement.text,statement.values)).rows;
async function query(statement){
 queryCount++;statements.push(statement.text);
 if(beforeRead&&beforeRead.matches(statement.text)){const hook=beforeRead;beforeRead=null;await hook.run()}
 return run(db,statement);
}
const sql=(strings,...values)=>query(template(strings,values));
sql.query=(text,values=[])=>query({text,values});
sql.transaction=async(build,options)=>{
 assert.equal(options?.isolationLevel,'ReadCommitted');transactionCount++;
 if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;await hook()}
 return db.transaction(async executor=>{
  const tx={query:(text,values=[])=>({text,values})},batch=build(tx),results=[];
  assert.equal(batch.length,4);assert.match(batch[0].text,/WHERE id=\$1::uuid ORDER BY id FOR UPDATE/);
  assert.match(batch[1].text,/reward_directory_profile.*FOR UPDATE/);
  assert.deepEqual(batch[0].values,[batch[2].values[1]],'locks the expected member, never a session-reassigned member');
  for(const index of [2,3]){
   assert.match(batch[index].text,/m\.session_hash=\$1 AND m\.id=\$2::uuid/);
   assert.match(batch[index].text,/email_verified_at IS NOT NULL/);assert.match(batch[index].text,/blocked_at IS NULL/);assert.match(batch[index].text,/suspended_until<=now\(\)/);
  }
  for(let index=0;index<batch.length;index++){
   if(failAt===index){failAt=null;throw Error('Synthetic transaction failure')}
   statements.push(batch[index].text);results.push(await run(executor,batch[index]));
   if(afterStatement?.index===index){const hook=afterStatement;afterStatement=null;await hook.run(executor)}
  }
  if(failAt==='commit'){failAt=null;throw Error('Synthetic commit failure')}
  return results;
 });
};
globalThis.__memberProfileSql=sql;
async function loadApi(name){
 const source=fs.readFileSync(new URL('api/'+name+'.mjs',root),'utf8')
  .replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__memberProfileSql;')
  .replace(/from '\.\/(.*?)\.mjs'/g,(_,dependency)=>`from '${new URL('api/'+dependency+'.mjs',root).href}'`);
 return (await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
}
const api=await loadApi('member-profile'),memberApi=await loadApi('member');
globalThis.fetch=async()=>{throw Error('Unexpected external request in member profile tests')};
async function call({as='owner',body,rawBody,method,cookie,headers={},handler=api}={}){
 const requestHeaders=new Headers({'content-type':'application/json',cookie:cookie??(as?'chempat_member='+tokens[as]:''),...(as?{'x-chempat-member-id':ids[as]}:{})});
 for(const [key,value] of Object.entries(headers)){if(value===null)requestHeaders.delete(key);else requestHeaders.set(key,value)}
 const hasBody=body!==undefined||rawBody!==undefined;
 const response=await handler.fetch(new Request('https://isolated.example/api/member-profile',{method:method||(hasBody?'POST':'GET'),headers:requestHeaders,...(hasBody?{body:rawBody??JSON.stringify(body)}:{}),...(rawBody instanceof ReadableStream?{duplex:'half'}:{})}));
 assert.equal(response.headers.get('cache-control'),'no-store');
 if(handler===api){assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('cross-origin-resource-policy'),'same-origin')}
 return {status:response.status,data:await response.json(),headers:response.headers};
}
const status=(result,expected=200,label='')=>assert.equal(result.status,expected,label+': '+JSON.stringify(result.data));
const read=(as='owner',options={})=>call({as,...options});
const revision=async(as='owner')=>(await read(as)).data.profile.revision;
const save=async({name='Renamed Member',photo:picture=alternatePhoto,profileRevision,updateDiscovery=false,...options}={})=>call({...options,body:{action:'save',name,photo:picture,profileRevision:profileRevision??await revision(options.as),updateDiscovery}});
const rows=async(table)=>(await db.query('SELECT * FROM '+table)).rows;
const owner=async()=>(await db.query('SELECT * FROM members WHERE id=$1',[ids.owner])).rows[0];
const directory=async()=>(await db.query('SELECT * FROM reward_directory_profile WHERE member_id=$1',[ids.owner])).rows[0];
async function snapshot(){
 const result={};
 for(const {tablename} of (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows)result[tablename]=(await rows(tablename)).map(row=>JSON.stringify(row)).sort();
 return result;
}
async function setLevel(value,as='owner'){
 await db.query('UPDATE members SET answers=$1 WHERE id=$2',[JSON.stringify(value>=2?ten:value===1?ten.slice(0,5):[]),ids[as]]);
 await db.query('INSERT INTO member_reward_state(member_id,completed_level,answers) VALUES($1,$2,$3) ON CONFLICT(member_id) DO UPDATE SET completed_level=excluded.completed_level',[ids[as],value,'{"private":"existing answers"}']);
}
async function listing({listed=true,video=true,published=true}={}){
 await setLevel(5);
 await db.query('INSERT INTO reward_directory_profile(member_id,listed,display_name,photo,video,video_mime,duration_seconds,video_published) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[ids.owner,listed,'Original',photo,video?Buffer.from('synthetic video'):null,video?'video/mp4':null,video?12:null,listed&&video&&published]);
}
async function seedPrivateData(){
 await db.query('INSERT INTO invitations(token_hash,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,sender_member_id,channel,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval \'1 day\')',[pairId,'owner@example.com','Invitation snapshot',photo,JSON.stringify(ten),'Visitor','visitor@example.com',ids.owner,'email']);
 await db.query('INSERT INTO connection_state(invitation_hash,prospect_member_id,prospect_name,prospect_photo,prospect_answers,prospect_phone,status,messages) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[pairId,ids.visitor,'Visitor snapshot',photo,JSON.stringify(ten),'+12025550122','chat','[{"by":"member","text":"Existing conversation"}]']);
 await db.query('INSERT INTO member_phone_profile(member_id,phone) VALUES($1,$2)',[ids.owner,'+12025550111']);
 await db.query('INSERT INTO reward_phone_offers(invitation_hash,member_id,phone) VALUES($1,$2,$3)',[pairId,ids.owner,'+12025550999']);
 await db.query('INSERT INTO email_sessions(token_hash,email,expires_at) VALUES($1,$2,now()+interval \'1 day\')',[hash('email-session'),'owner@example.com']);
}
async function reset(){
 assert.equal(beforeTransaction,null);assert.equal(beforeRead,null);assert.equal(afterStatement,null);failAt=null;
 await db.exec('DELETE FROM invitations;DELETE FROM members;DELETE FROM activity;DELETE FROM email_sessions');
 for(const [name,id] of Object.entries(ids))await db.query('INSERT INTO members(id,session_hash,name,contact,photo,answers,email_verified_at) VALUES($1,$2,$3,$4,$5,$6,now())',[id,hash(tokens[name]),name+' Existing',name+'@example.com',photo,JSON.stringify(ten)]);
}
let passed=0;const failures=[];
async function test(name,fn){try{await reset();await fn();passed++;console.log('ok - '+name)}catch(error){failures.push(name);console.error('FAIL - '+name+'\n'+error.stack);beforeTransaction=null;beforeRead=null;afterStatement=null;failAt=null}}

await test('GET returns only the canonical owner identity and discovery eligibility without writes',async()=>{
 await seedPrivateData();const before=await snapshot(),result=await read();status(result);
 assert.deepEqual(Object.keys(result.data),['profile','discovery']);assert.deepEqual(Object.keys(result.data.profile),['id','name','contact','photo','revision']);
 assert.deepEqual(result.data.profile,{id:ids.owner,name:'owner Existing',contact:'owner@example.com',photo,revision:result.data.profile.revision});
 assert.match(result.data.profile.revision,/^[a-f0-9]{64}$/);assert.deepEqual(result.data.discovery,{listed:false,eligible:false});
 for(const secret of ['+12025550111','+12025550999','Existing conversation','answers',hash(tokens.owner),'visitor@example.com'])assert.equal(JSON.stringify(result.data).includes(secret),false,secret);
 assert.deepEqual(await snapshot(),before);
});
await test('private save changes exactly owner name/photo, preserving accounts, phone, answers, sessions and every invitation snapshot',async()=>{
 await seedPrivateData();await listing();const before=await snapshot(),previous=await owner(),oldRevision=await revision();
 const result=await save({name:'  Zoë Example  '});status(result);assert.equal(result.data.profile.name,'Zoë Example');assert.equal(result.data.profile.photo,alternatePhoto);assert.notEqual(result.data.profile.revision,oldRevision);
 const after=await snapshot(),current=await owner();for(const key of ['name','photo','updated_at'])delete previous[key],delete current[key];assert.deepEqual(current,previous);
 delete before.members;delete after.members;assert.deepEqual(after,before);assert.equal((await rows('members')).length,3);
 assert.deepEqual((await db.query('SELECT id,name,photo FROM members WHERE id<>$1 ORDER BY id',[ids.owner])).rows,[{id:ids.visitor,name:'visitor Existing',photo},{id:ids.other,name:'other Existing',photo}]);
});
await test('explicit discovery update copies only approved name/photo and preserves listing, video and publish flags',async()=>{
 for(const published of [false,true]){
  await reset();await listing({published});await seedPrivateData();const before=await snapshot(),oldDirectory=await directory();
  const result=await save({name:'Renée Example',updateDiscovery:true});status(result);assert.deepEqual(result.data.discovery,{listed:true,eligible:true});
  const current=await directory();assert.equal(current.display_name,'Renée');assert.equal(current.photo,alternatePhoto);
  for(const key of ['display_name','photo','updated_at'])delete oldDirectory[key],delete current[key];assert.deepEqual(current,oldDirectory);
  const after=await snapshot();for(const key of ['members','reward_directory_profile'])delete before[key],delete after[key];assert.deepEqual(after,before,'publishing identity does not emit listing/video events or change invitations');
 }
});
await test('private save works at every level and never creates or republishes a discovery profile',async()=>{
 for(const earned of [0,1,2,3,4,5]){
  await reset();await setLevel(earned);status(await save());assert.deepEqual(await rows('reward_directory_profile'),[]);assert.equal((await read()).data.discovery.eligible,earned>=4);
 }
 await reset();await listing({listed:false});const before=await directory();status(await save());assert.deepEqual(await directory(),before);
});
await test('opted-in discovery sync requires an already listed eligible row and saves neither side when unavailable',async()=>{
 for(const mode of ['absent','unlisted','level lost']){
  await reset();if(mode!=='absent')await listing({listed:mode!=='unlisted'});if(mode==='level lost')await setLevel(3);
  const before=await snapshot(),result=await save({updateDiscovery:true});status(result,409,mode);assert.equal(result.data.discoveryConflict,true);assert.deepEqual(await snapshot(),before);
 }
});
await test('profile revision ignores answer, phone, reward and updated_at churn',async()=>{
 const expected=await revision();await seedPrivateData();await setLevel(5);
 await db.query("UPDATE members SET updated_at=now()+interval '1 second',answers='[2,2,2,2,2]' WHERE id=$1",[ids.owner]);
 await db.query("UPDATE member_phone_profile SET phone='+12025550777',revision=revision+1 WHERE member_id=$1",[ids.owner]);
 assert.equal(await revision(),expected);status(await save({profileRevision:expected}));
});
await test('stale edits and lost-response retries never overwrite the current identity',async()=>{
 const stale=await revision();const result=await save({profileRevision:stale});status(result);const before=await snapshot();
 for(const name of ['Stale edit','Renamed Member']){const conflict=await save({profileRevision:stale,name});status(conflict,409);assert.equal(conflict.data.profileConflict,true);assert.equal('profile' in conflict.data,false)}
 assert.deepEqual(await snapshot(),before);status(await save({name:'Newest Member',profileRevision:result.data.profile.revision}));
});
await test('parallel same-revision profile writes produce one winner and one conflict',async()=>{
 const profileRevision=await revision(),results=await Promise.all([save({name:'First Winner',profileRevision}),save({name:'Second Winner',profileRevision})]);
 assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);assert.deepEqual((await read()).data,results.find(result=>result.status===200).data);assert.equal((await rows('members')).length,3);
});
await test('an edit that wins during a lock wait cannot be overwritten by older consent',async()=>{
 let protectedState;beforeTransaction=async()=>{status(await save({name:'Newer Tab'}));protectedState=await snapshot()};
 const result=await save();status(result,409);assert.equal(result.data.profileConflict,true);assert.deepEqual(await snapshot(),protectedState);
});
await test('unlist, level revoke and listing deletion during a lock wait atomically cancel explicit discovery sync',async()=>{
 const changes=[
  ['unlist',()=>db.query('UPDATE reward_directory_profile SET listed=false,video_published=false WHERE member_id=$1',[ids.owner])],
  ['level revoke',()=>setLevel(3)],
  ['delete',()=>db.query('DELETE FROM reward_directory_profile WHERE member_id=$1',[ids.owner])]
 ];
 for(const [label,change] of changes){
  await reset();await listing();let protectedState;beforeTransaction=async()=>{await change();protectedState=await snapshot()};
  const result=await save({updateDiscovery:true});status(result,409,label);assert.equal(result.data.discoveryConflict,true);assert.deepEqual(await snapshot(),protectedState);
 }
});
await test('missing, stale and cross-account identities cannot read or write a profile',async()=>{
 const before=await snapshot(),transactions=transactionCount;
 for(const cookie of ['', 'chempat_session='+tokens.owner,'chempat_member=bad','chempat_member='+tokens.owner.toUpperCase(),'chempat_member='+tokens.owner+'bad']){
  status(await read('owner',{cookie}),401);status(await save({cookie,profileRevision:'0'.repeat(64)}),401);
 }
 for(const expected of [null,'',ids.visitor,'malformed']){
  status(await read('owner',{headers:{'x-chempat-member-id':expected}}),403);status(await save({headers:{'x-chempat-member-id':expected},profileRevision:'0'.repeat(64)}),403);
 }
 for(const cookie of ['chempat_member='+tokens.visitor,'chempat_member='+'d'.repeat(64)]){
  status(await read('owner',{cookie}),403);status(await save({cookie,profileRevision:'0'.repeat(64)}),403);
 }
 assert.equal(transactionCount,transactions);assert.deepEqual(await snapshot(),before);
});
await test('unverified, blocked, suspended and rotated members cannot read or edit even at Level 5',async()=>{
 for(const change of ['email_verified_at=NULL','blocked_at=now()',"suspended_until=now()+interval '1 day'",`session_hash='${hash('rotated')}'`]){
  await reset();await listing();const profileRevision=await revision();await db.query('UPDATE members SET '+change+' WHERE id=$1',[ids.owner]);const before=await snapshot();
  for(const result of [await read(),await save({profileRevision,updateDiscovery:true})]){status(result,403);assert.equal(result.data.sessionExpired,true);assert.equal('profile' in result.data,false)}assert.deepEqual(await snapshot(),before);
 }
 await reset();await db.query("UPDATE members SET suspended_until=now()-interval '1 day' WHERE id=$1",[ids.owner]);status(await save());
});
await test('session, expected account and standing are rechecked after lock acquisition',async()=>{
 const changes=[
  ['unverified',()=>db.query('UPDATE members SET email_verified_at=NULL WHERE id=$1',[ids.owner])],
  ['blocked',()=>db.query('UPDATE members SET blocked_at=now() WHERE id=$1',[ids.owner])],
  ['suspended',()=>db.query("UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=$1",[ids.owner])],
  ['rotated',()=>db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('wait-rotation'),ids.owner])],
  ['reassigned',async()=>{await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('wait-unused'),ids.owner]);await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash(tokens.owner),ids.visitor])}]
 ];
 for(const [label,change] of changes){
  await reset();let protectedState;beforeTransaction=async()=>{await change();protectedState=await snapshot()};
  const result=await save();status(result,403,label);assert.equal(result.data.sessionExpired,true);assert.deepEqual(await snapshot(),protectedState);
 }
});
await test('the mutation statement repeats revision, session and discovery checks beyond the post-lock preflight',async()=>{
 // PGlite serializes its transactions. Hooks test fresh SQL projections; this
 // does not claim to model separate-connection PostgreSQL lock contention.
 const changes=[
  ['session',executor=>executor.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('after-preflight'),ids.owner])],
  ['name',executor=>executor.query('UPDATE members SET name=$1 WHERE id=$2',['Newest identity',ids.owner])],
  ['directory',executor=>executor.query('UPDATE reward_directory_profile SET listed=false,video_published=false WHERE member_id=$1',[ids.owner])],
  ['level',executor=>executor.query('UPDATE member_reward_state SET completed_level=3 WHERE member_id=$1',[ids.owner])]
 ];
 for(const [label,change] of changes){
  await reset();await listing();afterStatement={index:2,run:change};const result=await save({updateDiscovery:true});status(result,409,label);
  const current=await owner();assert.equal(current.name,label==='name'?'Newest identity':'owner Existing');assert.equal(current.photo,photo);assert.equal((await directory()).photo,photo);
 }
});
await test('the final read remains owner-bound if authorization changes after a committed save',async()=>{
 let count=0;beforeRead={matches:text=>text.startsWith('SELECT m.id')&&++count===3,run:async()=>{
  await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('post-save-unused'),ids.owner]);await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash(tokens.owner),ids.visitor]);
 }};
 const result=await save();status(result,403);assert.equal(result.data.sessionExpired,true);assert.equal('profile' in result.data,false);assert.equal((await owner()).name,'Renamed Member');
 assert.equal(JSON.stringify(result.data).includes('visitor'),false);
});
await test('ended, frozen, trashed, blocked and friend pairs never prevent private identity edits or reopen any pair',async()=>{
 const changes=[
  ['friend',()=>db.query("UPDATE invitations SET channel='friend' WHERE token_hash=$1",[pairId])],
  ['ended',()=>db.query("UPDATE connection_state SET status='ended',ended_at=now() WHERE invitation_hash=$1",[pairId])],
  ['frozen',()=>db.query("INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at) VALUES($1,$2,'freeze',now())",[ids.owner,pairId])],
  ['trashed',()=>db.query("INSERT INTO connection_visibility(member_id,invitation_hash,action,trashed_at) VALUES($1,$2,'unfreeze',now())",[ids.visitor,pairId])],
  ['blocked pair',()=>db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.owner,ids.visitor])],
  ['paused counterpart',()=>db.query("UPDATE members SET suspended_until=now()+interval '1 day' WHERE id=$1",[ids.visitor])]
 ];
 for(const [label,change] of changes){
  await reset();await seedPrivateData();await change();const before=await snapshot();status(await save(),200,label);const after=await snapshot();delete before.members;delete after.members;assert.deepEqual(after,before,label);
 }
});
await test('only explicit supported name/photo fields are writable; contact, phone, answers, tokens and flags are rejected',async()=>{
 const base={action:'save',name:'Valid',photo,profileRevision:await revision(),updateDiscovery:false},before=await snapshot();
 for(const key of ['id','memberId','contact','email','phone','answers','verified','session_hash','listed','video','videoPublished','agreed']){
  status(await call({body:{...base,[key]:'unauthorized'}}),400,key);
 }
 for(const updateDiscovery of [undefined,null,0,1,'true','false']){const body={...base,updateDiscovery};if(updateDiscovery===undefined)delete body.updateDiscovery;status(await call({body}),400)}
 for(const profileRevision of [null,0,'',[],{},'A'.repeat(64),'a'.repeat(63)])status(await call({body:{...base,profileRevision}}),400);
 assert.deepEqual(await snapshot(),before);
});
await test('trimmed names accept supported text and reject blank, overlong, non-string and control input',async()=>{
 const base={action:'save',name:'Valid',photo,profileRevision:await revision(),updateDiscovery:false},before=await snapshot();
 for(const name of ['', '  ','x'.repeat(51),null,1,[],{},'a\u0000b','a\nb','a\tb','a\u007fb'])status(await call({body:{...base,name}}),400);
 assert.deepEqual(await snapshot(),before);status(await save({name:' O’Connor <Test> '}));assert.equal((await read()).data.profile.name,'O’Connor <Test>');
});
await test('JPEG validation accepts real baseline/progressive photos and rejects mismatched, truncated and oversized images',async()=>{
 assert.equal(validProfilePhoto(photo),true);assert.equal(validProfilePhoto(alternatePhoto),true);assert.equal(validProfilePhoto(progressive),true);
 const malformed=[];
 for(const length of [2,4,20,100,jpeg.length-1,jpeg.length-2])malformed.push(dataUrl(jpeg.subarray(0,length)));
 malformed.push(dataUrl(Buffer.concat([jpeg,Buffer.from('trailing')])),dataUrl(Buffer.from([255,216,17,255,217])));
 const frame=jpeg.indexOf(Buffer.from([255,192]));assert.ok(frame>0);
 for(const [height,width] of [[0,8],[8,0],[4097,8],[8,4097],[4096,4096]]){const modified=Buffer.from(jpeg);modified.writeUInt16BE(height,frame+5);modified.writeUInt16BE(width,frame+7);malformed.push(dataUrl(modified))}
 const segment=Buffer.from(jpeg);segment.writeUInt16BE(65535,4);malformed.push(dataUrl(segment));
 const before=await snapshot(),profileRevision=await revision();
 for(const picture of [...malformed,null,{},'',photo.replace('image/jpeg','image/png'),'data:image/jpeg;base64,'+Buffer.from('<svg>not a JPEG</svg>').toString('base64'),photo+'=',photo+'\n','data:image/jpeg;base64,'+'A'.repeat(250000)])status(await save({photo:picture,profileRevision}),400);
 assert.deepEqual(await snapshot(),before);status(await save({photo:progressive,profileRevision}));
});
await test('same-origin, content-type, bounded streaming and JSON object guards run before private writes',async()=>{
 const body={action:'save',name:'Valid',photo,profileRevision:await revision(),updateDiscovery:false},before=await snapshot(),transactions=transactionCount;
 for(const origin of ['https://evil.example','null','https://isolated.example.evil.example'])status(await call({body,headers:{origin}}),403);
 status(await call({body,headers:{'sec-fetch-site':'cross-site'}}),403);
 for(const contentType of ['text/plain','application/x-www-form-urlencoded',''])status(await call({body,headers:{'content-type':contentType}}),415);
 for(const rawBody of ['{','null','[]','"value"'])status(await call({rawBody}),400);
 for(const length of ['-1','bad','1.5','256001'])status(await call({body,headers:{'content-length':length}}),413);
 status(await call({rawBody:JSON.stringify({...body,padding:'🐾'.repeat(65000)}),headers:{'content-length':'1'}}),413);
 let cancelled=false;const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(4096).fill(120))},cancel(){cancelled=true}});status(await call({rawBody:stream}),413);assert.equal(cancelled,true);
 assert.deepEqual(await snapshot(),before);assert.equal(transactionCount,transactions);status(await call({body,headers:{origin:'https://isolated.example','content-type':'application/json; charset=utf-8'}}));
});
await test('failed transactions roll back private and discovery changes and log no identity or credentials',async()=>{
 for(const point of [0,1,2,3,'commit']){
  await reset();await listing();const before=await snapshot();failAt=point;const previousError=console.error,logs=[];console.error=(...args)=>logs.push(args);
  let result;try{result=await save({updateDiscovery:true})}finally{console.error=previousError}
  status(result,503);assert.deepEqual(logs,[['Member profile request failed.']]);assert.deepEqual(await snapshot(),before);status(await save({updateDiscovery:true}));
 }
});
await test('legacy same-contact registration reuses canonical member without bypassing edits or resetting answers/session',async()=>{
 await listing();await seedPrivateData();status(await save({name:'Canonical Current',updateDiscovery:true}));const before=await snapshot();
 const stale={action:'register',name:'Stale signup',contact:'owner@example.com',photo,answers:[2,2,2,2,2],agreed:true};
 const result=await call({handler:memberApi,body:stale});status(result);assert.equal(result.data.member.id,ids.owner);assert.equal(result.data.member.name,'Canonical Current');assert.equal(result.data.member.photo,alternatePhoto);assert.deepEqual(result.data.member.answers,ten);assert.equal(result.headers.get('set-cookie'),null);
 assert.deepEqual(await snapshot(),before);status(await call({handler:memberApi,body:{...stale,contact:'visitor@example.com'}}),409);assert.deepEqual(await snapshot(),before);
});
await test('blocked deployment or absent storage does not reach SQL, and unsupported methods never mutate',async()=>{
 const keys=['CHEMPAT_RELEASE_MODE','CHEMPAT_REVIEW_DATA','VERCEL','VERCEL_PROJECT_ID','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','DATABASE_URL'];const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));const before=queryCount;
 const restore=()=>{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value}};
 try{
  process.env.CHEMPAT_RELEASE_MODE='blocked';status(await read(),503);status(await save({profileRevision:'0'.repeat(64)}),503);
  restore();delete process.env.DATABASE_URL;status(await read(),503);status(await save({profileRevision:'0'.repeat(64)}),503);assert.equal(queryCount,before);
 }finally{restore()}
 for(const method of ['PUT','PATCH','DELETE','OPTIONS'])status(await call({method}),405);
});
await test('missing existing reward storage fails closed without attempting schema initialization or partial saves',async()=>{
 const profileRevision=await revision(),previous=await owner(),start=statements.length,previousError=console.error,logs=[];console.error=(...args)=>logs.push(args);
 await db.exec('ALTER TABLE reward_directory_profile RENAME TO unavailable_directory_profile');
 try{
  status(await read(),503);status(await save({profileRevision}),503);assert.deepEqual(await owner(),previous);
  assert.equal(statements.slice(start).some(text=>/\b(CREATE|ALTER|DROP)\b/i.test(text)),false);
  assert.deepEqual(logs,[['Member profile request failed.'],['Member profile request failed.']]);
 }finally{await db.exec('ALTER TABLE unavailable_directory_profile RENAME TO reward_directory_profile');console.error=previousError}
});

console.log(`Member profile integration: ${passed} passed; ${failures.length} failed; ${transactionCount} local SQL transactions; ${queryCount} reads`);
await db.close();if(failures.length)process.exitCode=1;
