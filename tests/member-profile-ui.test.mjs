import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {REWARD_ROUNDS} from '../api/_reward-rounds.mjs';

// Synthetic DOM only. No real browser, accounts, email, camera or network.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../site.css',import.meta.url),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
const reply=(data,status=200)=>({ok:status<400,status,json:async()=>copy(data)});
const flush=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r))};
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve}};
const photo='data:image/jpeg;base64,AA==',newPhoto='data:image/jpeg;base64,AQ==',revision=n=>n.toString(16).padStart(64,'0');
const profiles=()=>({owner:{profile:{id:'owner',name:'Taylor',contact:'owner@example.test',photo,revision:revision(1)},discovery:{listed:false,eligible:false}},other:{profile:{id:'other',name:'Casey',contact:'other@example.test',photo,revision:revision(1)},discovery:{listed:false,eligible:false}}});
async function fixture({level=2,prospect=false,listed=false,server={profiles:profiles(),phone:{phone:null,confirmedAt:null,revision:0},calls:[],intercept:null}}={}){
 server.profiles.owner.discovery={listed,eligible:listed||level>=4};
 const dom=new JSDOM(html,{url:'https://profile.example.test/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
 w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLMediaElement.prototype.play=async()=>{};
 w.fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):null,id=options.headers?.['x-chempat-member-id']||'owner',call={url,body,id,options};server.calls.push(call);if(server.intercept){const result=server.intercept(call);if(result)return result}
  if(url==='/api/member-profile'){
   const data=server.profiles[id];if(!data)return reply({error:'Sign in again.'},401);
   if(body){if(body.profileRevision!==data.profile.revision)return reply({error:'Profile changed elsewhere.',profileConflict:true},409);if(body.updateDiscovery&&(!data.discovery.listed||!data.discovery.eligible))return reply({error:'Listing changed.',discoveryConflict:true},409);data.profile={...data.profile,name:body.name,photo:body.photo,revision:revision(Number.parseInt(data.profile.revision,16)+1)}}
   return reply(data);
  }
  if(url==='/api/member'&&body?.action==='logout')return reply({ok:true});
  if(url==='/api/connection?inbox=1')return reply({connections:[]});
  if(url.startsWith('/api/discovery'))return reply({modules:[],games:[],pieces:[]});
  if(url.startsWith('/api/game-pieces?'))return reply({pieces:[],pendingCount:0});
  if(url==='/api/rewards?phoneRequests=1')return reply({phoneRequests:[]});
  if(url==='/api/wildcards?summary=1')return reply({connections:[]});
  if(url==='/api/rewards'){
   if(body?.action==='confirmProfilePhone')server.phone={phone:body.phone.replace(/[\s().-]/g,''),confirmedAt:'2026-10-07T00:00:00Z',revision:server.phone.revision+1};
   return reply({level,rounds:REWARD_ROUNDS,answers:{},draftRevision:0,phoneProfile:server.phone,connections:[]});
  }
  return reply({},401);
 };
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 const mount=(id='owner',isProspect=prospect)=>{const own={...server.profiles[id].profile,answers:Array(level>=2?10:level?5:0).fill(0),verified:true},counterpart={name:'Morgan',photo:newPhoto,answers:[1,1,1,1,1]};w.eval(`s={...blank(),view:'dashboard',account:${JSON.stringify(own)},member:${JSON.stringify(isProspect?counterpart:own)},prospect:${JSON.stringify(isProspect?{...own,email:own.contact}:counterpart)},actor:${JSON.stringify(isProspect?'prospect':'member')},memberId:${JSON.stringify(isProspect?'counterpart':id)},prospectId:${JSON.stringify(isProspect?id:'')},liveMember:true};render()`)};
 mount();await flush();
 const open=async()=>{w.openMemberProfile();await flush()};
 return {w,d,server,mount,open,posts:()=>server.calls.filter(c=>c.url==='/api/member-profile'&&c.body),close:()=>w.close()};
}
function changeName(f,value){const input=f.d.getElementById('memberProfileName');input.value=value;input.dispatchEvent(new f.w.Event('input',{bubbles:true}));return input}
function imageMock(f,{width=400,height=400,fail=false,pending=false}={}){const instances=[],revoked=[];f.w.URL.createObjectURL=()=>`blob:synthetic-${instances.length}`;f.w.URL.revokeObjectURL=url=>revoked.push(url);f.w.Image=class{constructor(){this.width=width;this.height=height;instances.push(this)}set src(value){this.url=value;if(!pending)queueMicrotask(()=>fail?this.onerror?.():this.onload?.())}};f.w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});f.w.HTMLCanvasElement.prototype.toDataURL=()=>newPhoto;return {instances,revoked}}
function upload(f,{type='image/png',size=500,name='self.png'}={}){const input=f.d.getElementById('memberProfilePhotoFile');Object.defineProperty(input,'files',{configurable:true,value:[{type,size,name}]});return f.w.uploadMemberProfilePhoto({currentTarget:input})}
function cameraMock(f,{pending=false,error=null}={}){let stopped=0,calls=0;const hold=deferred(),stream={getTracks:()=>[{stop(){stopped++}}]};Object.defineProperty(f.w.navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{calls++;if(error)throw error;return pending?hold.promise:stream}}});return {stream,hold,get stopped(){return stopped},get calls(){return calls}}}

