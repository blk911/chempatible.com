import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const photo='data:image/jpeg;base64,AA==',otherPhoto='data:image/jpeg;base64,AQ==';
const key='chempatibility.walkthrough.v7';
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const flush=async()=>{await pause();await pause()};
const sender={id:'sender',name:'Alex Sender',contact:'alex@example.com',photo,answers:[0,1,2,0,1],verified:true};
const existing={id:'existing',name:'Morgan Member',contact:'morgan@example.com',photo:otherPhoto,answers:Array(10).fill(2),verified:true};

function service(){
 const members=new Map([[sender.id,{...sender}],[existing.id,{...existing}]]),invites=new Map([['friend-token',{id:'friend-one',sender:sender.id,status:'invited',token:'friend-token',intended:{name:existing.name,email:existing.contact}}]]),connections=[],calls=[];
 let failAccept=0,loseAccept=0,failCreate=0;
 const response=(body,status=200)=>({ok:status<400,status,json:async()=>structuredClone(body)});
 const row=(c,me)=>{const from=members.get(c.sender),to=members.get(c.recipient);return {id:c.id,kind:'friend',channel:'friend',status:c.status,canCancel:c.status==='invited'&&me===c.sender,canBlock:!!to,canReport:!!to&&c.status!=='invited',side:me===c.sender?'member':'prospect',sender_name:from.name,sender_photo:from.photo,recipient_name:c.intended?.name||'',recipient_email:null,prospect_name:to?.name||'',prospect_email:null,prospect_photo:to?.photo||'',sender_answers:[],prospect_answers:[],own_answers:[],messages:c.messages||[],claimed:!!to,invitedAt:'2026-09-30T10:00:00Z'}};
 function client(initial){let account=initial;return {get account(){return account},setAccount:id=>{account=id},fetch:async(url,options={})=>{
  assert.ok(url.startsWith('/api/'),'test never contacts any external service');
  const body=options.body?JSON.parse(options.body):null;calls.push({url,body,account});
  if(url==='/api/discovery?pieces=1')return response({pieces:[]});
  if(url==='/api/member'){
   if(!body)return members.has(account)?response({member:members.get(account)}):response({},401);
   if(body.action==='code_start')return response({ok:true});
   if(body.action==='code_verify'){const found=[...members.values()].find(m=>m.contact===body.email);if(found){account=found.id;found.verified=true;return response({existing:true,member:found})}return response({existing:false,email:body.email})}
   if(body.action==='register'){const member={...body,id:'new-member',verified:true};delete member.action;members.set(member.id,member);account=member.id;return response({member})}
   if(body.action==='answers'){members.get(account).answers=body.answers;return response({member:members.get(account)})}
   if(body.action==='logout'){account=null;return response({ok:true})}
   throw Error(`Unexpected member action ${body.action}`);
  }
  if(url.startsWith('/api/friend?invite=')){const token=new URL(url,'https://friend.example').searchParams.get('invite'),invite=invites.get(token);if(!invite)return response({error:'Invitation unavailable.'},404);const from=members.get(invite.sender),viewer=members.get(account);if(account===invite.sender)return response({kind:'friend',status:'own',invitationStatus:invite.status,expiresAt:'2099-01-01T00:00:00Z'});return response({kind:'friend',status:invite.status==='declined'?'closed':invite.status,expiresAt:'2099-01-01T00:00:00Z',...(invite.status==='invited'?{name:from.name,photo:from.photo,...(viewer?{canDecline:viewer.verified&&invite.intended?.email===viewer.contact}:{})}:{})})}
  if(url==='/api/friend'){
   if(body.action==='create'){assert.ok(body.recipient?.name);assert.match(body.recipient.email,/^[^\s@]+@example\.com$/);if(failCreate-- >0)return response({error:'Sending the invitation was interrupted. Try again.'},503);const token=`created-${invites.size}`,id=`friend-${invites.size+1}`;invites.set(token,{id,sender:account,status:'invited',token,intended:{...body.recipient}});return response({id,url:`/friend?friend=${token}`,token,expiresAt:'2099-01-01T00:00:00Z',kind:'friend',recipient:{...body.recipient},code:token.slice(0,8).toUpperCase()})}
   if(body.action==='decline'){
    const invite=invites.get(body.token),member=members.get(account);if(!member)return response({error:'Your sign-in expired. Sign in again.',sessionExpired:true},401);
    if(!member.verified)return response({error:'Verify your email to respond.',needsVerify:true},403);
    if(invite.sender===account)return response({error:'This is your invitation.'},409);
    if(invite.intended?.email!==member.contact)return response({error:'Sign in with the invited email.'},403);
    if(invite.status==='declined'&&invite.declinedBy===account)return response({ok:true,kind:'friend',status:'declined'});
    if(invite.status!=='invited')return response({error:'This invitation is no longer available.'},410);
    invite.status='declined';invite.declinedBy=account;return response({ok:true,kind:'friend',status:'declined'});
   }
   if(body.action==='accept'){
    if(failAccept-- >0)return response({error:'Connecting was interrupted. Try again.'},503);
    const invite=invites.get(body.token);if(!account)return response({error:'Your sign-in expired. Sign in again.',sessionExpired:true},401);if(!members.get(account).verified)return response({error:'Verify your email to connect.',needsVerify:true},403);if(invite.sender===account)return response({error:'Send this invitation to your friend to accept.'},409);
    if(invite.status==='used'&&invite.recipient!==account)return response({error:'This invitation has already been used.'},409);
    if(!['invited','used'].includes(invite.status))return response({error:'This invitation is no longer available.'},409);
    if(!invite.recipient){invite.recipient=account;invite.status='used';connections.push({id:invite.id,sender:invite.sender,recipient:account,status:'chat',messages:[]})}
    if(loseAccept-- >0)throw Error('The connection response was interrupted. Try again.');
    return response({ok:true,id:invite.id,kind:'friend',status:'chat'});
   }
  }
  if(url==='/api/connection?inbox=1')return response({connections:[...connections.filter(c=>[c.sender,c.recipient].includes(account)).map(c=>row(c,account)),...([...invites.values()].filter(i=>i.sender===account&&i.status==='invited').map(i=>row({...i,messages:[]},account)))]});
  if(url==='/api/connection'){
   const c=connections.find(c=>c.id===body.id);assert.ok(c,'chat must address accepted friend connection ID');
   if(body.action==='message'){c.messages.push({by:account===c.sender?'member':'prospect',text:body.text,...(body.photo?{photo:body.photo}:{})});return response({messages:c.messages})}
   if(['unmatch','report'].includes(body.action)){c.status='ended';c.messages=[];return response({ok:true})}
   throw Error(`Friend must not invoke romantic action ${body.action}`);
  }
  throw Error(`Unexpected isolated API ${url}`);
 }};}
 return {members,invites,connections,calls,client,failAccept:()=>{failAccept=1},loseAccept:()=>{loseAccept=1},failCreate:()=>{failCreate=1}};
}
function browser(server,{account=null,url='https://friend.example/',saved}={}){
 const dom=new JSDOM(html,{url,runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document,client=server.client(account),copied=[],noticeTimers=[];
 const setTimeout=w.setTimeout.bind(w);w.setTimeout=(callback,delay,...args)=>delay===1800?(noticeTimers.push(()=>callback(...args)),0):setTimeout(callback,delay,...args);
 if(saved)w.sessionStorage.setItem(key,saved);
 w.fetch=client.fetch;w.setInterval=()=>0;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>{copied.push(text)}}});
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 return {dom,w,d,client,copied,expireNotice:()=>noticeTimers.splice(0).forEach(callback=>callback()),state:()=>JSON.parse(w.eval('JSON.stringify(s)')),saved:()=>w.sessionStorage.getItem(key),close:()=>dom.window.close()};
}
const clickText=(f,text)=>{const el=[...f.d.querySelectorAll('button')].find(b=>b.textContent.includes(text));assert.ok(el,`button ${text} exists`);el.click();return el};

