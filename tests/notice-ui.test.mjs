import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const key='chempatibility.walkthrough.v7',photo='data:image/jpeg;base64,AA==';
const own={id:'owner',name:'Taylor',contact:'owner@example.com',photo,answers:Array(10).fill(0),verified:true};
const clone=value=>JSON.parse(JSON.stringify(value));
const row=(id='active',overrides={})=>({id,kind:'vibe',channel:'email',side:'member',status:'chat',location:'active',prospect_name:'Morgan',prospect_photo:photo,prospect_answers:own.answers,own_answers:own.answers,messages:[],canFreeze:true,canTrash:false,canRestore:false,canBlock:true,canUnblock:false,canReport:true,canReinvite:false,...overrides});
const frozen=(id='history',overrides={})=>row(id,{status:'ended',location:'freezer',freezerAction:'freeze',canFreeze:false,canTrash:true,canReinvite:true,...overrides});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:()=>resolve()}};

function fakeClock(w){
 let now=0,next=0;const timers=new Map();
 w.setTimeout=(callback,delay=0,...args)=>{const id=++next;timers.set(id,{id,due:now+delay,delay,callback:()=>callback(...args),cancelled:false,ran:false});return id};
 w.clearTimeout=id=>{const timer=timers.get(id);if(timer)timer.cancelled=true};w.setInterval=()=>0;
 return {timers,active:()=>[...timers.values()].filter(t=>!t.cancelled&&!t.ran),tick(ms){const end=now+ms;let timer;while((timer=[...timers.values()].filter(t=>!t.cancelled&&!t.ran&&t.due<=end).sort((a,b)=>a.due-b.due||a.id-b.id)[0])){now=timer.due;timer.ran=true;timer.callback()}now=end},last:()=>timers.get(next),force:id=>timers.get(id).callback()};
}

function fixture(rows=[frozen(),row()],{saved}={}){
 const dom=new JSDOM(html,{url:'https://notice.example/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document,clock=fakeClock(w);
 const server={rows:clone(rows),calls:[],fail:false},response=(data,status=200)=>({ok:status<400,status,json:async()=>clone(data)});
 w.fetch=async()=>response({},401);w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 if(saved)w.sessionStorage.setItem(key,JSON.stringify(saved));
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 if(!saved)w.eval(`s={...blank(),view:'dashboard',member:${JSON.stringify(own)},memberId:'owner',account:${JSON.stringify(own)},liveMember:true,inbox:${JSON.stringify(rows.filter(c=>c.location!=='trash'))},trashRows:${JSON.stringify(rows.filter(c=>c.location==='trash'))},selectedChempat:'active',phase:'chat'};render()`);
 const fetch=async(url,options={})=>{
  assert.ok(url.startsWith('/api/'),'all network requests use isolated local stubs');const body=options.body?JSON.parse(options.body):null;server.calls.push({url,body});
  if(url==='/api/member'&&body?.action==='logout')return response({ok:true});
  if(url==='/api/connection?inbox=1')return server.fail?response({error:'Connections could not be loaded.'},503):response({connections:server.rows.filter(c=>c.location!=='trash')});
  if(url.startsWith('/api/connection?trash='))return response({connections:server.rows.filter(c=>c.location==='trash')});
  if(url==='/api/friend'&&body?.action==='create')return response({id:'new-friend',token:'synthetic-friend-token',recipient:body.recipient,expiresAt:'2099-01-01T00:00:00Z'});
  assert.equal(url,'/api/connection');if(server.fail)return response({error:'The change was interrupted. Try again.'},503);
  const target=server.rows.find(c=>c.id===body.id);assert.ok(target,'action keeps its requested target');
  if(body.action==='prepareReinvite')return response({kind:'vibe',canSend:true,needsAnswers:false,destination:'member',recipient:{name:'Morgan'}});
  if(body.action==='reinvite')return response({ok:true,id:'new-vibe',kind:'vibe'});
  if(['freeze','block','report'].includes(body.action))Object.assign(target,{status:'ended',location:'freezer',canFreeze:false,canTrash:true,canReinvite:true,messages:[]});
  if(body.action==='trash')Object.assign(target,{location:'trash',trashedAt:'2026-10-01T12:00:00Z',canTrash:false,canRestore:true});
  if(body.action==='restore')Object.assign(target,{location:'freezer',trashedAt:null,canTrash:true,canRestore:false});
  if(body.action==='block')Object.assign(target,{blockedByMe:true,canBlock:false,canUnblock:true});
  if(body.action==='unblock')Object.assign(target,{blockedByMe:false,canBlock:true,canUnblock:false});
  return response({ok:true,connection:target});
 };
 w.fetch=fetch;
 return {w,d,clock,server,fetch,state:()=>clone(w.eval('s')),saved:()=>JSON.parse(w.sessionStorage.getItem(key)),notice:()=>d.querySelector('#root > .notice'),close:()=>w.close()};
}

async function action(f,kind='trash',id='history'){
 f.w.openEnd(id,kind);assert.equal(f.state().modal,'end');
 if(kind==='report')f.d.querySelector('input[name="reportReason"][value="other"]').checked=true;
 await f.w.confirmEnd();assert.equal(f.state().modal,'');assert.ok(f.notice());
}

for(const kind of ['freeze','trash','block','unblock','restore','report'])test(`${kind} success expires at five seconds and is never persisted`,async()=>{
 const target=kind==='freeze'||kind==='report'?row('history'):kind==='restore'?frozen('history',{location:'trash',trashedAt:'2026-10-01T12:00:00Z',canRestore:true,canTrash:false}):frozen('history',kind==='unblock'?{blockedByMe:true,canBlock:false,canUnblock:true}:{}),f=fixture([target,row()]);
 try{await action(f,kind);const text=f.state().notice;assert.equal(f.notice().getAttribute('role'),'status');assert.equal(f.saved().notice,'');f.clock.tick(4999);assert.equal(f.notice().textContent,text);f.clock.tick(1);assert.equal(f.notice(),null);assert.equal(f.state().notice,'');assert.equal(f.saved().notice,'')}finally{f.close()}
});

test('reinvite confirmation follows the five-second lifecycle',async()=>{
 const f=fixture();try{f.w.openReinvite('history');await flush();await f.w.sendReinvite();assert.match(f.notice().textContent,/New Vibe invitation sent/);assert.equal(f.saved().notice,'');f.clock.tick(5000);assert.equal(f.notice(),null)}finally{f.close()}
});

for(const selector of ['.chempatPerson','.secretsButton','.privateChatButton','.trashLink','.navHome','.socialSecrets summary','.connectionMenuTrigger','#message'])test(`next selection ${selector} clears the success before its timer`,async()=>{
 const f=fixture();try{await action(f);f.clock.tick(20);f.d.querySelector(selector).click();assert.equal(f.notice(),null);assert.equal(f.state().notice,'');assert.equal(f.clock.active().filter(t=>t.delay===5000).length,0);await flush()}finally{f.close()}
});

test('typing and clicks outside app controls leave the confirmation until expiry',async()=>{
 const f=fixture();try{await action(f);const input=f.d.querySelector('#message');input.value='Draft stays';input.dispatchEvent(new f.w.Event('input',{bubbles:true}));input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'x',bubbles:true}));f.d.body.click();f.d.querySelector('.socialMemberHeader h1').click();assert.ok(f.notice());f.clock.tick(5000);assert.equal(f.notice(),null);assert.equal(f.d.querySelector('#message'),input);assert.equal(input.value,'Draft stays')}finally{f.close()}
});

