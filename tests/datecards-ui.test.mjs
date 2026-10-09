import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {REWARD_ROUNDS} from '../api/_reward-rounds.mjs';

// Synthetic DOM/CSSOM fixtures only: no live accounts, emails or network.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../site.css',import.meta.url),'utf8');
const a='a'.repeat(64),b='b'.repeat(64);
const clone=value=>JSON.parse(JSON.stringify(value));
const response=(data,status=200)=>({ok:status<400,status,json:async()=>clone(data)});
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve))};
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve}};
const card=(overrides={})=>({type:'dateCard',id:'00000000-0000-4000-8000-000000000001',by:'member',at:'2026-10-09T10:00:00.000Z',card:{ideaId:'dinner',date:'2026-11-04T19:30',place:'A little café',note:'Want to go together?',status:'pending',version:1,proposer:'member',updatedAt:'2026-10-09T10:00:00.000Z',...overrides}});
function serverFixture(){return {cards:[],calls:[],receipts:new Map(),intercept:null,lose:false,fail:false}}
const activeCards=server=>server.cards.filter(message=>message.card.status!=='cancelled');
async function fixture({server=serverFixture(),role='member',status='chat',messages=[],name='Riley',selected=a}={}){
 const dom=new JSDOM(html,{url:'https://datecards.example.test/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
 let currentRole=role;const timers=[];w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 const rows=()=>[a,b].map(id=>({id,kind:'vibe',channel:'email',side:currentRole,status,claimed:true,location:'active',sender_name:currentRole==='member'?'Taylor':name,prospect_name:currentRole==='member'?name:'Taylor',sender_answers:Array(5).fill(0),prospect_answers:Array(5).fill(0),own_answers:Array(5).fill(0),messages:[...messages,...activeCards(server)]}));
 w.fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):null,account=options.headers?.['x-chempat-member-id'];
  if(url==='/api/connection?inbox=1')return response({connections:rows()});
  if(url.startsWith('/api/rewards'))return response({level:0,rounds:REWARD_ROUNDS,answers:{},draftRevision:0,connections:[],phoneRequests:[],connection:{phone:{eligible:false}}});
  if(url.startsWith('/api/discovery'))return response({modules:[],games:[],pieces:[]});
  if(url.startsWith('/api/wildcards'))return response({connections:[],cards:[],categories:[],eligible:false});
  if(url.startsWith('/api/game-pieces'))return response({pieces:[],pendingCount:0});
  if(url==='/api/member'&&body?.action==='logout')return response({ok:true});
  if(!url.startsWith('/api/datecards'))return response({},401);
  const call={url,body,options,role:currentRole};server.calls.push(call);assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');assert.equal(account,currentRole);
  const intercepted=server.intercept?.(call);if(intercepted)return await intercepted;
  if(!body)return response({cards:activeCards(server),side:currentRole});
  if(server.fail)return response({error:'A small hiccup. Try again.'},503);
  if(!server.receipts.has(body.requestId)){
   if(body.action==='send')server.cards.push({...card(),id:body.requestId,by:currentRole,card:{...card().card,ideaId:body.ideaId,date:body.date,place:body.place,note:body.note,proposer:currentRole}});
   else{const message=server.cards.find(message=>message.id===body.cardId);if(!message||message.card.status==='cancelled'||message.card.version!==body.version)return response({error:'Datecard changed.',dateCardConflict:true},409);if(body.action==='accept'){assert.notEqual(message.card.proposer,currentRole);message.card.status='accepted';message.card.acceptedBy=currentRole}else if(body.action==='cancel'){message.card.status='cancelled';message.card.cancelledBy=currentRole;delete message.card.acceptedBy}else{Object.assign(message.card,{ideaId:body.ideaId,date:body.date,place:body.place,note:body.note,status:'pending',proposer:currentRole});delete message.card.acceptedBy}message.card.version++;message.card.updatedAt=new Date().toISOString()}
   server.receipts.set(body.requestId,clone(body));
  }
  if(server.lose){server.lose=false;throw Error('Connection interrupted.')}
  return response({cards:activeCards(server),side:currentRole});
 };
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 const mount=(nextRole=role,nextStatus=status)=>{currentRole=nextRole;status=nextStatus;const own={id:nextRole,name:'Taylor',contact:`${nextRole}@example.test`,photo:'',answers:Array(5).fill(0),verified:true};w.eval(`s={...blank(),view:'dashboard',member:${JSON.stringify(own)},account:${JSON.stringify(own)},memberId:${JSON.stringify(nextRole)},liveMember:true,inbox:${JSON.stringify(rows())},selectedChempat:'${selected}',phase:${JSON.stringify(status)}};gamePieceAutoUsed=true;render()`)};
 mount();await flush();return {w,d,server,mount,rows,timers,posts:()=>server.calls.filter(call=>call.body),close:()=>w.close()};
}
function write(f,key,text){
 const field=f.d.querySelector({date:'#dateWhen',place:'#datePlace',note:'#dateNote'}[key]);
 const set=(node,value)=>{node.value=value;node.dispatchEvent(new f.w.Event('input',{bubbles:true}));node.dispatchEvent(new f.w.Event('change',{bubbles:true}))};
 if(key==='date'){
  const [day,time]=text.split('T');set(field,day);
  const [hour,minute]=time?.split(':')||[];
  for(const [selector,value] of [['#dateHour',time?String(+hour%12||12):''],['#dateMinute',minute||''],['#datePeriod',time?(+hour<12?'AM':'PM'):'']])set(f.d.querySelector(selector),value);
 }else set(field,text);
 return field;
}
async function open(f,idea='dinner',cardId=''){f.w.openDateIdea(a,idea,cardId);await flush()}