function fillFriend(f,{name=existing.name,email=existing.contact}={}){
 f.d.querySelector('#friendName').value=name;f.d.querySelector('#friendEmail').value=email;
}
async function sendFriend(f,recipient){f.w.openFriendShare();fillFriend(f,recipient);await f.w.makeFriendInvitation();await flush();return f.state().friendShare}
function showSentFriend(f){f.w.eval("s.modal='friendShare';renderModal()");assert.ok(f.d.querySelector('#friendShareLink'))}

// All API and verification requests below are in-memory stubs. No live account or email writes.
test('new friend registers with zero answers, explicitly connects, chats on both sides, and can later play their five',async()=>{
 const server=service(),recipient=browser(server,{url:'https://friend.example/?friend=friend-token'}),from=browser(server,{account:sender.id});
 try{
  await flush();assert.equal(recipient.w.location.search,'');assert.match(recipient.d.querySelector('#root').textContent,/Alex invited you/);assert.equal(recipient.d.querySelector('.question'),null);
  assert.equal(recipient.d.querySelector('#joinName'),null);await recipient.w.acceptFriendInvitation();recipient.d.querySelector('#joinName').value='Riley New';recipient.d.querySelector('#joinContact').value='riley@example.com';recipient.d.querySelector('#joinAgree').checked=true;
  recipient.w.nextJoinStep();await flush();recipient.d.querySelector('#signinCode').value='123456';await recipient.w.signinVerify();
  assert.match(recipient.d.querySelector('#root').textContent,/Add your picture/);recipient.w.eval(`s.member.photo='${otherPhoto}'`);await recipient.w.finishRegistration();
  assert.equal(server.calls.filter(c=>c.body?.action==='accept').length,0,'registration never accepts silently');
  assert.deepEqual(server.calls.find(c=>c.body?.action==='register').body.answers,[]);assert.equal(recipient.d.querySelector('.question'),null);
  assert.match(recipient.d.querySelector('#root').textContent,/ACCEPTPASS/);await recipient.w.acceptFriendInvitation();await flush();
  assert.match(recipient.d.querySelector('.friendRail').textContent,/Alex/);assert.equal(recipient.d.querySelector('.friendRail .secretsButton'),null);assert.equal(recipient.d.querySelector('.sharedContact'),null);
  assert.equal(recipient.d.querySelectorAll('.inlineComposer').length,1);assert.equal(recipient.state().member.answers.length,0);
  assert.equal(recipient.d.querySelector('#connectionName').textContent,'Alex');recipient.d.querySelector('#message').value='Hello Alex';await recipient.w.sendMessage();
  await from.w.refreshLive();assert.match(from.d.querySelector('.friendRail').textContent,/Riley/);from.w.eval(`selectChempat('friend-one')`);
  assert.match(from.d.querySelector('.inlineChat').textContent,/Hello Alex/);assert.equal(from.d.querySelector('.friendRail .secretsButton'),null);
  from.d.querySelector('#message').value='Hello Riley';await from.w.sendMessage();await recipient.w.refreshLive();assert.match(recipient.d.querySelector('.inlineChat').textContent,/Hello Riley/);
  const fileInput=recipient.d.querySelector('#chatPhotoInput');Object.defineProperty(fileInput,'files',{value:[new recipient.w.File(['photo'],'image.jpg',{type:'image/jpeg'})]});
  recipient.w.URL.createObjectURL=()=> 'blob:isolated-photo';recipient.w.URL.revokeObjectURL=()=>{};recipient.w.Image=class{width=320;height=320;set src(_){this.onload()}};
  recipient.w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});recipient.w.HTMLCanvasElement.prototype.toDataURL=()=>otherPhoto;
  await recipient.w.sendChatPhoto({currentTarget:fileInput});await recipient.w.sendMessage();await from.w.refreshLive();assert.equal(from.d.querySelector('.chatPhoto').getAttribute('src'),otherPhoto);
  assert.equal(server.calls.filter(c=>c.body?.action==='message').at(-1).body.id,'friend-one');
  assert.match(recipient.d.querySelector('.connectionMenu').textContent,/Report/);
  recipient.w.createMyVibe();assert.ok(recipient.d.querySelector('.question'));for(let i=0;i<5;i++){recipient.w.eval('quickLockUntil=0');await recipient.w.chooseQuick(i%3,i)}
  assert.deepEqual(server.members.get('new-member').answers,[0,1,2,0,1]);assert.equal(server.connections[0].status,'chat');
  assert.match(recipient.d.querySelector('.friendRail').textContent,/Alex/);assert.ok(recipient.d.querySelector('.connectionsHeading .friendShareButton'));
 }finally{recipient.close();from.close()}
});

test('existing member accepts directly, with no codes or answer changes, and reload restores the friend chat',async()=>{
 const server=service(),f=browser(server,{account:existing.id,url:'https://friend.example/?friend=friend-token'});let reloaded;
 try{await flush();assert.match(f.d.querySelector('#root').textContent,/ACCEPTPASS/);assert.equal(server.calls.filter(c=>c.body).length,0);await f.w.acceptFriendInvitation();await flush();assert.deepEqual(f.state().member.answers,existing.answers);assert.equal(server.calls.filter(c=>['code_start','code_verify','register'].includes(c.body?.action)).length,0);reloaded=browser(server,{account:existing.id,saved:f.saved()});await flush();assert.equal(reloaded.d.querySelector('#connectionName').textContent,'Alex');assert.ok(reloaded.d.querySelector('.inlineComposer'));assert.equal(reloaded.d.querySelector('.friendRail .secretsButton'),null)}finally{f.close();reloaded?.close()}
});

test('signup reload, sign in, back/cancel and replacing a pending link preserve the intended invitation',async()=>{
 const server=service(),f=browser(server,{url:'https://friend.example/?friend=friend-token'});let reloaded;
 try{
  await flush();await f.w.acceptFriendInvitation();f.d.querySelector('#joinName').value='Morgan';f.d.querySelector('#joinContact').value=existing.contact;f.w.showFriendInvitation();assert.equal(f.state().member.name,'Morgan');assert.match(f.d.querySelector('#root').textContent,/ACCEPTPASS/);await f.w.acceptFriendInvitation();
  f.d.querySelector('#joinAgree').checked=true;f.w.nextJoinStep();await flush();assert.equal(f.state().joinStep,'joinCode');
  reloaded=browser(server,{saved:f.saved()});await flush();assert.ok(reloaded.d.querySelector('#signinCode'));assert.equal(reloaded.state().friendToken,'friend-token');
  server.invites.set('replacement-token',{id:'replacement',sender:sender.id,status:'invited',token:'replacement-token'});await reloaded.w.openFriendInvitation('replacement-token');assert.equal(reloaded.state().member.name,'Morgan');await reloaded.w.acceptFriendInvitation();reloaded.w.eval("s.joinStep='joinCode';render()");assert.ok(reloaded.d.querySelector('#signinCode'));
  reloaded.d.querySelector('#signinCode').value='123456';await reloaded.w.signinVerify();await flush();assert.equal(reloaded.state().friendToken,'replacement-token');assert.equal(server.connections.length,0);
  await reloaded.w.acceptFriendInvitation();assert.equal(server.connections[0].id,'replacement');assert.equal(server.invites.get('friend-token').status,'invited');
  await reloaded.w.openFriendInvitation('friend-token');reloaded.w.dismissFriendInvitation();assert.equal(reloaded.state().friendToken,'');assert.equal(server.connections.length,1);
 }finally{f.close();reloaded?.close()}
});

