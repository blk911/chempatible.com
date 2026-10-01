import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const files=['api/_ops.mjs','api/admin.mjs','api/email.mjs','api/friend.mjs','api/member.mjs','game.js','index.html','friend.html','admin-login.html','admin/index.html','admin.js','admin-ops.js'];
for(const file of files){const source=read(file);assert.doesNotMatch(source,/Chem-patible|chem-PATIBLE|Chem-<em>patible|brand-logo\.png/,file+' retains old visible branding');assert.doesNotMatch(source,/duhwild\.com/i,file+' must keep the existing domain');}
for(const file of ['api/_ops.mjs','api/email.mjs','api/friend.mjs'])assert.match(read(file),/from:\{email:'hello@chempatible\.com',name:'Duh Wild'\}/,'new display name preserves verified sender');
for(const file of ['api/member.mjs','api/admin.mjs','api/email.mjs'])assert.match(read(file),/is your Duh Wild (?:admin )?code/,'generated subject spelling');
const game=read('game.js');assert.match(game,/button\('IN DUH WILD →','createMyVibe\(\)'\)/,'existing explicit invitation action');assert.match(game,/Catch a vibe\.<br><em>In Duhwild\.<\/em>/,'approved landing headline');assert.match(game,/const KEY='chempatibility\.walkthrough\.v7'/,'saved state key retained');
for(const file of ['friend.html','privacy.html','terms.html','admin-login.html','admin/index.html']){const source=read(file);assert.match(source,/class="brandWordmark">Duh <em>Wild<\/em>/,'consistent wordmark');assert.doesNotMatch(source,/<img[^>]+brand-logo/,'old raster logo is not rendered');}
assert.match(read('terms.html'),/These Terms are an agreement between you and Chem-patible/,'legal counterparty preserved');assert.match(read('privacy.html'),/This policy explains how Chem-patible/,'existing operator preserved');
for(const file of ['privacy.html','terms.html'])assert.match(read(file),/mailto:hello@chempatible\.com/,'real support address preserved');
for(const file of ['index.html','friend.html']){assert.match(read(file),/https:\/\/chempatible\.com\/duh-wild-og\.png/,'branded social image on unchanged domain');assert.match(read(file),/\/duh-wild-icon\.png/);}
const allowlist=read('.vercelignore');for(const file of ['duh-wild-og.png','duh-wild-icon.png','duh-wild-apple.png']){assert.ok(allowlist.split('\n').includes('!/'+file));const bytes=fs.readFileSync(new URL('../'+file,import.meta.url));assert.equal(bytes.subarray(1,4).toString(),'PNG');}
for(const old of ['brand-logo.png','og-image.png','favicon.png','apple-touch-icon.png'])assert.ok(!allowlist.split('\n').includes('!/'+old),'obsolete brand bitmap stays out of deployment');
// Verify the public copy sits immediately above working entry controls and stays
// scoped to the public opening when sign-in, verification, and photo steps render.
const dom=new JSDOM(read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''),{url:'https://brand.example/',runScripts:'dangerously'}),w=dom.window,d=w.document;
w.fetch=async()=>({ok:false,status:401,json:async()=>({})});w.setInterval=()=>0;w.scrollTo=()=>{};
const style=d.createElement('style');style.textContent=read('site.css');d.head.append(style);
const script=d.createElement('script');script.textContent=game;d.body.append(script);
try{
 const entry=d.querySelector('.landingEntry');assert.ok(entry);
 // Match the layout suite's explicit media-rule activation. JSDOM cannot
 // measure viewport geometry, but it can verify responsive rules and targets.
 const cssRules=[...style.sheet.cssRules];
 const cssAtWidth=(rules,width)=>rules.map(rule=>{
  if(rule.type!==w.CSSRule.MEDIA_RULE)return rule.cssText;
  const matches=rule.conditionText.split(/\s+and\s+/).every(condition=>{
   const match=condition.match(/^\((min|max)-width:\s*(\d+)px\)$/);
   assert.ok(match,`landing test must handle media condition ${condition}`);
   return match[1]==='min'?width>=Number(match[2]):width<=Number(match[2]);
  });
  return matches?cssAtWidth([...rule.cssRules],width):'';
 }).join('\n');
 style.remove();
 for(const width of [320,375,390,430,700,701,1280]){
  const viewportCss=d.createElement('style');viewportCss.textContent=cssAtWidth(cssRules,width);d.head.append(viewportCss);
  assert.equal(w.getComputedStyle(entry).paddingLeft,width<=700?'18px':'32px',`${width}px: landing form keeps compact gutters`);
  for(const input of entry.querySelectorAll('.joinInput')){
   const inputStyle=w.getComputedStyle(input);
   assert.equal(inputStyle.width,'100%',`${width}px: input follows available form width`);
   assert.equal(inputStyle.fontSize,'16px',`${width}px: typing does not trigger mobile zoom`);
   assert.ok(parseFloat(inputStyle.minHeight)>=48,`${width}px: inputs stay touch-friendly`);
  }
  const actionStyle=w.getComputedStyle(entry.querySelector('.nextButton'));
  assert.equal(actionStyle.width,'100%');assert.ok(parseFloat(actionStyle.minHeight)>=48);
  assert.equal(w.getComputedStyle(d.querySelector('.landingWordmark')).display,'inline-block');
  assert.equal(w.getComputedStyle(d.querySelector('.appWordmark')).display,'none');
  viewportCss.remove();
 }
 d.head.append(style);
 assert.equal(entry.querySelector('h1').textContent,'Catch a vibe.In Duhwild.');
 assert.equal(entry.querySelector('.entryHook').textContent,'You weren’t looking. Then you caught their eye.');
 assert.equal(entry.querySelector('.entryInvitation').textContent,'Skip the pickup line. Give them something to discover.');
 assert.equal(entry.querySelector('.entryInvitation').nextElementSibling.id,'joinName');
 assert.equal(d.querySelector('#joinName').nextElementSibling.id,'joinContact');
 assert.equal(d.querySelector('#joinContact').type,'email');
 assert.equal(entry.querySelector('.nextButton').textContent,'Get my vibe ready →');
 assert.equal(entry.querySelector('.entryPromise').textContent,'Your photo. Five secrets. Your move.');
 assert.equal(entry.querySelector('.entryPrivacy').textContent,'Your email stays private.');
 assert.equal(entry.querySelectorAll('img,video,.friendShareButton').length,0);
 assert.equal(d.querySelector('.landingWordmark').textContent,'Duhwild');
 assert.equal(w.getComputedStyle(d.querySelector('.landingWordmark')).display,'inline-block');
 assert.equal(w.getComputedStyle(d.querySelector('.appWordmark')).display,'none');
 assert.equal(w.getComputedStyle(entry.querySelector('h1')).color,'rgb(113, 67, 156)');
 assert.ok(parseFloat(w.getComputedStyle(d.querySelector('#joinName')).minHeight)>=48);
 assert.ok(parseFloat(w.getComputedStyle(entry.querySelector('.nextButton')).minHeight)>=48);
 assert.equal(d.querySelector('#joinAgree').checked,false);
 assert.equal(entry.querySelector('.agree a').getAttribute('href'),'/terms');
 assert.equal(entry.querySelector('.agree a:last-child').getAttribute('href'),'/privacy');
 entry.querySelector('.nextButton').click();assert.match(d.querySelector('#joinError').textContent,/first name and email/);
 d.querySelector('#joinName').value='Taylor';d.querySelector('#joinContact').value='taylor@example.com';
 entry.querySelector('.nextButton').click();assert.match(d.querySelector('#joinError').textContent,/18 or older/);
 entry.querySelector('[onclick="showSignin()"]').click();assert.ok(d.querySelector('#signinEmail'));assert.equal(d.querySelector('.landingEntry'),null);
 assert.equal(w.getComputedStyle(d.querySelector('.landingWordmark')).display,'none');
 assert.equal(w.getComputedStyle(d.querySelector('.appWordmark')).display,'inline-block');
 w.startFresh();assert.ok(d.querySelector('.landingEntry'));
 w.eval("s.joinStep='joinCode';s.signinEmail='taylor@example.com';render()");
 assert.ok(d.querySelector('#signinCode'));assert.equal(d.querySelector('.landingEntry'),null);
 w.eval('s.joinStep=2;render()');assert.ok(d.querySelector('#memberPhoto'));assert.ok(d.querySelector('#cameraPreview'));assert.equal(d.querySelector('.landingEntry'),null);
 w.backToDetails();assert.ok(d.querySelector('.landingEntry'));
 w.eval("s.friendToken='synthetic-friend';render()");
 assert.equal(d.querySelector('.instantEntry h1').textContent,'Make your page.');
 assert.equal(d.querySelector('.instantEntry .nextButton').textContent,'CONTINUE →');
 assert.equal(d.querySelector('.landingEntry'),null);
}finally{w.close()}
console.log('Duhwild public landing, preserved entry steps, existing app/mail/legal branding, assets, domain, and state keys passed');
