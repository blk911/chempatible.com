import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

// Synthetic DOM, account cookies and email responses only. No external network.
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const KEY='chempatibility.walkthrough.v7',AUTH='duhwild.pending-auth.v1';
const member=(id='owner',extra={})=>({id,name:'Taylor',contact:id+'@example.test',photo:'data:image/jpeg;base64,AA==',answers:[],verified:true,...extra});
const reply=(body,status=200)=>({ok:status<400,status,json:async()=>JSON.parse(JSON.stringify(body))});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r))};
function fixture({saved={},account=null,intercept=null,storagePressure=false,url='https://auth.example.test/'}={}){
 const dom=new JSDOM(html,{url,runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document,calls=[];
 w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLMediaElement.prototype.play=async()=>{};
 for(const [key,value] of Object.entries(saved))w.sessionStorage.setItem(key,typeof value==='string'?value:JSON.stringify(value));
 const server={account,intercept,challenge:0,emailVerified:false};
 if(storagePressure){const original=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(key,value){if(key===KEY||key===AUTH&&this.getItem(KEY))throw new w.DOMException('Storage full','QuotaExceededError');return original.call(this,key,value)}}
 w.fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):null,call={url,body,options};calls.push(call);
  const handled=server.intercept?.(call);if(handled)return handled;
  if(url==='/api/member'){
   if(!body)return server.account?reply({member:server.account}):reply({error:'No member.'},401);
   if(body.action==='code_start'){server.challenge++;return reply({ok:true,challengeId:'00000000-0000-4000-8000-'+String(server.challenge).padStart(12,'0'),expiresAt:new Date(Date.now()+600000).toISOString(),resendAt:new Date(Date.now()+60000).toISOString()})}
   if(body.action==='code_verify'){server.account=member(body.email.split('@')[0]);return reply({existing:true,member:server.account})}
   if(body.action==='logout'){server.account=null;return reply({ok:true})}
  }
  if(url==='/api/email'){
   if(!body)return reply({email:server.emailVerified?server.account?.contact:null});
   if(body.action==='start')return reply({ok:true,challengeId:'00000000-0000-4000-8000-999999999999',expiresAt:new Date(Date.now()+600000).toISOString(),resendAt:new Date(Date.now()+60000).toISOString()});
   if(body.action==='verify'){server.emailVerified=true;return reply({ok:true})}
   if(body.action==='send')return reply({ok:true,id:'sent-invitation'});
  }
  if(url==='/api/connection?inbox=1')return reply({connections:[]});
  if(url==='/api/member-profile')return reply({profile:{...server.account,revision:'a'.repeat(64)},discovery:{listed:false,eligible:false}});
  if(url.startsWith('/api/friend?'))return reply({kind:'friend',status:'invited',name:'Inviter',requiresSignIn:!server.account});
  if(url.startsWith('/api/connection?invite='))return reply({requiresSignIn:true});
  if(url.startsWith('/api/game-pieces'))return reply({pieces:[],pendingCount:0});
  if(url.startsWith('/api/discovery'))return reply({modules:[],games:[]});
  if(url==='/api/rewards?phoneRequests=1')return reply({phoneRequests:[]});
  if(url==='/api/wildcards?summary=1')return reply({connections:[]});
  return reply({},503);
 };
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 return {w,d,server,calls,state:()=>JSON.parse(w.eval('JSON.stringify(s)')),saved:()=>Object.fromEntries(Object.keys(w.sessionStorage).map(key=>[key,w.sessionStorage.getItem(key)])),close:()=>w.close(),async start(email='owner@example.test'){await flush();w.showSignin();d.getElementById('signinEmail').value=email;await w.signinStart()},get posts(){return calls.filter(c=>c.body)}};
}
function cached(extra={}){return {view:'dashboard',actor:'member',account:member(),member:member(),memberId:'owner',liveMember:true,...extra}}
function pending(extra={}){return {version:1,purpose:'signin',email:'owner@example.test',challengeId:'00000000-0000-4000-8000-000000000001',expiresAt:Date.now()+600000,resendAt:Date.now()+60000,context:{view:'landing',actor:'member',name:'',agreed:false,friendToken:'',pendingVibeToken:'',liveToken:'',returnModal:''},...extra}}