test('profile is reachable beside the avatar at Level 0, reads canonical email and never starts onboarding',async()=>{
 const f=await fixture({level:0});try{const entry=f.d.querySelector('.navProfile');assert.equal(entry.textContent,'My profile');assert.ok(entry.previousElementSibling.classList.contains('navIdentity'));await f.open();assert.equal(f.d.querySelector('#memberProfileName').value,'Taylor');assert.equal(f.d.querySelector('#memberProfileEmail').value,'owner@example.test');assert.equal(f.d.querySelector('#memberProfileEmail').readOnly,true);assert.equal(f.d.querySelector('#memberProfilePhone'),null);assert.match(f.d.querySelector('#memberProfilePhonePanel').textContent,/after you finish Step 2/);assert.equal(f.d.querySelector('#memberProfileDiscovery'),null);assert.equal(f.posts().length,0);assert.equal(f.server.calls.filter(c=>c.body?.action==='register').length,0);assert.equal(f.d.activeElement.id,'memberProfileTitle')}finally{f.close()}
});

test('name and photo preview stay local until Save, persist on reopen, and preserve answers and consent',async()=>{
 const f=await fixture();try{await f.open();const old=f.w.eval('JSON.stringify(s.member.answers)');changeName(f,'Riley');const media=imageMock(f);await upload(f);assert.equal(f.d.querySelector('#memberProfilePreviewImage').src,newPhoto);assert.equal(f.w.eval('s.account.name'),'Taylor');assert.equal(f.w.eval('s.member.photo'),photo);assert.equal(f.posts().length,0);assert.equal(media.revoked.length,1);await f.w.saveMemberProfile();assert.equal(f.posts().length,1);assert.deepEqual(f.posts()[0].body,{action:'save',name:'Riley',photo:newPhoto,profileRevision:revision(1),updateDiscovery:false});assert.equal(f.w.eval('s.account.name'),'Riley');assert.equal(f.w.eval('JSON.stringify(s.member.answers)'),old);assert.match(f.d.querySelector('.navIdentity').textContent,/Riley/);assert.match(f.d.querySelector('#memberProfileStatus').textContent,/saved/);f.w.cancelMemberProfile();await f.open();assert.equal(f.d.querySelector('#memberProfileName').value,'Riley');assert.equal(f.d.querySelector('#memberProfilePreviewImage').src,newPhoto);assert.equal(f.server.calls.filter(c=>c.body&&c.url!=='/api/member-profile').length,0)}finally{f.close()}
});

