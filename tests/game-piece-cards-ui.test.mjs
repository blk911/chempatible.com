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
// The homepage is connection-first; cumulative profile steps stay secondary.
test('connections lead, catalogs stay hidden, and earned profile data stays reachable at every level',async()=>{
 for(const level of [0,1,2,3,4,5]){
  const f=await fixture(level);try{
   const header=f.d.querySelector('.socialMemberHeader'),progress=f.d.querySelector('#profileProgress');
   assert.equal(header.querySelector('#rewardLadder'),null);
   assert.equal(f.d.querySelectorAll('#rewardLadder').length,1);
   assert.equal(f.d.querySelectorAll('#gamePieces,.gamePieceCard,#gamePiecesDetailLink').length,0);
   assert.equal(progress.open,false);
   assert.deepEqual([...f.d.querySelectorAll('#root > .dashboardDisclosure')].map(row=>row.dataset.dashboardDisclosure),['progress','secrets','results','freezer']);
   assert.equal(f.d.querySelector('#profileProgressCount').textContent,`${level} / 5`);
   assert.equal(progress.querySelectorAll('.rewardSlot.unlocked').length,level);
   assert.equal(f.d.querySelectorAll('#earnedPieces').length,1);
   assert.equal(f.d.querySelectorAll('#gamePieceFeed').length,1);
   assert.match(progress.textContent,/completed steps stay with your profile/);
   assert.match(progress.textContent,/Each connection moves at its own pace/);
   assert.equal(f.calls.filter(call=>call.options.method==='POST').length,0);
   assertUniqueIds(f.d);
  }finally{f.close()}
 }
});

test('opening profile progress preserves chat draft, history and results; repeated toggles preserve account state',async()=>{
 const f=await fixture(3);try{
  const progress=f.d.querySelector('#profileProgress'),summary=progress.querySelector('summary');
  const composer=f.d.querySelector('#message');composer.value='Keep my unsent message';
  const results=f.d.querySelector('#earnedPieces'),beforeHistory=f.w.history.length,beforeUrl=f.w.location.href,beforeCalls=f.calls.length;
  summary.focus();summary.click();assert.equal(progress.open,true);
  assert.equal(f.d.querySelector('#message'),composer);assert.equal(composer.value,'Keep my unsent message');
  assert.equal(f.d.querySelector('#earnedPieces'),results);assert.equal(f.calls.length,beforeCalls);
  assert.equal(f.w.history.length,beforeHistory);assert.equal(f.w.location.href,beforeUrl);assert.equal(f.w.eval('s.modal'),'');
  summary.click();assert.equal(progress.open,false);summary.click();assert.equal(progress.open,true);
  f.w.eval('render(true)');assert.equal(f.d.querySelector('#profileProgress').open,true);assert.equal(f.d.activeElement,f.d.querySelector('#profileProgress > summary'));
  f.server.level=4;await f.w.loadRewards(true);assert.equal(f.d.querySelector('#profileProgressCount').textContent,'4 / 5');assert.equal(f.d.querySelector('#profileProgress').open,true);
  const old=f.d.querySelector('#profileProgress');
  f.w.eval("s={...blank(),view:'dashboard',memberId:'new-owner',member:{name:'New',answers:[],verified:true},liveMember:true};render()");
  old.open=true;old.dispatchEvent(new f.w.Event('toggle'));assert.equal(f.d.querySelector('#profileProgress').open,false);
 }finally{f.close()}
});

