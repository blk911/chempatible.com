import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const html = readFileSync(new URL('../wild-hub/index.html',import.meta.url),'utf8');
const source = readFileSync(new URL('../wild-hub/wild-hub.js',import.meta.url),'utf8');
const css = readFileSync(new URL('../wild-hub/wild-hub.css',import.meta.url),'utf8');
function fixture(hash='home') {
  const dom = new JSDOM(html,{url:`https://example.test/#${hash}`,runScripts:'outside-only',pretendToBeVisual:true}), w = dom.window, d = w.document;
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function(){this.open = true;}; w.HTMLDialogElement.prototype.close = function(){this.open = false;};
  let nativeSubmissions = 0;
  d.addEventListener('submit',event => {nativeSubmissions++; event.preventDefault(); event.stopImmediatePropagation();},true);
  w.HTMLFormElement.prototype.submit = () => {throw Error('Native submission must never be used');};
  w.HTMLFormElement.prototype.requestSubmit = () => {throw Error('Native submission must never be used');};
  w.fetch = () => {throw Error('Network is prohibited');}; w.XMLHttpRequest = () => {throw Error('Network is prohibited');};
  w.eval(source+'\nwindow.__test={render,action,getState:()=>({join,requests,ownRequest})};');
  const run = fn => {const old = w.location.hash; fn(); if (old !== w.location.hash) w.dispatchEvent(new w.HashChangeEvent('hashchange'));};
  const click = (action,id) => {const el = d.querySelector(`[data-action="${action}"]${id ? `[data-id="${id}"]` : ''}`); assert.ok(el,`action ${action}`); run(() => el.click());};
  const route = hash => {w.location.hash = hash; w.dispatchEvent(new w.HashChangeEvent('hashchange'));};
  const advance = selector => {const form = d.querySelector(selector); assert.ok(form,selector); const button = form.querySelector('[data-action="'+form.dataset.stepAction+'"]'); assert.ok(button,'direct step button in '+selector); assert.equal(button.type,'button'); run(() => button.click());};
  const enter = (selector,options={}) => {const el = d.querySelector(selector); assert.ok(el,selector); run(() => el.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,...options})));};
  const value = (id,value) => {d.getElementById(id).value = value; d.getElementById(id).dispatchEvent(new w.Event('input',{bubbles:true}));};
  return {w,d,click,route,advance,enter,value,nativeSubmissions:()=>nativeSubmissions,close:() => w.close()};
}
function details(f) {f.route('host'); f.click('request'); f.click('fill-sample'); f.d.querySelector('#joinAgree').checked = true; f.advance('#join-form');}
function photo(f) {details(f); f.value('signinCode','246810'); f.advance('#code-form');}
function intro(f) {photo(f); f.click('choose-photo'); f.click('use-photo');}
function request(f) {intro(f); f.click('fill-intro'); f.advance('#request-form');}

