// Real directory SQL in disposable PostgreSQL (PGlite). Synthetic fixtures only;
// never connects to an account, deployed database, mail, or storage provider.
process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
process.env.DATABASE_URL='postgres://synthetic-reward-directory-only';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {validateIntroVideo as realValidateIntroVideo} from '../api/_intro-video.mjs';
import {makeIntroVideo} from './intro-video-fixtures.mjs';
const root=new URL('../',import.meta.url),db=new PGlite();
for(let pass=0;pass<2;pass++){
 await db.exec(fs.readFileSync(new URL('schema.sql',root),'utf8'));
 await db.exec('ALTER TABLE members ADD COLUMN IF NOT EXISTS email_verified_at timestamptz');
 for(const name of fs.readdirSync(new URL('migrations/',root)).filter(name=>name.endsWith('.sql')).sort())await db.exec(fs.readFileSync(new URL('migrations/'+name,root),'utf8'));
}
const hash=value=>createHash('sha256').update(value).digest('hex');
const ids={owner:'11111111-1111-4111-8111-111111111111',viewer:'22222222-2222-4222-8222-222222222222',other:'33333333-3333-4333-8333-333333333333'};
const tokens={owner:'a'.repeat(64),viewer:'b'.repeat(64),other:'c'.repeat(64)};
const jpeg=Buffer.from([255,216,17,255,217]),alternateJpeg=Buffer.from([255,216,29,255,217]);
const photo=bytes=>'data:image/jpeg;base64,'+bytes.toString('base64');
const syntheticVideo=makeIntroVideo();
let videoValidations=0;
// Count validation calls but execute the actual MP4 parser on the real synthetic fixture.
globalThis.__directoryValidate=bytes=>{videoValidations++;return realValidateIntroVideo(bytes)};
for(const [name,id] of Object.entries(ids)){
 await db.query('INSERT INTO members(id,session_hash,name,contact,photo,answers,email_verified_at) VALUES($1,$2,$3,$4,$5,$6,now())',[id,hash(tokens[name]),name+' PrivateSurname',name+'@example.com',photo(jpeg),'[0,1,2,0,1,2,0,1,2,0]']);
 await db.query('INSERT INTO member_reward_state(member_id,completed_level,answers) VALUES($1,5,$2)',[id,'{"privateSecret":"must not leave"}']);
}
let beforeRead=null,beforeTransaction=null,failTransaction=false,queries=0,transactions=0;
const run=async(executor,statement)=>(await executor.query(statement.text,statement.params)).rows;
const sql=()=>{throw Error('Use parameterized queries')};
sql.query=async(text,params=[])=>{queries++;if(beforeRead&&beforeRead.matches(text)){const hook=beforeRead;beforeRead=null;await hook.run()}return run(db,{text,params})};
sql.transaction=async(callback,options)=>{
 transactions++;assert.equal(options?.isolationLevel,'ReadCommitted');
 if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;await hook()}
 return db.transaction(async tx=>{
  const statements=callback({query:(text,params=[])=>({text,params})});
  assert.match(statements[0].text,/ORDER BY id FOR UPDATE/,'ordered member locks precede mutations');
  assert.match(statements[1].text,/session_hash=\$1/,'session authorization rechecked after locks');
  assert.match(statements[1].text,/email_verified_at IS NOT NULL/,'standing rechecked after locks');
  const result=[];for(let index=0;index<statements.length;index++){if(failTransaction&&index===1){failTransaction=false;throw Error('Synthetic rollback')}result.push(await run(tx,statements[index]))}return result;
 });
};
globalThis.__directorySql=sql;
const source=fs.readFileSync(new URL('api/reward-directory.mjs',root),'utf8')
 .replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__directorySql;')
 .replace("import {validateIntroVideo} from './_intro-video.mjs';",'const validateIntroVideo=globalThis.__directoryValidate;')
 .replace(/from '\.\/(.*?)\.mjs'/g,(_,dependency)=>`from '${new URL('api/'+dependency+'.mjs',root).href}'`);
