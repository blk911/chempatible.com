import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

// Mocked, same-origin requests only. These tests create no live invitations or mail.
const html=fs.readFileSync(new URL('../../wild-hub-hosted/wild-hub-app/index.html',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../../wild-hub-hosted/wild-hub-app/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../wild-hub-hosted/wild-hub-app/app.css',import.meta.url),'utf8');
const origin='http://127.0.0.1:4180';
const pause=(ms=8)=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej});return {promise,resolve,reject}};
const ok=data=>Response.json({ok:true,...data});
const fail=(code,message='The request did not complete.',status=409)=>Response.json({ok:false,error:{code,message}},{status});
const owner={id:'owner',name:'Alice',email:'alice@example.test',verified:true,profileComplete:true,photoUrl:'/api/wildhub?action=media&id=account-photo'};
const hub={id:'hub',slug:'circle',name:'Circle',about:'A private photo community.',published:true,photoUrl:'/api/wildhub?action=media&id=page-photo'};
const receipt=(overrides={})=>({to:'friend@example.test',from:{name:'Alice via BsideVibes',email:'hello@bsidevibes.com'},subject:'A little hello from Alice',message:'I’d love to have you in my circle.',html:'<!doctype html><html><body><h1>You’re invited.</h1><p>I’d love to have you in my circle.</p><a href="https://bsidevibes.com/#invitation-preview">Accept invitation</a></body></html>',text:'You’re invited.\nI’d love to have you in my circle.\nAccept invitation: https://bsidevibes.com/#invitation-preview',previewToken:'signed-receipt-1',...overrides});
const accepted=(mode='provider')=>ok({sent:true,inviteId:'invitation-1',delivery:{status:'accepted',mode}});
function browser(overrides={},runtime={}){
 const dom=new JSDOM(html,{url:origin+'/#manage/circle/people',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,calls=[],unexpected=[];let pending=0;
 w.scrollTo=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.fetch=async(url,init={})=>{
  assert.ok(url==='/api/wildhub-config'||url.startsWith('/api/wildhub?'),'preview never calls an external service');
  const u=new URL(url,origin),action=u.searchParams.get('action')||'runtime_config',body=init.body?JSON.parse(init.body):null,call={action,method:init.method||'GET',query:Object.fromEntries(u.searchParams),body};calls.push(call);pending++;
  try{
   if(overrides[action])return await overrides[action](call);
   if(action==='runtime_config')return ok({environment:'isolated-test',emailMode:'provider',registrationMode:'open-beta',billingEnabled:false,testMode:true,bodyBytes:7340032,...runtime});
   if(action==='me')return ok({user:owner,hub,memberships:[{hubId:hub.id,slug:hub.slug,name:hub.name,role:'owner',status:'active'}]});
   if(action==='hubs')return ok({hubs:[]});
   if(action==='creator_summary')return ok({hub,counts:{requests:0,pendingRequests:0,members:0,posts:0}});
   if(action==='creator_people')return ok({people:[],nextCursor:null});
   if(action==='invite_email_preview')return ok({preview:receipt({to:body.email,subject:body.subject||receipt().subject,message:body.message??receipt().message})});
   if(action==='invite_create')return accepted(runtime.emailMode||'provider');
   unexpected.push(action);throw Error('Unexpected mock action: '+action);
  }finally{pending--}
 };
 w.eval(source+'\nwindow.__inviteTest={state,render};');
 async function settle(){let stable=0;for(let n=0;n<250;n++){await pause(4);stable=pending===0?stable+1:0;if(stable>=3)return}throw Error('Invitation UI did not settle')}
 const element=selector=>{const result=d.querySelector(selector);assert.ok(result,selector);return result};
 return {w,d,calls,settle,element,state:w.__inviteTest.state,
  click:selector=>element(selector).click(),
  field:(name,value)=>{const input=element('#app-dialog [name="'+name+'"]');input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));return input},
  submit:selector=>element(selector).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})),
  route:async hash=>{w.location.hash=hash;await settle()},
  text:()=>element('#app-dialog').textContent,
  close:()=>{w.close();assert.deepEqual(unexpected,[],'every request has a scoped mock')}
 };
}
const calls=(f,action)=>f.calls.filter(call=>call.action===action);
async function open(f,email='friend@example.test'){await f.settle();f.click('[data-action="invite"]');f.field('email',email)}
async function preview(f,email){await open(f,email);f.submit('#invite-form');await f.settle()}

