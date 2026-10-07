import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../site.css',import.meta.url),'utf8');
const photo='data:image/jpeg;base64,AA==',sentAt='2026-09-21T12:30:00.000Z',actedAt='2026-09-29T15:45:00.000Z';
const own={id:'owner',name:'Taylor Owner',contact:'private-owner@example.com',photo,answers:Array(10).fill(0),verified:true};
const clone=value=>JSON.parse(JSON.stringify(value));
const row=(id='pair',kind='vibe',side='member',overrides={})=>({id,kind,channel:kind==='friend'?'friend':'email',side,status:'chat',location:'active',sender_name:side==='member'?own.name:'Morgan Other',prospect_name:side==='member'?'Morgan Other':own.name,sender_photo:photo,prospect_photo:photo,sender_answers:own.answers,prospect_answers:own.answers,own_answers:own.answers,messages:[],invitedAt:sentAt,canFreeze:true,canTrash:false,canRestore:false,canReinvite:false,canBlock:true,canUnblock:false,canReport:true,historyEmail:'',...overrides});
const frozen=(id='pair',kind='vibe',overrides={})=>row(id,kind,'member',{status:'ended',location:'freezer',freezerAction:'freeze',freezerActionAt:actedAt,endedAt:actedAt,canFreeze:false,canTrash:true,canReinvite:true,...overrides});
const trashed=(id='pair',overrides={})=>frozen(id,'vibe',{location:'trash',trashedAt:actedAt,canTrash:false,canRestore:true,...overrides});
const flush=async()=>{await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0))};
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:()=>resolve()}};
function fixture(rows=[row()],{token=false,cursor=null}={}){
 const dom=new JSDOM(html,{url:'https://freezer.example/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
 w.fetch=async()=>({ok:false,status:401,json:async()=>({})});w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 const style=d.createElement('style');style.textContent=css;d.head.append(style);
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 const server={rows:clone(rows),cursor,next:[],nextCursor:null,trashNext:null,trashCursor:null,calls:[],fail:false,failSend:false,reinvites:new Map(),prepared:null};
 const visible=rows.filter(c=>c.location!=='trash');
 const state=token?{view:'dashboard',actor:'prospect',member:{name:'Morgan Other',photo,answers:own.answers},prospect:{...own,email:own.contact},prospectId:own.id,liveInvite:true,liveToken:'original-token',liveId:rows[0].id,phase:rows[0].status,firstConnection:rows[0],invitedAt:sentAt,selectedChempat:'first'}:{view:'dashboard',actor:'member',member:own,memberId:own.id,account:own,liveMember:true,inbox:visible.filter(c=>c.kind!=='friend'),friends:visible.filter(c=>c.kind==='friend'),selectedChempat:visible[0]?.id||'',freezerCursor:cursor};
 w.eval(`s={...blank(),...${JSON.stringify(state)}};render()`);
 const response=(body,status=200)=>({ok:status<400,status,json:async()=>clone(body)});
 const fetch=async(url,options={})=>{
  assert.ok(url.startsWith('/api/'),'requests are confined to isolated API stubs');const body=options.body?JSON.parse(options.body):null;server.calls.push({url,body});
  if(url==='/api/member'&&body?.action==='logout')return response({ok:true});
  if(url==='/api/connection?inbox=1')return response({connections:server.rows.filter(c=>c.location!=='trash'),freezerCursor:server.cursor});
  if(url.startsWith('/api/connection?freezer='))return response({connections:server.next,freezerCursor:server.nextCursor});
  if(url.startsWith('/api/connection?trash='))return response({connections:server.trashNext||server.rows.filter(c=>c.location==='trash'),trashCursor:server.trashCursor});
  if(url.startsWith('/api/connection?invite='))return response({...server.rows[0],answers:own.answers,prospectAnswers:own.answers});
  assert.equal(url,'/api/connection');if(server.fail)return response({error:'The change was interrupted. Try again.'},503);
  const c=server.rows.find(c=>c.id===(body.id||rows[0].id));assert.ok(c,'action uses the original target');
  if(body.action==='prepareReinvite')return response(server.prepared||{recipient:{name:'Morgan'},destination:'member',kind:c.kind,canSend:true,needsAnswers:false});
  if(body.action==='reinvite'){
   assert.equal(body.kind,c.kind);assert.match(body.requestId,/^[a-f0-9]{64}$/);
   if(!server.reinvites.has(body.requestId)){const id=`new-${server.reinvites.size+1}`;server.reinvites.set(body.requestId,id);server.rows.push(row(id,c.kind,'member',{status:'invited',canReport:false,canBlock:false,prospect_photo:'',prospect_name:'Morgan',messages:[]}))}
   if(server.failSend){server.failSend=false;throw Error('The invitation response was interrupted. Try again.')}
   return response({ok:true,id:server.reinvites.get(body.requestId),kind:c.kind});
  }
  if(body.action==='cancel'&&(c.status!=='invited'||!c.canCancel))return response({error:'This invitation was already accepted or is no longer pending.'},409);
  if(['freeze','cancel'].includes(body.action)){const pending=c.status==='invited';Object.assign(c,{status:'ended',location:'freezer',freezerAction:pending?'cancel':'freeze',freezerActionAt:actedAt,endedAt:actedAt,canFreeze:false,canCancel:false,canTrash:true,canReinvite:c.canBlock||!!c.historyEmail,messages:[]})}
  else if(body.action==='trash')Object.assign(c,{location:'trash',trashedAt:actedAt,canTrash:false,canRestore:true});
  else if(body.action==='restore')Object.assign(c,{location:'freezer',trashedAt:null,canTrash:true,canRestore:false});
  else if(body.action==='block'){for(const candidate of server.rows){const trash=candidate.location==='trash';Object.assign(candidate,{status:'ended',location:trash?'trash':'freezer',freezerAction:'block',freezerActionAt:actedAt,endedAt:actedAt,blockedAt:actedAt,blockedByMe:true,canBlock:false,canUnblock:true,canReinvite:false,canTrash:!trash,canFreeze:false,messages:[]})}}
  else if(body.action==='unblock'){for(const candidate of server.rows)Object.assign(candidate,{blockedByMe:false,blockedAt:null,canBlock:true,canUnblock:false,canReinvite:true})}
  else if(body.action==='report')Object.assign(c,{status:'ended',location:'freezer',freezerAction:'ended',freezerActionAt:actedAt,endedAt:actedAt,canTrash:true,messages:[]});
  else throw Error(`Unexpected action ${body.action}`);
  return response({ok:true,connection:c});
 };
 w.fetch=fetch;
 return {dom,w,d,server,fetch,state:()=>JSON.parse(w.eval('JSON.stringify(s)')),open:(id,kind)=>w.openEnd(id,kind),close:()=>dom.window.close()};
}
const archive=f=>f.d.querySelector('.socialFreezer');
const buttons=node=>[...node.querySelectorAll('button')].map(b=>b.textContent);
const actions=f=>f.server.calls.filter(c=>c.body).map(c=>c.body.action);
const openTrash=async f=>{f.w.toggleTrash();await flush()};
const menuTrigger=f=>f.d.querySelector('#connectionPanel .connectionMenuTrigger');
const openMenu=f=>{menuTrigger(f).click();return f.d.querySelector('body > .connectionMenuPanel')};
const key=(f,target,name,extra={})=>{const event=new f.w.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...extra});target.dispatchEvent(event);return event};