test('keyboard-generated control clicks dismiss the success',async()=>{
 const f=fixture();try{await action(f);const control=f.d.querySelector('.socialSecrets summary');control.focus();control.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));control.dispatchEvent(new f.w.MouseEvent('click',{bubbles:true,detail:0}));assert.equal(f.notice(),null);assert.equal(f.clock.active().filter(t=>t.delay===5000).length,0)}finally{f.close()}
});

test('pagehide clears owned success for BFCache return and preserves persistent errors',async()=>{
 const f=fixture();try{await action(f);const timer=f.clock.last();f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));assert.equal(f.notice(),null);assert.equal(f.state().notice,'');assert.equal(f.saved().notice,'');assert.equal(f.clock.active().filter(t=>t.delay===5000).length,0);f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));assert.equal(f.notice(),null);f.w.eval("setNotice('Connections could not be loaded.');render()");f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide',{persisted:true}));f.clock.force(timer.id);assert.equal(f.notice().textContent,'Connections could not be loaded.');assert.equal(f.saved().notice,'Connections could not be loaded.')}finally{f.close()}
});

test('expiry changes only the notice, preserving composer focus, selection, and newer modal drafts',async()=>{
 const f=fixture();try{await action(f);const input=f.d.querySelector('#message');input.value='Unsent text';input.focus();input.setSelectionRange(2,6);const focus=f.d.querySelector('#connectionPanel');f.clock.tick(5000);assert.equal(f.d.querySelector('#message'),input);assert.equal(f.d.activeElement,input);assert.equal(input.value,'Unsent text');assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,6);assert.equal(f.d.querySelector('#connectionPanel'),focus);
  f.w.openFriendShare();const field=f.d.querySelector('#friendName');field.value='New form draft';f.w.eval("showActionNotice(ACTION_NOTICES.trash);render(true)");assert.equal(f.d.querySelector('#friendName'),field);f.clock.tick(5000);assert.equal(f.d.querySelector('#friendName'),field);assert.equal(field.value,'New form draft');assert.equal(f.state().modal,'friendShare');assert.equal(f.notice(),null)
 }finally{f.close()}
});