test('Preview is read-only, uses the exact server-rendered email, and exposes no active acceptance link',async()=>{
 const email=receipt({from:{name:'Alice <Friends>',email:'hello@bsidevibes.com'},subject:'Hello <img src=x onerror=alert(1)>',text:'Plain <script>not markup</script>'});
 const f=browser({invite_email_preview:()=>ok({preview:email})});try{
  await open(f,'FRIEND@EXAMPLE.TEST');assert.equal(f.element('#invite-form button[type=submit]').textContent.trim(),'Preview / Send');assert.match(f.text(),/Nothing is sent until you choose Send/);assert.match(f.text(),/open beta sends real invitation emails/);assert.doesNotMatch(f.text(),/Create test invitation|friend@example\.test/);
  f.submit('#invite-form');await f.settle();assert.equal(calls(f,'invite_create').length,0);assert.deepEqual(calls(f,'invite_email_preview')[0].body,{hubId:'hub',email:'friend@example.test'});
  const frame=f.element('#invitation-email-preview');assert.equal(frame.srcdoc,email.html);assert.equal(frame.getAttribute('sandbox'),'');assert.equal(frame.title,'Invitation email preview');assert.equal(frame.getAttribute('tabindex'),'-1');assert.ok(frame.hasAttribute('inert'));assert.equal(frame.hasAttribute('src'),false);
  assert.equal(f.element('.invitation-text-preview pre').textContent,email.text);assert.equal(f.d.querySelector('#app-dialog dd img,#app-dialog pre script'),null);assert.match(f.element('.invitation-envelope').textContent,/Alice <Friends>/);assert.match(f.element('.invitation-envelope').textContent,/friend@example\.test/);assert.match(f.element('.invitation-envelope').textContent,/Hello <img/);
  assert.match(f.text(),/personal acceptance link is added when you send/);assert.match(f.text(),/first seven-day trial starts when they accept/);assert.match(f.text(),/returning keeps the original trial deadline/);assert.equal(f.d.activeElement.id,'dialog-title');assert.equal(f.w.localStorage.length+f.w.sessionStorage.length,0);
 }finally{f.close()}
});

test('Edit cancels to the exact original preview; an updated normalized preview supplies the explicit Send receipt',async()=>{
 let count=0;const updated=receipt({subject:'A personal hello',message:'Hello <friend> & welcome!',html:'<!doctype html><p>Hello &lt;friend&gt; &amp; welcome!</p>',text:'Hello <friend> & welcome!',previewToken:'signed-updated-receipt'});
 const f=browser({invite_email_preview:()=>ok({preview:++count===1?receipt():updated})});try{
  await preview(f);f.click('[data-action="invite-edit"]');assert.equal(f.element('[name="subject"]').value,receipt().subject);assert.equal(f.element('[name="message"]').value,receipt().message);assert.equal(f.element('[name="subject"]').maxLength,160);assert.equal(f.element('[name="message"]').maxLength,1500);
  f.field('subject','Discard this');f.field('message','Discarded');f.click('[data-action="invite-edit-cancel"]');assert.equal(f.element('#invitation-email-preview').srcdoc,receipt().html);assert.equal(calls(f,'invite_email_preview').length,1);
  f.click('[data-action="invite-edit"]');f.field('subject','  A personal hello  ');f.field('message','Hello <friend> & welcome!');f.submit('#invite-edit-form');await f.settle();assert.equal(calls(f,'invite_create').length,0);assert.deepEqual(calls(f,'invite_email_preview')[1].body,{hubId:'hub',email:'friend@example.test',subject:'  A personal hello  ',message:'Hello <friend> & welcome!'});assert.equal(f.element('#invitation-email-preview').srcdoc,updated.html);assert.match(f.element('.invitation-subject').textContent,/A personal hello/);
  f.click('[data-action="invite-edit"]');assert.equal(f.element('[name="subject"]').value,updated.subject);assert.equal(f.element('[name="message"]').value,updated.message);f.click('[data-action="invite-edit-cancel"]');f.submit('#invite-preview-form');await f.settle();assert.deepEqual(calls(f,'invite_create')[0].body,{hubId:'hub',email:'friend@example.test',previewToken:updated.previewToken});assert.match(f.text(),/Invitation sent/);assert.match(f.text(),/provider accepted/);assert.match(f.text(),/does not confirm inbox delivery/);f.click('[data-action="close"]');assert.equal(f.element('#app-dialog').open,false);assert.equal(f.state.invitation,null);assert.equal(f.d.body.style.overflow,'');
 }finally{f.close()}
});