test('progress buttons keep existing permitted steps, loading states and modal return focus through polling',async()=>{
 const f=await fixture(2);try{
  f.d.querySelector('#profileProgress > summary').click();
  const slot=f.d.querySelector('[data-reward-level="2"]');slot.focus();f.w.eval('paintRewards()');assert.equal(f.d.activeElement.dataset.rewardLevel,'2');
  f.w.eval('render(true)');assert.equal(f.d.activeElement.dataset.rewardLevel,'2');
  f.d.activeElement.click();await flush();assert.ok(f.d.querySelector('.rewardPrivatePhone'));
  f.w.eval('paintRewards()');f.w.closeInvite();assert.equal(f.d.activeElement.dataset.rewardLevel,'2');assert.equal(f.d.querySelector('#profileProgress').open,true);
  const levels=[];f.w.openRewardTile=n=>levels.push(n);for(const button of f.d.querySelectorAll('[data-reward-level]'))button.click();assert.deepEqual(levels,[1,2,3,4,5]);
  f.w.eval('rewardsData=null;paintRewards()');assert.equal(f.d.querySelector('#profileProgressCount').textContent,'…');assert.equal(f.d.querySelectorAll('.rewardSlot.unlocked').length,0);
  f.w.invalidateRewardAccess(new Error('Please sign in again.'));assert.equal(f.d.querySelector('#profileProgressCount').textContent,'–');assert.equal(f.d.querySelectorAll('.rewardSlot.unlocked').length,0);assert.match(f.d.querySelector('#rewardLadder').textContent,/sign in again/);assert.equal(f.d.activeElement,f.d.querySelector('#profileProgress > summary'));
  assert.equal(f.calls.filter(call=>call.options.method==='POST').length,0);
 }finally{f.close()}
});

test('primary invitations stay explicit and use the existing ready and incomplete member routes',async()=>{
 const f=await fixture(3);try{
  const buttons=[...f.d.querySelectorAll('.socialVibeAction > button')];
  assert.deepEqual(buttons.map(b=>b.textContent),['Send a vibe →','Invite a friend']);
  assert.deepEqual(buttons.map(b=>b.getAttribute('onclick')),['createMyVibe()','openFriendShare()']);
  assert.equal(f.d.querySelector('.connectionsHeading .friendShareButton'),null);
  const action=buttons[0];action.focus();f.w.eval('render(true)');assert.equal(f.d.activeElement.getAttribute('onclick'),'createMyVibe()');
  let made=0;f.w.makeQrInvite=()=>{made++};f.d.activeElement.click();assert.equal(made,1,'only the explicit Vibe action can create a code');f.w.closeInvite();
  f.d.querySelector('.socialMemberAction .friendShareButton').click();assert.equal(f.w.eval('s.modal'),'friendShare');assert.ok(f.d.querySelector('#friendName'));assert.equal(f.calls.filter(call=>call.options.method==='POST').length,0);f.w.closeInvite();
  f.w.eval('s.member.answers=[];s.account.answers=[];render()');f.d.querySelector('.socialVibeAction > button').click();assert.equal(f.w.eval('s.memberQuestionsOpen'),true);assert.equal(made,1,'incomplete members go to First 5 without a new code');
 }finally{f.close()}
});

test('mobile entry controls and profile steps reflow with full-size touch targets and wrapping labels',async()=>{
 const f=await fixture(3);try{
  for(const width of widths)atWidth(f,width,style=>{
   const header=f.d.querySelector('.socialMemberHeader');
   assert.equal(style(header).gridTemplateColumns,width<=700?'repeat(2,minmax(0,1fr))':'minmax(0,1.35fr) minmax(0,1fr)');
   const actions=f.d.querySelector('.socialVibeAction');assert.equal(style(actions).display,width<=700?'grid':'flex');
   if(width<=700)assert.equal(style(actions).gridTemplateColumns,'repeat(2,minmax(0,1fr))');
   for(const button of actions.querySelectorAll('button')){assert.ok(parseFloat(style(button).minHeight)>=46);assert.equal(style(button).whiteSpace,'normal');assert.notEqual(style(button).display,'none')}
   const slots=f.d.querySelector('.rewardSlots');assert.equal(style(slots).gridTemplateColumns,width<=700?'minmax(0,1fr)':'repeat(5,minmax(0,1fr))');
   for(const button of slots.querySelectorAll('button')){assert.ok(parseFloat(style(button).minHeight)>=64);assert.equal(style(button).display,width<=700?'grid':'flex');assert.equal(style(button.querySelector('b')).overflowWrap,'anywhere')}
   assert.ok(parseFloat(style(f.d.querySelector('#profileProgress > summary')).minHeight)>=44);
  });
 }finally{f.close()}
});