test('opening, browsing, Back and account-keyed private saving never send',async()=>{
 const f=await fixture();try{
  assert.equal(f.d.querySelectorAll('.dateIdeaStrip .dateIdeaTile').length,4);assert.match(f.d.querySelector('.dateIdeaStrip').textContent,/More ideas/);
  f.w.openDateChooser(a);await flush();assert.equal(f.d.querySelectorAll('.datePicker .dateIdeaTile').length,11);assert.equal(f.posts().length,0);
  await open(f,'grocery-games');assert.match(f.d.querySelector('#dateTitle').textContent,/Guy’s Grocery Games-inspired/);write(f,'note','An unsent private thought');f.w.saveDateIdea();assert.match(f.d.querySelector('#dateModalStatus').textContent,/Saved privately on this device/);
  assert.deepEqual(JSON.parse(f.w.localStorage.getItem('duhwild.date-ideas.member')),['grocery-games']);assert.ok(!JSON.stringify({...f.w.localStorage}).includes('unsent private thought'));
  f.w.dateBack();await open(f,'grocery-games');assert.equal(f.d.querySelector('#dateNote').value,'An unsent private thought');f.w.closeInvite();assert.equal(f.posts().length,0);
  f.mount('prospect');await flush();assert.equal(f.w.eval('dateSaved.size'),0);f.mount('member');await flush();assert.equal(f.w.eval("dateSaved.has('grocery-games')"),true);
 }finally{f.close()}
});

test('send, recipient acceptance, change and acceptance update one shared card',async()=>{
 const server=serverFixture(),sender=await fixture({server}),peer=await fixture({server,role:'prospect'});try{
  await open(sender,'museum');write(sender,'date','2026-11-04T19:30');write(sender,'place','The art museum');write(sender,'note','Let’s each choose a favorite.');await sender.w.submitDateCard();assert.equal(server.cards.length,1);assert.match(sender.d.querySelector('.sharedDateCard').textContent,/Your invite to Riley.*Wander a museum/);assert.equal(sender.d.querySelector('[data-date-focus^="accept:"]'),null);
  const id=server.cards[0].id;await peer.w.loadDateCards(a,true);assert.match(peer.d.querySelector('.sharedDateCard').textContent,/I’m in/);await peer.w.acceptDateCard(a,id);assert.equal(server.cards[0].card.version,2);assert.match(peer.d.querySelector('.datePlan').textContent,/It’s a date.*Museum wander.*art museum/);
  await sender.w.loadDateCards(a,true);assert.equal(sender.d.querySelector('.datePlan').hidden,false);
  await open(peer,'museum',id);write(peer,'place','The sculpture garden');await peer.w.submitDateCard();assert.equal(server.cards.length,1);assert.equal(server.cards[0].card.version,3);assert.equal(server.cards[0].card.proposer,'prospect');assert.equal(server.cards[0].card.status,'pending');assert.equal(peer.d.querySelector('.datePlan').hidden,true);
  await sender.w.loadDateCards(a,true);await sender.w.acceptDateCard(a,id);assert.equal(server.cards[0].card.version,4);assert.equal(server.cards[0].card.status,'accepted');assert.match(sender.d.querySelector('.datePlan').textContent,/sculpture garden/);
  await peer.w.loadDateCards(a,true);await open(peer,'movie',id);await peer.w.submitDateCard();assert.equal(server.cards.length,1);assert.equal(server.cards[0].card.ideaId,'movie');assert.equal(server.cards[0].card.version,5);
 }finally{sender.close();peer.close()}
});