test('Back retains recipient and approved wording, while a new recipient requires a new preview',async()=>{
 const f=browser();try{
  await preview(f);f.click('[data-action="invite-back"]');assert.equal(f.element('[name="email"]').value,'friend@example.test');assert.equal(f.d.querySelector('#invite-preview-form'),null);f.field('email','second@example.test');f.submit('#invite-form');await f.settle();assert.equal(calls(f,'invite_create').length,0);assert.deepEqual(calls(f,'invite_email_preview')[1].body,{hubId:'hub',email:'second@example.test',subject:receipt().subject,message:receipt().message});assert.match(f.element('.invitation-envelope').textContent,/second@example\.test/);
 }finally{f.close()}
});

test('repeated Send is single flight and a retry uses the same signed receipt after a connection error',async()=>{
 const hold=deferred();let sends=0;const f=browser({invite_create:()=>++sends===1?hold.promise:accepted()});try{
  await preview(f);f.submit('#invite-preview-form');f.submit('#invite-preview-form');f.element('#invite-preview-form button[type=submit]').click();await pause();assert.equal(calls(f,'invite_create').length,1);assert.equal(f.element('#invite-preview-form button[type=submit]').disabled,true);assert.equal(f.element('[data-action="invite-edit"]').disabled,true);assert.equal(f.element('[data-action="invite-back"]').disabled,true);
  hold.reject(Error('Connection lost'));await f.settle();assert.equal(calls(f,'invite_create').length,1);assert.match(f.element('#invite-preview-form button[type=submit]').textContent,/Retry Send/);assert.equal(f.element('[data-action="invite-edit"]').disabled,true);assert.equal(f.element('[data-action="invite-back"]').disabled,true);assert.equal(f.state.invitation.preview.previewToken,receipt().previewToken);
  f.submit('#invite-preview-form');await f.settle();assert.equal(calls(f,'invite_create').length,2);assert.deepEqual(calls(f,'invite_create')[1].body,calls(f,'invite_create')[0].body);assert.equal(calls(f,'invite_email_preview').length,1);assert.match(f.text(),/Invitation sent/);
 }finally{f.close()}
});

test('uncertain or malformed send results never claim success or allow a duplicate Send',async()=>{
 for(const result of [()=>fail('invitation_uncertain','Provider outcome is unknown. Do not retry.'),()=>ok({sent:true,inviteId:'invitation-1',delivery:{status:'delivered',mode:'provider'}}),()=>ok({sent:true,delivery:{status:'accepted',mode:'provider'}})]){
  const f=browser({invite_create:result});try{
   await preview(f);f.submit('#invite-preview-form');await f.settle();assert.equal(f.element('#invite-preview-form button[type=submit]').disabled,true);assert.match(f.text(),/Do not send another invitation/);assert.doesNotMatch(f.text(),/Invitation sent\.|NOTHING SENT YET/);f.submit('#invite-preview-form');await f.settle();assert.equal(calls(f,'invite_create').length,1);assert.equal(calls(f,'invite_email_preview').length,1);
  }finally{f.close()}
 }
});