test('mature photo-led landing has the promise, local photo and no cartoon or dating content', () => {const f = fixture(); try {
  assert.match(f.d.querySelector('h1').textContent,/Your people.Your space./); assert.match(f.d.body.textContent,/Your private network. Open to requests. Yours to approve./);
  assert.doesNotMatch(f.d.querySelector('main').textContent,/compatibility|dating|reward|secret|vibe/i); assert.match(f.d.body.textContent,/DESIGN PREVIEW/);
  assert.equal(f.d.querySelector('.editorial-photo').getAttribute('src'),'assets/editorial.jpg'); assert.equal(f.d.querySelectorAll('img[src$=".svg"]').length,0);
  assert.doesNotMatch(css,/#(?:6b50c6|6b4fc7|dfe4d3)|Georgia|Times New Roman|font-style:italic/);
} finally {f.close();}});

test('registration retains original stacked DOM and fields, separate from introduction', () => {const f = fixture('host'); try {
  f.click('request'); assert.ok(f.d.querySelector('.box.joinCard.instantEntry')); assert.equal(f.d.querySelector('#dialog').open,false);
  const fields = [...f.d.querySelectorAll('#join-form input')].map(x => x.id); assert.deepEqual(fields,['joinName','joinContact','joinAgree']);
  assert.equal(f.d.querySelector('#request-intro'),null); assert.equal(f.d.querySelector('input[type=file]'),null);
  assert.match(f.d.querySelector('.agree').textContent,/I’m 18 or older and agree to the Terms and Privacy Policy/);
  assert.equal(f.d.querySelector('.agree a').href,'https://chempatible.com/terms'); assert.equal(f.d.querySelectorAll('.agree a[target="_blank"][rel="noreferrer"]').length,2);
  assert.match(f.d.querySelector('.legal-preview').textContent,/No account is created or legal acceptance recorded/);
} finally {f.close();}});

test('details validate synthetic email and explicit acknowledgement before email-code step', () => {const f = fixture('host'); try {
  f.click('request'); f.advance('#join-form'); assert.match(f.d.querySelector('#joinError').textContent,/fictional first name/);
  f.click('fill-sample'); f.advance('#join-form'); assert.match(f.d.querySelector('#joinError').textContent,/adult and terms/);
  f.d.querySelector('#joinAgree').checked = true; f.value('joinContact','real@company.com'); f.advance('#join-form'); assert.match(f.d.querySelector('#joinError').textContent,/sample email/);
  f.value('joinContact','taylor@example.com'); f.advance('#join-form'); assert.ok(f.d.querySelector('#signinCode')); assert.equal(f.d.querySelector('#request-intro'),null);
  assert.match(f.d.querySelector('main').textContent,/No email has been sent/); f.value('signinCode','000000'); f.advance('#code-form'); assert.match(f.d.querySelector('#joinError').textContent,/246810/);
  f.click('resend-code'); assert.match(f.d.querySelector('#joinError').textContent,/No email has been sent/); f.value('signinCode','246810'); f.advance('#code-form'); assert.match(f.d.querySelector('h1').textContent,/Add your picture/);
} finally {f.close();}});

test('photo buttons preserve camera/choose-file sequence without accessing device or uploading', () => {const f = fixture(); try {
  photo(f); assert.ok(f.d.querySelector('#memberPhoto[disabled]')); assert.ok(f.d.querySelector('#cameraPreview[hidden]')); assert.ok(f.d.querySelector('#cameraCanvas[hidden]'));
  f.click('choose-photo'); f.click('close'); assert.match(f.d.querySelector('h1').textContent,/Add your picture/); assert.equal(f.w.__test.getState().join.photo,false);
  f.click('camera'); assert.ok(f.d.querySelector('.camera-simulation')); assert.equal(f.d.querySelector('#captureBtn').hidden,false); f.click('capture');
  assert.match(f.d.querySelector('h1').textContent,/Say hello to Alex/); assert.equal(f.d.querySelector('#joinContact'),null); assert.ok(f.d.querySelector('#request-intro'));
  f.value('request-intro','A note kept while changing the picture.'); f.click('back-photo'); f.click('choose-photo'); f.click('use-photo'); assert.equal(f.d.querySelector('#request-intro').value,'A note kept while changing the picture.');
} finally {f.close();}});

test('photo picker can be activated from keyboard and cancellation restores focus', () => {const f = fixture(); try {
  photo(f); const chooser = f.d.querySelector('[data-action="choose-photo"]'); chooser.focus(); chooser.dispatchEvent(new f.w.KeyboardEvent('keydown',{bubbles:true,key:'Enter'})); assert.equal(f.d.querySelector('#dialog').open,true);
  f.d.querySelector('#dialog').dispatchEvent(new f.w.Event('cancel',{cancelable:true})); assert.equal(f.d.querySelector('#dialog').open,false); assert.equal(f.d.activeElement,chooser); assert.equal(f.d.body.style.overflow,'');
} finally {f.close();}});

test('back to details retains fields, while changing email requires a new simulated code', () => {const f = fixture(); try {
  photo(f); f.click('back-details'); assert.equal(f.d.querySelector('#joinName').value,'Taylor'); assert.equal(f.d.querySelector('#joinAgree').checked,true);
  f.value('joinContact','different@example.com'); f.advance('#join-form'); assert.match(f.d.querySelector('main').textContent,/different@example.com/); assert.equal(f.w.__test.getState().join.codeComplete,false);
  f.route('introduce'); assert.ok(f.d.querySelector('#signinCode')); f.click('back-details'); assert.equal(f.d.querySelector('#joinContact').value,'different@example.com');
} finally {f.close();}});

test('direct or repeated navigation cannot skip registration stages or create duplicate requests', () => {const f = fixture('introduce'); try {
  assert.ok(f.d.querySelector('#joinName')); f.route('join-photo'); assert.ok(f.d.querySelector('#joinName')); intro(f);
  f.advance('#request-form'); assert.match(f.d.querySelector('#request-error').textContent,/few words/); f.click('fill-intro'); f.advance('#request-form');
  assert.equal(f.w.__test.getState().requests.filter(r => r.id === 'visitor').length,1); f.route('introduce'); assert.match(f.d.querySelector('main').textContent,/REQUEST PENDING/); assert.equal(f.d.querySelector('#request-form'),null);
  assert.equal(f.w.localStorage.length,0); assert.equal(f.w.sessionStorage.length,0); assert.equal(f.d.cookie,'');
} finally {f.close();}});

test('member view stays visually closed until host approval and never shows member emails', () => {const f = fixture('circle'); try {
  assert.match(f.d.querySelector('main').textContent,/This door opens with approval/); request(f); f.route('circle'); assert.match(f.d.querySelector('main').textContent,/This door opens with approval/);
  f.route('dashboard'); f.click('approve','visitor'); f.route('circle'); assert.match(f.d.querySelector('main').textContent,/Inside the open studio/); assert.match(f.d.querySelector('main').textContent,/not a secure private space/); assert.doesNotMatch(f.d.querySelector('main').textContent,/@example.com/);
} finally {f.close();}});

test('Pass never opens the member view and repeat decisions are idempotent', () => {const f = fixture(); try {
  request(f); f.route('dashboard'); f.click('pass','visitor'); f.w.__test.action('approve','visitor'); f.route('host'); assert.match(f.d.querySelector('main').textContent,/passed on/); f.route('circle'); assert.match(f.d.querySelector('main').textContent,/This door opens with approval/);
} finally {f.close();}});

test('withdraw, leave and reset remove sample access', () => {const f = fixture(); try {
  request(f); f.click('withdraw'); assert.ok(f.d.querySelector('[data-action="request"]')); request(f); f.route('dashboard'); f.click('approve','visitor'); f.route('circle'); f.click('leave'); f.route('circle'); assert.match(f.d.querySelector('main').textContent,/This door opens with approval/);
  f.route('dashboard'); f.click('reset'); assert.equal(f.d.querySelectorAll('.request-card').length,3);
} finally {f.close();}});

test('sample invite validates, escapes values, cancels and never creates an invitation link', () => {const f = fixture('dashboard'); try {
  f.click('invite'); f.advance('#invite-form'); assert.match(f.d.querySelector('#invite-error').textContent,/valid email/); f.value('invite-name','<img src=x onerror=alert(1)>'); f.value('invite-email','sample@example.com'); f.advance('#invite-form');
  assert.match(f.d.querySelector('#dialog-content').textContent,/EMAIL PREVIEW · NOT SENT/); assert.equal(f.d.querySelectorAll('#dialog-content img,#dialog-content a').length,0); f.click('close'); f.click('invite'); assert.equal(f.d.querySelector('#invite-name').value,''); f.click('close');
} finally {f.close();}});

test('introduction and profile input is escaped in host and member views', () => {const f = fixture('host'); try {
  f.click('request'); f.click('fill-sample'); f.value('joinName','<script>alert(1)</script>'); f.d.querySelector('#joinAgree').checked = true; f.advance('#join-form'); f.value('signinCode','246810'); f.advance('#code-form'); f.click('choose-photo'); f.click('use-photo'); f.value('request-intro','<img src=x onerror=alert(1)>'); f.advance('#request-form'); f.route('dashboard');
  assert.equal(f.d.querySelectorAll('main script,main img[onerror]').length,0); assert.match(f.d.querySelector('main').textContent,/<img src=x onerror=alert\(1\)>/);
} finally {f.close();}});

test('Escape restores focus and navigation dismisses modal without leaving scroll locked', () => {const f = fixture('dashboard'); try {
  const trigger = f.d.querySelector('[data-action="invite"]'); trigger.focus(); f.click('invite'); f.d.querySelector('#dialog').dispatchEvent(new f.w.Event('cancel',{cancelable:true})); assert.equal(f.d.activeElement,trigger); assert.equal(f.d.querySelector('#dialog').open,false);
  f.click('invite'); f.route('home'); assert.equal(f.d.querySelector('#dialog').open,false); assert.equal(f.d.body.style.overflow,'');
} finally {f.close();}});

test('support choices remain explicit non-payment demos through repeated actions', () => {const f = fixture('host'); try {
  f.click('support'); assert.match(f.d.querySelector('#dialog-content').textContent,/Illustrative amounts/); f.click('preview-monthly'); assert.match(f.d.querySelector('#dialog-content').textContent,/No subscription, payment, or membership was created/);
  f.click('support-back'); f.click('preview-annual'); assert.match(f.d.querySelector('#dialog-content').textContent,/\$10\/year/); f.click('support-back'); f.click('preview-support','5'); assert.match(f.d.querySelector('#dialog-content').textContent,/one-time \$5/); assert.equal(f.d.querySelectorAll('#dialog input').length,0);
} finally {f.close();}});

test('runtime has no network, persistence, tracking, camera or file-reading calls', () => {
  assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|document\.cookie|serviceWorker|getUserMedia|FileReader|createObjectURL/);
  assert.match(html,/connect-src 'none'/); assert.match(html,/form-action 'none'/); assert.match(html,/noindex, nofollow, noarchive/);
  assert.doesNotMatch(html,/https?:\/\//); const external = [...source.matchAll(/https?:\/\/[^"'<>\s]+/g)].map(m => m[0]); assert.deepEqual(external,['https://chempatible.com/terms','https://chempatible.com/privacy']);
});

test('responsive CSS uses single-column mobile layouts, 16px inputs and 44px touch targets', () => {const f = fixture(); try {
  const style = f.d.createElement('style'); style.textContent = css; f.d.head.append(style); const rules = [...style.sheet.cssRules]; style.remove();
  const atWidth = (items,width) => items.map(rule => {if(rule.type !== f.w.CSSRule.MEDIA_RULE) return rule.cssText; if(rule.conditionText.includes('prefers-reduced-motion')) return ''; const match = rule.conditionText.match(/^\((min|max)-width:\s*(\d+)px\)$/); assert.ok(match,rule.conditionText); return (match[1] === 'min' ? width >= +match[2] : width <= +match[2]) ? atWidth([...rule.cssRules],width) : '';}).join('\n');
  for(const width of [320,375,390,430,760,1024,1440]) {
    const viewportStyle = f.d.createElement('style'); viewportStyle.textContent = atWidth(rules,width); f.d.head.append(viewportStyle); f.route('home');
    assert.equal(f.w.getComputedStyle(f.d.querySelector('.hero')).display,width <= 760 ? 'block' : 'grid',`${width}: hero`); assert.equal(f.w.getComputedStyle(f.d.querySelector('.steps')).gridTemplateColumns,width <= 760 ? '1fr' : 'repeat(3,1fr)'); assert.ok(parseFloat(f.w.getComputedStyle(f.d.querySelector('.button')).minHeight) >= 44);
    f.route('join'); assert.equal(f.w.getComputedStyle(f.d.querySelector('#joinContact')).fontSize,'16px'); assert.equal(f.w.getComputedStyle(f.d.querySelector('.registration-layout')).gridTemplateColumns,width <= 760 ? '1fr' : '1fr 1.25fr');
    f.route('dashboard'); assert.equal(f.w.getComputedStyle(f.d.querySelector('.request-list')).gridTemplateColumns,width <= 760 ? '1fr' : width <= 1050 ? 'repeat(2,1fr)' : 'repeat(3,1fr)'); f.click('invite'); assert.equal(f.w.getComputedStyle(f.d.querySelector('.close')).width,'44px'); f.click('close'); viewportStyle.remove();
  }
} finally {f.close();}});


test('existing-page sign-in preserves stacked email then six digit code sequence', () => {const f = fixture('host'); try {
  f.click('request'); f.click('show-signin'); assert.match(f.d.querySelector('h1').textContent,/Sign in/); assert.ok(f.d.querySelector('#signinEmail')); assert.equal(f.d.querySelector('#signinCode'),null);
  f.advance('#signin-form'); assert.match(f.d.querySelector('#joinError').textContent,/sample email/); f.value('signinEmail','returning@example.com'); f.advance('#signin-form'); assert.ok(f.d.querySelector('#signinCode')); assert.match(f.d.querySelector('main').textContent,/SIGN IN/);
  f.click('resend-code'); assert.match(f.d.querySelector('#joinError').textContent,/No email has been sent/); f.click('show-signin'); assert.equal(f.d.querySelector('#signinEmail').value,'returning@example.com'); f.advance('#signin-form'); f.value('signinCode','246810'); f.advance('#signin-code-form'); assert.ok(f.d.querySelector('#request-intro')); assert.match(f.d.querySelector('main').textContent,/Sample profile · No account created/);
} finally {f.close();}});

test('host request and member lists do not expose email addresses', () => {const f = fixture(); try {
  request(f); f.route('dashboard'); assert.doesNotMatch(f.d.querySelector('main').textContent,/@example.com/); f.click('approve','visitor'); f.route('members'); assert.doesNotMatch(f.d.querySelector('main').textContent,/@example.com/); f.route('circle'); assert.doesNotMatch(f.d.querySelector('main').textContent,/@example.com/);
} finally {f.close();}});


test('browser Back and Forward preserve registration details without bypassing the current step', async () => {const f = fixture('host'); try {
  f.click('request'); f.value('joinName','Jordan'); f.value('joinContact','jordan@example.com'); f.d.querySelector('#joinAgree').checked = true; f.advance('#join-form');
  await new Promise(resolve => f.w.setTimeout(resolve,15));
  const back = new Promise(resolve => f.w.addEventListener('popstate',resolve,{once:true})); f.w.history.back(); await back;
  assert.ok(f.d.querySelector('#joinName')); assert.equal(f.d.querySelector('#joinContact').value,'jordan@example.com');
  const forward = new Promise(resolve => f.w.addEventListener('popstate',resolve,{once:true})); f.w.history.forward(); await forward;
  assert.ok(f.d.querySelector('#signinCode')); assert.equal(f.d.querySelector('#request-intro'),null);
} finally {f.close();}});

test('suppressed native submission still shows Gmail-alias and checkbox errors before Continue, then advances sample input',()=>{const f=fixture('join');try{
  f.value('joinName','Tester');f.value('joinContact','tester+wildhost@gmail.com');f.d.querySelector('#joinAgree').checked=true;
  f.advance('#join-form');let error=f.d.querySelector('#joinError');assert.match(error.textContent,/sample email addresses only/);assert.match(error.textContent,/taylor@example.com/);assert.match(error.textContent,/Nothing will be sent/);assert.equal(f.w.location.hash,'#join');assert.equal(f.d.activeElement,error);assert.equal(error.nextElementSibling.dataset.action,'continue-details');assert.equal(f.d.querySelector('#joinContact').getAttribute('aria-invalid'),'true');assert.equal(f.d.querySelector('#joinContact').getAttribute('aria-describedby'),'joinError');assert.equal(f.d.querySelector('#joinContact').value,'tester+wildhost@gmail.com');assert.equal(f.nativeSubmissions(),0);
  f.value('joinContact','tester@example.com');f.d.querySelector('#joinAgree').checked=false;f.advance('#join-form');error=f.d.querySelector('#joinError');assert.match(error.textContent,/adult and terms acknowledgement/);assert.equal(f.d.activeElement,error);assert.equal(f.d.querySelector('#joinAgree').getAttribute('aria-invalid'),'true');assert.equal(f.d.querySelector('#joinContact').hasAttribute('aria-invalid'),false);assert.equal(f.w.location.hash,'#join');
  f.d.querySelector('#joinAgree').checked=true;f.advance('#join-form');assert.equal(f.w.location.hash,'#join-code');assert.ok(f.d.querySelector('#signinCode'));assert.match(f.d.querySelector('main').textContent,/No email has been sent/);assert.match(f.d.querySelector('main').textContent,/does not verify an email address or a person’s identity/);assert.equal(f.nativeSubmissions(),0);assert.equal(f.w.localStorage.length,0);assert.equal(f.w.sessionStorage.length,0);assert.equal(f.d.cookie,'');
}finally{f.close()}});

test('Enter handles details and code locally; textarea Enter remains a newline and Control-Enter previews the request',()=>{const f=fixture('join');try{
  f.value('joinName','Tester');f.value('joinContact','tester@example.com');f.enter('#joinContact');assert.match(f.d.querySelector('#joinError').textContent,/adult and terms/);f.d.querySelector('#joinAgree').checked=true;f.enter('#joinContact');assert.equal(f.w.location.hash,'#join-code');
  f.value('signinCode','000000');f.enter('#signinCode');assert.match(f.d.querySelector('#joinError').textContent,/246810/);assert.equal(f.d.activeElement,f.d.querySelector('#joinError'));f.value('signinCode','246810');f.enter('#signinCode');assert.equal(f.w.location.hash,'#join-photo');f.enter('[data-action="camera"]');f.enter('[data-action="capture"]');assert.equal(f.w.location.hash,'#introduce');f.value('request-intro','A synthetic introduction.');f.enter('#request-intro');assert.equal(f.w.location.hash,'#introduce');assert.equal(f.w.__test.getState().ownRequest,null);f.enter('#request-intro',{ctrlKey:true});assert.equal(f.w.location.hash,'#host');assert.equal(f.w.__test.getState().requests.filter(r=>r.id==='visitor').length,1);assert.equal(f.nativeSubmissions(),0);
}finally{f.close()}});

test('sign-in and invitation controls advance on click or Enter without browser submission',()=>{const f=fixture('signin');try{
  f.value('signinEmail','tester+wildhost@gmail.com');f.advance('#signin-form');assert.match(f.d.querySelector('#joinError').textContent,/sample email addresses only/);assert.equal(f.d.activeElement,f.d.querySelector('#joinError'));f.value('signinEmail','tester@example.com');f.enter('#signinEmail');assert.equal(f.w.location.hash,'#signin-code');f.value('signinCode','246810');f.advance('#signin-code-form');assert.equal(f.w.location.hash,'#introduce');f.route('dashboard');f.click('invite');f.value('invite-name','Tester');f.value('invite-email','tester+wildhost@gmail.com');f.enter('#invite-email');assert.match(f.d.querySelector('#invite-error').textContent,/valid email at example.com/);assert.equal(f.d.activeElement,f.d.querySelector('#invite-error'));f.value('invite-email','tester@example.com');f.enter('#invite-email');assert.match(f.d.querySelector('#dialog-content').textContent,/EMAIL PREVIEW · NOT SENT/);assert.equal(f.nativeSubmissions(),0);
}finally{f.close()}});

test('every prototype step uses an explicit local button and preserves form field order',()=>{const f=fixture();try{
  const check=()=>{for(const form of f.d.querySelectorAll('form')){assert.ok(form.dataset.stepAction);const primary=form.querySelector(`[data-action="${form.dataset.stepAction}"]`);assert.ok(primary);assert.equal(primary.type,'button');for(const button of form.querySelectorAll('button'))assert.equal(button.getAttribute('type'),'button');assert.equal(form.getAttribute('action'),null);assert.equal(form.querySelector('[type=submit]'),null)}};
  f.route('join');check();assert.deepEqual([...f.d.querySelectorAll('#join-form input')].map(el=>el.id),['joinName','joinContact','joinAgree']);details(f);check();f.value('signinCode','246810');f.advance('#code-form');f.click('choose-photo');f.click('use-photo');check();f.route('signin');check();f.value('signinEmail','tester@example.com');f.advance('#signin-form');check();f.route('dashboard');f.click('invite');check();assert.equal(f.nativeSubmissions(),0);
}finally{f.close()}});

test('held activation keys suppress native repeats without capturing a photo or advancing a form',()=>{const f=fixture();try{
  photo(f);f.enter('[data-action="camera"]');assert.equal(f.w.location.hash,'#join-photo');assert.equal(f.w.__test.getState().join.photo,false);
  const repeat=(selector,key='Enter')=>{const event=new f.w.KeyboardEvent('keydown',{key,repeat:true,bubbles:true,cancelable:true});f.d.querySelector(selector).dispatchEvent(event);assert.equal(event.defaultPrevented,true,selector+' native repeat prevented');};
  repeat('[data-action="capture"]');assert.equal(f.w.__test.getState().join.photo,false);assert.equal(f.w.location.hash,'#join-photo');repeat('[data-action="choose-photo"]',' ');assert.equal(f.d.querySelector('#dialog').open,false);
  f.route('join');repeat('#joinContact');assert.equal(f.w.location.hash,'#join');assert.equal(f.d.querySelector('#joinError').textContent,'');assert.equal(f.nativeSubmissions(),0);
}finally{f.close()}});
