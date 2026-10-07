import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {REWARD_ROUNDS} from '../api/_reward-rounds.mjs';

// Real UI with synthetic two-account APIs. No browser paint, real accounts or network.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const a='a'.repeat(64),b='b'.repeat(64),friend='f'.repeat(64),key='duhwild.game-piece-holds.v1';
const copy=value=>JSON.parse(JSON.stringify(value));
const response=(data,status=200)=>({ok:status<400,status,json:async()=>copy(data)});
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve))};
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve}};
const categories=[{id:'future',title:'Dreams & plans',questions:[{id:'future-1',text:'What would your dream weekend look like?'},{id:'future-2',text:'Where would you love to go next?'}]}];
const ask=(questionId='future-1',asker='sender')=>({questionId,categoryId:'future',asker,ask:{id:`ask-${questionId}`,text:categories[0].questions.find(q=>q.id===questionId).text,at:'2026-10-06T23:00:00.000Z',by:asker==='sender'?'member':'prospect'},reply:null});
const makeServer=()=>({level:{sender:3,recipient:2},pairs:{[a]:[ask()],[b]:[],[friend]:[]},remaining:{sender:2,recipient:3},phone:{sender:false,recipient:false},directory:[],extraRows:{},profiles:{sender:{phone:'+15552223333',confirmedAt:'2026-10-06T22:00:00.000Z',revision:1},recipient:{phone:null,confirmedAt:null,revision:0}},calls:[],requests:new Map(),receipts:new Map(),events:[],fail:false,loseReply:false,intercept:null,ended:new Set()});
function snapshot(server,role,id=a){const eligible=server.level[role]>=3;return {connectionId:id,eligible,limit:3,remaining:eligible?server.remaining[role]:0,usedQuestionIds:server.pairs[id].map(card=>card.questionId),categories:eligible?categories:[],answerMaxLength:1000,legacyAskCount:0,cards:server.pairs[id].map(card=>({questionId:card.questionId,categoryId:card.categoryId,direction:card.asker===role?'outgoing':'incoming',status:card.reply?'answered':'waiting',canAnswer:card.asker!==role&&!card.reply,ask:card.ask,reply:card.reply}))}}
const summary=(server,role)=>({connections:Object.keys(server.pairs).filter(id=>!server.ended.has(id)).map(id=>({id,pendingIncoming:server.pairs[id].filter(card=>card.asker!==role&&!card.reply).length,pendingOutgoing:server.pairs[id].filter(card=>card.asker===role&&!card.reply).length}))});
function feed(server,role,visit){
 const pieces=[];
 for(const [id,cards] of Object.entries(server.pairs))if(!server.ended.has(id))for(const card of cards){const incoming=card.asker!==role&&!card.reply,answered=card.asker===role&&!!card.reply;if(!incoming&&!answered)continue;pieces.push({id:String((id===a?100:200)+(card.questionId==='future-2'?2:1)+(answered?10:0)),version:1,kind:incoming?'wildcard-ask':'wildcard-answer',connectionId:id,actorId:role==='sender'?'recipient':'sender',actorName:id===b?'Jordan':role==='sender'?'Riley':'Taylor',questionId:card.questionId,status:incoming?'your-turn':'answered',target:{type:'wildcard',connectionId:id,questionId:card.questionId}})}
 const peer=role==='sender'?'recipient':'sender';if(server.phone[peer]&&server.level[role]>=2&&!server.ended.has(a))pieces.push({id:'300',version:1,kind:'phone-offer',connectionId:a,actorId:peer,actorName:role==='sender'?'Riley':'Taylor',status:server.phone[role]?'answered':'your-turn',target:{type:'phone',connectionId:a}});
 pieces.push(...server.events.filter(piece=>!piece.owner||piece.owner===role));
 const visible=pieces.filter(piece=>!server.receipts.get(role+':'+piece.id)?.handled).map(piece=>{const receipt=server.receipts.get(role+':'+piece.id);return {...piece,receiptRevision:receipt?.revision||0,observedAt:receipt?.seen?'2026-10-06T23:30:00.000Z':null,held:receipt?.hold===visit,shouldPrompt:!receipt?.seen||!!receipt.hold&&receipt.hold!==visit}});
 return {pieces:visible,pendingCount:visible.length};
}
async function fixture({role='recipient',server=makeServer(),auto=false,selected=a,held,composer='',modal=''}={}){
 const dom=new JSDOM(html,{url:'https://wildcard-answers.example.test/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;let currentRole=role;
 w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 const rows=()=>[a,b,friend].map(id=>({id,kind:id===friend?'friend':'vibe',claimed:true,channel:id===friend?'friend':'email',status:server.ended.has(id)?'ended':server.status||'chat',location:server.ended.has(id)?'freezer':'active',side:currentRole==='sender'?'member':'prospect',prospect_name:id===b?'Jordan':'Riley',sender_name:id===b?'Jordan':'Taylor',own_answers:Array(10).fill(0),prospect_answers:Array(10).fill(1),sender_answers:Array(10).fill(0),messages:[]}));
 w.fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):null,owner=options.headers?.['x-chempat-member-id']||currentRole,call={url,body,owner,method:options.method||'GET'};server.calls.push(call);
  if(server.intercept){const result=server.intercept(call);if(result)return result}
  if(url==='/api/connection?inbox=1')return response({connections:rows()});
  if(url==='/api/connection'&&body)return response({status:body.action==='decision'?'secondFive':'secondResults'});
  if(options.method==='HEAD'&&url.startsWith('/api/reward-directory?')){const id=new URL(url,'https://fixture.example.test').searchParams.get(url.includes('video=')?'video':'photo'),profile=server.directory.find(p=>p.id===id);return response({},profile&&server.level[owner]>=4&&(!url.includes('video=')||profile.videoAvailable)?200:404)}
  if(url==='/api/reward-directory?profile=1')return response({profile:{listed:false,name:owner==='sender'?'Taylor':'Riley',photo:null,video:null,videoPublished:false},eligibility:{directory:server.level[owner]>=4,video:server.level[owner]>=5}});
  if(url.startsWith('/api/reward-directory?directory=1'))return response({profiles:server.directory,nextCursor:null});
  if(url==='/api/reward-requests')return response({incoming:[],outgoing:[]});
  if(url==='/api/member'&&body?.action==='logout')return response({ok:true});
  if(url.startsWith('/api/discovery'))return response({modules:[],games:[],pieces:[]});
  if(url==='/api/rewards?phoneRequests=1'){const peer=owner==='sender'?'recipient':'sender';return response({phoneRequests:server.phone[peer]&&!server.phone[owner]&&server.level[owner]>=2&&server.level[peer]>=2&&!server.ended.has(a)?[{connectionId:a,offeredAt:'2026-10-06T23:10:00.000Z'}]:[]})}
  if(url.startsWith('/api/rewards')){
   if(body?.action==='offerPhone')server.phone[owner]=true;
   if(body?.action==='confirmProfilePhone')server.profiles[owner]={phone:body.phone,confirmedAt:'2026-10-06T23:30:00.000Z',revision:body.phoneRevision+1};
   const peer=owner==='sender'?'recipient':'sender';return response({level:server.level[owner],rounds:REWARD_ROUNDS,answers:{},draftRevision:0,phoneProfile:server.profiles[owner],connections:[],connection:{id:a,phone:{eligible:server.level[owner]>=2&&server.level[peer]>=2,ownEligible:server.level[owner]>=2,otherEligible:server.level[peer]>=2,ownProfileConfirmed:!!server.profiles[owner].confirmedAt,otherProfileConfirmed:!!server.profiles[peer].confirmedAt,ownOffered:server.phone[owner],otherOffered:server.phone[peer],shared:server.phone[owner]&&server.phone[peer],...(server.phone[owner]&&server.phone[peer]?{ownPhone:'+15552223333',otherPhone:'+15556667777'}:{})}}});
  }
  if(url.startsWith('/api/game-pieces?')){const parsed=new URL(url,'https://wildcard-answers.example.test'),id=parsed.searchParams.get('connection');if(id){const row=server.extraRows[id],piece=feed(server,owner,parsed.searchParams.get('visit')).pieces.find(p=>p.id===parsed.searchParams.get('piece'));if(!row||server.ended.has(id))return response({error:'Connection no longer available.'},404);if(parsed.searchParams.get('refresh')==='1')return response({connection:row});return piece?response({piece,connection:row}):response({error:'Piece no longer available.'},404)}return response(feed(server,owner,parsed.searchParams.get('visit')))}
  if(url==='/api/game-pieces'&&body){const receipt=server.receipts.get(owner+':'+body.id)||{};if(body.action!=='handled'&&body.receiptRevision!==(receipt.revision||0))return response({receiptConflict:true,error:'Receipt changed.'},409);receipt.revision=(receipt.revision||0)+1;receipt.seen=true;if(body.action==='hold')receipt.hold=body.visit;if(body.action==='seen')receipt.hold=null;if(body.action==='handled'){receipt.handled=true;receipt.hold=null}server.receipts.set(owner+':'+body.id,receipt);return response({ok:true,receiptRevision:receipt.revision})}
  if(url==='/api/wildcards?summary=1')return response(summary(server,owner));
  if(!url.startsWith('/api/wildcards'))return response({},401);
  const id=body?.connectionId||new URL(url,'https://wildcard-answers.example.test').searchParams.get('connection');assert.ok(server.pairs[id]);
  if(!body)return response(snapshot(server,owner,id));
  if(server.fail)return response({error:'Sending interrupted. Try again.'},503);
  const card=server.pairs[id].find(card=>card.questionId===body.questionId);assert.equal(body.action,'answer');assert.ok(card);assert.notEqual(card.asker,owner);
  if(server.requests.has(body.requestId))return response({...snapshot(server,owner,id),message:card.reply,replayed:true});
  if(card.reply)return response({...snapshot(server,owner,id),error:'This card already has an answer.',answerExists:true},409);
  card.reply={id:'reply-'+body.requestId,text:body.answer,at:'2026-10-06T23:30:00.000Z',by:owner==='sender'?'member':'prospect'};server.requests.set(body.requestId,body.answer);
  if(server.loseReply){server.loseReply=false;throw Error('Response interrupted.')}
  return response({...snapshot(server,owner,id),message:card.reply,replayed:false});
 };
 if(held)w.sessionStorage.setItem(key,JSON.stringify(held));
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 const mount=(newRole=role,{allowAuto=auto,initialModal=modal,text=composer}={})=>{currentRole=newRole;const own={id:newRole,name:newRole==='sender'?'Taylor':'Riley',contact:`${newRole}@example.test`,photo:'',answers:Array(server.level[newRole]>=2?10:5).fill(0),verified:true};w.eval(`s={...blank(),view:'dashboard',member:${JSON.stringify(own)},account:${JSON.stringify(own)},memberId:${JSON.stringify(newRole)},liveMember:true,inbox:${JSON.stringify(rows().filter(row=>row.kind==='vibe'))},friends:${JSON.stringify(rows().filter(row=>row.kind==='friend'))},selectedChempat:${JSON.stringify(selected)},phase:'chat'};syncGamePieceOwner();gamePieceAutoUsed=${!allowAuto};${text?`chatDrafts.set(${JSON.stringify(newRole+':'+selected)},{text:${JSON.stringify(text)}});`:''}${initialModal?`changeModal(${JSON.stringify(initialModal)});`:''}render()`)};
 mount();await flush();
 return {w,d,server,mount,posts:()=>server.calls.filter(c=>c.body&&c.url==='/api/wildcards'),visible:()=>d.querySelector('#root').textContent+d.querySelector('#modalHost').textContent,close:()=>w.close()};
}
function write(f,text){const field=f.d.querySelector('#wildcardAnswer');assert.ok(field);field.value=text;field.dispatchEvent(new f.w.Event('input',{bubbles:true}));return field}
async function openAnswer(f,id=a,question='future-1'){f.w.openWildcardAnswer(id,question);await flush()}