test('expired or changed receipts must be refreshed and reviewed before a separate Send',async()=>{
 for(const code of ['preview_expired','preview_changed']){
  let previews=0,sends=0;const f=browser({invite_email_preview:()=>ok({preview:receipt({previewToken:++previews===1?'old-receipt':'new-receipt'})}),invite_create:()=>++sends===1?fail(code,'Review has expired.'):accepted()});try{
   await preview(f);f.submit('#invite-preview-form');await f.settle();assert.equal(calls(f,'invite_create').length,1);assert.match(f.element('#invite-preview-form button[type=submit]').textContent,/Preview again/);assert.equal(f.element('[data-action="invite-edit"]').disabled,false);
   f.submit('#invite-preview-form');await f.settle();assert.equal(calls(f,'invite_email_preview').length,2);assert.equal(calls(f,'invite_create').length,1,'refreshing a receipt cannot send');assert.equal(f.state.invitation.preview.previewToken,'new-receipt');assert.equal(f.element('#invite-preview-form button[type=submit]').textContent.trim(),'Send');
   f.submit('#invite-preview-form');await f.settle();assert.equal(calls(f,'invite_create')[1].body.previewToken,'new-receipt');assert.match(f.text(),/Invitation sent/);
  }finally{f.close()}
 }
});

test('malformed, mismatched or incomplete preview receipts are never offered for Send',async()=>{
 for(const previewData of [null,receipt({previewToken:''}),receipt({previewToken:undefined}),receipt({to:'other@example.test'}),receipt({html:''}),receipt({text:''}),receipt({subject:'Line\r\nInjected'}),receipt({subject:'x'.repeat(161)}),receipt({message:'x'.repeat(1501)}),receipt({from:{name:'Alice',email:'invalid'}})]){
  const f=browser({invite_email_preview:()=>ok({preview:previewData})});try{
   await open(f);f.submit('#invite-form');await f.settle();assert.ok(f.d.querySelector('#invite-form'));assert.equal(f.d.querySelector('#invite-preview-form'),null);assert.equal(f.element('[name="email"]').value,'friend@example.test');assert.match(f.element('#invite-form .form-error').textContent,/incomplete/);assert.equal(calls(f,'invite_create').length,0);
  }finally{f.close()}
 }
});

test('invalid email stays on recipient step, and failed preview can retry without sending',async()=>{
 let attempts=0;const f=browser({invite_email_preview:()=>++attempts===1?fail('preview_unavailable','Email preview is unavailable.',503):ok({preview:receipt()})});try{
  await open(f,'invalid');f.submit('#invite-form');await f.settle();assert.equal(calls(f,'invite_email_preview').length,0);f.field('email','friend@example.test');f.submit('#invite-form');await f.settle();assert.match(f.element('.form-error').textContent,/Email preview is unavailable/);assert.equal(f.element('[name="email"]').disabled,false);assert.equal(f.element('[name="email"]').value,'friend@example.test');f.submit('#invite-form');await f.settle();assert.equal(calls(f,'invite_email_preview').length,2);assert.equal(calls(f,'invite_create').length,0);assert.ok(f.d.querySelector('#invite-preview-form'));
 }finally{f.close()}
});

