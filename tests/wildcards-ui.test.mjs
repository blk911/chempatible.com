import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {REWARD_ROUNDS} from '../api/_reward-rounds.mjs';
import {WILDCARD_CATEGORIES as shippedCategories} from '../api/_wildcard-questions.mjs';

// Synthetic DOM/CSSOM coverage only. No browser layout engine, real accounts,
// outgoing mail, or external network is used by these fixtures.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../site.css',import.meta.url),'utf8');
const key='chempatibility.walkthrough.v7';
const a='a'.repeat(64),b='b'.repeat(64),friend='f'.repeat(64),closed='c'.repeat(64);
const clone=value=>JSON.parse(JSON.stringify(value));
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve))};
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve}};
const response=(data,status=200)=>({ok:status<400,status,json:async()=>clone(data)});
const own={id:'owner',name:'Taylor',contact:'owner@example.test',photo:'data:image/jpeg;base64,AA==',answers:Array(10).fill(0),verified:true};
const row=(id=a,overrides={})=>({id,kind:'vibe',channel:'email',side:'member',status:'chat',location:'active',prospect_name:id===a?'Morgan':'Riley',prospect_photo:own.photo,prospect_answers:own.answers,own_answers:own.answers,messages:[],...overrides});
const categories=[{id:'future',title:'Dreams & plans',questions:[{id:'future-1',text:'What would your dream weekend look like?'},{id:'future-2',text:'Where would you love to live?'}]},{id:'fun',title:'Just for fun',questions:[{id:'fun-1',text:'What always makes you laugh?'},{id:'fun-2',text:'What song would you put on repeat?'}]}];
async function fixture({level=3,rows=[row(),row(b)],saved,actor='member',catalog=categories,initialPairs={}}={}){
 const dom=new JSDOM(html,{url:'https://wildcards.example.test/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
 const server={level,rows:clone(rows),pairs:new Map(rows.map(c=>[c.id,{remaining:3,usedQuestionIds:[],...clone(initialPairs[c.id]||{}),requests:new Map()}])),calls:[],failGet:false,failPost:false,loseReply:false,holdGet:null,holdPost:null,eligible:true};
 const snapshot=id=>{const pair=server.pairs.get(id);return {connectionId:id,eligible:server.eligible&&server.level>=3,limit:3,remaining:server.eligible&&server.level>=3?pair.remaining:0,usedQuestionIds:pair.usedQuestionIds,categories:server.eligible&&server.level>=3?catalog:[]}};
 w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.fetch=async(url,options={})=>{
  if(url==='/api/wildcards?summary=1')return response({connections:[]});
  if(url.startsWith('/api/game-pieces?'))return response({pieces:[],pendingCount:0});
  if(url==='/api/rewards?phoneRequests=1')return response({phoneRequests:[]});
  const body=options.body?JSON.parse(options.body):null;server.calls.push({url,body,options});
  if(url==='/api/member'&&body?.action==='logout')return response({ok:true});
  if(url==='/api/connection?inbox=1')return response({connections:server.rows});
  if(url.startsWith('/api/rewards'))return response({level:server.level,rounds:REWARD_ROUNDS,answers:{},draftRevision:0,connections:[],connection:{phone:{eligible:true,ownOffered:false,shared:false}}});
  if(url.startsWith('/api/discovery'))return response({modules:[],games:[],pieces:[]});
  if(!url.startsWith('/api/wildcards'))return response({},401);
  assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');assert.equal(options.headers['x-chempat-member-id'],w.eval('activeMemberId()'));
  const id=body?.connectionId||new URL(url,'https://wildcards.example.test').searchParams.get('connection');assert.ok(server.pairs.has(id),'real connection ID required');
  if(!body){if(server.failGet)return response({error:'Could not load wildcards.'},503);const data=response(snapshot(id));if(server.holdGet){const hold=server.holdGet;server.holdGet=null;await hold.promise}return data}
  if(server.holdPost){const hold=server.holdPost;server.holdPost=null;await hold.promise}
  if(server.failPost)return response({error:'Sending failed. Try again.'},503);
  const pair=server.pairs.get(id),previous=pair.requests.get(body.requestId);
  if(previous)return response({...snapshot(id),message:previous,replayed:true});
  if(pair.usedQuestionIds.includes(body.questionId)||pair.remaining===0)return response({error:'That wildcard is no longer available.'},409);
  const category=catalog.find(category=>category.questions.some(q=>q.id===body.questionId)),q=category?.questions.find(q=>q.id===body.questionId);assert.ok(q);
  pair.remaining--;pair.usedQuestionIds.push(q.id);const message={id:`message-${body.requestId}`,by:actor==='prospect'?'prospect':'member',text:q.text,wildcardQuestionId:q.id,wildcardCategoryId:category.id};pair.requests.set(body.requestId,message);server.rows.find(c=>c.id===id).messages.push(message);
  if(server.loseReply){server.loseReply=false;throw Error('Network interrupted. Try again.')}
  return response({...snapshot(id),message,replayed:false});
 };
 if(saved)w.sessionStorage.setItem(key,JSON.stringify(saved));
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 if(!saved){
  if(actor==='prospect')w.eval(`s={...blank(),view:'dashboard',actor:'prospect',member:{name:'Morgan',answers:Array(10).fill(0)},prospect:${JSON.stringify({...own,email:own.contact})},prospectId:'owner',liveId:'${a}',liveInvite:true,liveToken:'test-token',selectedChempat:'first',phase:'chat',firstConnection:{location:'active'},messages:[]};render()`);
  else w.eval(`s={...blank(),view:'dashboard',member:${JSON.stringify(own)},memberId:'owner',account:${JSON.stringify(own)},liveMember:true,inbox:${JSON.stringify(rows.filter(c=>c.kind!=='friend'))},friends:${JSON.stringify(rows.filter(c=>c.kind==='friend'))},selectedChempat:'${a}',phase:'chat'};render()`);
 }
 await flush();
 return {w,d,server,snapshot,state:()=>clone(w.eval('s')),posts:()=>server.calls.filter(c=>c.url==='/api/wildcards'&&c.body),saved:()=>JSON.parse(w.sessionStorage.getItem(key)),close:()=>w.close()};
}
async function open(f,id=a){f.w.openWildcardPicker(id);await flush()}
async function select(f,id='future-1',category='future'){await open(f);f.w.chooseWildcardCategory(category);f.w.chooseWildcardQuestion(id)}

 test('Level 3 perk preserves five rewards and never opens a gated or friend chat',async()=>{
 for(const level of [0,1,2,3,4,5]){const f=await fixture({level,rows:[row(),row(friend,{kind:'friend',channel:'friend'}),row(closed,{status:'secondResults'}),row('e'.repeat(64),{status:'ended',location:'freezer'})]});try{
  assert.equal(f.d.querySelectorAll('.rewardSlot').length,5);assert.equal(f.d.querySelectorAll('.rewardSlot.unlocked').length,level);assert.equal(f.d.querySelector('#connectionWildcards').hidden,level<3);
  f.w.openWildcardPicker(a);assert.equal(f.state().modal,level>=3?'wildcard':'');f.w.closeInvite();
  for(const id of [friend,closed]){f.w.selectChempat(id);assert.equal(f.d.querySelector('#connectionWildcards'),null);f.w.openWildcardPicker(id);assert.equal(f.state().modal,'')}
  f.w.openWildcardPicker('e'.repeat(64));assert.equal(f.state().modal,'');assert.equal(f.posts().length,0);
 }finally{f.close()}}
});

test('newly earned Level 3 and restored conversation views load their server balance',async()=>{
 const f=await fixture({level:2});try{
  assert.equal(f.d.querySelector('#connectionWildcards').hidden,true);f.server.level=3;await f.w.loadRewards(true);await flush();assert.equal(f.d.querySelector('#connectionWildcards').hidden,false);assert.match(f.d.querySelector('.wildcardBalance').textContent,/3 of 3/);assert.equal(f.posts().length,0);
  const saved={...f.saved(),view:'conversation',selectedChempat:a,phase:'chat'};const resumed=await fixture({saved});try{assert.ok(resumed.d.querySelector('#message'));assert.equal(resumed.d.querySelector('#connectionWildcards').hidden,false);assert.match(resumed.d.querySelector('.wildcardBalance').textContent,/3 of 3/)}finally{resumed.close()}
 }finally{f.close()}
});

test('category-first flow renders titles only before one selected category',async()=>{
 const f=await fixture();try{
  assert.match(f.d.querySelector('.wildcardBalance').textContent,/3 of 3 left with Morgan/);assert.ok(f.d.querySelector('#message'));
  await open(f);assert.equal(f.d.querySelector('#wildcardTitle').textContent,'Pick a category');assert.deepEqual([...f.d.querySelectorAll('.wildcardCategories button')].map(b=>b.textContent),categories.map(c=>c.title));
  for(const c of categories)for(const q of c.questions)assert.ok(!f.d.querySelector('.wildcardModal').innerHTML.includes(q.text));
  f.w.chooseWildcardCategory('fun');assert.equal(f.d.querySelectorAll('.wildcardQuestion').length,2);assert.ok(!f.d.querySelector('.wildcardModal').textContent.includes(categories[0].questions[0].text));
  f.w.chooseWildcardQuestion('fun-1');assert.equal(f.posts().length,0);assert.equal(f.d.querySelector('.wildcardPreview').textContent,categories[1].questions[0].text);assert.match(f.d.querySelector('.wildcardHint').textContent,/uses 1 wildcard/);assert.match(f.d.querySelector('.wildcardHint').textContent,/pass/);
  await f.w.askWildcard();assert.equal(f.posts().length,1);assert.equal(f.server.pairs.get(a).remaining,2);assert.match(f.d.querySelector('.wildcardBalance').textContent,/2 of 3/);assert.equal(f.state().modal,'');assert.match(f.d.querySelector('.inlineChat').textContent,/always makes you laugh/);assert.equal(f.d.activeElement.id,'message');
  const stored=JSON.stringify(f.saved());assert.ok(!stored.includes('usedQuestionIds'));assert.ok(!stored.includes('requestId'));assert.ok(!stored.includes('dream weekend'));assert.equal(f.w.localStorage.length,0);
 }finally{f.close()}
});

test('Back, category changes, cancel, backdrop and Escape never consume an ask',async()=>{
 const f=await fixture();try{
  const trigger=f.d.querySelector('[data-wildcard-focus="open"]');trigger.focus();await open(f);f.w.chooseWildcardCategory('future');f.w.chooseWildcardQuestion('future-1');f.w.wildcardBack();assert.equal(f.d.activeElement.dataset.wildcardFocus,'question:future-1');f.w.wildcardBack();assert.equal(f.d.activeElement.dataset.wildcardFocus,'category:future');
  f.w.chooseWildcardCategory('fun');f.w.chooseWildcardQuestion('fun-1');f.d.querySelector('[data-wildcard-focus="cancel"]').click();assert.equal(f.state().modal,'');assert.equal(f.d.activeElement.dataset.wildcardFocus,'open');
  await open(f);f.d.querySelector('.wildcardModal').click();assert.equal(f.state().modal,'wildcard');f.d.querySelector('.modalBackdrop').click();assert.equal(f.state().modal,'');
  await open(f);f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.state().modal,'');await f.w.askWildcard();assert.equal(f.posts().length,0);assert.equal(f.server.pairs.get(a).remaining,3);
 }finally{f.close()}
});

test('either member’s played questions are masked, labelled and impossible to select',async()=>{
 const f=await fixture();try{
  f.server.pairs.get(a).usedQuestionIds.push('future-1');await f.w.loadWildcards(a,true);await open(f);f.w.chooseWildcardCategory('future');
  const used=f.d.querySelector('.wildcardQuestion.played');assert.ok(used.disabled);assert.equal(used.getAttribute('aria-label'),'Already played');assert.match(used.textContent,/Already played/);assert.ok(!used.innerHTML.includes(categories[0].questions[0].text));assert.ok(!f.d.querySelector('.wildcardModal').textContent.includes(categories[0].questions[0].text));
  f.w.chooseWildcardQuestion('future-1');assert.equal(f.d.querySelector('.wildcardPreview'),null);await f.w.askWildcard();assert.equal(f.posts().length,0);assert.equal(f.server.pairs.get(a).remaining,3,'partner usage does not consume this member’s allowance');
 }finally{f.close()}
});

test('a cold reload masks persisted played slots using the shipped API catalog',async()=>{
 const used=shippedCategories[0].questions[0],first=await fixture({catalog:shippedCategories});let saved;
 try{saved=first.saved()}finally{first.close()}
 const f=await fixture({catalog:shippedCategories,saved,initialPairs:{[a]:{remaining:2,usedQuestionIds:[used.id]}}});try{
  assert.match(f.d.querySelector('.wildcardBalance').textContent,/2 of 3/);await open(f);assert.equal(f.d.querySelectorAll('.wildcardCategories button').length,shippedCategories.length);assert.ok(!f.d.querySelector('.wildcardModal').textContent.includes(used.text));
  f.w.chooseWildcardCategory(shippedCategories[0].id);assert.equal(f.d.querySelectorAll('.wildcardQuestion').length,shippedCategories[0].questions.length);assert.equal(f.d.querySelectorAll('.wildcardQuestion.played').length,1);assert.ok(!f.d.querySelector('.wildcardModal').innerHTML.includes(used.text));assert.equal(f.posts().length,0);
 }finally{f.close()}
});

test('failed sends keep the balance and selection; retry retains its idempotency key',async()=>{
 const f=await fixture();try{
  await select(f);f.server.failPost=true;await f.w.askWildcard();assert.equal(f.server.pairs.get(a).remaining,3);assert.match(f.d.querySelector('#wildcardRemaining').textContent,/3 of 3/);assert.match(f.d.querySelector('#wildcardError').textContent,/Sending failed/);assert.ok(f.d.querySelector('.wildcardPreview'));assert.equal(f.d.querySelector('[data-wildcard-focus="ask"]').disabled,false);
  f.server.failPost=false;await f.w.askWildcard();assert.equal(f.posts().length,2);assert.equal(f.posts()[0].body.requestId,f.posts()[1].body.requestId);assert.equal(f.server.pairs.get(a).remaining,2);assert.equal(f.server.rows[0].messages.length,1);
 }finally{f.close()}
});

test('a lost success response is replayed without a second charge or message',async()=>{
 const f=await fixture();try{
  await select(f);f.server.loseReply=true;await f.w.askWildcard();assert.match(f.d.querySelector('#wildcardRemaining').textContent,/3 of 3/,'UI does not guess server success');assert.equal(f.server.pairs.get(a).remaining,2);
  await f.w.askWildcard();assert.equal(f.posts()[0].body.requestId,f.posts()[1].body.requestId);assert.equal(f.server.pairs.get(a).remaining,2);assert.equal(f.server.rows[0].messages.length,1);assert.match(f.d.querySelector('.wildcardBalance').textContent,/2 of 3/);
 }finally{f.close()}
});

test('no response keeps balance unchanged and blocks repeated sends until timeout',async()=>{
 const f=await fixture();try{
  await select(f);const original=f.w.fetch,timeout=f.w.setTimeout;f.w.setTimeout=(fn,ms,...args)=>timeout(fn,ms===20000?1:ms,...args);
  f.w.fetch=(url,options)=>url==='/api/wildcards'&&options.method==='POST'?new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new f.w.DOMException('Aborted','AbortError')))):original(url,options);
  const one=f.w.askWildcard(),two=f.w.askWildcard();await Promise.all([one,two]);assert.equal(f.server.pairs.get(a).remaining,3);assert.match(f.d.querySelector('#wildcardError').textContent,/couldn’t confirm/);assert.match(f.d.querySelector('#wildcardRemaining').textContent,/3 of 3/);assert.equal(f.d.querySelector('[data-wildcard-focus="ask"]').disabled,false);
  f.w.fetch=original;await f.w.askWildcard();assert.equal(f.server.pairs.get(a).remaining,2);
 }finally{f.close()}
});

