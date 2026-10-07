import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';

// Bridge the shipped UI directly to the actual API handlers and disposable SQL.
// Media decoding is synthetic; real JPEG fixtures cross the API validation boundary.
// No browser session, external database, account, mail or network request is used.
const root=fileURLToPath(new URL('../',import.meta.url));
process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
process.env.DATABASE_URL='postgres://synthetic-profile-contract-bridge';
const db=new PGlite();
await db.exec(fs.readFileSync(root+'schema.sql','utf8'));
await db.exec('ALTER TABLE members ADD COLUMN IF NOT EXISTS email_verified_at timestamptz');
for(const file of fs.readdirSync(root+'migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync(root+'migrations/'+file,'utf8'));
const template=(strings,values)=>({text:strings.reduce((out,part,index)=>out+(index?`$${index}`:'')+part,''),values});
const run=async(executor,statement)=>(await executor.query(statement.text,statement.values)).rows;
const sql=(strings,...values)=>run(db,template(strings,values));
sql.query=(text,values=[])=>run(db,{text,values});
sql.transaction=async(build)=>db.transaction(async executor=>{const tx=(strings,...values)=>template(strings,values);tx.query=(text,values=[])=>({text,values});const out=[];for(const statement of build(tx))out.push(await run(executor,statement));return out});
globalThis.__profileContractSql=sql;
globalThis.fetch=async()=>{throw Error('External I/O is forbidden in profile bridge')};
const apis={};
for(const name of ['member-profile','member','connection','rewards','reward-directory','reward-requests','wildcards','game-pieces','discovery']){
 const source=fs.readFileSync(root+'api/'+name+'.mjs','utf8').replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__profileContractSql;').replace(/from '\.\/(.*?)\.mjs'/g,(_,dependency)=>`from ${JSON.stringify(new URL('../api/'+dependency+'.mjs',import.meta.url).href)}`);
 apis['/api/'+name]=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
}
const hash=v=>createHash('sha256').update(v).digest('hex');
const ids={owner:'11111111-1111-4111-8111-111111111111',peer:'22222222-2222-4222-8222-222222222222'};
const tokens={owner:'a'.repeat(64),peer:'b'.repeat(64)};
const photo='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwClRRRX0J84f//Z';
const replacementPhoto='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDJooorM+vP/9k=';
const firstFive=[0,1,2,0,1],ten=[...firstFive,...firstFive];
for(const name of ['owner','peer']){
 await db.query('INSERT INTO members(id,session_hash,name,contact,photo,answers,email_verified_at) VALUES($1,$2,$3,$4,$5,$6,now())',[ids[name],hash(tokens[name]),name==='owner'?'Taylor':'Morgan',name+'@example.test',photo,JSON.stringify(ten)]);
 await db.query('INSERT INTO member_reward_state(member_id,completed_level) VALUES($1,5)',[ids[name]]);
}
await db.query('INSERT INTO reward_directory_profile(member_id,listed,display_name,photo,video_published) VALUES($1,true,$2,$3,false)',[ids.owner,'Taylor',photo]);
const own={id:ids.owner,name:'Taylor',contact:'owner@example.test',photo,answers:ten,verified:true};
const html=fs.readFileSync(root+'index.html','utf8').replace('<script src="game.js"></script>','');
let lostSave=false;
async function fixture(actor='member'){
 const dom=new JSDOM(html,{url:'https://synthetic.example.test/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
 const calls=[],pending=new Set();let sessionAs='owner',heldProfileSave=null;
 w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.fetch=(url,options={})=>{
  const work=(async()=>{const full=new URL(url,w.location.href),api=apis[full.pathname];if(!api)throw Error('Unexpected local request '+url);
   const headers=new Headers(options.headers||{});headers.set('cookie','chempat_member='+tokens[sessionAs]);if(options.method==='POST')headers.set('origin',w.location.origin);
   calls.push({url,method:options.method||'GET',body:options.body?JSON.parse(options.body):null,headers:Object.fromEntries(headers)});
   const response=await api.fetch(new Request(full,{...options,headers}));
   if(heldProfileSave&&full.pathname==='/api/member-profile'&&options.method==='POST'){const held=heldProfileSave;heldProfileSave=null;held.committed();await held.promise}
   if(lostSave&&full.pathname==='/api/member-profile'&&options.method==='POST'){lostSave=false;throw Error('Synthetic dropped save response')}
   return response;
  })();pending.add(work);work.finally(()=>pending.delete(work)).catch(()=>{});return work;
 };
 const script=d.createElement('script');script.textContent=fs.readFileSync(root+'game.js','utf8');d.body.append(script);
 async function drain(){for(let count=0;count<50;count++){await Promise.allSettled([...pending]);await new Promise(r=>setImmediate(r));if(!pending.size)return}throw Error('Local requests did not settle')}
 await drain();
 const state=actor==='member'?{view:'dashboard',actor,member:own,account:own,memberId:ids.owner,liveMember:true,phase:'ready'}:{view:'dashboard',actor,member:{name:'Counterpart snapshot',photo,answers:firstFive},prospect:{name:own.name,email:own.contact,photo,answers:ten},prospectId:ids.owner,prospectVerified:true,phase:'chat',liveInvite:false};
 w.eval(`s={...blank(),...${JSON.stringify(state)}};render()`);await drain();
 return {w,d,calls,drain,setSession:as=>{sessionAs=as},holdSaveResponse:()=>{let release,committed;const promise=new Promise(r=>{release=r}),saved=new Promise(r=>{committed=r});heldProfileSave={promise,committed};return {release,saved}},close:()=>w.close()};
}
const input=(f,id,value)=>{const node=f.d.getElementById(id);assert.ok(node,id+' exists');node.value=value;node.dispatchEvent(new f.w.Event('input',{bubbles:true}))};
const ownerRow=async()=>(await db.query('SELECT name,photo,contact,answers FROM members WHERE id=$1',[ids.owner])).rows[0];
const listing=async()=>(await db.query('SELECT display_name,photo,listed,video_published FROM reward_directory_profile WHERE member_id=$1',[ids.owner])).rows[0];
let f=await fixture();
try{
 f.w.openMemberProfile();await f.drain();
 assert.equal(f.d.getElementById('memberProfileName').value,'Taylor');assert.equal(f.d.getElementById('memberProfileEmail').value,own.contact);assert.equal(f.d.getElementById('memberProfileEmail').readOnly,true);
 assert.equal(f.d.getElementById('memberProfileDiscovery').checked,false);
 f.w.URL.createObjectURL=()=> 'blob:synthetic-profile-image';f.w.URL.revokeObjectURL=()=>{};
 f.w.Image=class{constructor(){this.width=8;this.height=8}set src(value){queueMicrotask(()=>this.onload?.())}};
 f.w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});f.w.HTMLCanvasElement.prototype.toDataURL=()=>replacementPhoto;
 const upload=f.d.getElementById('memberProfilePhotoFile');Object.defineProperty(upload,'files',{value:[new f.w.File(['synthetic image'],'new.png',{type:'image/png'})]});f.w.render();await f.w.uploadMemberProfilePhoto({currentTarget:upload,target:upload});
 assert.equal(f.d.getElementById('memberProfilePreviewImage').getAttribute('src'),replacementPhoto);assert.equal((await ownerRow()).photo,photo,'photo selection only previews before Save');
 input(f,'memberProfileName','Taylor Private');await f.w.saveMemberProfile();await f.drain();
 assert.equal((await ownerRow()).name,'Taylor Private');assert.equal((await ownerRow()).photo,replacementPhoto);assert.equal((await listing()).photo,photo);assert.equal((await listing()).display_name,'Taylor');assert.match(f.d.getElementById('memberProfileStatus').textContent,/saved/);
 input(f,'memberProfileName','River Discovery');const cb=f.d.getElementById('memberProfileDiscovery');cb.checked=true;cb.dispatchEvent(new f.w.Event('change',{bubbles:true}));await f.w.saveMemberProfile();await f.drain();
 assert.equal((await listing()).display_name,'River');assert.equal((await listing()).photo,replacementPhoto);assert.equal((await listing()).listed,true);assert.equal((await listing()).video_published,false);
 const post=f.calls.filter(c=>c.url==='/api/member-profile'&&c.method==='POST').at(-1);assert.equal(post.body.updateDiscovery,true);assert.equal(post.headers['x-chempat-member-id'],ids.owner);assert.ok(!('contact' in post.body));
 input(f,'memberProfilePhone','+1 202 555 0123');await f.w.confirmRewardProfilePhone('profile');await f.drain();
 assert.equal((await db.query('SELECT phone FROM member_phone_profile WHERE member_id=$1',[ids.owner])).rows[0].phone,'+12025550123');assert.equal((await db.query('SELECT count(*)::int AS n FROM reward_phone_offers')).rows[0].n,0);assert.equal((await ownerRow()).contact,own.contact);
 assert.match(f.d.querySelector('.rewardSavedPhone').textContent,/\+12025550123/);assert.ok(!f.w.sessionStorage.getItem('chempatibility.walkthrough.v7').includes('2025550123'));
 input(f,'memberProfileName','Committed lost response');lostSave=true;await f.w.saveMemberProfile();await f.drain();assert.equal((await ownerRow()).name,'Committed lost response');assert.match(f.d.getElementById('memberProfileError').textContent,/dropped/);
 await f.w.saveMemberProfile();await f.drain();assert.match(f.d.querySelector('.memberProfileConflict').textContent,/changed elsewhere/);assert.equal((await ownerRow()).name,'Committed lost response');
 f.w.reviewMemberProfileConflict(true);await f.drain();assert.equal(f.d.getElementById('memberProfileName').value,'Committed lost response');
 f.w.cancelMemberProfile();f.w.openMemberProfile();await f.drain();assert.equal(f.d.getElementById('memberProfileName').value,'Committed lost response');assert.equal(f.d.getElementById('memberProfileDiscovery').checked,false);
 const staleInput=f.d.getElementById('memberProfilePhotoFile');Object.defineProperty(staleInput,'files',{value:[new f.w.File(['invalid'],'old.gif',{type:'image/gif'})]});
 f.w.cancelMemberProfile();f.w.openMemberProfile();await f.drain();await f.w.uploadMemberProfilePhoto({target:staleInput,currentTarget:staleInput});
 assert.equal(f.d.getElementById('memberProfileError').textContent,'','detached file picker cannot modify new profile editor');
 f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));assert.equal(f.w.eval('memberProfileDraft'),null);
 f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));await f.drain();
 assert.equal(f.w.eval('currentMemberProfile()?.loaded'),true,'back-forward cache restores a usable canonical profile editor');assert.equal(f.d.getElementById('memberProfileName').value,'Committed lost response');assert.equal(f.w.eval('memberProfileDraft.stream'),null);
 console.log('PASS actual DOM → profile/rewards API: strict contract, saved/reopened identity, unchecked discovery choice, explicit directory sync, private phone reuse, lost-response conflict');
}finally{f.close()}
f=await fixture('prospect');
try{
 f.w.openMemberProfile();await f.drain();input(f,'memberProfileName','Prospect Owner');await f.w.saveMemberProfile();await f.drain();
 assert.equal(f.w.eval('s.prospect.name'),'Prospect Owner');assert.equal(f.w.eval('s.member.name'),'Counterpart snapshot');assert.equal((await ownerRow()).name,'Prospect Owner');
 assert.equal((await db.query('SELECT name FROM members WHERE id=$1',[ids.peer])).rows[0].name,'Morgan');
 console.log('PASS original prospect DOM → actual profile API: owner updates and counterpart isolation');
}finally{f.close()}
f=await fixture();
try{
 const before=await ownerRow();
 f.w.eval(`s={...blank(),view:'landing',joinStep:3,member:${JSON.stringify({...own,name:'Stale signup',photo,answers:[],agreed:true})}};render()`);
 await f.w.finishRegistration();await f.drain();
 assert.equal(f.w.eval('s.memberId'),ids.owner);assert.equal(f.w.eval('s.member.name'),before.name);assert.equal(f.w.eval('s.member.photo'),before.photo);
 assert.deepEqual(JSON.parse(f.w.eval('JSON.stringify(s.member.answers)')),ten);assert.equal(f.w.eval('s.memberQuestionsOpen'),false);assert.equal(f.d.querySelector('.option'),null,'existing saved answers do not restart First 5');
 assert.deepEqual(await ownerRow(),before);assert.equal((await db.query('SELECT count(*)::int AS n FROM members')).rows[0].n,2);
 console.log('PASS legacy registration retry adopts canonical identity without duplicate accounts or stored-answer changes');
}finally{f.close()}
f=await fixture();
try{
 f.w.openMemberProfile();await f.drain();input(f,'memberProfileName','Saved before leaving');const held=f.holdSaveResponse(),saving=f.w.saveMemberProfile();await held.saved;
 f.w.cancelMemberProfile();held.release();await saving;await f.drain();
 assert.equal((await ownerRow()).name,'Saved before leaving');assert.equal(f.w.eval('s.view'),'dashboard');assert.equal(f.w.eval('s.member.name'),'Saved before leaving');assert.match(f.d.querySelector('.navIdentity').textContent,/Saved/);
 assert.equal(f.d.getElementById('memberProfileEditor'),null,'settled save does not reopen the editor');
 console.log('PASS successful save reconciles own identity after navigation without reopening the editor');
}finally{f.close()}
f=await fixture();
try{
 f.setSession('peer');await f.w.refreshLive();await f.drain();
 assert.equal(f.w.eval('s.view'),'landing');assert.ok(!f.d.getElementById('root').textContent.includes('Morgan'));
 console.log('PASS authenticated connection refresh rejects switched-cookie/old-page identity');
}finally{f.close();await db.close()}