test('named friend email keeps invalid and failed forms open, then closes on success without changing the active Vibe',async()=>{
 const server=service(),f=browser(server,{account:existing.id});
 try{
  await flush();const vibe={id:'vibe',side:'prospect',kind:'vibe',sender_name:'Jordan',sender_photo:photo,sender_answers:[0,1,0,1,0],prospect_answers:existing.answers,own_answers:existing.answers,status:'secondFive',messages:[]};
  f.w.eval(`s.inbox=[${JSON.stringify(vibe)}];s.liveId='vibe';s.selectedChempat='vibe';applyConnection(s.inbox[0]);render()`);
  const snapshot=()=>{const state=f.state();return {actor:state.actor,member:state.member,prospect:state.prospect,liveId:state.liveId,phase:state.phase,pairOwnAnswers:state.pairOwnAnswers}};
  const before=snapshot(),nativeFetch=f.w.fetch;f.w.fetch=async(url,options)=>{const response=await nativeFetch(url,options);if(url!=='/api/connection?inbox=1')return response;const body=await response.json();return {ok:true,json:async()=>({connections:[vibe,...body.connections]})}};
  const callsBefore=server.calls.length;f.w.openFriendShare();await flush();assert.equal(server.calls.length,callsBefore,'opening the form sends no email');assert.equal(f.copied.length,0);
  await f.w.makeFriendInvitation();assert.match(f.d.querySelector('#friendShareError').textContent,/name and email/);assert.equal(server.calls.length,callsBefore);
  fillFriend(f,{name:'Morgan Member',email:'not-an-email'});await f.w.makeFriendInvitation();assert.equal(f.d.querySelector('#friendName').value,'Morgan Member');assert.equal(f.d.querySelector('#friendEmail').value,'not-an-email');assert.equal(f.state().modal,'friendShare');assert.equal(server.calls.length,callsBefore);
  fillFriend(f,{name:'  Morgan Member  ',email:'  MORGAN@EXAMPLE.COM  '});server.failCreate();await f.w.makeFriendInvitation();
  assert.match(f.d.querySelector('#friendShareError').textContent,/interrupted/);assert.equal(f.d.querySelector('#friendName').value,'Morgan Member');assert.equal(f.d.querySelector('#friendEmail').value,'morgan@example.com');assert.equal(f.state().modal,'friendShare');assert.equal(f.state().friendShare,null);assert.equal(f.copied.length,0);assert.deepEqual(snapshot(),before);
  await f.w.makeFriendInvitation();await flush();assert.equal(f.state().modal,'');assert.equal(f.d.querySelector('#modalHost').textContent,'');assert.match(f.d.querySelector('.friendRail').textContent,/Morgan/);assert.doesNotMatch(f.d.querySelector('.friendRail').textContent,/morgan@example\.com/);assert.equal(f.d.querySelector('#connectionName').textContent,'Morgan');assert.equal(f.d.querySelector('.inlineComposer'),null,'pending friend invitation cannot open chat');
  assert.equal(f.state().notice,'Invite sent to Morgan.');assert.deepEqual(f.state().friendShare.recipient,{name:'Morgan Member',email:'morgan@example.com'});assert.deepEqual(server.calls.filter(c=>c.body?.action==='create').at(-1).body.recipient,{name:'Morgan Member',email:'morgan@example.com'});assert.equal(f.copied.length,0);assert.deepEqual(snapshot(),before);
  f.expireNotice();assert.equal(f.state().notice,'');assert.equal(f.d.querySelector('#modalHost').textContent,'');assert.equal(f.d.querySelector('#connectionName').textContent,'Morgan','pending recipient stays visible after confirmation disappears');
  showSentFriend(f);assert.match(f.d.querySelector('#friendShareLink').value,/^https:\/\/friend\.example\/friend\?friend=/);assert.equal(f.copied.length,0);await f.w.copyFriendInvitation();assert.match(f.copied[0],/^Come try Duh Wild with me\.\nInvite code: CREATED-\nhttps:\/\/friend\.example/);assert.deepEqual(snapshot(),before);
 }finally{f.close()}
});

test('friend selection and chat never replace Vibe answers, pair ID, consent phase, or drafts',async()=>{
 const server=service(),f=browser(server,{account:existing.id,url:'https://friend.example/?friend=friend-token'});
 try{
  await flush();await f.w.acceptFriendInvitation();const friend=f.state().friends[0],vibe={id:'vibe',side:'member',sender_name:existing.name,sender_photo:otherPhoto,prospect_name:'Jordan',prospect_photo:photo,sender_answers:existing.answers,prospect_answers:[1,0,1,0,1],own_answers:existing.answers,status:'chat',messages:[]};
  f.w.eval(`s.inbox=[${JSON.stringify(vibe)}];s.liveId='vibe';s.selectedChempat='vibe';applyConnection(s.inbox[0]);render()`);
  f.d.querySelector('#message').value='Vibe draft';const before=f.state();f.w.eval(`selectChempat('${friend.id}',true)`);const after=f.state();
  for(const field of ['liveId','liveToken','actor','phase','member','prospect','pairOwnAnswers'])assert.deepEqual(after[field],before[field],field+' preserved');
  assert.equal(after.secretsFor,'');assert.equal(f.d.querySelector('.focusReveals'),null);assert.equal(f.d.querySelector('.friendRail .secretsButton'),null);assert.ok(f.d.querySelector('.chempatRail:not(.friendRail) .secretsButton'));
  assert.equal(f.d.querySelector('#connectionName').textContent,'Alex');f.d.querySelector('#message').value='Friend draft';f.w.eval(`selectChempat('vibe')`);assert.equal(f.d.querySelector('#message').value,'Vibe draft');f.w.eval(`selectChempat('${friend.id}')`);assert.equal(f.d.querySelector('#message').value,'Friend draft');
  f.w.eval(`s.view='conversation';render()`);assert.equal(f.state().view,'dashboard');assert.doesNotMatch(f.d.querySelector('.connectionFocus').textContent,/Our Secrets|SHARE MY EMAIL|PLAY THE NEXT FIVE/);
 }finally{f.close()}
});

test('transient accept errors and lost replies recover explicitly; used or expired links never open another account chat',async()=>{
 const server=service(),f=browser(server,{account:existing.id,url:'https://friend.example/?friend=friend-token'});let restored,other;
 try{
  await flush();server.failAccept();await f.w.acceptFriendInvitation();assert.match(f.d.querySelector('#friendError').textContent,/interrupted/);assert.equal(f.state().friendToken,'friend-token');assert.equal(server.connections.length,0);
  server.loseAccept();await f.w.acceptFriendInvitation();assert.equal(server.connections.length,1);assert.equal(f.state().friendToken,'friend-token');restored=browser(server,{account:existing.id,saved:f.saved()});await flush();assert.match(restored.d.querySelector('#root').textContent,/OPEN FRIEND CONNECTION/);await restored.w.acceptFriendInvitation();assert.equal(server.connections.length,1);assert.ok(restored.d.querySelector('.inlineComposer'));
  other=browser(server,{account:sender.id,url:'https://friend.example/?friend=friend-token'});await flush();const calls=server.calls.filter(c=>c.body?.action==='accept').length;await other.w.acceptFriendInvitation();assert.match(other.d.querySelector('#root').textContent,/You sent this invitation/);assert.equal(server.calls.filter(c=>c.body?.action==='accept').length,calls);assert.equal(other.d.querySelector('.inlineComposer'),null);
  server.invites.set('expired',{id:'old',sender:sender.id,status:'expired',token:'expired'});other.client.setAccount(existing.id);await other.w.openFriendInvitation('expired');assert.match(other.d.querySelector('#root').textContent,/no longer available/);assert.equal(other.d.querySelector('.inlineComposer'),null);assert.equal([...other.d.querySelectorAll('button')].some(b=>b.textContent.includes('Connect as friends')),false);
 }finally{f.close();restored?.close();other?.close()}
});