test('double click sends once and an in-flight success cannot reopen a dismissed dialog',async()=>{
 const f=await fixture();try{
  await select(f);const hold=deferred();f.server.holdPost=hold;const one=f.w.askWildcard(),two=f.w.askWildcard();assert.equal(f.posts().length,1);assert.ok(f.d.querySelector('[data-wildcard-focus="ask"]').disabled);assert.ok(f.d.querySelector('[data-wildcard-focus="cancel"]').disabled);
  f.w.closeInvite();f.w.openWildcardPicker(a);assert.equal(f.state().modal,'');hold.resolve();await Promise.all([one,two]);assert.equal(f.state().modal,'');assert.equal(f.d.querySelector('.wildcardModal'),null);assert.equal(f.server.rows[0].messages.length,1);assert.equal(f.server.pairs.get(a).remaining,2);
 }finally{f.close()}
});

test('a stale pre-send read cannot restore spent balance or an already played question',async()=>{
 const f=await fixture();try{
  await select(f);const hold=deferred();f.server.holdGet=hold;const stale=f.w.loadWildcards(a,true);await flush();await f.w.askWildcard();hold.resolve();await stale;assert.match(f.d.querySelector('.wildcardBalance').textContent,/2 of 3/);await open(f);f.w.chooseWildcardCategory('future');assert.equal(f.d.querySelectorAll('.wildcardQuestion.played').length,1);
 }finally{f.close()}
});

