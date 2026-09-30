import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHmac} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {deploymentMode,isTrustedLive} from '../api/_deployment.mjs';
import {reviewGate,reviewRecipientAllowed,requireReviewRecipient} from '../api/_review.mjs';
import publicConfig from '../api/config.mjs';

const keys=['CHEMPAT_RELEASE_MODE','VERCEL','VERCEL_PROJECT_ID','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','CHEMPAT_REVIEW_DATA','CHEMPAT_REVIEW_EMAILS'];
const live={CHEMPAT_RELEASE_MODE:'live',VERCEL:'1',VERCEL_PROJECT_ID:'prj_gtV01YIqkEfAfvdSbVopIfy2VpnJ',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'live'};
function configure(values={}){
 for(const key of keys)delete process.env[key];
 for(const [key,value] of Object.entries(values))if(value!==undefined)process.env[key]=value;
}

// Exercise every combination, including missing/invalid config, dev project's
// Production lane, live-branch previews, and review settings copied to live.
let combinations=0;
for(const release of [undefined,'','review','live','LIVE','invalid'])
for(const vercel of [undefined,'0','1'])
for(const project of [undefined,live.VERCEL_PROJECT_ID,'prj_development'])
for(const env of [undefined,'production','preview','development'])
for(const ref of [undefined,'main','live','review/test'])
for(const isolated of [undefined,'true','isolated-confirmed']){
 configure({CHEMPAT_RELEASE_MODE:release,VERCEL:vercel,VERCEL_PROJECT_ID:project,VERCEL_ENV:env,VERCEL_GIT_COMMIT_REF:ref,CHEMPAT_REVIEW_DATA:isolated,CHEMPAT_REVIEW_EMAILS:'approved@example.com'});
 const trusted=release==='live'&&vercel==='1'&&project===live.VERCEL_PROJECT_ID&&env==='production'&&ref==='live';
 const review=(!release||release==='review')&&project!==live.VERCEL_PROJECT_ID&&isolated==='isolated-confirmed';
 assert.equal(isTrustedLive(),trusted);
 assert.equal(deploymentMode(),trusted?'live':review?'review':'blocked');
 assert.equal(reviewGate()===null,trusted||review);
 assert.equal(reviewRecipientAllowed('approved@example.com'),trusted||review);
 assert.equal(reviewRecipientAllowed('public@example.net'),trusted);
 combinations++;
}

