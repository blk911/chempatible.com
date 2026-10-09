import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {REWARD_ROUNDS} from '../api/_reward-rounds.mjs';

// Synthetic DOM/CSSOM regression fixtures only. JSDOM does not display native
// date popups; node identity, event handling, focus and CSS rules are checked.
// No live accounts, browser sessions, deployment IDs or network are used.
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
async function fixture({server=serverFixture(),role='member',status='chat',messages=[],name='Riley',selected=a}={}){
 const dom=new JSDOM(html,{url:'https://datecards.example.test/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
 let currentRole=role;const timers=[];w.setInterval=(callback,delay)=>{timers.push({callback,delay});return timers.length};w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 const rows=()=>[a,b].map(id=>({id,kind:'vibe',channel:'email',side:currentRole,status,claimed:true,location:'active',sender_name:currentRole==='member'?'Taylor':name,prospect_name:currentRole==='member'?name:'Taylor',sender_answers:Array(5).fill(0),prospect_answers:Array(5).fill(0),own_answers:Array(5).fill(0),messages:[...messages,...server.cards]}));
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
  if(!body)return response({cards:server.cards,side:currentRole});
  if(server.fail)return response({error:'A small hiccup. Try again.'},503);
  if(!server.receipts.has(body.requestId)){
   if(body.action==='send')server.cards.push({...card(),id:body.requestId,by:currentRole,card:{...card().card,ideaId:body.ideaId,date:body.date,place:body.place,note:body.note,proposer:currentRole}});
   else{const message=server.cards.find(message=>message.id===body.cardId);if(message.card.version!==body.version)return response({error:'Datecard changed.',dateCardConflict:true},409);if(body.action==='accept'){assert.notEqual(message.card.proposer,currentRole);message.card.status='accepted';message.card.acceptedBy=currentRole}else{Object.assign(message.card,{ideaId:body.ideaId,date:body.date,place:body.place,note:body.note,status:'pending',proposer:currentRole});delete message.card.acceptedBy}message.card.version++;message.card.updatedAt=new Date().toISOString()}
   server.receipts.set(body.requestId,clone(body));
  }
  if(server.lose){server.lose=false;throw Error('Connection interrupted.')}
  return response({cards:server.cards,side:currentRole});
 };
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 const mount=(nextRole=role,nextStatus=status)=>{currentRole=nextRole;status=nextStatus;const own={id:nextRole,name:'Taylor',contact:`${nextRole}@example.test`,photo:'',answers:Array(5).fill(0),verified:true};w.eval(`s={...blank(),view:'dashboard',member:${JSON.stringify(own)},account:${JSON.stringify(own)},memberId:${JSON.stringify(nextRole)},liveMember:true,inbox:${JSON.stringify(rows())},selectedChempat:'${selected}',phase:${JSON.stringify(status)}};gamePieceAutoUsed=true;render()`)};
 mount();await flush();return {w,d,server,mount,rows,timers,posts:()=>server.calls.filter(call=>call.body),close:()=>w.close()};
}
const selectors=['#dateWhen','#dateHour','#dateMinute','#datePeriod','#datePlace','#dateNote'];
const field=(f,selector)=>{const node=f.d.querySelector(selector);assert.ok(node,selector+' exists');return node};
function input(f,selector,value,event='input'){
 const node=field(f,selector);node.value=value;node.dispatchEvent(new f.w.Event(event,{bubbles:true}));return node;
}
function inputWhen(f,day,hour='',minute='',period='',event='change'){
 input(f,'#dateWhen',day,event);input(f,'#dateHour',hour,event);input(f,'#dateMinute',minute,event);input(f,'#datePeriod',period,event);
}
function editor(f){return selectors.map(selector=>field(f,selector))}
function sameEditor(f,nodes){selectors.forEach((selector,index)=>{assert.equal(field(f,selector),nodes[index],selector+' keeps its live node');assert.ok(nodes[index].isConnected,selector+' is connected')})}
const values=nodes=>nodes.map(node=>node.value);
async function open(f,idea='dinner',cardId=''){f.w.openDateIdea(a,idea,cardId);await flush()}
async function poll(f){await f.w.loadDateCards(a,true);await flush()}
function recordPropertyWrites(node,name){
 const descriptor=Object.getOwnPropertyDescriptor(node.ownerDocument.defaultView.HTMLInputElement.prototype,name),writes=[];
 Object.defineProperty(node,name,{configurable:true,get(){return descriptor.get.call(this)},set(value){writes.push(value);descriptor.set.call(this,value)}});return writes;
}

// This fails on the original implementation: loadDateCards finally calls
// renderDateModal, and replacing modalHost.innerHTML disconnects #dateWhen.
test('same-version polls preserve date control identity and DOM-only provisional calendar state',async()=>{
 const f=await fixture();try{
  await open(f);const nodes=editor(f),date=nodes[0];assert.equal(date.type,'date');date.focus();
  date.value='2026-11-04';
  // No input/change event: model browser-owned provisional state without
  // pretending that JSDOM implements a native calendar popup.
  const provisional=date.value,calendarState={month:'2026-11',selection:'pending'};date.syntheticCalendarState=calendarState;
  const valueWrites=recordPropertyWrites(date,'value'),typeWrites=recordPropertyWrites(date,'type');
  for(let turn=0;turn<5;turn++){
   await poll(f);sameEditor(f,nodes);assert.equal(date.value,provisional);assert.equal(date.syntheticCalendarState,calendarState);assert.equal(f.d.activeElement,date);
  }
  assert.deepEqual(valueWrites,[],'polls must not reassign the browser-owned value');assert.deepEqual(typeWrites,[],'polls must not reset input type');
  date.blur();assert.equal(f.d.activeElement,f.d.body);await poll(f);sameEditor(f,nodes);assert.equal(date.value,provisional);assert.equal(f.d.activeElement,f.d.body);
  assert.equal(f.posts().length,0);
 }finally{f.close()}
});

test('5-second, focus and visibility refreshes preserve partial time, note selection and drafts',async()=>{
 const f=await fixture();try{
  await open(f);input(f,'#dateWhen','2026-11-04');input(f,'#dateHour','12','change');
  input(f,'#datePlace','Quiet café');const note=input(f,'#dateNote','Still choosing our time');note.focus();note.setSelectionRange(3,12);
  const nodes=editor(f),before=values(nodes),timer=f.timers.find(timer=>timer.delay===5000);assert.ok(timer,'the production poll timer is registered');
  for(let turn=0;turn<3;turn++){timer.callback();await flush();sameEditor(f,nodes);assert.deepEqual(values(nodes),before);assert.equal(f.d.activeElement,note);assert.equal(note.selectionStart,3);assert.equal(note.selectionEnd,12)}
  f.w.dispatchEvent(new f.w.Event('blur'));f.w.dispatchEvent(new f.w.Event('focus'));await flush();sameEditor(f,nodes);assert.deepEqual(values(nodes),before);
  let hidden=true;Object.defineProperty(f.d,'hidden',{configurable:true,get:()=>hidden});const calls=f.server.calls.length;
  f.d.dispatchEvent(new f.w.Event('visibilitychange'));await flush();assert.equal(f.server.calls.length,calls,'hidden document does not poll');
  hidden=false;f.d.dispatchEvent(new f.w.Event('visibilitychange'));await flush();sameEditor(f,nodes);assert.deepEqual(values(nodes),before);assert.equal(f.d.activeElement,note);assert.equal(note.selectionStart,3);assert.equal(note.selectionEnd,12);
  assert.equal(f.posts().length,0);
 }finally{f.close()}
});

test('delayed GET completion cannot reset newer uncommitted date or partial time edits',async()=>{
 const f=await fixture();try{
  await open(f);const hold=deferred(),snapshot={cards:clone(f.server.cards),side:'member'};
  f.server.intercept=call=>!call.body?hold.promise:null;const loading=f.w.loadDateCards(a,true);
  const nodes=editor(f);input(f,'#dateWhen','2026-11-04');input(f,'#dateHour','1','change');input(f,'#dateMinute','45','change');
  input(f,'#datePlace','Newer local place');input(f,'#dateNote','Newer local note');nodes[0].value='2026-11-05';nodes[2].focus();
  const before=values(nodes);hold.resolve(response(snapshot));await loading;await flush();sameEditor(f,nodes);assert.deepEqual(values(nodes),before);assert.equal(f.d.activeElement,nodes[2]);
  assert.equal(nodes[3].value,'','missing AM/PM remains incomplete');assert.equal(f.posts().length,0);
 }finally{f.close()}
});

test('synthetic native badInput state survives polling even when the date control is blurred',async()=>{
 const f=await fixture();try{
  await open(f);const nodes=editor(f),date=nodes[0];input(f,'#dateWhen','2026-11-04');date.value='';
  // JSDOM cannot produce native segmented-date badInput; this own-property
  // stand-in verifies preservation and validation of such browser-owned state.
  Object.defineProperty(date,'validity',{configurable:true,get:()=>({badInput:true,valid:false})});date.syntheticPartialDate='11/__/2026';date.blur();
  await poll(f);sameEditor(f,nodes);assert.equal(date.validity.badInput,true);assert.equal(date.syntheticPartialDate,'11/__/2026');assert.equal(date.value,'');
  await f.w.submitDateCard();assert.equal(f.posts().length,0,'incomplete native date cannot submit a stale committed day');sameEditor(f,nodes);assert.match(field(f,'#dateModalError').textContent,/date|day|calendar/i);
 }finally{f.close()}
});

test('explicit hour, minute and AM/PM inputs serialize exact 12-hour wall time without auto-closing',async()=>{
 const f=await fixture();try{
  const cases=[
   ['2026-11-04','12','00','AM','2026-11-04T00:00'],
   ['2026-11-04','12','00','PM','2026-11-04T12:00'],
   ['2026-11-04','1','00','PM','2026-11-04T13:00'],
   ['2026-11-04','11','59','PM','2026-11-04T23:59'],
   ['2026-11-05','12','00','AM','2026-11-05T00:00'],
   ['2026-03-08','2','30','AM','2026-03-08T02:30'],
   ['2026-11-01','1','30','AM','2026-11-01T01:30']
  ];
  for(const [index,[day,hour,minute,period,expected]] of cases.entries()){
   await open(f);const nodes=editor(f),modal=field(f,'.dateModal'),count=f.posts().length;
   inputWhen(f,day,hour,minute,period,index%2?'input':'change');sameEditor(f,nodes);
   assert.equal(field(f,'.dateModal'),modal);assert.equal(f.posts().length,count,'selecting AM/PM never submits or closes');
   input(f,'#datePlace','Same local place');input(f,'#dateNote','Please keep the entered wall time');await poll(f);sameEditor(f,nodes);
   await f.w.submitDateCard();assert.equal(f.posts().length,count+1);assert.equal(f.posts().at(-1).body.date,expected);assert.equal(f.server.cards.at(-1).card.date,expected);assert.equal(f.d.querySelector('.dateModal'),null);
  }
 }finally{f.close()}
});

test('AM/PM toggles and every hour through 12 remain editable across multiple polls',async()=>{
 const f=await fixture();try{
  await open(f);inputWhen(f,'2026-11-04','12','30','AM');const nodes=editor(f);nodes[3].focus();
  for(const hour of ['12','1','2','3','4','5','6','7','8','9','10','11','12']){
   input(f,'#dateHour',hour,'change');input(f,'#datePeriod','PM','change');await poll(f);sameEditor(f,nodes);assert.equal(nodes[1].value,hour);assert.equal(nodes[3].value,'PM');assert.equal(f.d.activeElement,nodes[3]);
   input(f,'#datePeriod','AM','input');await poll(f);sameEditor(f,nodes);assert.equal(nodes[3].value,'AM');assert.equal(f.posts().length,0);
  }
  await f.w.submitDateCard();assert.equal(f.posts()[0].body.date,'2026-11-04T00:30');
 }finally{f.close()}
});

test('blank and date-only drafts send without invented time, and existing values hydrate literally',async()=>{
 const f=await fixture();try{
  await open(f);assert.deepEqual(values(editor(f)).slice(0,4),['','','','']);await f.w.submitDateCard();assert.equal(f.posts().at(-1).body.date,'');
  await open(f);input(f,'#dateWhen','2026-11-04','change');await f.w.submitDateCard();assert.equal(f.posts().at(-1).body.date,'2026-11-04');
  const examples=[['2026-11-04',['2026-11-04','','','']],['2026-11-04T00:00',['2026-11-04','12','00','AM']],['2026-11-04T12:00',['2026-11-04','12','00','PM']],['2026-11-04T13:05',['2026-11-04','1','05','PM']],['2026-11-04T23:59',['2026-11-04','11','59','PM']]];
  for(const [date,expected] of examples){
   f.server.cards=[card({date})];f.w.eval('datePairs.clear()');await poll(f);await open(f,'dinner',f.server.cards[0].id);
   assert.deepEqual(values(editor(f)).slice(0,4),expected);await poll(f);assert.deepEqual(values(editor(f)).slice(0,4),expected);f.w.closeInvite();
  }
 }finally{f.close()}
});

test('partial time stays editable, validates in place, and Clear time keeps the selected day',async()=>{
 const f=await fixture();try{
  await open(f);input(f,'#dateWhen','2026-11-04');input(f,'#dateHour','12','change');input(f,'#datePlace','Keep this place');input(f,'#dateNote','Keep this note');const nodes=editor(f);nodes[1].focus();
  await f.w.submitDateCard();assert.equal(f.posts().length,0);sameEditor(f,nodes);assert.equal(nodes[1].value,'12');assert.equal(nodes[2].value,'');assert.equal(nodes[3].value,'');assert.match(field(f,'#dateModalError').textContent,/hour|minute|AM|PM|complete/i);
  await poll(f);sameEditor(f,nodes);field(f,'[data-date-focus="clear-time"]').click();sameEditor(f,nodes);assert.deepEqual(values(nodes),['2026-11-04','','','','Keep this place','Keep this note']);
  await f.w.submitDateCard();assert.equal(f.posts()[0].body.date,'2026-11-04');
  await open(f);input(f,'#dateHour','1');input(f,'#dateMinute','15');input(f,'#datePeriod','PM');await f.w.submitDateCard();assert.equal(f.posts().length,1,'time without a day cannot be sent');assert.match(field(f,'#dateModalError').textContent,/date|day/i);
 }finally{f.close()}
});

test('Save idea patches status without replacing editor nodes or discarding DOM-only state',async()=>{
 const f=await fixture();try{
  await open(f);inputWhen(f,'2026-11-04','7','30','PM');input(f,'#datePlace','The corner café');input(f,'#dateNote','A private draft');const nodes=editor(f);nodes[0].value='2026-11-05';nodes[5].focus();nodes[5].setSelectionRange(2,8);const before=values(nodes);
  f.w.saveDateIdea();sameEditor(f,nodes);assert.deepEqual(values(nodes),before);assert.equal(f.d.activeElement,nodes[5]);assert.equal(nodes[5].selectionStart,2);assert.equal(nodes[5].selectionEnd,8);assert.match(field(f,'#dateModalStatus').textContent,/Saved privately/);assert.equal(f.posts().length,0);
  await poll(f);sameEditor(f,nodes);assert.deepEqual(values(nodes),before);
 }finally{f.close()}
});

test('peer version changes show conflict while preserving all editable fields and focus',async()=>{
 const f=await fixture();try{
  f.server.cards=[card()];await poll(f);await open(f,'dinner',f.server.cards[0].id);inputWhen(f,'2026-11-06','8','15','PM');input(f,'#datePlace','My local place');input(f,'#dateNote','My unsent edit');const nodes=editor(f),before=values(nodes);nodes[3].focus();
  Object.assign(f.server.cards[0].card,{version:2,date:'2026-11-07T13:45',place:'Peer place',note:'Peer edit',proposer:'prospect'});await poll(f);
  sameEditor(f,nodes);assert.deepEqual(values(nodes),before);assert.equal(f.d.activeElement,nodes[3]);assert.match(field(f,'.dateModal').textContent,/datecard has changed/i);assert.ok(field(f,'[data-date-focus="send"]').disabled);assert.equal(field(f,'.sharedDateCard').dataset.dateVersion,'2');
  await poll(f);sameEditor(f,nodes);assert.deepEqual(values(nodes),before);assert.equal(f.posts().length,0);
  field(f,'[data-date-focus="latest"]').click();assert.deepEqual(values(editor(f)),['2026-11-07','1','45','PM','Peer place','Peer edit']);assert.equal(field(f,'[data-date-focus="send"]').disabled,false);
 }finally{f.close()}
});

test('newer inbox-only peer version survives an older held GET and updates conflict in place',async()=>{
 const f=await fixture();try{
  f.server.cards=[card()];await poll(f);await open(f,'dinner',f.server.cards[0].id);input(f,'#dateNote','Keep my local proposal');const nodes=editor(f),before=values(nodes);nodes[1].focus();
  const hold=deferred(),old={cards:clone(f.server.cards),side:'member'};f.server.intercept=call=>!call.body?hold.promise:null;const loading=f.w.loadDateCards(a,true);
  Object.assign(f.server.cards[0].card,{version:2,date:'2026-11-08T14:00',place:'Inbox update',proposer:'prospect'});await f.w.refreshLive(true);await flush();
  sameEditor(f,nodes);assert.deepEqual(values(nodes),before);assert.ok(field(f,'[data-date-focus="send"]').disabled);assert.match(field(f,'.dateModal').textContent,/datecard has changed/i);
  hold.resolve(response(old));await loading;await flush();sameEditor(f,nodes);assert.deepEqual(values(nodes),before);assert.ok(field(f,'[data-date-focus="send"]').disabled);assert.equal(field(f,'.sharedDateCard').dataset.dateVersion,'2');assert.equal(f.posts().length,0);
 }finally{f.close()}
});

test('background errors and recovery patch status without disturbing the active editor',async()=>{
 const f=await fixture();try{
  await open(f);inputWhen(f,'2026-11-04','4','25','PM');input(f,'#dateNote','Still here');const nodes=editor(f),before=values(nodes);nodes[0].focus();
  f.server.intercept=call=>!call.body?response({error:'Temporary read hiccup.'},503):null;await poll(f);sameEditor(f,nodes);assert.deepEqual(values(nodes),before);assert.match(field(f,'#dateModalError').textContent,/Temporary read hiccup/);assert.equal(f.d.activeElement,nodes[0]);
  f.server.intercept=null;await poll(f);sameEditor(f,nodes);assert.deepEqual(values(nodes),before);assert.equal(field(f,'#dateModalError').textContent,'');assert.equal(f.d.activeElement,nodes[0]);
 }finally{f.close()}
});

test('Back, close and reopen preserve committed date parts, place, note and partial time',async()=>{
 const f=await fixture();try{
  await open(f);inputWhen(f,'2026-11-04','8','','PM');input(f,'#datePlace','My draft place');input(f,'#dateNote','My draft note');const before=values(editor(f));
  f.w.dateBack();assert.ok(f.d.querySelector('.datePicker'));await open(f);assert.deepEqual(values(editor(f)),before);
  f.w.closeInvite();assert.equal(f.d.querySelector('.dateModal'),null);await open(f);assert.deepEqual(values(editor(f)),before);assert.equal(f.posts().length,0);
  input(f,'#dateMinute','40','change');await f.w.submitDateCard();assert.equal(f.posts()[0].body.date,'2026-11-04T20:40');assert.equal(f.posts()[0].body.place,'My draft place');assert.equal(f.posts()[0].body.note,'My draft note');
 }finally{f.close()}
});

test('uncertain POST and retry keep field nodes, locked values and the same request ID',async()=>{
 const f=await fixture();try{
  await open(f);inputWhen(f,'2026-11-04','12','00','AM');input(f,'#datePlace','Late café');input(f,'#dateNote','Only send this once');const nodes=editor(f),before=values(nodes);f.server.lose=true;
  await f.w.submitDateCard();sameEditor(f,nodes);assert.deepEqual(values(nodes),before);assert.ok(nodes.every(node=>node.disabled));assert.match(field(f,'[data-date-focus="send"]').textContent,/Retry send/);const first=clone(f.posts()[0].body);assert.equal(f.server.cards.length,1);
  for(let turn=0;turn<3;turn++){await poll(f);sameEditor(f,nodes);assert.deepEqual(values(nodes),before)}
  const hold=deferred();f.server.intercept=call=>call.body?hold.promise:null;const retry=f.w.submitDateCard();sameEditor(f,nodes);assert.ok(nodes.every(node=>node.disabled));assert.deepEqual(f.posts()[1].body,first);assert.match(field(f,'#dateModalStatus').textContent,/Sending/);
  hold.resolve(response({cards:f.server.cards,side:'member'}));await retry;assert.equal(f.d.querySelector('.dateModal'),null);assert.equal(f.server.cards.length,1);
 }finally{f.close()}
});

test('time selects have labels, all minutes, keyboard containment and no implicit submit',async()=>{
 const f=await fixture();try{
  await open(f);const modal=field(f,'.dateModal');assert.equal(modal.getAttribute('role'),'dialog');assert.equal(modal.getAttribute('aria-modal'),'true');assert.equal(modal.getAttribute('aria-labelledby'),'dateTitle');
  for(const selector of ['#dateWhen','#dateHour','#dateMinute','#datePeriod']){const node=field(f,selector);assert.ok(node.labels?.length||node.getAttribute('aria-label'),'accessible name for '+selector);assert.ok(node.dataset.dateFocus,'focus identity for '+selector)}
  assert.deepEqual([...field(f,'#dateHour').options].map(option=>option.value),['',...Array.from({length:12},(_,index)=>String(index+1))]);
  assert.deepEqual([...field(f,'#dateMinute').options].map(option=>option.value),['',...Array.from({length:60},(_,index)=>String(index).padStart(2,'0'))]);
  assert.deepEqual([...field(f,'#datePeriod').options].map(option=>option.value),['','AM','PM']);
  for(const selector of ['#dateHour','#dateMinute','#datePeriod']){
   const node=field(f,selector);node.focus();const tab=new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true});node.dispatchEvent(tab);assert.equal(tab.defaultPrevented,false,'Shift+Tab from '+selector+' stays in normal dialog order');assert.equal(f.d.activeElement,node,'JSDOM does not perform native tab traversal');
  }
  const close=field(f,'.dateModal .close');close.focus();const backTab=new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true});close.dispatchEvent(backTab);assert.ok(backTab.defaultPrevented);assert.equal(f.d.activeElement.dataset.dateFocus,'save');
  const nextTab=new f.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});f.d.activeElement.dispatchEvent(nextTab);assert.ok(nextTab.defaultPrevented);assert.equal(f.d.activeElement,close);
  assert.equal(f.posts().length,0);f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.d.querySelector('.dateModal'),null);
 }finally{f.close()}
});