test('first-results cards work with no game level, normal chat or private-contact exposure',async()=>{
 const f=await fixture({status:'firstResults',messages:[{by:'prospect',text:'Ordinary chat must stay hidden'}]});try{
  assert.ok(f.d.querySelector('.dateBeforeChat'));assert.equal(f.d.querySelector('.inlineChat,.inlineComposer,#message'),null);assert.ok(!f.d.querySelector('.dateBeforeChat').textContent.includes('Ordinary chat must stay hidden'));
  await open(f,'picnic');await f.w.submitDateCard();assert.equal(f.posts().length,1);assert.ok(f.d.querySelector('.sharedDateCard'));assert.equal(f.w.eval('s.phase'),'firstResults');assert.equal(f.d.querySelector('.inlineComposer'),null);
 }finally{f.close()}
});

test('date polling and modal close preserve normal message text, photo, DOM, cursor and focus',async()=>{
 const f=await fixture();try{
  f.w.eval(`chatDrafts.set('member:${a}',{text:'Unfinished hello',photo:'data:image/jpeg;base64,AA=='});render()`);await flush();const input=f.d.querySelector('#message');input.focus();input.setSelectionRange(3,8);const photo=f.d.querySelector('.chatDraft img');
  f.server.cards=[card()];await f.w.loadDateCards(a,true);assert.equal(f.d.querySelector('#message'),input);assert.equal(f.d.activeElement,input);assert.equal(input.selectionStart,3);assert.equal(input.selectionEnd,8);assert.equal(f.d.querySelector('.chatDraft img'),photo);
  await open(f);write(f,'note','My invitation draft');const note=f.d.querySelector('#dateNote');note.focus();note.setSelectionRange(2,6);await f.w.loadDateCards(a,true);assert.equal(f.d.querySelector('#dateNote'),note);assert.equal(f.d.activeElement.id,'dateNote');assert.equal(f.d.activeElement.selectionStart,2);assert.equal(f.d.activeElement.selectionEnd,6);
  f.w.dateBack();f.w.closeInvite();assert.equal(f.d.activeElement,input);assert.equal(input.value,'Unfinished hello');assert.equal(input.selectionStart,3);assert.equal(input.selectionEnd,8);assert.equal(f.d.querySelector('.chatDraft img'),photo);
 }finally{f.close()}
});

test('keyboard wraps within date dialog and Escape restores the invoking idea',async()=>{
 const f=await fixture();try{
  const trigger=f.d.querySelector('.dateIdeaTile');trigger.focus();trigger.click();await flush();assert.equal(f.d.activeElement.id,'dateTitle');const close=f.d.querySelector('.dateModal .close');close.focus();const tab=new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true});f.d.dispatchEvent(tab);assert.equal(tab.defaultPrevented,true);assert.equal(f.d.activeElement.dataset.dateFocus,'save');f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(f.d.activeElement.dataset.dateFocus,'close');f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.d.querySelector('.dateModal'),null);assert.equal(f.d.activeElement,trigger);assert.equal(f.posts().length,0);
 }finally{f.close()}
});

test('double-submit, close in flight, and response-loss retries cannot duplicate a send',async()=>{
 const f=await fixture();try{
  await open(f);write(f,'note','One invitation');const hold=deferred();f.server.intercept=call=>call.body?hold.promise:null;const sending=f.w.submitDateCard();await f.w.submitDateCard();assert.equal(f.posts().length,1);assert.ok(f.d.querySelector('[data-date-focus="send"]').disabled);f.w.closeInvite();f.server.cards=[{...card(),id:f.posts()[0].body.requestId}];hold.resolve(response({cards:f.server.cards,side:'member'}));await sending;assert.equal(f.d.querySelector('.dateModal'),null);assert.equal(f.d.querySelectorAll('.sharedDateCard').length,1);
  f.server.intercept=null;await open(f,'movie');f.server.lose=true;await f.w.submitDateCard();const id=f.posts().at(-1).body.requestId;assert.match(f.d.querySelector('.dateModal').textContent,/Retry send/);assert.ok(f.d.querySelector('#dateNote').disabled);f.w.closeInvite();await open(f,'movie');await f.w.submitDateCard();assert.equal(f.posts().at(-1).body.requestId,id);assert.equal(f.server.cards.length,2);
 }finally{f.close()}
});

