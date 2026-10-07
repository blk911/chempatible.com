import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {REWARD_ROUNDS} from '../api/_reward-rounds.mjs';

// Synthetic DOM/state-machine coverage only: no accounts, network, SMS or grants.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../site.css',import.meta.url),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
const reply=(body,status=200)=>({ok:status<400,status,json:async()=>copy(body)});
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve))};
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve}};
const connectionId='a'.repeat(64),photo='data:image/jpeg;base64,AA==';
const connection={id:connectionId,kind:'vibe',channel:'email',status:'chat',side:'member',prospect_name:'Morgan',prospect_photo:photo,own_answers:Array(10).fill(0),prospect_answers:Array(10).fill(1),messages:[]};
function account(level=2,phoneProfile={phone:null,confirmedAt:null,revision:0}){return {level,phoneProfile:copy(phoneProfile),answers:{},draftRevision:0,offered:null,grants:0}}
function serverFor(level=2,phoneProfile){return {accounts:{owner:account(level,phoneProfile),other:account()},calls:[],intercept:null}}
function snapshot(server,id='owner',withConnection=false){const own=server.accounts[id];return {level:own.level,rounds:REWARD_ROUNDS,answers:{...(own.level>=2?Object.fromEntries(Array.from({length:5},(_,i)=>['base-'+(i+6),0])):{}),...own.answers},draftRevision:own.draftRevision,phoneProfile:copy(own.phoneProfile),connections:[],...(withConnection?{connection:{id:connectionId,phone:{eligible:own.level>=2,ownEligible:own.level>=2,otherEligible:true,ownOffered:!!own.offered,otherOffered:false,shared:false,...(own.offered?{ownPhone:own.offered}:{})}}}:{})}}
async function fixture({level=2,phoneProfile,server=serverFor(level,phoneProfile),friendOnly=false}={}){
 const dom=new JSDOM(html,{url:'https://phone-step.example.test/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
 w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):null,id=options.headers?.['x-chempat-member-id']||'owner',call={url,body,id};server.calls.push(call);
  if(server.intercept){const result=server.intercept(call);if(result)return result}
  if(url==='/api/connection?inbox=1')return reply({connections:friendOnly?[]:[connection]});
  if(url.startsWith('/api/discovery'))return reply({modules:[],games:[],pieces:[]});
  if(url.startsWith('/api/game-pieces?'))return reply({pieces:[],pendingCount:0});
  if(url==='/api/rewards?phoneRequests=1')return reply({phoneRequests:[]});
  if(url==='/api/wildcards?summary=1')return reply({connections:[]});
  if(url.startsWith('/api/wildcards'))return reply({connectionId,eligible:false,limit:3,remaining:0,usedQuestionIds:[],categories:[],cards:[],answerMaxLength:1000});
  if(!url.startsWith('/api/rewards'))return reply({},401);
  const own=server.accounts[id];if(!own)return reply({error:'Please sign in again.'},401);
  if(body?.action==='confirmProfilePhone'){
   if(body.phoneRevision!==own.phoneProfile.revision)return reply({error:'Your number changed elsewhere.',phoneConflict:true},409);
   own.phoneProfile={phone:body.phone.replace(/[\s().-]/g,''),confirmedAt:'2026-10-06T23:30:00.000Z',revision:own.phoneProfile.revision+1};
  }
  if(body?.action==='offerPhone')own.offered=body.phone;
  if(['save','complete'].includes(body?.action)){
   if(body.level!==own.level+1)return reply({error:'Completed rounds cannot be played again.'},409);
   own.answers={...own.answers,...body.answers};own.draftRevision++;
   if(body.action==='complete'){own.level=body.level;own.grants++}
  }
  return reply(snapshot(server,id,!!body?.connectionId||url.includes('connection=')));
 };
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 const mount=(id='owner')=>{const data=server.accounts[id],own={id,name:id==='owner'?'Taylor':'Casey',contact:`${id}@example.test`,photo,answers:Array(data.level>=2?10:data.level?5:0).fill(0),verified:true};w.eval(`s={...blank(),view:'dashboard',member:${JSON.stringify(own)},account:${JSON.stringify(own)},memberId:${JSON.stringify(id)},liveMember:true,inbox:${JSON.stringify(friendOnly?[]:[connection])},selectedChempat:${JSON.stringify(friendOnly?'':connectionId)},phase:'chat'};render()`)};
 mount();await flush();
 return {w,d,server,mount,posts:()=>server.calls.filter(c=>c.body&&c.url==='/api/rewards'),close:()=>w.close()};
}
function input(f,value){const el=f.d.querySelector('#rewardProfilePhone');assert.ok(el);el.value=value;el.dispatchEvent(new f.w.Event('input',{bubbles:true}));return el}
function allAnswers(f,level){for(const q of REWARD_ROUNDS.find(round=>round.level===level).questions)f.w.chooseRewardAnswer(q.id,0)}
const savedPhone={phone:'+15552223333',confirmedAt:'2026-10-06T22:00:00.000Z',revision:2};

