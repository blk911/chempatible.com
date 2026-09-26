import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const token='a'.repeat(64),id='b'.repeat(64),photo='data:image/jpeg;base64,AA==';
const state={status:'invited',prospect_name:null,prospect_photo:null,prospect_answers:[],prospect_phone:null,prospect_email:null,messages:[]};
const inviter={name:'Cindy',photo,answers:[0,1,2,0,1,2,0,1,2,0]};
async function mockFetch(url,opt={}){
 const u=new URL(url,'https://chempatible.com'),body=opt.body?JSON.parse(opt.body):{};
 let data={},status=200;
 if(u.pathname==='/api/email'){if(opt.method==='POST'&&body.action==='send')data={ok:true,id};else data={email:'cindy@example.com'}}
 else if(u.searchParams.has('inbox'))data={connections:[{id,recipient_name:'Mike',recipient_email:'mike@example.com',...state}]};
 else if(u.searchParams.has('invite'))data={...inviter,answers:state.status==='invited'?[]:['chat','secondResults','email','tests'].includes(state.status)?inviter.answers:inviter.answers.slice(0,5),recipientName:'Mike',prospectName:state.prospect_name,prospectPhoto:state.prospect_photo,prospectAnswers:state.prospect_answers,prospectPhone:state.prospect_phone,prospectEmail:state.prospect_email,status:state.status,messages:state.messages};
 else if(body.action==='first'){Object.assign(state,{prospect_name:'Mike',prospect_photo:body.photo,prospect_answers:body.answers,status:'firstResults'});data={ok:true,answers:inviter.answers.slice(0,5)}}
 else if(body.action==='request'){Object.assign(state,{prospect_name:body.name,prospect_email:body.contact,prospect_photo:body.photo,status:'request'});data={ok:true}}
 else if(body.action==='decision'){state.status=body.decision==='accept'?'chat':'declined';data={ok:true}}
 else if(body.action==='message'){state.messages.push({by:body.token?'prospect':'member',text:body.text});data={messages:state.messages}}
 else if(body.action==='second'){state.prospect_answers=body.answers;state.status='secondResults';data={ok:true}}
 else if(body.action==='email'){state.prospect_email=body.email;state.status='email';data={ok:true}}
 else{status=400;data={error:'Unknown action'}}
 return {ok:status===200,status,json:async()=>data};
}
function page(url){const d=new JSDOM(html,{url,runScripts:'dangerously',pretendToBeVisual:true});d.window.fetch=mockFetch;d.window.scrollTo=()=>{};d.window.HTMLElement.prototype.scrollIntoView=()=>{};const script=d.window.document.createElement('script');script.textContent=source;d.window.document.body.append(script);return d}
const member=page('https://chempatible.com/');
member.window.eval(`s.member.name='Cindy';s.member.contact='cindy@example.com';s.member.photo='${photo}';s.member.answers=[0,1,2,0,1,2,0,1,2,0];s.phase='ready';navigate('dashboard','member')`);
await member.window.eval("pendingInvite={name:'Mike',email:'mike@example.com'};s.modal='send';renderModal();sendInvitation()");
assert.equal(member.window.eval('s.liveMember'),true);
assert.equal(member.window.eval('s.view'),'dashboard');
const prospect=page('https://chempatible.com/?invite='+token);
await new Promise(r=>setTimeout(r,20));
assert.equal(prospect.window.eval('s.view'),'invitee');
assert.equal(prospect.window.eval('s.member.name'),'Cindy');
prospect.window.eval('startProspect()');
for(let i=0;i<5;i++){prospect.window.eval('pick(0)');await prospect.window.eval('answerQuestion()')}
assert.equal(prospect.window.eval('s.view'),'revealPhoto');
assert.equal(prospect.window.document.getElementById('revealCameraInput').getAttribute('capture'),'user');
assert.equal(prospect.window.document.getElementById('revealCameraInput').closest('label').textContent,'TAKE PHOTO');
assert.equal(prospect.window.document.getElementById('revealCameraInput').hidden,false);
assert.equal(prospect.window.document.querySelector('.revealPhotoStep video'),null);
prospect.window.eval(`s.prospect.photo='${photo}'`);await prospect.window.eval('recordFirstFive()');prospect.window.eval("s.phase='firstResults';navigate('results','prospect')");
await member.window.eval('refreshLive()');assert.equal(member.window.eval('s.phase'),'firstResults');
prospect.window.eval('showRequest()');prospect.window.document.getElementById('prospectName').value='Mike';prospect.window.document.getElementById('prospectContact').value='mike@example.com';await prospect.window.eval('sendRequest()');
assert.equal(prospect.window.eval('s.view'),'profile');assert.match(prospect.window.document.querySelector('.profileGrid').textContent,/Chempats/i);
await member.window.eval('refreshLive()');assert.equal(member.window.eval('s.phase'),'request');
await member.window.eval('acceptRequest()');assert.equal(member.window.eval('s.view'),'dashboard');await prospect.window.eval('refreshLive()');assert.equal(prospect.window.eval('s.view'),'profile');prospect.window.eval('openConversation()');assert.equal(prospect.window.eval('s.view'),'conversation');
assert.match(prospect.window.document.querySelector('.chatHeader h1').textContent,/Private Chat/);
assert.equal(prospect.window.document.querySelectorAll('.chatPair img').length,2);
prospect.window.eval('goHome()');assert.equal(prospect.window.eval('s.view'),'profile');prospect.window.eval('openConversation()');
prospect.window.document.getElementById('message').value='Hello';await prospect.window.eval('sendMessage()');await member.window.eval('refreshLive()');assert.equal(member.window.eval('s.messages.length'),1);
prospect.window.eval('startSecondFive()');await prospect.window.eval('refreshLive()');assert.equal(prospect.window.eval('s.phase'),'secondFive');
for(let i=0;i<5;i++){prospect.window.eval('pick(1)');await prospect.window.eval('answerQuestion()')}
assert.equal(prospect.window.eval('s.view'),'results');assert.equal(prospect.window.eval('s.member.answers.length'),10);
await member.window.eval('refreshLive()');assert.equal(member.window.eval('s.prospect.answers.length'),10);
prospect.window.eval('continueAfterSecond()');prospect.window.document.getElementById('prospectEmail').value='mike@example.com';await prospect.window.eval('saveEmail()');assert.equal(prospect.window.eval('s.view'),'tests');
member.window.eval("pendingInvite={name:'Mike',email:'mike@example.com'};renderVerify();emailApi=async(data)=>{if(data.action==='verify')return {ok:true};throw Error('Temporary send failure')}");
member.window.document.getElementById('emailCode').value='123456';
await member.window.eval('verifyAndSend()');
assert.equal(member.window.document.getElementById('emailCode').disabled,true);
assert.match(member.window.document.querySelector('.modalForm button').textContent,/RETRY SEND/);
assert.match(member.window.document.getElementById('verifyError').textContent,/Temporary send failure/);
member.window.close();prospect.window.close();
console.log('Two-browser UI path passed');