test('Cancel discards unsaved name and photo, including after repeated opens',async()=>{
 const f=await fixture();try{await f.open();changeName(f,'Unsaved');imageMock(f);await upload(f);f.w.cancelMemberProfile();assert.equal(f.w.eval('s.view'),'dashboard');assert.equal(f.w.eval('memberProfileDraft'),null);await f.open();assert.equal(f.d.querySelector('#memberProfileName').value,'Taylor');assert.equal(f.d.querySelector('#memberProfilePreviewImage').src,photo);f.w.openMemberProfile();assert.equal(f.d.querySelectorAll('#memberProfileEditor').length,1);assert.equal(f.posts().length,0);assert.ok(!f.w.sessionStorage.getItem('chempatibility.walkthrough.v7').includes('Unsaved'))}finally{f.close()}
});

test('prospect owner edits only the canonical account and own prospect, never the counterpart',async()=>{
 const f=await fixture({prospect:true});try{await f.open();assert.equal(f.d.querySelector('#memberProfileName').value,'Taylor');const before=f.w.eval('JSON.stringify(s.member)');changeName(f,'Riley');await f.w.saveMemberProfile();assert.equal(f.w.eval('s.account.name'),'Riley');assert.equal(f.w.eval('s.prospect.name'),'Riley');assert.equal(f.w.eval('JSON.stringify(s.member)'),before);assert.ok(f.server.calls.filter(c=>c.url==='/api/member-profile').every(c=>c.id==='owner'))}finally{f.close()}
});

test('polling and unrelated full renders preserve name draft, focus, cursor and active camera',async()=>{
 const f=await fixture();try{await f.open();const cam=cameraMock(f);await f.w.openMemberProfileCamera();let field=changeName(f,'Riley pending');field.focus();field.setSelectionRange(2,5);await f.w.loadMemberProfile(true);f.w.render();assert.equal(f.d.activeElement.id,'memberProfileName');assert.equal(f.d.activeElement.selectionStart,2);assert.equal(f.d.activeElement.selectionEnd,5);assert.equal(f.d.activeElement.value,'Riley pending');assert.equal(f.d.querySelector('#memberProfileCamera').srcObject,cam.stream);assert.equal(cam.stopped,0)}finally{f.w.closeMemberProfileCamera();f.close()}
});

test('save is duplicate-safe and old saves cannot overwrite a new screen or reopened draft',async()=>{
 const f=await fixture();try{await f.open();changeName(f,'First save');const hold=deferred();f.server.intercept=c=>c.url==='/api/member-profile'&&c.body?hold.promise:null;const pending=f.w.saveMemberProfile();await f.w.saveMemberProfile();assert.equal(f.posts().length,1);f.w.cancelMemberProfile();await f.open();changeName(f,'New draft');hold.resolve(reply({...f.server.profiles.owner,profile:{...f.server.profiles.owner.profile,name:'First save',revision:revision(2)}}));await pending;assert.equal(f.d.querySelector('#memberProfileName').value,'New draft');assert.equal(f.w.eval('s.account.name'),'Taylor');assert.equal(f.posts().length,1)}finally{f.close()}
});

test('late reads and writes cannot expose the prior account after account switch or sign-out',async()=>{
 for(const kind of ['read','save']){const f=await fixture();try{await f.open();changeName(f,'Private draft');const hold=deferred();f.server.intercept=c=>c.url==='/api/member-profile'&&c.id==='owner'&&(kind==='save'?c.body:!c.body)?hold.promise:null;const pending=kind==='save'?f.w.saveMemberProfile():f.w.loadMemberProfile(true);f.mount('other');await f.open();hold.resolve(reply({...f.server.profiles.owner,profile:{...f.server.profiles.owner.profile,name:'Late owner',revision:revision(2)}}));await pending;assert.equal(f.d.querySelector('#memberProfileName').value,'Casey');assert.doesNotMatch(f.d.querySelector('#root').textContent,/Late owner|Private draft/);f.w.confirmLogout();await f.w.logout();assert.equal(f.w.eval('memberProfileDraft'),null);assert.equal(f.w.eval('s.view'),'landing')}finally{f.close()}}
});