assert.ok(source.includes('const neon=()=>globalThis.__directorySql;'));
const api=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
globalThis.fetch=async()=>{throw Error('Unexpected external request in isolated directory tests')};
async function response({as='owner',query='profile=1',body,rawBody,method,headers={},cookie}={}){
 const hasBody=body!==undefined||rawBody!==undefined;
 const requestHeaders=new Headers({cookie:cookie??(as?'chempat_member='+tokens[as]:''),'content-type':'application/json',...(as?{'x-chempat-member-id':ids[as]}:{})});
 for(const [name,value] of Object.entries(headers)){if(value===null)requestHeaders.delete(name);else requestHeaders.set(name,value)}
 const req=new Request('https://isolated.example/api/reward-directory?'+query,{method:method||(hasBody?'POST':'GET'),headers:requestHeaders,...(hasBody?{body:rawBody??JSON.stringify(body)}:{})});
 const result=await api.fetch(req);
 assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(result.headers.get('x-content-type-options'),'nosniff');
 return result;
}
async function call(options){const result=await response(options);return {status:result.status,data:await result.json()}}
const action=(name,as='owner')=>call({as,query:'',body:{action:name}});
const directory=(as='viewer',query='')=>call({as,query:'directory=1'+(query?'&'+query:'')});
const upload=(as='owner',bytes=syntheticVideo,headers={})=>call({as,query:'upload=1',rawBody:bytes,headers:{'content-type':'video/mp4',...headers}});
const media=(kind='photo',as='viewer',target='owner')=>response({as,query:kind+'='+ids[target]});
const status=(result,expected)=>assert.equal(result.status,expected,JSON.stringify(result.data));
const setLevel=(name,value)=>db.query('UPDATE member_reward_state SET completed_level=$1 WHERE member_id=$2',[value,ids[name]]);
let inviteSequence=0;
async function invite({sender='owner',prospect='viewer',state='chat',unclaimed=false,intended=false}={}){
 const id=hash('directory-pair-'+(++inviteSequence));
 await db.query("INSERT INTO invitations(token_hash,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,sender_member_id,intended_member_id,channel) VALUES($1,$2,'Private sender',$3,'[]','Private recipient',$4,$5,$6,'email')",[id,sender+'@example.com',photo(jpeg),prospect+'@example.com',ids[sender],intended?ids[prospect]:null]);
 await db.query("INSERT INTO connection_state(invitation_hash,prospect_member_id,status,messages,prospect_phone) VALUES($1,$2,$3,'[{\"text\":\"secret conversation\"}]','+12025550111')",[id,unclaimed?null:ids[prospect],state]);return id;
}
async function listAndPublish(){status(await action('list'),200);status(await upload(),200);status(await action('publishVideo'),200)}
async function reset(){
 assert.equal(beforeRead,null,'read race hook executed');assert.equal(beforeTransaction,null,'write race hook executed');
 await db.exec('DELETE FROM invitations;DELETE FROM member_blocks;DELETE FROM reward_directory_profile');
 await db.query('DELETE FROM members WHERE id NOT IN($1,$2,$3)',Object.values(ids));
 await db.exec("UPDATE members SET session_hash='reset:'||id::text");
 for(const [name,id] of Object.entries(ids)){
  await db.query('UPDATE members SET session_hash=$1,name=$2,photo=$3,answers=$4,email_verified_at=now(),blocked_at=NULL,suspended_until=NULL WHERE id=$5',[hash(tokens[name]),name+' PrivateSurname',photo(jpeg),'[0,1,2,0,1,2,0,1,2,0]',id]);await setLevel(name,5);
 }
}
let passed=0,failures=[];
async function test(name,fn){try{await reset();await fn();passed++;console.log('ok - '+name)}catch(error){failures.push(name);console.error('FAIL - '+name+'\n'+error.stack);beforeRead=null;beforeTransaction=null;failTransaction=false}}