test('ellipsis opening, repeated clicks, outside click and Escape never change a connection or its draft',()=>{
 const f=fixture();try{
  const trigger=menuTrigger(f),input=f.d.querySelector('#message');input.value='Unsent draft';input.focus();
  const panel=openMenu(f);assert.equal(trigger.textContent,'⋯');assert.equal(trigger.getAttribute('aria-expanded'),'true');assert.equal(trigger.getAttribute('aria-haspopup'),'menu');assert.equal(panel.getAttribute('aria-labelledby'),trigger.id);assert.equal(panel.parentElement,f.d.body);assert.equal(f.d.activeElement.dataset.action,'freeze');assert.equal(input.value,'Unsent draft');assert.deepEqual(actions(f),[]);
  trigger.click();assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(panel.hidden,true);assert.equal(f.d.activeElement,trigger);
  trigger.click();key(f,f.d.activeElement,'Escape');assert.equal(panel.hidden,true);assert.equal(f.d.activeElement,trigger);
  trigger.click();f.d.body.click();assert.equal(panel.hidden,true);assert.equal(f.d.activeElement,trigger);
  trigger.click();input.focus();assert.equal(panel.hidden,true);assert.equal(f.d.activeElement,input);
  f.w.eval('render()');assert.equal(f.d.querySelector('#message').value,'Unsent draft');assert.equal(f.server.rows[0].status,'chat');assert.deepEqual(actions(f),[]);
 }finally{f.close()}
});

test('keyboard menu navigation wraps and leaves the menu on Tab without firing actions',()=>{
 const f=fixture();try{
  const trigger=menuTrigger(f);trigger.focus();assert.equal(key(f,trigger,'ArrowDown').defaultPrevented,true);assert.equal(f.d.activeElement.dataset.action,'freeze');
  for(const [pressed,action] of [['ArrowUp','report'],['ArrowDown','freeze'],['End','report'],['Home','freeze'],['ArrowDown','block']]){assert.equal(key(f,f.d.activeElement,pressed).defaultPrevented,true);assert.equal(f.d.activeElement.dataset.action,action)}
  key(f,f.d.activeElement,'Tab');assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(f.d.activeElement,trigger);
  key(f,trigger,'ArrowUp');assert.equal(f.d.activeElement.dataset.action,'report');key(f,f.d.activeElement,'Tab',{shiftKey:true});assert.equal(f.d.activeElement,trigger);assert.deepEqual(actions(f),[]);
 }finally{f.close()}
});

for(const action of ['freeze','block','report'])test(`${action} opens its existing confirmation, traps focus and returns focus on dismissal`,()=>{
 const f=fixture();try{
  f.d.querySelector('#message').value='Keep my draft';const trigger=menuTrigger(f),panel=openMenu(f);panel.querySelector(`[data-action=${action}]`).click();
  assert.equal(f.state().endTarget.kind,action);assert.equal(panel.hidden,true);const modal=f.d.querySelector('.endModal');assert.equal(f.d.activeElement,modal.querySelector('.close'));assert.deepEqual(actions(f),[]);
  const buttons=modal.querySelectorAll('button'),last=buttons[buttons.length-1];last.focus();assert.equal(key(f,last,'Tab').defaultPrevented,true);assert.equal(f.d.activeElement,buttons[0]);assert.equal(key(f,buttons[0],'Tab',{shiftKey:true}).defaultPrevented,true);assert.equal(f.d.activeElement,last);
  key(f,last,'Escape');assert.equal(f.state().modal,'');assert.equal(f.d.activeElement,trigger);assert.equal(f.d.querySelector('#message').value,'Keep my draft');assert.deepEqual(actions(f),[]);
 }finally{f.close()}
});

test('pending menu respects strict server capabilities and never exposes active history controls',()=>{
 const f=fixture([row('pending','friend','member',{status:'invited',canCancel:true,canBlock:true,canReport:false})]);try{
  assert.deepEqual(buttons(openMenu(f)),['Cancel invitation','Block']);assert.doesNotMatch(f.d.querySelector('.activeConnectionActions').textContent,/Trash|Invite again|Unblock/);
  f.w.eval("s.friends[0].canCancel='true';s.friends[0].canBlock=false;s.friends[0].canReport=false;render()");assert.deepEqual(buttons(openMenu(f)),['Freeze connection']);
  f.w.eval("s.friends[0].status='ended';s.friends[0].location='freezer';s.friends[0].canTrash=true;render()");assert.equal(f.d.querySelector('body > .connectionMenuPanel'),null);assert.equal(menuTrigger(f),null);
 }finally{f.close()}
});

test('only one menu opens when a pending QR and a selected connection both have options',()=>{
 const f=fixture([row(),row('qr','vibe','member',{status:'invited',channel:'qr',claimed:false,canCancel:true,canBlock:false,canReport:false})]);try{
  const triggers=f.d.querySelectorAll('.connectionMenuTrigger');assert.equal(triggers.length,2);triggers[0].click();triggers[1].click();assert.equal(triggers[0].getAttribute('aria-expanded'),'false');assert.equal(triggers[1].getAttribute('aria-expanded'),'true');assert.equal(f.d.querySelectorAll('body > .connectionMenuPanel:not([hidden])').length,1);assert.deepEqual(actions(f),[]);
 }finally{f.close()}
});