test('invalid name and failed writes retain exact draft without any registration or reward mutation',async()=>{
 const f=await fixture();try{await f.open();changeName(f,'  ');await f.w.saveMemberProfile();assert.equal(f.posts().length,0);assert.match(f.d.querySelector('#memberProfileError').textContent,/first name/);changeName(f,'Riley');f.server.intercept=c=>c.body&&c.url==='/api/member-profile'?reply({error:'Temporary failure.'},503):null;await f.w.saveMemberProfile();assert.equal(f.d.querySelector('#memberProfileName').value,'Riley');assert.match(f.d.querySelector('#memberProfileError').textContent,/Temporary failure/);f.server.intercept=null;await f.w.saveMemberProfile();assert.equal(f.server.profiles.owner.profile.name,'Riley')}finally{f.close()}
});

test('dirty draft sees another-device changes and requires deliberate review before rebasing',async()=>{
 const f=await fixture();try{await f.open();changeName(f,'Local Riley');f.server.profiles.owner.profile={...f.server.profiles.owner.profile,name:'Remote Casey',photo:newPhoto,revision:revision(2)};await f.w.loadMemberProfile(true);assert.equal(f.d.querySelector('#memberProfileName').value,'Local Riley');assert.match(f.d.querySelector('.memberProfileConflict').textContent,/Remote Casey/);await f.w.saveMemberProfile();assert.equal(f.posts().length,0);f.w.reviewMemberProfileConflict();assert.equal(f.d.querySelector('#memberProfileName').value,'Local Riley');await f.w.saveMemberProfile();assert.equal(f.posts()[0].body.profileRevision,revision(2));assert.equal(f.server.profiles.owner.profile.name,'Local Riley')}finally{f.close()}
});

test('409 retains draft, reloads latest identity and supports choosing the saved profile',async()=>{
 const f=await fixture();try{await f.open();changeName(f,'Local');f.server.profiles.owner.profile={...f.server.profiles.owner.profile,name:'Remote',revision:revision(2)};await f.w.saveMemberProfile();assert.equal(f.posts().length,1);assert.equal(f.d.querySelector('#memberProfileName').value,'Local');assert.match(f.d.querySelector('#memberProfileError').textContent,/changed elsewhere/);f.w.reviewMemberProfileConflict(true);assert.equal(f.d.querySelector('#memberProfileName').value,'Remote');assert.equal(f.posts().length,1)}finally{f.close()}
});

test('existing eligible listing needs unchecked explicit opt-in and loss of eligibility aborts atomically',async()=>{
 const f=await fixture({level:4,listed:true});try{await f.open();assert.equal(f.d.querySelector('#memberProfileDiscovery').checked,false);changeName(f,'Private change');await f.w.saveMemberProfile();assert.equal(f.posts()[0].body.updateDiscovery,false);changeName(f,'Public change');f.d.querySelector('#memberProfileDiscovery').click();assert.equal(f.d.querySelector('#memberProfileDiscovery').checked,true);f.server.profiles.owner.discovery.listed=false;await f.w.saveMemberProfile();assert.equal(f.posts()[1].body.updateDiscovery,true);assert.equal(f.server.profiles.owner.profile.name,'Private change');assert.equal(f.d.querySelector('#memberProfileName').value,'Public change');assert.match(f.d.querySelector('#memberProfileError').textContent,/listing changed/);f.w.reviewMemberProfileConflict();assert.equal(f.d.querySelector('#memberProfileDiscovery'),null);assert.equal(f.w.eval('memberProfileDraft.updateDiscovery'),false);await f.w.saveMemberProfile();assert.equal(f.posts()[2].body.updateDiscovery,false);assert.equal(f.server.calls.some(c=>c.body?.action==='publishVideo'),false)}finally{f.close()}
});

