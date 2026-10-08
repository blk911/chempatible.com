import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';

// Self-contained offline DOM/CSS regression tests against the hosted release.
// All API responses are fixtures. No server, network, inbox, payment or database.
const root=new URL('../wild-hub-hosted/',import.meta.url);
const html=fs.readFileSync(new URL('wild-hub-app/index.html',root),'utf8');
const source=fs.readFileSync(new URL('wild-hub-app/app.js',root),'utf8');
const css=fs.readFileSync(new URL('wild-hub/wild-hub.css',root),'utf8')+'\n'+fs.readFileSync(new URL('wild-hub-app/app.css',root),'utf8');
const origin='http://127.0.0.1:4180',token='b'.repeat(64);
const image='data:image/jpeg;base64,c3ludGhldGljLXRlc3QtcGhvdG8=';
const ok=data=>Response.json({ok:true,...data});
const fail=(message='Temporarily unavailable. Retry.',status=503,code='interrupted')=>Response.json({ok:false,error:{code,message}},{status});
const pause=(ms=20)=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
async function waitForEvent(promise,description){let timeout;try{return await Promise.race([promise,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Timed out waiting for '+description)),5000)})])}finally{clearTimeout(timeout)}}
const person={id:'member',name:'Morgan',email:'member@example.test',verified:true,profileComplete:true,photoUrl:'/api/wildhub?action=media&id=member-photo'};
const hub={id:'hub',slug:'real-circle',name:'A real circle',about:'Private updates for approved members.',published:true,photoUrl:'/api/wildhub?action=media&id=hub-photo',host:{id:'host',name:'Taylor'}};

function fixture(overrides={},options={}){
 const env={user:null,hub:null,memberships:[],requests:[],relationship:'none',...options};
 const handler=async request=>{
  const u=new URL(request.url),action=u.searchParams.get('action'),body=request.method==='POST'?await request.clone().json():null;
  if(overrides[action])return overrides[action]({request,action,query:Object.fromEntries(u.searchParams),body,env});
  if(action==='me')return ok({user:env.user,hub:env.hub,memberships:env.memberships,requests:env.requests});
  if(action==='hubs')return ok({hubs:[{...hub,name:'Example creator',photoUrl:'/api/wildhub?action=media&id=example-photo'}]});
  if(action==='auth_start')return ok({sent:true});
  if(action==='auth_verify'){env.user={...person,name:null,photoUrl:null,profileComplete:false};return ok({user:env.user,hub:env.hub,memberships:env.memberships})}
  if(action==='profile_save'){env.user={...env.user,name:body.name,photoUrl:person.photoUrl,profileComplete:true};return ok({user:env.user})}
  if(action==='public_hub')return ok({hub,relationship:env.relationship});
  if(action==='share_resolve')return ok({frontDoor:{slug:hub.slug,name:hub.name}});
  if(action==='share_create')return ok({share:{token,url:origin+'/#share/'+token}});
  if(action==='invite_preview')return ok({invite:{hostName:'Taylor',hubName:hub.name,expiresAt:'2030-01-01T00:00:00Z'},canAccept:env.user?.email===person.email});
  if(action==='access_status')return ok({access:{allowed:env.relationship==='active',membershipStatus:env.relationship,source:env.relationship==='active'?'trial':'none',trialEndsAt:'2030-01-01T00:00:00Z'}});
  if(action==='logout'){env.user=null;env.hub=null;env.memberships=[];return ok({loggedOut:true})}
  throw Error('Unexpected BsideVibes UI contract: '+action);
 };
 return {...browser(handler,options),env};
}
function browser(handler,{hash='#home',locationOrigin=origin,runtime={ok:true,environment:'local',emailMode:'simulated',billingEnabled:false,testMode:true,bodyBytes:7340032}}={}){
 const runtimeErrors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>runtimeErrors.push(error.message));
 const dom=new JSDOM(html,{url:locationOrigin+'/'+hash,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
 const w=dom.window,d=w.document,calls=[],cookies=new Map();let pending=0;
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.Image=class{constructor(){this.width=12;this.height=12}set src(_){setTimeout(()=>this.onload?.(),0)}};
 w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});w.HTMLCanvasElement.prototype.toDataURL=()=>image;
 const cookie=()=>[...cookies].map(([key,value])=>key+'='+value).join('; ');
 w.fetch=async(url,init={})=>{
  assert.ok(typeof url==='string'&&(url==='/api/wildhub-config'||url.startsWith('/api/wildhub?')||url.startsWith('/api/wildhub-billing?')),'only same-origin approved API paths');
  const u=new URL(url,origin),call={action:u.searchParams.get('action')||'runtime_config',endpoint:u.pathname,query:Object.fromEntries(u.searchParams),method:init.method||'GET',body:init.body?JSON.parse(init.body):null};calls.push(call);pending++;
  try{
   const headers=new Headers(init.headers);headers.set('cookie',cookie());if(init.method==='POST')headers.set('origin',origin);
   const response=url==='/api/wildhub-config'?(typeof runtime==='function'?await runtime():Response.json(runtime)):u.pathname==='/api/wildhub-billing'?ok({enabled:false,testMode:true,canCheckout:false}):await handler(new Request(u,{...init,headers}));
   for(const item of response.headers.getSetCookie()){const [name,value]=item.split(';')[0].split('=');if(!value||/Max-Age=0/i.test(item))cookies.delete(name);else cookies.set(name,value)}return response;
  }finally{pending--}
 };
 w.eval(source+'\nwindow.__bsideTest={state,api,render};');
 const element=selector=>{const value=d.querySelector(selector);assert.ok(value,'Missing element: '+selector);return value};
 const text=()=>element('main').textContent;
 async function settle(){let stable=0;for(let n=0;n<300;n++){await pause(4);stable=pending===0?stable+1:0;if(stable>=5)return}throw Error('BsideVibes UI did not settle')}
 const controls=()=>[...d.querySelectorAll('a,button')];
 const byLabel=label=>{const node=controls().find(node=>node.textContent.trim()===label);assert.ok(node,'Missing control: '+label);return node};
 return {dom,w,d,calls,cookie,state:w.__bsideTest.state,element,text,settle,byLabel,
  click:selector=>element(selector).click(),clickLabel:label=>byLabel(label).click(),
  field:(selector,value)=>{const node=element(selector);if(node.type==='checkbox')node.checked=!!value;else node.value=value;node.dispatchEvent(new w.Event('input',{bubbles:true}));return node},
  submit:selector=>element(selector).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})),
  route:async hash=>{w.location.hash=hash;await settle()},navigate:async hash=>{w.location.hash=hash;await pause()},
  close:()=>{w.close();assert.deepEqual(runtimeErrors,[],'no exercised DOM exceptions')}
 };
}
function cssRules(f){const style=f.d.createElement('style');style.textContent=css;f.d.head.append(style);const rules=[...style.sheet.cssRules];style.remove();return rules}
function cssAtWidth(rules,width){return rules.map(rule=>{if(rule.type!==4)return rule.cssText;const active=rule.conditionText.split(/\s+and\s+/).every(condition=>{if(/prefers-reduced-motion/.test(condition))return false;const match=condition.match(/^\((min|max)-width:\s*(\d+(?:\.\d+)?)(px|rem)\)$/);assert.ok(match,'explicit CSS media condition: '+condition);const threshold=Number(match[2])*(match[3]==='rem'?16:1);return match[1]==='min'?width>=threshold:width<=threshold});return active?cssAtWidth([...rule.cssRules],width):''}).join('\n')}