test('both accounts see the same played question; recipient below Step 3 can answer without an allowance',async()=>{
 const server=makeServer(),sender=await fixture({role:'sender',server}),recipient=await fixture({server});try{
  assert.match(sender.d.querySelector('.wildcardPlayedCard').textContent,/You played a card for Riley.*Waiting for reply/);
  assert.match(recipient.d.querySelector('.wildcardPlayedCard').textContent,/Taylor played a card.*Answer now/);
  assert.equal(recipient.d.querySelector('#connectionWildcards').hidden,false);assert.equal(recipient.d.querySelector('[data-wildcard-focus="open"]'),null);
  recipient.w.openWildcardPicker(a);assert.equal(recipient.w.eval('s.modal'),'');
  await openAnswer(recipient);write(recipient,'A walk by the water, then cooking together.');await recipient.w.answerWildcard();
  assert.equal(server.remaining.recipient,3);assert.equal(server.remaining.sender,2);assert.equal(recipient.posts().length,1);assert.equal(recipient.posts()[0].body.action,'answer');assert.equal(recipient.posts()[0].body.connectionId,a);
  assert.match(recipient.d.querySelector('.wildcardPlayedCard').textContent,/Answered.*Your answer.*walk by the water/);
  await sender.w.loadWildcards(a,true);assert.match(sender.d.querySelector('.wildcardPlayedCard').textContent,/Answered.*Riley’s answer.*walk by the water/);
  assert.equal(sender.d.querySelector('[data-wildcard-focus="answer:future-1"]'),null);
 }finally{sender.close();recipient.close()}
});

test('pending badge covers an unselected connection and disappears after the answer',async()=>{
 const server=makeServer();server.pairs[a]=[];server.pairs[b]=[ask()];const f=await fixture({server});try{
  const indicator=f.d.querySelector(`[data-wildcard-pending="${b}"]`);assert.equal(indicator.hidden,false);assert.match(indicator.textContent,/1 card to answer/);assert.match(indicator.closest('button').getAttribute('aria-label'),/1 card to answer/);
  indicator.closest('button').click();await flush();assert.match(f.d.querySelector('.wildcardPlayedCard').textContent,/Jordan played a card/);
  await openAnswer(f,b);write(f,'Somewhere sunny.');await f.w.answerWildcard();await flush();assert.equal(f.d.querySelector(`[data-wildcard-pending="${b}"]`).hidden,true);
  f.w.selectChempat(friend);assert.equal(f.d.querySelector('#connectionWildcards').hidden,true);f.w.openWildcardAnswer(friend,'future-1');assert.equal(f.w.eval('s.modal'),'');
 }finally{f.close()}
});