test('stale GETs, account switches and ended connections cannot publish old datecard data',async()=>{
 const f=await fixture({role:'prospect'});try{
  f.server.cards=[card()];await f.w.loadDateCards(a,true);const old={cards:clone(f.server.cards),side:'prospect'},hold=deferred();f.server.intercept=call=>!call.body?hold.promise:null;const loading=f.w.loadDateCards(a,true);await f.w.acceptDateCard(a,f.server.cards[0].id);hold.resolve(response(old));await loading;assert.equal(f.d.querySelector('.sharedDateCard').dataset.dateVersion,'2');
  f.server.intercept=null;await open(f,'museum');write(f,'note','Keep this account private');const pending=deferred();f.server.intercept=call=>call.body?pending.promise:null;const sending=f.w.submitDateCard();f.server.intercept=null;f.mount('member');await flush();pending.resolve(response({cards:[card({note:'Keep this account private'})],side:'prospect'}));await sending;assert.ok(!f.d.querySelector('#root').textContent.includes('Keep this account private'));assert.equal(f.d.querySelector('.dateModal'),null);
  await open(f);const ending=deferred();f.server.intercept=call=>call.body?ending.promise:null;const final=f.w.submitDateCard();f.w.eval(`s.inbox.find(c=>c.id==='${a}').status='ended';render(true)`);ending.resolve(response({cards:[card({note:'Must remain hidden'})],side:'member'}));await final;assert.equal(f.d.querySelector('.dateModal'),null);assert.ok(!f.d.querySelector('#root').textContent.includes('Must remain hidden'));
 }finally{f.close()}
});

test('409 refreshes current version; rate/cap guidance stays specific',async()=>{
 const f=await fixture({role:'prospect'});try{
  f.server.cards=[card()];await f.w.loadDateCards(a,true);await open(f,'dinner',f.server.cards[0].id);write(f,'place','My local edit');f.server.cards[0].card.version=2;f.server.cards[0].card.place='Changed elsewhere';await f.w.submitDateCard();assert.match(f.d.querySelector('.dateModal').textContent,/changed.*Use latest details/s);assert.equal(f.d.querySelector('#datePlace').value,'My local edit');assert.ok(f.d.querySelector('[data-date-focus="send"]').disabled);f.w.resetDateConflict();assert.equal(f.d.querySelector('#datePlace').value,'Changed elsewhere');assert.ok(!f.d.querySelector('[data-date-focus="send"]').disabled);
  f.w.closeInvite();await open(f,'museum');f.server.intercept=call=>call.body?response({error:'This connection has reached its datecard limit.',dateCardLimit:true},409):null;await f.w.submitDateCard();assert.match(f.d.querySelector('#dateModalError').textContent,/reached its datecard limit/);assert.doesNotMatch(f.d.querySelector('#dateModalError').textContent,/Refreshing/);
 }finally{f.close()}
});

test('date endpoint rejection hides date data while keeping normal chat draft usable',async()=>{
 for(const status of [401,403,404]){const f=await fixture({messages:[{by:'prospect',text:'Hello from chat'}]});try{
  const input=f.d.querySelector('#message');input.value='Keep typing';input.dispatchEvent(new f.w.Event('input'));input.focus();f.server.cards=[card()];await f.w.loadDateCards(a,true);f.server.intercept=()=>response({error:'Datecards are unavailable.'},status);await f.w.loadDateCards(a,true);assert.equal(f.d.querySelector('#message'),input);assert.equal(input.value,'Keep typing');assert.equal(f.d.activeElement,input);assert.equal(f.d.querySelector('.sharedDateCard'),null);assert.match(f.d.querySelector('.dateMessages').textContent,/Hello from chat/);assert.equal(f.d.querySelector('.dateIdeas').hidden,true);
 }finally{f.close()}}
});

test('request timeout releases pending state and retries with the same request ID',async()=>{
 const f=await fixture();try{
  await open(f);const realSetTimeout=f.w.setTimeout.bind(f.w);let expire;f.w.setTimeout=(callback,delay,...args)=>delay===20000?(expire=callback,123):realSetTimeout(callback,delay,...args);f.server.intercept=call=>call.body?new Promise(()=>{}):null;
  const sending=f.w.submitDateCard();assert.ok(expire);expire();await sending;assert.equal(f.w.eval(`datePairs.get('${a}').pending`),null);assert.match(f.d.querySelector('#dateModalError').textContent,/timed out/);const id=f.posts()[0].body.requestId;f.server.intercept=null;await f.w.submitDateCard();assert.equal(f.posts()[1].body.requestId,id);assert.equal(f.server.cards.length,1);
 }finally{f.close()}
});