test('partner race returns a conflict, reloads usage, and never charges this member',async()=>{
 const f=await fixture();try{
  await select(f);f.server.pairs.get(a).usedQuestionIds.push('future-1');await f.w.askWildcard();assert.equal(f.server.pairs.get(a).remaining,3);assert.equal(f.d.querySelector('.wildcardPreview'),null);assert.ok(f.d.querySelector('.wildcardQuestion.played'));assert.match(f.d.querySelector('#wildcardError').textContent,/no longer available/);assert.match(f.d.querySelector('#wildcardRemaining').textContent,/3 of 3/);
 }finally{f.close()}
});

test('a conflict queues a fresh snapshot behind an obsolete in-flight read',async()=>{
 const f=await fixture();try{
  await select(f);const hold=deferred();f.server.holdGet=hold;const stale=f.w.loadWildcards(a,true);await flush();f.server.pairs.get(a).usedQuestionIds.push('future-1');await f.w.askWildcard();hold.resolve();await stale;await flush();
  assert.equal(f.d.querySelector('.wildcardPreview'),null);assert.equal(f.d.querySelectorAll('.wildcardQuestion.played').length,1);assert.match(f.d.querySelector('#wildcardRemaining').textContent,/3 of 3/);assert.equal(f.server.pairs.get(a).remaining,3);
 }finally{f.close()}
});