test('polling invalidates old options, preserves the draft and focuses the current trigger',async()=>{
 const f=fixture();try{
  f.d.querySelector('#message').value='Keep while polling';const panel=openMenu(f),oldAction=panel.querySelector('[data-action=block]');f.server.rows[0].canBlock=false;await f.w.refreshLive();
  assert.equal(f.d.querySelector('body > .connectionMenuPanel'),null);assert.equal(f.d.activeElement,menuTrigger(f));assert.equal(f.d.querySelector('#message').value,'Keep while polling');oldAction.click();assert.equal(f.state().modal,'');assert.deepEqual(actions(f),[]);assert.deepEqual(buttons(openMenu(f)),['Freeze connection','Report']);
  Object.assign(f.server.rows[0],{status:'ended',location:'freezer',canFreeze:false,canTrash:true});await f.w.refreshLive();assert.equal(menuTrigger(f),null);assert.equal(f.d.querySelector('body > .connectionMenuPanel'),null);
 }finally{f.close()}
});

test('polling an accepted invitation dismisses Cancel and keeps focus on its current options',async()=>{
 const f=fixture([row('pending','friend','member',{status:'invited',canCancel:true,canReport:false})]);try{
  const oldAction=openMenu(f).querySelector('[data-action=cancel]');Object.assign(f.server.rows[0],{status:'chat',canCancel:false,canReport:true});await f.w.refreshLive();assert.equal(f.d.activeElement,menuTrigger(f));assert.equal(menuTrigger(f).getAttribute('aria-expanded'),'false');oldAction.click();assert.equal(f.state().modal,'');assert.deepEqual(actions(f),[]);assert.deepEqual(buttons(openMenu(f)),['Freeze connection','Block','Report']);
 }finally{f.close()}
});

test('opening after polling while typing rebuilds options from the latest permissions without replacing the draft',async()=>{
 const f=fixture();try{
  const input=f.d.querySelector('#message');input.value='Still typing';input.focus();f.server.rows[0].canBlock=false;await f.w.refreshLive();assert.equal(f.d.querySelector('#message'),input);assert.equal(f.d.activeElement,input);
  assert.deepEqual(buttons(openMenu(f)),['Freeze connection','Report']);assert.equal(f.d.querySelector('#message'),input);assert.equal(input.value,'Still typing');assert.deepEqual(actions(f),[]);
 }finally{f.close()}
});

for(const initiallyOpen of [false,true])test(`repeated message polls preserve focus on options (${initiallyOpen?'menu open':'trigger only'})`,async()=>{
 const f=fixture();try{
  if(initiallyOpen)openMenu(f);else menuTrigger(f).focus();
  for(let index=0;index<2;index++){f.server.rows[0].messages.push({by:'prospect',text:`New message ${index}`});await f.w.refreshLive();assert.equal(f.d.activeElement,menuTrigger(f));assert.equal(menuTrigger(f).getAttribute('aria-expanded'),'false');assert.equal(f.d.querySelector('body > .connectionMenuPanel'),null)}
  assert.deepEqual(actions(f),[]);
 }finally{f.close()}
});

for(const change of ['selection','route','account','modal'])test(`${change} closes the menu and cannot activate its stale options`,()=>{
 const f=fixture([row(),row('other','friend')]);try{
  const oldAction=openMenu(f).querySelector('[data-action=block]');
  if(change==='selection')f.w.selectChempat('other');else if(change==='route')f.w.navigate('profile');else if(change==='account')f.w.eval("s.account={...s.account,id:'different-account'};render()");else f.w.confirmLogout();
  const modal=f.state().modal;oldAction.click();assert.equal(f.d.querySelector('body > .connectionMenuPanel'),null);assert.equal(f.state().modal,modal);assert.deepEqual(actions(f),[]);
 }finally{f.close()}
});

for(const polled of [false,true])test(`cancel cannot end a newly accepted invitation (${polled?'poll observed':'server race'})`,async()=>{
 const f=fixture([row('pending','friend','member',{status:'invited',canCancel:true,canBlock:false,canReport:false})]);try{
  openMenu(f).querySelector('[data-action=cancel]').click();assert.equal(f.state().endTarget.kind,'cancel');assert.match(f.d.querySelector('.endModal').textContent,/old link will stop working/);assert.doesNotMatch(f.d.querySelector('.endModal').textContent,/where you can invite again/);
  Object.assign(f.server.rows[0],{status:'chat',canCancel:false,canBlock:true,canReport:true});if(polled)await f.w.refreshLive();await f.w.confirmEnd();assert.equal(f.server.rows[0].status,'chat');assert.deepEqual(actions(f),polled?[]:['cancel']);assert.match(f.d.querySelector('#endError').textContent,polled?/connection changed/:/already accepted/);assert.equal(f.state().modal,'end');
 }finally{f.close()}
});

test('incoming game pieces wait while a connection menu is open',()=>{
 const f=fixture();try{assert.equal(f.w.safeGamePieceArrival(),true);openMenu(f);assert.equal(f.w.safeGamePieceArrival(),false);key(f,f.d.activeElement,'Escape');assert.equal(f.w.safeGamePieceArrival(),true)}finally{f.close()}
});

for(const width of [320,375,700,1280])test(`menu geometry stays within the ${width}px viewport and flips above near its bottom`,()=>{
 const f=fixture();try{
  Object.defineProperty(f.w,'innerWidth',{value:width,configurable:true});Object.defineProperty(f.w,'innerHeight',{value:480,configurable:true});const trigger=menuTrigger(f),panel=f.d.querySelector('.connectionMenuPanel');
  trigger.getBoundingClientRect=()=>({left:width-56,right:width-12,top:420,bottom:464,width:44,height:44});panel.getBoundingClientRect=()=>({width:200,height:154});openMenu(f);
  assert.equal(f.w.getComputedStyle(trigger).minHeight,'44px');assert.equal(f.w.getComputedStyle(trigger).minWidth,'44px');assert.equal(f.w.getComputedStyle(panel.querySelector('button')).minHeight,'44px');assert.equal(f.w.getComputedStyle(panel).position,'fixed');assert.equal(panel.parentElement,f.d.body);
  const left=parseFloat(panel.style.left),top=parseFloat(panel.style.top);assert.ok(left>=8&&left+200<=width-8);assert.ok(top>=8&&top+154<420);assert.equal(panel.style.maxWidth,`${width-16}px`);
  trigger.getBoundingClientRect=()=>({left:4,right:48,top:10,bottom:54,width:44,height:44});f.w.dispatchEvent(new f.w.Event('resize'));assert.equal(panel.style.left,'8px');assert.equal(panel.style.top,'59px');assert.deepEqual(actions(f),[]);
 }finally{f.close()}
});