test('shared phone form has distinct IDs, enforces Step 2, and saves privately without sending offers',async()=>{
 const f=await fixture();try{await f.open();const field=f.d.querySelector('#memberProfilePhone');field.value='+1 555 222 3333';field.dispatchEvent(new f.w.Event('input',{bubbles:true}));f.w.openRewardLevel(2);assert.equal(f.d.querySelector('#rewardProfilePhone').value,'+1 555 222 3333');const ids=[...f.d.querySelectorAll('[id]')].map(el=>el.id);assert.equal(ids.length,new Set(ids).size);f.w.closeInvite();await f.w.confirmRewardProfilePhone('profile');assert.equal(f.server.phone.phone,'+15552223333');assert.match(f.d.querySelector('#memberProfilePhoneStatus').textContent,/saved privately.*No phone offer/);assert.equal(f.server.calls.filter(c=>c.body?.action==='offerPhone').length,0);assert.equal(f.posts().length,0);assert.ok(!f.w.sessionStorage.getItem('chempatibility.walkthrough.v7').includes('555'))}finally{f.close()}
});

test('private phone errors use real accessible description IDs',async()=>{
 const f=await fixture();try{await f.open();f.w.updateRewardProfilePhone('555','profile');f.w.paintMemberProfilePhone();await f.w.confirmRewardProfilePhone('profile');const field=f.d.querySelector('#memberProfilePhone');assert.equal(field.getAttribute('aria-invalid'),'true');for(const id of field.getAttribute('aria-describedby').split(/\s+/))assert.ok(f.d.getElementById(id),id)}finally{f.close()}
});

test('invalid, oversized, undecodable and excessive-pixel files show accessible errors and keep saved photo',async()=>{
 for(const [options,mock,expected] of [[{type:'image/svg+xml'},{},/JPEG, PNG or WebP/],[{size:11*1024*1024},{},/10 MB/],[{}, {fail:true},/Could not open/],[{}, {width:10000,height:10000},/40 megapixels/]]){const f=await fixture();try{await f.open();const media=imageMock(f,mock);await upload(f,options);assert.match(f.d.querySelector('#memberProfileError').textContent,expected);assert.equal(f.d.querySelector('#memberProfileError').getAttribute('role'),'alert');assert.equal(f.d.querySelector('#memberProfilePreviewImage').src,photo);assert.equal(f.posts().length,0);if(mock.fail||mock.width)assert.equal(media.revoked.length,1)}finally{f.close()}}
});

test('late file decode is cancelled and revoked on navigation and cannot change a reopened draft',async()=>{
 const f=await fixture();try{await f.open();const media=imageMock(f,{pending:true});const pending=upload(f);f.w.cancelMemberProfile();await f.open();media.instances[0].onload?.();await pending;assert.equal(media.revoked.length,1);assert.equal(f.d.querySelector('#memberProfilePreviewImage').src,photo);assert.equal(f.posts().length,0)}finally{f.close()}
});

test('camera denied and playback failures are recoverable, with no registration and stopped tracks',async()=>{
 for(const playback of [false,true]){const f=await fixture();try{await f.open();const cam=cameraMock(f,{error:playback?null:Object.assign(Error('denied'),{name:'NotAllowedError'})});if(playback)f.w.HTMLMediaElement.prototype.play=async()=>{throw Error('play failed')};await f.w.openMemberProfileCamera();assert.match(f.d.querySelector('#memberProfileError').textContent,playback?/could not start/:/blocked/);assert.equal(f.d.querySelector('#memberProfileCamera').hidden,true);if(playback)assert.ok(cam.stopped>=1);assert.equal(f.posts().length,0)}finally{f.close()}}
});

test('camera capture previews only and Cancel, navigation, logout and pagehide stop every stream',async()=>{
 for(const exit of ['cancel','navigate','logout','pagehide']){const f=await fixture();try{await f.open();imageMock(f);const cam=cameraMock(f);await f.w.openMemberProfileCamera();const video=f.d.querySelector('#memberProfileCamera');Object.defineProperties(video,{videoWidth:{value:640},videoHeight:{value:480}});if(exit==='cancel'){f.w.captureMemberProfilePhoto();assert.equal(f.d.querySelector('#memberProfilePreviewImage').src,newPhoto);f.w.cancelMemberProfile()}else if(exit==='navigate')f.w.navigate('dashboard');else if(exit==='logout'){f.w.confirmLogout();await f.w.logout()}else f.w.dispatchEvent(new f.w.Event('pagehide'));assert.ok(cam.stopped>=1);assert.equal(f.posts().length,0);assert.equal(f.server.calls.some(c=>c.body?.action==='register'),false)}finally{f.close()}}
});