test('Step 2 unlock captures a private number without requiring a Vibe connection',async()=>{
 const f=await fixture({level:1,friendOnly:true});try{
  f.w.openRewardLevel(2);allAnswers(f,2);await f.w.rewardAction('complete');
  assert.match(f.d.querySelector('.rewardStepContext').textContent,/Step 2 complete/);
  assert.equal(f.d.querySelector('#rewardProfilePhone').value,'');
  assert.match(f.d.querySelector('#rewardProfilePhoneHelp').textContent,/separately offer.*named connection.*No text message/);
  assert.equal(f.d.querySelectorAll('.rewardStepTrail button').length,5);
  assert.equal(f.d.querySelectorAll('.rewardStep.completed').length,2);
  assert.equal(f.d.querySelectorAll('.rewardStep.current').length,1);
  assert.equal(f.d.querySelectorAll('.rewardStep.locked').length,2);
  assert.equal(f.d.querySelector('.rewardStep[aria-current="step"]').dataset.rewardStep,'2');
  input(f,'+1 555 222 3333');await f.w.confirmRewardProfilePhone();
  assert.equal(f.server.accounts.owner.phoneProfile.phone,'+15552223333');
  assert.equal(f.posts().at(-1).body.action,'confirmProfilePhone');assert.equal(f.posts().at(-1).body.phoneRevision,0);
  assert.equal(f.posts().filter(c=>c.body.action==='offerPhone').length,0);
  assert.match(f.d.querySelector('#rewardProfilePhoneStatus').textContent,/saved privately.*No phone offer/);
  assert.equal(f.d.querySelector('.rewardNextStep .rewardPrimary').textContent,'Next: Step 3 · Play five →');
  assert.equal(f.server.accounts.owner.grants,1);
  for(const storage of [f.w.localStorage,f.w.sessionStorage])assert.ok(!JSON.stringify({...storage}).includes('555'),'phone is not persisted in browser storage');
  assert.ok(!JSON.stringify(f.w.eval('s')).includes('555'),'private number is not copied into persisted walkthrough state');
 }finally{f.close()}
});

test('saved and legacy numbers display with explicit confirm and edit; a new page recovers the saved number',async()=>{
 const server=serverFor(2,{phone:'+442079460123',confirmedAt:null,revision:0});
 const first=await fixture({server});try{
  first.w.openRewardLevel(2);assert.match(first.d.querySelector('.rewardSavedPhone').textContent,/\+442079460123.*please confirm/);
  assert.equal(first.d.querySelector('#rewardProfilePhone'),null);
  assert.ok(first.d.querySelector('[onclick="confirmRewardProfilePhone()"]'));
  await first.w.confirmRewardProfilePhone();assert.equal(server.accounts.owner.phoneProfile.revision,1);
  first.w.editRewardProfilePhone();assert.equal(first.d.activeElement.id,'rewardProfilePhone');
  input(first,'+33 1 23 45 67 89');await first.w.confirmRewardProfilePhone();
 }finally{first.close()}
 const reopened=await fixture({server});try{reopened.w.openRewardLevel(2);assert.match(reopened.d.querySelector('.rewardSavedPhone').textContent,/\+33123456789.*Confirmed by you/);assert.equal(reopened.server.accounts.owner.level,2)}finally{reopened.close()}
});

