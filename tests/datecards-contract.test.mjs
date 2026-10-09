import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';

// Two independent member DOMs exercise shipped UI → real request handlers →
// disposable PostgreSQL. Unrelated discovery/game-piece services return empty
// fixtures. No real member, browser session, database, email or network is used.
const root=new URL('../',import.meta.url);
process.env.CHEMPAT_REVIEW_DATA='isolated-confirmed';
process.env.DATABASE_URL='postgres://synthetic-datecards-contract-only';
const db=new PGlite();
await db.exec(fs.readFileSync(new URL('schema.sql',root),'utf8'));
await db.exec('ALTER TABLE members ADD COLUMN IF NOT EXISTS email_verified_at timestamptz');
for(const name of fs.readdirSync(new URL('migrations/',root)).filter(name=>name.endsWith('.sql')).sort())await db.exec(fs.readFileSync(new URL('migrations/'+name,root),'utf8'));
const statement=(strings,values)=>({text:strings.reduce((out,part,index)=>out+(index?`$${index}`:'')+part,''),values});
const run=async(executor,{text,values=[]})=>(await executor.query(text,values)).rows;
const sql=(strings,...values)=>run(db,statement(strings,values));
sql.query=(text,values=[])=>run(db,{text,values});
sql.transaction=async build=>db.transaction(async executor=>{const tx=(strings,...values)=>statement(strings,values);tx.query=(text,values=[])=>({text,values});const out=[];for(const query of build(tx))out.push(await run(executor,query));return out});
globalThis.__datecardsContractSql=sql;
let externalRequests=0;
globalThis.fetch=async()=>{externalRequests++;throw Error('External I/O is forbidden in the date-card contract test')};
const apis={};
for(const name of ['member','connection','rewards','datecards']){
 const source=fs.readFileSync(new URL('api/'+name+'.mjs',root),'utf8')
  .replace("import {neon} from '@neondatabase/serverless';",'const neon=()=>globalThis.__datecardsContractSql;')
  .replace(/from '\.\/(.*?)\.mjs'/g,(_,dependency)=>`from ${JSON.stringify(new URL('api/'+dependency+'.mjs',root).href)}`);
 assert.ok(source.includes('const neon=()=>globalThis.__datecardsContractSql;'),'local SQL injection is active for '+name);
 apis['/api/'+name]=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
}
const hash=value=>createHash('sha256').update(value).digest('hex');
const ids={owner:'11111111-1111-4111-8111-111111111111',peer:'22222222-2222-4222-8222-222222222222'};
const tokens={owner:'a'.repeat(64),peer:'b'.repeat(64)};
const chatId='c'.repeat(64),beforeChatId='d'.repeat(64);
const photo='data:image/jpeg;base64,AA==',answers=[0,1,2,0,1];
const ordinaryMessages=[{id:'ordinary-one',by:'member',text:'Existing private conversation',at:'2026-09-01T12:00:00.000Z'},{id:'ordinary-two',by:'prospect',text:'Existing ordinary reply',reactions:{member:'like'},at:'2026-09-01T12:01:00.000Z'}];
for(const [name,id] of Object.entries(ids)){
 await db.query('INSERT INTO members(id,session_hash,name,contact,photo,answers,email_verified_at) VALUES($1,$2,$3,$4,$5,$6,now())',[id,hash(tokens[name]),name==='owner'?'Taylor':'Morgan',name+'@example.test',photo,JSON.stringify(answers)]);
 // Personal progress is deliberately below any Duhwildcards unlock.
 await db.query('INSERT INTO member_reward_state(member_id,completed_level,answers,revision) VALUES($1,1,$2,3)',[id,JSON.stringify({'synthetic-private-answer':name})]);
}
for(const [id,status,messages] of [[chatId,'chat',ordinaryMessages],[beforeChatId,'firstResults',[]]]){
 await db.query(`INSERT INTO invitations(token_hash,sender_member_id,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,channel,expires_at)
 VALUES($1,$2,'owner@example.test','Taylor',$3,$4,'Morgan','peer@example.test','email',now()+interval '1 day')`,[id,ids.owner,photo,JSON.stringify(answers)]);
 await db.query(`INSERT INTO connection_state(invitation_hash,prospect_member_id,prospect_name,prospect_photo,prospect_answers,prospect_email,status,messages)
 VALUES($1,$2,'Morgan',$3,$4,'peer@example.test',$5,$6)`,[id,ids.peer,photo,JSON.stringify(answers),status,JSON.stringify(messages)]);
}
const html=fs.readFileSync(new URL('index.html',root),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('game.js',root),'utf8');
const pages=[];
const pause=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;return {promise:new Promise(done=>{resolve=done}),resolve}};
async function fixture(as,id=chatId){
 const dom=new JSDOM(html,{url:'https://datecards.example.test/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
 const calls=[],pending=new Set();let held=null;
 // The in-process bridge uses Node Request, so its abort signal must share
 // that implementation rather than JSDOM's separate DOM realm.
 w.AbortController=globalThis.AbortController;w.AbortSignal=globalThis.AbortSignal;
 w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.fetch=(url,options={})=>{
  const work=(async()=>{
   const full=new URL(url,w.location.href),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
   assert.equal(full.origin,w.location.origin,'only in-process same-origin requests are allowed');
   const headers=new Headers(options.headers||{});headers.set('cookie','chempat_member='+tokens[as]);if(method==='POST')headers.set('origin',w.location.origin);
   calls.push({url:full.pathname+full.search,method,body,headers:Object.fromEntries(headers)});
   let response;
   const api=apis[full.pathname];
   if(api)response=await api.fetch(new Request(full,{...options,headers}));
   else{
    assert.equal(method,'GET','unrelated writes are forbidden');
    const empty={
     '/api/discovery':{modules:[],games:[],pieces:[]},
     '/api/game-pieces':{pieces:[],pendingCount:0},
     '/api/wildcards':{connections:[],eligible:false,limit:3,remaining:0,usedQuestionIds:[],categories:[],cards:[]},
     '/api/reward-requests':{incoming:[],outgoing:[]}
    };
    assert.ok(Object.hasOwn(empty,full.pathname),'unexpected request '+full.pathname);
    response=Response.json(empty[full.pathname]);
   }
   if(held&&held.match(full,method,body)){
    const current=held;held=null;
    const snapshot=await response.text();current.captured.resolve({status:response.status,body:JSON.parse(snapshot)});
    const released=await current.release.promise;if(released instanceof Error)throw released;
    return new Response(snapshot,{status:response.status,headers:response.headers});
   }
   return response;
  })();
  pending.add(work);work.finally(()=>pending.delete(work)).catch(()=>{});return work;
 };
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 async function drain(){
  for(let pass=0;pass<100;pass++){await Promise.allSettled([...pending]);await pause();if(!pending.size){await pause();if(!pending.size)return}}
  throw Error('In-process UI requests did not settle');
 }
 const f={w,d,calls,drain,holdResponse(match){assert.equal(held,null);const captured=deferred(),release=deferred();held={match,captured,release};return {captured:captured.promise,release:release.resolve,fail:()=>release.resolve(Error('Synthetic response interrupted'))}},close(){w.close()}};
 pages.push(f);await drain();
 assert.equal(w.eval('activeMemberId()'),ids[as],'each window has its own authenticated account');
 w.selectChempat(id);await drain();
 assert.equal(w.eval('s.selectedChempat'),id);
 return f;
}
const datePosts=f=>f.calls.filter(call=>call.url==='/api/datecards'&&call.method==='POST');
const messages=async id=>(await db.query('SELECT messages FROM connection_state WHERE invitation_hash=$1',[id])).rows[0].messages;
const persistedCards=async id=>(await messages(id)).filter(message=>message.type==='dateCard');
const invariants=async()=>({
 members:(await db.query('SELECT id,name,contact,photo,answers,email_verified_at FROM members ORDER BY id')).rows,
 rewards:(await db.query('SELECT * FROM member_reward_state ORDER BY member_id')).rows,
 pairs:(await db.query('SELECT invitation_hash,prospect_member_id,prospect_answers,status,ended_at,ended_by FROM connection_state ORDER BY invitation_hash')).rows,
 ordinary:(await messages(chatId)).filter(message=>message.type!=='dateCard')
});
const input=(f,selector,value)=>{const node=f.d.querySelector(selector);assert.ok(node,selector+' exists');node.value=value;node.dispatchEvent(new f.w.Event('input',{bubbles:true}));return node};
const inputWhen=(f,value)=>{
 const [day,time]=value.split('T'),[hour,minute]=time?.split(':')||[];
 input(f,'#dateWhen',day);
 for(const [selector,part] of [['#dateHour',time?String(+hour%12||12):''],['#dateMinute',minute||''],['#datePeriod',time?(+hour<12?'AM':'PM'):'']]){
  const node=input(f,selector,part);node.dispatchEvent(new f.w.Event('change',{bubbles:true}));
 }
};
const click=async(f,selector)=>{const node=f.d.querySelector(selector);assert.ok(node,selector+' exists');assert.equal(node.disabled,false,selector+' is enabled');node.click();await f.drain();return node};

// The UI contract below intentionally uses rendered controls for consent, edits
// and acceptance. Polling invokes the same public refresh entry point as the app.
try{
 const owner=await fixture('owner'),peer=await fixture('peer');
 const original=await invariants();
 assert.deepEqual(original.ordinary,ordinaryMessages);
 assert.ok(owner.d.querySelector('#message'));assert.ok(peer.d.querySelector('#message'));
 assert.equal(owner.d.querySelectorAll('.rewardSlot').length,5);
 assert.equal(owner.d.querySelectorAll('.rewardSlot.unlocked').length,1);
 assert.equal(owner.d.querySelectorAll('.sharedDateCard').length,0);
 assert.equal(peer.d.querySelectorAll('.sharedDateCard').length,0);

 await click(owner,'.dateIdeaStrip [data-date-focus="more"]');
 assert.equal(owner.d.querySelectorAll('.datePicker .dateIdeaTile').length,11);
 assert.equal(datePosts(owner).length,0,'browsing date ideas sends nothing');
 await click(owner,'.datePicker [data-date-focus="idea:dinner"]');
 assert.match(owner.d.querySelector('.dateModal').textContent,/Morgan/);
 inputWhen(owner,'2026-10-17T18:30');
 input(owner,'#datePlace','Our little neighborhood café');
 input(owner,'#dateNote','I will bring the terrible jokes.');
 await click(owner,'.dateModal [data-date-focus="save"]');
 assert.equal(datePosts(owner).length,0,'saving an idea is private and performs no POST');
 assert.equal(peer.w.localStorage.getItem('duhwild.date-ideas.'+ids.owner),null,'member windows do not share saved ideas');
 assert.deepEqual(await persistedCards(chatId),[],'browsing and personalization have not shared a card');
 await click(owner,'.dateModal [data-date-focus="send"]');
 assert.equal(owner.d.querySelector('.dateModal'),null,'successful send dismisses the editor: '+owner.d.querySelector('#dateModalError')?.textContent);
 assert.equal(datePosts(owner).length,1);
 const [sent]=await persistedCards(chatId),cardId=sent.id;
 assert.equal(sent.type,'dateCard');assert.equal(sent.by,'member');
 assert.deepEqual(Object.fromEntries(['ideaId','date','place','note','status','version','proposer'].map(key=>[key,sent.card[key]])),{
  ideaId:'dinner',date:'2026-10-17T18:30',place:'Our little neighborhood café',note:'I will bring the terrible jokes.',status:'pending',version:1,proposer:'member'
 });
 assert.match(cardId,/^[a-f0-9-]{36}$/);
 assert.equal(datePosts(owner)[0].body.id,chatId);assert.equal(datePosts(owner)[0].body.action,'send');
 assert.equal(datePosts(owner)[0].headers['x-chempat-member-id'],ids.owner);
 assert.match(datePosts(owner)[0].body.requestId,/^[a-f0-9-]{36}$/);
 assert.match(owner.d.querySelector('.sharedDateCard').textContent,/Waiting for Morgan/);
 assert.equal(owner.d.querySelector('[data-date-focus="accept:'+cardId+'"]'),null,'a proposer cannot accept their own invitation');

 peer.w.refreshDateCards();await peer.drain();
 assert.equal(peer.d.querySelector('.sharedDateCard').dataset.dateCard,cardId,'separate window loads the persisted card');
 assert.match(peer.d.querySelector('.sharedDateCard').textContent,/Our little neighborhood café/);
 assert.match(peer.d.querySelector('.sharedDateCard').textContent,/I will bring the terrible jokes/);
 const composer=input(owner,'#message','An ordinary message I am still typing');composer.focus();composer.setSelectionRange(12,18);
 await click(peer,'[data-date-focus="accept:'+cardId+'"]');
 assert.equal((await persistedCards(chatId))[0].card.status,'accepted');
 assert.equal((await persistedCards(chatId))[0].card.version,2);
 owner.w.refreshDateCards();await owner.drain();
 assert.equal(owner.d.querySelector('.sharedDateCard').dataset.dateVersion,'2');
 assert.match(owner.d.querySelector('.sharedDateCard').textContent,/Agreed/);
 assert.equal(owner.d.querySelector('.datePlan').hidden,false);assert.match(owner.d.querySelector('.datePlan').textContent,/It’s a date/);
 assert.match(owner.d.querySelector('.datePlan').textContent,/Our little neighborhood café/);
 assert.equal(owner.d.querySelector('#message'),composer,'peer updates do not reconstruct the chat composer');
 assert.equal(owner.d.activeElement,composer);assert.equal(composer.value,'An ordinary message I am still typing');
 assert.equal(composer.selectionStart,12);assert.equal(composer.selectionEnd,18);
 assert.deepEqual(await invariants(),original,'date consent preserves ordinary messages, relationship gates and all personal rewards');
 console.log('PASS visible browse/save/send → real SQL → other member accepts → shared agreement, with unsent-chat focus preserved');

 // Keep an older endpoint response in flight while a newer peer suggestion is
 // learned through the real inbox projection. Releasing the old response must
 // never resurrect an agreed version that the peer has superseded.
 const held=owner.holdResponse((url,method)=>url.pathname==='/api/datecards'&&method==='GET');
 const staleRead=owner.w.loadDateCards(chatId,true);
 const older=await held.captured;assert.equal(older.body.cards[0].card.version,2);
 await click(peer,'[data-date-focus="change:'+cardId+'"]');
 assert.equal(peer.d.querySelector('#datePlace').value,'Our little neighborhood café');
 inputWhen(peer,'2026-10-18T12:15');input(peer,'#datePlace','The courtyard café');input(peer,'#dateNote','Could we make it lunch instead?');
 await click(peer,'.dateModal [data-date-focus="send"]');
 assert.equal(datePosts(peer).at(-1).body.action,'change');assert.equal(datePosts(peer).at(-1).body.version,2);
 let revised=(await persistedCards(chatId))[0];assert.equal(revised.card.version,3);assert.equal(revised.card.proposer,'prospect');assert.equal(revised.card.status,'pending');
 assert.equal(peer.d.querySelector('[data-date-focus="accept:'+cardId+'"]'),null,'the new proposer must wait for the other member');
 await owner.w.refreshLive(true);
 held.release();await staleRead;await owner.drain();
 assert.equal(owner.d.querySelector('.sharedDateCard').dataset.dateVersion,'3','stale dedicated response cannot overwrite the newer inbox card');
 assert.match(owner.d.querySelector('.sharedDateCard').textContent,/Could we make it lunch instead/);
 assert.equal(owner.d.querySelector('.datePlan').hidden,true,'a changed agreement awaits fresh acceptance');
 assert.equal(owner.d.activeElement,composer);assert.equal(composer.value,'An ordinary message I am still typing');
 await click(owner,'[data-date-focus="accept:'+cardId+'"]');
 revised=(await persistedCards(chatId))[0];assert.equal(revised.card.version,4);assert.equal(revised.card.status,'accepted');assert.equal(revised.card.acceptedBy,'member');
 peer.w.refreshDateCards();await peer.drain();
 for(const f of [owner,peer]){assert.equal(f.d.querySelector('.sharedDateCard').dataset.dateVersion,'4');assert.equal(f.d.querySelector('.datePlan').hidden,false);assert.match(f.d.querySelector('.datePlan').textContent,/The courtyard café/)}
 assert.equal((await persistedCards(chatId)).length,1,'changes and acceptance update one stable shared card');
 assert.deepEqual(await invariants(),original);
 console.log('PASS recipient suggestion → original member acceptance, persisted versions 1–4, and stale-response rollback protection');

 // Keep a separate invitation, ordinary conversation and a private bookmark
 // unchanged while cancelling the agreed card through its visible pill.
 await click(owner,'.dateIdeaStrip [data-date-focus="idea:movie"]');
 input(owner,'#dateNote','Keep this separate invitation');await click(owner,'.dateModal [data-date-focus="send"]');
 const retained=(await persistedCards(chatId)).find(message=>message.id!==cardId);
 const retainedBefore=JSON.stringify(retained),savedIdeas=owner.w.localStorage.getItem('duhwild.date-ideas.'+ids.owner);
 await click(peer,'[data-date-focus="change:'+cardId+'"]');input(peer,'#datePlace','An unfinished edit');
 const cancelling=owner.holdResponse((url,method,body)=>url.pathname==='/api/datecards'&&method==='POST'&&body.action==='cancel');
 const cancelButton=owner.d.querySelector('[data-date-focus="cancel:'+cardId+'"]');assert.ok(cancelButton);assert.equal(cancelButton.textContent.trim(),'Cancel');
 const beforeCancelPosts=datePosts(owner).length;cancelButton.click();cancelButton.click();
 const cancelResponse=await cancelling.captured;assert.equal(cancelResponse.status,200);
 assert.equal(datePosts(owner).length,beforeCancelPosts+1,'rapid repeat clicks produce one cancellation request');
 for(const button of owner.d.querySelectorAll('.sharedDateCard .dateCardActions button'))assert.equal(button.disabled,true);
 cancelling.release();await owner.drain();
 const cancelBody=datePosts(owner).at(-1).body;
 assert.deepEqual(Object.keys(cancelBody).sort(),['action','cardId','id','requestId','version']);assert.equal(cancelBody.cardId,cardId);assert.equal(cancelBody.version,4);
 const cancelled=(await persistedCards(chatId)).find(message=>message.id===cardId);assert.equal(cancelled.card.status,'cancelled');assert.equal(cancelled.card.version,5);
 assert.ok(!cancelResponse.body.cards.some(message=>message.id===cardId),'successful response excludes the cancelled card');
 assert.equal(owner.d.querySelector('[data-date-card="'+cardId+'"]'),null);assert.equal(owner.d.querySelector('.datePlan').hidden,true);
 peer.w.refreshDateCards();await peer.drain();assert.equal(peer.d.querySelector('[data-date-card="'+cardId+'"]'),null);assert.equal(peer.d.querySelector('.datePlan').hidden,true);assert.equal(peer.d.querySelector('.dateModal'),null,'peer removal closes an obsolete edit');
 const peerPostsBefore=datePosts(peer).length;await peer.w.submitDateCard();assert.equal(datePosts(peer).length,peerPostsBefore,'the cancelled draft cannot be submitted');
 for(const f of [owner,peer]){await f.w.refreshLive(true);f.w.refreshDateCards();await f.drain();assert.equal(f.d.querySelector('[data-date-card="'+cardId+'"]'),null);assert.ok(f.d.querySelector('[data-date-card="'+retained.id+'"]'));assert.match(f.d.querySelector('.dateMessages').textContent,/Existing private conversation/)}
 assert.equal(owner.d.querySelector('#message'),composer);assert.equal(composer.value,'An ordinary message I am still typing');
 assert.equal(owner.w.localStorage.getItem('duhwild.date-ideas.'+ids.owner),savedIdeas);
 assert.equal(JSON.stringify((await persistedCards(chatId)).find(message=>message.id===retained.id)),retainedBefore,'another datecard is byte-for-byte unchanged');
 assert.deepEqual(await invariants(),original);
 for(const as of ['owner','peer']){const fresh=await fixture(as);assert.equal(fresh.d.querySelector('[data-date-card="'+cardId+'"]'),null);assert.ok(fresh.d.querySelector('[data-date-card="'+retained.id+'"]'));assert.equal(fresh.d.querySelector('.datePlan').hidden,true);assert.equal(datePosts(fresh).length,0);fresh.close()}
 const originalSend=datePosts(owner).find(call=>call.body.action==='send');
 const repeated=await owner.w.fetch('/api/datecards',{method:'POST',headers:{'content-type':'application/json','x-chempat-member-id':ids.owner},body:JSON.stringify(originalSend.body)});
 assert.equal(repeated.status,200);assert.ok(!(await repeated.json()).cards.some(message=>message.id===cardId));assert.equal((await persistedCards(chatId)).find(message=>message.id===cardId).card.version,5,'retrying an old successful send cannot restore a cancelled card');
 console.log('PASS visible cancellation of agreement removes both views and reloads while preserving the other card, normal chat, current draft and saved idea');

 // A real commit with a lost response remains a single operation on retry.
 const interrupted=owner.holdResponse((url,method,body)=>url.pathname==='/api/datecards'&&method==='POST'&&body.action==='cancel');
 owner.d.querySelector('[data-date-focus="cancel:'+retained.id+'"]').click();await interrupted.captured;interrupted.fail();await owner.drain();
 const uncertainBody=datePosts(owner).at(-1).body;
 assert.equal((await persistedCards(chatId)).find(message=>message.id===retained.id).card.status,'cancelled');
 const retryCancel=owner.d.querySelector('[data-date-focus="cancel:'+retained.id+'"]');assert.ok(retryCancel);assert.match(retryCancel.textContent,/Retry cancel/);await click(owner,'[data-date-focus="cancel:'+retained.id+'"]');
 assert.deepEqual(datePosts(owner).at(-1).body,uncertainBody,'retry sends the same request and expected version');
 assert.equal((await persistedCards(chatId)).find(message=>message.id===retained.id).card.version,2);
 assert.equal(owner.d.querySelector('[data-date-card="'+retained.id+'"]'),null);
 await click(peer,'[data-date-focus="accept:'+retained.id+'"]');assert.equal(datePosts(peer).at(-1).body.action,'accept');assert.equal(peer.d.querySelector('[data-date-card="'+retained.id+'"]'),null);assert.equal((await persistedCards(chatId)).find(message=>message.id===retained.id).card.version,2,'stale acceptance cannot revive the cancelled invitation');
 await click(owner,'.dateIdeaStrip [data-date-focus="idea:dinner"]');input(owner,'#dateNote','A new pending invitation');await click(owner,'.dateModal [data-date-focus="send"]');
 const recipientPending=(await persistedCards(chatId)).find(message=>message.card.status==='pending');assert.ok(recipientPending);
 peer.w.refreshDateCards();await peer.drain();await click(owner,'[data-date-focus="change:'+recipientPending.id+'"]');input(owner,'#datePlace','This change is now stale');
 await click(peer,'[data-date-focus="cancel:'+recipientPending.id+'"]');await click(owner,'.dateModal [data-date-focus="send"]');assert.equal(datePosts(owner).at(-1).body.action,'change');assert.equal(owner.d.querySelector('.dateModal'),null);assert.equal((await persistedCards(chatId)).find(message=>message.id===recipientPending.id).card.version,2,'stale edits cannot revive the cancelled invitation');
 for(const f of [owner,peer])assert.equal(f.d.querySelectorAll('.sharedDateCard').length,0);
 assert.deepEqual(await invariants(),original);
 console.log('PASS pending-card cancellation by both participants, including a committed-response-loss retry with no repeated mutation');

 // UI integration for an accepted connection before ordinary chat opens.
 owner.w.selectChempat(beforeChatId);peer.w.selectChempat(beforeChatId);await owner.drain();await peer.drain();
 for(const f of [owner,peer]){
  assert.equal(f.d.querySelector('#message'),null,'datecards do not open ordinary Private Chat');
  assert.ok(f.d.querySelector('.dateBeforeChat .dateIdeas'),'date ideas are available before chat and below Level 3');
  assert.equal(f.d.querySelectorAll('.rewardSlot.unlocked').length,1);
  assert.equal(f.d.querySelectorAll('.dateBeforeChat .inlineMessage').length,0);
 }
 await click(owner,'.dateBeforeChat .dateIdeaStrip [data-date-focus="more"]');
 await click(owner,'.datePicker [data-date-focus="idea:picnic"]');
 input(owner,'#datePlace','The riverside picnic tables');input(owner,'#dateNote','Something simple while we keep getting to know each other.');
 await click(owner,'.dateModal [data-date-focus="send"]');
 const [beforeCard]=await persistedCards(beforeChatId);assert.equal(beforeCard.card.ideaId,'picnic');
 peer.w.refreshDateCards();await peer.drain();
 assert.equal(peer.d.querySelector('.sharedDateCard').dataset.dateCard,beforeCard.id);
 await click(peer,'[data-date-focus="accept:'+beforeCard.id+'"]');
 owner.w.refreshDateCards();await owner.drain();
 for(const f of [owner,peer]){assert.equal(f.d.querySelector('#message'),null);assert.equal(f.d.querySelector('.datePlan').hidden,false);assert.match(f.d.querySelector('.datePlan').textContent,/riverside picnic/)}
 const forbidden=await owner.w.fetch('/api/connection',{method:'POST',headers:{'content-type':'application/json','x-chempat-member-id':ids.owner},body:JSON.stringify({action:'message',id:beforeChatId,text:'This must not become an ordinary message'})});
 assert.equal(forbidden.status,409,'the existing backend chat gate still rejects an ordinary private message');
 assert.equal((await messages(beforeChatId)).filter(message=>message.type!=='dateCard').length,0);
 assert.deepEqual(await invariants(),original);
 peer.close();
 const reopened=await fixture('peer',beforeChatId);
 assert.equal(reopened.d.querySelector('.sharedDateCard').dataset.dateCard,beforeCard.id,'a fresh browser recovers the persisted pre-chat datecard');
 assert.equal(reopened.d.querySelector('.sharedDateCard').dataset.dateVersion,'2');
 assert.equal(reopened.d.querySelector('.datePlan').hidden,false);
 assert.equal(reopened.d.querySelector('#message'),null);
 assert.equal(datePosts(reopened).length,0,'reload does not resend or reaccept a datecard');
 assert.deepEqual(await invariants(),original);
 // The recipient can also cancel an agreed card before ordinary chat opens.
 await click(reopened,'[data-date-focus="cancel:'+beforeCard.id+'"]');owner.w.refreshDateCards();await owner.drain();
 for(const f of [owner,reopened]){assert.equal(f.d.querySelectorAll('.sharedDateCard').length,0);assert.equal(f.d.querySelector('.datePlan').hidden,true);assert.equal(f.d.querySelector('#message'),null)}
 for(const as of ['owner','peer']){const fresh=await fixture(as,beforeChatId);assert.equal(fresh.d.querySelectorAll('.sharedDateCard').length,0);assert.equal(fresh.d.querySelector('.datePlan').hidden,true);fresh.close()}
 assert.equal((await persistedCards(beforeChatId))[0].card.status,'cancelled');assert.deepEqual(await invariants(),original);
 console.log('PASS recipient cancellation of a pre-chat agreement clears both plan strips and survives fresh reloads');
 assert.equal(externalRequests,0);
 for(const f of [owner,peer,reopened])assert.ok(f.calls.every(call=>call.method==='GET'||call.url==='/api/datecards'||call.url==='/api/connection'&&call.body.action==='message'),'no email, sharing, progress or unrelated writes were issued');
 console.log('PASS accepted before-chat pair shares and reloads plans independently of game progress while ordinary-chat gates, rewards and existing messages remain unchanged');
 // Removing datecards from the inbox projection must not shift the ordinary
 // message's storage index when the existing reaction control is used later.
 owner.w.selectChempat(chatId);await owner.drain();
 const normal=await owner.w.fetch('/api/connection',{method:'POST',headers:{'content-type':'application/json','x-chempat-member-id':ids.owner},body:JSON.stringify({action:'message',id:chatId,text:'Ordinary message after the removed cards'})});
 assert.equal(normal.status,200);const ordinaryResult=await normal.json();
 const rawBeforeReaction=await messages(chatId),rawIndex=rawBeforeReaction.findIndex(message=>message.text==='Ordinary message after the removed cards');
 const projected=ordinaryResult.messages.find(message=>message.text==='Ordinary message after the removed cards');assert.ok(projected);assert.equal(projected.messageIndex,rawIndex);assert.ok(rawIndex>ordinaryResult.messages.indexOf(projected));
 await owner.w.refreshLive(true);await owner.drain();
 const shownIndex=owner.w.eval(`chatSelection().messages.findIndex(message=>message.text==='Ordinary message after the removed cards')`);assert.ok(shownIndex>=0);
 await owner.w.reactChat(shownIndex,'like');await owner.drain();
 const afterReaction=await messages(chatId);assert.equal(afterReaction[rawIndex].reactions.member,'like');assert.deepEqual(afterReaction.slice(0,rawIndex),rawBeforeReaction.slice(0,rawIndex),'the reaction leaves every earlier ordinary message and cancelled card unchanged');
 assert.equal(owner.calls.at(-1).body.action,'react');assert.equal(owner.calls.at(-1).body.index,rawIndex);assert.equal(externalRequests,0);
 console.log('PASS ordinary-message reactions retain the correct storage index after cancelled cards are removed from the visible inbox');

}finally{
 for(const page of pages)page.close();
 await db.close();
}