test('late camera permission result stops tracks after closing, switching accounts or opening logout',async()=>{
 for(const exit of ['cancel','switch','modal']){const f=await fixture();try{await f.open();const cam=cameraMock(f,{pending:true});const pending=f.w.openMemberProfileCamera();if(exit==='cancel')f.w.cancelMemberProfile();else if(exit==='switch')f.mount('other');else f.w.confirmLogout();cam.hold.resolve(cam.stream);await pending;assert.equal(cam.stopped,1);assert.equal(f.w.eval('memberProfileDraft?.stream||null'),null)}finally{f.close()}}
});

test('authorization failure clears the editor and an older pending read cannot restore it',async()=>{
 const f=await fixture();try{await f.open();changeName(f,'Private');const hold=deferred();f.server.intercept=c=>c.url==='/api/member-profile'&&!c.body?hold.promise:null;const read=f.w.loadMemberProfile(true);hold.resolve(reply({error:'Your sign-in changed.'},403));await read;assert.equal(f.d.querySelector('#memberProfileName'),null);assert.doesNotMatch(f.d.querySelector('#root').textContent,/owner@example.test|Private/);assert.match(f.d.querySelector('#root').textContent,/Your sign-in changed/);assert.equal(f.w.eval('memberProfileDraft.photo'),'')}finally{f.close()}
});

test('compact editor uses responsive controls, private-email label, native Save/Cancel and focusable heading',async()=>{
 const f=await fixture();try{await f.open();assert.equal(f.d.querySelector('#memberProfileTitle').getAttribute('tabindex'),'-1');assert.equal(f.d.querySelector('[onclick="saveMemberProfile()"]').type,'button');assert.equal(f.d.querySelector('[onclick="cancelMemberProfile()"]').type,'button');assert.match(f.d.querySelector('label[for="memberProfileEmail"]').textContent,/Sign-in email/);assert.match(css,/\.memberProfileEditor\{[^}]*max-width:580px/);assert.match(css,/@media\(max-width:360px\)/);assert.match(css,/\.nav \.user\{[^}]*flex-wrap:wrap/);assert.match(css,/\.memberProfileActions>\.button\{[^}]*min-width:0/)}finally{f.close()}
});

test('a file chooser survives a same-draft render but cannot target a reopened or different-account editor',async()=>{
 for(const action of ['render','reopen','switch']){const f=await fixture();try{await f.open();const media=imageMock(f),old=f.d.querySelector('#memberProfilePhotoFile');Object.defineProperty(old,'files',{value:[{type:'image/png',size:100}]});if(action==='render')f.w.render();else if(action==='reopen'){f.w.cancelMemberProfile();await f.open()}else{f.mount('other');await f.open()}assert.equal(old.isConnected,false);await f.w.uploadMemberProfilePhoto({currentTarget:old});assert.equal(f.d.querySelector('#memberProfilePreviewImage').src,action==='render'?newPhoto:photo);assert.equal(media.instances.length,action==='render'?1:0);assert.equal(f.d.querySelector('#memberProfileError').textContent,'');assert.equal(f.posts().length,0)}finally{f.close()}}
});

test('the latest file selection wins, and timeout/decode failure leave the same input retryable',async()=>{
 const f=await fixture();try{await f.open();const media=imageMock(f,{pending:true});const first=upload(f);const second=upload(f);await first;assert.equal(media.revoked.length,1);media.instances[1].onload();await second;assert.equal(f.d.querySelector('#memberProfilePreviewImage').src,newPhoto);assert.equal(media.revoked.length,2);let timeout;const setTimeout=f.w.setTimeout;f.w.setTimeout=(fn,ms,...args)=>ms===15000?(timeout=fn,999):setTimeout(fn,ms,...args);const third=upload(f);timeout();await third;assert.match(f.d.querySelector('#memberProfileError').textContent,/too long/);assert.equal(media.revoked.length,3);const fourth=upload(f);media.instances[3].onload();await fourth;assert.equal(f.d.querySelector('#memberProfileError').textContent,'');assert.equal(media.revoked.length,4)}finally{f.close()}
});

