import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const qrRenderer=fs.readFileSync(new URL('../qr-client.js',import.meta.url),'utf8');
const token='a'.repeat(64),id='b'.repeat(64),photo='data:image/jpeg;base64,AA==';
const qrToken='e'.repeat(64),qrId='f'.repeat(64);
const state={status:'invited',prospect_name:null,prospect_photo:null,prospect_answers:[],prospect_phone:null,prospect_email:null,messages:[]};
const outgoingId='c'.repeat(64),outgoingState={status:'invited',prospect_name:null,prospect_photo:null,prospect_answers:[],messages:[]};
const inviter={name:'Cindy',photo,answers:[0,1,2,0,1,2,0,1,2,0]};
let registeredMember=null,lastEnd=null,verifyOnce=true,qrCreates=0;const memberCalls=[];
async function mockFetch(url,opt={},context){
 const u=new URL(url,'https://chempatible.com'),body=opt.body?JSON.parse(opt.body):{};
 let data={},status=200;
 if(u.pathname==='/api/member'){if(opt.method==='POST'&&['logout','code_start','code_verify'].includes(body.action)){memberCalls.push(body.action);if(body.action==='logout')registeredMember=null;if(body.action==='code_verify'){if(body.code!=='123456'){status=400;data={error:'Code expired or incorrect.'}}else if(body.email==='cindy@example.com'){registeredMember={id:'member-id',name:'Cindy',contact:body.email,photo,answers:[0,1,2,0,1,2,0,1,2,0],verified:true};data={existing:true,member:registeredMember}}else if(registeredMember&&registeredMember.contact===body.email){registeredMember.verified=true;data={existing:true,member:registeredMember}}else data={existing:false,email:body.email}}else data={ok:true}}else if(opt.method==='POST'){if(body.action==='register')assert.equal(body.agreed,true,'registration must carry 18+ consent');registeredMember={id:'member-id',name:body.name||'Mike',contact:body.contact||'mike@example.com',photo:body.photo||photo,answers:body.answers||[]};data={member:registeredMember}}else if(registeredMember)data={member:registeredMember};else{status=401;data={error:'No member on this device.'}}}
 else if(u.pathname==='/api/qr'){qrCreates++;data={id:qrId,url:`https://chempatible.com/?invite=${qrToken}`,expiresAt:new Date(Date.now()+900000).toISOString()}}
 else if(u.pathname==='/api/email'){if(opt.method==='POST'&&body.action==='send')data={ok:true,id:body.member?.name==='Mike'?outgoingId:id};else data={email:'cindy@example.com'}}
 else if(u.searchParams.has('inbox'))data={connections:context?.eval('s.actor')==='prospect'?[{id:outgoingId,recipient_name:'Sam',recipient_email:'sam@example.com',...outgoingState}]:[{id,recipient_name:'Mike',recipient_email:'mike@example.com',...state}]};
 else if(u.searchParams.has('invite'))data=u.searchParams.get('invite')===qrToken?{...inviter,answers:[],recipientName:'',prospectName:null,prospectPhoto:null,prospectAnswers:[],status:'invited',messages:[]}:{...inviter,answers:state.status==='invited'?[]:['chat','secondResults','email','tests'].includes(state.status)?inviter.answers:inviter.answers.slice(0,5),recipientName:'Mike',prospectName:state.prospect_name,prospectPhoto:state.prospect_photo,prospectAnswers:state.prospect_answers,prospectPhone:state.prospect_phone,prospectEmail:state.prospect_email,status:state.status,messages:state.messages};
 else if(body.action==='first'){Object.assign(state,{prospect_name:'Mike',prospect_photo:body.photo,prospect_answers:body.answers,status:'firstResults'});data={ok:true,answers:inviter.answers.slice(0,5)}}
 else if(body.action==='request'&&verifyOnce){verifyOnce=false;status=403;data={error:'Confirm your email first. We sent you a code.',needsVerify:true}}
 else if(body.action==='request'){Object.assign(state,{prospect_name:body.name,prospect_email:body.contact,prospect_photo:body.photo,status:'request'});data={ok:true}}
 else if(body.action==='decision'){(body.id===outgoingId?outgoingState:state).status=body.decision==='accept'?'chat':'declined';data={ok:true}}
 else if(body.action==='react'){const target=body.id===outgoingId?outgoingState:state;target.messages[body.index].reactions={...target.messages[body.index].reactions,[body.token?'prospect':'member']:body.reaction};data={messages:target.messages}}
 else if(body.action==='message'){const target=body.id===outgoingId?outgoingState:state;target.messages.push({by:body.token?'prospect':'member',text:body.text});data={messages:target.messages}}
 else if(body.action==='second'){state.prospect_answers=body.answers;state.status='secondResults';data={ok:true}}
 else if(body.action==='email'){state.prospect_email=body.email;state.status='email';data={ok:true}}
 else if(body.action==='unmatch'||body.action==='report'){if(body.action==='report'&&!body.reason){status=400;data={error:'Choose a reason for your report.'}}else{Object.assign(state,{status:'ended',messages:[],prospect_email:null});lastEnd=body;data={ok:true,status:'ended'}}}
 else{status=400;data={error:'Unknown action'}}
 return {ok:status===200,status,json:async()=>data};
}
function page(url){const d=new JSDOM(html,{url,runScripts:'dangerously',pretendToBeVisual:true});d.window.fetch=(url,opt)=>mockFetch(url,opt,d.window);d.window.eval(qrRenderer);d.window.scrollTo=()=>{};d.window.HTMLElement.prototype.scrollIntoView=()=>{};const script=d.window.document.createElement('script');script.textContent=source;d.window.document.body.append(script);return d}
const joiner=page('https://chempatible.com/');
{const d=joiner.window.document;d.getElementById('joinName').value='Cindy';d.getElementById('joinContact').value='asdf';joiner.window.eval('nextJoinStep()');assert.match(d.getElementById('joinError').textContent,/first name and email/);
d.getElementById('joinContact').value='3035551234';joiner.window.eval('nextJoinStep()');assert.match(d.getElementById('joinError').textContent,/first name and email/,'cell numbers are off for the email launch');assert.equal(d.getElementById('joinContact').type,'email');
d.getElementById('joinContact').value='cindy@example.com';joiner.window.eval('nextJoinStep()');assert.match(d.getElementById('joinError').textContent,/18 or older/);assert.equal(joiner.window.eval('s.joinStep'),1);
d.getElementById('joinAgree').checked=true;joiner.window.eval('nextJoinStep()');await new Promise(r=>setTimeout(r,10));assert.equal(joiner.window.eval('s.joinStep'),'joinCode');assert.ok(memberCalls.includes('code_start'));assert.match(d.querySelector('.joinCard').textContent,/cindy@example.com.*subject line/);
d.getElementById('signinCode').value='999999';await joiner.window.eval('signinVerify()');assert.match(d.getElementById('joinError').textContent,/incorrect/);
d.getElementById('signinCode').value='123456';await joiner.window.eval('signinVerify()');assert.equal(joiner.window.eval('s.view'),'dashboard','an email that already has a page opens it');
joiner.window.eval("s=blank();render()");d.getElementById('joinName').value='Newbie';d.getElementById('joinContact').value='newbie@example.com';d.getElementById('joinAgree').checked=true;joiner.window.eval('nextJoinStep()');await new Promise(r=>setTimeout(r,10));d.getElementById('signinCode').value='123456';await joiner.window.eval('signinVerify()');assert.equal(joiner.window.eval('s.joinStep'),2,'a new email carries on to the picture');assert.equal(joiner.window.eval('s.member.verified'),true);memberCalls.length=0;registeredMember=null;assert.equal(joiner.window.eval('s.member.agreed'),true);
assert.equal(joiner.window.eval(`pic('x" onerror="alert(1)')`),'');assert.equal(joiner.window.eval(`pic('${photo}')`),photo);
joiner.window.eval(`s.member.photo='x" onerror="alert(1)';s.view='dashboard';render()`);assert.equal(d.querySelector('[onerror]'),null);joiner.window.close()}
const member=page('https://chempatible.com/');
member.window.eval(`s.member.name='Cindy';s.member.contact='cindy@example.com';s.member.photo='${photo}';s.member.answers=[0,1,2,0,1,2,0,1,2,0];s.phase='ready';navigate('dashboard','member')`);
await new Promise(r=>setTimeout(r,30));assert.equal(qrCreates,0,'the dashboard must not create a code');
member.window.eval('openInvite()');await new Promise(r=>setTimeout(r,30));assert.equal(qrCreates,1,'the button creates the code');
assert.equal(member.window.eval('s.qrInvite.id'),qrId);
assert.match(member.window.document.querySelector('.liveQr').getAttribute('src'),/^data:image\/svg\+xml/);
assert.match(member.window.document.querySelector('#qrTimer').textContent,/Ready for/);
member.window.eval('closeInvite()');
assert.equal(qrCreates,1,'closing the QR must not mint another code');
member.window.eval('openInvite()');await new Promise(r=>setTimeout(r,30));assert.equal(qrCreates,2,'a new button tap creates a fresh code');member.window.eval('closeInvite()');