test('private confirmation never offers a number; named offer prefills but still needs its separate review',async()=>{
 const f=await fixture({phoneProfile:savedPhone});try{
  f.w.openRewardPhone(connectionId);await flush();assert.equal(f.d.querySelector('#rewardPhone').value,savedPhone.phone);
  await f.w.rewardPhoneAction('offerPhone');assert.equal(f.posts().length,0);
  f.w.reviewRewardPhone();assert.match(f.d.querySelector('.rewardConsent').textContent,/\+15552223333.*Morgan/);
  assert.equal(f.posts().length,0);await f.w.rewardPhoneAction('offerPhone');
  assert.equal(f.posts()[0].body.action,'offerPhone');assert.equal(f.posts()[0].body.connectionId,connectionId);
  assert.equal(f.server.accounts.owner.phoneProfile.revision,2);
 }finally{f.close()}
 const unconfirmed=await fixture({phoneProfile:{...savedPhone,confirmedAt:null}});try{unconfirmed.w.openRewardPhone(connectionId);await flush();assert.equal(unconfirmed.d.querySelector('#rewardPhone').value,'')}finally{unconfirmed.close()}
});

test('invalid and failed private saves retain typed value, never grant progress, and can retry',async()=>{
 const f=await fixture();try{
  f.w.openRewardLevel(2);input(f,'555');await f.w.confirmRewardProfilePhone();assert.equal(f.posts().length,0);assert.equal(f.d.querySelector('#rewardProfilePhone').value,'555');assert.match(f.d.querySelector('#rewardProfilePhoneError').textContent,/country code/);
  input(f,'+1 555 444 1234');f.server.intercept=call=>call.body?.action==='confirmProfilePhone'?reply({error:'Try again shortly.'},503):null;
  await f.w.confirmRewardProfilePhone();assert.equal(f.d.querySelector('#rewardProfilePhone').value,'+1 555 444 1234');assert.match(f.d.querySelector('#rewardProfilePhoneError').textContent,/Try again/);
  f.server.intercept=null;await f.w.confirmRewardProfilePhone();assert.equal(f.server.accounts.owner.level,2);assert.equal(f.server.accounts.owner.grants,0);
 }finally{f.close()}
});

test('polling retains dirty input, focus and cursor and completed-step browsing preserves unfinished choices',async()=>{
 const f=await fixture();try{
  const opener=f.d.querySelector('[data-reward-level="2"]');opener.focus();opener.click();const field=input(f,'+1 555 444 1234');field.focus();field.setSelectionRange(5,8);
  await f.w.loadRewards(true);assert.equal(f.d.activeElement.id,'rewardProfilePhone');assert.equal(f.d.activeElement.value,'+1 555 444 1234');assert.equal(f.d.activeElement.selectionStart,5);assert.equal(f.d.activeElement.selectionEnd,8);
  f.d.querySelector('.rewardNextStep button').click();assert.match(f.d.querySelector('#rewardTitle').textContent,/Step 3/);assert.equal(f.d.querySelector('#rewardStatus').textContent,'');
  const q=REWARD_ROUNDS.find(round=>round.level===3).questions[0];f.w.chooseRewardAnswer(q.id,0);
  f.d.querySelector('[data-reward-step="2"]').click();assert.equal(f.d.querySelector('#rewardProfilePhone').value,'+1 555 444 1234');
  assert.equal(f.d.querySelector('.rewardQuestions'),null,'completed steps show reward context, not replay questions');
  f.d.querySelector('[data-reward-step="1"]').click();assert.match(f.d.querySelector('#rewardTitle').textContent,/Send a vibe unlocked/);assert.equal(f.d.querySelector('.rewardQuestions'),null);
  f.d.querySelector('[data-reward-step="5"]').click();assert.equal(f.d.querySelector('.rewardQuestions'),null);assert.match(f.d.querySelector('.rewardConsent').textContent,/Step 3 first/);
  await f.w.rewardAction('complete');assert.equal(f.posts().length,0,'locked and prior steps cannot grant rewards');
  f.d.querySelector('[data-reward-step="3"]').click();assert.equal(f.d.querySelector('.rewardQuestions input[value="0"]').checked,true);
  f.w.closeInvite();assert.equal(f.d.activeElement.dataset.rewardLevel,'2','close returns to the page opener across breadcrumb navigation');
 }finally{f.close()}
});