test('polling revocation of an opted-in listing requires review even if name/photo revision did not change',async()=>{
 const f=await fixture({level:4,listed:true});try{await f.open();changeName(f,'Riley');f.d.querySelector('#memberProfileDiscovery').click();f.server.profiles.owner.discovery.eligible=false;await f.w.loadMemberProfile(true);assert.ok(f.d.querySelector('.memberProfileConflict'));await f.w.saveMemberProfile();assert.equal(f.posts().length,0);f.w.reviewMemberProfileConflict();assert.equal(f.d.querySelector('#memberProfileDiscovery'),null);assert.equal(f.w.eval('memberProfileDraft.updateDiscovery'),false)}finally{f.close()}
});

test('all authenticated connection reads and writes capture the visible owner header',async()=>{
 const f=await fixture();try{await f.w.refreshLive();f.server.intercept=c=>c.url==='/api/connection'&&c.body?reply({messages:[]}):null;await f.w.connectionApi({action:'message',id:'a'.repeat(64),text:'synthetic'});const calls=f.server.calls.filter(c=>c.url.startsWith('/api/connection'));assert.ok(calls.length>=2);for(const call of calls)assert.equal(call.options.headers?.['x-chempat-member-id'],'owner');f.w.eval('s=blank()');await f.w.connectionApi({action:'first',token:'b'.repeat(64),answers:[0,0,0,0,0]});assert.equal(f.server.calls.at(-1).options.headers?.['x-chempat-member-id'],undefined)}finally{f.close()}
});

test('legacy registration retries recover saved progress and preserve the active invitation draft',async()=>{
 for(const prospect of [false,true]){const f=await fixture();try{
  const canonical={...f.server.profiles.owner.profile,name:'Canonical Riley',photo:newPhoto,verified:true,answers:Array(10).fill(2)};
  f.server.intercept=c=>c.url==='/api/member'&&c.body?.action==='register'?reply({member:canonical}):c.url==='/api/connection'&&c.body?.action==='first'?reply({answers:[1,1,1,1,1]}):null;
  const own={name:'Old Taylor',contact:'owner@example.test',email:'owner@example.test',photo,answers:[0,0,0,0,0],agreed:true};
  if(prospect){f.w.eval(`s={...blank(),view:'revealPhoto',actor:'prospect',prospect:${JSON.stringify(own)},member:{name:'Morgan',photo,answers:[1,1,1,1,1]},liveInvite:true,liveToken:'token',liveId:'pair'};render()`.replace('photo,answers','photo:'+JSON.stringify(photo)+',answers'));await f.w.finishProspectRegistration();assert.equal(f.w.eval('s.prospect.name'),'Canonical Riley');assert.equal(f.w.eval('s.member.name'),'Morgan');assert.equal(f.server.calls.findLast(c=>c.body?.action==='first').body.photo,newPhoto);assert.deepEqual(copy(f.w.eval('s.prospect.answers')),[0,0,0,0,0])}
  else{f.w.eval(`s={...blank(),view:'landing',joinStep:2,member:${JSON.stringify(own)}};render()`);await f.w.finishRegistration();assert.equal(f.w.eval('s.member.name'),'Canonical Riley');assert.equal(f.w.eval('s.member.photo'),newPhoto);assert.deepEqual(copy(f.w.eval('s.member.answers')),Array(10).fill(2));assert.equal(f.w.eval('s.memberQuestionsOpen'),false);assert.equal(f.w.eval('s.phase'),'ready');assert.equal(f.d.querySelector('.quickChoices'),null)}
 }finally{f.close()}}
});