test('every startup checks cookie before cached identity, including an empty saved name',async()=>{
 for(const name of ['Taylor','']){const hold=deferred(),f=fixture({saved:{[KEY]:cached({member:member('owner',{name})})},account:member('owner',{name:''}),intercept:c=>c.url==='/api/member'&&!c.body?hold.promise:null});
  try{assert.equal(f.calls.length,1);assert.equal(f.d.querySelector('#root').hidden,true);assert.equal(f.d.querySelector('#signinEmail'),null);assert.doesNotMatch(f.d.querySelector('#root').textContent,/Taylor/);hold.resolve(reply({member:member('owner',{name:''})}));await flush();assert.equal(f.state().memberId,'owner');assert.equal(f.state().view,'dashboard');assert.equal(f.d.querySelector('#root').hidden,false);assert.equal(f.d.querySelector('#authStatus'),null)}finally{f.close()}}
});
test('a cookie restores the account despite an interrupted signup name and no local ID',async()=>{
 const f=fixture({saved:{[KEY]:{view:'landing',member:member('draft',{name:'Unfinished'})}},account:member()});try{await flush();assert.equal(f.state().view,'dashboard');assert.equal(f.state().memberId,'owner');assert.equal(f.state().member.name,'Taylor')}finally{f.close()}
});
test('pending sign-in survives refresh without walkthrough or storing the entered code',async()=>{
 const f=fixture();let restored;try{await f.start();f.d.querySelector('#signinCode').value='654321';const saved=f.saved();assert.ok(saved[AUTH]);assert.ok(saved[AUTH].length<1500);assert.ok(!JSON.stringify(saved).includes('654321'));restored=fixture({saved:{[AUTH]:saved[AUTH]}});await flush();assert.equal(restored.d.querySelector('#signinCode').value,'');assert.match(restored.d.querySelector('#root').textContent,/owner@example.test/);assert.equal(restored.posts.length,0);restored.d.querySelector('#signinCode').value='123456';await restored.w.signinVerify();assert.equal(restored.posts.at(-1).body.challengeId,JSON.parse(saved[AUTH]).challengeId);assert.equal(restored.w.sessionStorage.getItem(AUTH),null);assert.equal(restored.state().memberId,'owner')}finally{f.close();restored?.close()}
});
test('small pending record survives full walkthrough quota with signup and invitation context',async()=>{
 const token='f'.repeat(64),f=fixture({saved:{[KEY]:{view:'landing',member:{name:'',contact:'',photo:'large cached data',answers:[],agreed:false}}},storagePressure:true});let restored;
 try{await flush();f.w.eval("s.friendToken='"+token+"';s.friendChoice='accept'");f.d.querySelector('#joinName').value='Riley';f.d.querySelector('#joinContact').value='riley@example.test';f.d.querySelector('#joinAgree').checked=true;f.w.nextJoinStep();await flush();const record=f.w.sessionStorage.getItem(AUTH);assert.ok(record);assert.equal(f.w.sessionStorage.getItem(KEY),null);assert.ok(!record.includes('large cached data'));restored=fixture({saved:{[AUTH]:record}});await flush();assert.equal(restored.state().joinStep,'joinCode');assert.equal(restored.state().member.name,'Riley');assert.equal(restored.state().member.agreed,true);assert.equal(restored.state().friendToken,token);assert.equal(restored.posts.length,0)}finally{f.close();restored?.close()}
});
test('Gmail return rechecks cookie and keeps pending code without another send',async()=>{
 const f=fixture();try{await f.start();const count=f.posts.length;Object.defineProperty(f.d,'hidden',{configurable:true,value:true});f.d.dispatchEvent(new f.w.Event('visibilitychange'));assert.equal(f.d.querySelector('#root').hidden,true);Object.defineProperty(f.d,'hidden',{configurable:true,value:false});f.d.dispatchEvent(new f.w.Event('visibilitychange'));await flush();assert.ok(f.d.querySelector('#signinCode'));assert.equal(f.posts.length,count);assert.equal(f.calls.filter(c=>c.url==='/api/member'&&!c.body).length,2)}finally{f.close()}
});
test('expiry, resend cooldown and change email recover without reusing the old challenge',async()=>{
 const f=fixture({saved:{[AUTH]:pending({expiresAt:Date.now()-1,resendAt:Date.now()-60000})}});try{await flush();assert.match(f.d.querySelector('#codeExpiry').textContent,/expired/);f.d.querySelector('#signinCode').value='123456';await f.w.signinVerify();assert.equal(f.posts.length,0);await f.w.resendCode();assert.equal(f.posts.length,1);assert.ok(JSON.parse(f.w.sessionStorage.getItem(AUTH)).expiresAt>Date.now());await f.w.resendCode();assert.equal(f.posts.length,1);assert.match(f.d.querySelector('#joinError').textContent,/Wait/);f.w.showSignin();assert.equal(f.w.sessionStorage.getItem(AUTH),null);f.d.querySelector('#signinEmail').value='new@example.test';await f.w.signinStart();assert.equal(JSON.parse(f.w.sessionStorage.getItem(AUTH)).email,'new@example.test')}finally{f.close()}
});
test('resend failure keeps its valid challenge and never claims a new code was sent',async()=>{
 const p=pending({resendAt:Date.now()-1}),f=fixture({saved:{[AUTH]:p},intercept:c=>c.body?.action==='code_start'?reply({error:'Email temporarily unavailable.'},503):null});try{await flush();await f.w.resendCode();assert.match(f.d.querySelector('#joinError').textContent,/temporarily unavailable/);assert.equal(JSON.parse(f.w.sessionStorage.getItem(AUTH)).challengeId,p.challengeId)}finally{f.close()}
});
test('late code-start and verification cannot restore a dismissed or replaced sign-in',async()=>{
 for(const action of ['code_start','code_verify']){const hold=deferred(),f=fixture();try{await f.start();f.server.intercept=c=>c.body?.action===action?hold.promise:null;let running;if(action==='code_start'){f.w.showSignin();f.d.querySelector('#signinEmail').value='old@example.test';running=f.w.signinStart()}else{f.d.querySelector('#signinCode').value='123456';running=f.w.signinVerify()}f.w.showSignin();f.d.querySelector('#signinEmail').value='new@example.test';hold.resolve(reply(action==='code_start'?{ok:true,challengeId:'old'}:{existing:true,member:member('old')}));await running;assert.equal(f.state().memberId,'');assert.equal(f.w.sessionStorage.getItem(AUTH),null);assert.equal(f.d.querySelector('#signinEmail').value,'new@example.test')}finally{f.close()}}
});
test('recovered verify modal returns to review without replaying a send',async()=>{
 const f=fixture({account:member('owner',{verified:false}),saved:{[KEY]:cached({modal:'verifyEmail',verifyEmail:'owner@example.test'}),[AUTH]:pending({purpose:'verify',context:{view:'dashboard',actor:'member',returnModal:'send'}})}});try{await flush();assert.ok(f.d.querySelector('#verifyEmailCode'));assert.equal(f.posts.length,0);assert.match(f.d.querySelector('#modalHost').textContent,/Resend code.*Change email/s);f.d.querySelector('#verifyEmailCode').value='123456';await f.w.confirmVerify();assert.equal(f.w.sessionStorage.getItem(AUTH),null);assert.equal(f.state().modal,'send');assert.ok(f.d.querySelector('#inviteName'));assert.deepEqual(f.posts.map(c=>c.body.action),['code_verify']);assert.match(f.d.querySelector('#root').textContent,/Email confirmed/)}finally{f.close()}
});
test('change email from verification cannot relabel the current account',async()=>{
 const f=fixture({account:member('owner',{verified:false})});try{await flush();f.w.openVerify('owner@example.test',()=>{throw Error('Must never replay')});await flush();f.w.changeVerifyEmail();f.d.querySelector('#verifyNewEmail').value='new@example.test';await f.w.startChangedVerifyEmail();assert.equal(f.state().account.contact,'owner@example.test');assert.equal(f.state().joinStep,'signinCode');assert.equal(JSON.parse(f.w.sessionStorage.getItem(AUTH)).email,'new@example.test');assert.equal(f.posts.at(-1).body.email,'new@example.test')}finally{f.close()}
});
test('500, 503 and network failures reconnect privately without logging out',async()=>{
 for(const status of [500,503,'network']){const f=fixture({saved:{[KEY]:cached()},account:member(),intercept:c=>c.url==='/api/member'&&!c.body?status==='network'?Promise.reject(Error('offline')):reply({error:'Unavailable'},status):null});try{await flush();assert.equal(f.state().memberId,'owner');assert.equal(f.d.querySelector('#root').hidden,true);assert.match(f.d.querySelector('#authStatus').textContent,/Reconnecting/);assert.equal(f.d.querySelector('#signinEmail'),null);f.server.intercept=null;await f.w.resumeMember();assert.equal(f.d.querySelector('#root').hidden,false);assert.equal(f.state().memberId,'owner');assert.equal(f.posts.length,0);f.server.intercept=c=>c.url==='/api/member'&&!c.body?reply({},503):null;await f.w.resumeMember();assert.equal(f.d.querySelector('#root').hidden,true);assert.equal(f.state().memberId,'owner')}finally{f.close()}}
});
test('a session body completing in the background keeps the privacy shield until foreground validation',async()=>{
 for(const status of [200,401,503]){const body=deferred(),f=fixture({saved:{[KEY]:cached()},account:status===401?null:member(),intercept:c=>c.url==='/api/member'&&!c.body?{ok:status<400,status,json:()=>body.promise}:null});
  try{await flush();assert.equal(f.d.querySelector('#root').hidden,true);Object.defineProperty(f.d,'hidden',{configurable:true,value:true});f.d.dispatchEvent(new f.w.Event('visibilitychange'));f.w.dispatchEvent(new f.w.Event('online'));body.resolve(status===200?{member:member('new')}:{error:'Unavailable'});await flush();assert.equal(f.d.querySelector('#root').hidden,true);assert.ok(f.d.querySelector('#authStatus'));assert.equal(f.state().memberId,'owner');assert.equal(f.posts.length,0);f.server.intercept=null;Object.defineProperty(f.d,'hidden',{configurable:true,value:false});f.d.dispatchEvent(new f.w.Event('visibilitychange'));await flush();assert.equal(f.d.querySelector('#root').hidden,false);assert.equal(f.state().memberId,status===401?'':'owner');assert.equal(f.calls.filter(c=>c.url==='/api/member'&&!c.body).length,2)}finally{f.close()}}
});
test('the session timeout includes a stalled response body and ignores its late completion',async()=>{
 for(const hidden of [false,true]){const f=fixture({account:member()});try{await flush();const body=deferred();let timeout;const originalSetTimeout=f.w.setTimeout.bind(f.w);f.w.setTimeout=(callback,delay,...args)=>delay===15000?(timeout=callback,-1):originalSetTimeout(callback,delay,...args);f.server.intercept=c=>c.url==='/api/member'&&!c.body?{ok:true,status:200,json:()=>body.promise}:null;const running=f.w.resumeMember();await flush();if(hidden){Object.defineProperty(f.d,'hidden',{configurable:true,value:true});f.d.dispatchEvent(new f.w.Event('visibilitychange'))}assert.equal(typeof timeout,'function');timeout();await flush();assert.match(f.d.querySelector('#authStatus').textContent,/Reconnecting/);assert.equal(f.d.querySelector('#root').hidden,true);body.resolve({member:member('late')});await running;await flush();assert.equal(f.state().memberId,'owner');assert.equal(f.d.querySelector('#root').hidden,true);f.server.intercept=null;Object.defineProperty(f.d,'hidden',{configurable:true,value:false});await f.w.resumeMember();assert.equal(f.d.querySelector('#root').hidden,false);assert.equal(f.state().memberId,'owner');assert.equal(f.posts.length,0)}finally{f.close()}}
});
test('expired cookie clears private cache and preserves only invitation routing',async()=>{
 const token='b'.repeat(64),f=fixture({saved:{[KEY]:cached({view:'profile',pendingVibeToken:token,inbox:[{private:'old inbox'}]})}});try{await flush();assert.equal(f.state().memberId,'');assert.equal(f.state().inbox.length,0);assert.equal(f.state().pendingVibeToken,token);assert.equal(f.d.querySelector('#memberProfileName'),null);assert.doesNotMatch(f.d.querySelector('#root').textContent,/Taylor|old inbox/);assert.ok(f.calls.some(c=>c.url.includes('?invite='+token)))}finally{f.close()}
});
test('new cookie identity cannot inherit old private cache or profile draft',async()=>{
 const f=fixture({saved:{[KEY]:cached({view:'profile',inbox:[{private:'old inbox'}]})},account:member('new',{name:'Riley'})});try{await flush();assert.equal(f.state().memberId,'new');assert.equal(f.state().inbox.length,0);assert.doesNotMatch(f.d.querySelector('#root').textContent,/old inbox|Taylor/);assert.equal(f.state().member.name,'Riley')}finally{f.close()}
});
test('profile refresh and bfcache keep their destination after cookie validation',async()=>{
 const f=fixture({saved:{[KEY]:cached({view:'profile'})},account:member()});try{await flush();assert.equal(f.d.querySelector('#memberProfileName').value,'Taylor');f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));f.server.account={...member(),name:'Updated'};f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));assert.equal(f.d.querySelector('#root').hidden,true);await flush();assert.equal(f.d.querySelector('#memberProfileName').value,'Updated');assert.equal(f.state().view,'profile')}finally{f.close()}
});
test('late session check cannot overwrite logout or a newer identity',async()=>{
 for(const action of ['logout','new']){const f=fixture({account:member()});try{await flush();const hold=deferred();f.server.intercept=c=>c.url==='/api/member'&&!c.body?hold.promise:null;const running=f.w.resumeMember();if(action==='logout'){f.w.confirmLogout();await f.w.logout()}else f.w.openPage(member('new'));hold.resolve(reply({member:member()}));await running;assert.equal(f.state().memberId,action==='logout'?'':'new');assert.equal(f.d.querySelector('#authStatus'),null)}finally{f.close()}}
});
test('device/all-device controls send the correct scope and owner header once',async()=>{
 for(const scope of ['this','all']){const f=fixture({account:member()});try{await flush();f.w.confirmLogout();assert.match(f.d.querySelector('#modalHost').textContent,/Sign out this device.*Sign out all devices/s);const hold=deferred();f.server.intercept=c=>c.body?.action==='logout'?hold.promise:null;const running=f.w.logout(scope);await f.w.logout(scope);const calls=f.posts.filter(c=>c.body.action==='logout');assert.equal(calls.length,1);assert.deepEqual(calls[0].body,{action:'logout',scope});assert.equal(calls[0].options.headers['x-chempat-member-id'],'owner');hold.resolve(reply({ok:true}));await running;assert.equal(f.state().memberId,'');assert.equal(f.w.sessionStorage.getItem(AUTH),null)}finally{f.close()}}
});
test('malformed recovery data is never treated as authentication and sends no email',async()=>{
 for(const value of ['{oops',pending({expiresAt:Date.now()+86400000}),pending({purpose:'sendInvitation'}),pending({email:'bad'})]){const f=fixture({saved:{[AUTH]:value}});try{await flush();assert.equal(f.d.querySelector('#signinCode'),null);assert.equal(f.posts.length,0)}finally{f.close()}}
});