test('authoritative conflict snapshot masks a used question without waiting for an old read',async()=>{
 const f=await fixture();try{
  await select(f);const hold=deferred();f.server.holdGet=hold;const stale=f.w.loadWildcards(a,true);await flush();f.server.pairs.get(a).usedQuestionIds.push('future-1');const original=f.w.fetch;
  f.w.fetch=(url,options)=>url==='/api/wildcards'&&options.method==='POST'?Promise.resolve(response({...f.snapshot(a),error:'Already played.',usedQuestion:true},409)):original(url,options);
  await f.w.askWildcard();assert.equal(f.d.querySelector('.wildcardPreview'),null);assert.equal(f.d.querySelectorAll('.wildcardQuestion.played').length,1);hold.resolve();await stale;assert.equal(f.d.querySelectorAll('.wildcardQuestion.played').length,1);
 }finally{f.close()}
});

test('three successful asks exhaust only this connection and reload uses server balance',async()=>{
 const f=await fixture();try{
  for(const [q,c] of [['future-1','future'],['future-2','future'],['fun-1','fun']]){await select(f,q,c);await f.w.askWildcard()}
  assert.equal(f.server.pairs.get(a).remaining,0);assert.ok(f.d.querySelector('[data-wildcard-focus="open"]').disabled);f.w.openWildcardPicker(a);assert.equal(f.state().modal,'');assert.match(f.d.querySelector('.wildcardHint').textContent,/chat stays open/);assert.ok(f.d.querySelector('#message'));
  f.w.selectChempat(b);await flush();assert.match(f.d.querySelector('.wildcardBalance').textContent,/3 of 3/);f.w.selectChempat(a);await flush();assert.match(f.d.querySelector('.wildcardBalance').textContent,/0 of 3/);
  f.w.eval('wildcardPairs=new Map();render()');await flush();assert.match(f.d.querySelector('.wildcardBalance').textContent,/0 of 3/);assert.equal(f.posts().length,3);
 }finally{f.close()}
});