test('empty answers cannot send; failed and lost responses retain the draft and idempotent retry',async()=>{
 const f=await fixture();try{
  await openAnswer(f);write(f,'   ');await f.w.answerWildcard();assert.equal(f.posts().length,0);assert.match(f.d.querySelector('#wildcardError').textContent,/1,000/);
  write(f,'Tea and a good book.');f.server.fail=true;await f.w.answerWildcard();assert.equal(f.d.querySelector('#wildcardAnswer').value,'Tea and a good book.');assert.equal(f.server.pairs[a][0].reply,null);
  const requestId=f.posts()[0].body.requestId;f.server.fail=false;f.server.loseReply=true;await f.w.answerWildcard();assert.equal(f.d.querySelector('#wildcardAnswer').value,'Tea and a good book.');await f.w.answerWildcard();assert.equal(f.posts().at(-1).body.requestId,requestId);assert.equal(f.server.requests.size,1);assert.match(f.d.querySelector('.wildcardPlayedCard').textContent,/Answered/);
  for(const storage of [f.w.localStorage,f.w.sessionStorage])assert.ok(!JSON.stringify({...storage}).includes('Tea and a good book'),'answer draft stays out of browser storage');
 }finally{f.close()}
});

test('double-submit and close during pending reply never duplicate or reopen the card',async()=>{
 const f=await fixture();try{
  await openAnswer(f);write(f,'A train trip.');const hold=deferred();f.server.intercept=c=>c.body?.action==='answer'?hold.promise:null;const pending=f.w.answerWildcard();await f.w.answerWildcard();assert.equal(f.posts().length,1);assert.match(f.d.querySelector('#wildcardStatus').textContent,/Sending your reply/);
  f.w.closeInvite();const card=f.server.pairs[a][0];card.reply={id:'reply-one',text:'A train trip.',at:'2026-10-06T23:30:00.000Z',by:'prospect'};hold.resolve(response({...snapshot(f.server,'recipient'),message:card.reply}));await pending;assert.equal(f.w.eval('s.modal'),'');assert.equal(f.d.querySelector('.wildcardModal'),null);assert.match(f.d.querySelector('.wildcardPlayedCard').textContent,/Answered/);
 }finally{f.close()}
});

test('poll refresh preserves answer text, cursor and accessible keyboard controls',async()=>{
 const f=await fixture();try{
  await openAnswer(f);const field=write(f,'Keep this unfinished thought');field.focus();field.setSelectionRange(3,8);await f.w.loadWildcards(a,true);assert.equal(f.d.activeElement.id,'wildcardAnswer');assert.equal(f.d.activeElement.value,'Keep this unfinished thought');assert.equal(f.d.activeElement.selectionStart,3);assert.equal(f.d.activeElement.selectionEnd,8);
  const shift=new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true});f.d.dispatchEvent(shift);assert.equal(shift.defaultPrevented,false,'native previous focus from textarea is Close, not a forced jump to Cancel');
  const close=f.d.querySelector('.wildcardModal .close');close.focus();f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(f.d.activeElement.dataset.wildcardFocus,'cancel');
  f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.d.querySelector('.wildcardModal'),null);await openAnswer(f);assert.equal(f.d.querySelector('#wildcardAnswer').value,'Keep this unfinished thought');
 }finally{f.close()}
});

test('a stale waiting snapshot cannot erase an answered card or revive its answer action',async()=>{
 const f=await fixture();try{
  const older=snapshot(f.server,'recipient'),hold=deferred();f.server.intercept=c=>c.url===`/api/wildcards?connection=${a}`?hold.promise:null;const stale=f.w.loadWildcards(a,true);
  await openAnswer(f);write(f,'A picnic.');f.server.intercept=null;await f.w.answerWildcard();hold.resolve(response(older));await stale;
  assert.match(f.d.querySelector('.wildcardPlayedCard').textContent,/Answered.*A picnic/);assert.equal(f.d.querySelector('[data-wildcard-focus="answer:future-1"]'),null);
  f.w.eval(`acceptWildcards(wildcardEntry(wildcardConnection('${a}')),${JSON.stringify(older)},'${a}');paintWildcards()`);assert.match(f.d.querySelector('.wildcardPlayedCard').textContent,/Answered.*A picnic/);
 }finally{f.close()}
});

test('reply conflict shows the authoritative answer without replacing it or charging a card',async()=>{
 const f=await fixture();try{
  await openAnswer(f);write(f,'My local thought.');f.server.pairs[a][0].reply={id:'remote-reply',text:'Saved from my other tab.',at:'2026-10-06T23:30:00.000Z',by:'prospect'};await f.w.answerWildcard();await flush();
  assert.match(f.d.querySelector('.wildcardModal').textContent,/Card answered.*Saved from my other tab/);assert.equal(f.d.querySelector('#wildcardAnswer'),null);assert.equal(f.server.remaining.recipient,3);
 }finally{f.close()}
});

test('authoritative GET auth failure clears every pair, reply draft and pending badge',async()=>{
 const f=await fixture();try{
  await openAnswer(f);write(f,'Private unfinished answer');f.w.closeInvite();f.server.intercept=c=>c.url===`/api/wildcards?connection=${b}`?response({error:'Sign-in expired.'},401):null;f.w.selectChempat(b);await flush();
  assert.equal(f.w.eval('wildcardPairs.size'),0);assert.equal(f.w.eval('wildcardSummary.size'),0);assert.match(f.w.eval('rewardsAuthError'),/expired/);f.w.selectChempat(a);assert.ok(!f.visible().includes(categories[0].questions[0].text));assert.ok(!f.visible().includes('Private unfinished answer'));
 }finally{f.close()}
});

test('account switches and ended connections reject late answer results',async()=>{
 for(const change of ['account','ended']){const f=await fixture();try{
  await openAnswer(f);write(f,'Never show across accounts');const hold=deferred();f.server.intercept=c=>c.body?.action==='answer'?hold.promise:null;const pending=f.w.answerWildcard();const answered=snapshot(f.server,'recipient');answered.cards[0]={...answered.cards[0],status:'answered',canAnswer:false,reply:{id:'reply',text:'Never show across accounts',at:'2026-10-06T23:30:00.000Z',by:'prospect'}};
  if(change==='account'){f.server.intercept=null;f.mount('sender')}else{f.server.ended.add(a);f.w.eval(`s.inbox.find(c=>c.id==='${a}').status='ended';render(true)`)}
  hold.resolve(response(answered));await pending;await flush();assert.equal(f.d.querySelector('.wildcardModal'),null);assert.ok(!f.visible().includes('Never show across accounts'));
 }finally{f.close()}}
});