for(const kind of ['vibe','friend'])for(const side of ['member','prospect'])test(`${kind}/${side}: Freezer immediately ends contact and provides no return path`,async()=>{
 const f=fixture([row('pair',kind,side)]);
 try{
  assert.equal(f.d.querySelector('.freezeConnection'),null);assert.deepEqual(buttons(f.d.querySelector('.connectionMenuPanel')),['Freeze connection','Block','Report']);assert.doesNotMatch(f.d.querySelector('.activeConnectionActions').textContent,/Unmatch|Trash|Invite again/);
  f.d.querySelector('#message').value='Private draft';f.open('pair','freeze');assert.match(f.d.querySelector('.endModal').textContent,/ends the connection immediately for both/);await f.w.confirmEnd();
  assert.equal(f.server.rows[0].status,'ended');assert.equal(archive(f).open,true,'the successfully frozen record is visible');assert.equal(f.d.querySelector('.inlineComposer'),null);assert.equal(f.d.querySelectorAll('.chempatContact').length,0);assert.match(archive(f).textContent,/Frozen/);assert.doesNotMatch(f.d.querySelector('#root').textContent,/Return to connections|Resend|Unmatch/);
  f.open('pair','unfreeze');assert.equal(f.state().modal,'');await f.w.refreshLive();assert.equal(f.d.querySelector('.inlineChat'),null);assert.deepEqual(actions(f),['freeze']);
  assert.deepEqual([...archive(f).querySelectorAll('time')].map(n=>n.dateTime),[sentAt,actedAt]);
 }finally{f.close()}
});

for(const kind of ['vibe','friend'])test(`${kind}: pending cancellation keeps unknown Mystery Guest in recoverable history`,async()=>{
 const f=fixture([row('pending',kind,'member',{status:'invited',prospect_name:'',recipient_name:'',prospect_photo:'',canCancel:true,canBlock:false,canReport:false})]);
 try{assert.equal(f.d.querySelector('#connectionName').textContent,'Mystery Guest');assert.deepEqual(buttons(f.d.querySelector('.connectionMenuPanel')),['Cancel invitation']);f.d.querySelector('.connectionMenuTrigger').click();f.d.querySelector('[data-action=cancel]').click();assert.match(f.d.querySelector('.endModal').textContent,/old link will stop working/);await f.w.confirmEnd();assert.equal(archive(f).open,true,'a cancelled invitation is visible');assert.match(archive(f).textContent,/Cancelled/);assert.deepEqual(buttons(archive(f)),['Trash']);for(const action of ['block','unblock','reinvite','unfreeze','cancel']){f.open('pending',action);assert.equal(f.state().modal,'')}assert.equal(archive(f).querySelector('img'),null)}finally{f.close()}
});

test('capabilities and historically shared identity come only from the server',()=>{
 const f=fixture([frozen('unknown','friend',{prospect_name:'',recipient_name:'',prospect_photo:'',canBlock:false,canReport:false,canReinvite:false,recipient_email:'private-recipient@example.com',prospect_email:'private-profile@example.com',invitedAt:null,freezerActionAt:null,endedAt:null}),frozen('known','vibe',{historyEmail:'explicitly-shared@example.com',sender_email:'private-sender@example.com',invitationDateLabel:'Sent'})]);
 try{const unknown=archive(f).querySelector('[data-connection-id="unknown"]');assert.deepEqual(buttons(unknown),['Trash']);assert.equal((unknown.textContent.match(/Date unavailable/g)||[]).length,2);assert.equal(unknown.querySelector('time'),null);assert.doesNotMatch(f.d.querySelector('#root').textContent,/private-recipient@|private-profile@|private-sender@|private-owner@/);assert.match(archive(f).textContent,/explicitly-shared@example.com/);assert.equal(unknown.querySelector('dt').textContent,'Created');assert.equal(archive(f).querySelector('[data-connection-id="known"] dt').textContent,'Sent')}finally{f.close()}
});

test('Trash is a small bottom control; restore returns only to Freezer and keeps the block',async()=>{
 const f=fixture([frozen('pair','friend',{blockedByMe:true,blockedAt:actedAt,canBlock:false,canUnblock:true,canReinvite:false})]);
 try{assert.equal(f.d.querySelector('.socialTrash'),null);assert.equal(f.d.querySelector('.socialFreezer').nextElementSibling.className,'trashEntry');f.open('pair','trash');assert.match(f.d.querySelector('.endModal').textContent,/recoverable Trash/);await f.w.confirmEnd();assert.equal(archive(f).querySelector('.freezerItem'),null);await openTrash(f);assert.match(f.d.querySelector('.socialTrash').textContent,/Blocked by you/);assert.deepEqual(buttons(f.d.querySelector('.socialTrash')),['Restore to Freezer']);archive(f).open=false;f.open('pair','restore');assert.match(f.d.querySelector('.endModal').textContent,/never reopens chat/);await f.w.confirmEnd();assert.equal(f.d.querySelector('.socialTrash .freezerItem'),null);assert.equal(archive(f).open,true,'restored history is visible in Freezer');assert.match(archive(f).textContent,/Blocked by you/);assert.equal(f.d.querySelector('.inlineComposer'),null);assert.equal(f.d.querySelectorAll('.chempatContact').length,0);assert.equal(f.server.rows[0].blockedByMe,true);assert.doesNotMatch(f.d.querySelector('#root').textContent,/Delete forever|Empty Trash|Permanently delete/)}finally{f.close()}
});

test('only your own block can be undone; unblocking never revives any connection',async()=>{
 const f=fixture([frozen('vibe'),row('friend','friend')]);
 try{f.open('vibe','unblock');assert.equal(f.state().modal,'');f.open('vibe','block');assert.match(f.d.querySelector('.endModal').textContent,/Friend and Vibe/);await f.w.confirmEnd();assert.equal(f.d.querySelectorAll('.chempatContact').length,0);assert.equal(f.d.querySelectorAll('.socialFreezer .freezerItem').length,2);f.open('friend','unblock');assert.match(f.d.querySelector('.endModal').textContent,/only the block you placed/);await f.w.confirmEnd();assert.equal(f.d.querySelector('.inlineComposer'),null);assert.equal(f.d.querySelectorAll('.chempatContact').length,0);assert.ok(f.server.rows.every(c=>c.status==='ended'&&!c.blockedByMe))}finally{f.close()}
});