test('legacy invitation verification restores recipient and requires a fresh explicit send',async()=>{
 const f=fixture({account:member('owner',{answers:[0,1,2,0,1]})});let restored;
 try{await flush();f.w.inviteMode('send');f.d.querySelector('#inviteName').value='Riley';f.d.querySelector('#inviteContact').value='riley@example.test';await f.w.prepareInvite();assert.ok(f.d.querySelector('#emailCode'));const saved=f.saved(),record=JSON.parse(saved[AUTH]);assert.equal(record.purpose,'invitation');assert.equal(record.context.recipientName,'Riley');assert.equal(record.context.recipientEmail,'riley@example.test');restored=fixture({saved:{[AUTH]:saved[AUTH]},account:f.server.account});await flush();assert.ok(restored.d.querySelector('#emailCode'));assert.equal(restored.posts.length,0);restored.d.querySelector('#emailCode').value='123456';await restored.w.verifyAndSend();assert.deepEqual(restored.posts.map(c=>c.body.action),['verify']);assert.equal(restored.posts[0].body.challengeId,record.challengeId);assert.equal(restored.d.querySelector('#inviteName').value,'Riley');assert.equal(restored.d.querySelector('#inviteContact').value,'riley@example.test');assert.match(restored.d.querySelector('#inviteError').textContent,/Review the invitation/);await restored.w.prepareInvite();assert.equal(restored.posts.filter(c=>c.body.action==='send').length,1)}finally{f.close();restored?.close()}
});
test('different verification services never reuse one another’s pending challenge',async()=>{
 const f=fixture({account:member('owner',{answers:[0,1,2,0,1],verified:false})});try{await flush();f.w.openVerify('owner@example.test',null);await flush();assert.equal(f.posts.at(-1).url,'/api/member');f.w.closeInvite();f.w.inviteMode('send');f.d.querySelector('#inviteName').value='Riley';f.d.querySelector('#inviteContact').value='riley@example.test';await f.w.prepareInvite();assert.equal(f.posts.at(-1).url,'/api/email');assert.equal(JSON.parse(f.w.sessionStorage.getItem(AUTH)).purpose,'invitation')}finally{f.close()}
});
test('pagehide shields the BFCache snapshot and foreground preserves unfinished answers',async()=>{
 const f=fixture({account:member()});try{await flush();f.w.eval('s.member.answers=[0,1,2];s.memberQuestionsOpen=true;render()');f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));assert.equal(f.d.querySelector('#root').hidden,true);f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));await flush();assert.deepEqual(f.state().member.answers,[0,1,2]);assert.equal(f.d.querySelector('#root').hidden,false)}finally{f.close()}
});
test('in-flight verification invalidates an older failed session check',async()=>{
 const f=fixture();try{await f.start();const verify=deferred(),session=deferred();f.server.intercept=c=>c.body?.action==='code_verify'?verify.promise:c.url==='/api/member'&&!c.body?session.promise:null;f.d.querySelector('#signinCode').value='123456';const checking=f.w.signinVerify(),resuming=f.w.resumeMember();verify.resolve(reply({existing:true,member:member()}));await checking;session.resolve(reply({},401));await resuming;assert.equal(f.state().memberId,'owner');assert.equal(f.state().view,'dashboard');assert.equal(f.d.querySelector('#root').hidden,false)}finally{f.close()}
});
test('dismissal cancels pending verification and late results cannot reopen its modal',async()=>{
 const f=fixture({account:member('owner',{verified:false})});try{await flush();f.w.openVerify('owner@example.test',null);await flush();f.w.closeInvite();assert.equal(f.w.sessionStorage.getItem(AUTH),null);assert.equal(f.state().modal,'');const hold=deferred();f.server.intercept=c=>c.body?.action==='code_start'?hold.promise:null;f.w.openVerify('owner@example.test',null);f.w.closeInvite();hold.resolve(reply({ok:true}));await flush();assert.equal(f.state().modal,'');assert.equal(f.w.sessionStorage.getItem(AUTH),null)}finally{f.close()}
});

test('a code response arriving after a Gmail round trip still restores the code step',async()=>{
 const f=fixture();try{await flush();f.w.showSignin();f.d.querySelector('#signinEmail').value='owner@example.test';const hold=deferred();f.server.intercept=c=>c.body?.action==='code_start'?hold.promise:null;const sending=f.w.signinStart();Object.defineProperty(f.d,'hidden',{configurable:true,value:true});f.d.dispatchEvent(new f.w.Event('visibilitychange'));Object.defineProperty(f.d,'hidden',{configurable:true,value:false});f.d.dispatchEvent(new f.w.Event('visibilitychange'));await flush();hold.resolve(reply({ok:true,challengeId:'late-challenge',expiresAt:new Date(Date.now()+600000).toISOString(),resendAt:new Date(Date.now()+60000).toISOString()}));await sending;assert.ok(f.d.querySelector('#signinCode'));assert.equal(f.state().signinEmail,'owner@example.test');assert.equal(f.posts.filter(c=>c.body.action==='code_start').length,1)}finally{f.close()}
});