test('auto arrival presents exactly one incoming piece and Play opens the explicit answer',async()=>{
 const server=makeServer();server.pairs[b]=[ask('future-2')];const f=await fixture({server,auto:true});try{
  assert.equal(f.d.querySelectorAll('[role="dialog"]').length,1);assert.match(f.d.querySelector('#gamePieceTitle').textContent,/Taylor played a card/);assert.match(f.d.querySelector('#gamePieceCount').textContent,/1 of 2/);assert.equal(f.posts().length,0);
  await f.w.playGamePiece();await flush();assert.equal(f.d.querySelector('.gamePieceModal'),null);assert.ok(f.d.querySelector('#wildcardAnswer'));assert.equal(f.posts().length,0);write(f,'A quiet weekend.');await f.w.answerWildcard();await flush();assert.equal(f.d.querySelector('.gamePieceModal'),null,'no second automatic popup stack after completing one');
 }finally{f.close()}
});

test('Hold, Escape, backdrop and Close defer only the piece ID and polling never reopens it',async()=>{
 for(const method of ['hold','escape','backdrop','close']){const f=await fixture({auto:true});try{
  assert.ok(f.d.querySelector('.gamePieceModal'));
  if(method==='escape')f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));else if(method==='backdrop')f.d.querySelector('.modalBackdrop').click();else if(method==='close')f.d.querySelector('.gamePieceModal .close').click();else f.w.holdGamePiece();
  assert.equal(f.d.querySelector('.gamePieceModal'),null);assert.equal(f.posts().length,0);assert.equal(f.server.pairs[a][0].reply,null);assert.equal(f.d.querySelector(`[data-wildcard-pending="${a}"]`).hidden,false);
  const held=JSON.parse(f.w.sessionStorage.getItem(key));assert.equal(held.account,'recipient');assert.equal(held.held.length,1);assert.equal(held.held[0],'101');assert.ok(!JSON.stringify(held).includes('dream weekend'));
  await f.w.loadWildcardSummary(true);await f.w.loadGamePiecePhones(true);f.w.render(true);await flush();assert.equal(f.d.querySelector('.gamePieceModal'),null);
  const resumed=await fixture({auto:true,server:f.server,held});try{assert.equal(resumed.d.querySelector('.gamePieceModal'),null,'tab-session held ID survives a reload')}finally{resumed.close()}
 }finally{f.close()}}
});

test('sender waiting and answered cards never auto-present; active composer defers until safe dashboard entry',async()=>{
 const sender=await fixture({role:'sender',auto:true});try{assert.equal(sender.d.querySelector('.gamePieceModal'),null)}finally{sender.close()}
 const server=makeServer();server.pairs[a][0].reply={id:'reply',text:'Already answered.',at:'2026-10-06T23:30:00.000Z',by:'prospect'};const done=await fixture({server,auto:true});try{assert.equal(done.d.querySelector('.gamePieceModal'),null)}finally{done.close()}
 const busy=await fixture({auto:true,composer:'Writing to my friend'});try{
  assert.equal(busy.d.querySelector('.gamePieceModal'),null);assert.equal(busy.d.querySelector('#message').value,'Writing to my friend');busy.w.eval('chatDrafts.clear();s.selectedChempat="";render()');await flush();assert.ok(busy.d.querySelector('.gamePieceModal'));
 }finally{busy.close()}
});

test('an existing modal is never replaced by arrival and holds are cleared for a different account or new sign-in',async()=>{
 const f=await fixture({auto:true,modal:'logout'});try{
  assert.ok(f.d.querySelector('#logoutTitle'));assert.equal(f.d.querySelector('.gamePieceModal'),null);f.w.closeInvite();f.w.render();await flush();assert.ok(f.d.querySelector('.gamePieceModal'));f.w.holdGamePiece();assert.ok(f.w.sessionStorage.getItem(key));
  f.mount('sender',{initialModal:''});await flush();assert.deepEqual(JSON.parse(f.w.sessionStorage.getItem(key)).held,[]);f.mount('recipient',{allowAuto:true,initialModal:''});await flush();assert.ok(f.d.querySelector('.gamePieceModal'));f.w.holdGamePiece();
  f.w.openPage({id:'recipient',name:'Riley',contact:'recipient@example.test',photo:'',answers:Array(10).fill(0),verified:true});await flush();assert.deepEqual(JSON.parse(f.w.sessionStorage.getItem(key)).held,[]);assert.ok(f.d.querySelector('.gamePieceModal'));
 }finally{f.close()}
});

test('incoming phone offer uses the same arrival card and still requires named consent before sharing',async()=>{
 const server=makeServer();server.pairs[a]=[];server.phone.sender=true;const f=await fixture({server,auto:true});try{
  assert.match(f.d.querySelector('#gamePieceTitle').textContent,/Taylor offered a phone exchange/);assert.ok(!f.d.querySelector('.gamePieceModal').textContent.includes('+1555'));assert.equal(f.server.phone.recipient,false);
  await f.w.playGamePiece();await flush();assert.match(f.d.querySelector('#rewardTitle').textContent,/Exchange phones with Taylor/);assert.equal(f.server.phone.recipient,false);assert.equal(f.server.calls.filter(c=>c.body?.action==='offerPhone').length,0);
  f.d.querySelector('#rewardPhone').value='+15554445555';f.w.reviewRewardPhone();assert.match(f.d.querySelector('.rewardConsent').textContent,/\+15554445555.*Taylor/);assert.equal(f.server.phone.recipient,false);await f.w.rewardPhoneAction('offerPhone');assert.equal(f.server.phone.recipient,true);assert.match(f.d.querySelector('.sharedPhone').textContent,/\+15556667777/);
 }finally{f.close()}
});

test('malicious card and reply text stay literal and never become markup',async()=>{
 const server=makeServer();server.pairs[a][0].ask.text='<img src=x onerror=alert(1)>';server.pairs[a][0].reply={id:'reply',text:'<script>bad()</script>',at:'2026-10-06T23:30:00.000Z',by:'prospect'};const f=await fixture({server});try{assert.equal(f.d.querySelector('.wildcardPlayedCard img'),null);assert.equal(f.d.querySelector('.wildcardPlayedCard script'),null);assert.match(f.d.querySelector('.wildcardPlayedCard').textContent,/<script>bad/)}finally{f.close()}
});

const event=(kind,extra={})=>({id:'401',version:1,kind,connectionId:a,actorId:'sender',actorName:'Taylor',status:'ready',target:{type:'connection',connectionId:a},...extra});
test('first-five through Step 5 milestones use counterpart context without replaying or granting owner rewards',async()=>{
 for(const level of [1,2,3,4,5]){const server=makeServer();server.pairs[a]=[];server.level.recipient=1;server.status='firstResults';server.events=[event('step-complete',{level,target:{type:'connection',connectionId:a,level}})];const f=await fixture({server,auto:true});try{
  assert.match(f.d.querySelector('#gamePieceTitle').textContent,new RegExp(`Taylor finished Step ${level}`));await f.w.playGamePiece();await flush();assert.equal(f.w.eval('rewardLevel()'),1);assert.equal(f.d.querySelector('.rewardQuestions'),null);assert.equal(f.server.calls.filter(c=>['complete','save'].includes(c.body?.action)).length,0);assert.equal(f.server.receipts.get('recipient:401').handled,true);assert.match(f.d.querySelector('.notice').textContent,new RegExp(`Taylor completed Step ${level}`));
 }finally{f.close()}}
});