test('connection and page navigation invalidate dialogs and late responses',async()=>{
 const f=await fixture();try{
  await select(f);const hold=deferred();f.server.holdPost=hold;const request=f.w.askWildcard();f.w.selectChempat(b);await flush();assert.equal(f.state().modal,'');f.w.openFriendShare();const modal=f.d.querySelector('#modalHost').innerHTML;hold.resolve();await request;assert.equal(f.state().modal,'friendShare');assert.equal(f.d.querySelector('#modalHost').innerHTML,modal);assert.match(f.d.querySelector('.wildcardBalance').textContent,/3 of 3 left with Riley/);assert.equal(f.server.pairs.get(b).remaining,3);
  f.w.closeInvite();await open(f,b);f.w.navigate('profile');assert.equal(f.state().modal,'');assert.equal(f.d.querySelector('.wildcardModal'),null);
 }finally{f.close()}
});

test('account changes and logout remove private catalog, pending UI and balances',async()=>{
 for(const action of ['account','logout']){const f=await fixture();try{
  await select(f);const hold=deferred();f.server.holdPost=hold;const request=f.w.askWildcard();
  if(action==='logout'){f.w.confirmLogout();await f.w.logout()}else f.w.eval("s={...blank(),view:'dashboard',memberId:'new-owner',member:{name:'New',answers:[]},liveMember:true};render()");
  hold.resolve();await request;assert.equal(f.state().modal,'');assert.equal(f.d.querySelector('.wildcardModal'),null);assert.equal(f.d.querySelector('#connectionWildcards'),null);assert.ok(!f.d.body.textContent.includes(categories[0].questions[0].text));assert.equal(f.w.eval('wildcardPairs.size'),0);
 }finally{f.close()}}
});

