import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {REWARD_ROUNDS} from '../api/_reward-rounds.mjs';

// Real application script in a synthetic DOM. No external network, real camera,
// email delivery, member records, or invitation mutations are used by this suite.
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const KEY='chempatibility.walkthrough.v7';
const photo='data:image/jpeg;base64,AA==',otherPhoto='data:image/jpeg;base64,AQ==',newPhoto='data:image/jpeg;base64,Ag==';
const five=[0,1,2,0,1],otherFive=[0,2,2,1,1],token='b'.repeat(64),pair='a'.repeat(64);
const copy=value=>JSON.parse(JSON.stringify(value));
const reply=(data,status=200)=>({ok:status<400,status,json:async()=>copy(data)});
const flush=async()=>{for(let count=0;count<5;count++)await new Promise(resolve=>setImmediate(resolve))};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const member=(id='viewer',extra={})=>({id,name:'Riley Viewer',contact:'riley@example.test',photo,answers:[...five],verified:true,...extra});
const invitation=(extra={})=>({id:pair,name:'Alex Inviter',photo:otherPhoto,answers:[],prospectName:'',prospectPhoto:'',prospectAnswers:[],status:'invited',messages:[],invitedAt:'2026-10-01T00:00:00Z',...extra});
const responder=(extra={})=>({view:'revealPhoto',actor:'prospect',phase:'awaitingPhoto',liveInvite:true,liveToken:token,liveId:pair,member:{name:'Alex Inviter',photo:otherPhoto,answers:[]},prospect:{name:'Riley',email:'riley@example.test',phone:'',photo:'',answers:[...five],agreed:false},...extra});

async function fixture({saved={},account=null,connections=[],intercept=null,invite=invitation()}={}){
 const dom=new JSDOM(html,{url:'https://responder.example.test/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
 const calls=[],errors=[],server={account,connections,intercept,invite,verifiedMember:null};
 w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLMediaElement.prototype.play=async()=>{};
 w.addEventListener('error',event=>{errors.push(event.error||event.message);event.preventDefault()});
 for(const [key,value] of Object.entries(saved))w.sessionStorage.setItem(key,typeof value==='string'?value:JSON.stringify(value));
 w.fetch=async(url,options={})=>{
  assert.ok(url.startsWith('/api/'),'only synthetic same-origin endpoints are allowed');
  const body=options.body?JSON.parse(options.body):null,call={url,body,options};calls.push(call);
  const handled=server.intercept?.(call);if(handled)return handled;
  if(url==='/api/member'){
   if(!body)return server.account?reply({member:server.account}):reply({},401);
   if(body.action==='register'){
    server.account=member('registered',{name:body.name,contact:body.contact,photo:body.photo,answers:body.answers});
    return reply({member:server.account});
   }
   if(body.action==='code_start')return reply({ok:true,challengeId:'00000000-0000-4000-8000-000000000001',expiresAt:new Date(Date.now()+600000).toISOString(),resendAt:new Date(Date.now()+60000).toISOString()});
   if(body.action==='code_verify'){server.account=server.verifiedMember||member('existing',{contact:body.email});return reply({existing:true,member:server.account})}
   if(body.action==='logout'){server.account=null;return reply({ok:true})}
  }
  if(url==='/api/connection?inbox=1')return reply({connections:server.connections});
  if(url.startsWith('/api/connection?invite='))return reply(server.invite);
  if(url==='/api/connection'&&body?.action==='first'){
   server.invite={...server.invite,status:'firstResults',answers:[...otherFive],prospectAnswers:[...body.answers],prospectPhoto:body.photo};
   return reply({ok:true,answers:[...otherFive]});
  }
  if(url.startsWith('/api/game-pieces'))return reply({pieces:[],pendingCount:0});
  if(url.startsWith('/api/discovery'))return reply({modules:[],games:[],pieces:[]});
  if(url==='/api/rewards?phoneRequests=1')return reply({phoneRequests:[]});
  if(url==='/api/rewards')return reply({level:1,rounds:REWARD_ROUNDS,answers:{},draftRevision:0,connections:[],phoneProfile:{phone:null,confirmedAt:null,revision:0}});
  if(url.startsWith('/api/rewards?'))return reply({eligible:false,phone:{eligible:false},steps:[]});
  if(url==='/api/wildcards?summary=1')return reply({connections:[]});
  if(url.startsWith('/api/wildcards'))return reply({cards:[],categories:[],eligible:false,remaining:0,limit:3});
  if(url.startsWith('/api/datecards'))return reply({cards:[],side:'member'});
  return reply({error:'Synthetic endpoint unavailable.'},503);
 };
 const script=d.createElement('script');script.textContent=source;d.body.append(script);await flush();
 if(errors.length){w.close();throw errors[0]}
 return {w,d,calls,errors,server,state:()=>JSON.parse(w.eval('JSON.stringify(s)')),mount(state=responder()){w.eval(`s={...blank(),...${JSON.stringify(state)}};render()`);return flush()},saved:()=>Object.fromEntries(Object.keys(w.sessionStorage).map(key=>[key,w.sessionStorage.getItem(key)])),posts:action=>calls.filter(call=>call.body&&(!action||call.body.action===action)),close:()=>w.close()};
}
function change(f,id,value){const input=f.d.getElementById(id);assert.ok(input,id+' is mounted');input.value=value;input.dispatchEvent(new f.w.Event('input',{bubbles:true}));return input}
function agree(f,value=true){const input=f.d.getElementById('newMemberAgree');input.checked=value;input.dispatchEvent(new f.w.Event('change',{bubbles:true}))}
function setPhoto(f,value=photo){f.w.eval(`s.prospect.photo=${JSON.stringify(value)};save();render()`) }
function upload(f,{type='image/png',size=500,name='self.png',input=f.d.getElementById('revealPhotoInput')}={}){Object.defineProperty(input,'files',{configurable:true,value:[{type,size,name}]});f.w.uploadResponderPhoto({currentTarget:input,target:input});return input}
function imageMock(f,{pending=false,fail=false,width=400,height=400}={}){
 const instances=[],revoked=[];let serial=0;
 f.w.URL.createObjectURL=()=>`blob:synthetic-responder-${++serial}`;f.w.URL.revokeObjectURL=url=>revoked.push(url);
 f.w.Image=class{constructor(){this.width=width;this.height=height;instances.push(this)}set src(value){this.url=value;if(!pending)queueMicrotask(()=>fail?this.onerror?.():this.onload?.())}};
 f.w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});f.w.HTMLCanvasElement.prototype.toDataURL=()=>newPhoto;
 return {instances,revoked};
}
function cameraMock(f,{pending=false,error=null}={}){
 let stopped=0,calls=0;const hold=deferred(),stream={getTracks:()=>[{stop(){stopped++}}]};
 Object.defineProperty(f.w.navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async options=>{calls++;assert.equal(options.audio,false);assert.equal(options.video.facingMode,'user');if(error)throw error;return pending?hold.promise:stream}}});
 return {hold,stream,get stopped(){return stopped},get calls(){return calls}};
}
async function ready(f){await f.mount();f.w.openResponderSetup();setPhoto(f);agree(f)}
function rawConnection({side='member',status='firstResults',kind='vibe',id=pair,name='Morgan Peer',peerPhoto=otherPhoto,answers=otherFive,ownAnswers=five}={}){
 return {id,side,status,kind,channel:kind==='friend'?'friend':'email',sender_name:side==='member'?'Riley Viewer':name,sender_photo:side==='member'?photo:peerPhoto,prospect_name:side==='member'?name:'Riley Viewer',prospect_photo:side==='member'?peerPhoto:photo,sender_answers:side==='member'?ownAnswers:answers,prospect_answers:side==='member'?answers:ownAnswers,own_answers:ownAnswers,messages:[],invitedAt:'2026-10-01T00:00:00Z',canBlock:true,canReport:true,claimed:true};
}
async function dashboard(f,connection,extra={}){
 f.server.account=member();f.server.connections=[connection];
 await f.mount({view:'dashboard',actor:'member',account:member(),member:member(),memberId:'viewer',liveMember:true,inbox:[connection],selectedChempat:connection.id,...extra});
}

