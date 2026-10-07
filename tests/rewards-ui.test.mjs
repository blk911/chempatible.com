import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {REWARD_ROUNDS} from '../api/_reward-rounds.mjs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
const response=(body,status=200)=>({ok:status<400,status,json:async()=>copy(body)});
const flush=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r))};
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve}};
const alpha='a'.repeat(64),beta='b'.repeat(64),friend='c'.repeat(64),photo='data:image/jpeg;base64,AA==';
const rows=[{id:alpha,kind:'vibe',channel:'email',status:'chat',side:'member',prospect_name:'Morgan',prospect_photo:photo,own_answers:Array(10).fill(0),prospect_answers:Array(10).fill(1),messages:[]},{id:beta,kind:'vibe',channel:'email',status:'chat',side:'member',prospect_name:'Riley',prospect_photo:photo,own_answers:Array(10).fill(0),prospect_answers:Array(10).fill(1),messages:[]},{id:friend,kind:'friend',channel:'friend',status:'chat',side:'member',prospect_name:'Sam',prospect_photo:photo,messages:[]}];
async function fixture({level=1,otherLevel=2,actor='member',status='chat',answers={}}={}){
 const dom=new JSDOM(html,{url:'https://rewards.example.test/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
 const own={id:'owner',name:'Taylor',contact:'owner@example.test',photo,answers:Array(level>=2?10:level>=1?5:0).fill(0),verified:true};
 const server={level,otherLevel,answers:copy(answers),revision:0,calls:[],hold:null,failGet:false,failPost:false,listed:false,video:null,published:false,otherOffered:false,ownPhone:'',profiles:[],requests:{incoming:[],outgoing:[]},rows:copy(rows).map(row=>row.id===alpha?{...row,status}:row)};
 const ownProfile=()=>({profile:{listed:server.listed,name:'Taylor',photo:`/api/reward-directory?photo=owner`,video:server.video,videoPublished:server.published,durationSeconds:server.video?12:null},eligibility:{completedLevel:server.level,directory:server.level>=4,video:server.level>=5},limits:{videoBytes:2097152,videoSeconds:15}});
 const data=(connection)=>({level:server.level,rounds:REWARD_ROUNDS,answers:{...(server.level>=2?Object.fromEntries(Array.from({length:5},(_,i)=>['base-'+(i+6),0])):{}),...server.answers},draftRevision:server.revision,nextLevel:server.level<5?server.level+1:null,nextReward:'Next reward',connections:server.rows.map(c=>({id:c.id,upgraded:server.otherLevel>=3,ownUpgraded:server.level>=3,otherUpgraded:server.otherLevel>=3})),...(connection?{connection:{id:connection,upgraded:server.otherLevel>=3,ownUpgraded:server.level>=3,phone:{eligible:server.level>=2&&server.otherLevel>=2,ownEligible:server.level>=2,otherEligible:server.otherLevel>=2,ownOffered:!!server.ownPhone,otherOffered:server.otherOffered,shared:!!server.ownPhone&&server.otherOffered,...(server.ownPhone?{ownPhone:server.ownPhone}:{}),...(server.ownPhone&&server.otherOffered?{otherPhone:'+15551234567'}:{})}}}:{})});
 w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.fetch=async(url,options={})=>{
  if(url==='/api/wildcards?summary=1')return response({connections:[]});
  if(url.startsWith('/api/game-pieces?'))return response({pieces:[],pendingCount:0});
  if(url==='/api/rewards?phoneRequests=1')return response({phoneRequests:[]});
  if(url.startsWith('/api/wildcards?connection='))return response({connectionId:new URL(url,'https://fixture.example.test').searchParams.get('connection'),eligible:false,limit:3,remaining:0,usedQuestionIds:[],categories:[],cards:[],answerMaxLength:1000});
  const binary=options.body instanceof w.File,body=options.body&&!binary?JSON.parse(options.body):binary?{upload:true}:null;server.calls.push({url,body,headers:options.headers||{}});
  if(url==='/api/connection?inbox=1')return response({connections:server.rows});
  if(url.startsWith('/api/discovery'))return url.includes('pieces=1')?response({pieces:[]}):response({modules:[],games:[],pieces:[]});
  if(!url.startsWith('/api/rewards')&&!url.startsWith('/api/reward-directory')&&!url.startsWith('/api/reward-requests'))return response({},401);
  if(w.eval('activeMemberId()')!=='owner')return response({},401);
  if(server.authFailure?.(url,body))return response({error:'Your sign-in changed. Please sign in again.'},server.authFailure(url,body));
  if(server.hold&&server.hold.match(url,body)){const hold=server.hold;server.hold=null;await hold.promise}
  if(body&&server.failPost)return response({error:'Request interrupted. Try again.'},503);
  if(!body&&server.failGet)return response({error:'Temporarily unavailable.'},503);
  if(url==='/api/reward-requests'){
   if(!body)return response(server.requests);
   if(body.action==='request'){const target=server.profiles.find(p=>p.id===body.targetId);if(!server.requests.outgoing.some(r=>r.memberId===target.id))server.requests.outgoing.push({id:'request-one',memberId:target.id,name:target.name,photo:'/api/reward-requests?photo=request-one',expiresAt:'2026-10-10T00:00:00Z'});return response({ok:true,id:'request-one',status:'pending',connectionId:null})}
   if(body.action==='cancel')server.requests.outgoing=server.requests.outgoing.filter(r=>r.id!==body.id);
   if(['accept','pass'].includes(body.action))server.requests.incoming=server.requests.incoming.filter(r=>r.id!==body.id);
   if(body.action==='accept')server.rows.push({...copy(rows[0]),id:'d'.repeat(64),prospect_name:'Avery',status:'firstResults',claimed:false,own_answers:Array(5).fill(0),prospect_answers:Array(5).fill(1)});
   return response({ok:true,id:body.id,status:({accept:'accepted',pass:'passed',cancel:'cancelled'})[body.action],connectionId:body.action==='accept'?'d'.repeat(64):null});
  }
  if(url.startsWith('/api/reward-directory')){
   if(url.includes('directory=1'))return response({profiles:server.profiles,nextCursor:null});
   if(body?.action==='list')server.listed=true;if(body?.action==='unlist'){server.listed=false;server.published=false}if(body?.action==='publishVideo')server.published=true;if(body?.action==='hideVideo')server.published=false;if(binary){server.video='/api/reward-directory?video=owner';server.published=false}
   return response(ownProfile());
  }
  const connection=body?.connectionId||new URL(url,'https://rewards.example.test').searchParams.get('connection');
  if(body?.action==='offerPhone')server.ownPhone=body.phone;
  if(body?.action==='withdrawPhone')server.ownPhone='';
  if(['save','complete'].includes(body?.action)){
   if(body.draftRevision!==server.revision)return response({error:'A newer draft is saved.',draftConflict:true},409);
   server.answers={...server.answers,...body.answers};server.revision++;if(body.action==='complete')server.level=body.level;
  }
  return response(data(connection));
 };
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 if(actor==='prospect')w.eval(`s={...blank(),view:'dashboard',actor:'prospect',member:{name:'Morgan',answers:Array(10).fill(0)},prospect:${JSON.stringify({...own,email:own.contact})},prospectId:'owner',liveId:'${alpha}',liveInvite:true,liveToken:'test-token',selectedChempat:'first',phase:'chat',firstConnection:{location:'active'},messages:[]};render()`);
 else w.eval(`s={...blank(),view:'dashboard',member:${JSON.stringify(own)},memberId:'owner',account:${JSON.stringify(own)},liveMember:true,inbox:${JSON.stringify(server.rows.filter(row=>row.kind!=='friend'))},friends:${JSON.stringify(server.rows.filter(row=>row.kind==='friend'))},selectedChempat:'${alpha}',phase:'chat'};render()`);
 await flush();
 return {w,d,server,ownProfile,data,state:()=>copy(w.eval('s')),posts:()=>server.calls.filter(c=>c.body&&c.url==='/api/rewards').map(c=>c.body),directoryPosts:()=>server.calls.filter(c=>c.body&&c.url.startsWith('/api/reward-directory')),close:()=>w.close()};
}
function answer(f,level,value){for(const q of REWARD_ROUNDS.find(r=>r.level===level).questions)f.w.chooseRewardAnswer(q.id,value??q.choices[0].value)}
function hold(f,match){const h=deferred();f.server.hold={...h,match};return h}

test('header has five functional slots and exact CTA; optional games are secondary',async()=>{
 const f=await fixture();try{const header=f.d.querySelector('.socialMemberHeader');assert.equal(header.querySelector('.ctaPrompt').textContent,'Caught their vibe?');assert.equal(header.querySelector('.socialVibeAction button').textContent,'Send a vibe →');assert.deepEqual([...header.querySelectorAll('.rewardSlot b')].map(b=>b.textContent),['Email','Cell','Get noticed','Be discovered','Your 15 seconds']);assert.equal(header.querySelectorAll('.rewardSlot.unlocked').length,1);assert.equal(header.querySelectorAll('.rewardSlot.current').length,1);assert.equal(header.querySelectorAll('.rewardSlot.locked').length,3);assert.equal(header.querySelector('#earnedPieces'),null);assert.equal(f.d.querySelector('.moreReflections').open,false);f.w.openRewardLevel(5);assert.match(f.d.querySelector('.rewardModal').textContent,/Finish Second 5/);assert.ok(f.d.querySelector('.rewardModal button:not(.close)'));assert.equal(f.posts().length,0);assert.ok(f.d.querySelector('#message'))}finally{f.close()}
});
test('first five uses existing flow and friend-only pages remain usable',async()=>{
 const f=await fixture({level:0});try{f.w.openRewardLevel(1);assert.ok(f.d.querySelector('.quickChoices'));f.w.goHome();f.w.selectChempat(friend);assert.ok(f.d.querySelector('#message'));assert.equal(f.d.querySelector('.rewardConnection'),null)}finally{f.close()}
});
test('second-five save, resume, completion preserves pair state and local storage privacy',async()=>{
 const f=await fixture();try{f.w.openRewardLevel(2);const round=REWARD_ROUNDS.find(r=>r.level===2);assert.equal(f.d.querySelectorAll('.rewardQuestions fieldset').length,5);f.w.chooseRewardAnswer(round.questions[0].id,round.questions[0].choices[0].value);await f.w.rewardAction('save');assert.equal(f.posts()[0].draftRevision,0);f.w.closeInvite();f.w.openRewardLevel(2);assert.equal(f.d.querySelectorAll('.rewardQuestions input:checked').length,1);await f.w.rewardAction('complete');assert.equal(f.posts().length,1);assert.match(f.d.querySelector('#rewardError').textContent,/all five/);answer(f,2);await f.w.rewardAction('complete');assert.equal(f.server.level,2);assert.equal(f.state().member.answers.length,10);assert.equal(f.state().phase,'chat');assert.equal(f.state().inbox[0].status,'chat');assert.match(f.d.querySelector('.rewardModal').textContent,/Mutual phone exchange unlocked/);assert.ok(!f.w.sessionStorage.getItem('chempatibility.walkthrough.v7').includes('base-6'));assert.equal(f.directoryPosts().length,0)}finally{f.close()}
});
test('rounds three to five use original server questions, reward choices, and no psychological score',async()=>{
 const f=await fixture({level:2});try{for(const level of [3,4,5]){f.w.openRewardLevel(level);assert.equal(f.d.querySelectorAll('.rewardQuestions fieldset').length,5);assert.match(f.d.querySelector('.rewardModal').textContent,new RegExp(REWARD_ROUNDS.find(r=>r.level===level).questions[0].text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));answer(f,level);await f.w.rewardAction('complete');assert.equal(f.server.level,level);assert.equal(f.d.querySelector('.rewardQuestions'),null);assert.ok(!f.d.querySelector('.discoveryScore'))}assert.equal(f.directoryPosts().length,0);assert.equal(f.server.listed,false);assert.equal(f.server.published,false)}finally{f.close()}
});
test('draft conflict merges newer values and local edits with an explicit retry',async()=>{
 const f=await fixture({level:2});try{f.w.openRewardLevel(3);const qs=REWARD_ROUNDS.find(r=>r.level===3).questions;f.w.chooseRewardAnswer(qs[0].id,qs[0].choices[1].value);f.server.answers[qs[1].id]=qs[1].choices[2].value;f.server.revision=2;await f.w.rewardAction('save');assert.equal(f.posts().length,1);assert.match(f.d.querySelector('#rewardError').textContent,/Newer saved answers were loaded/);assert.equal(f.d.querySelectorAll('.rewardQuestions input:checked').length,2);await f.w.rewardAction('save');assert.equal(f.posts()[1].draftRevision,2);assert.equal(f.posts()[1].answers[qs[0].id],qs[0].choices[1].value);assert.equal(f.posts()[1].answers[qs[1].id],qs[1].choices[2].value)}finally{f.close()}
});
test('pending save is deduplicated and cannot reopen a closed or newer modal',async()=>{
 const f=await fixture({level:2});try{f.w.openRewardLevel(3);answer(f,3);const h=hold(f,(url,body)=>body?.action==='save');const one=f.w.rewardAction('save'),two=f.w.rewardAction('save');assert.equal(f.posts().length,1);f.w.closeInvite();f.w.openFriendShare();const content=f.d.querySelector('#modalHost').innerHTML;h.resolve();await Promise.all([one,two]);assert.equal(f.state().modal,'friendShare');assert.equal(f.d.querySelector('#modalHost').innerHTML,content);f.w.closeInvite();f.w.openRewardLevel(3);assert.equal(f.d.querySelectorAll('.rewardQuestions input:checked').length,5);assert.equal(f.d.querySelector('.rewardQuestions fieldset').disabled,false)}finally{f.close()}
});
test('pending read or mutation cannot leak previous-account rewards after account switch',async()=>{
 const f=await fixture({level:2});try{f.w.openRewardLevel(3);answer(f,3);const h=hold(f,(url,body)=>body?.action==='complete');const request=f.w.rewardAction('complete');f.w.eval("s={...blank(),view:'dashboard',memberId:'new-owner',member:{name:'New',answers:[]},liveMember:true};render()");h.resolve();await request;assert.equal(f.state().memberId,'new-owner');assert.equal(f.state().modal,'');assert.equal(f.d.querySelector('.rewardModal'),null);assert.equal(f.w.eval('rewardDrafts.size'),0)}finally{f.close()}
});
test('polling retains focused answer and unsent chat without reconstructing the dialog',async()=>{
 const f=await fixture({level:2});try{f.w.openRewardLevel(3);const input=f.d.querySelector('.rewardQuestions input');input.click();input.focus();const composer=f.d.querySelector('#message');composer.value='Still typing';await f.w.loadRewards(true);assert.equal(f.d.activeElement,input);assert.equal(f.d.querySelector('.rewardQuestions input'),input);assert.equal(f.d.querySelector('#message'),composer);assert.equal(composer.value,'Still typing');assert.equal(input.checked,true)}finally{f.close()}
});
test('Escape, backdrop, and keyboard loop work and return focus to the reward opener',async()=>{
 const f=await fixture({level:2});try{const opener=f.d.querySelector('[data-reward-level="3"]');opener.focus();opener.click();const close=f.d.querySelector('.rewardModal .close'),last=[...f.d.querySelectorAll('.rewardModal button:not(:disabled),.rewardModal input:not(:disabled),.rewardModal summary,.rewardModal video[controls]')].filter(f.w.visibleModalControl).at(-1);close.focus();f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(f.d.activeElement,last);f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.state().modal,'');assert.equal(f.d.activeElement,opener);opener.click();f.d.querySelector('.modalBackdrop').click();assert.equal(f.state().modal,'')}finally{f.close()}
});
test('phone exchange requires a named review and both offers; withdrawing keeps the consequence visible',async()=>{
 const f=await fixture({level:2});try{f.w.openRewardPhone(alpha);await flush();assert.ok(f.d.querySelector('#rewardPhone'));await f.w.rewardPhoneAction('offerPhone');assert.equal(f.posts().length,0);f.d.querySelector('#rewardPhone').value='+1 555 222 3333';f.w.reviewRewardPhone();assert.match(f.d.querySelector('.rewardConsent').textContent,/Morgan/);assert.match(f.d.querySelector('.rewardConsent').textContent,/\+1 555 222 3333/);assert.equal(f.posts().length,0);await f.w.rewardPhoneAction('offerPhone');assert.equal(f.posts()[0].connectionId,alpha);assert.ok(!f.d.body.textContent.includes('+15551234567'));f.server.otherOffered=true;await f.w.loadRewardConnection(alpha,true);assert.match(f.d.querySelector('.sharedPhone').textContent,/\+15551234567/);await f.w.rewardPhoneAction('withdrawPhone');assert.equal(f.server.ownPhone,'');assert.equal(f.d.querySelector('.sharedPhone'),null);assert.match(f.d.querySelector('#rewardStatus').textContent,/cannot be taken back/)}finally{f.close()}
});
test('phone locks explain own level, other level, and pair consent requirements',async()=>{
 for(const options of [{level:1},{level:2,otherLevel:1},{level:2,status:'firstResults'}]){const f=await fixture(options);try{f.w.openRewardPhone(alpha);await flush();assert.equal(f.d.querySelector('#rewardPhone'),null);assert.match(f.d.querySelector('.rewardModal').textContent,/Finish your Second 5|Morgan needs to finish|shared choices first/);assert.ok(f.d.querySelector('.rewardModal button:not(.close)'))}finally{f.close()}}
});
test('connection switch cancels named phone review; prospect alias uses the true connection ID',async()=>{
 const f=await fixture({level:2});try{f.w.openRewardPhone(alpha);await flush();f.w.selectChempat(beta);assert.equal(f.state().modal,'');assert.equal(f.d.querySelector('#rewardPhone'),null)}finally{f.close()}
 const p=await fixture({level:2,actor:'prospect'});try{p.w.openRewardPhone('first');await flush();p.d.querySelector('#rewardPhone').value='+15552223333';p.w.reviewRewardPhone();await p.w.rewardPhoneAction('offerPhone');assert.equal(p.posts()[0].connectionId,alpha);assert.ok(!p.server.calls.some(c=>c.url.includes('connection=first')))}finally{p.close()}
});
test('individual level-three status appears on romantic and friend contact cards from one summary read',async()=>{
 const f=await fixture({level:1,otherLevel:3});try{assert.equal(f.d.querySelectorAll('[data-reward-badge]:not([hidden])').length,3);assert.match(f.d.querySelector(`.friendRail [data-reward-badge="${friend}"]`).textContent,/Getting closer/);assert.equal(f.server.calls.filter(c=>c.url.includes('connection='+friend)).length,0);assert.equal(f.server.calls.filter(c=>c.url.includes('connection='+beta)).length,0)}finally{f.close()}
});
test('directory stays opt-in and listing/publishing each require their own audience review',async()=>{
 const f=await fixture({level:5});try{f.w.openRewardDirectory();await flush();assert.match(f.d.querySelector('.rewardDirectoryOwn').textContent,/Private/);assert.equal(f.directoryPosts().length,0);f.w.reviewRewardDirectory('list');assert.match(f.d.querySelector('.rewardConsent').textContent,/Signed-in members who have unlocked Level 4/);assert.match(f.d.querySelector('.rewardConsent').textContent,/private answers, phone, email, and chats are not listed/);assert.equal(f.directoryPosts().length,0);await f.w.rewardDirectoryAction();await flush();assert.equal(f.server.listed,true);assert.equal(f.server.published,false);f.server.video='/api/reward-directory?video=owner';await f.w.loadRewardDirectory(true);f.w.rewardScreen('video');assert.match(f.d.querySelector('.rewardModal').textContent,/Only you/);f.w.reviewRewardDirectory('publishVideo');assert.match(f.d.querySelector('.rewardConsent').textContent,/They may record/);assert.equal(f.server.published,false);await f.w.rewardDirectoryAction();await flush();assert.equal(f.server.published,true);f.w.reviewRewardDirectory('hideVideo');await f.w.rewardDirectoryAction();await flush();assert.equal(f.server.published,false);assert.equal(f.server.video,'/api/reward-directory?video=owner')}finally{f.close()}
});
test('upload is private first and oversized or non-MP4 files cannot transmit',async()=>{
 const f=await fixture({level:5});try{f.w.openRewardDirectory('video');await flush();for(const file of [new f.w.File(['x'],'x.webm',{type:'video/webm'}),new f.w.File([new Uint8Array(2097153)],'x.mp4',{type:'video/mp4'})]){await f.w.uploadRewardVideo({target:{files:[file]}});assert.match(f.d.querySelector('#rewardError').textContent,/MP4 video/)}assert.equal(f.directoryPosts().length,0);f.w.rewardVideoDuration=async()=>12;await f.w.uploadRewardVideo({target:{files:[new f.w.File(['sample'],'hello.mp4',{type:'video/mp4'})]}});assert.equal(f.directoryPosts().length,1);assert.equal(f.server.published,false);assert.match(f.d.querySelector('#rewardStatus').textContent,/saved privately/);assert.ok(f.d.querySelector('.rewardVideo'));assert.equal(f.d.querySelector('[onclick*="publishVideo"]').disabled,true,'unlisted profiles cannot publish directly')}finally{f.close()}
});
test('video metadata interruption never uploads after closing the modal',async()=>{
 const f=await fixture({level:5});try{f.w.openRewardDirectory('video');await flush();const h=deferred();f.w.rewardVideoDuration=()=>h.promise;const request=f.w.uploadRewardVideo({target:{files:[new f.w.File(['sample'],'hello.mp4',{type:'video/mp4'})]}});f.w.closeInvite();h.resolve(12);await request;assert.equal(f.directoryPosts().length,0);assert.equal(f.state().modal,'')}finally{f.close()}
});
test('directory escapes profile text and accepts only authenticated same-origin media routes',async()=>{
 const f=await fixture({level:4});try{f.server.profiles=[{id:'known',name:'<script>bad()</script>',photo:'https://evil.test/photo',videoAvailable:true,videoUrl:'javascript:bad()'}];f.w.openRewardDirectory();await flush();assert.equal(f.d.querySelector('.rewardDirectoryGrid script'),null);assert.match(f.d.querySelector('.rewardDirectoryGrid').textContent,/<script>/);assert.equal(f.d.querySelector('.rewardDirectoryGrid img'),null);assert.equal(f.d.querySelector('.rewardDirectoryGrid video'),null);f.w.rewardScreen('video');assert.equal(f.d.querySelector('.rewardModal input[type="file"]'),null);assert.match(f.d.querySelector('.rewardModal').textContent,/Finish Level 5/)}finally{f.close()}
});
test('service failures preserve chat and drafts and offer functional retries',async()=>{
 const f=await fixture({level:2});try{f.w.openRewardLevel(3);answer(f,3);f.server.failPost=true;await f.w.rewardAction('save');assert.match(f.d.querySelector('#rewardError').textContent,/interrupted/);assert.equal(f.d.querySelectorAll('.rewardQuestions input:checked').length,5);assert.equal(f.d.querySelector('.rewardQuestions fieldset').disabled,false);assert.ok(f.d.querySelector('#message'));f.server.failPost=false;await f.w.rewardAction('save');assert.match(f.d.querySelector('#rewardStatus').textContent,/Progress saved/);f.w.closeInvite();f.server.failGet=true;await f.w.loadRewards(true);assert.match(f.d.querySelector('.rewardLoadError').textContent,/couldn’t refresh/);assert.ok(f.d.querySelector('.rewardLoadError button'));assert.ok(f.d.querySelector('#message'))}finally{f.close()}
});

test('an older GET cannot roll back a completed level or its header',async()=>{
 const f=await fixture({level:2});try{f.w.openRewardLevel(3);answer(f,3);const original=f.w.fetch,h=deferred();let captured=false;f.w.fetch=async(url,options)=>{const result=await original(url,options);if(url==='/api/rewards'&&!options?.body&&!captured){captured=true;const body=await result.json();await h.promise;return response(body)}return result};const read=f.w.loadRewards(true);await flush();await f.w.rewardAction('complete');h.resolve();await read;assert.equal(f.w.eval('rewardLevel()'),3);assert.equal(f.d.querySelectorAll('.rewardSlot.unlocked').length,3);assert.match(f.d.querySelector('.rewardModal').textContent,/Getting closer badge unlocked/)}finally{f.close()}
});
test('a conflict refresh failure blocks mutation until latest answers are loaded',async()=>{
 const f=await fixture({level:2});try{f.w.openRewardLevel(3);answer(f,3);f.server.revision=3;f.server.failGet=true;await f.w.rewardAction('save');assert.match(f.d.querySelector('#rewardError').textContent,/Reload the latest answers/);assert.ok(f.d.querySelector('[onclick="refreshRewardConflict()"]'));await f.w.rewardAction('save');assert.equal(f.posts().length,1);f.server.failGet=false;await f.w.refreshRewardConflict();await f.w.rewardAction('save');assert.equal(f.posts().length,2);assert.equal(f.posts()[1].draftRevision,3)}finally{f.close()}
});
test('phone confirmation pending across close and reopen cannot leave disabled controls',async()=>{
 const f=await fixture({level:2});try{f.w.openRewardPhone(alpha);await flush();f.d.querySelector('#rewardPhone').value='+15552223333';f.w.reviewRewardPhone();const h=hold(f,(url,body)=>body?.action==='offerPhone'),one=f.w.rewardPhoneAction('offerPhone'),two=f.w.rewardPhoneAction('offerPhone');assert.equal(f.posts().length,1);f.w.closeInvite();f.w.openRewardPhone(alpha);assert.equal(f.d.querySelector('#rewardPhone').disabled,true);h.resolve();await Promise.all([one,two]);assert.match(f.d.querySelector('.rewardModal').textContent,/offer is waiting/);assert.equal(f.d.querySelector('[onclick="rewardPhoneAction(\'withdrawPhone\')"]').disabled,false)}finally{f.close()}
});
test('a pending directory mutation cannot reopen after dismissal or overwrite friend sharing',async()=>{
 const f=await fixture({level:4});try{f.w.openRewardDirectory();await flush();f.w.reviewRewardDirectory('list');const h=hold(f,(url,body)=>body?.action==='list'),one=f.w.rewardDirectoryAction(),two=f.w.rewardDirectoryAction();assert.equal(f.directoryPosts().length,1);f.w.closeInvite();f.w.openFriendShare();const content=f.d.querySelector('#modalHost').innerHTML;h.resolve();await Promise.all([one,two]);assert.equal(f.state().modal,'friendShare');assert.equal(f.d.querySelector('#modalHost').innerHTML,content);assert.equal(f.server.listed,true)}finally{f.close()}
});

function assertRewardCleared(f){assert.equal(f.state().modal,'');assert.equal(f.d.querySelector('.rewardModal'),null);assert.equal(f.w.eval('rewardsData'),null);assert.equal(f.w.eval('rewardDirectory'),null);assert.equal(f.w.eval('rewardProfiles.length'),0);assert.equal(f.w.eval('rewardRequests.incoming.length+rewardRequests.outgoing.length'),0);assert.equal(f.w.eval('rewardDrafts.size'),0);assert.equal(f.w.eval('rewardConnections.size'),0);assert.equal(f.w.eval('rewardStatuses.size'),0);assert.equal(f.w.eval('rewardsPending'),null);assert.equal(f.w.eval('rewardDirectoryPending'),null);assert.match(f.d.querySelector('#rewardLadder').textContent,/sign-in changed/i);assert.ok(!f.d.body.textContent.includes('+15551234567'));assert.equal(f.d.querySelector('.rewardDirectoryGrid img,.rewardVideo'),null)}
test('every authoritative 401 or 403 clears directory photos, video, phone and drafts across reward surfaces',async()=>{
 for(const status of [401,403])for(const screen of ['directory','phone']){const f=await fixture({level:5});try{f.server.profiles=[{id:'peer',name:'Public peer',photo:'/api/reward-directory?photo=peer',videoAvailable:true}];f.server.video='/api/reward-directory?video=owner';f.server.otherOffered=true;f.server.ownPhone='+15552223333';if(screen==='directory'){f.w.openRewardDirectory();await flush();assert.ok(f.d.querySelector('.rewardDirectoryGrid img'))}else{f.w.openRewardPhone(alpha);await flush();assert.match(f.d.querySelector('.sharedPhone').textContent,/\+15551234567/)}f.server.authFailure=(url,body)=>url==='/api/rewards'&&!body?status:0;await f.w.loadRewards(true);assertRewardCleared(f)}finally{f.close()}}
});
test('403 from round, phone, directory or binary-video mutation centrally invalidates private caches',async()=>{
 for(const action of ['save','offerPhone','list','upload']){const f=await fixture({level:action==='save'?2:5});try{if(action==='save'){f.w.openRewardLevel(3);answer(f,3)}else if(action==='offerPhone'){f.w.openRewardPhone(alpha);await flush();f.d.querySelector('#rewardPhone').value='+15552223333';f.w.reviewRewardPhone()}else{f.w.openRewardDirectory(action==='upload'?'video':'directory');await flush();if(action==='list')f.w.reviewRewardDirectory('list');else f.w.rewardVideoDuration=async()=>12}f.server.authFailure=(url,body)=>body?403:0;if(action==='save')await f.w.rewardAction('save');else if(action==='offerPhone')await f.w.rewardPhoneAction('offerPhone');else if(action==='list')await f.w.rewardDirectoryAction();else await f.w.uploadRewardVideo({target:{files:[new f.w.File(['clip'],'hello.mp4',{type:'video/mp4'})]}});assertRewardCleared(f)}finally{f.close()}}
});
test('authorization epochs prevent an older pending private read restoring caches after invalidation',async()=>{
 const f=await fixture({level:5});try{f.server.otherOffered=true;f.server.ownPhone='+15552223333';const h=hold(f,(url,body)=>url.includes('connection=')&&!body);const read=f.w.loadRewardConnection(alpha,true);await flush();f.server.authFailure=(url,body)=>url==='/api/rewards'?403:0;await f.w.loadRewards(true);h.resolve();await read;assertRewardCleared(f);assert.equal(f.w.eval('rewardConnections.size'),0)}finally{f.close()}
});
test('all reward requests bind consent to the visible account, including binary uploads',async()=>{
 const f=await fixture({level:5});try{f.w.openRewardDirectory('video');await flush();f.w.rewardVideoDuration=async()=>12;await f.w.uploadRewardVideo({target:{files:[new f.w.File(['clip'],'hello.mp4',{type:'video/mp4'})]}});f.w.rewardScreen('directory');f.w.reviewRewardDirectory('list');await f.w.rewardDirectoryAction();await flush();const calls=f.server.calls.filter(c=>c.url.startsWith('/api/rewards')||c.url.startsWith('/api/reward-directory')||c.url.startsWith('/api/reward-requests'));assert.ok(calls.length>3);for(const call of calls)assert.equal(call.headers['x-chempat-member-id'],'owner');assert.ok(calls.some(c=>c.body?.upload));f.server.authFailure=(url,body)=>body?403:0;f.w.reviewRewardDirectory('unlist');await f.w.rewardDirectoryAction();assertRewardCleared(f);assert.equal(f.server.listed,true,'mismatched cookie identity never mutates another account')}finally{f.close()}
});

const incomingRequest={id:'incoming-one',memberId:'avery',name:'Avery',photo:'/api/reward-requests?photo=incoming-one',expiresAt:'2026-10-10T00:00:00Z'};
const requestPosts=f=>f.server.calls.filter(c=>c.url==='/api/reward-requests'&&c.body);
test('directory can send a named in-app Vibe request only after future first-five consent',async()=>{
 const f=await fixture({level:4});try{f.server.profiles=[{id:'avery',name:'Avery',photo:'/api/reward-directory?photo=avery',videoAvailable:false}];f.w.openRewardDirectory();await flush();const requestButton=f.d.querySelector('.rewardDirectoryGrid button');assert.equal(requestButton.textContent,'Send a Vibe request');assert.equal(requestPosts(f).length,0);requestButton.click();assert.match(f.d.querySelector('.rewardConsent').textContent,/Avery/);assert.match(f.d.querySelector('.rewardConsent').textContent,/shares your name and profile photo/);assert.match(f.d.querySelector('.rewardConsent').textContent,/If they accept, you’ll both share your current first five/);assert.match(f.d.querySelector('.rewardConsent').textContent,/No email/);assert.equal(requestPosts(f).length,0);await f.w.rewardRequestAction();await flush();assert.deepEqual(requestPosts(f)[0].body,{action:'request',targetId:'avery'});assert.equal(requestPosts(f)[0].headers['x-chempat-member-id'],'owner');assert.match(f.d.querySelector('.rewardRequests').textContent,/Sent/);assert.match(f.d.querySelector('.rewardDirectoryGrid').textContent,/Vibe request sent/);assert.equal(f.state().selectedChempat,alpha)}finally{f.close()}
});
test('incoming acceptance explicitly shares first five and opens the saved existing-flow connection only on demand',async()=>{
 const f=await fixture({level:4});try{f.server.requests.incoming=[copy(incomingRequest)];f.w.openRewardDirectory();await flush();assert.match(f.d.querySelector('.rewardRequests').textContent,/Avery/);assert.ok(f.d.querySelector('.rewardRequestCard img'));f.w.reviewRewardRequest('accept','incoming-one');assert.match(f.d.querySelector('.rewardConsent').textContent,/saved first five answers will be shared/);assert.match(f.d.querySelector('.rewardConsent').textContent,/Keep going/);assert.match(f.d.querySelector('.rewardConsent').textContent,/whether to open chat/);assert.equal(requestPosts(f).length,0);await f.w.rewardRequestAction();await flush();assert.match(f.d.querySelector('.rewardModal').textContent,/You’re connected with Avery/);assert.equal(f.state().selectedChempat,alpha);await f.w.openRewardAccepted();assert.equal(f.state().modal,'');assert.equal(f.state().selectedChempat,'d'.repeat(64));assert.equal(f.state().phase,'firstResults');assert.ok(f.d.querySelector('.focusReveals'));assert.equal(f.d.querySelector('#message'),null)}finally{f.close()}
});
test('passing and cancelling requests create no connection or shared answers',async()=>{
 const f=await fixture({level:4});try{f.server.requests.incoming=[copy(incomingRequest)];f.server.requests.outgoing=[{...incomingRequest,id:'outgoing-one',memberId:'morgan',name:'Morgan'}];f.w.openRewardDirectory();await flush();for(const [action,id,name] of [['pass','incoming-one','Avery'],['cancel','outgoing-one','Morgan']]){f.w.reviewRewardRequest(action,id);assert.match(f.d.querySelector('.rewardConsent').textContent,new RegExp(name));await f.w.rewardRequestAction();await flush()}assert.equal(f.server.requests.incoming.length,0);assert.equal(f.server.requests.outgoing.length,0);assert.equal(f.server.rows.length,3);assert.deepEqual(requestPosts(f).map(c=>c.body.action),['pass','cancel'])}finally{f.close()}
});
test('a pending request is duplicate-safe and cannot overwrite a newer modal',async()=>{
 const f=await fixture({level:4});try{f.server.profiles=[{id:'avery',name:'Avery'}];f.w.openRewardDirectory();await flush();f.w.reviewRewardRequest('request','avery');const h=hold(f,(url,body)=>url==='/api/reward-requests'&&!!body),one=f.w.rewardRequestAction(),two=f.w.rewardRequestAction();assert.equal(requestPosts(f).length,1);f.w.closeInvite();f.w.openFriendShare();const content=f.d.querySelector('#modalHost').innerHTML;h.resolve();await Promise.all([one,two]);assert.equal(f.state().modal,'friendShare');assert.equal(f.d.querySelector('#modalHost').innerHTML,content);f.w.closeInvite();f.w.openRewardDirectory();await flush();assert.match(f.d.querySelector('.rewardDirectoryGrid').textContent,/Vibe request sent/);f.w.reviewRewardRequest('request','avery');assert.equal(f.w.eval('currentRewardDialog().screen'),'directory')}finally{f.close()}
});
test('request 403 account mismatch clears all previews and never accepts or sends',async()=>{
 const f=await fixture({level:4});try{f.server.requests.incoming=[copy(incomingRequest)];f.w.openRewardDirectory();await flush();f.w.reviewRewardRequest('accept','incoming-one');f.server.authFailure=(url,body)=>url==='/api/reward-requests'&&body?403:0;await f.w.rewardRequestAction();assertRewardCleared(f);assert.equal(f.server.requests.incoming.length,1);assert.equal(f.server.rows.length,3);assert.equal(requestPosts(f)[0].headers['x-chempat-member-id'],'owner')}finally{f.close()}
});
test('old pending requests cannot appear after owner changes or authority is revoked',async()=>{
 const f=await fixture({level:4});try{f.server.requests.incoming=[copy(incomingRequest)];f.w.openRewardDirectory();await flush();const h=hold(f,(url,body)=>url==='/api/reward-requests'&&!body),read=f.w.loadRewardDirectory(true);await flush();f.server.authFailure=(url,body)=>url==='/api/rewards'?403:0;await f.w.loadRewards(true);h.resolve();await read;assertRewardCleared(f);assert.ok(!f.d.body.textContent.includes('Avery'))}finally{f.close()}
});

test('cached or edited first-ten answers never claim a reward before the server confirms it',async()=>{
 const f=await fixture({level:2});try{f.w.eval("rewardsData=null;rewardsError='';s.member.answers=Array(10).fill(2);s.account.answers=Array(10).fill(2);paintRewards()");const h=hold(f,(url,body)=>url==='/api/rewards'&&!body),load=f.w.loadRewards(true);assert.equal(f.d.querySelectorAll('.rewardSlot.unlocked').length,0);assert.match(f.d.querySelector('#rewardLadder').textContent,/Checking saved progress/);f.w.openRewardLevel(2);assert.match(f.d.querySelector('.rewardModal').textContent,/Checking your saved progress/);assert.ok(!f.d.querySelector('.rewardModal').textContent.includes('exchange unlocked'));h.resolve();await load;assert.equal(f.d.querySelectorAll('.rewardSlot.unlocked').length,2);f.w.closeInvite();f.w.eval("rewardsData=null;rewardsError='';paintRewards()");f.server.failGet=true;await f.w.loadRewards(true);assert.equal(f.d.querySelectorAll('.rewardSlot.unlocked').length,0);assert.ok(!f.d.querySelector('#rewardLadder').textContent.includes('2 / 5 unlocked'));assert.ok(f.d.querySelector('#message'));assert.ok(f.d.querySelector('.socialVibeAction button'))}finally{f.close()}
});

test('accepted directory email connections can exchange phones after chat even when inbox claimed is false',async()=>{
 const f=await fixture({level:4});try{f.server.requests.incoming=[copy(incomingRequest)];f.w.openRewardDirectory();await flush();f.w.reviewRewardRequest('accept','incoming-one');await f.w.rewardRequestAction();await flush();await f.w.openRewardAccepted();const accepted=f.server.rows.find(c=>c.id==='d'.repeat(64));assert.equal(accepted.claimed,false);accepted.status='chat';await f.w.refreshLive(true);await flush();assert.ok(f.d.querySelector('[data-reward-connection="'+accepted.id+'"]'));f.w.openRewardPhone(accepted.id);await flush();assert.ok(f.d.querySelector('#rewardPhone'));assert.match(f.d.querySelector('.rewardModal').textContent,/Exchange phones with Avery/)}finally{f.close()}
});

test('incoming requests are reviewed rather than accidentally creating a reverse request',async()=>{
 const f=await fixture({level:4});try{f.server.requests.incoming=[copy(incomingRequest)];f.server.profiles=[{id:'avery',name:'Avery',photo:'/api/reward-directory?photo=avery'}];f.w.openRewardDirectory();await flush();const button=f.d.querySelector('.rewardDirectoryGrid button');assert.equal(button.textContent,'Review their request');button.click();assert.match(f.d.querySelector('.rewardConsent').textContent,/Accepting starts a Vibe connection with Avery/);assert.equal(requestPosts(f).length,0)}finally{f.close()}
});
test('a historical outgoing request without an eligible photo still offers Cancel after reload',async()=>{
 const f=await fixture({level:4});try{f.server.requests.outgoing=[{...incomingRequest,id:'outgoing-one',photo:null}];f.w.openRewardDirectory();await flush();assert.match(f.d.querySelector('.rewardRequests').textContent,/Cancel request/);assert.equal(f.d.querySelector('.rewardRequestCard img'),null);f.w.reviewRewardRequest('cancel','outgoing-one');await f.w.rewardRequestAction();await flush();assert.equal(f.server.requests.outgoing.length,0)}finally{f.close()}
});

test('polished rounds keep every original choice, show live progress, and emphasize one next action',async()=>{
 const f=await fixture({level:2});try{f.w.openRewardLevel(3);const round=REWARD_ROUNDS.find(r=>r.level===3);assert.equal(f.d.querySelector('.rewardTarget b').textContent,'Getting closer badge');const progress=f.d.querySelector('#rewardProgress');assert.equal(progress.max,5);assert.equal(progress.value,0);assert.equal(progress.getAttribute('aria-labelledby'),'rewardAnswerCount');assert.equal(f.d.querySelectorAll('.rewardModal .rewardPrimary').length,1);assert.equal(f.d.querySelector('.rewardModal .rewardPrimary').getAttribute('onclick'),"rewardAction('complete')");assert.equal(f.d.querySelector('.rewardDetails').open,false);for(const [i,q] of round.questions.entries()){assert.equal(f.d.querySelectorAll('.rewardQuestions legend')[i].textContent,`${i+1}. ${q.text}`);assert.deepEqual([...f.d.querySelectorAll(`input[name="reward-${i}"]+span`)].map(el=>el.textContent),q.choices.map(c=>c.label))}const input=f.d.querySelector('.rewardQuestions input');input.click();input.focus();assert.equal(progress.value,1);assert.equal(f.d.activeElement,input);await f.w.loadRewards(true);assert.equal(f.d.querySelector('#rewardProgress'),progress);assert.equal(progress.value,1);assert.equal(f.d.activeElement,input);answer(f,3);assert.equal(progress.value,5);await f.w.rewardAction('complete');assert.equal(f.d.querySelectorAll('.rewardModal .rewardPrimary').length,1);assert.equal(f.d.querySelector('.rewardDetails').open,false);assert.match(f.d.querySelector('.rewardDetails').textContent,/not a compatibility score/)}finally{f.close()}
});
test('directory settings are compact and collapsed controls never enter the modal focus loop',async()=>{
 const f=await fixture({level:5});try{f.server.profiles=[{id:'avery',name:'Avery',videoAvailable:true}];f.w.openRewardDirectory();await flush();let own=f.d.querySelector('.rewardDirectoryOwn');assert.equal(own.tagName,'DETAILS');assert.equal(own.open,false);const hiddenButton=own.querySelector('button');assert.equal(f.w.visibleModalControl(hiddenButton),false);assert.equal(f.w.visibleModalControl(own.querySelector('summary')),true);const clip=f.d.querySelector('.rewardDirectoryGrid video');assert.equal(f.w.visibleModalControl(clip),false);own.querySelector('summary').click();await flush();assert.equal(own.open,true);assert.equal(f.w.visibleModalControl(hiddenButton),true);await f.w.loadRewardDirectory(true);own=f.d.querySelector('.rewardDirectoryOwn');assert.equal(own.open,true,'refresh preserves the expanded management choice');own.querySelector('summary').click();await flush();const close=f.d.querySelector('.rewardModal .close'),visible=[...f.d.querySelectorAll('.rewardModal button:not(:disabled),.rewardModal input:not(:disabled),.rewardModal summary,.rewardModal video[controls]')].filter(f.w.visibleModalControl);close.focus();f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(f.d.activeElement,visible.at(-1));assert.notEqual(f.d.activeElement,clip)}finally{f.close()}
});
test('polish keeps upload restrictions and consequential consent outside collapsed explanations',async()=>{
 const f=await fixture({level:5});try{f.w.openRewardDirectory('video');await flush();const limits=f.d.querySelector('.rewardMediaLimits');for(const term of ['15 seconds','2 MiB','MP4','H.264','720p','AAC','MOV','HEVC'])assert.ok(limits.textContent.includes(term));assert.equal(limits.closest('details'),null);assert.equal(f.d.querySelectorAll('.rewardModal .rewardPrimary').length,1);assert.ok(f.d.querySelector('.rewardUpload.rewardPrimary input[type="file"]'));f.w.rewardScreen('directory');f.w.reviewRewardDirectory('list');assert.equal(f.d.querySelector('.rewardConsent').closest('details'),null);assert.equal(f.d.querySelectorAll('.rewardModal .rewardPrimary').length,1);assert.equal(f.d.querySelector('.rewardModal .rewardPrimary').getAttribute('onclick'),'rewardDirectoryAction()');f.w.closeInvite();f.w.openRewardPhone(alpha);await flush();f.d.querySelector('#rewardPhone').value='+15552223333';f.w.reviewRewardPhone();assert.equal(f.d.querySelector('.rewardConsent').closest('details'),null);assert.match(f.d.querySelector('.rewardConsent').textContent,/Morgan/);assert.match(f.d.querySelector('.rewardConsent').textContent,/save or contact you/);assert.equal(f.d.querySelectorAll('.rewardModal .rewardPrimary').length,1)}finally{f.close()}
});


test('member discovery copy accurately names the authenticated audience without weakening consent',async()=>{
 assert.doesNotMatch(source,/review directory|eligible review members/);
 const f=await fixture({level:5});try{
  f.w.openRewardDirectory();await flush();f.w.reviewRewardDirectory('list');
  const consent=f.d.querySelector('.rewardConsent').textContent;assert.match(consent,/member directory/);assert.match(consent,/Signed-in members who have unlocked Level 4/);assert.match(consent,/private answers, phone, email, and chats are not listed/);
  assert.equal(f.server.listed,false,'opening consent never opts in');await f.w.rewardDirectoryAction();assert.match(f.d.querySelector('.rewardModal').textContent,/signed-in eligible members/);
  f.w.reviewRewardDirectory('publishVideo');assert.match(f.d.querySelector('.rewardConsent').textContent,/member directory/);assert.match(f.d.querySelector('.rewardConsent').textContent,/They may record what they can see/);assert.equal(f.server.published,false);
 }finally{f.close()}
 const privacy=fs.readFileSync(new URL('../privacy.html',import.meta.url),'utf8');
 assert.doesNotMatch(privacy,/review member directory|signed-in review members|development reward game|We don’t ask for phone numbers/);
 assert.match(privacy,/optional phone number you save privately to your profile or offer in a connection-specific phone exchange/);
 assert.match(privacy,/Confirming a saved number records your confirmation, not SMS verification; saving it does not share it/);
 assert.match(privacy,/first-five sets are shared only when the recipient accepts/);
 assert.match(privacy,/Accepting does not share contact details or open Private Chat/);
 assert.match(privacy,/signed-in, verified members in good standing who have unlocked Level 4/);
});

test('reward-first tiles explain all rewards without posting or changing consent',async()=>{
 const labels=['Email','Cell','Get noticed','Be discovered','Your 15 seconds'];
 const details=[/invitation by email; your email address stays private/,/both finish Second 5 and both opt in/,/badge to your connections; your answers stay private/,/eligible signed-in members.*only if you opt in/,/privately.*only if you choose/];
 for(const level of [0,1,2,3,4,5]){
  const f=await fixture({level});try{
   const card=f.d.querySelector('#rewardLadder');
   assert.equal(card.querySelector('h2').textContent,'Make your next move');
   assert.deepEqual([...card.querySelectorAll('.rewardSlot b')].map(el=>el.textContent),labels);
   assert.equal(card.querySelectorAll('.rewardSlotMark svg').length,5);
   assert.equal(card.querySelectorAll('.unlocked .rewardSlotState svg').length,level);
   assert.equal(card.querySelectorAll('.locked .rewardSlotState svg').length,Math.max(0,4-level));
   const primary=card.querySelector('.rewardPrimary');
   assert.equal(primary.textContent,level<5?'Unlock my next move →':'My rewards');
   assert.equal(primary.getAttribute('onclick'),`openRewardLevel(${Math.min(5,level+1)})`);
   if(level===1)assert.match(card.querySelector('.rewardNext').textContent,/Five quick picks unlock phone sharing/);
   const before=f.state();
   for(let tile=1;tile<=5;tile++){
    const button=f.d.querySelector(`[data-reward-level="${tile}"]`);button.focus();button.click();
    assert.match(f.d.querySelector('.rewardExplanation').textContent,details[tile-1]);
    f.w.closeInvite();assert.equal(f.d.activeElement.dataset.rewardLevel,String(tile),'dismiss returns focus to its tile');
   }
   assert.deepEqual(f.state().inbox,before.inbox);assert.equal(f.state().phase,before.phase);
   assert.equal(f.posts().length,0);assert.equal(f.directoryPosts().length,0);assert.equal(requestPosts(f).length,0);
  }finally{f.close()}
 }
});

test('Email reward tile explains first, then uses the same First 5 flow as the primary action',async()=>{
 const f=await fixture({level:0});try{
  f.d.querySelector('[data-reward-level="1"]').click();
  assert.match(f.d.querySelector('.rewardExplanation').textContent,/email address stays private/);
  f.d.querySelector('.rewardModal .rewardPrimary').click();
  assert.ok(f.d.querySelector('.quickChoices'));
  assert.equal(f.posts().length,0);
 }finally{f.close()}
});