test('fresh URL tokens take precedence over saved invitations',async()=>{
 const server=service(),original=browser(server,{url:'https://friend.example/?friend=friend-token'});let freshFriend,freshVibe;
 try{
  await flush();const saved=original.saved();server.invites.set('new-link',{id:'new',sender:sender.id,status:'invited'});
  freshFriend=browser(server,{url:'https://friend.example/?friend=new-link',saved});await flush();assert.equal(freshFriend.state().friendToken,'new-link');
  const before=server.calls.length;freshVibe=browser(server,{url:'https://friend.example/?invite=fresh-vibe-token',saved});await flush();
  assert.ok(server.calls.slice(before).some(c=>c.url==='/api/connection?invite=fresh-vibe-token'),'fresh Vibe is opened');assert.equal(server.calls.slice(before).some(c=>c.url.includes('/api/friend?invite=')),false,'stale saved friend cannot hijack fresh Vibe');assert.equal(freshVibe.state().friendToken,'');
 }finally{original.close();freshFriend?.close();freshVibe?.close()}
});

test('sender cancels a named pending friend and each new successful email send creates a fresh one-use token',async()=>{
 const server=service(),f=browser(server,{account:sender.id});
 try{
  await flush();f.w.eval(`selectChempat('friend-one')`);assert.equal(f.d.querySelector('#connectionName').textContent,'Morgan');assert.equal(f.d.querySelector('.freezeConnection').textContent,'Freezer');clickText(f,'Freezer');assert.match(f.d.querySelector('.endModal').textContent,/cancels the invitation immediately/);
  const fetch=f.w.fetch;f.w.fetch=async(url,options)=>{const body=options?.body&&JSON.parse(options.body);if(url==='/api/connection'&&body.action==='freeze'){assert.equal(body.id,'friend-one');server.invites.get('friend-token').status='closed';return {ok:true,json:async()=>({ok:true})}}return fetch(url,options)};
  await f.w.confirmEnd();await flush();assert.equal(server.invites.get('friend-token').status,'closed');assert.equal(f.d.querySelector('.inlineComposer'),null);
  const first=(await sendFriend(f)).token;await f.w.copyFriendInvitation();f.w.openFriendShare();await flush();assert.equal(f.state().friendShare,null);assert.equal(server.calls.filter(c=>c.body?.action==='create').length,1,'new form does not create automatically');fillFriend(f);await f.w.makeFriendInvitation();const second=f.state().friendShare.token;assert.notEqual(first,second);assert.equal(f.copied.length,1,'opening another form never copies automatically');
  const recipient=browser(server,{account:existing.id,url:`https://friend.example/?friend=${second}`});try{await flush();await recipient.w.acceptFriendInvitation()}finally{recipient.close()}
  const third=await sendFriend(f,{name:'Riley Friend',email:'riley@example.com'});assert.notEqual(third.token,second,'accepted one-use link is never reused for another friend');assert.equal(third.recipient.name,'Riley Friend');assert.match(f.d.querySelector('.friendRail').textContent,/Riley/);
 }finally{f.close()}
});

test('pending create or accept responses cannot mutate a logged-out or different account state',async()=>{
 for(const action of ['create','accept']){
  const server=service(),f=browser(server,{account:existing.id,url:action==='accept'?'https://friend.example/?friend=friend-token':'https://friend.example/'});
  try{
   await flush();const fetch=f.w.fetch;let release;
   f.w.fetch=async(url,options)=>{if(url==='/api/friend'&&JSON.parse(options.body).action===action)return new Promise(resolve=>{release=async()=>resolve(await fetch(url,options))});return fetch(url,options)};
   if(action==='create'){f.w.openFriendShare();fillFriend(f)}
   const running=action==='create'?f.w.makeFriendInvitation():f.w.acceptFriendInvitation();await flush();assert.equal(typeof release,'function');
   f.w.confirmLogout();await f.w.logout();const loggedOut=f.state();await release();await running;await flush();assert.deepEqual(f.state(),loggedOut,'old action result leaves logged-out page unchanged');assert.equal(f.state().friendShare,null);assert.equal(f.d.querySelector('.inlineComposer'),null);
  }finally{f.close()}
 }
});

test('rapid send clicks send one named invitation and native sharing runs only on its own button',async()=>{
 const server=service(),f=browser(server,{account:sender.id});
 try{
  await flush();const fetch=f.w.fetch;let release;f.w.fetch=async(url,options)=>{if(url==='/api/friend')return new Promise(resolve=>{release=async()=>resolve(await fetch(url,options))});return fetch(url,options)};
  const shared=[];f.w.navigator.share=async data=>shared.push(data);
  f.w.openFriendShare();f.w.openFriendShare();assert.equal(release,undefined);fillFriend(f);const firstSend=f.w.makeFriendInvitation(),secondSend=f.w.makeFriendInvitation();assert.equal(shared.length,0);assert.match(f.d.querySelector('.friendShareModal').textContent,/Sending your invitation/);await release();await Promise.all([firstSend,secondSend]);await flush();assert.equal(server.calls.filter(c=>c.body?.action==='create').length,1);assert.equal(shared.length,0);assert.equal(f.copied.length,0);assert.equal(f.state().modal,'');
  showSentFriend(f);clickText(f,'Share invitation');await flush();assert.equal(shared.length,1);assert.equal(shared[0].title,'Duh Wild');assert.equal(shared[0].text,`Come try Duh Wild with me. Invite code: ${f.state().friendShare.code}`);assert.match(shared[0].url,/^https:\/\/friend\.example\/friend\?friend=/);
 }finally{f.close()}
});

test('a registered Vibe prospect can accept a friend while the original invitation and answers stay intact',async()=>{
 const server=service(),f=browser(server,{account:existing.id});
 try{
  await flush();const original={name:'Jordan Vibe',photo,answers:[0,1,0,1,0]};
  f.w.eval(`s={...blank(),view:'results',actor:'prospect',member:${JSON.stringify(original)},prospect:{...${JSON.stringify(existing)},email:'${existing.contact}'},prospectId:'existing',prospectVerified:true,liveInvite:true,liveToken:'original-vibe',liveId:'original-pair',phase:'firstResults',pairOwnAnswers:[2,2,2,2,2],messages:[]};render()`);
  const originalSnapshot=f.state(),fetch=f.w.fetch;f.w.fetch=async(url,options)=>url==='/api/connection?invite=original-vibe'?{ok:true,json:async()=>({id:'original-pair',status:'firstResults',answers:original.answers,prospectAnswers:[2,2,2,2,2],messages:[]})}:fetch(url,options);
  await f.w.openFriendInvitation('friend-token');assert.equal(f.state().actor,'prospect');assert.equal(f.state().account.id,existing.id);assert.equal(server.connections.length,0);await f.w.acceptFriendInvitation();await flush();
  for(const field of ['member','liveToken','liveId','actor','phase','pairOwnAnswers'])assert.deepEqual(f.state()[field],originalSnapshot[field],field+' survives friend acceptance');
  assert.ok(f.d.querySelector('.inlineComposer'));assert.equal(f.d.querySelector('#connectionName').textContent,'Alex');assert.equal(server.connections[0].recipient,existing.id);
 }finally{f.close()}
});