// Returning-login regression: all accounts/codes below are offline fixtures.
async function returningSignin(f){
 f.field('#signin-form [name="email"]',person.email);f.submit('#signin-form');await f.settle();
 f.field('#verify-form [name="code"]','123456');f.submit('#verify-form');await f.settle();
}
const existingAuth=({env})=>{env.user={...person};return ok({user:env.user,hub:env.hub,memberships:env.memberships})};

test('plain returning sign-in and sign-out/sign-in land on the saved profile while Home remains reachable',async()=>{
 const f=fixture({auth_verify:existingAuth});try{
  await f.settle();f.click('.member-signin');await f.settle();await returningSignin(f);
  assert.equal(f.w.location.hash,'#profile');assert.equal(f.element('#profile-form [name="name"]').value,person.name);
  assert.equal(f.d.querySelector('.bside-home'),null);assert.equal(f.calls.some(c=>c.action==='profile_save'),false);
  await f.route('#home');assert.ok(f.d.querySelector('.bside-home'),'explicit Home stays available');
  f.click('#account-nav [data-action="logout"]');await f.settle();assert.equal(f.state.user,null);assert.equal(f.w.location.hash,'#home');
  f.click('.member-signin');await f.settle();await returningSignin(f);assert.equal(f.w.location.hash,'#profile');
  assert.equal(f.calls.filter(c=>c.action==='auth_verify').length,2);
 }finally{f.close()}
});

test('already authenticated auth routes open the profile without sending a code or saving data',async()=>{
 for(const hash of ['#signin','#signup']){const f=fixture({}, {user:person,hash});try{
  await f.settle();assert.equal(f.w.location.hash,'#profile');assert.ok(f.d.querySelector('#profile-form'));
  assert.equal(f.calls.some(c=>c.method==='POST'),false);
 }finally{f.close()}}
});

test('an unknown-email sign-in keeps the existing registration and photo gates',async()=>{
 const f=fixture();try{
  await f.settle();await f.route('#signin');await returningSignin(f);
  assert.equal(f.w.location.hash,'#signup');assert.ok(f.d.querySelector('#signup-form'));
  assert.equal(f.d.querySelector('#profile-form'),null);assert.match(f.element('#app-status').textContent,/no page for that email/);
  assert.equal(f.calls.some(c=>c.action==='profile_save'),false);
 }finally{f.close()}
});