for(const kind of ['vibe','friend'])test(`${kind}: Invite again binds the same account without exposing private email or reusing chat consent`,async()=>{
 const f=fixture([frozen('pair',kind,{prospect_email:'private-profile@example.com'})]);
 try{f.w.openReinvite('pair');await flush();assert.match(f.d.querySelector('.reinviteModal').textContent,/same Duhwild account/);assert.doesNotMatch(f.d.querySelector('.reinviteModal').textContent,/private-profile@|private-owner@/);assert.equal(f.d.querySelector('.reinviteModal input'),null);assert.match(f.d.querySelector('.reinviteModal').textContent,kind==='friend'?/only after they accept/:/choose each step before chat opens/);await f.w.sendReinvite();assert.equal(f.server.rows[0].status,'ended');assert.equal(f.server.rows[1].status,'invited');assert.equal(f.server.rows[1].kind,kind);assert.equal(f.d.querySelector('.inlineComposer'),null);assert.equal(f.d.querySelector('.privateChatButton').disabled,true);assert.deepEqual(actions(f),['prepareReinvite','reinvite'])}finally{f.close()}
});

test('Invite again uses the original supplied email when no account identity is known',async()=>{
 const f=fixture([frozen('pair','friend',{historyEmail:'supplied@example.com',canBlock:false,canReport:false})]);
 try{f.server.prepared={recipient:{name:'Morgan',email:'supplied@example.com'},destination:'email',kind:'friend',canSend:true,needsAnswers:false};f.w.openReinvite('pair');await flush();assert.match(f.d.querySelector('.reinviteDestination').textContent,/supplied@example.com/);assert.doesNotMatch(f.d.querySelector('.reinviteDestination').textContent,/same Duhwild account/);await f.w.sendReinvite();assert.equal(f.server.reinvites.size,1)}finally{f.close()}
});

test('Vibe with no first five routes to real questions and cannot send automatically',async()=>{
 const f=fixture([frozen()]);
 try{f.w.eval('s.member.answers=[];s.account.answers=[]');f.server.prepared={recipient:{name:'Morgan'},destination:'member',kind:'vibe',canSend:true,needsAnswers:true};f.w.openReinvite('pair');await flush();assert.equal(f.d.querySelector('#reinviteConfirm'),null);await f.w.sendReinvite();assert.equal(f.server.reinvites.size,0);f.w.playBeforeReinvite();assert.equal(f.state().memberQuestionsOpen,true);assert.equal(f.state().modal,'');assert.deepEqual(f.state().member.answers,[]);assert.equal(actions(f).includes('reinvite'),false)}finally{f.close()}
});

test('Invite again retries a lost response with the same requestId and sends only one new invitation',async()=>{
 const f=fixture([frozen()]);
 try{f.server.failSend=true;f.w.openReinvite('pair');await flush();await f.w.sendReinvite();assert.match(f.d.querySelector('#reinviteError').textContent,/interrupted/);assert.equal(f.server.reinvites.size,1);await f.w.sendReinvite();const sends=f.server.calls.filter(c=>c.body?.action==='reinvite');assert.equal(sends.length,2);assert.equal(sends[0].body.requestId,sends[1].body.requestId);assert.equal(f.server.reinvites.size,1);assert.equal(f.state().modal,'')}finally{f.close()}
});

for(const action of ['freeze','block','unblock','trash','restore'])test(`${action}: repeated clicks and late success preserve a newer modal and its draft`,async()=>{
 const initial=action==='freeze'?row():action==='restore'?trashed():frozen('pair','friend',action==='unblock'?{blockedByMe:true,canUnblock:true,canBlock:false}:{}),f=fixture([initial]);
 try{if(action==='restore')await openTrash(f);const wait=deferred();f.w.fetch=async(url,options)=>{if(options?.method==='POST')await wait.promise;return f.fetch(url,options)};f.open('pair',action);const pending=f.w.confirmEnd();await f.w.confirmEnd();assert.ok(f.d.querySelector('#endConfirm').disabled);f.w.closeInvite();f.w.openFriendShare();f.d.querySelector('#friendName').value='New draft';f.d.querySelector('#friendEmail').value='new@example.com';wait.resolve();await pending;assert.equal(f.server.calls.filter(c=>c.body).length,1);assert.equal(f.state().modal,'friendShare');assert.equal(f.d.querySelector('#friendName').value,'New draft');assert.equal(f.d.querySelector('#friendEmail').value,'new@example.com')}finally{f.close()}
});

for(const stage of ['prepareReinvite','reinvite'])for(const change of ['modal','account'])test(`${stage}: delayed completion is isolated from a newer ${change}`,async()=>{
 const f=fixture([frozen()]);
 try{const wait=deferred();f.w.fetch=async(url,options)=>{if(options?.body&&JSON.parse(options.body).action===stage)await wait.promise;return f.fetch(url,options)};f.w.openReinvite('pair');if(stage==='reinvite')await flush();const pending=stage==='reinvite'?f.w.sendReinvite():null;if(stage==='reinvite')await f.w.sendReinvite();f.w.closeInvite();if(change==='account')f.w.eval(`s={...blank(),view:'dashboard',member:${JSON.stringify(own)},memberId:'other',account:{...${JSON.stringify(own)},id:'other'}};render()`);f.w.openFriendShare();f.d.querySelector('#friendName').value='Untouched new draft';const field=f.d.querySelector('#friendName'),before=f.state().member;wait.resolve();if(pending)await pending;await flush();assert.equal(f.d.querySelector('#friendName'),field);assert.equal(field.value,'Untouched new draft');assert.equal(f.state().modal,'friendShare');assert.deepEqual(f.state().member,before);assert.ok(f.server.calls.filter(c=>c.body?.action===stage).length<=1);if(stage==='prepareReinvite')assert.equal(f.server.reinvites.size,0)}finally{f.close()}
});