test('an unfinished Vibe visitor can back out of friend signup without losing their original answers',async()=>{
 const server=service(),f=browser(server);
 try{
  await flush();f.w.eval(`s={...blank(),actor:'prospect',view:'invitee',liveInvite:true,liveToken:'original-vibe',liveId:'original-pair',member:{name:'Jordan Vibe',photo:'${photo}',answers:[0,1,0,1,0]},prospect:{name:'Riley',email:'riley@example.com',phone:'',photo:'',answers:[2,1],agreed:false}};render()`);
  const before=f.state();await f.w.openFriendInvitation('friend-token');assert.equal(f.state().member.name,'','inviter identity never becomes the new visitor profile');assert.equal(f.state().friendVibeState.liveToken,'original-vibe');f.w.showFriendInvitation();f.w.dismissFriendInvitation();
  for(const field of ['member','prospect','liveToken','liveId','actor'])assert.deepEqual(f.state()[field],before[field]);assert.equal(f.state().view,'invitee');
 }finally{f.close()}
});

test('closing the share modal while clipboard or native sharing finishes is harmless',async()=>{
 const server=service(),f=browser(server,{account:sender.id});
 try{
  await flush();await sendFriend(f);showSentFriend(f);let finishCopy;f.w.navigator.clipboard.writeText=()=>new Promise(resolve=>{finishCopy=resolve});const copying=f.w.copyFriendInvitation();f.w.closeInvite();finishCopy();await copying;assert.equal(f.d.querySelector('#modalHost').textContent,'');
  await sendFriend(f);showSentFriend(f);let finishShare;f.w.navigator.share=()=>new Promise(resolve=>{finishShare=resolve});const sharing=f.w.shareFriendInvitation();f.w.closeInvite();finishShare();await sharing;assert.equal(f.d.querySelector('#modalHost').textContent,'');
 }finally{f.close()}
});


test('neutral /friend landing bootstraps the same explicit invitation flow',async()=>{
 const server=service(),f=browser(server,{account:existing.id,url:'https://friend.example/friend?friend=friend-token'});
 try{await flush();assert.equal(f.w.location.pathname,'/friend');assert.equal(f.w.location.search,'');assert.equal(f.state().friendToken,'friend-token');assert.match(f.d.querySelector('#root').textContent,/ACCEPTPASS/);assert.equal(server.connections.length,0);await f.w.acceptFriendInvitation();assert.ok(f.d.querySelector('.inlineComposer'))}finally{f.close()}
});

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}};
function emailService(f,{verified=false}={}){
 const fetch=f.w.fetch,calls=[];let failSend=false;
 f.w.fetch=async(url,options)=>{
  if(url!=='/api/email')return fetch(url,options);
  const body=options?.body?JSON.parse(options.body):null;calls.push(body||{action:'status'});
  if(body?.action==='send'&&failSend){failSend=false;return {ok:false,json:async()=>({error:'Temporary send failure'})}}
  return {ok:true,json:async()=>body?.action==='send'?{id:'vibe-email'}:!body&&verified?{email:sender.contact}:{ok:true}};
 };
 return {calls,failSend:()=>{failSend=true}};
}
function fillVibe(f){f.w.inviteMode('send');f.d.querySelector('#inviteName').value='Jordan Vibe';f.d.querySelector('#inviteContact').value='jordan@example.com'}

test('friend remains Sending through delayed refresh and queues a fresh inbox read after an older poll',async()=>{
 const server=service(),f=browser(server,{account:sender.id});
 try{
  await flush();const fetch=f.w.fetch,oldPoll=deferred(),freshPoll=deferred();let reads=0;
  f.w.fetch=async(url,options)=>{if(url==='/api/connection?inbox=1'){reads++;if(reads===1){const old=await fetch(url,options);await oldPoll.promise;return old}if(reads===2)await freshPoll.promise}return fetch(url,options)};
  const polling=f.w.refreshLive();await flush();f.w.openFriendShare();fillFriend(f,{name:'Riley Friend',email:'riley@example.com'});const sending=f.w.makeFriendInvitation();await flush();
  assert.equal(reads,1,'send waits for the earlier inbox request');assert.equal(f.state().friendShare,null);assert.equal(f.d.querySelector('#friendName').disabled,true);assert.equal(f.d.querySelector('#friendEmail').disabled,true);assert.match(f.d.querySelector('.friendShareModal').textContent,/Sending your invitation/);
  oldPoll.resolve();await polling;await flush();assert.equal(reads,2,'success requests an inbox snapshot newer than the email');f.w.eval('render()');
  assert.equal(f.d.querySelector('.friendSentCard'),null);assert.equal(f.d.querySelector('#friendShareLink'),null);assert.match(f.d.querySelector('.friendShareModal').textContent,/Sending your invitation/);
  freshPoll.resolve();await sending;assert.equal(f.state().modal,'');assert.equal(f.d.querySelector('.friendShareModal'),null);assert.match(f.d.querySelector('.friendRail').textContent,/Riley/);assert.equal(f.d.querySelector('#connectionName').textContent,'Riley');
  assert.equal(server.calls.filter(c=>c.body?.action==='create').length,1);
 }finally{f.close()}
});

test('closed or reopened friend forms are never replaced by an older send success, failure, or verification error',async()=>{
 for(const outcome of ['success','failure','verify']){
  const server=service(),f=browser(server,{account:sender.id});
  try{
   await flush();const fetch=f.w.fetch,wait=deferred();f.w.fetch=async(url,options)=>{if(url==='/api/friend'){await wait.promise;if(outcome!=='success')return {ok:false,status:outcome==='verify'?403:503,json:async()=>({error:'Old request failed',needsVerify:outcome==='verify'})}}return fetch(url,options)};
   f.w.openFriendShare();fillFriend(f);const sending=f.w.makeFriendInvitation();f.w.closeInvite();f.w.openFriendShare();fillFriend(f,{name:'Riley Next',email:'riley@example.com'});
   const field=f.d.querySelector('#friendName');assert.equal(field.disabled,false);assert.equal(f.d.querySelector('#friendEmail').disabled,false);assert.equal(f.d.querySelector('#friendSendButton').disabled,true);await f.w.makeFriendInvitation();wait.resolve();await sending;await flush();
   assert.equal(f.state().modal,'friendShare');assert.equal(f.d.querySelector('#friendName'),field,'completion preserves the newer form instance');assert.equal(field.value,'Riley Next');assert.equal(f.d.querySelector('#friendEmail').value,'riley@example.com');assert.equal(f.d.querySelector('#friendSendButton').disabled,false);assert.equal(f.state().friendShare,null);assert.equal(f.d.querySelector('#friendShareError').textContent,'');assert.equal(f.state().notice,'');assert.equal(server.calls.filter(c=>c.body?.action==='code_start').length,0,'stale verification failure never sends a code');
   if(outcome==='success')assert.match(f.d.querySelector('.friendRail').textContent,/Morgan/);
  }finally{f.close()}
 }
});

test('friend completion and expiry preserve newer Vibe forms, verification codes, and selected connections',async()=>{
 const server=service(),f=browser(server,{account:sender.id});
 try{
  await flush();const fetch=f.w.fetch,wait=deferred();let delayInbox=true;
  f.w.fetch=async(url,options)=>{if(url==='/api/connection?inbox=1'&&delayInbox){delayInbox=false;await wait.promise}return fetch(url,options)};
  f.w.openFriendShare();fillFriend(f,{name:'Riley Friend',email:'riley@example.com'});const sending=f.w.makeFriendInvitation();await flush();f.w.closeInvite();fillVibe(f);const name=f.d.querySelector('#inviteName');wait.resolve();await sending;
  assert.equal(f.state().modal,'send');assert.equal(f.d.querySelector('#inviteName'),name);assert.equal(name.value,'Jordan Vibe');assert.equal(f.d.querySelector('#inviteContact').value,'jordan@example.com');assert.equal(f.state().notice,'');assert.equal(f.state().selectedChempat,'friend-one','a newer interaction keeps its selected connection');
  f.w.closeInvite();await sendFriend(f);fillVibe(f);const email=f.d.querySelector('#inviteContact');f.expireNotice();assert.equal(f.d.querySelector('#inviteContact'),email);assert.equal(email.value,'jordan@example.com');assert.equal(f.state().notice,'');
  f.w.closeInvite();await sendFriend(f);f.w.eval("pendingInvite={name:'Jordan',email:'jordan@example.com'};renderVerify()");f.d.querySelector('#emailCode').value='123456';const code=f.d.querySelector('#emailCode');f.expireNotice();assert.equal(f.d.querySelector('#emailCode'),code);assert.equal(code.value,'123456');assert.equal(f.state().modal,'verify');
 }finally{f.close()}
});