test('mobile CSSOM uses a horizontal strip above composer, desktop a slim right column; long text wraps',async()=>{
 const f=await fixture({name:'Alexandria'.repeat(12)});try{
  f.server.cards=[card({place:'Place'.repeat(40),note:'LongNote'.repeat(60)})];await f.w.loadDateCards(a,true);await open(f,'grocery-games');const sourceStyle=f.d.createElement('style');sourceStyle.textContent=css;f.d.head.append(sourceStyle);const rules=[...sourceStyle.sheet.cssRules];sourceStyle.remove();
  const at=(rules,width)=>rules.map(rule=>{if(rule.constructor.name==='CSSContainerRule')return '';if(rule.type!==f.w.CSSRule.MEDIA_RULE)return rule.cssText;const matches=rule.conditionText.split(/\s+and\s+/).every(part=>{const m=part.match(/^\((min|max)-width:\s*(\d+)px\)$/);return m&&(m[1]==='min'?width>=+m[2]:width<=+m[2])});return matches?at([...rule.cssRules],width):''}).join('\n');
  for(const width of [320,375,768,1000,1001,1280]){const style=f.d.createElement('style');style.textContent=at(rules,width);f.d.head.append(style);const get=selector=>f.w.getComputedStyle(f.d.querySelector(selector));assert.equal(get('.dateConversation').display,width<=1000?'flex':'grid');assert.equal(get('.dateIdeaStrip').flexDirection,width<=1000?'row':'column');assert.equal(get('.dateConversation').minWidth,'0px');assert.equal(get('.dateCardNote').overflowWrap,'anywhere');assert.equal(get('.dateCardContext').overflowWrap,'anywhere');assert.equal(get('.dateModal h2').overflowWrap,'anywhere');assert.equal(get('.dateInviteFields input').maxWidth,'100%');if(width<=1000){assert.equal(get('.dateIdeas').order,'3');assert.equal(get('.dateComposer').order,'4');assert.equal(get('.dateIdeaStrip').overflowX,'auto');assert.equal(get('.dateCardActions .dateButton').minHeight,'44px')}else assert.equal(get('.dateConversation').gridTemplateColumns,'minmax(0,1fr) 136px');style.remove()}
  assert.ok([...f.d.querySelectorAll('.dateIllustration')].every(svg=>svg.getAttribute('aria-hidden')==='true'&&svg.getAttribute('focusable')==='false'));
 }finally{f.close()}
});

test('entered date and clock time are formatted literally even across a DST gap',async()=>{
 const f=await fixture();try{const display=f.w.dateWhen('2026-03-08T02:30');assert.match(display,/Mar 8, 2026/);assert.match(display,/2:30/);assert.doesNotMatch(display,/3:30/);assert.match(display,/local time, as entered/);assert.doesNotMatch(f.w.dateWhen('2026-11-04'),/local time/)}finally{f.close()}
});


test('an ambiguous change remains safely retryable after polling its committed new version',async()=>{
 const f=await fixture();try{
  f.server.cards=[card()];await f.w.loadDateCards(a,true);await open(f,'picnic',f.server.cards[0].id);write(f,'place','Under the oak tree');f.server.lose=true;await f.w.submitDateCard();const first=f.posts().at(-1).body;assert.equal(f.server.cards[0].card.version,2);
  await f.w.loadDateCards(a,true);assert.ok(!f.d.querySelector('[data-date-focus="send"]').disabled);assert.match(f.d.querySelector('[data-date-focus="send"]').textContent,/Retry send/);await f.w.submitDateCard();assert.equal(f.posts().at(-1).body.requestId,first.requestId);assert.equal(f.server.cards[0].card.version,2);assert.equal(f.d.querySelector('.dateModal'),null);
 }finally{f.close()}
});

test('private-save fallback is truthfully visit-only and does not persist note or place',async()=>{
 const f=await fixture();try{Object.defineProperty(f.w.Storage.prototype,'setItem',{value(){throw Error('Storage unavailable')}});await open(f,'picnic');write(f,'place','Private place');write(f,'note','Private note');f.w.saveDateIdea();assert.match(f.d.querySelector('#dateModalStatus').textContent,/for this visit/);assert.match(f.d.querySelector('.datePrivateHelp').textContent,/for this visit only/);assert.equal(f.posts().length,0)}finally{f.close()}
});

const cancelSelector=id=>`[data-date-focus="cancel:${id}"]`;
async function cancel(f,id){const button=f.d.querySelector(cancelSelector(id));assert.ok(button,'the shared card has a Cancel pill');assert.equal(button.disabled,false);assert.match(button.textContent,/cancel/i);button.click();await flush()}
const visibleCard=(f,id)=>f.d.querySelector(`[data-date-card="${id}"]`);