test('late failure, dismissal/reopen, and account replacement do not apply a stale action',async()=>{
 const f=fixture();
 try{let wait=deferred();f.w.fetch=async(url,options)=>{if(options?.method==='POST')await wait.promise;return f.fetch(url,options)};f.server.fail=true;f.open('pair','freeze');let pending=f.w.confirmEnd();f.w.closeInvite();f.open('pair','freeze');wait.resolve();await pending;assert.equal(f.d.querySelector('#endConfirm').disabled,false);assert.doesNotMatch(f.d.querySelector('#endError').textContent,/interrupted/);f.server.fail=false;wait=deferred();pending=f.w.confirmEnd();f.w.eval(`s={...blank(),view:'dashboard',member:${JSON.stringify(own)},memberId:'new-account',account:{...${JSON.stringify(own)},id:'new-account'}};render()`);const before=f.state();wait.resolve();await pending;assert.deepEqual(f.state(),before)}finally{f.close()}
});

test('two different pending actions keep their own target and newer modal',async()=>{
 const f=fixture([row('a','friend'),row('b','friend')]);
 try{const first=deferred(),second=deferred();f.w.fetch=async(url,options)=>{if(options?.method==='POST'){const body=JSON.parse(options.body);await(body.id==='a'?first:second).promise}return f.fetch(url,options)};f.open('a','freeze');const a=f.w.confirmEnd();f.w.closeInvite();f.open('b','freeze');const b=f.w.confirmEnd();first.resolve();await a;assert.equal(f.state().endTarget.id,'b');assert.equal(f.d.querySelector('#endConfirm').disabled,true);second.resolve();await b;assert.deepEqual(f.server.calls.filter(c=>c.body).map(c=>c.body.id),['a','b']);assert.ok(f.server.rows.every(c=>c.status==='ended'))}finally{f.close()}
});

test('old polling cannot resurrect a frozen chat; a report draft survives current polling',async()=>{
 const f=fixture();
 try{f.open('pair','report');f.d.querySelector('input[value="other"]').checked=true;f.d.querySelector('#reportNote').value='Saved report details';f.server.rows[0].messages.push({by:'prospect',text:'Poll update'});await f.w.refreshLive();assert.equal(f.d.querySelector('#reportNote').value,'Saved report details');assert.ok(f.d.querySelector('input[value="other"]').checked);f.w.closeInvite();const stale=clone(f.server.rows),wait=deferred();let once=true;f.w.fetch=async(url,options)=>{if(url.includes('inbox=1')&&once){once=false;await wait.promise;return {ok:true,json:async()=>({connections:stale})}}return f.fetch(url,options)};const polling=f.w.refreshLive();f.open('pair','freeze');const action=f.w.confirmEnd();await flush();wait.resolve();await Promise.all([polling,action]);assert.equal(f.d.querySelector('.inlineComposer'),null);assert.match(archive(f).textContent,/Frozen/)}finally{f.close()}
});

for(const destination of ['freezer','trash'])for(const view of ['dashboard','conversation'])test(`remote ${destination} closes ${view} chat even with a focused draft`,async()=>{
 const f=fixture();
 try{if(view==='conversation')f.w.eval("s.view='conversation';render()");const input=f.d.querySelector('#message');assert.ok(input);input.value='Private unsent text';input.focus();Object.assign(f.server.rows[0],{status:'ended',location:destination,freezerAction:'freeze',freezerActionAt:actedAt,endedAt:actedAt,trashedAt:destination==='trash'?actedAt:null,messages:[]});await f.w.refreshLive();assert.equal(f.d.querySelector('.inlineComposer'),null);assert.equal(f.d.querySelector('#message'),null);assert.equal(f.state().view,'dashboard');assert.equal(f.d.querySelectorAll('.chempatContact').length,0)}finally{f.close()}
});

for(const history of ['freezer','trash'])test(`${history} pagination deduplicates and discards delayed results after an action or account change`,async()=>{
 for(const outcome of ['normal','action','account']){
  const f=fixture([row(),frozen('old')],{cursor:'opaque'});
  try{const wait=deferred();f.server.next=[frozen('older'),frozen('old')];f.server.trashNext=[trashed('older')];f.w.fetch=async(url,options)=>{if(url.includes(`${history}=1`))await wait.promise;return f.fetch(url,options)};const pending=history==='freezer'?f.w.loadFreezerHistory():(f.w.toggleTrash(),flush());if(outcome==='action'){f.open('pair','freeze');await f.w.confirmEnd()}else if(outcome==='account')f.w.eval(`s={...blank(),view:'dashboard',member:${JSON.stringify(own)},memberId:'other'};render()`);wait.resolve();await pending;await flush();if(outcome==='normal'){assert.ok(f.d.querySelector('[data-connection-id="older"]'));assert.equal(f.d.querySelectorAll('[data-connection-id="old"]').length,1);assert.equal(f.server.calls.filter(c=>c.url.includes(`${history}=1`)).length,1)}else assert.equal(f.d.querySelector('[data-connection-id="older"]'),null)}finally{f.close()}
 }
});

test('token recipient actions target the original token then recover safe authenticated history',async()=>{
 const f=fixture([row('incoming','vibe','prospect')],{token:true});
 try{await f.w.refreshOutgoing();f.open('first','freeze');await f.w.confirmEnd();assert.equal(f.server.calls.find(c=>c.body)?.body.token,'original-token');assert.equal(f.server.calls.find(c=>c.body)?.body.id,undefined);assert.equal(f.d.querySelector('.inlineComposer'),null);assert.match(archive(f).textContent,/Frozen/);f.w.fetch=async(url,options)=>url.includes('?invite=')?{ok:false,status:410,json:async()=>({error:'This invitation is no longer available.'})}:f.fetch(url,options);await f.w.refreshLive();assert.equal(f.state().liveMember,true);assert.equal(f.state().liveToken,'');assert.equal(f.d.querySelector('.inlineComposer'),null)}finally{f.close()}
});

test('legacy personal hides are explicit and must end before history actions become available',async()=>{
 const f=fixture([row('legacy','friend','member',{frozenAt:actedAt,freezerAction:'freeze',freezerActionAt:actedAt,legacyFrozen:true,location:'freezer',canFreeze:true,canTrash:false,canReinvite:false,canBlock:false,canReport:false})]);
 try{assert.match(archive(f).textContent,/older hide is still connected/);assert.deepEqual(buttons(archive(f)),['End and freeze']);f.open('legacy','trash');assert.equal(f.state().modal,'');f.open('legacy','freeze');await f.w.confirmEnd();assert.equal(f.server.rows[0].status,'ended');assert.equal(f.d.querySelector('.inlineComposer'),null)}finally{f.close()}
});