test('friend success survives an unavailable inbox without a fabricated date and Back cannot reopen its modal',async()=>{
 const server=service(),f=browser(server,{account:sender.id});
 try{
  await flush();const fetch=f.w.fetch;f.w.fetch=async(url,options)=>url==='/api/connection?inbox=1'?{ok:false,json:async()=>({error:'Inbox temporarily unavailable'})}:fetch(url,options);
  await sendFriend(f,{name:'Riley Friend',email:'riley@example.com'});assert.equal(f.state().modal,'');const sent=f.state().friendShare;assert.match(f.d.querySelector('.friendRail').textContent,/Riley/);assert.equal(f.state().friends.find(c=>c.id===sent.id).invitedAt,undefined);assert.equal(f.state().notice,'Invite sent to Riley.');
  const wait=deferred();f.w.fetch=async(url,options)=>{if(url==='/api/friend')await wait.promise;return fetch(url,options)};
  f.w.openFriendShare();fillFriend(f);const sending=f.w.makeFriendInvitation();f.w.goHome();wait.resolve();await sending;assert.equal(f.state().modal,'');assert.equal(f.d.querySelector('.friendShareModal'),null);assert.equal(f.state().notice,'');
 }finally{f.close()}
});

test('Vibe preparation and verification cannot continue or send after another modal or account takes over',async()=>{
 for(const stage of ['status','start','verify']){
  const server=service(),f=browser(server,{account:sender.id});
  try{
   await flush();const mail=emailService(f),fetch=f.w.fetch,wait=deferred();f.w.fetch=async(url,options)=>{const action=options?.body?JSON.parse(options.body).action:'status';if(url==='/api/email'&&action===stage)await wait.promise;return fetch(url,options)};
   fillVibe(f);let pending;
   if(stage==='verify'){await f.w.prepareInvite();f.d.querySelector('#emailCode').value='123456';pending=f.w.verifyAndSend();await f.w.verifyAndSend()}
   else{pending=f.w.prepareInvite();await f.w.prepareInvite();await flush()}
   f.w.closeInvite();f.w.openFriendShare();fillFriend(f,{name:'Riley Next',email:'riley@example.com'});const field=f.d.querySelector('#friendName');wait.resolve();await pending;
   assert.equal(f.state().modal,'friendShare');assert.equal(f.d.querySelector('#friendName'),field);assert.equal(field.value,'Riley Next');assert.equal(mail.calls.filter(c=>c.action==='send').length,0,'cancelled email stages cannot send a Vibe');assert.ok(mail.calls.filter(c=>c.action===stage).length<=1);
  }finally{f.close()}
 }
});

test('Vibe verification survives polling and retries a failed send without duplicate email or verification',async()=>{
 const server=service(),f=browser(server,{account:sender.id});
 try{
  await flush();const mail=emailService(f);fillVibe(f);await f.w.prepareInvite();assert.equal(f.state().modal,'verify');f.d.querySelector('#emailCode').value='123456';const input=f.d.querySelector('#emailCode');
  server.invites.set('poll-added',{id:'poll-added',sender:sender.id,status:'invited',intended:{name:'Riley',email:'riley@example.com'}});await f.w.refreshLive();assert.equal(f.d.querySelector('#emailCode'),input);assert.equal(input.value,'123456');f.w.eval('render()');assert.equal(f.state().modal,'verify');assert.equal(f.d.querySelector('#emailCode').value,'123456');assert.equal(f.d.querySelector('#inviteName'),null,'verification has an explicit modal renderer');
  mail.failSend();await Promise.all([f.w.verifyAndSend(),f.w.verifyAndSend()]);assert.match(f.d.querySelector('#verifyError').textContent,/Temporary send failure/);assert.equal(f.d.querySelector('#emailCode').disabled,true);assert.match(f.d.querySelector('.modalForm button').textContent,/RETRY SEND/);assert.equal(mail.calls.filter(c=>c.action==='verify').length,1);
  const fetch=f.w.fetch,wait=deferred();f.w.fetch=async(url,options)=>{if(url==='/api/email'&&JSON.parse(options.body||'{}').action==='send')await wait.promise;return fetch(url,options)};const first=f.w.sendInvitation(),second=f.w.sendInvitation();wait.resolve();await Promise.all([first,second]);assert.equal(mail.calls.filter(c=>c.action==='send').length,2,'one failed attempt plus one successful retry');assert.equal(mail.calls.filter(c=>c.action==='verify').length,1);assert.equal(f.state().modal,'');assert.match(f.state().notice,/Invitation sent to Jordan/);assert.deepEqual(mail.calls.filter(c=>c.action==='send').at(-1).recipient,{name:'Jordan Vibe',email:'jordan@example.com'});
 }finally{f.close()}
});

test('a delayed Vibe send uses its captured recipient and leaves newer friend and account state alone',async()=>{
 for(const change of ['friend','account']){
  const server=service(),f=browser(server,{account:sender.id});
  try{
   await flush();const mail=emailService(f,{verified:true}),fetch=f.w.fetch,wait=deferred();f.w.fetch=async(url,options)=>{if(url==='/api/email'&&JSON.parse(options.body||'{}').action==='send')await wait.promise;return fetch(url,options)};
   fillVibe(f);const pending=f.w.prepareInvite();await flush();await f.w.prepareInvite();f.w.closeInvite();
   if(change==='account')f.w.openPage(existing);
   f.w.openFriendShare();fillFriend(f,{name:'Riley Next',email:'riley@example.com'});f.w.eval("pendingInvite={name:'Wrong Person',email:'wrong@example.com'}");const input=f.d.querySelector('#friendName'),member=f.state().member;wait.resolve();await pending;await flush();
   assert.equal(mail.calls.filter(c=>c.action==='send').length,1);assert.deepEqual(mail.calls.find(c=>c.action==='send').recipient,{name:'Jordan Vibe',email:'jordan@example.com'});assert.equal(f.d.querySelector('#friendName'),input);assert.equal(input.value,'Riley Next');assert.equal(f.state().modal,'friendShare');assert.deepEqual(f.state().member,member);assert.equal(f.state().notice,'');
  }finally{f.close()}
 }
});

const choiceCalls=server=>server.calls.filter(c=>['accept','decline'].includes(c.body?.action));
const text=f=>f.d.querySelector('#root').textContent;
const exitCopy='No worries. Your next connection is out there.';
async function signinAs(f,email){f.d.querySelector('#signinEmail').value=email;await f.w.signinStart();f.d.querySelector('#signinCode').value='123456';await f.w.signinVerify();await flush()}

