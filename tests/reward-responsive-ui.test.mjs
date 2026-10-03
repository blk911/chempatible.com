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
function assertDialog(d){
 const dialog=d.querySelector('.rewardModal');assert.ok(dialog);
 assert.equal(dialog.getAttribute('role'),'dialog');assert.equal(dialog.getAttribute('aria-modal'),'true');
 assert.ok(d.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent.trim());
 assert.equal(dialog.querySelectorAll('#rewardStatus[role="status"]').length,1);
 assert.equal(dialog.querySelectorAll('#rewardError[role="alert"]').length,1);
 assert.ok(dialog.querySelector('button.close[aria-label]'));assertUniqueIds(d);
 return dialog;
}

test('all six saved-progress states retain five labelled, keyboard-native reward buttons',async()=>{
 for(const level of [0,1,2,3,4,5]){
  const f=await fixture(level);try{
   const ladder=f.d.querySelector('#rewardLadder');
   assert.ok(f.d.getElementById(ladder.getAttribute('aria-labelledby')));
   const buttons=[...ladder.querySelectorAll('.rewardSlot')];assert.equal(buttons.length,5);
   assert.equal(buttons.filter(button=>button.classList.contains('unlocked')).length,level);
   assert.equal(buttons.filter(button=>button.getAttribute('aria-current')==='step').length,level<5?1:0);
   for(const [index,button] of buttons.entries()){
    assert.equal(button.tagName,'BUTTON');assert.equal(button.type,'button');assert.equal(button.disabled,false);
    assert.equal(button.dataset.rewardLevel,String(index+1));
    assert.match(button.getAttribute('aria-label'),new RegExp(`Level ${index+1}`));
    assert.ok(button.querySelector('b')?.textContent.trim());
   }
   assertUniqueIds(f.d);
  }finally{f.close()}
 }
});

test('reward header and question controls keep shrinkable tracks and touch targets across eleven widths',async()=>{
 const f=await fixture(2);try{
  f.w.openRewardLevel(3);const dialog=assertDialog(f.d);
  assert.equal(dialog.querySelectorAll('.rewardPrimary').length,1,'round has one prominent action');
  assert.equal(dialog.querySelector('.rewardDetails').open,false,'secondary explanation starts collapsed');
  assert.equal(dialog.querySelector('.rewardTarget b').textContent,'Getting closer badge');
  const progress=dialog.querySelector('progress#rewardProgress');assert.ok(progress);
  assert.equal(progress.max,5);assert.equal(progress.value,0);
  assert.equal(progress.getAttribute('aria-labelledby'),'rewardAnswerCount');
  const viewport=f.d.querySelector('meta[name="viewport"]').content;
  assert.match(viewport,/width=device-width/);assert.doesNotMatch(viewport,/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/);
  for(const width of widths)atWidth(f,width,style=>{
   const ladder=f.d.querySelector('#rewardLadder'),slots=ladder.querySelector('.rewardSlots');
   assert.equal(parseFloat(style(ladder).minWidth),0,`${width}px ladder may shrink`);
   assert.equal(style(slots).display,'grid');assert.match(style(slots).gridTemplateColumns,/minmax\(0,\s*1fr\)/);
   for(const button of ladder.querySelectorAll('button'))assert.ok(parseFloat(style(button).minHeight)>=44,`${width}px reward controls retain 44px height`);
   for(const slot of ladder.querySelectorAll('.rewardSlot')){assert.equal(parseFloat(style(slot).minWidth),0);assert.equal(style(slot.querySelector('b')).overflowWrap,'anywhere','long labels can wrap at narrow widths and increased text size')}
   if(width<=520){assert.equal(style(ladder.querySelector('.rewardNext .rewardButton')).width,'100%');assert.equal(style(ladder.querySelector('.rewardLadderHeading')).flexWrap,'wrap')}
   assert.match(style(dialog).maxHeight,/d?vh/);assert.equal(style(dialog).overflow,'auto');
   assert.ok(parseFloat(style(dialog.querySelector('.close')).minHeight)>=44);
   assert.ok(parseFloat(style(dialog.querySelector('.close')).minWidth)>=44);
   for(const fieldset of dialog.querySelectorAll('fieldset'))assert.equal(parseFloat(style(fieldset).minWidth),0);
   for(const span of dialog.querySelectorAll('.rewardChoices label>span')){
    assert.ok(parseFloat(style(span).minHeight)>=44,`${width}px answer labels retain touch height`);
    assert.notEqual(style(span).whiteSpace,'nowrap',`${width}px long choices can wrap`);
   }
   for(const button of dialog.querySelectorAll('.rewardButton')){
    assert.ok(parseFloat(style(button).minHeight)>=44);
    assert.equal(style(button).whiteSpace,'normal');
    const limit=style(button).maxWidth;
    assert.ok(limit==='100%'||limit.endsWith('px')&&parseFloat(limit)<=width-60,`${width}px button max-width remains within the mobile content inset`);
   }
   assert.equal(parseFloat(style(progress).minWidth),0,'progress can shrink beside its readable label');
   assert.equal(style(dialog.querySelector('.rewardFormActions')).display,'flex');
   if(width<=700)assert.equal(style(dialog.querySelector('.rewardFormActions')).flexWrap,'wrap');
   assert.ok(parseFloat(style(dialog.querySelector('.rewardDetails summary')).minHeight)>=44);
  });
 }finally{f.close()}
});