// CSSOM assertions evaluate the shipped rules at target breakpoints. JSDOM
// does not lay out pixels, so these are not screenshots or overflow evidence.
test('320, 375 and 768px CSS rules keep separate date/time controls shrinkable and touch-sized',async()=>{
 const f=await fixture();try{
  await open(f);const sourceStyle=f.d.createElement('style');sourceStyle.textContent=css;f.d.head.append(sourceStyle);const rules=[...sourceStyle.sheet.cssRules];sourceStyle.remove();
  const at=(rules,width)=>rules.map(rule=>{
   if(rule.constructor.name==='CSSContainerRule')return '';
   if(rule.type!==f.w.CSSRule.MEDIA_RULE)return rule.cssText;
   const matches=rule.conditionText.split(/\s+and\s+/).every(part=>{const match=part.match(/^\((min|max)-width:\s*(\d+)px\)$/);return match&&(match[1]==='min'?width>=+match[2]:width<=+match[2])});
   return matches?at([...rule.cssRules],width):'';
  }).join('\n');
  for(const width of [320,375,768]){
   const style=f.d.createElement('style');style.textContent=at(rules,width);f.d.head.append(style);
   for(const selector of ['#dateWhen','#dateHour','#dateMinute','#datePeriod']){
    const computed=f.w.getComputedStyle(field(f,selector));assert.equal(computed.minWidth,'0px',selector+' can shrink at '+width);assert.equal(computed.maxWidth,'100%');assert.ok(parseFloat(computed.minHeight)>=44,selector+' touch target at '+width);
   }
   assert.equal(f.w.getComputedStyle(field(f,'.dateModal')).overflowX,'hidden');style.remove();
  }
 }finally{f.close()}
});