test('ended connection, server eligibility loss and expired authentication fail closed',async()=>{
 const f=await fixture();try{
  await open(f);f.server.eligible=false;await f.w.loadWildcards(a,true);assert.equal(f.d.querySelector('#connectionWildcards').hidden,true);assert.equal(f.d.querySelector('.wildcardCategories'),null);f.w.chooseWildcardCategory('future');await f.w.askWildcard();assert.equal(f.posts().length,0);
  f.server.eligible=true;await f.w.loadWildcards(a,true);f.w.closeInvite();await open(f);f.w.eval(`s.inbox.find(c=>c.id==='${a}').status='ended';render(true)`);await flush();assert.equal(f.state().modal,'');assert.equal(f.d.querySelector('.wildcardModal'),null);
  await open(f,b);const original=f.w.fetch;f.w.fetch=(url,options)=>url.startsWith('/api/wildcards')?Promise.resolve(response({error:'Please sign in again.'},401)):original(url,options);await f.w.loadWildcards(b,true);assert.equal(f.d.querySelector('.wildcardCategories'),null);assert.match(f.w.eval('rewardsAuthError'),/sign in/);assert.equal(f.d.querySelector('.wildcardModal'),null);assert.equal(f.w.eval('wildcardPairs.size'),0);assert.equal(f.posts().length,0);
 }finally{f.close()}
});

test('first received-connection alias never enters the server request',async()=>{
 const f=await fixture({actor:'prospect'});try{
  await open(f,'first');f.w.chooseWildcardCategory('future');f.w.chooseWildcardQuestion('future-1');await f.w.askWildcard();assert.equal(f.posts()[0].body.connectionId,a);assert.ok(!f.server.calls.some(c=>c.url.includes('connection=first')));
 }finally{f.close()}
});