test('all four reward rounds retain labelled radio groups and meaningful zero-valued choices',async()=>{
 for(const round of REWARD_ROUNDS){
  const f=await fixture(round.level-1);try{
   f.w.openRewardLevel(round.level);assertDialog(f.d);
   const groups=[...f.d.querySelectorAll('.rewardQuestions fieldset')];assert.equal(groups.length,5);
   const groupNames=[];
   for(const [index,group] of groups.entries()){
    assert.match(group.querySelector('legend').textContent,new RegExp(round.questions[index].text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    const radios=[...group.querySelectorAll('input[type="radio"]')];assert.equal(radios.length,3);
    groupNames.push(radios[0].name);assert.equal(new Set(radios.map(radio=>radio.name)).size,1);
    for(const radio of radios){assert.ok(radio.closest('label')?.querySelector('span')?.textContent.trim());assert.equal(radio.disabled,false)}
   }
   assert.equal(new Set(groupNames).size,5,'native arrow-key choices stay scoped to one question');
   groups[0].querySelector('input[value="0"]').click();
   assert.equal(f.w.eval(`rewardDraft(${round.level}).answers[${JSON.stringify(round.questions[0].id)}]`),0);
   assert.match(f.d.querySelector('#rewardAnswerCount').textContent,/1 of 5/);
   assert.equal(f.d.querySelector('#rewardProgress').value,1);
   for(const [index,group] of groups.entries())group.querySelector(`input[value="${index%3}"]`).click();
   assert.equal(f.d.querySelector('#rewardProgress').value,5);
   assert.match(f.d.querySelector('#rewardAnswerCount').textContent,/5 of 5/);
   f.w.closeInvite();f.w.openRewardLevel(round.level);
   assert.equal(f.d.querySelectorAll('.rewardQuestions input:checked').length,5,'dismiss/reopen preserves draft choices');
   assert.equal(f.d.querySelector('.rewardQuestions input[value="0"]').checked,true,'zero-valued choice remains selected');
   assert.equal(f.d.querySelector('#rewardProgress').value,5);
  }finally{f.close()}
 }
});

test('directory, request and video surfaces have mobile-safe structures without autoplay or implicit sharing',async()=>{
 const f=await fixture(5);try{
  f.w.openRewardDirectory();await flush();assertDialog(f.d);
  const card=f.d.querySelector('.rewardDirectoryGrid article'),request=f.d.querySelector('.rewardRequestCard');
  assert.ok(card);assert.ok(request);assert.equal(card.querySelector('h4').textContent,name);
  const clip=card.querySelector('video');assert.equal(clip.controls,true);assert.equal(clip.autoplay,false);
  assert.equal(clip.hasAttribute('playsinline'),true);assert.equal(clip.preload,'none');
  assert.equal(clip.closest('details').open,false,'video waits behind an explicit disclosure');
  assert.match(f.d.querySelector('.rewardDirectoryOwn').textContent,/Private/);
  const profile=f.d.querySelector('.rewardDirectoryOwn');
  assert.equal(profile.tagName,'DETAILS');assert.equal(profile.open,false,'private profile controls start collapsed');
  assert.match(profile.querySelector('summary').textContent,/Your profile.*Manage/);
  for(const width of widths)atWidth(f,width,style=>{
   assert.equal(parseFloat(style(card).minWidth),0);assert.equal(style(card.querySelector('h4')).overflowWrap,'anywhere');
   assert.equal(style(clip).width,'100%');assert.ok(parseFloat(style(card.querySelector('summary')).minHeight)>=44);
   assert.ok(parseFloat(style(profile.querySelector('summary')).minHeight)>=44);
   for(const element of [card,request])for(const button of element.querySelectorAll('button')){
    assert.ok(parseFloat(style(button).minHeight)>=44,`${width}px discovery action stays touchable`);
    assert.equal(style(button).whiteSpace,'normal');
   }
  });
  f.w.rewardScreen('video');assertDialog(f.d);
  const ownClip=f.d.querySelector('.rewardVideo'),upload=f.d.querySelector('.rewardUpload input');
  assert.equal(ownClip.autoplay,false);assert.equal(ownClip.hasAttribute('playsinline'),true);
  assert.equal(upload.type,'file');assert.equal(upload.accept,'video/mp4');assert.ok(upload.getAttribute('aria-label'));
  assert.match(f.d.querySelector('.rewardModal').textContent,/Only you can view/);
  const limits=f.d.querySelector('.rewardMediaLimits');assert.ok(limits);assert.equal(limits.closest('details'),null,'upload constraints remain visible');
  for(const text of ['15 seconds','2 MiB','MP4','H.264','720p','AAC','MOV','HEVC'])assert.ok(limits.textContent.includes(text));
  for(const width of widths)atWidth(f,width,style=>{
   assert.equal(style(ownClip).width,'100%');assert.ok(parseFloat(style(upload.closest('label')).minHeight)>=44);
   assert.equal(style(upload.closest('label')).maxWidth,'100%');
  });
  assert.equal(f.calls.filter(call=>call.options.method==='POST').length,0);
 }finally{f.close()}
});