for(const sameText of [true,false])test(`stale timer cannot clear a newer ${sameText?'same-text':'different'} confirmation`,async()=>{
 const f=fixture();try{await action(f);const old=f.clock.last();f.clock.tick(1000);f.w.eval(`showActionNotice(ACTION_NOTICES.${sameText?'trash':'freeze'});render()`);const text=f.state().notice;f.clock.force(old.id);assert.equal(f.notice().textContent,text);f.clock.tick(4000);assert.equal(f.notice().textContent,text);f.clock.tick(1000);assert.equal(f.notice(),null)}finally{f.close()}
});

test('a persistent replacement, including identical text, cannot inherit a success timer',async()=>{
 const f=fixture();try{await action(f);const old=f.clock.last(),text=f.state().notice;f.w.eval(`setNotice(${JSON.stringify(text)});render()`);f.clock.force(old.id);f.clock.tick(10000);f.d.querySelector('#message').click();assert.equal(f.notice().textContent,text);assert.equal(f.saved().notice,text);f.w.eval("setNotice('A required step failed.');render()");f.clock.tick(10000);assert.equal(f.notice().textContent,'A required step failed.')}finally{f.close()}
});

test('network notices and report validation remain until resolved',async()=>{
 const f=fixture();try{await action(f);const old=f.clock.last();f.server.fail=true;await f.w.refreshLive();assert.equal(f.notice().textContent,'Connections could not be loaded.');f.clock.force(old.id);f.clock.tick(10000);f.d.querySelector('#message').click();assert.equal(f.notice().textContent,'Connections could not be loaded.');assert.equal(f.saved().notice,'Connections could not be loaded.');f.server.fail=false;f.w.openEnd('active','report');await f.w.confirmEnd();assert.equal(f.d.querySelector('#endError').textContent,'Choose what happened.');f.clock.tick(10000);assert.equal(f.d.querySelector('#endError').textContent,'Choose what happened.');f.d.querySelector('input[value="other"]').checked=true;f.server.fail=true;await f.w.confirmEnd();f.clock.tick(10000);assert.equal(f.d.querySelector('#endError').textContent,'The change was interrupted. Try again.')}finally{f.close()}
});

for(const change of ['navigation','logout','replacement','same-state account'])test(`${change} cancels the previous notice ownership`,async()=>{
 const f=fixture();try{await action(f);const old=f.clock.last();
  if(change==='navigation')f.w.goHome();
  else if(change==='logout'){f.w.confirmLogout();await f.w.logout()}
  else if(change==='replacement')f.w.eval(`s={...blank(),view:'dashboard',member:${JSON.stringify(own)},memberId:'new-owner',account:{...${JSON.stringify(own)},id:'new-owner'}};render()`);
  else f.w.eval("s.account.id='new-owner';s.memberId='new-owner';render()");
  assert.equal(f.notice(),null);assert.equal(f.clock.active().filter(t=>t.delay===5000).length,0);f.w.eval("setNotice('New account or page notice.');render()");f.clock.force(old.id);f.clock.tick(10000);assert.equal(f.notice().textContent,'New account or page notice.')
 }finally{f.close()}
});

test('late action completion leaves a newer modal and its draft alone',async()=>{
 const f=fixture();try{const wait=deferred();f.w.fetch=async(url,options)=>{if(options?.method==='POST')await wait.promise;return f.fetch(url,options)};f.w.openEnd('history','trash');const pending=f.w.confirmEnd();f.w.closeInvite();f.w.openFriendShare();const field=f.d.querySelector('#friendName');field.value='Newer draft';wait.resolve();await pending;assert.equal(f.d.querySelector('#friendName'),field);assert.equal(field.value,'Newer draft');assert.equal(f.state().modal,'friendShare');assert.equal(f.notice(),null);assert.equal(f.clock.active().filter(t=>t.delay===5000).length,0)}finally{f.close()}
});

for(const notice of ['Record moved to your Trash.','New Vibe invitation sent. They need to accept again.','Connections could not be loaded.'])test(`reload handles stored notice: ${notice}`,()=>{
 const saved={view:'dashboard',member:own,memberId:'owner',account:own,notice},f=fixture([],{saved});
 try{const isError=notice==='Connections could not be loaded.';assert.equal(f.state().notice,isError?notice:'');assert.equal(f.saved().notice,isError?notice:'');f.clock.tick(10000);assert.equal(f.notice()?.textContent||'',isError?notice:'')}finally{f.close()}
});

test('friend-send confirmation retains its existing 1.8-second duration and modal behavior',async()=>{
 const f=fixture();try{f.w.openFriendShare();f.d.querySelector('#friendName').value='Morgan';f.d.querySelector('#friendEmail').value='morgan@example.com';await f.w.makeFriendInvitation();assert.equal(f.notice().textContent,'Invite sent to Morgan.');f.w.openFriendShare();const field=f.d.querySelector('#friendName');field.value='Next friend';f.clock.tick(1799);assert.ok(f.notice());f.clock.tick(1);assert.equal(f.notice(),null);assert.equal(f.d.querySelector('#friendName'),field);assert.equal(field.value,'Next friend');assert.equal(f.state().modal,'friendShare')}finally{f.close()}
});