test('either participant can cancel pending or agreed plans without disturbing other cards, chat or saved ideas',async()=>{
 for(const status of ['pending','accepted'])for(const role of ['member','prospect']){
  const target=card({status,...(status==='accepted'?{acceptedBy:'prospect'}:{})}),other={...card({ideaId:'museum',note:'Keep this separate invitation'}),id:'00000000-0000-4000-8000-000000000002'},server=serverFixture();server.cards=[target,other];
  const ordinary=[{by:'prospect',text:'An ordinary message stays here',photo:'data:image/jpeg;base64,AA=='}],actor=await fixture({server,role,messages:ordinary}),peer=await fixture({server,role:role==='member'?'prospect':'member',messages:ordinary});
  const reloaded=[];
  try{
   await open(actor,'movie');actor.w.saveDateIdea();actor.w.closeInvite();const saved=actor.w.localStorage.getItem('duhwild.date-ideas.'+role);
   const input=actor.d.querySelector('#message');input.value='Unsent chat stays private';input.dispatchEvent(new actor.w.Event('input'));input.focus();input.setSelectionRange(6,10);
   const unchanged=clone(other);assert.equal(actor.d.querySelector('.datePlan').hidden,status!=='accepted');
   await cancel(actor,target.id);
   const body=server.calls.filter(call=>call.body).at(-1).body;
   assert.deepEqual(Object.keys(body).sort(),['action','cardId','id','requestId','version']);assert.equal(body.action,'cancel');assert.equal(body.cardId,target.id);assert.equal(body.id,a);assert.equal(body.version,1);assert.match(body.requestId,/^[a-f0-9-]{36}$/);
   assert.equal(target.card.status,'cancelled');assert.equal(target.card.version,2);assert.equal(server.cards.length,2,'the server retains the removed card');assert.deepEqual(other,unchanged);
   assert.equal(visibleCard(actor,target.id),null);assert.ok(visibleCard(actor,other.id));assert.equal(actor.d.querySelector('.datePlan').hidden,true);
   assert.equal(actor.d.querySelector('#message'),input);assert.equal(input.value,'Unsent chat stays private');assert.equal(actor.d.activeElement,input);assert.equal(input.selectionStart,6);assert.equal(input.selectionEnd,10);
   assert.match(actor.d.querySelector('.dateMessages').textContent,/An ordinary message stays here/);assert.ok(actor.d.querySelector('.chatPhoto'));assert.equal(actor.w.localStorage.getItem('duhwild.date-ideas.'+role),saved);assert.equal(actor.d.querySelectorAll('.dateIdeaStrip .dateIdeaTile').length,4);
   peer.w.refreshDateCards();await flush();assert.equal(visibleCard(peer,target.id),null);assert.ok(visibleCard(peer,other.id));assert.equal(peer.d.querySelector('.datePlan').hidden,true);
   for(const nextRole of ['member','prospect']){const page=await fixture({server,role:nextRole,messages:ordinary});reloaded.push(page);assert.equal(visibleCard(page,target.id),null);assert.ok(visibleCard(page,other.id));assert.equal(page.d.querySelector('.datePlan').hidden,true)}
   assert.equal(server.calls.filter(call=>call.body).length,1,'polling and reload do not replay the cancellation');
  }finally{actor.close();peer.close();for(const page of reloaded)page.close()}
 }
});

test('a completed cancellation cannot be resurrected by an older GET or stale inbox projection',async()=>{
 const server=serverFixture();server.cards=[card({status:'accepted',acceptedBy:'prospect'})];const f=await fixture({server});try{
  const id=server.cards[0].id,old=clone(server.cards),hold=deferred();server.intercept=call=>!call.body?hold.promise:null;
  const reading=f.w.loadDateCards(a,true);await cancel(f,id);assert.equal(visibleCard(f,id),null);
  hold.resolve(response({cards:old,side:'member'}));await reading;assert.equal(visibleCard(f,id),null);assert.equal(f.d.querySelector('.datePlan').hidden,true);
  server.intercept=null;f.w.eval(`s.inbox.find(c=>c.id==='${a}').messages=${JSON.stringify(old)};render(true)`);await flush();assert.equal(visibleCard(f,id),null,'a retained inbox card must not resurrect a removed datecard');
  await f.w.loadDateCards(a,true);f.w.eval('render(true)');assert.equal(visibleCard(f,id),null);assert.equal(f.d.querySelector('.datePlan').hidden,true);
 }finally{f.close()}
});

test('peer cancellation while an edit draft is open prevents sending stale details',async()=>{
 const server=serverFixture();server.cards=[card()];const owner=await fixture({server}),peer=await fixture({server,role:'prospect'});try{
  const id=server.cards[0].id;await open(peer,'dinner',id);write(peer,'place','My unfinished change');await cancel(owner,id);
  await peer.w.loadDateCards(a,true);assert.equal(visibleCard(peer,id),null);const modal=peer.d.querySelector('.dateModal');
  if(modal){assert.match(modal.textContent,/cancelled|canceled|no longer available/i);assert.equal(peer.d.querySelector('[data-date-focus="send"]').disabled,true)}
  const count=server.calls.filter(call=>call.body).length;await peer.w.submitDateCard();assert.equal(server.calls.filter(call=>call.body).length,count);assert.equal(server.cards[0].card.status,'cancelled');
  peer.w.closeInvite();await open(peer,'movie');write(peer,'note','A brand-new invitation is still possible');await peer.w.submitDateCard();assert.equal(activeCards(server).length,1);assert.equal(server.cards[0].card.status,'cancelled');
 }finally{owner.close();peer.close()}
});