await member.window.eval("pendingInvite={name:'Mike',email:'mike@example.com'};s.modal='send';renderModal();sendInvitation()");
assert.equal(member.window.eval('s.liveMember'),true);
assert.equal(member.window.eval('s.view'),'dashboard');
assert.match(member.window.document.querySelector('.socialMemberHeader').textContent,/INSTANT VIBE/);
member.window.eval(`s.inbox=[{id:'${qrId}',channel:'qr',claimed:false,status:'invited',recipient_name:'',prospect_name:null,prospect_photo:null,prospect_answers:[],messages:[]}];render()`);
assert.match(member.window.document.querySelector('.socialConnections h2').textContent,/Connections/);
assert.equal(member.window.document.querySelectorAll('.chempatContact').length,0);
assert.match(member.window.document.querySelector('.emptyFocus').textContent,/Catch a vibe, want to know more\?.*Send an Instant Vibe/);
assert.match(member.window.document.querySelector('.connectionStatus').textContent,/Code ready · waiting for scan/);
assert.doesNotMatch(member.window.document.querySelector('.socialWorkspace').textContent,/Someone/);
member.window.eval('s.inbox=[];render()');
assert.equal(member.window.document.querySelector('.resetLink'),null);
assert.doesNotMatch(member.window.document.body.textContent,/View as|RESET THIS TAB/);
const prospect=page('https://chempatible.com/?invite='+token);
await new Promise(r=>setTimeout(r,20));
assert.equal(prospect.window.eval('s.view'),'invitee');
assert.match(prospect.window.document.querySelector('.introPitch h2').textContent,/five secrets about me/);
assert.equal(prospect.window.eval('s.member.name'),'Cindy');
prospect.window.eval('startProspect()');
for(let i=0;i<5;i++){prospect.window.eval('pick(0)');await prospect.window.eval('answerQuestion()')}
assert.equal(prospect.window.eval('s.view'),'revealPhoto');
assert.match(prospect.window.document.querySelector('.revealPhotoStep').textContent,/CAMERA.*CHOOSE FILE PHOTO/);
assert.equal(prospect.window.document.getElementById('cameraPreview').hidden,true);
await prospect.window.eval('openCamera()');
assert.match(prospect.window.document.getElementById('revealPhotoError').textContent,/No camera is available/);
assert.equal(prospect.window.document.getElementById('captureBtn').hidden,true);
prospect.window.eval(`s.prospect.photo='${photo}';render()`);prospect.window.document.getElementById('newMemberName').value='Mike';prospect.window.document.getElementById('newMemberContact').value='mike@example.com';await prospect.window.eval('finishProspectRegistration()');assert.match(prospect.window.document.getElementById('revealPhotoError').textContent,/18 or older/);assert.equal(prospect.window.eval('s.view'),'revealPhoto');prospect.window.document.getElementById('newMemberAgree').checked=true;await prospect.window.eval('finishProspectRegistration()');assert.equal(prospect.window.eval('s.prospectId'),'member-id');assert.equal(prospect.window.eval('s.view'),'results');
await member.window.eval('refreshLive()');assert.equal(member.window.eval('s.phase'),'firstResults');prospect.window.eval('goHome()');assert.equal(prospect.window.eval('s.view'),'dashboard');assert.match(prospect.window.document.querySelector('.socialMemberHeader').textContent,/UNLOCK MY NEXT FIVE/);assert.equal(prospect.window.document.querySelectorAll('.chempatContact').length,1);assert.equal(prospect.window.document.querySelectorAll('.secretsButton').length,1);assert.equal(prospect.window.document.querySelectorAll('.secretCompare').length,0);prospect.window.eval("selectChempat('first',true)");assert.equal(prospect.window.document.querySelectorAll('.secretCompare').length,5);assert.match(prospect.window.document.querySelector('.secretAnswerHeads').textContent,/MY ANSWER.*THEIR ANSWER/);assert.equal(prospect.window.document.querySelectorAll('.secretAnswers span').length,10);prospect.window.eval("navigate('results','prospect')");
prospect.window.eval('showRequest()');assert.equal(prospect.window.document.querySelectorAll('.requestInviter img').length,1);assert.equal(prospect.window.document.querySelectorAll('.requestCard input[type=file]').length,0);prospect.window.document.getElementById('prospectName').value='Mike';prospect.window.document.getElementById('prospectContact').value='mike@example.com';await prospect.window.eval('sendRequest()');
assert.match(prospect.window.document.getElementById('verifyEmailTitle').textContent,/Confirm your email/);assert.match(prospect.window.document.getElementById('modalHost').textContent,/mike@example.com/);
assert.equal(memberCalls.filter(c=>c==='code_start').length,1,'the code sent at the reveal is reused, not replaced');
prospect.window.document.getElementById('verifyEmailCode').value='123456';await prospect.window.eval('confirmVerify()');await new Promise(r=>setTimeout(r,10));
assert.equal(prospect.window.eval('s.prospectVerified'),true);assert.equal(prospect.window.document.getElementById('modalHost').innerHTML,'');memberCalls.length=0;
assert.equal(prospect.window.eval('s.view'),'dashboard');assert.match(prospect.window.document.querySelector('.socialConnections').textContent,/Connections/i);assert.match(prospect.window.document.querySelector('.connectionFocus').textContent,/Waiting for their answer/);assert.match(prospect.window.document.querySelector('.chempatRail').textContent,/Waiting for their answer/);assert.equal(prospect.window.document.querySelectorAll('.chempatContact i').length,0,'waiting is not an action');assert.equal(prospect.window.document.querySelectorAll('.focusPhotos img').length,2);
await member.window.eval('refreshLive()');assert.equal(member.window.eval('s.phase'),'request');assert.match(member.window.document.querySelector('.chempatRail').textContent,/Your move · Accept or pass/);assert.equal(member.window.document.querySelectorAll('.chempatContact i').length,1);assert.match(member.window.document.querySelector('.connectionFocus').textContent,/Your move · Accept or pass/i);
member.window.eval(`s.inbox.push({...s.inbox[0],id:'${'d'.repeat(64)}',recipient_name:'Alex',prospect_name:'Alex',status:'invited',prospect_photo:null});render()`);
assert.equal(member.window.document.querySelectorAll('.chempatContact').length,2);
member.window.eval(`selectChempat('${'d'.repeat(64)}')`);
assert.match(member.window.document.querySelector('.connectionFocus').textContent,/Alex/);
member.window.eval(`selectChempat('${'d'.repeat(64)}',true)`);
assert.equal(member.window.document.querySelectorAll('.secretCompare').length,0);
assert.match(member.window.document.querySelector('.focusStatus').textContent,/Invitation sent/);
member.window.eval(`selectChempat('${id}')`);
assert.equal(member.window.document.querySelectorAll('.secretCompare').length,0);
prospect.window.eval('startMyNextFive()');
for(let i=0;i<5;i++){prospect.window.eval('pick(1)');await prospect.window.eval('answerQuestion()')}
assert.equal(prospect.window.eval('s.view'),'dashboard');
assert.equal(prospect.window.eval('s.prospect.answers.length'),10);
assert.equal(prospect.window.eval('s.phase'),'request');
prospect.window.eval('openInvite()');assert.match(prospect.window.document.querySelector('#inviteTitle').textContent,/five secrets/);
await prospect.window.eval("pendingInvite={name:'Sam',email:'sam@example.com'};s.modal='send';renderModal();sendInvitation()");
await prospect.window.eval('refreshOutgoing()');
assert.equal(prospect.window.eval('s.view'),'dashboard');
assert.equal(prospect.window.eval('s.outgoing.length'),1);
assert.match(prospect.window.document.querySelector('.chempatRail').textContent,/Sam/);
assert.equal(prospect.window.document.querySelectorAll('.chempatContact').length,2);
Object.assign(outgoingState,{status:'request',prospect_name:'Sam',prospect_photo:photo,prospect_answers:[0,1,2,0,1]});await prospect.window.eval('refreshOutgoing()');
prospect.window.eval(`selectChempat('${outgoingId}')`);
assert.match(prospect.window.document.querySelector('.connectionFocus').textContent,/Sam wants to talk/);
prospect.window.eval(`openOutgoing('${outgoingId}')`);
assert.match(prospect.window.document.querySelector('.outgoingModal').textContent,/OUR FIRST FIVE/);
await prospect.window.eval("decideOutgoing('accept')");assert.equal(outgoingState.status,'chat');
prospect.window.document.getElementById('outgoingMessage').value='Hey Sam';await prospect.window.eval('sendOutgoingMessage()');assert.equal(outgoingState.messages.length,1);
prospect.window.eval('closeInvite()');
assert.match(prospect.window.document.querySelector('.inlineChat').textContent,/Hey Sam/);
prospect.window.eval(`selectChempat('${outgoingId}',true)`);assert.equal(prospect.window.document.querySelectorAll('.secretCompare').length,5);assert.equal(prospect.window.document.querySelectorAll('.inlineChat').length,0);
prospect.window.eval(`selectChempat('${outgoingId}')`);assert.match(prospect.window.document.querySelector('.inlineChat').textContent,/Hey Sam/);
prospect.window.document.getElementById('outgoingMessage').value='From my page';await prospect.window.eval('sendOutgoingMessage()');assert.equal(outgoingState.messages.length,2);
await member.window.eval('acceptRequest()');assert.equal(member.window.eval('s.view'),'dashboard');assert.ok(member.window.document.querySelector('.inlineChat'),'accepted connection has an inline thread');assert.ok(member.window.document.querySelector('.chatUpload input[type=file]'));assert.equal(member.window.document.querySelectorAll('.messageReactions button').length,0);await prospect.window.eval('refreshLive()');assert.equal(prospect.window.eval('s.view'),'dashboard');prospect.window.eval("selectChempat('first')");assert.match(prospect.window.document.querySelector('.connectionFocus').textContent,/Chat open/i);
prospect.window.document.getElementById('message').value='Hello from the pane';await prospect.window.eval('sendMessage()');assert.match(prospect.window.document.querySelector('.inlineChat').textContent,/Hello from the pane/);assert.equal(prospect.window.document.querySelectorAll('.messageReactions button').length,2);await prospect.window.eval("reactChat(0,'like')");assert.equal(state.messages[0].reactions.prospect,'like');assert.equal(prospect.window.document.querySelector('.messageReactions button').getAttribute('aria-pressed'),'true');
prospect.window.eval('openConversation()');assert.equal(prospect.window.eval('s.view'),'conversation');
assert.match(prospect.window.document.querySelector('.chatHeader h1').textContent,/Private Chat/);
assert.equal(prospect.window.document.querySelectorAll('.chatPair img').length,2);
prospect.window.eval('goHome()');assert.equal(prospect.window.eval('s.view'),'dashboard');assert.match(prospect.window.document.querySelector('.connectionFocus').textContent,/Private Chat/i);prospect.window.eval('openConversation()');
prospect.window.document.getElementById('message').value='Hello';await prospect.window.eval('sendMessage()');await member.window.eval('refreshLive()');assert.equal(member.window.eval('s.messages.length'),2);
await prospect.window.eval('startSecondFive()');
assert.equal(prospect.window.eval('s.view'),'results');assert.equal(prospect.window.eval('s.member.answers.length'),10);
await member.window.eval('refreshLive()');assert.equal(member.window.eval('s.prospect.answers.length'),10);
prospect.window.eval('continueAfterSecond()');prospect.window.document.getElementById('prospectEmail').value='mike@example.com';await prospect.window.eval('saveEmail()');assert.equal(prospect.window.eval('s.view'),'tests');
assert.equal(prospect.window.document.querySelector('a[href^="/admin"]'),null);
member.window.eval("pendingInvite={name:'Mike',email:'mike@example.com'};renderVerify();emailApi=async(data)=>{if(data.action==='verify')return {ok:true};throw Error('Temporary send failure')}");
member.window.document.getElementById('emailCode').value='123456';
await member.window.eval('verifyAndSend()');
assert.equal(member.window.document.getElementById('emailCode').disabled,true);
assert.match(member.window.document.querySelector('.modalForm button').textContent,/RETRY SEND/);
assert.match(member.window.document.getElementById('verifyError').textContent,/Temporary send failure/);
const resumed=page('https://chempatible.com/');await new Promise(r=>setTimeout(r,20));
assert.equal(resumed.window.eval('s.view'),'dashboard');
assert.equal(resumed.window.eval('s.memberId'),'member-id');
assert.equal(resumed.window.eval('s.member.answers.length'),10);
const existingMemberScan=page('https://chempatible.com/?invite='+qrToken);await new Promise(r=>setTimeout(r,20));
assert.equal(existingMemberScan.window.eval('s.prospectId'),'member-id');
assert.equal(existingMemberScan.window.eval('s.view'),'invitee');
assert.equal(existingMemberScan.window.eval('s.prospect.answers.length'),0);
existingMemberScan.window.eval('startProspect()');assert.match(existingMemberScan.window.document.querySelector('#prospectQuestion').textContent,/CORE VALUES/);
for(let i=0;i<5;i++){existingMemberScan.window.eval('pick(0)');await existingMemberScan.window.eval('answerQuestion()')}
assert.equal(existingMemberScan.window.eval('s.view'),'revealPhoto');
await member.window.eval('refreshLive()');member.window.eval(`selectChempat('${id}')`);
{const d=member.window.document;assert.match(d.querySelector('.endControls').textContent,/Unmatch.*Report/);
member.window.eval(`openEnd('${id}','report')`);assert.match(d.querySelector('.endModal h2').textContent,/Report Mike/);
await member.window.eval('confirmEnd()');assert.match(d.getElementById('endError').textContent,/Choose what happened/);assert.equal(lastEnd,null);
d.querySelector('input[name=reportReason][value=harassment]').checked=true;d.getElementById('reportNote').value='Kept messaging after I said stop';
await member.window.eval('confirmEnd()');assert.equal(lastEnd.action,'report');assert.equal(lastEnd.id,id);assert.equal(lastEnd.reason,'harassment');assert.match(lastEnd.note,/said stop/);
assert.equal(d.getElementById('modalHost').innerHTML,'');assert.match(d.querySelector('.notice').textContent,/review your report/);
await member.window.eval('refreshLive()');member.window.eval(`selectChempat('${id}')`);
assert.match(d.querySelector('.connectionFocus').textContent,/Connection ended/);assert.doesNotMatch(d.querySelector('.endControls').textContent,/Unmatch/);assert.equal(d.querySelector('.inlineChat'),null)}
// Log out from the member page, then sign back in with an emailed code.
{const w=resumed.window,d=w.document;w.eval("navigate('dashboard','member')");
 const out=[...d.querySelectorAll('#navUser button')].find(b=>/LOG OUT/.test(b.textContent));assert.ok(out,'LOG OUT is in the top bar on the member page');
 out.click();assert.match(d.getElementById('logoutTitle').textContent,/Log out/);assert.match(d.getElementById('modalHost').textContent,/Sign in/);
 await w.eval('logout()');assert.deepEqual(memberCalls,['logout']);assert.equal(w.eval('s.view'),'landing');assert.equal(w.eval('s.member.name'),'');assert.equal(w.eval("sessionStorage.getItem(KEY)")?.includes('Cindy')??false,false);
 [...d.querySelectorAll('.joinCard .link')].find(b=>/Sign in/.test(b.textContent)).click();
 d.getElementById('signinEmail').value='nope';await w.eval('signinStart()');assert.match(d.getElementById('joinError').textContent,/email on your page/);
 d.getElementById('signinEmail').value='Cindy@Example.com';await w.eval('signinStart()');assert.equal(w.eval('s.joinStep'),'signinCode');assert.match(d.querySelector('.joinCard').textContent,/cindy@example.com/);
 d.getElementById('signinCode').value='12';await w.eval('signinVerify()');assert.match(d.getElementById('joinError').textContent,/six digit code/);
 d.getElementById('signinCode').value='123456';await w.eval('signinVerify()');
 assert.deepEqual(memberCalls,['logout','code_start','code_verify']);assert.equal(w.eval('s.view'),'dashboard');assert.equal(w.eval('s.member.name'),'Cindy');assert.equal(w.eval('s.liveMember'),true)}
member.window.close();prospect.window.close();resumed.window.close();existingMemberScan.window.close();
console.log('Two-browser UI path passed');