test('sender opening their link gets a sender page and can switch accounts without logging out or losing the token',async()=>{
 const server=service(),f=browser(server,{account:sender.id,url:'https://friend.example/friend?friend=friend-token'});
 try{
  await flush();assert.match(text(f),/You sent this invitation/);assert.doesNotMatch(text(f),/Alex invited you/);assert.equal(f.d.querySelector('#friendAccept'),null);assert.equal(f.d.querySelector('#friendPass'),null);
  await f.w.acceptFriendInvitation();await f.w.passFriendInvitation();assert.equal(choiceCalls(server).length,0);
  clickText(f,'SIGN IN WITH ANOTHER ACCOUNT');assert.equal(f.client.account,sender.id);assert.equal(f.state().friendToken,'friend-token');assert.equal(server.calls.filter(c=>c.body?.action==='logout').length,0);
  await signinAs(f,existing.contact);assert.equal(f.state().account.id,existing.id);assert.equal(f.state().friendToken,'friend-token');assert.equal(f.d.querySelector('#friendAccept').textContent,'ACCEPT');assert.equal(f.d.querySelector('#friendPass').textContent,'PASS');assert.equal(choiceCalls(server).length,0);
  await f.w.acceptFriendInvitation();assert.equal(f.state().view,'dashboard');assert.match(f.d.querySelector('.friendRail').textContent,/Alex/);
 }finally{f.close()}
});

test('sender My Page exits invitation context and does not reopen it on home navigation',async()=>{
 const server=service(),f=browser(server,{account:sender.id,url:'https://friend.example/?friend=friend-token'});
 try{await flush();f.w.friendInvitationMyPage();assert.equal(f.state().friendToken,'');assert.equal(f.state().view,'dashboard');f.w.goHome();assert.equal(f.state().view,'dashboard');assert.equal(choiceCalls(server).length,0)}finally{f.close()}
});

test('eligible PASS saves one decline, opens no chat or block, and Explore continues normal use',async()=>{
 const server=service(),f=browser(server,{account:existing.id,url:'https://friend.example/?friend=friend-token'});let reload;
 try{
  await flush();await f.w.passFriendInvitation();assert.equal(server.invites.get('friend-token').status,'declined');assert.equal(server.connections.length,0);assert.equal(choiceCalls(server).length,1);assert.equal(choiceCalls(server)[0].body.action,'decline');assert.equal(server.calls.some(c=>['block','freeze'].includes(c.body?.action)),false);assert.equal(f.d.querySelector('h1').textContent,exitCopy);assert.match(text(f),/You passed on this invitation/);assert.equal(f.d.querySelector('.inlineComposer'),null);
  reload=browser(server,{account:existing.id,saved:f.saved()});await flush();assert.equal(reload.d.querySelector('h1').textContent,exitCopy);clickText(reload,'Explore Duhwild →');assert.equal(reload.state().friendToken,'');assert.equal(reload.state().friendExit,'');assert.equal(reload.state().view,'dashboard');assert.equal(reload.d.querySelector('.friendExit'),null);
 }finally{f.close();reload?.close()}
});

test('anonymous and wrong-account PASS immediately exit locally without altering the intended invitation',async()=>{
 for(const account of [null,'unrelated']){
  const server=service();server.members.set('unrelated',{...existing,id:'unrelated',name:'Taylor Other',contact:'taylor@example.com'});const f=browser(server,{account,url:'https://friend.example/?friend=friend-token'});
  try{await flush();await f.w.passFriendInvitation();assert.equal(f.d.querySelector('h1').textContent,exitCopy);assert.match(text(f),/invitation hasn’t changed/);assert.doesNotMatch(text(f),/You passed on this invitation/);assert.equal(choiceCalls(server).length,0);assert.equal(server.invites.get('friend-token').status,'invited');assert.equal(server.calls.some(c=>c.body?.action==='code_start'),false);clickText(f,'Explore Duhwild →');assert.equal(f.state().friendToken,'');assert.equal(f.state().friendExit,'');assert.equal(f.state().view,account?'dashboard':'landing');assert.equal(f.d.querySelector('.friendInvitation'),null)}finally{f.close()}
 }
});

test('anonymous local exit can sign in to record PASS, requiring a fresh explicit choice',async()=>{
 const server=service(),f=browser(server,{url:'https://friend.example/?friend=friend-token'});
 try{await flush();await f.w.passFriendInvitation();clickText(f,'Sign in to record your pass');assert.equal(f.state().friendToken,'friend-token');await signinAs(f,existing.contact);assert.equal(server.invites.get('friend-token').status,'invited');assert.equal(choiceCalls(server).length,0);assert.match(text(f),/Choose PASS below/);await f.w.passFriendInvitation();assert.equal(server.invites.get('friend-token').status,'declined')}finally{f.close()}
});

test('rapid mixed ACCEPT and PASS clicks cannot submit two choices',async()=>{
 for(const action of ['accept','decline']){
  const server=service(),f=browser(server,{account:existing.id,url:'https://friend.example/?friend=friend-token'});
  try{await flush();const wait=deferred(),fetch=f.w.fetch;f.w.fetch=async(url,options)=>{if(url==='/api/friend')await wait.promise;return fetch(url,options)};const first=action==='accept'?f.w.acceptFriendInvitation():f.w.passFriendInvitation();assert.equal(f.d.querySelector('#friendAccept').disabled,true);assert.equal(f.d.querySelector('#friendPass').disabled,true);await f.w.acceptFriendInvitation();await f.w.passFriendInvitation();wait.resolve();await first;assert.equal(choiceCalls(server).length,1);assert.equal(choiceCalls(server)[0].body.action,action)}finally{f.close()}
 }
});

test('late choice successes and errors do not reopen newer pages, replacement links or different accounts',async()=>{
 for(const action of ['accept','decline'])for(const change of ['exit','link','account'])for(const failure of [false,true]){
  const server=service(),f=browser(server,{account:existing.id,url:'https://friend.example/?friend=friend-token'});
  try{
   await flush();const wait=deferred(),fetch=f.w.fetch;f.w.fetch=async(url,options)=>{if(url==='/api/friend'){const result=failure?{ok:false,status:503,json:async()=>({error:'Delayed failure'})}:await fetch(url,options);await wait.promise;return result}return fetch(url,options)};
   const pending=action==='accept'?f.w.acceptFriendInvitation():f.w.passFriendInvitation();await flush();
   if(change==='exit')f.w.dismissFriendInvitation();
   if(change==='link'){server.invites.set('next',{id:'next',sender:sender.id,status:'invited',intended:{name:existing.name,email:existing.contact}});await f.w.openFriendInvitation('next')}
   if(change==='account'){f.client.setAccount(sender.id);f.w.openPage(sender);await flush()}
   await flush();const snapshot=f.state(),root=text(f);wait.resolve();await pending;await flush();assert.deepEqual(f.state(),snapshot,`${action}/${change}/${failure} preserves newer state`);assert.equal(text(f),root);
  }finally{f.close()}
 }
});

test('out-of-order previews including repeated same-token loads cannot overwrite newer navigation',async()=>{
 const server=service(),f=browser(server,{account:existing.id});
 try{
  await flush();const fetch=f.w.fetch,wait=deferred();let captured;
  f.w.fetch=async(url,options)=>{if(url.includes('/api/friend?')&&!captured){captured=await fetch(url,options);await wait.promise;return captured}return fetch(url,options)};
  const old=f.w.openFriendInvitation('friend-token');await flush();f.client.setAccount(sender.id);await f.w.openFriendInvitation('friend-token');assert.match(text(f),/You sent this invitation/);await flush();const snapshot=f.state();wait.resolve();await old;assert.deepEqual(f.state(),snapshot);
  const second=deferred();f.w.fetch=async(url,options)=>{if(url.includes('/api/friend?'))await second.promise;return fetch(url,options)};const loading=f.w.openFriendInvitation('friend-token');f.w.dismissFriendInvitation();const exited=f.state();second.resolve();await loading;assert.deepEqual(f.state(),exited);assert.equal(f.d.querySelector('.friendInvitation'),null);
 }finally{f.close()}
});