test('newer saved phone during polling cannot silently overwrite or rebase a dirty edit',async()=>{
 const f=await fixture({phoneProfile:savedPhone});try{
  f.w.openRewardLevel(2);f.w.editRewardProfilePhone();input(f,'+15557778888');
  f.server.accounts.owner.phoneProfile={...savedPhone,phone:'+15559990000',revision:3};await f.w.loadRewards(true);
  assert.equal(f.d.querySelector('#rewardProfilePhone').value,'+15557778888');assert.match(f.d.querySelector('.rewardPhoneConflict').textContent,/\+15559990000/);
  assert.equal(f.d.querySelector('[onclick="confirmRewardProfilePhone()"]').disabled,true);
  await f.w.confirmRewardProfilePhone();assert.equal(f.posts().length,0);
  f.w.reviewRewardProfileConflict();assert.equal(f.posts().length,0);await f.w.confirmRewardProfilePhone();assert.equal(f.posts()[0].body.phoneRevision,3);assert.equal(f.server.accounts.owner.phoneProfile.phone,'+15557778888');
 }finally{f.close()}
});

test('a 409 refresh retains the exact entry and requires another deliberate review before retry',async()=>{
 const f=await fixture({phoneProfile:savedPhone});try{
  f.w.openRewardLevel(2);f.w.editRewardProfilePhone();input(f,'+1 555 777 8888');f.server.accounts.owner.phoneProfile={...savedPhone,phone:'+15559990000',revision:3};
  await f.w.confirmRewardProfilePhone();assert.equal(f.posts().length,1);assert.equal(f.d.querySelector('#rewardProfilePhone').value,'+1 555 777 8888');
  assert.match(f.d.querySelector('#rewardProfilePhoneError').textContent,/changed elsewhere/);assert.equal(f.d.querySelector('[onclick="confirmRewardProfilePhone()"]').disabled,true);
  f.w.reviewRewardProfileConflict(true);assert.match(f.d.querySelector('.rewardSavedPhone').textContent,/\+15559990000/);assert.equal(f.posts().length,1);
 }finally{f.close()}
});

test('pending saves are duplicate-safe and never reopen, relabel or move a newer step',async()=>{
 const f=await fixture();try{
  f.w.openRewardLevel(2);input(f,'+15552223333');const hold=deferred();f.server.intercept=c=>c.body?.action==='confirmProfilePhone'?hold.promise:null;
  const pending=f.w.confirmRewardProfilePhone();await f.w.confirmRewardProfilePhone();assert.equal(f.posts().length,1);
  f.w.openRewardLevel(3);hold.resolve(reply({...snapshot(f.server),phoneProfile:{...savedPhone,revision:1}}));await pending;
  assert.match(f.d.querySelector('#rewardTitle').textContent,/Step 3/);assert.equal(f.d.querySelector('#rewardProfilePhone'),null);assert.equal(f.d.querySelector('#rewardStatus').textContent,'');
  f.w.openRewardLevel(2);assert.match(f.d.querySelector('.rewardSavedPhone').textContent,/\+15552223333/);
  f.w.editRewardProfilePhone();input(f,'+15553334444');const second=deferred();f.server.intercept=c=>c.body?.action==='confirmProfilePhone'?second.promise:null;const closing=f.w.confirmRewardProfilePhone();f.w.closeInvite();second.resolve(reply({...snapshot(f.server),phoneProfile:{...savedPhone,phone:'+15553334444',revision:2}}));await closing;assert.equal(f.d.querySelector('.rewardModal'),null);
 }finally{f.close()}
});

test('account switches and sign-out discard pending private reads, writes, form values and prefill',async()=>{
 for(const mutation of [false,true]){
  const f=await fixture({phoneProfile:savedPhone});try{
   f.w.openRewardLevel(2);const hold=deferred(),old=snapshot(f.server);
   f.server.intercept=c=>c.id==='owner'&&c.url==='/api/rewards'&&(mutation?!!c.body:!c.body)?hold.promise:null;
   let pending;if(mutation){f.w.editRewardProfilePhone();input(f,'+15558889999');pending=f.w.confirmRewardProfilePhone();old.phoneProfile={...savedPhone,phone:'+15558889999',revision:3}}else pending=f.w.loadRewards(true);
   f.mount('other');await flush();hold.resolve(reply(old));await pending;
   assert.ok(!(f.d.querySelector('#root').textContent+f.d.querySelector('#modalHost').textContent).includes('555'));assert.equal(f.w.eval('rewardPhoneDraft'),null);
   f.w.openRewardLevel(2);assert.equal(f.d.querySelector('#rewardProfilePhone').value,'');
   f.w.openRewardPhone(connectionId);await flush();assert.equal(f.d.querySelector('#rewardPhone').value,'');
   f.w.eval('s=blank();render()');assert.ok(!(f.d.querySelector('#root').textContent+f.d.querySelector('#modalHost').textContent).includes('555'));assert.equal(f.w.eval('rewardPhoneDraft'),null);
  }finally{f.close()}
 }
});