test('returning sign-in preserves explicit creator, invitation, QR and protected-page destinations',async()=>{
 for(const destination of ['#create','#invite/'+token,'#my-qr/'+hub.slug,'#dashboard']){
  const f=fixture({auth_verify:existingAuth});try{
   await f.settle();
   if(destination==='#create'){f.clickLabel('Build my B-side');await f.settle();f.click('#signup-form a[href="#signin"]');await f.settle()}
   else if(destination.startsWith('#invite/')){await f.route(destination);f.click('[data-action="join-signin"]');await f.settle();f.click('#signup-form a[href="#signin"]');await f.settle()}
   else if(destination.startsWith('#my-qr/')){await f.route('#signin/'+hub.slug)}
   else await f.route(destination);
   assert.equal(f.state.next,destination);await returningSignin(f);assert.equal(f.w.location.hash,destination);
   assert.equal(f.d.querySelector('#profile-form'),null);assert.equal(f.calls.some(c=>['invite_accept','profile_save','hub_save'].includes(c.action)),false);
  }finally{f.close()}
 }
});

test('direct profile and expired-session reauthentication return to profile without bypassing sign-in',async()=>{
 for(const expired of [false,true]){const f=fixture({auth_verify:existingAuth},{hash:'#profile',user:expired?person:null});try{
  await f.settle();if(expired){f.env.user=null;f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));await f.settle()}
  assert.equal(f.w.location.hash,'#signin');assert.ok(f.d.querySelector('#signin-form'));assert.equal(f.d.querySelector('#profile-form'),null);
  assert.equal(f.state.next,'#profile');await returningSignin(f);assert.equal(f.w.location.hash,'#profile');assert.ok(f.d.querySelector('#profile-form'));
 }finally{f.close()}}
});

test('incorrect code stays on verification and late success respects newer user navigation',async()=>{
 const held=deferred(),started=deferred();let attempts=0;
 const f=fixture({auth_verify:({env})=>{if(++attempts===1)return fail('The code is incorrect or expired.',400,'invalid_code');started.resolve();return held.promise.then(()=>existingAuth({env}))}});try{
  await f.settle();await f.route('#signin');await returningSignin(f);
  assert.equal(f.w.location.hash,'#verify');assert.match(f.element('#joinError').textContent,/incorrect or expired/);assert.equal(f.state.user,null);
  f.submit('#verify-form');await waitForEvent(started.promise,'held verification');await f.navigate('#privacy');held.resolve();await f.settle();
  assert.equal(f.w.location.hash,'#privacy');assert.equal(f.d.querySelector('#profile-form'),null);assert.equal(f.state.user.name,person.name);
 }finally{f.close()}
});

test('signed-in mobile navigation keeps the profile labeled and wraps every account destination',async()=>{
 for(const ownsHub of [false,true]){const f=fixture({}, {user:person,hub:ownsHub?hub:null});try{
  await f.settle();const rules=cssRules(f);
  for(const width of [320,360,390,430,760,1440]){
   const style=f.d.createElement('style');style.textContent=cssAtWidth(rules,width);f.d.head.append(style);
   const computed=node=>f.w.getComputedStyle(node),nav=f.element('#account-nav');
   assert.equal(f.element('.account-line').getAttribute('href'),'#profile');
   assert.notEqual(computed(f.element('.profile-label')).display,'none',width+': profile label is visible');
   for(const link of nav.querySelectorAll('a,button'))assert.notEqual(computed(link).display,'none',width+': '+link.textContent);
   if(width<=760){assert.equal(computed(nav).flexWrap,'wrap');assert.equal(computed(nav).flexBasis,'100%');assert.equal(computed(nav).overflow,'visible');assert.equal(computed(f.element('.site-header')).flexWrap,'wrap');assert.ok(parseFloat(computed(f.element('.account-line')).minHeight)>=44)}
   style.remove();
  }
 }finally{f.close()}}
});

test('going Home abandons earlier invite, community and QR intent before a plain returning sign-in',async()=>{
 for(const prior of ['#invite/'+token,'#dashboard','#signin/'+hub.slug]){
  const f=fixture({auth_verify:existingAuth});try{
   await f.settle();await f.route(prior);
   if(prior.startsWith('#invite/')){f.click('[data-action="join-signin"]');await f.settle()}
   assert.notEqual(f.state.next,'#home');await f.route('#home');
   assert.equal(f.state.next,'#home');assert.equal(f.state.acquisitionSlug,'');
   f.click('.member-signin');await f.settle();await returningSignin(f);
   assert.equal(f.w.location.hash,'#profile');assert.ok(f.d.querySelector('#profile-form'));
   assert.equal(f.calls.some(c=>['invite_accept','request_join','profile_save','hub_save'].includes(c.action)),false);
  }finally{f.close()}
 }
});