test('cancellation double clicks send one request and hold every card action while pending',async()=>{
 const server=serverFixture();server.cards=[card()];const f=await fixture({server,role:'prospect'});try{
  const id=server.cards[0].id,hold=deferred();server.intercept=call=>call.body?hold.promise:null;
  const first=f.w.cancelDateCard(a,id);await f.w.cancelDateCard(a,id);assert.equal(f.posts().length,1);assert.equal(f.posts()[0].body.action,'cancel');
  for(const button of f.d.querySelectorAll('.sharedDateCard .dateCardActions button'))assert.equal(button.disabled,true,'all actions are disabled while cancel is pending');
  server.cards[0].card.status='cancelled';server.cards[0].card.version=2;hold.resolve(response({cards:[],side:'prospect'}));await first;
  assert.equal(visibleCard(f,id),null);assert.equal(f.w.eval(`datePairs.get('${a}').pending`),null);
 }finally{f.close()}
});

test('lost cancellation responses can retry the identical request without duplicate mutation',async()=>{
 const server=serverFixture();server.cards=[card()];const f=await fixture({server});try{
  const id=server.cards[0].id;server.lose=true;await cancel(f,id);const first=f.posts().at(-1).body;
  assert.equal(server.cards[0].card.status,'cancelled');assert.equal(server.cards[0].card.version,2);assert.match(f.d.querySelector('.dateStatus').textContent,/interrupted|could not|confirm|retry/i);
  const retry=f.d.querySelector(cancelSelector(id))||f.d.querySelector('[data-date-focus^="retry-cancel:"]');assert.ok(retry,'uncertain cancellation remains visibly retryable');retry.click();await flush();
  assert.deepEqual(f.posts().at(-1).body,first);assert.equal(server.cards[0].card.version,2);assert.equal(server.receipts.size,1);assert.equal(visibleCard(f,id),null);
  await f.w.loadDateCards(a,true);assert.equal(visibleCard(f,id),null);
 }finally{f.close()}
});

test('stale accept and edit responses learn cancellation without reviving a shared card',async()=>{
 for(const action of ['accept','change']){
  const server=serverFixture();server.cards=[card()];const owner=await fixture({server}),peer=await fixture({server,role:'prospect'});try{
   const id=server.cards[0].id;if(action==='change'){await open(peer,'picnic',id);write(peer,'note','This edit is now stale')}
   await cancel(owner,id);if(action==='accept')await peer.w.acceptDateCard(a,id);else await peer.w.submitDateCard();
   assert.equal(server.cards[0].card.status,'cancelled');assert.equal(server.cards[0].card.version,2);assert.equal(visibleCard(peer,id),null);assert.equal(peer.d.querySelector('.datePlan').hidden,true);
   const modal=peer.d.querySelector('.dateModal');if(modal)assert.equal(peer.d.querySelector('[data-date-focus="send"]').disabled,true);
   await peer.w.loadDateCards(a,true);assert.equal(visibleCard(peer,id),null);
  }finally{owner.close();peer.close()}
 }
});

test('a stale cancellation refreshes newer details before an explicit new cancel',async()=>{
 const server=serverFixture();server.cards=[card()];const f=await fixture({server});try{
  const id=server.cards[0].id;server.cards[0].card={...server.cards[0].card,version:2,place:'Changed on another browser'};
  await cancel(f,id);assert.equal(server.cards[0].card.status,'pending');assert.equal(visibleCard(f,id).dataset.dateVersion,'2');assert.match(visibleCard(f,id).textContent,/Changed on another browser/);
  await cancel(f,id);assert.equal(f.posts().at(-1).body.version,2);assert.notEqual(f.posts()[0].body.requestId,f.posts()[1].body.requestId);assert.equal(server.cards[0].card.status,'cancelled');assert.equal(visibleCard(f,id),null);
 }finally{f.close()}
});