test('dialog labels, title focus and keyboard trap remain accessible across stages',async()=>{
 const f=await fixture();try{
  await open(f);for(const step of [()=>{},()=>f.w.chooseWildcardCategory('future'),()=>f.w.chooseWildcardQuestion('future-1')]){step();const modal=f.d.querySelector('.wildcardModal');assert.equal(modal.getAttribute('role'),'dialog');assert.equal(modal.getAttribute('aria-modal'),'true');assert.ok(f.d.getElementById(modal.getAttribute('aria-labelledby')).textContent);assert.ok(f.d.getElementById(modal.getAttribute('aria-describedby')).textContent);assert.equal(f.d.activeElement.id,'wildcardTitle');
   const controls=[...modal.querySelectorAll('button:not(:disabled)')];controls.at(-1).focus();f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(f.d.activeElement,controls[0]);f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(f.d.activeElement,controls.at(-1));
   const ids=[...f.d.querySelectorAll('[id]')].map(el=>el.id);assert.equal(ids.length,new Set(ids).size);
  }
 }finally{f.close()}
});

test('server text is escaped and malformed snapshots cannot enable a picker',async()=>{
 const unsafe='<img src=x onerror=alert(1)>',f=await fixture({catalog:[{id:'safe',title:unsafe,questions:[{id:'safe-1',text:unsafe}]}]});try{
  await open(f);assert.equal(f.d.querySelector('.wildcardModal img'),null);assert.match(f.d.querySelector('.wildcardCategories').textContent,/<img/);f.w.chooseWildcardCategory('safe');assert.equal(f.d.querySelector('.wildcardModal img'),null);f.w.closeInvite();
  f.w.eval('wildcardPairs=new Map()');const original=f.w.fetch;f.w.fetch=(url,options)=>url.startsWith('/api/wildcards')?Promise.resolve(response({...f.snapshot(a),remaining:99})):original(url,options);await f.w.loadWildcards(a,true);assert.ok(f.d.querySelector('[data-wildcard-focus="open"]').disabled);assert.match(f.d.querySelector('#connectionWildcards').textContent,/incomplete response/);f.w.openWildcardPicker(a);assert.equal(f.state().modal,'');
 }finally{f.close()}
});

function cssAtWidth(rules,width){return rules.map(rule=>{if(rule.constructor.name==='CSSContainerRule')return '';if(rule.type!==4)return rule.cssText;const match=rule.conditionText.match(/^\((min|max)-width:\s*(\d+)px\)$/);if(!match)return '';return (match[1]==='max'?width<=Number(match[2]):width>=Number(match[2]))?cssAtWidth([...rule.cssRules],width):''}).join('\n')}
test('compact mobile controls have shrinkable columns, readable wraps and touch targets',async()=>{
 const f=await fixture();try{
  const sheet=f.d.createElement('style');sheet.textContent=css;f.d.head.append(sheet);const rules=[...sheet.sheet.cssRules];sheet.remove();
  for(const width of [320,360,390,430,520,700,900,1280]){
   const style=f.d.createElement('style');style.textContent=cssAtWidth(rules,width);f.d.head.append(style);await open(f);let modal=f.d.querySelector('.wildcardModal');assert.equal(f.w.getComputedStyle(modal).width,'min(520px, 100%)');assert.equal(parseFloat(f.w.getComputedStyle(modal).minWidth),0);assert.equal(f.w.getComputedStyle(modal).maxHeight,'calc(100dvh - 28px)');assert.equal(f.w.getComputedStyle(f.d.querySelector('.wildcardCategories')).gridTemplateColumns,'minmax(0,1fr)');
   for(const button of modal.querySelectorAll('button'))assert.ok(parseFloat(f.w.getComputedStyle(button).minHeight)>=44);
   f.w.chooseWildcardCategory('future');for(const button of f.d.querySelectorAll('.wildcardQuestion')){const computed=f.w.getComputedStyle(button);assert.ok(parseFloat(computed.minHeight)>=44);assert.equal(computed.overflowWrap,'anywhere');assert.equal(computed.whiteSpace,'normal')}
   f.w.closeInvite();style.remove();
  }
 }finally{f.close()}
});
