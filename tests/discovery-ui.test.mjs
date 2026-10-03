import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {MODULES as shippedModules} from '../api/_discovery-modules.mjs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const key='chempatibility.walkthrough.v7';
const clone=value=>JSON.parse(JSON.stringify(value));
const photo='data:image/jpeg;base64,AA==';
const own={id:'owner',name:'Taylor',contact:'owner@example.test',photo,answers:Array(10).fill(0),verified:true};
const row=(id='alpha',overrides={})=>({id,kind:'vibe',channel:'email',side:'member',status:'chat',location:'active',prospect_name:id==='alpha'?'Morgan':'Riley',prospect_photo:photo,prospect_answers:own.answers,own_answers:own.answers,messages:[],canFreeze:true,...overrides});
const modules=[{id:'feel-loved',version:1,title:'Feel Loved',description:'Small ways to feel cared for.',questions:Array.from({length:10},(_,i)=>({id:`care-${i}`,text:`Private question ${i+1}?`})),scale:['Not like me','A little','Sometimes','Often','Very like me'].map((label,i)=>({value:i+1,label}))},{id:'closeness',version:1,title:'Closeness',description:'Your pace and preferences.',questions:Array.from({length:20},(_,i)=>({id:`close-${i}`,text:`Closeness question ${i+1}?`})),scale:[1,2,3,4,5].map(value=>({value,label:String(value)}))}];
const result={summary:'I appreciate care in small moments.',dimensions:[{id:'care',label:'Care in action',score:8,maxScore:10,description:'A starting point for a conversation.'}],caution:'A reflection, not a diagnosis.'};
const otherResult={summary:'OTHER PRIVATE RESULT',dimensions:[]};
const piece={moduleId:'feel-loved',version:1,title:'Feel Loved',result,completedAt:'2026-10-01T12:00:00Z'};
const answers=Object.fromEntries(modules[0].questions.map(q=>[q.id,4]));
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve))};
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve}};
const response=(data,status=200)=>({ok:status<400,status,json:async()=>clone(data)});