test('mobile history wraps identity and keeps Freezer/Trash controls large enough to tap',()=>{
 const f=fixture([frozen('old','friend',{historyEmail:'an.extremely.long.synthetic.recipient@example.com'})]);
 try{const original=f.d.querySelector('style'),rules=[...original.sheet.cssRules],style=f.d.createElement('style');original.remove();for(const width of [320,375,700,1280]){style.textContent=rules.map(rule=>rule.type===f.w.CSSRule.MEDIA_RULE?rule.conditionText==='(max-width:700px)'&&width<=700?[...rule.cssRules].map(r=>r.cssText).join('\n'):'':rule.cssText).join('\n');f.d.head.append(style);assert.equal(f.w.getComputedStyle(f.d.querySelector('.freezerEmail')).overflowWrap,'anywhere');if(width<=700){assert.equal(f.w.getComputedStyle(f.d.querySelector('.freezerItem')).gridTemplateColumns,'minmax(0,1fr)');assert.equal(f.w.getComputedStyle(f.d.querySelector('.historyAction')).minHeight,'44px')}style.remove()}}finally{f.close()}
});

test('a reinvite idempotency key is saved before send and survives a same-account reload',async()=>{
 const f=fixture([frozen()]);
 try{f.w.openReinvite('pair');await flush();const key=f.state().reinviteAttempts['owner:pair'];assert.match(key,/^[a-f0-9]{64}$/);const saved=f.w.sessionStorage.getItem('chempatibility.walkthrough.v7');assert.equal(JSON.parse(saved).reinviteAttempts['owner:pair'],key);f.server.failSend=true;await f.w.sendReinvite();f.w.eval(`s={...blank(),...JSON.parse(${JSON.stringify(saved)})};render()`);f.w.openReinvite('pair');await flush();await f.w.sendReinvite();const sends=f.server.calls.filter(c=>c.body?.action==='reinvite');assert.equal(sends.length,2);assert.equal(sends[0].body.requestId,sends[1].body.requestId);assert.equal(f.server.reinvites.size,1)}finally{f.close()}
});

test('only explicitly permitted history photos use lazy authenticated URLs and failures remain initials',()=>{
 const f=fixture([frozen('known','friend',{prospect_photo:'',hasHistoryPhoto:true}),frozen('unknown','friend',{prospect_photo:'',prospect_name:'',hasHistoryPhoto:false,canBlock:false,canReport:false,canReinvite:false})]);
 try{const known=archive(f).querySelector('[data-connection-id="known"] img');assert.equal(known.getAttribute('src'),'/api/connection-photo?id=known');assert.equal(known.getAttribute('loading'),'lazy');assert.equal(archive(f).querySelector('[data-connection-id="unknown"] img'),null);known.dispatchEvent(new f.w.Event('error'));assert.equal(archive(f).querySelector('[data-connection-id="known"] .face').textContent,'M');f.w.eval('render()');assert.equal(archive(f).querySelector('[data-connection-id="known"] img'),null)}finally{f.close()}
});