test('completed-five entry displays exact inviter copy and performs no new request',async()=>{
 const f=await fixture();try{await f.mount();const count=f.calls.length;
  assert.equal(f.d.getElementById('responderEntryTitle').textContent,'There’s a reason you got this invite.');
  assert.equal(f.d.querySelector('.responderInviter b').textContent,'Alex');
  assert.equal(f.d.querySelector('.responderInviter img').getAttribute('src'),otherPhoto);
  assert.match(f.d.querySelector('.responderEntry').textContent,/Alex made the first move\. Add your photo, reveal your five, and find out what happens next\./);
  assert.equal(f.d.getElementById('responderContinue').textContent,'Show our chemistry →');
  assert.equal(f.d.getElementById('newMemberName'),null);assert.equal(f.d.querySelector('.quickChoices'),null);
  f.w.render();await flush();assert.equal(f.calls.length,count);assert.deepEqual(f.state().prospect.answers,five);assert.equal(f.posts().length,0);
 }finally{f.close()}
});
test('CTA, Camera and Choose photo open setup without registration or answer mutation',async()=>{
 for(const mode of ['cta','camera','file']){const f=await fixture();try{await f.mount();const media=cameraMock(f);let picked=0;f.w.HTMLInputElement.prototype.click=function(){if(this.type==='file')picked++};
   f.d.getElementById({cta:'responderContinue',camera:'responderCameraAction',file:'responderFileAction'}[mode]).click();await flush();
   assert.ok(f.d.querySelector('.responderSetupModal[aria-modal="true"]'));assert.ok(f.d.getElementById('newMemberAgree'));
   assert.equal(media.calls,mode==='camera'?1:0);assert.equal(picked,mode==='file'?1:0);assert.equal(f.posts().length,0);assert.deepEqual(f.state().prospect.answers,five);
   if(mode==='cta')assert.equal(f.d.activeElement.id,'responderSetupTitle');
  }finally{f.close()}}
});
test('name, email, consent and five survive rerender, Escape close and reopen',async()=>{
 const f=await fixture();try{await f.mount();const opener=f.d.getElementById('responderContinue');opener.focus();opener.click();
  change(f,'newMemberName','Riley Changed');change(f,'newMemberContact','changed@example.test');agree(f);f.w.render();
  assert.equal(f.d.getElementById('newMemberAgree').checked,true);assert.equal(f.d.getElementById('newMemberName').value,'Riley Changed');
  f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.state().modal,'');assert.equal(f.d.querySelector('.responderSetupModal'),null);
  assert.equal(f.d.activeElement.id,'responderContinue');f.w.openResponderSetup();
  assert.equal(f.d.getElementById('newMemberName').value,'Riley Changed');assert.equal(f.d.getElementById('newMemberContact').value,'changed@example.test');assert.equal(f.d.getElementById('newMemberAgree').checked,true);
  assert.deepEqual(f.state().prospect.answers,five);assert.equal(f.posts().length,0);
  const stored=JSON.parse(f.w.sessionStorage.getItem(KEY));assert.deepEqual(stored.prospect.answers,five);assert.equal(stored.prospect.agreed,true);
 }finally{f.close()}
});
test('backdrop closes only outside the dialog and keyboard focus stays inside setup',async()=>{
 const f=await fixture();try{await f.mount();f.w.openResponderSetup();
  f.d.getElementById('newMemberName').click();assert.equal(f.state().modal,'responderSetup');
  const first=f.d.querySelector('.responderSetupModal .close'),last=f.d.getElementById('responderSubmit');
  last.focus();f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(f.d.activeElement,first);
  first.focus();f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(f.d.activeElement,last);
  f.d.querySelector('.modalBackdrop').click();assert.equal(f.state().modal,'');assert.deepEqual(f.state().prospect.answers,five);
 }finally{f.close()}
});
test('photo, email and adult/terms consent remain required before registration',async()=>{
 const f=await fixture();try{await f.mount();f.w.openResponderSetup();await f.w.finishProspectRegistration();assert.match(f.d.getElementById('revealPhotoError').textContent,/picture/);
  setPhoto(f);change(f,'newMemberContact','bad');await f.w.finishProspectRegistration();assert.match(f.d.getElementById('revealPhotoError').textContent,/email/);
  change(f,'newMemberContact','riley@example.test');await f.w.finishProspectRegistration();assert.match(f.d.getElementById('revealPhotoError').textContent,/18 or older/);
  assert.ok(f.d.querySelector('#newMemberAgree').closest('label').querySelector('a[href="/terms"]'));assert.ok(f.d.querySelector('#newMemberAgree').closest('label').querySelector('a[href="/privacy"]'));assert.equal(f.posts().length,0);
 }finally{f.close()}
});
test('image validation and decode failure keep the prior photo, details and five',async()=>{
 const f=await fixture();try{await ready(f);const images=imageMock(f,{fail:true});change(f,'newMemberName','Preserved');
  upload(f,{type:'text/plain'});assert.match(f.d.getElementById('revealPhotoError').textContent,/image file/);assert.equal(images.instances.length,0);
  upload(f,{size:10*1024*1024+1});assert.match(f.d.getElementById('revealPhotoError').textContent,/10 MB/);assert.equal(images.instances.length,0);
  upload(f);await flush();assert.match(f.d.getElementById('revealPhotoError').textContent,/Could not open/);assert.equal(images.revoked.length,1);
  assert.equal(f.state().prospect.photo,photo);assert.equal(f.d.getElementById('newMemberName').value,'Preserved');assert.equal(f.d.getElementById('newMemberAgree').checked,true);assert.deepEqual(f.state().prospect.answers,five);assert.equal(f.posts().length,0);
 }finally{f.close()}
});
test('a chosen photo previews locally, revokes its URL, and retains all setup fields',async()=>{
 const f=await fixture();try{await ready(f);const images=imageMock(f);change(f,'newMemberName','Photo Draft');change(f,'newMemberContact','photo@example.test');upload(f);await flush();
  assert.equal(f.state().prospect.photo,newPhoto);assert.equal(f.d.querySelector('.responderPhotoPreview img').getAttribute('src'),newPhoto);assert.equal(images.revoked.length,1);
  assert.equal(f.d.getElementById('newMemberName').value,'Photo Draft');assert.equal(f.d.getElementById('newMemberContact').value,'photo@example.test');assert.equal(f.d.getElementById('newMemberAgree').checked,true);assert.deepEqual(f.state().prospect.answers,five);assert.equal(f.posts().length,0);
 }finally{f.close()}
});
test('camera denial leaves a usable photo fallback without losing answers or consent',async()=>{
 const f=await fixture();try{await ready(f);cameraMock(f,{error:Object.assign(Error('Denied'),{name:'NotAllowedError'})});await f.w.openResponderCamera();
  assert.match(f.d.getElementById('revealPhotoError').textContent,/Camera access was blocked/);assert.ok(f.d.getElementById('revealPhotoInput'));assert.equal(f.d.getElementById('newMemberAgree').checked,true);assert.deepEqual(f.state().prospect.answers,five);assert.equal(f.posts().length,0);
 }finally{f.close()}
});
test('capture previews a photo and immediately stops the camera without submitting',async()=>{
 const f=await fixture();try{await ready(f);const camera=cameraMock(f);imageMock(f);await f.w.openResponderCamera();const video=f.d.getElementById('responderCamera');Object.defineProperties(video,{videoWidth:{value:640},videoHeight:{value:480}});f.w.captureResponderPhoto();
  assert.equal(camera.stopped,1);assert.equal(f.state().prospect.photo,newPhoto);assert.equal(f.w.eval('currentResponderSetup().stream'),null);assert.equal(f.d.getElementById('newMemberAgree').checked,true);assert.deepEqual(f.state().prospect.answers,five);assert.equal(f.posts().length,0);
 }finally{f.close()}
});
test('late camera permission after close, navigation or pagehide cannot attach a stream',async()=>{
 for(const leave of ['close','navigate','pagehide']){const f=await fixture();try{await ready(f);const camera=cameraMock(f,{pending:true}),starting=f.w.openResponderCamera();
   if(leave==='close')f.w.closeInvite();else if(leave==='navigate')f.w.navigate('invitee','prospect');else f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));
   camera.hold.resolve(camera.stream);await starting;assert.equal(camera.stopped,1);assert.equal(f.state().prospect.photo,photo);assert.deepEqual(f.state().prospect.answers,five);assert.equal(f.d.querySelector('#responderCamera')?.srcObject||null,null);assert.equal(f.posts().length,0);
  }finally{f.close()}}
});
test('late image decode after close or navigation is discarded and URL is released',async()=>{
 for(const leave of ['close','navigate']){const f=await fixture();try{await ready(f);const images=imageMock(f,{pending:true});upload(f);const image=images.instances[0],queuedLoad=image.onload;
   if(leave==='close')f.w.closeInvite();else f.w.navigate('invitee','prospect');queuedLoad();await flush();
   assert.equal(f.state().prospect.photo,photo);assert.deepEqual(f.state().prospect.answers,five);assert.ok(images.revoked.includes(image.url));assert.equal(f.d.querySelector('.responderSetupModal'),null);assert.equal(f.posts().length,0);assert.equal(f.errors.length,0);
  }finally{f.close()}}
});
test('an older decode cannot overwrite a newer photo selection',async()=>{
 const f=await fixture();try{await ready(f);const images=imageMock(f,{pending:true});upload(f);const oldLoad=images.instances[0].onload;upload(f,{name:'newer.png'});images.instances[1].onload();f.w.HTMLCanvasElement.prototype.toDataURL=()=>otherPhoto;oldLoad();
  assert.equal(f.state().prospect.photo,newPhoto);assert.deepEqual(f.state().prospect.answers,five);assert.equal(f.posts().length,0);assert.ok(images.revoked.includes(images.instances[0].url));assert.ok(images.revoked.includes(images.instances[1].url));
 }finally{f.close()}
});
test('repeat registration clicks produce one registration and one first-five write',async()=>{
 const held=deferred(),f=await fixture({intercept:call=>call.body?.action==='register'?held.promise:null});try{await ready(f);const saving=f.w.finishProspectRegistration();await f.w.finishProspectRegistration();assert.equal(f.posts('register').length,1);assert.equal(f.d.getElementById('responderSubmit').disabled,true);
  held.resolve(reply({member:member('registered')}));await saving;await flush();
  assert.equal(f.posts('register').length,1);assert.equal(f.posts('first').length,1);assert.deepEqual(f.posts('register')[0].body.answers,five);assert.deepEqual(f.posts('first')[0].body.answers,five);assert.equal(f.posts('register')[0].body.agreed,true);
  assert.equal(f.state().view,'results');assert.equal(f.state().modal,'');assert.deepEqual(f.state().prospect.answers,five);assert.equal(f.d.querySelectorAll('.revealItem').length,5);
 }finally{f.close()}
});
test('closing setup while registration is pending prevents a late reveal or automatic replay',async()=>{
 const held=deferred(),f=await fixture({intercept:call=>call.body?.action==='register'?held.promise:null});try{await ready(f);const saving=f.w.finishProspectRegistration();f.w.closeInvite();held.resolve(reply({member:member('registered')}));await saving;await flush();
  assert.equal(f.state().view,'revealPhoto');assert.equal(f.state().modal,'');assert.equal(f.posts('first').length,0);assert.deepEqual(f.state().prospect.answers,five);assert.equal(f.d.querySelector('.responderSetupModal'),null);
 }finally{f.close()}
});
test('closing after registration while first-five save is pending does not reopen the reveal',async()=>{
 const held=deferred(),f=await fixture({intercept:call=>call.body?.action==='first'?held.promise:null});try{await ready(f);const saving=f.w.finishProspectRegistration();await flush();assert.equal(f.posts('first').length,1);f.w.closeInvite();held.resolve(reply({answers:otherFive}));await saving;await flush();
  assert.equal(f.state().view,'revealPhoto');assert.equal(f.state().modal,'');assert.deepEqual(f.state().prospect.answers,five);assert.equal(f.posts('register').length,1);assert.equal(f.posts('first').length,1);
 }finally{f.close()}
});
test('a newer authentication epoch rejects a delayed registration response',async()=>{
 const held=deferred(),f=await fixture({intercept:call=>call.body?.action==='register'?held.promise:null});try{await ready(f);const saving=f.w.finishProspectRegistration();f.w.eval('authEpoch++');held.resolve(reply({member:member('registered')}));await saving;
  assert.equal(f.state().prospectId,'');assert.equal(f.posts('first').length,0);assert.equal(f.state().view,'revealPhoto');assert.deepEqual(f.state().prospect.answers,five);
 }finally{f.close()}
});
test('foreground recovery after cookie commit retains responder role and inviter identity',async()=>{
 const held=deferred(),f=await fixture({intercept:call=>call.body?.action==='register'?held.promise:null});try{await ready(f);const saving=f.w.finishProspectRegistration();
  // The server has committed the registration cookie, but its response has not
  // reached this page when the device leaves and returns to the app.
  f.server.account=member('registered');f.w.holdSession();await f.w.resumeMember();await flush();
  assert.equal(f.state().actor,'prospect');assert.equal(f.state().member.name,'Alex Inviter');assert.equal(f.state().prospectId,'registered');assert.equal(f.state().liveToken,token);assert.deepEqual(f.state().prospect.answers,five);
  assert.equal(f.d.querySelector('.responderInviter b').textContent,'Alex');assert.equal(f.posts('first').length,0);
  held.resolve(reply({member:f.server.account}));await saving;assert.equal(f.posts('first').length,0);assert.equal(f.state().view,'revealPhoto');
  if(f.state().modal!=='responderSetup')f.w.openResponderSetup();await f.w.finishProspectRegistration();await flush();assert.equal(f.posts('register').length,1);assert.equal(f.posts('first').length,1);assert.equal(f.state().view,'results');
 }finally{f.close()}
});
test('a closed setup stays closed when foreground recovers its committed registration cookie',async()=>{
 const held=deferred(),f=await fixture({intercept:call=>call.body?.action==='register'?held.promise:null});try{await ready(f);const saving=f.w.finishProspectRegistration();f.server.account=member('registered');f.w.closeInvite();
  f.w.holdSession();await f.w.resumeMember();await flush();assert.equal(f.state().actor,'prospect');assert.equal(f.state().member.name,'Alex Inviter');assert.equal(f.state().prospectId,'registered');assert.deepEqual(f.state().prospect.answers,five);assert.equal(f.state().liveToken,token);assert.equal(f.state().view,'revealPhoto');assert.equal(f.state().modal,'');assert.equal(f.d.querySelector('.responderSetupModal'),null);
  held.resolve(reply({member:f.server.account}));await saving;assert.equal(f.posts('first').length,0);assert.equal(f.state().modal,'');f.w.openResponderSetup();await f.w.finishProspectRegistration();assert.equal(f.posts('register').length,1);assert.equal(f.posts('first').length,1);assert.equal(f.state().view,'results');
 }finally{f.close()}
});
test('a different foreground cookie clears the old setup while invitation authorization is pending',async()=>{
 const held=deferred(),f=await fixture();try{await ready(f);f.server.account=member('different',{contact:'different@example.test',answers:[2,2,2,2,2]});f.server.intercept=call=>call.url.startsWith('/api/connection?invite=')?held.promise:null;
  f.w.holdSession();const resuming=f.w.resumeMember();await flush();assert.ok(f.calls.some(call=>call.url.includes('?invite='+token)),'new account must reauthorize this invitation');
  const oldSetup=f.d.querySelector('.responderSetupModal');assert.ok(!oldSetup||oldSetup.closest('[hidden],[inert]'),'old setup must stay unavailable during authorization');assert.notDeepEqual(f.state().prospect.answers,five);assert.equal(f.posts('first').length,0);
  held.resolve(reply({error:'This invitation is for another account.'},403));await resuming;await flush();assert.equal(f.state().view,'inviteAuth');assert.equal(f.d.querySelector('.responderSetupModal'),null);assert.equal(f.state().account.contact,'different@example.test');assert.deepEqual(f.server.account.answers,[2,2,2,2,2]);assert.equal(f.posts().length,0);
 }finally{f.close()}
});
test('submission waits for the newly selected photo instead of saving an older preview',async()=>{
 const f=await fixture();try{await ready(f);const images=imageMock(f,{pending:true});upload(f);await f.w.finishProspectRegistration();
  assert.equal(f.posts('register').length,0);assert.equal(f.posts('first').length,0);images.instances[0].onload();await flush();await f.w.finishProspectRegistration();
  assert.equal(f.posts('register').length,1);assert.equal(f.posts('register')[0].body.photo,newPhoto);assert.equal(f.posts('first')[0].body.photo,newPhoto);assert.equal(f.state().view,'results');
 }finally{f.close()}
});
test('replacing the account closes setup and stops an already active camera',async()=>{
 const f=await fixture();try{await ready(f);const camera=cameraMock(f);await f.w.openResponderCamera();assert.equal(camera.stopped,0);
  const replacement=member('different',{contact:'different@example.test',name:'Casey Different'});f.server.account=replacement;f.w.openPage(replacement);await flush();
  assert.equal(camera.stopped,1);assert.equal(f.w.eval('currentResponderSetup()'),null);assert.equal(f.d.querySelector('.responderSetupModal'),null);assert.equal(f.state().account.id,'different');assert.equal(f.posts('first').length,0);
 }finally{f.close()}
});
test('existing-email verification keeps this invitation and five without replaying registration',async()=>{
 const f=await fixture({intercept:call=>call.body?.action==='register'?reply({exists:true,error:'That email already has a page.'},409):null});try{await ready(f);f.server.verifiedMember=member('existing',{answers:[2,2,2,2,2],name:'Existing Riley'});
  await f.w.finishProspectRegistration();await flush();assert.equal(f.state().modal,'verifyEmail');assert.equal(f.posts('first').length,0);
  f.d.getElementById('verifyEmailCode').value='123456';await f.w.confirmVerify();await flush();
  assert.equal(f.state().liveToken,token);assert.equal(f.state().view,'revealPhoto');assert.deepEqual(f.state().prospect.answers,five);assert.equal(f.state().prospectId,'existing');assert.equal(f.posts('register').length,1);assert.equal(f.posts('first').length,0);
  if(f.state().modal!=='responderSetup')f.w.openResponderSetup();await f.w.finishProspectRegistration();await flush();
  assert.equal(f.posts('register').length,1);assert.equal(f.posts('first').length,1);assert.deepEqual(f.posts('first')[0].body.answers,five);assert.equal(f.state().view,'results');assert.deepEqual(f.server.account.answers,[2,2,2,2,2]);
 }finally{f.close()}
});
test('recovered account identity is read-only and edited contact is rejected before saving',async()=>{
 const f=await fixture({intercept:call=>call.body?.action==='register'?reply({exists:true,error:'That email already has a page.'},409):null});try{await ready(f);f.server.verifiedMember=member('existing');await f.w.finishProspectRegistration();await flush();f.d.getElementById('verifyEmailCode').value='123456';await f.w.confirmVerify();await flush();
  assert.equal(f.d.getElementById('newMemberName').readOnly,true);assert.equal(f.d.getElementById('newMemberContact').readOnly,true);
  // Force a stale/programmatic DOM value too: the write guard must enforce the
  // same identity binding, rather than relying solely on readonly presentation.
  f.d.getElementById('newMemberContact').value='different@example.test';await f.w.finishProspectRegistration();
  assert.equal(f.posts('first').length,0);assert.equal(f.posts('register').length,1);assert.equal(f.state().account.contact,'riley@example.test');assert.equal(f.state().prospect.email,'riley@example.test');assert.equal(f.state().view,'revealPhoto');assert.ok(f.d.getElementById('revealPhotoError').textContent);
 }finally{f.close()}
});
test('refresh during existing-email verification retains the invitation draft without resending',async()=>{
 const f=await fixture({intercept:call=>call.body?.action==='register'?reply({exists:true,error:'That email already has a page.'},409):null});let restored;
 try{await ready(f);change(f,'newMemberName','Draft Before Refresh');await f.w.finishProspectRegistration();await flush();assert.equal(f.state().modal,'verifyEmail');
  restored=await fixture({saved:f.saved()});restored.server.verifiedMember=member('existing',{answers:[2,2,2,2,2],name:'Existing Riley'});
  assert.equal(restored.posts().length,0);assert.ok(restored.d.getElementById('verifyEmailCode'));assert.equal(restored.d.getElementById('verifyEmailCode').value,'');assert.deepEqual(restored.state().prospect.answers,five);
  restored.d.getElementById('verifyEmailCode').value='123456';await restored.w.confirmVerify();await flush();
  assert.equal(restored.state().liveToken,token);assert.equal(restored.state().view,'revealPhoto');assert.equal(restored.state().modal,'responderSetup');assert.deepEqual(restored.state().prospect.answers,five);assert.equal(restored.state().prospectId,'existing');
  assert.deepEqual(restored.posts().map(call=>call.body.action),['code_verify']);assert.equal(restored.d.getElementById('newMemberAgree').checked,true);assert.deepEqual(restored.server.account.answers,[2,2,2,2,2]);
 }finally{f.close();restored?.close()}
});
test('a different verified email never inherits the responder draft or auto-submits it',async()=>{
 const f=await fixture({intercept:call=>call.body?.action==='register'?reply({exists:true,error:'That email already has a page.'},409):null});try{await ready(f);f.server.verifiedMember=member('different',{contact:'different@example.test',answers:[2,2,2,2,2]});await f.w.finishProspectRegistration();await flush();
  f.d.getElementById('verifyEmailCode').value='123456';await f.w.confirmVerify();await flush();
  assert.equal(f.d.querySelector('.responderSetupModal'),null);assert.equal(f.posts('first').length,0);assert.equal(f.posts('register').length,1);assert.deepEqual(f.server.account.answers,[2,2,2,2,2]);assert.equal(f.state().account.contact,'different@example.test');assert.notDeepEqual(f.state().prospect.answers,five);
 }finally{f.close()}
});
test('Our Secrets uses viewer-left identity in sent and received connection directions',async()=>{
 for(const side of ['member','prospect']){const f=await fixture();try{await dashboard(f,rawConnection({side}));const originalPhoto=f.server.account.photo;f.w.selectChempat(pair,true);await flush();
   const people=[...f.d.querySelectorAll('#connectionPanel .secretPerson')];assert.equal(people.length,2);assert.equal(people[0].dataset.secretPerson,'self');assert.equal(people[1].dataset.secretPerson,'other');
   assert.equal(people[0].querySelector('h2').textContent,'Riley');assert.equal(people[1].querySelector('h2').textContent,'Morgan');assert.equal(people[0].querySelector('img').getAttribute('src'),originalPhoto);assert.equal(people[1].querySelector('img').getAttribute('src'),otherPhoto);
   assert.equal(people[0].querySelector('small').textContent,'Here’s my five.');assert.equal(people[1].querySelector('small').textContent,'See where we click.');assert.equal(f.d.querySelectorAll('.secretCompare').length,5);assert.equal(f.posts().length,0);
   assert.ok(!f.calls.some(call=>/member-profile|connection-photo|reward-directory/.test(call.url)),'paired header must reuse authorized identity data');
  }finally{f.close()}}
});
test('Our Secrets reserves separate grid rows for identities and the complete Date ideas controls',async()=>{
 const f=await fixture();try{await dashboard(f,rawConnection({status:'chat'}));f.w.selectChempat(pair,true);await flush();
  const style=f.d.createElement('style');style.textContent=fs.readFileSync(new URL('../site.css',import.meta.url),'utf8');f.d.head.append(style);
  const header=f.d.querySelector('#connectionPanel .secretsFocusHeader'),people=header.querySelector('.secretPeople'),actions=header.querySelector('.activeConnectionActions'),meta=header.querySelector('.secretConnectionMeta');
  assert.deepEqual([...header.children],[people,actions,meta]);assert.equal(people.querySelectorAll(':scope>.secretPerson').length,2);
  assert.ok(actions.querySelector('.dateIdeasToggle'),'the wider Date ideas button must share the controls row');assert.ok(actions.querySelector('.connectionMenuTrigger'));assert.equal(people.querySelector('button'),null);
  const css=node=>f.w.getComputedStyle(node),compact=value=>value.replace(/\s/g,'');
  assert.equal(css(header).display,'grid');assert.equal(compact(css(header).gridTemplateColumns),'minmax(0,1fr)auto');assert.equal(compact(css(people).gridColumn),'1/-1');assert.equal(compact(css(people).gridTemplateColumns),'minmax(0,1fr)minmax(0,1fr)');
  assert.equal(css(actions).position,'static');assert.equal(css(actions).gridRow,'2');assert.equal(css(actions).gridColumn,'2');assert.equal(css(actions).flexWrap,'wrap');assert.equal(css(meta).gridRow,'2');assert.equal(css(meta).gridColumn,'1');assert.equal(css(meta).minWidth,'0px');assert.equal(css(people.lastElementChild).paddingRight,'0px');
  // JSDOM does not lay out pixels or evaluate viewport media queries. Exercise
  // the authored narrow-screen override explicitly as a CSS/DOM contract.
  const narrow=[...style.sheet.cssRules].find(rule=>rule.media&&/max-width\s*:\s*380px/.test(rule.conditionText)&&[...rule.cssRules].some(child=>child.selectorText==='.socialWorkspace .secretsFocusHeader'));
  assert.ok(narrow,'very narrow screens must move controls below metadata');const override=f.d.createElement('style');override.textContent=[...narrow.cssRules].map(rule=>rule.cssText).join('\n');f.d.head.append(override);
  assert.equal(compact(css(header).gridTemplateColumns),'minmax(0,1fr)');assert.equal(css(actions).gridRow,'3');assert.equal(css(actions).gridColumn,'1');assert.equal(css(actions).position,'static');assert.equal(css(meta).gridRow,'2');
  f.w.selectPrivateChat(pair);assert.equal(f.d.querySelector('.secretsFocusHeader'),null);assert.equal(css(f.d.querySelector('#connectionPanel .focusHeader')).display,'flex');assert.equal(f.posts().length,0);
 }finally{f.close()}
});
test('original live-invitation prospect also remains viewer-left',async()=>{
 const f=await fixture();try{f.server.account=member();await f.mount(responder({view:'dashboard',phase:'firstResults',prospectId:'viewer',prospectVerified:true,prospect:{...member(),email:member().contact,phone:'',agreed:true},member:{name:'Alex Inviter',photo:otherPhoto,answers:otherFive},selectedChempat:'first',pairOwnAnswers:five}));f.w.selectChempat('first',true);
  assert.equal(f.d.querySelector('[data-secret-person="self"] h2').textContent,'Riley');assert.equal(f.d.querySelector('[data-secret-person="other"] h2').textContent,'Alex');assert.equal(f.d.querySelector('[data-secret-person="self"] img').getAttribute('src'),photo);assert.equal(f.d.querySelector('[data-secret-person="other"] img').getAttribute('src'),otherPhoto);assert.equal(f.posts().length,0);
 }finally{f.close()}
});
test('selected connection supplies counterpart photo and missing photos use initials safely',async()=>{
 const first=rawConnection(),second=rawConnection({id:'c'.repeat(64),name:'Casey Next',peerPhoto:newPhoto}),f=await fixture();try{await dashboard(f,first,{inbox:[first,second]});f.server.connections=[first,second];f.w.selectChempat(first.id,true);f.w.selectChempat(second.id,true);
  assert.equal(f.d.querySelector('[data-secret-person="other"] h2').textContent,'Casey');assert.equal(f.d.querySelector('[data-secret-person="other"] img').getAttribute('src'),newPhoto);
  f.w.eval(`s.inbox[1].prospect_photo='https://external.example/private.jpg';s.inbox[1].prospect_name='<img src=x onerror=alert(1)>';selectChempat('${second.id}',true)`);
  const other=f.d.querySelector('[data-secret-person="other"]');assert.equal(other.querySelector('img'),null);assert.ok(other.textContent.includes('<img'));assert.equal(f.posts().length,0);
 }finally{f.close()}
});
test('answer alignment, agreement colors and unrevealed-answer gate are unchanged',async()=>{
 const own=[0,1,2,0,1],theirs=[0,2,2,1,1],f=await fixture();try{await dashboard(f,rawConnection({ownAnswers:own,answers:theirs}));f.w.selectChempat(pair,true);
  const rows=[...f.d.querySelectorAll('.secretCompare')];assert.equal(rows.length,5);
  rows.forEach((row,index)=>{const answers=[...row.querySelectorAll('.secretAnswers span')];assert.equal(answers[0].classList.contains('agree'),own[index]===theirs[index]);assert.equal(answers[1].classList.contains('agree'),own[index]===theirs[index]);assert.equal(answers[0].textContent,f.w.eval(`QUESTIONS[${index}].a[${own[index]}]`));assert.equal(answers[1].textContent,f.w.eval(`QUESTIONS[${index}].a[${theirs[index]}]`))});
  f.w.eval("s.inbox[0].status='invited';s.inbox[0].prospect_answers=[];selectChempat('"+pair+"',true)");assert.equal(f.d.querySelectorAll('.secretCompare').length,0);assert.match(f.d.querySelector('.focusStatus').textContent,/unlock your first five/);assert.equal(f.d.querySelectorAll('.secretPerson').length,2);assert.equal(f.posts().length,0);
 }finally{f.close()}
});
test('Private Chat retains its single counterpart header and Friends never gain Our Secrets',async()=>{
 const f=await fixture();try{await dashboard(f,rawConnection({status:'chat'}));f.w.selectChempat(pair,true);assert.ok(f.d.querySelector('.secretPeople'));f.w.selectPrivateChat(pair);
  assert.equal(f.d.querySelector('.secretPeople'),null);assert.equal(f.d.querySelectorAll('#connectionPanel .focusHeader .focusIdentity').length,1);assert.equal(f.d.querySelector('#connectionName').textContent,'Morgan');assert.ok(f.d.querySelector('.inlineChat'));
  const friend=rawConnection({kind:'friend',status:'chat',answers:[],ownAnswers:[]});await dashboard(f,friend);f.w.selectChempat(pair,true);
  assert.equal(f.state().secretsFor,'');assert.equal(f.d.querySelector('.secretPeople'),null);assert.equal(f.d.querySelector('.secretsButton'),null);assert.ok(f.d.querySelector('.inlineChat'));assert.equal(f.posts().length,0);
 }finally{f.close()}
});