test('explicit Send captures date, clock and text values that have not emitted change yet',async()=>{
 const f=await fixture();try{
  await open(f);const nodes=editor(f),pending=['2026-11-04','1','05','PM','Just committed place','Just committed note'];
  nodes.forEach((node,index)=>{node.value=pending[index]});await poll(f);sameEditor(f,nodes);assert.deepEqual(values(nodes),pending);
  await f.w.submitDateCard();assert.deepEqual(Object.fromEntries(['date','place','note'].map(key=>[key,f.posts()[0].body[key]])),{date:'2026-11-04T13:05',place:'Just committed place',note:'Just committed note'});
 }finally{f.close()}
});

test('out-of-range native date values block submission without replacing the controls',async()=>{
 const f=await fixture();try{
  await open(f);const nodes=editor(f);
  for(const day of ['1899-12-31','10000-01-01']){
   input(f,'#dateWhen',day,'change');assert.equal(nodes[0].validity.valid,false);await f.w.submitDateCard();sameEditor(f,nodes);assert.equal(f.posts().length,0);assert.match(field(f,'#dateModalError').textContent,/1900.*9999/);
  }
  input(f,'#dateWhen','1900-01-01');await f.w.submitDateCard();assert.equal(f.posts()[0].body.date,'1900-01-01');
 }finally{f.close()}
});