test('expired choice session recovers through sign in with the same token and no automatic action',async()=>{
 for(const action of ['accept','decline']){
  const server=service(),f=browser(server,{account:existing.id,url:'https://friend.example/?friend=friend-token'});
  try{await flush();f.client.setAccount(null);await(action==='accept'?f.w.acceptFriendInvitation():f.w.passFriendInvitation());assert.match(text(f),/sign-in expired/i);assert.equal(f.state().friendToken,'friend-token');clickText(f,'SIGN IN WITH ANOTHER ACCOUNT');await signinAs(f,existing.contact);assert.equal(choiceCalls(server).length,1);assert.equal(server.connections.length,0);await(action==='accept'?f.w.acceptFriendInvitation():f.w.passFriendInvitation());assert.equal(choiceCalls(server).length,2);assert.equal(server.invites.get('friend-token').status,action==='accept'?'used':'declined')}finally{f.close()}
 }
});

test('verification returns to explicit ACCEPT/PASS and closing a pending verification cannot resume the choice',async()=>{
 for(const action of ['accept','decline'])for(const close of [false,true]){
  const server=service();server.members.get(existing.id).verified=false;const f=browser(server,{account:existing.id,url:'https://friend.example/?friend=friend-token'});
  try{
   await flush();await(action==='accept'?f.w.acceptFriendInvitation():f.w.passFriendInvitation());assert.equal(f.state().modal,'verifyEmail');assert.equal(choiceCalls(server).length,1);f.d.querySelector('#verifyEmailCode').value='123456';const wait=deferred(),fetch=f.w.fetch;
   f.w.fetch=async(url,options)=>{if(url==='/api/member'&&JSON.parse(options?.body||'{}').action==='code_verify')await wait.promise;return fetch(url,options)};
   const verifying=f.w.confirmVerify();await f.w.confirmVerify();if(close){f.w.closeInvite();f.w.dismissFriendInvitation()}const snapshot=close?f.state():null;wait.resolve();await verifying;await flush();assert.equal(server.calls.filter(c=>c.body?.action==='code_verify').length,1);assert.equal(choiceCalls(server).length,1,'verification never performs a hidden choice');assert.equal(server.connections.length,0);
   if(close)assert.deepEqual(f.state(),snapshot);else{assert.equal(f.state().view,'friendInvite');assert.ok(f.d.querySelector('#friendPass'));await(action==='accept'?f.w.acceptFriendInvitation():f.w.passFriendInvitation());assert.equal(choiceCalls(server).length,2)}
  }finally{f.close()}
 }
});

test('late sign-in and signup code responses cannot replace a newer invitation or a local exit',async()=>{
 for(const step of ['send','verify']){
  const server=service(),f=browser(server,{url:'https://friend.example/?friend=friend-token'});
  try{await flush();await f.w.acceptFriendInvitation();f.w.showSignin();const fetch=f.w.fetch,wait=deferred();if(step==='verify'){f.d.querySelector('#signinEmail').value=existing.contact;await f.w.signinStart();f.d.querySelector('#signinCode').value='123456'}
   f.w.fetch=async(url,options)=>{if(url==='/api/member'&&JSON.parse(options?.body||'{}').action===(step==='send'?'code_start':'code_verify'))await wait.promise;return fetch(url,options)};
   if(step==='send')f.d.querySelector('#signinEmail').value=existing.contact;const pending=step==='send'?f.w.signinStart():f.w.signinVerify();f.w.dismissFriendInvitation();const snapshot=f.state();wait.resolve();await pending;await flush();assert.equal(f.state().view,snapshot.view);assert.equal(f.state().friendToken,'');assert.equal(f.state().memberId,snapshot.memberId);assert.equal(f.state().joinStep,snapshot.joinStep);assert.equal(server.connections.length,0);
  }finally{f.close()}
 }
});

test('confirmed acceptance remains visible in My Page when inbox refresh throws',async()=>{
 const server=service(),f=browser(server,{account:existing.id,url:'https://friend.example/?friend=friend-token'});
 try{await flush();const fetch=f.w.fetch;f.w.fetch=(url,options)=>{if(url==='/api/connection?inbox=1')throw Error('Temporary inbox failure');return fetch(url,options)};await f.w.acceptFriendInvitation();assert.equal(server.connections.length,1);assert.equal(f.state().view,'dashboard');assert.equal(f.state().friendToken,'');assert.match(f.d.querySelector('.friendRail').textContent,/Alex/);assert.equal(f.d.querySelector('#connectionName').textContent,'Alex');assert.equal(f.state().friends[0].invitedAt,undefined)}finally{f.close()}
});

test('Explore resets interrupted friend signup to the regular entry step',async()=>{
 for(const step of ['joinCode',2]){
  const server=service(),f=browser(server,{url:'https://friend.example/?friend=friend-token'});let reload;
  try{await flush();await f.w.acceptFriendInvitation();f.w.eval(`s.joinStep=${JSON.stringify(step)};s.signinEmail='riley@example.com';s.member.name='Riley';render()`);f.w.showFriendInvitation();await f.w.passFriendInvitation();clickText(f,'Explore Duhwild →');assert.equal(f.state().joinStep,1);assert.equal(f.state().view,'landing');assert.equal(f.state().friendToken,'');assert.ok(f.d.querySelector('#joinName'));assert.equal(f.d.querySelector('#signinCode'),null);assert.equal(f.d.querySelector('#memberPhoto'),null);reload=browser(server,{saved:f.saved()});await flush();assert.ok(reload.d.querySelector('#joinName'));assert.equal(reload.state().friendToken,'')}finally{f.close();reload?.close()}
 }
});

test('a member with zero answers stays on My Page after Pass, Explore, home and reload',async()=>{
 const server=service();server.members.get(existing.id).answers=[];const f=browser(server,{account:existing.id,url:'https://friend.example/?friend=friend-token'});let reload;
 try{await flush();await f.w.passFriendInvitation();clickText(f,'Explore Duhwild →');f.w.goHome();assert.equal(f.state().view,'dashboard');assert.equal(f.d.querySelector('#joinName'),null);assert.equal(f.d.querySelector('.question'),null);reload=browser(server,{account:existing.id,saved:f.saved()});await flush();assert.equal(reload.state().view,'dashboard');reload.w.goHome();assert.equal(reload.state().view,'dashboard');assert.ok(reload.d.querySelector('.friendRail'))}finally{f.close();reload?.close()}
});

test('bound invitations allow signed-out and wrong-account visitors to PASS locally without a POST',async()=>{
 for(const account of [null,existing.id]){
  const server=service(),f=browser(server,{account});
  try{
   await flush();const fetch=f.w.fetch;f.w.fetch=(url,options)=>url.includes('/api/friend?invite=')?Promise.resolve({ok:!account,status:account?403:200,json:async()=>({kind:'friend',status:'signInRequired',requiresSignIn:true,...(account?{error:'Open the member page this invitation was sent to.'}:{})})}):fetch(url,options);
   await f.w.openFriendInvitation('friend-token');assert.equal(f.state().friendInvite.requiresSignIn,true);const calls=server.calls.length;clickText(f,'PASS');await flush();assert.equal(f.d.querySelector('h1').textContent,exitCopy);assert.match(text(f),/invitation hasn’t changed/);assert.doesNotMatch(text(f),/You passed on this invitation/);assert.equal(server.calls.slice(calls).some(c=>c.body),false);assert.equal(choiceCalls(server).length,0);assert.equal(server.invites.get('friend-token').status,'invited');assert.equal(f.d.querySelector('.inlineComposer'),null);
   clickText(f,'Explore Duhwild →');assert.equal(f.state().friendToken,'');assert.equal(f.state().friendExit,'');assert.equal(f.state().view,account?'dashboard':'landing');assert.equal(f.d.querySelector('.friendInvitation'),null);
  }finally{f.close()}
 }
});