test('authorization failure erases the private profile and an older response cannot resurrect it',async()=>{
 const f=await fixture({phoneProfile:savedPhone});try{
  f.w.openRewardLevel(2);f.w.editRewardProfilePhone();input(f,'+15558889999');const hold=deferred(),old=snapshot(f.server);
  f.server.intercept=c=>c.url==='/api/rewards'&&!c.body?hold.promise:c.body?.action==='confirmProfilePhone'?reply({error:'Your sign-in changed.'},403):null;
  const pending=f.w.loadRewards(true);await f.w.confirmRewardProfilePhone();assert.equal(f.d.querySelector('.rewardModal'),null);assert.equal(f.w.eval('rewardPhoneDraft'),null);
  hold.resolve(reply(old));await pending;assert.ok(!(f.d.querySelector('#root').textContent+f.d.querySelector('#modalHost').textContent).includes('555'));assert.equal(f.w.eval('rewardsData'),null);
 }finally{f.close()}
});

test('phone revisions remain monotonic independently of reward-answer snapshots',async()=>{
 const f=await fixture({phoneProfile:savedPhone});try{
  const latest={...snapshot(f.server),draftRevision:4,level:3};f.w.eval(`acceptRewards(${JSON.stringify(latest)})`);
  const olderRoundNewerPhone={...latest,draftRevision:2,level:2,phoneProfile:{...savedPhone,phone:'+15559990000',revision:3}};f.w.eval(`acceptRewards(${JSON.stringify(olderRoundNewerPhone)})`);
  assert.equal(f.w.eval('rewardLevel()'),3);assert.equal(f.w.eval('rewardPhoneProfile().revision'),3);
  const newerRoundOlderPhone={...latest,draftRevision:5,level:4};f.w.eval(`acceptRewards(${JSON.stringify(newerRoundOlderPhone)})`);
  assert.equal(f.w.eval('rewardLevel()'),4);assert.equal(f.w.eval('rewardPhoneProfile().phone'),'+15559990000');
 }finally{f.close()}
});

test('all five trail states retain native contextual buttons, short labels and mobile-safe tracks',async()=>{
 for(const level of [0,1,2,3,4,5]){const f=await fixture({level});try{
  f.w.openRewardTile(Math.max(1,level));const trail=f.d.querySelector('.rewardStepTrail');assert.ok(trail);assert.equal(trail.getAttribute('aria-label'),'Your five reward steps');
  const steps=[...trail.querySelectorAll('button')];assert.equal(steps.length,5);assert.equal(trail.querySelectorAll('.completed').length,level);assert.equal(trail.querySelectorAll('.current').length,level<5?1:0);assert.equal(trail.querySelectorAll('.locked').length,Math.max(0,4-level));
  for(const [i,step] of steps.entries()){assert.equal(step.type,'button');assert.match(step.getAttribute('aria-label'),new RegExp(`Step ${i+1}`));assert.ok(step.querySelector('b').textContent);assert.ok(step.querySelector('small').textContent)}
  assert.equal(f.posts().length,0);
 }finally{f.close()}}
 assert.match(css,/\.rewardStepTrail ol\{[^}]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);assert.match(css,/\.rewardStep\{[^}]*min-height:76px/);assert.match(css,/\.rewardStep b\{[^}]*overflow-wrap:anywhere/);
});

test('peer confirmation stays unknown below own Step 2 instead of claiming an unconfirmed number',async()=>{
 const f=await fixture({level:1});try{f.w.openRewardPhone(connectionId);await flush();assert.match(f.d.querySelector('.rewardPhoneReadiness').textContent,/Morgan.*Finish your Second 5 to check readiness/);assert.doesNotMatch(f.d.querySelector('.rewardPhoneReadiness').textContent,/Morgan.*Number not confirmed/)}finally{f.close()}
});