test('uncertain changes retain their original payload after reopen, different idea and attempted edits',async()=>{
 const f=await fixture();try{
  f.server.cards=[card()];await poll(f);const id=f.server.cards[0].id;await open(f,'picnic',id);inputWhen(f,'2026-11-06','11','59','PM');input(f,'#datePlace','The picnic garden');input(f,'#dateNote','A single changed proposal');f.server.lose=true;
  await f.w.submitDateCard();const first=clone(f.posts()[0].body);assert.equal(first.action,'change');assert.equal(f.server.cards[0].card.version,2);await poll(f);
  f.w.closeInvite();await open(f,'movie',id);const nodes=editor(f);assert.ok(nodes.every(node=>node.disabled));assert.match(field(f,'#dateTitle').textContent,/picnic/i);assert.equal(field(f,'#dateConflict').hidden,true);
  // Programmatic events deliberately go beyond what disabled native controls
  // allow a person to do, to exercise the immutable-attempt handler guards.
  inputWhen(f,'2026-11-09','1','01','AM');input(f,'#datePlace','Must not replace the original');input(f,'#dateNote','Must not replace the original');f.w.clearDateTime();f.w.resetDateConflict();
  sameEditor(f,nodes);await f.w.submitDateCard();assert.deepEqual(f.posts()[1].body,first,'retry uses exactly the first request ID, version and fields');assert.equal(f.server.cards.length,1);assert.equal(f.server.cards[0].card.version,2);assert.equal(f.server.cards[0].card.ideaId,'picnic');
 }finally{f.close()}
});

test('POST timeout patches in place and permits an identical retry after multiple refreshes',async()=>{
 const f=await fixture();try{
  await open(f);inputWhen(f,'2026-11-04','12','00','PM');input(f,'#datePlace','Noon café');const nodes=editor(f),before=values(nodes),realSetTimeout=f.w.setTimeout.bind(f.w);let expire;
  f.w.setTimeout=(callback,delay,...args)=>delay===20000?(expire=callback,123):realSetTimeout(callback,delay,...args);f.server.intercept=call=>call.body?new Promise(()=>{}):null;
  const sending=f.w.submitDateCard();sameEditor(f,nodes);assert.ok(nodes.every(node=>node.disabled));assert.ok(expire);expire();await sending;
  sameEditor(f,nodes);assert.deepEqual(values(nodes),before);assert.match(field(f,'#dateModalError').textContent,/timed out/);const first=clone(f.posts()[0].body);
  f.server.intercept=null;await poll(f);await poll(f);sameEditor(f,nodes);await f.w.submitDateCard();assert.deepEqual(f.posts()[1].body,first);assert.equal(f.server.cards.length,1);
 }finally{f.close()}
});