test('opening and cancelling an actionable reply or phone review keeps its durable piece pending',async()=>{
 for(const kind of ['wildcard','phone']){const server=makeServer();if(kind==='phone'){server.pairs[a]=[];server.phone.sender=true}const f=await fixture({server,auto:true});try{
  const id=kind==='phone'?'300':'101';await f.w.playGamePiece();await flush();f.w.closeInvite();await flush();assert.notEqual(server.receipts.get('recipient:'+id)?.handled,true);assert.equal(server.receipts.get('recipient:'+id)?.hold,f.w.eval('gamePieceVisit'));assert.equal(f.d.querySelector(`[data-piece-id="${id}"]`)!==null,true);
  await f.w.loadGamePieces(true);assert.equal(f.d.querySelector('.gamePieceModal'),null);await f.w.openGamePiece(id);await f.w.playGamePiece();await flush();
  if(kind==='wildcard'){write(f,'A weekend away.');server.fail=true;await f.w.answerWildcard();assert.notEqual(server.receipts.get('recipient:'+id)?.handled,true);server.fail=false;await f.w.answerWildcard()}else{f.d.querySelector('#rewardPhone').value='+15554445555';f.w.reviewRewardPhone();await f.w.rewardPhoneAction('offerPhone')}
  await flush();assert.equal(server.receipts.get('recipient:'+id)?.handled,true);
 }finally{f.close()}}
});

test('continuation and chat requests remain pending until a successful existing decision',async()=>{
 for(const kind of ['continue-request','chat-request']){const server=makeServer();server.pairs[a]=[];server.status=kind==='continue-request'?'request':'chatRequested';server.events=[event(kind,{status:'your-turn'})];const f=await fixture({server,auto:true});try{
  await f.w.playGamePiece();await flush();assert.notEqual(server.receipts.get('recipient:401')?.handled,true);assert.equal(server.calls.filter(c=>c.body?.action==='decision').length,0);await f.w.connectionApi({action:'decision',id:a,decision:'accept'});await flush();assert.equal(server.receipts.get('recipient:401').handled,true);
 }finally{f.close()}}
});

test('a completed mutual phone exchange opens View numbers without offering again',async()=>{
 const server=makeServer();server.pairs[a]=[];server.phone.sender=true;server.phone.recipient=true;const f=await fixture({server,auto:true});try{
  assert.match(f.d.querySelector('#gamePieceTitle').textContent,/exchange with Taylor is ready/);assert.equal(f.d.querySelector('[data-piece-action="play"]').textContent,'View numbers');await f.w.playGamePiece();await flush();assert.match(f.d.querySelector('.sharedPhone').textContent,/\+15556667777/);assert.equal(server.calls.filter(c=>c.body?.action==='offerPhone').length,0);assert.equal(server.receipts.get('recipient:300')?.handled,true);
 }finally{f.close()}
});

test('cold directory and intro routes wait for current gated data and never autoplay or edit a listing',async()=>{
 for(const type of ['directory','intro']){const server=makeServer();server.pairs[a]=[];server.level.recipient=4;server.directory=[{id:'sender',name:'Taylor',photo:'/api/reward-directory?photo=sender',videoAvailable:type==='intro',videoUrl:'/api/reward-directory?video=sender'}];server.events=[event(type==='intro'?'intro-published':'directory-listed',{target:{type,connectionId:a,memberId:'sender'}})];const f=await fixture({server,auto:true});try{
  const hold=deferred();server.intercept=c=>c.method==='HEAD'&&c.url.includes('?photo=')?hold.promise:null;const playing=f.w.playGamePiece();await flush();assert.equal(f.d.querySelector('.gamePieceMedia'),null);assert.notEqual(server.receipts.get('recipient:401')?.handled,true);hold.resolve(response({}));await playing;await flush();assert.notEqual(server.receipts.get('recipient:401')?.handled,true);assert.ok(f.d.querySelector('.gamePieceMedia'));f.w.confirmGamePieceMediaReady('photo',f.d.querySelector('.gamePieceMedia img'));if(type==='intro')f.w.confirmGamePieceMediaReady('video',f.d.querySelector('.gamePieceMedia video'));await flush();assert.equal(server.receipts.get('recipient:401')?.handled,true);assert.equal(server.calls.filter(c=>c.body&&c.url.startsWith('/api/reward-directory')).length,0);
  assert.equal(server.calls.filter(c=>c.url.startsWith('/api/reward-directory?directory=1')).length,0,'named media never fetches unrelated directory pages');if(type==='intro')assert.equal(f.d.querySelector('.gamePieceMedia video').autoplay,false)
 }finally{f.close()}}
});

test('late Play routing cannot replace a newer connection or modal after its inbox refresh',async()=>{
 for(const type of ['connection','phone','wildcard','directory']){const server=makeServer();server.pairs[a]=type==='wildcard'?[ask()]:[];if(type==='phone')server.phone.sender=true;if(type==='connection')server.events=[event('chat-ready')];if(type==='directory'){server.level.recipient=4;server.events=[event('directory-listed',{target:{type:'directory',connectionId:a,memberId:'sender'}})]}const f=await fixture({server,auto:true});try{
  const hold=deferred();server.intercept=c=>c.url==='/api/connection?inbox=1'?hold.promise:null;const playing=f.w.playGamePiece();f.w.selectChempat(b);f.w.confirmLogout();const newest=f.d.querySelector('#logoutTitle');hold.resolve(response({connections:copy(f.w.eval('s.inbox'))}));await playing;await flush();assert.equal(f.d.querySelector('#logoutTitle'),newest);assert.equal(f.w.eval('s.selectedChempat'),b);assert.ok(![...server.receipts.values()].some(receipt=>receipt.handled));
 }finally{f.close()}}
});

test('late directory data cannot retarget a newer modal or acknowledge an unseen introduction',async()=>{
 const server=makeServer();server.pairs[a]=[];server.level.recipient=4;server.events=[event('intro-published',{target:{type:'intro',connectionId:a,memberId:'sender'}})];const f=await fixture({server,auto:true});try{
  const hold=deferred();server.intercept=c=>c.method==='HEAD'?hold.promise:null;const playing=f.w.playGamePiece();await flush();f.w.confirmLogout();hold.resolve(response({profiles:[{id:'sender',name:'Taylor',videoAvailable:true,videoUrl:'/api/reward-directory?video=sender'}],nextCursor:null}));await playing;assert.ok(f.d.querySelector('#logoutTitle'));assert.notEqual(server.receipts.get('recipient:401')?.handled,true);
 }finally{f.close()}
});

test('receipt conflicts refresh safely without blindly retrying a stale seen acknowledgement',async()=>{
 const f=await fixture();try{
  f.server.receipts.set('recipient:101',{revision:5,seen:true,hold:'another-visit'});f.w.openGamePiece('101');await flush();const seen=f.server.calls.filter(c=>c.url==='/api/game-pieces'&&c.body?.action==='seen');assert.equal(seen.length,1);assert.equal(seen[0].body.receiptRevision,0);assert.equal(f.w.eval('gamePieceReceiptRevisions.get("101")'),5);assert.equal(f.server.receipts.get('recipient:101').hold,'another-visit');
 }finally{f.close()}
});