test('committed Save followed by Cancel updates only owner chrome without reopening or replacing dashboard input',async()=>{
 const f=await fixture();try{await f.open();changeName(f,'Saved Riley');imageMock(f);await upload(f);const hold=deferred();f.server.intercept=c=>c.url==='/api/member-profile'&&c.body?hold.promise:null;const pending=f.w.saveMemberProfile();f.w.cancelMemberProfile();const input=f.d.createElement('input');input.id='syntheticUnsent';input.value='Keep this unsent';f.d.querySelector('#root').append(input);input.focus();hold.resolve(reply({...f.server.profiles.owner,profile:{...f.server.profiles.owner.profile,name:'Saved Riley',photo:newPhoto,revision:revision(2)}}));await pending;assert.equal(f.w.eval('s.view'),'dashboard');assert.equal(f.w.eval('memberProfileDraft'),null);assert.equal(f.w.eval('s.account.name'),'Saved Riley');assert.match(f.d.querySelector('.navIdentity').textContent,/Saved/);assert.equal(f.d.querySelector('.navIdentity img').src,newPhoto);assert.equal(f.d.querySelector('.socialMemberIdentity img').src,newPhoto);assert.equal(f.d.querySelector('#syntheticUnsent'),input);assert.equal(f.d.activeElement,input);assert.equal(input.value,'Keep this unsent')}finally{f.close()}
});

test('closing a newer profile draft still disqualifies an older successful save response',async()=>{
 const f=await fixture();try{await f.open();changeName(f,'Old pending');const hold=deferred();f.server.intercept=c=>c.url==='/api/member-profile'&&c.body?hold.promise:null;const pending=f.w.saveMemberProfile();f.w.cancelMemberProfile();await f.open();changeName(f,'New cancelled draft');f.w.cancelMemberProfile();hold.resolve(reply({...f.server.profiles.owner,profile:{...f.server.profiles.owner.profile,name:'Old pending',revision:revision(2)}}));await pending;assert.equal(f.w.eval('s.account.name'),'Taylor');assert.equal(f.w.eval('s.view'),'dashboard');assert.equal(f.w.eval('memberProfileDraft'),null)}finally{f.close()}
});

test('back-forward cache restoration reloads a working canonical editor without restarting camera',async()=>{
 const f=await fixture();try{await f.open();changeName(f,'Unsaved before leaving');const cam=cameraMock(f);await f.w.openMemberProfileCamera();f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));assert.equal(f.w.eval('memberProfileDraft'),null);assert.ok(cam.stopped>=1);f.server.profiles.owner.profile={...f.server.profiles.owner.profile,name:'Saved elsewhere',revision:revision(2)};f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));await flush();assert.equal(f.d.querySelector('#memberProfileName').value,'Saved elsewhere');assert.equal(f.d.querySelector('#memberProfileCamera').hidden,true);assert.equal(cam.calls,1);changeName(f,'Ready again');await f.w.saveMemberProfile();assert.equal(f.server.profiles.owner.profile.name,'Ready again');assert.equal(f.posts()[0].body.profileRevision,revision(2))}finally{f.close()}
});

test('failed logout preserves an editable draft after closing the error dialog and leaves camera stopped',async()=>{
 const f=await fixture();try{await f.open();changeName(f,'Keep this draft');const cam=cameraMock(f);await f.w.openMemberProfileCamera();f.server.intercept=c=>c.url==='/api/member'&&c.body?.action==='logout'?reply({error:'Temporary failure'},503):null;f.w.confirmLogout();await f.w.logout();assert.match(f.d.querySelector('#logoutError').textContent,/Could not log out/);f.w.closeInvite();assert.equal(f.d.querySelector('#memberProfileName').value,'Keep this draft');assert.equal(f.d.querySelector('#memberProfileCamera').hidden,true);assert.ok(cam.stopped>=1);changeName(f,'Save after retry');await f.w.saveMemberProfile();assert.equal(f.server.profiles.owner.profile.name,'Save after retry')}finally{f.close()}
});