async function fixture({rows=[row(),row('beta')],pieces=[],games=[],saved,actor='member',catalog=modules}={}){
 const dom=new JSDOM(html,{url:'https://discovery.example.test/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
 const server={rows:clone(rows),pieces:clone(pieces),pairs:new Map(rows.map(r=>[r.id,clone(games)])),calls:[],drafts:new Map(),failGet:false,failPost:false,hold:null};
 w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.fetch=async(url,options={})=>{
  const requestOwner=w.eval('activeMemberId()');const body=options.body?JSON.parse(options.body):null;server.calls.push({url,body});
  if(url==='/api/member'&&body?.action==='logout')return response({ok:true});
  if(url==='/api/connection?inbox=1')return response({connections:server.rows});
  if(!url.startsWith('/api/discovery'))return response({},401);
  if(server.hold){const hold=server.hold;server.hold=null;await hold.promise}
  if(body&&server.failPost)return response({error:'Connection interrupted. Try again.'},503);
  if(!body&&server.failGet)return response({error:'Games are temporarily unavailable.'},503);
  if(url.includes('pieces=1'))return response({pieces:requestOwner==='owner'?server.pieces:[]});
  const id=body?.connectionId||new URL(url,'https://discovery.example.test').searchParams.get('connection');
  assert.ok(server.pairs.has(id),'requests stay within a fixture connection');
  const list=server.pairs.get(id),module=catalog.find(m=>m.id===body?.moduleId&&(body.version===undefined||String(m.version)===String(body.version)));
  if(body){
   let game=list.find(g=>g.moduleId===body.moduleId&&String(g.version)===String(body.version));
   if(!game){game={moduleId:module.id,version:module.version,title:module.title,own:{started:false,answers:{},result:null,completed:false,consent:false},other:{started:false,completed:false,consent:false},revealed:false};list.push(game)}
   if(!game.own?.started)game.own={started:true,answers:{},result:null,completed:false,consent:false};
   if(['save','complete'].includes(body.action)){const key=`${module.id}:${module.version}`,draft=server.drafts.get(key)||{answers:{},revision:0};if(body.draftRevision!==draft.revision)return response({error:'Your saved answers changed in another tab. Review and save again.',draftConflict:true},409);server.drafts.set(key,{answers:clone(body.answers),revision:draft.revision+1});game.own.answers=body.answers;}
   if(body.action==='complete'){game.own.completed=true;game.own.result=result;if(!server.pieces.some(p=>p.moduleId===module.id))server.pieces.push({...piece,moduleId:module.id,title:module.title})}
   if(body.action==='reuse'){game.own.completed=true;game.own.result=server.pieces.find(p=>p.moduleId===module.id).result;game.own.consent=true}
   if(body.action==='share')game.own.consent=true;
   if(game.own.completed&&game.own.consent&&game.other.completed&&game.other.consent){game.revealed=true;game.sharedResults={own:game.own.result,other:otherResult}}
  }
  return response({modules:catalog,games:list.map(g=>{const draft=server.drafts.get(`${g.moduleId}:${g.version}`);return {...g,own:{...g.own,answers:draft?.answers||g.own?.answers||{},draftRevision:draft?.revision||0}}}),pieces:server.pieces});
 };
 if(saved)w.sessionStorage.setItem(key,JSON.stringify(saved));
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 if(!saved){
  if(actor==='prospect')w.eval(`s={...blank(),view:'dashboard',actor:'prospect',member:{name:'Morgan',answers:Array(10).fill(0)},prospect:${JSON.stringify({...own,email:own.contact})},prospectId:'owner',liveId:'alpha',liveInvite:true,liveToken:'test-token',selectedChempat:'first',phase:'chat',firstConnection:{location:'active'},messages:[]};render()`);
  else w.eval(`s={...blank(),view:'dashboard',member:${JSON.stringify(own)},memberId:'owner',account:${JSON.stringify(own)},liveMember:true,inbox:${JSON.stringify(rows.filter(r=>r.kind!=='friend'))},friends:${JSON.stringify(rows.filter(r=>r.kind==='friend'))},selectedChempat:'alpha',phase:'chat'};render()`);
 }
 await flush();
 return {w,d,server,state:()=>clone(w.eval('s')),saved:()=>JSON.parse(w.sessionStorage.getItem(key)),posts:()=>server.calls.filter(c=>c.body&&c.url==='/api/discovery').map(c=>c.body),close:()=>w.close()};
}
async function open(f,id='alpha',moduleId='feel-loved'){f.w.openDiscoveryPicker(id);await flush();f.w.openDiscoveryGame(id,moduleId)}
async function start(f){await open(f);await f.w.discoveryAction('start')}
function answer(f,module=modules[0]){for(const q of module.questions)f.w.chooseDiscoveryAnswer(q.id,4)}
const completedGame=(overrides={})=>({moduleId:'feel-loved',version:1,title:'Feel Loved',own:{started:true,answers,result,completed:true,consent:false},other:{started:false,completed:false,consent:false},revealed:false,...overrides});

test('games are optional, authenticated, and only appear on active romantic chat',async()=>{
 const f=await fixture({rows:[row(),row('friend',{kind:'friend',channel:'friend'}),row('closed',{status:'secondFive'}),row('ended',{status:'ended',location:'freezer'})]});
 try{
  assert.match(f.d.querySelector('#connectionGames').textContent,/Add a game/);assert.ok(f.d.querySelector('#message'),'chat remains usable');assert.equal(f.posts().length,0);
  assert.match(f.d.querySelector('#earnedPieces').textContent,/Only you/);
  for(const id of ['friend','closed']){f.w.selectChempat(id);assert.equal(f.d.querySelector('#connectionGames'),null);f.w.openDiscoveryPicker(id);assert.equal(f.state().modal,'')}
  f.w.openDiscoveryPicker('ended');assert.equal(f.state().modal,'');
  f.w.eval("s=blank();render()");assert.equal(f.d.querySelector('#earnedPieces'),null);assert.equal(f.d.querySelector('#connectionGames'),null);
 }finally{f.close()}
});

test('start, save, resume, completion and separate explicit sharing',async()=>{
 const f=await fixture();try{
  await start(f);assert.equal(f.posts()[0].action,'start');assert.equal(f.d.querySelectorAll('.discoveryQuestions fieldset').length,10);assert.match(f.d.querySelector('.discoveryModal').textContent,/Just your answers/);
  f.w.chooseDiscoveryAnswer('care-0',5);await f.w.discoveryAction('save');assert.deepEqual(f.posts()[1].answers,{'care-0':5});assert.match(f.d.querySelector('#discoverySaveStatus').textContent,/Progress saved/);
  f.w.closeInvite();await open(f);assert.equal(f.d.querySelector('input[name="discovery-0"]:checked').value,'5');
  const before=f.posts().length;await f.w.discoveryAction('complete');assert.equal(f.posts().length,before);assert.match(f.d.querySelector('#discoveryError').textContent,/every question/);
  answer(f);await f.w.discoveryAction('complete');assert.equal(f.posts().at(-1).action,'complete');assert.equal(f.server.pairs.get('alpha')[0].own.consent,false);assert.match(f.d.querySelector('#earnedPieces').textContent,/care in small moments/);assert.match(f.d.querySelector('.discoveryModal').textContent,/haven’t shared/);
  const saved=JSON.stringify(f.saved());assert.ok(!saved.includes('care-0'));assert.ok(!saved.includes(result.summary),'private results are not persisted in browser walkthrough');
  await f.w.discoveryAction('share');assert.equal(f.posts().at(-1).action,'complete','direct share action is rejected outside the consent screen');
  f.w.discoveryScreen('share');assert.match(f.d.querySelector('.discoveryPrivacy').textContent,/individual answers stay private/);assert.equal(f.posts().at(-1).action,'complete');
  await f.w.discoveryAction('share');assert.equal(f.posts().at(-1).action,'share');assert.equal(f.server.pairs.get('alpha')[0].own.consent,true);assert.ok(!f.d.body.textContent.includes(otherResult.summary));assert.ok(f.d.querySelector('#message'));
 }finally{f.close()}
});

test('existing piece is shown privately and reuse requires a separate explicit offer',async()=>{
 const f=await fixture({pieces:[piece]});try{
  assert.match(f.d.querySelector('#earnedPieces').textContent,/care in small moments/);assert.equal(f.server.pairs.get('alpha').length,0);
  await open(f);assert.match(f.d.querySelector('.discoveryModal').textContent,/already earned/);assert.equal(f.posts().length,0);
  f.w.discoveryScreen('reuse');assert.match(f.d.querySelector('.discoveryModal').textContent,/offers your saved result to Morgan/);assert.equal(f.posts().length,0);
  await f.w.discoveryAction('reuse');assert.equal(f.posts().length,1);assert.equal(f.posts()[0].action,'reuse');assert.equal(f.posts()[0].connectionId,'alpha');assert.equal(f.server.pairs.get('alpha')[0].own.consent,true);
  f.w.closeInvite();f.w.selectChempat('beta');await flush();assert.equal(f.server.pairs.get('beta').length,0);assert.ok(!f.d.querySelector('#connectionGames').textContent.includes('Both pieces shared'));
 }finally{f.close()}
});

test('other results render only with the explicit backend reveal grant',async()=>{
 const game=completedGame({sharedResults:{own:result,other:otherResult}}),f=await fixture({games:[game],pieces:[piece]});try{
  await open(f);assert.ok(!f.d.body.textContent.includes(otherResult.summary));
  f.server.pairs.get('alpha')[0].revealed=true;await f.w.loadDiscovery('alpha',true);assert.ok(f.d.querySelector('.discoveryComparison'));assert.match(f.d.querySelector('.discoveryComparison').textContent,/OTHER PRIVATE RESULT/);
 }finally{f.close()}
});

test('an invitation from the other person allows private opt-in without sharing',async()=>{
 const game=completedGame({own:{started:false,answers:{},result:null,completed:false,consent:false},other:{started:true,completed:false,consent:false}}),f=await fixture({games:[game]});try{
  assert.match(f.d.querySelector('#connectionGames').textContent,/Morgan added this game/);await open(f);assert.match(f.d.querySelector('.discoveryModal').textContent,/Start my private answers/);assert.equal(f.posts().length,0);await f.w.discoveryAction('start');assert.equal(f.server.pairs.get('alpha')[0].own.consent,false);
 }finally{f.close()}
});

test('question counts and escaped module/result content come from the API',async()=>{
 const f=await fixture();try{
  await open(f,'alpha','closeness');await f.w.discoveryAction('start');assert.equal(f.d.querySelectorAll('.discoveryQuestions fieldset').length,20);assert.equal(f.d.querySelectorAll('.discoveryScale input').length,100);assert.match(f.d.querySelector('#discoveryAnswerCount').textContent,/of 20/);
  const unsafe='<img src=x onerror=alert(1)>';assert.match(f.w.renderDiscoveryResult({summary:unsafe,dimensions:[{label:unsafe,description:unsafe,score:2,maxScore:5}],caution:unsafe}),/&lt;img/);assert.ok(!f.w.renderDiscoveryResult({summary:unsafe}).includes('<img'));
 }finally{f.close()}
});

test('double submits produce one mutation and closing a pending save cannot reopen it',async()=>{
 const f=await fixture();try{
  await start(f);answer(f);const hold=deferred();f.server.hold=hold;const one=f.w.discoveryAction('save'),two=f.w.discoveryAction('save');assert.equal(f.posts().filter(p=>p.action==='save').length,1);assert.ok(f.d.querySelector('.discoveryFormActions button').disabled);
  f.w.closeInvite();assert.equal(f.state().modal,'');hold.resolve();await Promise.all([one,two]);assert.equal(f.state().modal,'');assert.equal(f.d.querySelector('.discoveryModal'),null);
  await open(f);assert.equal(f.d.querySelectorAll('.discoveryScale input:checked').length,10);
 }finally{f.close()}
});

test('pending action never appears on a newer connection or overwrites another modal',async()=>{
 const f=await fixture();try{
  await open(f);const hold=deferred();f.server.hold=hold;const request=f.w.discoveryAction('start');f.w.selectChempat('beta');await flush();assert.equal(f.state().modal,'');f.w.openFriendShare();const modal=f.d.querySelector('#modalHost').innerHTML;hold.resolve();await request;assert.equal(f.state().modal,'friendShare');assert.equal(f.d.querySelector('#modalHost').innerHTML,modal);assert.equal(f.d.querySelector('#connectionGames').dataset.connection,'beta');assert.equal(f.server.pairs.get('beta').length,0);
 }finally{f.close()}
});

test('stale read and mutation cannot expose an old account’s pieces after logout',async()=>{
 const f=await fixture();try{
  await start(f);answer(f);const hold=deferred();f.server.hold=hold;const request=f.w.discoveryAction('complete');f.w.eval("s={...blank(),view:'dashboard',memberId:'new-owner',member:{name:'New',answers:[]},liveMember:true};render()");hold.resolve();await request;assert.ok(!f.d.body.textContent.includes(result.summary));assert.ok(!f.d.body.textContent.includes(otherResult.summary));assert.equal(f.state().memberId,'new-owner');
 }finally{f.close()}
});

test('GET and POST errors have retries without blocking chat or discarding answers',async()=>{
 const f=await fixture();try{
  f.server.failGet=true;await f.w.loadDiscovery('alpha',true);assert.match(f.d.querySelector('#connectionGames').textContent,/temporarily unavailable/);assert.ok(f.d.querySelector('#message'));f.server.failGet=false;await f.w.loadDiscovery('alpha',true);
  await start(f);f.w.chooseDiscoveryAnswer('care-0',3);f.server.failPost=true;await f.w.discoveryAction('save');assert.match(f.d.querySelector('#discoveryError').textContent,/interrupted/);assert.equal(f.d.querySelector('input[name="discovery-0"]:checked').value,'3');assert.equal(f.d.querySelector('.discoveryFormActions button').disabled,false);f.server.failPost=false;await f.w.discoveryAction('save');assert.match(f.d.querySelector('#discoverySaveStatus').textContent,/Progress saved/);
 }finally{f.close()}
});

test('Escape and backdrop dismiss the game; unsaved answers survive reopening within this tab',async()=>{
 const f=await fixture();try{
  await start(f);f.w.chooseDiscoveryAnswer('care-0',2);f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.state().modal,'');await open(f);assert.equal(f.d.querySelector('input[name="discovery-0"]:checked').value,'2');f.d.querySelector('.discoveryModal').click();assert.equal(f.state().modal,'discovery');f.d.querySelector('.modalBackdrop').click();assert.equal(f.state().modal,'');
 }finally{f.close()}
});

test('connection ending hides the game and invalidates an open result',async()=>{
 const f=await fixture({games:[completedGame()]});try{
  await open(f);assert.ok(f.d.querySelector('.discoveryModal'));f.w.eval("s.inbox.find(c=>c.id==='alpha').status='ended';render(true)");assert.equal(f.state().modal,'');assert.ok(!f.d.querySelector('.discoveryModal'));assert.ok(!f.d.querySelector('#connectionGames')||f.d.querySelector('#connectionGames').dataset.connection==='beta');
 }finally{f.close()}
});

test('prospect first-connection alias always sends the real connection ID',async()=>{
 const f=await fixture({actor:'prospect'});try{
  await open(f,'first');await f.w.discoveryAction('start');assert.equal(f.posts()[0].connectionId,'alpha');assert.ok(!f.server.calls.some(c=>c.url==='/api/discovery?connection=first'));
 }finally{f.close()}
});

test('game notes are distinct from participant messages and escape text',async()=>{
 const f=await fixture({rows:[row('alpha',{messages:[{by:'system',gameEvent:'started',id:'note',text:'<script>game</script> was added'},{by:'prospect',text:'Hello'}]})]});try{
  const note=f.d.querySelector('.chatGameNote');assert.ok(note);assert.match(note.textContent,/Connection game/);assert.equal(note.querySelector('script'),null);assert.match(f.d.querySelector('.inlineMessage').textContent,/Hello/);
 }finally{f.close()}
});

test('closing and reopening while a request is pending cannot leave disabled controls behind',async()=>{
 const f=await fixture();try{
  await open(f);const hold=deferred();f.server.hold=hold;const request=f.w.discoveryAction('start');f.w.closeInvite();f.w.openDiscoveryPicker('alpha');assert.ok(f.d.querySelector('.discoveryPicker button').disabled);hold.resolve();await request;assert.equal(f.d.querySelector('.discoveryPicker button').disabled,false);f.w.openDiscoveryGame('alpha','feel-loved');assert.equal(f.d.querySelectorAll('.discoveryQuestions fieldset').length,10);
 }finally{f.close()}
});

test('private pieces response captured before completion cannot erase the newly earned piece',async()=>{
 const f=await fixture();try{
  await start(f);const original=f.w.fetch,hold=deferred();f.w.fetch=async(url,options)=>{const captured=await original(url,options);if(url.includes('pieces=1'))await hold.promise;return captured};const stale=f.w.loadDiscoveryPieces(true);await flush();answer(f);await f.w.discoveryAction('complete');assert.match(f.d.querySelector('#earnedPieces').textContent,/care in small moments/);hold.resolve();await stale;assert.match(f.d.querySelector('#earnedPieces').textContent,/care in small moments/);
 }finally{f.close()}
});

test('read captured before a mutation cannot overwrite the completed game',async()=>{
 const f=await fixture();try{
  await start(f);const original=f.w.fetch,hold=deferred();f.w.fetch=async(url,options)=>{const captured=await original(url,options);if(url.includes('connection=alpha')){const body=await captured.json();await hold.promise;return response(body)}return captured};const stale=f.w.loadDiscovery('alpha',true);await flush();answer(f);await f.w.discoveryAction('complete');hold.resolve();await stale;assert.match(f.d.querySelector('#connectionGames').textContent,/Your piece is earned/);assert.match(f.d.querySelector('.discoveryModal').textContent,/haven’t shared/);
 }finally{f.close()}
});

test('piece reuse is the only offer path once earned, including an unfinished invitation',async()=>{
 const f=await fixture({pieces:[piece],games:[completedGame({own:{started:true,answers:{},result:null,completed:false,consent:false}})]});try{
  await open(f);assert.match(f.d.querySelector('.discoveryModal').textContent,/Review my saved piece/);assert.ok(!f.d.querySelector('.discoveryModal').textContent.includes('Start my private answers'));assert.equal(f.d.querySelector('.discoveryQuestions'),null);
 }finally{f.close()}
});

test('authorization failure hides cached shared results while keeping the chat untouched',async()=>{
 const f=await fixture({games:[completedGame({revealed:true,sharedResults:{own:result,other:otherResult}})]});try{
  await open(f);assert.ok(f.d.body.textContent.includes(otherResult.summary));const composer=f.d.querySelector('#message');composer.value='Unsent chat';composer.focus();const original=f.w.fetch;f.w.fetch=async(url,options)=>url.includes('connection=alpha')?response({error:'Games are unavailable for this connection.'},403):original(url,options);await f.w.loadDiscovery('alpha',true);assert.ok(!f.d.body.textContent.includes(otherResult.summary));assert.equal(f.d.querySelector('#message'),composer);assert.equal(composer.value,'Unsent chat');assert.match(f.d.querySelector('.discoveryModal').textContent,/unavailable/);
 }finally{f.close()}
});

test('polling refresh preserves the question draft, focused radio, and chat composer',async()=>{
 const f=await fixture();try{
  await start(f);const input=f.d.querySelector('input[name="discovery-0"]');input.click();input.focus();const composer=f.d.querySelector('#message');composer.value='Unsent text';await f.w.loadDiscovery('alpha',true);assert.equal(f.d.activeElement,input);assert.equal(f.d.querySelector('input[name="discovery-0"]'),input);assert.equal(f.d.querySelector('#message'),composer);assert.equal(composer.value,'Unsent text');assert.equal(f.d.querySelector('input[name="discovery-0"]:checked').value,'1');
 }finally{f.close()}
});

test('modal keyboard focus wraps and close returns to its opener',async()=>{
 const f=await fixture();try{
  const opener=f.d.querySelector('.discoveryHeading button');opener.focus();opener.click();await flush();const close=f.d.querySelector('.discoveryModal .close'),last=[...f.d.querySelectorAll('.discoveryModal button:not(:disabled)')].at(-1);close.focus();f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(f.d.activeElement,last);f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(f.d.activeElement,close);f.w.closeInvite();assert.equal(f.d.activeElement,f.d.querySelector('.discoveryHeading button'));
 }finally{f.close()}
});

test('versioned modules never reuse another version’s piece or private draft',async()=>{
 const v2={...clone(modules[0]),version:2,title:'Feel Loved v2'},f=await fixture({catalog:[...modules,v2],pieces:[piece]});try{
  f.w.openDiscoveryPicker('alpha');await flush();f.w.openDiscoveryGame('alpha','feel-loved',2);assert.match(f.d.querySelector('.discoveryModal').textContent,/Start my private answers/);assert.ok(!f.d.querySelector('.discoveryModal').textContent.includes('already earned'));await f.w.discoveryAction('start');assert.equal(f.posts()[0].version,2);f.w.chooseDiscoveryAnswer('care-0',5);await f.w.discoveryAction('save');assert.equal(f.posts()[1].version,2);f.w.closeInvite();f.w.openDiscoveryPicker('alpha');await flush();f.w.openDiscoveryGame('alpha','feel-loved',1);assert.match(f.d.querySelector('.discoveryModal').textContent,/already earned/);assert.equal(f.d.querySelector('.discoveryQuestions'),null);
 }finally{f.close()}
});

test('shipped Mini-IPIP uses accuracy labels and exposes its source attribution',async()=>{
 const mini=shippedModules.find(m=>m.id==='mini-ipip-20'),f=await fixture({catalog:shippedModules});try{
  assert.ok(mini,'Mini-IPIP is included in the shipped module catalog');await open(f,'alpha',mini.id);assert.match(f.d.querySelector('.discoveryAbout').textContent,/Public-domain/);assert.ok(f.d.querySelector('.discoveryAbout a[href="https://www.ipip.ori.org/MiniIPIPKey.htm"]'));await f.w.discoveryAction('start');assert.equal(f.d.querySelectorAll('.discoveryQuestions fieldset').length,20);const labels=f.d.querySelector('.discoveryScale').textContent;assert.match(labels,/accurate/i);assert.ok(!labels.includes('agree'));
 }finally{f.close()}
});

test('owner-global drafts retain answers saved through alpha and beta connections',async()=>{
 const f=await fixture();try{
  await start(f);f.w.chooseDiscoveryAnswer('care-0',2);await f.w.discoveryAction('save');f.w.closeInvite();f.w.selectChempat('beta');await flush();await open(f,'beta');await f.w.discoveryAction('start');assert.equal(f.d.querySelector('input[name="discovery-0"]:checked').value,'2');f.w.chooseDiscoveryAnswer('care-1',3);await f.w.discoveryAction('save');f.w.closeInvite();f.w.selectChempat('alpha');await flush();await open(f);assert.equal(f.d.querySelector('input[name="discovery-1"]:checked').value,'3');f.w.chooseDiscoveryAnswer('care-2',4);await f.w.discoveryAction('save');assert.deepEqual(f.posts().at(-1).answers,{'care-0':2,'care-1':3,'care-2':4});assert.equal(f.posts().at(-1).draftRevision,2);
 }finally{f.close()}
});

test('stale revision refreshes newer answers, retains local edits, and asks for explicit retry',async()=>{
 const f=await fixture();try{
  await start(f);f.w.chooseDiscoveryAnswer('care-0',2);await f.w.discoveryAction('save');f.w.chooseDiscoveryAnswer('care-2',4);f.server.drafts.set('feel-loved:1',{answers:{'care-0':2,'care-1':3},revision:2});const before=f.posts().length;await f.w.discoveryAction('save');assert.equal(f.posts().length,before+1,'conflict never auto-submits');assert.match(f.d.querySelector('#discoveryError').textContent,/Newer saved answers were loaded/);assert.equal(f.d.querySelector('input[name="discovery-1"]:checked').value,'3');assert.equal(f.d.querySelector('input[name="discovery-2"]:checked').value,'4');await f.w.discoveryAction('save');assert.deepEqual(f.posts().at(-1).answers,{'care-0':2,'care-1':3,'care-2':4});assert.equal(f.posts().at(-1).draftRevision,2);
 }finally{f.close()}
});

test('a stale different-pair response cannot remove an earned piece or offer a retake',async()=>{
 const f=await fixture();try{
  await start(f);const original=f.w.fetch,hold=deferred();f.w.fetch=async(url,options)=>{const captured=await original(url,options);if(url.includes('connection=beta')){const data=await captured.json();await hold.promise;return response(data)}return captured};const stale=f.w.loadDiscovery('beta',true);await flush();answer(f);await f.w.discoveryAction('complete');hold.resolve();await stale;assert.match(f.d.querySelector('#earnedPieces').textContent,/care in small moments/);f.w.closeInvite();f.w.selectChempat('beta');await flush();await open(f,'beta');assert.match(f.d.querySelector('.discoveryModal').textContent,/Review my saved piece/);assert.ok(!f.d.querySelector('.discoveryModal').textContent.includes('Start my private answers'));
 }finally{f.close()}
});

test('earned pieces are compact by default and preserve an owner’s expanded result',async()=>{
 const f=await fixture({pieces:[piece]});try{
  const details=f.d.querySelector('.earnedPieceResult');assert.ok(details);assert.equal(details.open,false);details.querySelector('summary').click();await flush();assert.equal(details.open,true);await f.w.loadDiscovery('alpha',true);assert.equal(f.d.querySelector('.earnedPieceResult').open,true);f.w.eval('render()');assert.equal(f.d.querySelector('.earnedPieceResult').open,true);
 }finally{f.close()}
});

test('a pending global draft save re-enables the same game opened in another pair',async()=>{
 const f=await fixture();try{
  await start(f);f.w.closeInvite();f.w.selectChempat('beta');await flush();await open(f,'beta');await f.w.discoveryAction('start');f.w.closeInvite();f.w.selectChempat('alpha');await flush();await open(f);f.w.chooseDiscoveryAnswer('care-0',3);const hold=deferred();f.server.hold=hold;const pending=f.w.discoveryAction('save');f.w.closeInvite();f.w.selectChempat('beta');await flush();await open(f,'beta');const composer=f.d.querySelector('#message');assert.equal(f.d.querySelector('.discoveryQuestions fieldset').disabled,true);assert.equal(f.d.querySelector('.discoveryFormActions button').disabled,true);hold.resolve();await pending;assert.equal(f.d.querySelector('.discoveryQuestions fieldset').disabled,false);assert.equal(f.d.querySelector('.discoveryFormActions button').disabled,false);assert.equal(f.d.querySelector('input[name="discovery-0"]:checked').value,'3');assert.equal(f.d.querySelector('#message'),composer);assert.match(f.d.querySelector('.discoveryModal>.eyebrow').textContent,/Riley/);
 }finally{f.close()}
});


test('compact collection occupies only the header and has no checklist or sharing mutation',async()=>{
 const f=await fixture({pieces:[piece,{...piece,moduleId:'closeness',title:'Closeness',version:1}]});try{
  const header=f.d.querySelector('.socialMemberHeader'),collection=f.d.querySelector('#earnedPieces');
  assert.equal(collection.parentElement,header);assert.equal(header.querySelector('.friendShareButton'),null);
  assert.equal(f.d.querySelectorAll('#earnedPieces').length,1);assert.equal(f.d.querySelectorAll('#earnedPiecesTitle').length,1);
  const ids=[...f.d.querySelectorAll('[id]')].map(el=>el.id);assert.equal(new Set(ids).size,ids.length);
  assert.equal(collection.querySelectorAll('.earnedPiece').length,2);assert.equal(collection.querySelector('progress,input[type="checkbox"]'),null);
  assert.doesNotMatch(header.textContent,/Your first five are ready to share|0 \/ 3|complete your profile/i);
  const summaries=collection.querySelectorAll('.earnedPieceResult summary');assert.match(summaries[0].textContent,/Feel Loved/);summaries[0].click();await flush();assert.equal(collection.querySelector('.earnedPieceResult').open,true);
  summaries[1].click();await flush();assert.equal(collection.querySelectorAll('.earnedPieceResult[open]').length,2);assert.equal(f.posts().length,0,'viewing earned pieces never offers or shares them');
  f.d.querySelector('.connectionsHeading .friendShareButton').click();assert.equal(f.state().modal,'friendShare');f.w.closeInvite();
  f.d.querySelector('#connectionGames .discoveryHeading button').click();await flush();assert.equal(f.state().modal,'discovery');assert.ok(f.d.querySelector('.discoveryPicker'));
 }finally{f.close()}
});

test('pieces refresh retains disclosure, keyboard focus, scroll position and chat draft',async()=>{
 const f=await fixture({pieces:[piece]});try{
  let summary=f.d.querySelector('.earnedPieceResult summary');summary.click();await flush();summary.focus();f.d.querySelector('.earnedPieceGrid').scrollTop=37;
  const composer=f.d.querySelector('#message');composer.value='Unsent while viewing a piece';
  await f.w.loadDiscoveryPieces(true);
  let details=f.d.querySelector('.earnedPieceResult');assert.equal(details.open,true);assert.equal(f.d.activeElement,details.querySelector('summary'));assert.equal(f.d.querySelector('.earnedPieceGrid').scrollTop,37);assert.equal(f.d.querySelector('#message'),composer);assert.equal(composer.value,'Unsent while viewing a piece');
  details.querySelector('summary').click();await flush();await f.w.loadDiscovery('alpha',true);assert.equal(f.d.querySelector('.earnedPieceResult').open,false,'collapsed state survives pair polling');
  assert.equal(f.d.querySelectorAll('#earnedPieces').length,1);assert.equal(f.posts().length,0);
 }finally{f.close()}
});

test('empty and failed compact collections remain optional and friend-only pages retain their actions',async()=>{
 const f=await fixture({rows:[row('friend',{kind:'friend',channel:'friend'})]});try{
  const collection=f.d.querySelector('.socialMemberHeader #earnedPieces');assert.ok(collection);assert.match(collection.textContent,/optional connection games/);assert.equal(f.d.querySelector('#connectionGames'),null);assert.ok(f.d.querySelector('#message'));
  f.server.failGet=true;await f.w.loadDiscoveryPieces(true);assert.match(collection.textContent,/could not be loaded/);assert.ok(collection.querySelector('button'));assert.ok(f.d.querySelector('#message'));
  f.server.failGet=false;collection.querySelector('button').click();await flush();assert.doesNotMatch(collection.textContent,/could not be loaded/);assert.equal(f.posts().length,0);
  f.w.eval('s.member.verified=false;s.account.verified=false;render()');assert.ok([...f.d.querySelectorAll('.socialMemberAction button')].find(button=>button.textContent==='CONFIRM MY EMAIL'),'email confirmation remains beside the primary action');
  f.w.eval('s.member.answers=[];s.account.answers=[];render()');assert.ok(f.d.querySelector('.socialMemberHeader #earnedPieces'));f.d.querySelector('.socialVibeAction button').click();assert.ok(f.d.querySelector('.quickChoices'),'the existing first-five action still opens its questions');
 }finally{f.close()}
});