test('Close, Cancel, Escape and navigation suppress delayed preview success and clear modal state',async()=>{
 for(const dismissal of ['close','cancel','escape','navigate']){
  const hold=deferred(),f=browser({invite_email_preview:()=>hold.promise});try{
   await open(f);const returnFocus=f.d.activeElement;f.submit('#invite-form');await pause();
   if(dismissal==='close')f.click('.modal-top [data-action="close"]');
   if(dismissal==='cancel')f.click('#invite-form [data-action="close"]');
   if(dismissal==='escape')f.element('#app-dialog').dispatchEvent(new f.w.Event('cancel',{cancelable:true}));
   if(dismissal==='navigate'){f.w.location.hash='#home';await pause(20)}
   assert.equal(f.element('#app-dialog').open,false);assert.equal(f.d.body.style.overflow,'');assert.equal(f.state.invitation,null);assert.equal(f.element('#app-dialog-content').childElementCount,0);hold.resolve(ok({preview:receipt()}));await f.settle();assert.equal(f.element('#app-dialog').open,false);assert.equal(f.d.querySelector('#invite-preview-form'),null);assert.equal(calls(f,'invite_create').length,0);assert.equal(f.element('#app-alert').textContent,'');assert.equal(returnFocus.isConnected,false);
  }finally{f.close()}
 }
});

test('a stale preview error cannot enter a later invitation or restore an abandoned recipient',async()=>{
 const hold=deferred();let attempts=0;const f=browser({invite_email_preview:()=>++attempts===1?hold.promise:ok({preview:receipt({to:'new@example.test'})})});try{
  await open(f);f.submit('#invite-form');await pause();f.click('[data-action="close"]');f.click('[data-action="invite"]');f.field('email','new@example.test');hold.reject(Error('Old connection failed'));await f.settle();assert.equal(f.element('[name="email"]').value,'new@example.test');assert.equal(f.element('.form-error').textContent,'');f.submit('#invite-form');await f.settle();assert.match(f.element('.invitation-envelope').textContent,/new@example\.test/);assert.equal(calls(f,'invite_create').length,0);
 }finally{f.close()}
});

test('Cancel edits suppresses delayed updates and restores the original exact receipt',async()=>{
 const hold=deferred();let attempts=0;const f=browser({invite_email_preview:()=>++attempts===1?ok({preview:receipt()}):hold.promise});try{
  await preview(f);f.click('[data-action="invite-edit"]');f.field('subject','Discard me');f.submit('#invite-edit-form');await pause();f.click('[data-action="invite-edit-cancel"]');assert.equal(f.element('#invitation-email-preview').srcdoc,receipt().html);hold.resolve(ok({preview:receipt({subject:'Discard me',previewToken:'discarded-receipt'})}));await f.settle();assert.equal(f.state.invitation.preview.previewToken,receipt().previewToken);assert.equal(f.element('#invitation-email-preview').srcdoc,receipt().html);f.submit('#invite-preview-form');await f.settle();assert.equal(calls(f,'invite_create')[0].body.previewToken,receipt().previewToken);
 }finally{f.close()}
});

test('browser Back dismisses preview cleanly and a late send does not reopen it',async()=>{
 const hold=deferred(),f=browser({invite_create:()=>hold.promise});try{
  await f.settle();await f.route('#home');await f.route('#manage/circle/people');f.click('[data-action="invite"]');f.field('email','friend@example.test');f.submit('#invite-form');await f.settle();f.submit('#invite-preview-form');await pause();f.w.history.back();await pause(30);assert.equal(f.w.location.hash,'#home');assert.equal(f.element('#app-dialog').open,false);hold.resolve(accepted());await f.settle();assert.equal(f.element('#app-dialog').open,false);assert.equal(f.state.invitation,null);assert.equal(calls(f,'invite_create').length,1);assert.equal(f.element('#app-status').textContent,'');assert.equal(f.d.body.style.overflow,'');
 }finally{f.close()}
});

