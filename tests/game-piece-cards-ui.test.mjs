import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {REWARD_ROUNDS} from '../api/_reward-rounds.mjs';

// These are DOM/CSSOM structure checks, not screenshots or a layout-engine
// substitute. No real accounts, network requests, invitations, or uploads run.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../site.css',import.meta.url),'utf8');
const widths=[320,360,390,430,520,521,700,701,900,901,1280];
const clone=value=>JSON.parse(JSON.stringify(value));
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve))};
const response=(body,status=200)=>({ok:status<400,status,json:async()=>clone(body)});
const id='a'.repeat(64),otherId='b'.repeat(64),photo='data:image/jpeg;base64,AA==';
const name='AlexandriaCassandraMontgomery';

async function fixture(level=2){
 const dom=new JSDOM(html,{url:'https://reward-layout.example.test/',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window,d=w.document,calls=[];
 const own={id:'owner',name:'Taylor',contact:'owner@example.test',photo,answers:Array(level>=2?10:level===1?5:0).fill(0),verified:true};
 const connection={id,kind:'vibe',channel:'email',status:'chat',side:'member',prospect_name:name,prospect_photo:photo,own_answers:Array(10).fill(0),prospect_answers:Array(10).fill(1),messages:[]};
 const server={level,answers:{},profiles:[{id:otherId,name,photo:'/api/reward-directory?photo='+otherId,videoAvailable:true,videoUrl:'/api/reward-directory?video='+otherId}]};
 const data=()=>({level:server.level,rounds:REWARD_ROUNDS,answers:server.answers,draftRevision:0,connections:[],connection:{id,phone:{eligible:server.level>=2,ownEligible:server.level>=2,otherEligible:true,ownOffered:false,otherOffered:false,shared:false}}});
 w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.fetch=async(url,options={})=>{
  if(url==='/api/wildcards?summary=1')return response({connections:[]});
  if(url.startsWith('/api/game-pieces?'))return response({pieces:[],pendingCount:0});
  if(url==='/api/rewards?phoneRequests=1')return response({phoneRequests:[]});
  if(url.startsWith('/api/wildcards?connection='))return response({connectionId:new URL(url,'https://fixture.example.test').searchParams.get('connection'),eligible:false,limit:3,remaining:0,usedQuestionIds:[],categories:[],cards:[],answerMaxLength:1000});
  calls.push({url,options});
  assert.ok(!options.method||options.method==='GET','responsive tests must stay read-only');
  if(url==='/api/connection?inbox=1')return response({connections:[connection]});
  if(url.startsWith('/api/discovery'))return response({modules:[],games:[],pieces:[]});
  if(url==='/api/reward-requests')return response({incoming:[{id:'incoming',memberId:'requester',name,photo:'/api/reward-requests?photo=incoming'}],outgoing:[]});
  if(url.includes('/api/reward-directory?directory=1'))return response({profiles:server.profiles,nextCursor:null});
  if(url==='/api/reward-directory?profile=1')return response({profile:{listed:false,name:'Taylor',photo:'/api/reward-directory?photo=owner',video:'/api/reward-directory?video=owner',videoPublished:false},eligibility:{completedLevel:server.level,directory:server.level>=4,video:server.level>=5}});
  if(url.startsWith('/api/rewards'))return response(data());
  return response({},401);
 };
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 w.eval(`s={...blank(),view:'dashboard',member:${JSON.stringify(own)},memberId:'owner',account:${JSON.stringify(own)},liveMember:true,inbox:${JSON.stringify([connection])},selectedChempat:'${id}',phase:'chat'};render()`);
 await flush();
 const style=d.createElement('style');style.textContent=css;d.head.append(style);
 const rules=[...style.sheet.cssRules];style.remove();
 return {w,d,calls,server,rules,close:()=>w.close()};
}

// Activate only the authored media/container rules for a synthetic width.
// JSDOM does not evaluate viewport geometry, text overflow or painted pixels.
function cssAtWidth(rules,width,{rootSize=16,reducedMotion=false}={}){
 return rules.map(rule=>{
  if(rule.constructor.name==='CSSContainerRule'){
   const match=rule.containerQuery.match(/^\(max-width:\s*(\d+)(px|rem)\)$/);
   assert.ok(match,`Unhandled container condition: ${rule.containerQuery}`);
   const containerWidth=width<=700?width-34:Math.max(280,(Math.min(width,1100)-50)*.35)-2;
   return containerWidth<=Number(match[1])*(match[2]==='rem'?rootSize:1)?cssAtWidth([...rule.cssRules],width,{rootSize,reducedMotion}):'';
  }
  if(rule.type!==4)return rule.cssText;
  const matches=rule.conditionText.split(/\s+and\s+/).every(condition=>{
   const widthCondition=condition.match(/^\((min|max)-width:\s*(\d+)px\)$/);
   if(widthCondition)return widthCondition[1]==='min'?width>=Number(widthCondition[2]):width<=Number(widthCondition[2]);
   if(condition==='(prefers-reduced-motion: reduce)')return reducedMotion;
   assert.fail(`Unhandled media condition: ${condition}`);
  });
  return matches?cssAtWidth([...rule.cssRules],width,{rootSize,reducedMotion}):'';
 }).join('\n');
}
function atWidth(f,width,check,options){
 const style=f.d.createElement('style');style.textContent=cssAtWidth(f.rules,width,options);f.d.head.append(style);
 try{check(element=>f.w.getComputedStyle(element))}finally{style.remove()}
}
function assertUniqueIds(d){const ids=[...d.querySelectorAll('[id]')].map(element=>element.id);assert.equal(ids.length,new Set(ids).size,'each label target has a unique ID')}
// The new explanation surface reuses existing reward actions, and never
// offers a phone number, lists a profile or publishes media merely by viewing.
test('five larger game-piece cards follow My secrets and retain the real saved results beneath',async()=>{
 for(const level of [0,1,2,3,4,5]){
  const f=await fixture(level);try{
   const rows=[...f.d.querySelectorAll('#root > .dashboardDisclosure')];
   assert.deepEqual(rows.map(row=>row.dataset.dashboardDisclosure),['secrets','pieces','results','freezer']);
   assert.equal(f.d.querySelectorAll('#gamePiecesDetailLink').length,1);
   const cards=[...f.d.querySelectorAll('.gamePieceCard')];assert.equal(cards.length,5);
   assert.deepEqual(cards.map(card=>card.querySelector('h3').textContent),['Email','Cell','Duhwildcards','Be discovered','Your 15 seconds']);
   assert.equal(cards.filter(card=>card.classList.contains('earned')).length,level);
   assert.equal(cards.filter(card=>card.classList.contains('next')).length,level<5?1:0);
   assert.equal(f.d.querySelector('#gamePiecesProgress').textContent,`${level} / 5`);
   assert.equal(f.d.querySelector('#gamePiecesProgress').getAttribute('aria-label'),`${level} of 5 game pieces unlocked`);
   for(const card of cards){assert.ok(card.querySelector('.gamePieceHook').textContent);assert.ok(card.querySelector('.gamePieceDescription').textContent);assert.ok(card.querySelector('.gamePieceConsent').textContent);assert.ok(f.d.getElementById(card.getAttribute('aria-labelledby')));assert.equal(card.querySelectorAll('button').length,1)}
   assert.equal(f.d.querySelector('#gamePieces').open,false);
   const piece={moduleId:'synthetic',version:1,title:'Saved optional result',result:{summary:'A private saved reflection.'}};
   f.w.eval(`mergeDiscoveryPieces(${JSON.stringify([piece])});paintDiscovery()`);
   assert.equal(f.d.querySelectorAll('#earnedPieces').length,1);
   assert.equal(f.d.querySelector('#earnedPieces').closest('[data-dashboard-disclosure]').dataset.dashboardDisclosure,'results');
   assert.match(f.d.querySelector('#earnedPieces').textContent,/A private saved reflection/);
   assert.equal(f.d.querySelector('#gameResultsCount').textContent,'1');
   assert.equal(f.d.querySelectorAll('#rewardLadder .rewardSlot').length,5);
   assertUniqueIds(f.d);
  }finally{f.close()}
 }
});

test('detail link opens and focuses the disclosure without a modal, new history or data mutation',async()=>{
 const f=await fixture(3);try{
  const scrolls=[];f.w.HTMLElement.prototype.scrollIntoView=function(options){scrolls.push({id:this.id,options})};
  f.w.matchMedia=()=>({matches:false});
  const beforeCalls=f.calls.length,beforeHistory=f.w.history.length,beforeUrl=f.w.location.href;
  const composer=f.d.querySelector('#message');composer.value='Keep my unsent message';
  const results=f.d.querySelector('#earnedPieces'),link=f.d.querySelector('#gamePiecesDetailLink');
  assert.equal(link.tagName,'A');assert.equal(link.getAttribute('href'),'#gamePieces');assert.equal(link.getAttribute('aria-controls'),'gamePieces');
  assert.match(link.getAttribute('aria-label'),/Open Game Pieces details below/);link.focus();link.click();
  const details=f.d.querySelector('#gamePieces');
  assert.equal(details.open,true);assert.equal(f.d.activeElement,details.querySelector(':scope > summary'));
  assert.equal(scrolls.length,1);assert.equal(scrolls[0].id,'gamePieces');assert.equal(scrolls[0].options.behavior,'smooth');assert.equal(scrolls[0].options.block,'start');
  assert.equal(f.w.eval('s.modal'),'');assert.equal(f.d.querySelector('[role="dialog"]'),null);
  assert.equal(f.calls.length,beforeCalls);assert.equal(f.w.history.length,beforeHistory);assert.equal(f.w.location.href,beforeUrl);
  assert.equal(f.d.querySelector('#message'),composer);assert.equal(composer.value,'Keep my unsent message');assert.equal(f.d.querySelector('#earnedPieces'),results);
  // Closing, reopening, immediate repeated clicks and native toggle remain stable.
  details.querySelector('summary').click();assert.equal(details.open,false);
  f.w.matchMedia=()=>({matches:true});link.click();link.click();assert.equal(details.open,true);
  assert.equal(scrolls.length,3);assert.equal(scrolls[2].options.behavior,'auto');
  assert.equal(f.d.querySelectorAll('#gamePieceCards').length,1);assert.equal(f.d.querySelectorAll('.gamePieceCard').length,5);
  f.w.eval('render(true)');assert.equal(f.d.querySelector('#gamePieces').open,true);assert.equal(f.d.activeElement,f.d.querySelector('#gamePieces > summary'));
  assert.equal(f.calls.filter(call=>call.options.method==='POST').length,0);
 }finally{f.close()}
});

test('progress repaint preserves detail-link and action focus, Close returns to the same new card',async()=>{
 const f=await fixture(2);try{
  f.d.querySelector('#gamePiecesDetailLink').focus();f.w.eval('paintRewards()');assert.equal(f.d.activeElement.id,'gamePiecesDetailLink');
  f.d.querySelector('#gamePiecesDetailLink').click();
  const button=f.d.querySelector('#gamePieceAction2');button.focus();f.w.eval('paintRewards()');assert.equal(f.d.activeElement.id,'gamePieceAction2');
  f.d.activeElement.click();await flush();assert.ok(f.d.querySelector('.rewardPrivatePhone'));
  // Existing reward refresh replaces the source button while the modal is open.
  f.w.eval('paintRewards()');f.w.closeInvite();assert.equal(f.d.activeElement.id,'gamePieceAction2');
  assert.equal(f.d.querySelector('#gamePieces').open,true);
  assert.equal(f.calls.filter(call=>call.options.method==='POST').length,0);
 }finally{f.close()}
});

test('Email opens the actual email form without creating a QR or sending before explicit input',async()=>{
 const f=await fixture(1);try{
  f.d.querySelector('#gamePiecesDetailLink').click();f.d.querySelector('#gamePieceAction1').click();await flush();
  assert.equal(f.w.eval('s.modal'),'send');assert.ok(f.d.querySelector('#inviteName'));assert.equal(f.d.querySelector('#inviteContact').type,'email');
  assert.equal(f.calls.filter(call=>call.options.method==='POST').length,0);assert.equal(f.calls.filter(call=>call.url==='/api/qr').length,0);
  f.w.closeInvite();assert.equal(f.w.eval('s.modal'),'');assert.equal(f.d.querySelector('#gamePieces').open,true);
  // A later explicit switch to the in-person code uses its own established creation flow.
  let made=0;f.w.makeQrInvite=()=>{made++};f.w.inviteMode('send');assert.equal(made,0);f.w.inviteMode('qr');assert.equal(made,1);
  f.w.eval("s.qrInvite={expiresAt:new Date(Date.now()+600000).toISOString(),svg:'',url:'https://synthetic.example.test'}");f.w.inviteMode('send');f.w.inviteMode('qr');assert.equal(made,1,'keep a still-valid code on mode changes');
 }finally{f.close()}
});

test('full dashboard rerenders preserve link and all five card action focus without stealing newer view focus',async()=>{
 const f=await fixture(3);try{
  f.d.querySelector('#gamePiecesDetailLink').click();
  for(const id of ['gamePiecesDetailLink',...Array.from({length:5},(_,i)=>`gamePieceAction${i+1}`)]){
   f.d.getElementById(id).focus();f.w.eval('render(true)');assert.equal(f.d.activeElement.id,id);
  }
  f.d.querySelector('#gamePieceAction3').focus();f.w.eval("s.view='landing';render()");assert.equal(f.d.querySelector('#gamePieceAction3'),null);assert.notEqual(f.d.activeElement.id,'gamePieceAction3');
 }finally{f.close()}
});

test('card actions use existing routes and locked cards direct to the next permitted step',async()=>{
 const f=await fixture(3);try{
  const invoked=[];f.w.openRewardLevel=n=>invoked.push(['level',n]);f.w.inviteMode=mode=>invoked.push(['invite',mode]);f.w.openWildcardConnections=()=>invoked.push(['wildcards']);f.w.openRewardDirectory=screen=>invoked.push(['directory',screen]);
  for(const button of f.d.querySelectorAll('[data-game-piece-action]'))button.click();
  assert.deepEqual(invoked,[['invite','send'],['level',2],['wildcards'],['level',4],['level',4]]);
  invoked.length=0;f.server.level=5;await f.w.loadRewards(true);
  for(const button of f.d.querySelectorAll('[data-game-piece-action]'))button.click();
  assert.deepEqual(invoked,[['invite','send'],['level',2],['wildcards'],['directory','directory'],['directory','video']]);
  f.server.level=0;await f.w.loadRewards(true);invoked.length=0;
  for(const button of f.d.querySelectorAll('[data-game-piece-action]'))button.click();assert.deepEqual(invoked,Array.from({length:5},()=>['level',1]));
  assert.equal(f.calls.filter(call=>call.options.method==='POST').length,0);
 }finally{f.close()}
});

test('pending or failed authorization cannot present unlocked actions or carry another account’s disclosure state',async()=>{
 const f=await fixture(5);try{
  f.w.eval('rewardsData=null;paintRewards()');
  assert.ok([...f.d.querySelectorAll('[data-game-piece-action]')].every(button=>button.disabled));assert.equal(f.d.querySelectorAll('.gamePieceCard.earned').length,0);assert.equal(f.d.querySelector('#gamePiecesProgress').textContent,'…');
  f.w.eval('rewardsError="Refresh failed";paintRewards()');assert.match(f.d.querySelector('#gamePieceCards').textContent,/couldn’t refresh/);
  await f.w.loadRewards(true);f.d.querySelector('#gamePiecesDetailLink').click();f.d.querySelector('#gamePieceAction5').focus();
  f.w.invalidateRewardAccess(new Error('Please sign in again.'));
  assert.ok([...f.d.querySelectorAll('[data-game-piece-action]')].every(button=>button.disabled));assert.equal(f.d.querySelectorAll('.gamePieceCard.earned').length,0);assert.equal(f.d.activeElement,f.d.querySelector('#gamePieces > summary'));
  const old=f.d.querySelector('#gamePieces');f.w.eval("s={...blank(),view:'dashboard',memberId:'new-owner',member:{name:'New',answers:[],verified:true},liveMember:true};render()");
  old.open=true;old.dispatchEvent(new f.w.Event('toggle'));
  assert.equal(f.d.querySelector('#gamePieces').open,false);
  f.w.eval("s=blank();render()");assert.equal(f.d.querySelector('#gamePieces'),null);f.w.showGamePieces();assert.equal(f.d.querySelector('#gamePieces'),null);
 }finally{f.close()}
});

test('gamey descriptions keep mutual consent, private-first discovery/video and honest card limits visible',async()=>{
 const f=await fixture(5);try{
  const text=[...f.d.querySelectorAll('.gamePieceCard')].map(card=>card.textContent);
  assert.match(text[0],/email stays private/);assert.match(text[0],/They choose whether to join/);
  assert.match(text[1],/Both people must finish Second 5/);assert.match(text[1],/only when you both opt in/);
  assert.match(text[2],/3 cards per connection/);assert.match(text[2],/accepted Friend/);assert.match(text[2],/Vibe chat you both opened/);assert.match(text[2],/Answering is free/);assert.match(text[2],/never opens chat or shares contact details/);
  assert.match(text[3],/Listing is opt-in/);assert.match(text[3],/eligible signed-in members/);assert.match(text[3],/email, phone and private answers stay out/);
  assert.match(text[4],/Upload privately first/);assert.match(text[4],/choose to list your profile and publish/);assert.match(text[4],/15 seconds.*2 MiB/);
 }finally{f.close()}
});

test('large cards use two desktop columns and one mobile column with readable, wrapping copy and usable actions',async()=>{
 const f=await fixture(3);try{
  for(const width of widths)atWidth(f,width,style=>{
   assert.equal(style(f.d.querySelector('.gamePieceCardGrid')).gridTemplateColumns,width>700?'repeat(2,minmax(0,1fr))':'minmax(0,1fr)');
   for(const card of f.d.querySelectorAll('.gamePieceCard')){
    assert.equal(parseFloat(style(card).minWidth),0);assert.equal(style(card).overflowWrap,'anywhere');
    assert.ok(parseFloat(style(card).paddingLeft)>=19);assert.equal(style(card).display,'flex');assert.equal(style(card).flexDirection,'column');
    assert.equal(card.querySelector('.gamePieceDescription').closest('details').id,'gamePieces');
    for(const text of card.querySelectorAll('p,h3')){assert.notEqual(style(text).whiteSpace,'nowrap');assert.notEqual(style(text).textOverflow,'ellipsis');assert.notEqual(style(text).overflow,'hidden')}
    const button=card.querySelector('button');assert.ok(parseFloat(style(button).minHeight)>=44);assert.equal(style(button).whiteSpace,'normal');
    if(width<=700)assert.equal(style(button).width,'100%');
   }
   const link=f.d.querySelector('#gamePiecesDetailLink');assert.ok(parseFloat(style(link).minHeight)>=24);assert.ok(parseFloat(style(link).minWidth)>=44);
   assert.equal(style(f.d.querySelector('.rewardSlots')).gridTemplateColumns,'repeat(5,minmax(0,1fr))');
  });
  assertUniqueIds(f.d);
 }finally{f.close()}
});