await test('repeatable additive migration never publishes existing profiles or copies private photos',async()=>{
 assert.equal((await db.query('SELECT * FROM reward_directory_profile')).rows.length,0);
 const result=await call();status(result,200);assert.equal(result.data.profile.listed,false);assert.equal(result.data.profile.videoPublished,false);assert.equal(result.data.profile.video,null);assert.equal(result.data.profile.name,'owner');
 assert.deepEqual(result.data.eligibility,{completedLevel:5,directory:true,video:true});assert.deepEqual(result.data.limits,{videoBytes:2097152,videoSeconds:15});
 status(await directory(),200);assert.deepEqual((await directory()).data.profiles,[]);
 assert.equal((await db.query('SELECT * FROM reward_directory_profile')).rows.length,0,'GETs never create a profile');
 await assert.rejects(()=>db.query('INSERT INTO reward_directory_profile(member_id,listed) VALUES($1,true)',[ids.owner]));
 await assert.rejects(()=>db.query('INSERT INTO reward_directory_profile(member_id,video_published) VALUES($1,true)',[ids.owner]));
});
await test('database constraints cap video size/duration and enforce private-before-publish storage',async()=>{
 for(const [bytes,mime,seconds] of [[Buffer.alloc(0),'video/mp4',1],[Buffer.alloc(2097153),'video/mp4',1],[syntheticVideo,'video/webm',1],[syntheticVideo,'video/mp4',0],[syntheticVideo,'video/mp4',15.01],[syntheticVideo,'video/mp4',NaN],[syntheticVideo,null,1]]){
  await assert.rejects(()=>db.query('INSERT INTO reward_directory_profile(member_id,video,video_mime,duration_seconds) VALUES($1,$2,$3,$4)',[ids.owner,bytes,mime,seconds]));
 }
 status(await upload(),200);const stored=(await db.query('SELECT video,video_mime,duration_seconds,listed,video_published FROM reward_directory_profile')).rows[0];
 assert.deepEqual(Buffer.from(stored.video),syntheticVideo);assert.equal(stored.video_mime,'video/mp4');assert.equal(stored.duration_seconds,1);assert.equal(stored.listed,false);assert.equal(stored.video_published,false);
});
await test('level4 is authoritative; legacy answer count only grants levels1/2',async()=>{
 for(const level of [0,1,2,3]){await setLevel('owner',level);status(await action('list'),403);status(await directory('owner'),403);status(await upload(),403);assert.equal((await call()).data.eligibility.completedLevel,Math.max(level,2))}
 await db.query("UPDATE members SET answers='[]' WHERE id=$1",[ids.owner]);await setLevel('owner',0);assert.equal((await call()).data.eligibility.completedLevel,0);
 await db.query("UPDATE members SET answers='[0,0,0,0,0]' WHERE id=$1",[ids.owner]);assert.equal((await call()).data.eligibility.completedLevel,1);
 await setLevel('owner',4);status(await action('list'),200);status(await directory('owner'),200);status(await upload(),403);status(await action('publishVideo'),403);
});
await test('authentication requires a strict cookie and verified active current session',async()=>{
 for(const cookie of ['', 'chempat_member=bad','chempat_member='+tokens.owner.toUpperCase(),'chempat_session='+tokens.owner,'chempat_member='+tokens.owner+'bad'])status(await call({cookie}),401);
 status(await call({cookie:'chempat_member='+'d'.repeat(64)}),403);
 status(await call({cookie:'extra=1; chempat_member='+tokens.owner+'; extra2=2'}),200);
 for(const change of ['email_verified_at=NULL','blocked_at=now()',"suspended_until=now()+interval '1 day'",`session_hash='${hash('rotated')}'`]){
  await db.query('UPDATE members SET '+change+' WHERE id=$1',[ids.owner]);status(await call(),403);status(await action('list'),403);status(await upload(),403);await reset();
 }
 await db.query("UPDATE members SET suspended_until=now()-interval '1 minute' WHERE id=$1",[ids.owner]);status(await call(),200);
});
await test('POST requires the exact current account identity; stale cross-tab consent cannot mutate another member',async()=>{
 await listAndPublish();status(await action('list','viewer'),200);status(await upload('viewer'),200);status(await action('publishVideo','viewer'),200);
 const before=(await db.query('SELECT * FROM reward_directory_profile ORDER BY member_id')).rows,beforeTransactions=transactions,beforeValidations=videoValidations;
 for(const expected of [null,'',ids.owner,'malformed','11111111-1111-4111-8111-111111111111, '+ids.viewer]){
  for(const operation of ['list','unlist','publishVideo','hideVideo']){
   const result=await call({as:'viewer',query:'',body:{action:operation},headers:{'x-chempat-member-id':expected}});status(result,403);assert.equal(result.data.sessionExpired,true);
  }
  status(await upload('viewer',syntheticVideo,{'x-chempat-member-id':expected}),403);
 }
 assert.equal(transactions,beforeTransactions,'mismatched identity fails before any mutation transaction');assert.equal(videoValidations,beforeValidations,'mismatched identity fails before upload parsing');assert.deepEqual((await db.query('SELECT * FROM reward_directory_profile ORDER BY member_id')).rows,before);
 // A newly signed-in account may have no prior listing to protect: the stale
 // old account's List confirmation must not create one for that new account.
 status(await call({as:'other',query:'',body:{action:'list'},headers:{'x-chempat-member-id':ids.owner}}),403);
 assert.equal((await db.query('SELECT * FROM reward_directory_profile WHERE member_id=$1',[ids.other])).rows.length,0);
});
await test('GET rejects a supplied mismatched identity while native image/video/HEAD requests can omit it',async()=>{
 await listAndPublish();
 for(const query of ['profile=1','directory=1','photo='+ids.owner,'video='+ids.owner]){
  status(await response({as:'viewer',query,headers:{'x-chempat-member-id':ids.owner}}),403);
  status(await response({as:'viewer',query,headers:{'x-chempat-member-id':null}}),200);
 }
 for(const kind of ['photo','video'])status(await response({as:'viewer',query:kind+'='+ids.owner,method:'HEAD',headers:{'x-chempat-member-id':null}}),200);
 status(await call({headers:{'x-chempat-member-id':'malformed'}}),403);
});
await test('directory exposes only opted-in snapshot first name and authenticated routes',async()=>{
 status(await action('list'),200);const rows=(await directory()).data.profiles;assert.equal(rows.length,1);assert.deepEqual(rows[0],{id:ids.owner,name:'owner',photo:'/api/reward-directory?photo='+ids.owner,videoAvailable:false});
 assert.deepEqual((await directory('owner')).data.profiles,[],'own account excluded from browsing');
 for(const secret of ['@example.com','PrivateSurname','must not leave','privateSecret','answers','result','data:image','session_hash','phone'])assert.equal(JSON.stringify(rows).includes(secret),false,secret);
 await db.query('UPDATE members SET name=$1,photo=$2 WHERE id=$3',['Changed PrivateSurname',photo(alternateJpeg),ids.owner]);
 assert.equal((await directory()).data.profiles[0].name,'owner');assert.deepEqual(Buffer.from(await (await media()).arrayBuffer()),jpeg,'private edit never automatically republishes');
 status(await action('list'),200);assert.equal((await directory()).data.profiles[0].name,'Changed');assert.deepEqual(Buffer.from(await (await media()).arrayBuffer()),alternateJpeg,'explicit relist refreshes snapshot');
});
await test('private photo stays private before opt-in, and owner can preview it',async()=>{
 status(await media(),404);const result=await media('photo','owner');status(result,200);assert.deepEqual(Buffer.from(await result.arrayBuffer()),jpeg);status(await media('photo',null),401);
 for(const query of ['photo=bad','video=bad','photo='+ids.owner+'&video='+ids.owner])status(await call({query}),404);
});
await test('unlist immediately hides all public media, retains own preview, and requires renewed video consent',async()=>{
 await listAndPublish();status(await media('photo'),200);status(await media('video'),200);assert.equal((await directory()).data.profiles[0].videoAvailable,true);
 status(await action('unlist'),200);assert.deepEqual((await directory()).data.profiles,[]);status(await media('photo'),404);status(await media('video'),404);status(await media('photo','owner'),200);status(await media('video','owner'),200);
 assert.equal((await call()).data.profile.videoPublished,false);status(await action('publishVideo'),409);status(await action('list'),200);status(await media('video'),404);status(await action('publishVideo'),200);status(await media('video'),200);
});
await test('video upload is private until explicit publication; level4 members can watch',async()=>{
 status(await upload(),200);status(await media('video'),404);status(await media('video','owner'),200);status(await action('publishVideo'),409);status(await action('list'),200);status(await media('video'),404);status(await action('publishVideo'),200);
 await setLevel('viewer',4);status(await media('video'),200);assert.equal((await directory()).data.profiles[0].videoAvailable,true);
 await setLevel('viewer',3);status(await media('video'),404);status(await media('photo'),404);status(await directory(),403);
});
await test('replacement upload and hideVideo both withdraw publication without losing private preview',async()=>{
 await listAndPublish();status(await upload(),200);status(await media('video'),404);status(await media('video','owner'),200);assert.equal((await call()).data.profile.videoPublished,false);
 status(await action('publishVideo'),200);status(await action('hideVideo'),200);status(await media('video'),404);status(await media('video','owner'),200);assert.equal((await directory()).data.profiles[0].videoAvailable,false);
});
await test('blocks in either direction remove directory and media but preserve owner preview',async()=>{
 for(const pair of [[ids.owner,ids.viewer],[ids.viewer,ids.owner]]){
  await listAndPublish();await db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',pair);
  assert.deepEqual((await directory()).data.profiles,[]);status(await media('photo'),404);status(await media('video'),404);status(await media('video','owner'),200);await reset();
 }
});
await test('ended, declined, frozen and trashed prior pairs deny media even with a newer active pair',async()=>{
 for(const mode of ['ended','declined','ended_at','freeze','trash']){
  await listAndPublish();const old=await invite({state:['ended','declined'].includes(mode)?mode:'chat'});await invite();
  if(mode==='ended_at')await db.query('UPDATE connection_state SET ended_at=now() WHERE invitation_hash=$1',[old]);
  if(['freeze','trash'].includes(mode))await db.query(`INSERT INTO connection_visibility(member_id,invitation_hash,action,frozen_at,trashed_at) VALUES($1,$2,'freeze',now(),${mode==='trash'?'now()':'NULL'})`,[ids.viewer,old]);
  assert.deepEqual((await directory()).data.profiles,[],mode);status(await media('photo'),404);status(await media('video'),404);status(await media('video','owner'),200);await reset();
 }
});
await test('reverse pairs, unclaimed intended member and previously supplied recipient are excluded',async()=>{
 for(const config of [{sender:'viewer',prospect:'owner'},{unclaimed:true,intended:true},{unclaimed:true,intended:false}]){
  await listAndPublish();await invite({...config,state:'ended'});assert.deepEqual((await directory()).data.profiles,[]);status(await media('photo'),404);status(await media('video'),404);await reset();
 }
});
await test('unrelated frozen pair does not hide an otherwise eligible directory member',async()=>{
 await listAndPublish();await invite({sender:'owner',prospect:'other',state:'ended'});assert.equal((await directory()).data.profiles[0].id,ids.owner);status(await media('photo'),200);status(await media('video'),200);
});
await test('candidate verification, standing and current unlock levels are checked on every read',async()=>{
 for(const change of ['email_verified_at=NULL','blocked_at=now()',"suspended_until=now()+interval '1 day'"]){await listAndPublish();await db.query('UPDATE members SET '+change+' WHERE id=$1',[ids.owner]);assert.deepEqual((await directory()).data.profiles,[]);status(await media('photo'),404);status(await media('video'),404);await reset()}
 await listAndPublish();await setLevel('owner',4);assert.equal((await directory()).data.profiles[0].videoAvailable,false);status(await media('photo'),200);status(await media('video'),404);
 await setLevel('owner',3);assert.deepEqual((await directory()).data.profiles,[]);status(await media('photo'),404);status(await media('video'),404);status(await action('unlist'),200,'owner can revoke regardless of level');
});
await test('keyset directory pagination is capped at20 and cursors cannot inject SQL',async()=>{
 for(let index=1;index<=25;index++){
  const id='44444444-4444-4444-8444-'+String(index).padStart(12,'0');
  await db.query('INSERT INTO members(id,session_hash,name,contact,photo,email_verified_at) VALUES($1,$2,$3,$4,$5,now())',[id,hash('page-'+index),'Page '+index,'page'+index+'@example.com',photo(jpeg)]);
  await db.query('INSERT INTO member_reward_state(member_id,completed_level) VALUES($1,4)',[id]);await db.query('INSERT INTO reward_directory_profile(member_id,listed,photo,display_name) VALUES($1,true,$2,$3)',[id,photo(jpeg),'Page'+index]);
 }
 const first=await directory('viewer','limit=100');status(first,200);assert.equal(first.data.profiles.length,20);assert.ok(first.data.nextCursor);assert.equal(first.data.nextCursor.includes(first.data.profiles.at(-1).id),false);
 const second=await directory('viewer','cursor='+first.data.nextCursor);assert.equal(second.data.profiles.length,5);assert.equal(second.data.nextCursor,null);assert.equal(new Set([...first.data.profiles,...second.data.profiles].map(p=>p.id)).size,25);
 assert.equal((await directory('viewer','limit=2')).data.profiles.length,2);
 for(const cursor of ['','bad','AAAA',Buffer.from('v1:'+'1;DELETE FROM members').toString('base64url'),'!'.repeat(100)])status(await directory('viewer','cursor='+encodeURIComponent(cursor)),400);
 for(const limit of ['0','-1','NaN','2.5','9999'])status(await directory('viewer','limit='+limit),400);
});
await test('requests enforce HTTP method, bounded JSON shape, MIME and same-origin writes',async()=>{
 for(const method of ['PUT','PATCH','DELETE','OPTIONS'])status(await call({method}),405);
 status(await call({query:''}),400);status(await call({query:'',rawBody:'{'}),400);status(await call({query:'',body:[]}),400);status(await call({query:'',body:{action:'list',listed:true}}),400);status(await call({query:'',body:{action:'anything'}}),400);
 status(await call({query:'',body:{action:'list'},headers:{'content-type':'text/plain'}}),415);
 status(await call({query:'',body:{action:'list'},headers:{origin:'https://evil.example'}}),403);
 status(await call({query:'',body:{action:'list'},headers:{origin:'https://isolated.example'}}),200);
 status(await call({query:'',rawBody:' '.repeat(1025)}),413);status(await call({query:'',body:{action:'list'},headers:{'content-length':'99999'}}),413);
 status(await upload('owner',syntheticVideo,{'content-type':'video/webm'}),415);status(await upload('owner',Buffer.from('malformed')),400);
});
await test('uploads reject declared and streamed oversized bodies before validation or any write',async()=>{
 const before=videoValidations;status(await upload('owner',syntheticVideo,{'content-length':String(2097153)}),413);status(await upload('owner',Buffer.alloc(2097153)),413);assert.equal(videoValidations,before);
 let chunks=0,cancelled=false;
 const stream=new ReadableStream({pull(controller){chunks++;controller.enqueue(new Uint8Array(1048576));if(chunks===6)controller.close()},cancel(){cancelled=true}});
 const result=await api.fetch(new Request('https://isolated.example/api/reward-directory?upload=1',{method:'POST',headers:{cookie:'chempat_member='+tokens.owner,'content-type':'video/mp4','x-chempat-member-id':ids.owner},body:stream,duplex:'half'}));status(result,413);assert.ok(cancelled);assert.ok(chunks<6);assert.equal(videoValidations,before);assert.equal((await db.query('SELECT * FROM reward_directory_profile')).rows.length,0);
});
await test('malformed and unsafe photos are never published or served',async()=>{
 for(const value of ['data:image/svg+xml;base64,PHN2Zy8+',photo(Buffer.from('not jpeg')),'data:image/jpeg;base64,'+'A'.repeat(250000)]){
  await db.query('UPDATE members SET photo=$1 WHERE id=$2',[value,ids.owner]);status(await action('list'),400);status(await media('photo','owner'),404);
 }
});
await test('media has fixed safe MIME, same-origin/no-store headers, HEAD and no range support',async()=>{
 await listAndPublish();for(const kind of ['photo','video']){
  const result=await media(kind);status(result,200);assert.equal(result.headers.get('content-type'),kind==='photo'?'image/jpeg':'video/mp4');assert.equal(result.headers.get('cross-origin-resource-policy'),'same-origin');assert.equal(result.headers.get('accept-ranges'),'none');assert.equal(result.headers.get('referrer-policy'),'no-referrer');
  const head=await response({as:'viewer',query:kind+'='+ids.owner,method:'HEAD'});status(head,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),String(kind==='photo'?jpeg.length:syntheticVideo.length));
 }
});
await test('session rotation before mutation locks prevents list/unlist/upload/publish/hide changes',async()=>{
 for(const operation of ['list','unlist','upload','publishVideo','hideVideo']){
  await listAndPublish();const before=(await db.query('SELECT * FROM reward_directory_profile')).rows;
  beforeTransaction=()=>db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('rotated'),ids.owner]);
  status(operation==='upload'?await upload():await action(operation),409);assert.deepEqual((await db.query('SELECT * FROM reward_directory_profile')).rows,before);await reset();
 }
});
await test('a token reassigned to another member while waiting for locks cannot redirect any profile mutation',async()=>{
 for(const operation of ['list','unlist','upload','publishVideo','hideVideo']){
  await listAndPublish();status(await action('list','viewer'),200);status(await upload('viewer'),200);status(await action('publishVideo','viewer'),200);
  const before=(await db.query('SELECT * FROM reward_directory_profile ORDER BY member_id')).rows;
  beforeTransaction=async()=>{await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('owner-new-session'),ids.owner]);await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash(tokens.owner),ids.viewer])};
  status(operation==='upload'?await upload():await action(operation),409);
  assert.deepEqual((await db.query('SELECT * FROM reward_directory_profile ORDER BY member_id')).rows,before,'neither old nor newly bound member profile changed');await reset();
 }
});
await test('a token reassigned after initial authentication cannot redirect profile, directory, or media reads',async()=>{
 for(const query of ['profile=1','directory=1','photo='+ids.owner,'video='+ids.owner]){
  await listAndPublish();
  beforeRead={matches:text=>text.startsWith('WITH actor'),run:async()=>{await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('viewer-new-session'),ids.viewer]);await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash(tokens.viewer),ids.owner])}};
  status(await response({as:'viewer',query}),['profile=1','directory=1'].includes(query)?403:404);await reset();
 }
});
await test('standing and level downgrade before locks cannot create or publish protected data',async()=>{
 for(const change of ['blocked_at=now()','email_verified_at=NULL',"suspended_until=now()+interval '1 day'"]){beforeTransaction=()=>db.query('UPDATE members SET '+change+' WHERE id=$1',[ids.owner]);status(await action('list'),409);assert.equal((await db.query('SELECT * FROM reward_directory_profile')).rows.length,0);await reset()}
 beforeTransaction=()=>setLevel('owner',3);status(await action('list'),409);await reset();beforeTransaction=()=>setLevel('owner',4);status(await upload(),409);await reset();await listAndPublish();status(await action('hideVideo'),200);beforeTransaction=()=>setLevel('owner',4);status(await action('publishVideo'),409);status(await media('video'),404);
});
await test('explicit listing copies current private profile after acquiring member lock',async()=>{
 beforeTransaction=()=>db.query('UPDATE members SET name=$1,photo=$2 WHERE id=$3',['Updated PrivateSurname',photo(alternateJpeg),ids.owner]);status(await action('list'),200);assert.equal((await directory()).data.profiles[0].name,'Updated');assert.deepEqual(Buffer.from(await (await media()).arrayBuffer()),alternateJpeg);
});
await test('read authorization is fresh after initial authentication, including media withdrawal races',async()=>{
 await listAndPublish();
 for(const query of ['profile=1','directory=1','photo='+ids.owner,'video='+ids.owner]){
  beforeRead={matches:text=>text.startsWith('WITH actor'),run:()=>db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash('revoked'),ids.viewer])};
  status(await response({as:'viewer',query}),['profile=1','directory=1'].includes(query)?403:404);await db.query('UPDATE members SET session_hash=$1 WHERE id=$2',[hash(tokens.viewer),ids.viewer]);
 }
 beforeRead={matches:text=>text.startsWith('WITH actor'),run:()=>db.query('UPDATE reward_directory_profile SET listed=false,video_published=false WHERE member_id=$1',[ids.owner])};status(await media('video'),404);
 status(await action('list'),200);status(await action('publishVideo'),200);
 beforeRead={matches:text=>text.startsWith('WITH actor'),run:()=>db.query('INSERT INTO member_blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids.viewer,ids.owner])};status(await media('photo'),404);
});
await test('publication rechecks concurrent unlisting after locks and leaves the upload private',async()=>{
 await listAndPublish();status(await action('hideVideo'),200);
 beforeTransaction=()=>db.query('UPDATE reward_directory_profile SET listed=false,video_published=false WHERE member_id=$1',[ids.owner]);status(await action('publishVideo'),409);
 status(await media('video'),404);status(await media('video','owner'),200);assert.equal((await call()).data.profile.listed,false);
});
await test('viewer and candidate standing plus completed levels are fresh on the final read',async()=>{
 for(const change of [()=>setLevel('viewer',3),()=>db.query('UPDATE members SET blocked_at=now() WHERE id=$1',[ids.viewer]),()=>db.query('UPDATE members SET email_verified_at=NULL WHERE id=$1',[ids.owner]),()=>setLevel('owner',3)]){
  await listAndPublish();beforeRead={matches:text=>text.startsWith('WITH actor'),run:change};status(await media('video'),404);await reset();
 }
 await listAndPublish();beforeRead={matches:text=>text.startsWith('WITH actor'),run:()=>setLevel('viewer',3)};status(await directory(),403);
});
await test('transaction failures roll back without changing private membership, answers, or connections',async()=>{
 const pair=await invite();const originalMembers=(await db.query('SELECT * FROM members ORDER BY id')).rows,originalConnections=(await db.query('SELECT * FROM connection_state')).rows,originalRewards=(await db.query('SELECT * FROM member_reward_state ORDER BY member_id')).rows;
 failTransaction=true;status(await action('list'),503);assert.equal((await db.query('SELECT * FROM reward_directory_profile')).rows.length,0);
 await listAndPublish();status(await action('unlist'),200);assert.deepEqual((await db.query('SELECT * FROM members ORDER BY id')).rows,originalMembers);assert.deepEqual((await db.query('SELECT * FROM connection_state')).rows,originalConnections);assert.deepEqual((await db.query('SELECT * FROM member_reward_state ORDER BY member_id')).rows,originalRewards);assert.ok(pair);
});
await test('review gate denies blocked and fully trusted live deployments before any database access',async()=>{
 const names=['CHEMPAT_RELEASE_MODE','CHEMPAT_REVIEW_DATA','VERCEL','VERCEL_PROJECT_ID','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','DATABASE_URL'],saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 const beforeQueries=queries,beforeTransactions=transactions;
 try{
  delete process.env.CHEMPAT_REVIEW_DATA;status(await call(),503);status(await action('list'),503);
  process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';process.env.CHEMPAT_RELEASE_MODE='live';process.env.VERCEL='1';process.env.VERCEL_PROJECT_ID='prj_gtV01YIqkEfAfvdSbVopIfy2VpnJ';process.env.VERCEL_ENV='production';process.env.VERCEL_GIT_COMMIT_REF='live';
  status(await call(),503);status(await directory(),503);status(await action('list'),503);status(await media(),503);status(await upload(),503);
  delete process.env.VERCEL_PROJECT_ID;process.env.CHEMPAT_RELEASE_MODE='review';delete process.env.DATABASE_URL;status(await call(),503);
  assert.equal(queries,beforeQueries);assert.equal(transactions,beforeTransactions);
 }finally{for(const [name,value] of Object.entries(saved)){if(value===undefined)delete process.env[name];else process.env[name]=value}}
});
await test('missing migration fails closed; request handlers do not initialize schema',async()=>{
 await db.exec('DROP TABLE reward_directory_profile');status(await call(),503);assert.equal((await db.query("SELECT to_regclass('reward_directory_profile') AS name")).rows[0].name,null);await db.exec(fs.readFileSync(new URL('migrations/20261003_reward_directory.sql',root),'utf8'));
});
await db.close();
if(failures.length){console.error(`${failures.length} reward-directory checks failed (${passed} passed)`);process.exitCode=1}else console.log(`Reward directory: ${passed} privacy, consent, media, race, pagination and review-only checks passed`);