test('feed pagination finds new arrivals after a page of already-seen events',async()=>{
 const server=makeServer();server.pairs[a]=[];server.events=Array.from({length:101},(_,i)=>event('chat-ready',{id:String(500+i)}));for(let i=0;i<100;i++)server.receipts.set('recipient:'+String(500+i),{seen:true,revision:1});
 server.intercept=call=>{if(!call.url.startsWith('/api/game-pieces?'))return null;const url=new URL(call.url,'https://fixture.example.test'),data=feed(server,call.owner,url.searchParams.get('visit')),after=url.searchParams.get('after'),page=data.pieces.filter(piece=>!after||Number(piece.id)>Number(after)).slice(0,100);return response({pieces:page,pendingCount:data.pendingCount,nextCursor:page.at(-1)?.id==='599'?'599':null})};
 const f=await fixture({server,auto:true});try{assert.equal(f.w.eval('gamePieceFeed.length'),101);assert.equal(f.w.eval('gamePieceDialog.piece.id'),'600');assert.ok(server.calls.some(c=>c.url.includes('&after=599')))}finally{f.close()}
});

test('first-five and next-five obligations stay pending until the actual connection action succeeds',async()=>{
 for(const [kind,level,action,status] of [['step-complete',1,'request','firstResults'],['step-complete',2,'second','secondFive'],['continue-ready',undefined,'second','secondFive']]){const server=makeServer();server.pairs[a]=[];server.status=status;server.events=[event(kind,{status:'your-turn',...(level?{level}:{}),target:{type:'connection',connectionId:a,...(level?{level}:{})}})];const f=await fixture({server,auto:true});try{
  await f.w.playGamePiece();await flush();assert.notEqual(server.receipts.get('recipient:401')?.handled,true);assert.ok(f.d.querySelector('[data-piece-id="401"]'));await f.w.connectionApi({action,id:a,answers:Array(10).fill(0)});await flush();assert.equal(server.receipts.get('recipient:401').handled,true);
 }finally{f.close()}}
});

test('delayed token-based pair saves acknowledge their original connection only',async()=>{
 const server=makeServer();server.pairs[a]=[];server.status='secondFive';server.events=[event('continue-ready',{status:'your-turn'}),event('continue-ready',{id:'402',connectionId:b,status:'your-turn',target:{type:'connection',connectionId:b}})];const f=await fixture({server});try{
  const hold=deferred();server.intercept=c=>c.url==='/api/connection'&&c.body?.action==='second'?hold.promise:null;const saving=f.w.connectionApi({action:'second',token:'original-invite-token',answers:Array(10).fill(0)});f.w.selectChempat(b);hold.resolve(response({status:'secondFive'}));await saving;await flush();assert.equal(server.receipts.get('recipient:401')?.handled,true);assert.notEqual(server.receipts.get('recipient:402')?.handled,true);
 }finally{f.close()}
});

test('withdrawn media and a failed real media load never acknowledge or expose a stale introduction',async()=>{
 for(const when of ['head','load']){const server=makeServer();server.pairs[a]=[];server.level.recipient=4;server.events=[event('intro-published',{target:{type:'intro',connectionId:a,memberId:'sender'}})];if(when==='load')server.directory=[{id:'sender',name:'Taylor',videoAvailable:true}];const f=await fixture({server,auto:true});try{
  await f.w.playGamePiece();await flush();if(when==='load'){f.w.confirmGamePieceMediaReady('photo',f.d.querySelector('.gamePieceMedia img'));f.w.gamePieceMediaUnavailable(f.d.querySelector('.gamePieceMedia video'));assert.equal(f.d.querySelector('.gamePieceMedia video'),null);assert.equal(f.d.querySelector('.gamePieceMedia img'),null)}assert.notEqual(server.receipts.get('recipient:401')?.handled,true);assert.match(f.visible(),/no longer available/);
 }finally{f.close()}}
});

test('older-than-inbox connection pieces hydrate through the authorized serializer without persisting the row',async()=>{
 const server=makeServer(),older='c'.repeat(64);server.pairs[a]=[];server.pairs[older]=[];server.events=[event('chat-ready',{connectionId:older,target:{type:'connection',connectionId:older}})];server.extraRows[older]={id:older,kind:'vibe',channel:'email',side:'prospect',sender_name:'Taylor Older',sender_photo:'',sender_answers:Array(5).fill(0),own_answers:Array(5).fill(1),status:'chat',location:'active',messages:[{id:'older-chat',by:'member',text:'Private older connection message'}]};const f=await fixture({server,auto:true});try{
  assert.ok(f.d.querySelector('.gamePieceModal'));assert.ok(server.calls.some(c=>c.url.includes('&piece=401&connection='+older)));assert.equal(f.w.eval('gamePieceConnections.size'),1);await f.w.playGamePiece();await flush();assert.equal(f.w.eval('s.selectedChempat'),older);assert.match(f.d.querySelector('#connectionPanel').textContent,/Taylor.*Private older connection message/);assert.ok(!JSON.stringify({...f.w.sessionStorage}).includes('Private older connection message'));
  const seed=f.w.eval(`gamePieceConnections.get('${older}').piece`);await f.w.hydrateGamePieceConnection(seed,true,true);assert.ok(server.calls.some(c=>c.url.endsWith('&refresh=1')));assert.equal(f.w.eval('gamePieceConnections.size'),1);
  server.ended.add(older);await f.w.hydrateGamePieceConnection(seed,true,true);assert.equal(f.w.eval('gamePieceConnections.size'),0);assert.ok(!f.visible().includes('Private older connection message'));
 }finally{f.close()}
});

test('late detached media events cannot acknowledge, clear or focus a newer preview or account',async()=>{
 const server=makeServer();server.pairs[a]=[];server.level.recipient=4;server.directory=[{id:'sender',name:'Taylor',videoAvailable:true}];server.events=[event('intro-published',{target:{type:'intro',connectionId:a,memberId:'sender'}}),event('intro-published',{id:'402',connectionId:b,actorName:'Jordan',target:{type:'intro',connectionId:b,memberId:'sender'}})];const f=await fixture({server,auto:true});try{
  await f.w.playGamePiece();const oldPhoto=f.d.querySelector('.gamePieceMedia img'),oldVideo=f.d.querySelector('.gamePieceMedia video');f.w.closeInvite();await flush();await f.w.openGamePiece('402');await f.w.playGamePiece();const freshPhoto=f.d.querySelector('.gamePieceMedia img'),freshVideo=f.d.querySelector('.gamePieceMedia video');assert.ok(freshVideo);f.w.confirmGamePieceMediaReady('photo',oldPhoto);f.w.confirmGamePieceMediaReady('video',oldVideo);f.w.gamePieceMediaUnavailable(oldPhoto);await flush();assert.equal(f.d.querySelector('.gamePieceMedia img'),freshPhoto);assert.notEqual(server.receipts.get('recipient:402')?.handled,true);
  freshVideo.focus();const previous=new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true});f.d.dispatchEvent(previous);assert.equal(previous.defaultPrevented,false,'native video controls are inside the focus loop');
  f.mount('sender');f.w.confirmGamePieceMediaReady('photo',freshPhoto);f.w.confirmGamePieceMediaReady('video',freshVideo);f.w.gamePieceMediaUnavailable(freshVideo);await flush();assert.equal(f.d.querySelector('.gamePieceMedia'),null);assert.notEqual(server.receipts.get('recipient:402')?.handled,true);
 }finally{f.close()}
});