test('cancel failures follow account and connection changes without replacing newer dialogs',async()=>{
 for(const status of [401,403,404]){
  const server=serverFixture();server.cards=[card()];const f=await fixture({server,messages:[{by:'prospect',text:'Ordinary conversation'}]});try{
   const id=server.cards[0].id,input=f.d.querySelector('#message');input.value='My current chat draft';input.dispatchEvent(new f.w.Event('input'));input.focus();server.intercept=call=>call.body?response({error:'Datecards are unavailable.'},status):null;
   await cancel(f,id);assert.equal(visibleCard(f,id),null);assert.equal(f.d.querySelector('#message'),input);assert.equal(input.value,'My current chat draft');assert.match(f.d.querySelector('.dateMessages').textContent,/Ordinary conversation/);
  }finally{f.close()}
 }
 const server=serverFixture();server.cards=[card()];const f=await fixture({server});try{
  const id=server.cards[0].id,hold=deferred();server.intercept=call=>call.body?hold.promise:null;const cancelling=f.w.cancelDateCard(a,id);
  f.w.selectChempat(b);await flush();f.w.openDateIdea(b,'museum');await flush();write(f,'note','Keep this newer dialog');
  server.cards[0].card.status='cancelled';hold.resolve(response({cards:[],side:'member'}));await cancelling;
  assert.equal(f.w.eval('s.selectedChempat'),b);assert.equal(f.d.querySelector('#dateNote').value,'Keep this newer dialog');assert.equal(f.w.eval('currentDateDialog().connectionId'),b);
  f.w.closeInvite();server.intercept=null;server.cards=[card()];f.mount('member');await flush();const swapped=deferred();server.intercept=call=>call.body?swapped.promise:null;const prior=f.w.cancelDateCard(a,id);server.intercept=null;f.mount('prospect');await flush();
  swapped.resolve(response({cards:[],side:'member'}));await prior;assert.equal(f.w.eval('activeMemberId()'),'prospect');assert.ok(visibleCard(f,id),'old-account completion does not erase the new account snapshot');
 }finally{f.close()}
});

test('a fresh empty date snapshot remains authoritative after delayed stale inbox data',async()=>{
 const f=await fixture();try{
  assert.equal(f.w.eval(`datePairs.get('${a}').loaded`),true);assert.equal(f.d.querySelector('.sharedDateCard'),null);
  const stale=card({status:'accepted',acceptedBy:'prospect'});f.w.eval(`s.inbox.find(c=>c.id==='${a}').messages=[${JSON.stringify(stale)}];render(true)`);await flush();
  assert.equal(f.d.querySelector('.sharedDateCard'),null);assert.equal(f.d.querySelector('.datePlan').hidden,true);assert.equal(f.posts().length,0);
 }finally{f.close()}
});

test('uncertain cancel keeps its original request and version after polling a newer proposal',async()=>{
 const server=serverFixture();server.cards=[card()];const f=await fixture({server});try{
  const id=server.cards[0].id;server.fail=true;await cancel(f,id);const first=clone(f.posts().at(-1).body);server.fail=false;
  server.cards[0].card={...server.cards[0].card,version:2,place:'A newer proposal elsewhere'};await f.w.loadDateCards(a,true);
  assert.equal(visibleCard(f,id).dataset.dateVersion,'2');assert.match(f.d.querySelector(cancelSelector(id)).textContent,/Retry cancel/);
  await cancel(f,id);assert.deepEqual(f.posts().at(-1).body,first);assert.equal(server.cards[0].card.status,'pending');assert.equal(server.cards[0].card.place,'A newer proposal elsewhere');
  await cancel(f,id);assert.equal(f.posts().at(-1).body.version,2);assert.notEqual(f.posts().at(-1).body.requestId,first.requestId);assert.equal(visibleCard(f,id),null);
 }finally{f.close()}
});

test('polling a committed cancellation clears an uncertain retry without disturbing a fresh draft',async()=>{
 const server=serverFixture();server.cards=[card()];const f=await fixture({server});try{
  const id=server.cards[0].id;await open(f,'movie');write(f,'note','Keep this independent draft');f.w.saveDateIdea();f.w.closeInvite();
  server.lose=true;await cancel(f,id);assert.match(f.d.querySelector('.dateStatus').textContent,/Retry cancel/);const count=f.posts().length;
  await f.w.loadDateCards(a,true);assert.equal(visibleCard(f,id),null);assert.doesNotMatch(f.d.querySelector('.dateStatus').textContent,/interrupted|Retry cancel/);assert.equal(f.w.eval(`datePairs.get('${a}').attempts.size`),0);assert.equal(f.posts().length,count);
  await open(f,'movie');assert.equal(f.d.querySelector('#dateNote').value,'Keep this independent draft');assert.ok(f.w.eval("dateSaved.has('movie')"));
 }finally{f.close()}
});

test('keyboard cancellation restores a usable focus target on success and uncertain retry',async()=>{
 for(const lost of [false,true]){const server=serverFixture();server.cards=[card()];const f=await fixture({server});try{
  const id=server.cards[0].id,button=f.d.querySelector(cancelSelector(id));button.focus();server.lose=lost;await cancel(f,id);
  const focused=f.d.activeElement;assert.notEqual(focused,f.d.body);assert.ok(f.d.contains(focused));assert.equal(focused.disabled,false);
  if(lost){assert.equal(focused.dataset.dateFocus,'cancel:'+id);assert.match(focused.textContent,/Retry cancel/)}else assert.ok(focused.matches('.dateIdeaTile'));
 }finally{f.close()}}
});