// The browser gets a single presentation boolean, never any configuration data.
// A blocked deployment returns 503 instead of confirming review availability.
process.env.DATABASE_URL='postgres://must-not-connect';
process.env.SENDGRID_API_KEY='must-not-send';
process.env.CHEMPAT_ADMIN_EMAIL='admin@example.com';
process.env.ADMIN_SESSION_SECRET='test-signing-key';
let networkCalls=0;
globalThis.fetch=async()=>{networkCalls++;throw Error('Unexpected network access')};
const middleware=(await import('../middleware.js')).default;
const request=(path='/',options={})=>new Request('https://chempatible.com'+path,options);
const invalidLive=[{},...Object.keys(live).map(key=>({...live,[key]:undefined})),{...live,VERCEL_PROJECT_ID:'prj_development'},{...live,VERCEL_ENV:'preview'},{...live,VERCEL_GIT_COMMIT_REF:'main'},{...live,CHEMPAT_RELEASE_MODE:'review'}];
const modes=[...invalidLive.map(values=>({...values,CHEMPAT_REVIEW_DATA:'isolated-confirmed',CHEMPAT_REVIEW_EMAILS:'approved@example.com'})),live];
for(const values of modes){
 configure(values);
 const trusted=isTrustedLive();
 const config=await publicConfig.fetch(request('/api/config?live=true'));
 assert.equal(config.headers.get('cache-control'),'no-store');
 assert.equal(config.status,deploymentMode()==='blocked'?503:200);
 assert.deepEqual(await config.json(),{reviewOnly:!trusted});
 const head=await publicConfig.fetch(request('/api/config',{method:'HEAD'}));
 assert.equal(head.status,config.status);
 assert.equal(await head.text(),'');
 for(const path of ['/','/privacy','/terms','/game.js','/robots.txt']){
  const response=await middleware(request(path,{headers:{'x-vercel-project-id':live.VERCEL_PROJECT_ID,'x-chempat-release-mode':'live'}}));
  assert.equal(response.headers.get('x-middleware-next'),'1');
  assert.equal(response.headers.get('x-robots-tag'),trusted?null:'noindex, nofollow, noarchive');
 }
 for(const path of ['/api/member','/api/config','/admin-login','/?invite=private-token','/?token=private-token','/?invite=']){
  assert.equal((await middleware(request(path))).headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
 }
 // Existing admin auth is enforced in every mode, regardless of release flag.
 assert.equal((await middleware(request('/admin'))).status,307);
 for(const path of ['/admin.js','/admin-ops.js'])assert.equal((await middleware(request(path))).status,401);
 const expires=Date.now()+60000;
 const signature=createHmac('sha256',process.env.ADMIN_SESSION_SECRET).update(`admin|admin@example.com|${expires}`).digest('hex');
 const authenticated=await middleware(request('/admin',{headers:{cookie:`chempat_admin=${expires}.${signature}`}}));
 assert.equal(authenticated.headers.get('x-middleware-next'),'1');
 assert.equal(authenticated.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
 if(deploymentMode()==='blocked'){
  for(const name of ['admin','connection','email','member','qr']){
   const api=(await import(`../api/${name}.mjs`)).default;
   for(const method of ['GET','POST']){
    const response=await api.fetch(request(`/api/${name}?live=true`,{method,...(method==='POST'?{headers:{'content-type':'application/json'},body:JSON.stringify({action:'register',releaseMode:'live'})}:{})}));
    assert.equal(response.status,503,`${name} ${method}: invalid live mode blocked`);
   }
  }
 }
}
assert.equal((await publicConfig.fetch(request('/api/config',{method:'POST'}))).status,405);
assert.equal(await (await publicConfig.fetch(request('/api/config',{method:'HEAD'}))).text(),'');
assert.equal(networkCalls,0,'mode, presentation, and blocked API checks never access network');

configure(live);
for(const address of [null,'','bad','one@example.com,two@example.com','one@example.com;two@example.com','one@example.com\r\nBcc: two@example.com','a'.repeat(250)+'@example.com']){
 assert.equal(reviewRecipientAllowed(address),false,'live still rejects invalid/multiple recipients');
 assert.throws(()=>requireReviewRecipient(address));
}
assert.equal(reviewRecipientAllowed(' Public@Example.NET '),true);
const ops=await import('../api/_ops.mjs');
const sent=[];
globalThis.fetch=async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return {ok:true,status:202}};
await ops.sendMail('public@example.net','test','test');
assert.equal(sent.length,1);
assert.equal(sent[0].body.personalizations[0].to[0].email,'public@example.net');
configure({...live,VERCEL_PROJECT_ID:'prj_development',CHEMPAT_REVIEW_DATA:'isolated-confirmed',CHEMPAT_REVIEW_EMAILS:'public@example.net'});
await assert.rejects(ops.sendMail('public@example.net','test','test'),/approved test recipients/);
assert.equal(sent.length,1,'copied live config on dev cannot contact provider');

// Cold loads stay unlabelled until the response and its JSON body have resolved.
// Only confirmed review displays that label; failures get a neutral notice.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../deployment.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../site.css',import.meta.url),'utf8');
assert.match(html,/<script src="deployment\.js"><\/script>/);
assert.match(css,/\.reviewBanner\[hidden\]\{display:none!important\}/,'hidden cannot be overridden by a banner display rule');
const unavailable='Service temporarily unavailable. Please try again.';
const cases=[
 ['live',{ok:true,json:async()=>({reviewOnly:false})},true,'Review version'],
 ['review',{ok:true,json:async()=>({reviewOnly:true})},false,'Review version'],
 ['missing boolean',{ok:true,json:async()=>({})},false,unavailable],
 ['string boolean',{ok:true,json:async()=>({reviewOnly:'false'})},false,unavailable],
 ['null body',{ok:true,json:async()=>null},false,unavailable],
 ['failed live response',{ok:false,json:async()=>({reviewOnly:false})},false,unavailable],
 ['blocked response',{ok:false,status:503,json:async()=>({reviewOnly:true})},false,unavailable],
 ['invalid JSON',{ok:true,json:async()=>{throw Error('Invalid JSON')}},false,unavailable],
 ['offline',null,false,unavailable]
];
for(const path of ['/','/?invite=private-token','/?token=private-token','/?live=true']){
 for(const [name,response,hidden,label] of cases){
  const dom=new JSDOM(html,{url:'https://chempatible.com'+path,runScripts:'outside-only'});
  const {document}=dom.window,banner=document.getElementById('reviewBanner');
  const style=document.createElement('style');style.textContent=css;document.head.append(style);
  const assertHidden=()=>{
   assert.equal(banner.hidden,true,`${path} ${name}: hidden before mode confirmation`);
   assert.equal(dom.window.getComputedStyle(banner).display,'none',`${path} ${name}: no painted banner`);
  };
  assertHidden();
  let fetched,resolveFetch;
  dom.window.fetch=(path,options)=>{fetched={path,options};return new Promise(resolve=>{resolveFetch=resolve})};
  const complete=dom.window.eval(client);
  assertHidden();
  await new Promise(resolve=>setTimeout(resolve,0));
  assertHidden();
  assert.equal(fetched.path,'/api/config');
  assert.equal(fetched.options.cache,'no-store');
  assert.equal(fetched.options.credentials,'omit');
  if(response?.ok){
   let resolveBody,bodyRequested;
   const parsing=new Promise(resolve=>{bodyRequested=resolve});
   resolveFetch({...response,json:()=>new Promise(resolve=>{resolveBody=resolve;bodyRequested()})});
   await parsing;
   assertHidden();
   resolveBody(Promise.resolve().then(()=>response.json()));
  }else resolveFetch(response||Promise.reject(Error('Offline')));
  await complete;
  assert.equal(banner.hidden,hidden,`${path} ${name}: final visibility`);
  assert.equal(banner.textContent,label,`${path} ${name}: truthful final label`);
  assert.equal(dom.window.getComputedStyle(banner).display==='none',hidden);
  dom.window.close();
 }
}
// Legal and admin pages do not load or render this notice.
for(const page of ['privacy.html','terms.html','admin-login.html','admin/index.html']){
 const source=fs.readFileSync(new URL('../'+page,import.meta.url),'utf8');
 assert.doesNotMatch(source,/reviewBanner|deployment\.js|Review version/,page);
}

// Keep headers dynamic and ensure the runtime packaging includes every addition.
const vercel=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
assert.equal(vercel.headers.flatMap(rule=>rule.headers).some(header=>header.key.toLowerCase()==='x-robots-tag'),false);
const allowlist=fs.readFileSync(new URL('../.vercelignore',import.meta.url),'utf8').split('\n');
for(const path of ['api/_deployment.mjs','api/config.mjs','deployment.js'])assert.ok(allowlist.includes('!/'+path));
console.log(`Deployment mode: ${combinations} combinations; fail-closed APIs, exact dev mail, live mail, robots, cold/delayed notice states, neutral failures, config privacy, and admin auth passed`);