test('legacy received-shell actions adopt the hydrated pair and never use the previous invitation token',async()=>{
 for(const status of ['firstResults','secondFive','secondResults']){const server=makeServer(),older='c'.repeat(64);server.pairs[a]=[];server.pairs[older]=[];server.events=[event('step-complete',{connectionId:older,level:status==='firstResults'?1:2,status:'your-turn',target:{type:'connection',connectionId:older,level:status==='firstResults'?1:2}})];server.extraRows[older]={id:older,kind:'vibe',channel:'email',side:'prospect',sender_name:'Current sender',sender_photo:'',sender_answers:Array(10).fill(0),prospect_name:'Riley',prospect_answers:Array(5).fill(1),own_answers:Array(5).fill(1),status,location:'active',messages:[]};const f=await fixture({server});try{
  const piece=f.w.eval('gamePieceFeed[0]');await f.w.hydrateGamePieceConnection(piece);f.w.eval(`s={...blank(),view:'dashboard',actor:'prospect',member:{name:'Previous sender',answers:Array(5).fill(2)},prospect:{id:'recipient',name:'Riley',email:'recipient@example.test',answers:Array(5).fill(1),photo:'',verified:true},prospectId:'recipient',liveId:'${a}',liveInvite:true,liveMember:false,liveToken:'previous-invitation-token',selectedChempat:'first',phase:'chat',firstConnection:{location:'active'}};render();selectChempat('${older}')`);await flush();
  assert.equal(f.w.eval('s.liveMember'),true);assert.equal(f.w.eval('s.liveToken'),'');assert.equal(f.w.eval('s.liveId'),older);assert.equal(f.w.eval('s.phase'),status);assert.equal(f.w.eval('s.member.name'),'Current sender');
  if(status==='firstResults'){f.w.showRequest();await f.w.sendRequest()}else if(status==='secondFive'){await f.w.startSecondFive();assert.equal(f.w.eval('s.phase'),'secondFive');f.w.eval('s.prospect.answers=Array(10).fill(1)');await f.w.finishSecond()}else await f.w.requestChat();
  const mutation=server.calls.filter(c=>c.url==='/api/connection'&&['request','second','chat'].includes(c.body?.action)).at(-1);assert.ok(mutation);assert.equal(mutation.body.id,older);assert.equal(mutation.body.token,undefined);
 }finally{f.close()}}
});

test('hydrated chat sends update the visible cached row and media polls preserve playback nodes and focus',async()=>{
 const server=makeServer(),older='c'.repeat(64);server.pairs[a]=[];server.pairs[older]=[];server.events=[event('chat-ready',{connectionId:older,target:{type:'connection',connectionId:older}})];server.extraRows[older]={id:older,kind:'vibe',channel:'email',side:'member',prospect_name:'Morgan',own_answers:Array(10).fill(0),prospect_answers:Array(10).fill(1),status:'chat',location:'active',messages:[]};const f=await fixture({server,auto:true});try{
  await f.w.playGamePiece();server.intercept=c=>c.url==='/api/connection'&&c.body?.action==='message'?response({messages:[{id:'sent',by:'member',text:c.body.text}]}):null;const composer=f.d.querySelector('#message');composer.value='New message in the older pair';await f.w.sendMessage();assert.match(f.d.querySelector('.inlineChat').textContent,/New message in the older pair/);assert.equal(f.w.eval(`gamePieceConnections.get('${older}').row.messages.length`),1);assert.ok(!JSON.stringify({...f.w.sessionStorage}).includes('New message in the older pair'));
 }finally{f.close()}
 const mediaServer=makeServer();mediaServer.pairs[a]=[];mediaServer.level.recipient=4;mediaServer.directory=[{id:'sender',name:'Taylor',videoAvailable:true}];mediaServer.events=[event('intro-published',{target:{type:'intro',connectionId:a,memberId:'sender'}})];const media=await fixture({server:mediaServer,auto:true});try{
  await media.w.playGamePiece();const video=media.d.querySelector('.gamePieceMedia video'),photo=media.d.querySelector('.gamePieceMedia img');video.focus();await media.w.loadGamePiecePhones(true);await media.w.loadGamePieces(true);assert.equal(media.d.querySelector('.gamePieceMedia video'),video);assert.equal(media.d.querySelector('.gamePieceMedia img'),photo);assert.equal(media.d.activeElement,video);
 }finally{media.close()}
});

test('opening and dismissing a newer modal cancels a pending media route and manual hydration',async()=>{
 const server=makeServer();server.pairs[a]=[];server.level.recipient=4;server.events=[event('intro-published',{target:{type:'intro',connectionId:a,memberId:'sender'}})];const f=await fixture({server,auto:true});try{
  const hold=deferred();server.intercept=c=>c.method==='HEAD'?hold.promise:null;const playing=f.w.playGamePiece();await flush();f.w.confirmLogout();f.w.closeInvite();hold.resolve(response({}));await playing;await flush();assert.equal(f.d.querySelector('.gamePieceModal'),null);assert.notEqual(server.receipts.get('recipient:401')?.handled,true);
 }finally{f.close()}
 const other=makeServer(),older='c'.repeat(64);other.pairs[a]=[];other.pairs[older]=[];other.events=[event('chat-ready',{connectionId:older,target:{type:'connection',connectionId:older}})];other.extraRows[older]={id:older,kind:'vibe',channel:'email',side:'member',prospect_name:'Morgan',status:'chat',own_answers:Array(10).fill(0),prospect_answers:Array(10).fill(1),messages:[]};const h=await fixture({server:other});try{
  const hold=deferred();other.intercept=c=>c.url.includes('&connection='+older)?hold.promise:null;const opening=h.w.openGamePiece('401');h.w.confirmLogout();h.w.closeInvite();const piece=feed(other,'recipient',h.w.eval('gamePieceVisit')).pieces[0];hold.resolve(response({piece,connection:other.extraRows[older]}));await opening;assert.equal(h.d.querySelector('.gamePieceModal'),null);assert.notEqual(other.receipts.get('recipient:401')?.seen,true);
 }finally{h.close()}
});