test('closing an active send leaves later dialogs alone and never pretends to cancel the email',async()=>{
 const hold=deferred(),f=browser({invite_create:()=>hold.promise});try{
  await preview(f);assert.match(f.text(),/Closing after Send won’t cancel/);f.submit('#invite-preview-form');await pause();f.click('[data-action="close"]');f.click('[data-action="invite"]');f.field('email','second@example.test');hold.resolve(accepted());await f.settle();assert.equal(f.element('[name="email"]').value,'second@example.test');assert.equal(calls(f,'invite_create').length,1);assert.equal(f.d.querySelector('#invite-preview-form'),null);assert.equal(f.element('#app-status').textContent,'');
 }finally{f.close()}
});

test('simulated send confirmation clearly distinguishes local inbox from real mail',async()=>{
 const f=browser({}, {environment:'local',emailMode:'simulated',registrationMode:'allowlist'});try{
  await preview(f);assert.match(f.text(),/No real email is sent/);f.submit('#invite-preview-form');await f.settle();assert.match(f.text(),/Invitation created/);assert.match(f.text(),/local simulated inbox/);assert.match(f.text(),/No real email was sent/);assert.doesNotMatch(f.text(),/provider accepted/);
 }finally{f.close()}
});

test('320px authored CSS has bounded dialogs, flexible controls, wrapping metadata and noninteractive frame',()=>{
 // Authored sizing guards, not a claim of pixel-measured browser layout.
 assert.match(css,/#app-dialog\.invitation-dialog\{[^}]*width:min\(560px,calc\(100% - 24px\)\)[^}]*max-width:calc\(100% - 24px\)[^}]*overflow-x:hidden/);
 assert.match(css,/\.invitation-dialog \.modal-content\{[^}]*min-width:0[^}]*box-sizing:border-box/);
 assert.match(css,/\.invitation-envelope dd\{[^}]*min-width:0[^}]*overflow-wrap:anywhere/);
 assert.match(css,/\.invitation-text-preview pre\{[^}]*white-space:pre-wrap[^}]*overflow-wrap:anywhere/);
 assert.match(css,/#invitation-email-preview\{[^}]*width:100%[^}]*max-width:100%[^}]*min-width:0[^}]*pointer-events:none/);
 assert.match(css,/@media\(max-width:360px\)\{[\s\S]*?\.invitation-envelope>div\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.invitation-actions \.button\{flex:1 1 110px;min-width:0/);
 assert.match(css,/\.invitation-actions \.button,\.invitation-actions \.text-link\{[^}]*min-height:44px[^}]*white-space:normal/);
});

test('long and multiline messages reserve full preview height and resize safely at 320px',async()=>{
 const message='W'.repeat(700)+'\n'.repeat(30)+'More details '.repeat(55);
 const f=browser({invite_email_preview:()=>ok({preview:receipt({message})})});try{
  await preview(f);const frame=f.element('#invitation-email-preview'),wide=parseInt(frame.style.height,10);assert.ok(wide>1500);
  f.w.innerWidth=320;f.w.dispatchEvent(new f.w.Event('resize'));const narrow=parseInt(frame.style.height,10);assert.ok(narrow>wide,'narrow preview adds room instead of clipping the message');assert.ok(narrow>4000);assert.equal(frame.srcdoc,receipt().html,'sizing cannot rewrite the email');assert.equal(frame.getAttribute('sandbox'),'');
  f.click('[data-action="close"]');f.w.dispatchEvent(new f.w.Event('resize'));assert.equal(f.d.querySelector('#invitation-email-preview'),null);assert.equal(calls(f,'invite_create').length,0);
 }finally{f.close()}
});

test('a permission-denied send redacts protected management data and clears the preview receipt',async()=>{
 for(const status of [401,403]){
  const f=browser({invite_create:()=>fail('not_owner','Your host access is unavailable.',status)});try{
   await preview(f);f.submit('#invite-preview-form');await f.settle();assert.equal(f.element('#app-dialog').open,false);assert.equal(f.state.invitation,null);assert.equal(f.d.querySelector('.creator-dashboard'),null);assert.match(f.element('#app').textContent,/This space is closed/);assert.equal(calls(f,'invite_create').length,1);
  }finally{f.close()}
 }
});