function boundInvitationBrowser(kind,{initialAccount=null,saved,newAccount=false}={}){
 const token=`bound-${kind}`,recipient={...own,answers:kind==='friend'?[]:own.answers},wrong={...own,id:'wrong',contact:'wrong@example.com'},calls=[];let account=initialAccount,accepted=false,firstShared=false;
 const response=(body,status=200)=>({ok:status<400,status,json:async()=>clone(body)});
 const pair=()=>row('fresh-pair',kind,'prospect',{status:accepted?'chat':firstShared?'firstResults':'invited',canReport:accepted||firstShared,messages:[],prospect_member_id:accepted||firstShared?'owner':null});
 const fetch=async(url,options={})=>{
  assert.ok(url.startsWith('/api/'));const body=options.body?JSON.parse(options.body):null;calls.push({url,body,account});
  if(url==='/api/member'){
   if(!body)return account?response({member:account==='owner'?recipient:wrong}):response({},401);
   if(body.action==='code_start')return response({ok:true});
   if(body.action==='code_verify'){if(newAccount)return response({existing:false,email:body.email});account=body.email===recipient.contact?'owner':'wrong';return response({existing:true,member:account==='owner'?recipient:wrong})}
   if(body.action==='register'){account='owner';Object.assign(recipient,body,{id:'owner',verified:true});return response({member:recipient})}
   if(body.action==='logout'){account=null;return response({ok:true})}
  }
  if(url.startsWith('/api/friend?invite=')||url.startsWith('/api/connection?invite=')){
   if(!account)return kind==='friend'?response({kind:'friend',status:'signInRequired',requiresSignIn:true}):response({error:'Sign in or create your member page to open this invitation.',requiresSignIn:true},401);
   if(account!=='owner')return response({error:'This invitation is for a different account. Sign in with the account it was sent to.'},403);
   return kind==='friend'?response({kind:'friend',status:accepted?'used':'invited',name:'Morgan Sender',photo,expiresAt:'2099-01-01T00:00:00Z'}):response({id:'fresh-pair',status:firstShared?'firstResults':'invited',name:'Morgan Sender',photo,answers:[],prospectAnswers:[],recipientName:'Taylor',messages:[],invitedAt:sentAt});
  }
  if(url==='/api/connection?inbox=1')return response({connections:accepted||firstShared?[pair()]:[]});
  if(url==='/api/friend'&&body.action==='accept'){assert.equal(account,'owner');assert.equal(body.token,token);accepted=true;return response({ok:true,id:'fresh-pair',kind:'friend',status:'chat'})}
  if(url==='/api/connection'&&body.action==='first'){assert.equal(account,'owner');assert.equal(body.token,token);firstShared=true;return response({answers:Array(5).fill(1)})}
  throw Error(`Unexpected bound invitation stub ${url} ${body?.action}`);
 };
 const dom=new JSDOM(html,{url:saved?'https://auth.example/':`https://auth.example/?${kind==='friend'?'friend':'invite'}=${token}`,runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
 w.fetch=fetch;w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};if(saved)w.sessionStorage.setItem('chempatibility.walkthrough.v7',saved);
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 return {dom,w,d,calls,token,recipient,state:()=>JSON.parse(w.eval('JSON.stringify(s)')),close:()=>dom.window.close()};
}
async function signInBound(f,email=own.contact){f.w.showSignin();f.d.querySelector('#signinEmail').value=email;await f.w.signinStart();f.d.querySelector('#signinCode').value='123456';await f.w.signinVerify();await flush()}

for(const kind of ['friend','vibe'])test(`${kind}: protected reinvite survives signed-out reload, same-account sign-in, and explicit consent`,async()=>{
 const f=boundInvitationBrowser(kind);let reloaded;
 try{await flush();assert.equal(f.w.location.search,'');assert.match(f.d.querySelector('#root').textContent,/Sign in with the account/);assert.doesNotMatch(f.d.querySelector('#root').textContent,/Morgan|private-owner@/);const saved=f.w.sessionStorage.getItem('chempatibility.walkthrough.v7');reloaded=boundInvitationBrowser(kind,{saved});await flush();assert.match(reloaded.d.querySelector('#root').textContent,/Sign in with the account/);await signInBound(reloaded);assert.equal(reloaded.calls.filter(c=>c.body?.action==='register').length,0);assert.equal(reloaded.d.querySelector('.inlineComposer'),null);assert.match(reloaded.d.querySelector('#root').textContent,/Morgan/);assert.equal(reloaded.calls.filter(c=>['accept','first'].includes(c.body?.action)).length,0);if(kind==='friend'){await reloaded.w.acceptFriendInvitation();assert.ok(reloaded.d.querySelector('.inlineComposer'));assert.deepEqual(reloaded.state().member.answers,[])}else{assert.equal(reloaded.state().prospectId,'owner');assert.deepEqual(reloaded.state().prospect.answers,own.answers);await reloaded.w.startProspect();assert.equal(reloaded.state().phase,'firstResults');assert.equal(reloaded.d.querySelector('.inlineComposer'),null);assert.match(reloaded.d.querySelector('#root').textContent,/KEEP GOING/)}assert.equal(reloaded.calls.filter(c=>c.body?.action==='register').length,0)}finally{f.close();reloaded?.close()}
});

for(const kind of ['friend','vibe'])test(`${kind}: wrong account can switch to the intended account without invitation identity leakage`,async()=>{
 const f=boundInvitationBrowser(kind,{initialAccount:'wrong'});
 try{await flush();assert.match(f.d.querySelector('#root').textContent,/different account/);assert.doesNotMatch(f.d.querySelector('#root').textContent,/Morgan|private-owner@/);assert.equal(f.d.querySelector('.inlineComposer'),null);await signInBound(f);assert.match(f.d.querySelector('#root').textContent,/Morgan/);assert.equal(f.d.querySelector('.inlineComposer'),null);assert.equal(f.calls.filter(c=>c.body?.action==='register').length,0);if(kind==='friend'){await f.w.acceptFriendInvitation();assert.ok(f.d.querySelector('.inlineComposer'))}else{await f.w.startProspect();assert.equal(f.state().phase,'firstResults');assert.equal(f.d.querySelector('.inlineComposer'),null)}}finally{f.close()}
});

for(const kind of ['friend','vibe'])test(`${kind}: intended-email signup resumes the invitation without accepting or fabricating answers`,async()=>{
 const f=boundInvitationBrowser(kind,{newAccount:true});
 try{await flush();f.w.startFresh();f.d.querySelector('#joinName').value='Taylor New';f.d.querySelector('#joinContact').value=own.contact;f.d.querySelector('#joinAgree').checked=true;f.w.nextJoinStep();await flush();f.d.querySelector('#signinCode').value='123456';await f.w.signinVerify();assert.equal(f.state().joinStep,2);f.w.eval(`s.member.photo='${photo}'`);await f.w.finishRegistration();await flush();assert.equal(f.calls.filter(c=>c.body?.action==='register').length,1);assert.deepEqual(f.calls.find(c=>c.body?.action==='register').body.answers,[]);assert.equal(f.calls.filter(c=>['accept','first'].includes(c.body?.action)).length,0);assert.equal(f.d.querySelector('.inlineComposer'),null);assert.match(f.d.querySelector('#root').textContent,/Morgan/);if(kind==='friend'){await f.w.acceptFriendInvitation();assert.ok(f.d.querySelector('.inlineComposer'));assert.deepEqual(f.state().member.answers,[])}else{assert.deepEqual(f.state().prospect.answers,[]);await f.w.startProspect();assert.equal(f.state().prospectQuestionsOpen,true);assert.equal(f.d.querySelector('.inlineComposer'),null)}}finally{f.close()}
});


test('closed Freezer exposes history and pagination on demand and keeps its loaded count accurate',async()=>{
 const f=fixture([frozen('first')],{cursor:'older'});try{
  assert.equal(archive(f).open,false);assert.equal(archive(f).querySelector('.dashboardDisclosureCount').textContent,'1+');
  archive(f).querySelector('summary').click();assert.equal(archive(f).open,true);assert.ok(archive(f).querySelector('[data-connection-id="first"]'));assert.ok(archive(f).querySelector('.historyAction'));
  f.server.next=[frozen('second')];f.server.nextCursor=null;await f.w.loadFreezerHistory();
  assert.equal(archive(f).open,true);assert.equal(archive(f).querySelector('.dashboardDisclosureCount').textContent,'2');assert.equal(archive(f).querySelector('.loadFreezer'),null);
  archive(f).querySelector('summary').click();f.w.eval('render(true)');assert.equal(archive(f).open,false);
 }finally{f.close()}
});

test('a dismissed pending freeze updates history without reopening a deliberately closed Freezer',async()=>{
 const f=fixture([row()]);try{
  const hold=deferred();f.w.fetch=async(url,options)=>{if(options?.body&&JSON.parse(options.body).action==='freeze')await hold.promise;return f.fetch(url,options)};
  f.open('pair','freeze');const pending=f.w.confirmEnd();f.w.closeInvite();hold.resolve();await pending;
  assert.equal(archive(f).open,false);assert.equal(archive(f).querySelector('.dashboardDisclosureCount').textContent,'1');assert.ok(archive(f).querySelector('[data-connection-id="pair"]'));
 }finally{f.close()}
});