test('hydrated background refresh advances selected pair state and cannot overwrite a newer local mutation',async()=>{
 const server=makeServer(),older='c'.repeat(64);server.pairs[a]=[];server.pairs[older]=[];server.events=[event('step-complete',{connectionId:older,level:1,target:{type:'connection',connectionId:older,level:1}})];server.extraRows[older]={id:older,kind:'vibe',channel:'email',side:'prospect',sender_name:'Morgan',sender_answers:Array(5).fill(0),own_answers:Array(5).fill(1),prospect_answers:Array(5).fill(1),status:'firstResults',location:'active',messages:[]};const f=await fixture({server,auto:true});try{
  await f.w.playGamePiece();const seed=f.w.eval(`gamePieceConnections.get('${older}').piece`);server.extraRows[older].status='secondFive';await f.w.hydrateGamePieceConnection(seed,true,true);assert.equal(f.w.eval('s.phase'),'secondFive');await f.w.startSecondFive();assert.equal(f.w.eval('s.view'),'questions');
  server.extraRows[older].status='chat';f.w.eval("s.view='dashboard';s.memberQuestionsOpen=false;s.prospectQuestionsOpen=false");await f.w.hydrateGamePieceConnection(seed,true,true);assert.equal(f.w.eval('s.phase'),'chat');const old=copy(server.extraRows[older]),hold=deferred();server.intercept=c=>c.url.includes('&refresh=1')?hold.promise:c.url==='/api/connection'&&c.body?.action==='message'?response({messages:[{id:'fresh',by:'prospect',text:c.body.text}]}):null;
  const polling=f.w.hydrateGamePieceConnection(seed,true,true);f.d.querySelector('#message').value='Keep my new message';await f.w.sendMessage();assert.match(f.d.querySelector('.inlineChat').textContent,/Keep my new message/);hold.resolve(response({connection:old}));await polling;assert.match(f.d.querySelector('.inlineChat').textContent,/Keep my new message/);assert.equal(f.w.eval(`gamePieceConnections.get('${older}').row.messages[0].text`),'Keep my new message');
 }finally{f.close()}
});

test('a cold media Play waits for the initial reward read instead of treating unknown progress as locked',async()=>{
 const server=makeServer(),hold=deferred();server.pairs[a]=[];server.level.recipient=4;server.directory=[{id:'sender',name:'Taylor',videoAvailable:true}];server.events=[event('intro-published',{target:{type:'intro',connectionId:a,memberId:'sender'}})];server.intercept=c=>c.url==='/api/rewards'&&!c.body?hold.promise:null;const f=await fixture({server,auto:true});try{
  assert.ok(f.d.querySelector('.gamePieceModal'));assert.equal(f.w.eval('rewardsData'),null);const playing=f.w.playGamePiece();await flush();assert.equal(server.calls.filter(c=>c.method==='HEAD').length,0);assert.ok(!f.visible().includes('not currently available'));
  hold.resolve(response({level:4,rounds:REWARD_ROUNDS,answers:{},draftRevision:0,phoneProfile:server.profiles.recipient,connections:[]}));await playing;assert.ok(f.d.querySelector('.gamePieceMedia video'));assert.equal(server.calls.filter(c=>c.method==='HEAD').length,2);
 }finally{f.close()}
});

test('accepted Friends below Step 3 receive, answer and review wildcard cards without phone or reward access',async()=>{
 const server=makeServer();server.pairs[a]=[];server.pairs[friend]=[ask()];server.level.recipient=0;
 const recipient=await fixture({server,selected:friend}),sender=await fixture({role:'sender',server,selected:friend});try{
  assert.equal(recipient.d.querySelector('#connectionWildcards').hidden,false);assert.ok(recipient.d.querySelector('[data-wildcard-focus="answer:future-1"]'));assert.equal(recipient.d.querySelector('[data-wildcard-focus="open"]'),null);assert.equal(recipient.d.querySelector('.rewardConnection'),null);assert.equal(recipient.d.querySelector('.secretsButton[aria-pressed="true"]'),null);
  assert.match(recipient.d.querySelector(`[data-wildcard-pending="${friend}"]`).textContent,/1 card to answer/);await recipient.w.openGamePiece('201');await flush();assert.ok(recipient.d.querySelector('.gamePieceModal'));await recipient.w.playGamePiece();assert.match(recipient.d.querySelector('#wildcardTitle').textContent,/Answer Taylor’s card/);
  write(recipient,'An afternoon on the coast.');await recipient.w.answerWildcard();assert.equal(recipient.posts()[0].body.connectionId,friend);assert.equal(server.remaining.recipient,3);assert.equal(server.remaining.sender,2);assert.equal(recipient.w.eval('rewardLevel()'),0);assert.match(recipient.d.querySelector('.wildcardPlayedCard').textContent,/An afternoon on the coast/);
  await sender.w.loadWildcards(friend,true);assert.match(sender.d.querySelector('.wildcardPlayedCard').textContent,/Riley’s answer.*An afternoon on the coast/);assert.equal(server.calls.filter(c=>c.url.includes('/api/rewards?connection='+friend)).length,0);
 }finally{recipient.close();sender.close()}
});

test('friend-only wildcard summaries do not trigger phone requests or permit broader friend game-piece routes',async()=>{
 const server=makeServer();server.pairs[a]=[];server.pairs[friend]=[ask()];const f=await fixture({server,selected:friend});try{
  f.w.eval(`s.inbox=[];gamePiecePhonesUpdated=0;gamePiecePhonesLoading=null;render()`);const before=server.calls.filter(c=>c.url==='/api/rewards?phoneRequests=1').length;await f.w.loadGamePiecePhones(true);assert.equal(server.calls.filter(c=>c.url==='/api/rewards?phoneRequests=1').length,before);
  for(const [kind,type] of [['phone-offer','phone'],['step-complete','connection'],['directory-listed','directory'],['intro-published','intro']])assert.equal(f.w.eval(`gamePieceConnection(${JSON.stringify({kind,connectionId:friend,target:{type}})})`),undefined);
  assert.ok(f.w.eval(`gamePieceConnection(${JSON.stringify({kind:'wildcard-ask',connectionId:friend,target:{type:'wildcard'}})})`));assert.equal(f.posts().length,0);
 }finally{f.close()}
});

test('an older accepted Friend hydrates from its wildcard feed and does not adopt Vibe state',async()=>{
 const id='d'.repeat(64),server=makeServer();server.pairs[a]=[];server.pairs[id]=[ask()];server.extraRows[id]={id,kind:'friend',channel:'friend',claimed:true,status:'chat',location:'active',side:'prospect',sender_name:'Older Friend',prospect_name:'Riley',messages:[]};
 const f=await fixture({server});try{
  const liveBefore=f.w.eval('s.liveId'),phaseBefore=f.w.eval('s.phase');await f.w.openGamePiece('201');await flush();assert.ok(f.d.querySelector('.gamePieceModal'));await f.w.playGamePiece();assert.equal(f.w.eval('s.selectedChempat'),id);assert.equal(f.w.eval('s.liveId'),liveBefore);assert.equal(f.w.eval('s.phase'),phaseBefore);assert.equal(f.d.querySelector('.rewardConnection'),null);assert.match(f.d.querySelector('#wildcardTitle').textContent,/Older/);write(f,'A good long walk.');await f.w.answerWildcard();assert.equal(f.posts()[0].body.connectionId,id);assert.match(f.d.querySelector('.wildcardPlayedCard').textContent,/A good long walk/);
 }finally{f.close()}
});
