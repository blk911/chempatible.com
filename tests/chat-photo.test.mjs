import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../site.css',import.meta.url),'utf8');
const photo='data:image/jpeg;base64,AA==',replacement='data:image/jpeg;base64,AQ==';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const modes=['live-sent','live-received','token-received','token-sent'];

function fixture(mode,view){
 const dom=new JSDOM(html,{url:'https://isolated-chat.example/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
 w.fetch=async()=>({ok:false,status:401,json:async()=>({})});w.setInterval=()=>0;w.scrollTo=()=>{};
 const style=d.createElement('style');style.textContent=css;d.head.append(style);
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 const received=mode.endsWith('received'),live=mode.startsWith('live'),mine=received?'prospect':'member';
 const own={id:'owner',name:'Taylor',contact:'owner@example.com',photo,answers:Array(10).fill(0),verified:true};
 const messages=[{by:mine,text:'From me',reactions:{member:'like',prospect:'dislike'}},{by:received?'member':'prospect',text:'From them'}];
 const pair={id:'pair',side:received?'prospect':'member',sender_name:received?'Morgan':own.name,prospect_name:received?own.name:'Morgan',sender_photo:photo,prospect_photo:photo,sender_answers:own.answers,prospect_answers:own.answers,own_answers:own.answers,status:'chat',messages};
 const state=live?{view,actor:'member',member:own,memberId:own.id,account:own,liveMember:true,inbox:[pair,{...pair,id:'other',messages:[]}],selectedChempat:'pair'}:{view,actor:'prospect',member:{name:'Morgan',photo,answers:own.answers},prospect:{...own,email:own.contact},prospectId:own.id,liveInvite:true,liveToken:'original-token',phase:'chat',messages:received?messages:[],selectedChempat:received?'first':'pair',outgoing:[{id:'pair',name:'Morgan',status:'chat',messages:received?[]:messages,answers:own.answers},{id:'other',name:'Riley',status:'chat',messages:[],answers:own.answers}]};
 w.eval(`s={...blank(),...${JSON.stringify(state)}};render()`);
 const calls=[],decodes=[],revoked=[];let encoded=photo,failSend=false;
 w.fetch=async(url,options={})=>{
  assert.equal(url,'/api/connection','only the isolated message API is used; no login');
  const body=JSON.parse(options.body);calls.push(body);
  if(failSend)return {ok:false,status:500,json:async()=>({error:'Send interrupted. Try again.'})};
  const messages=JSON.parse(w.eval('JSON.stringify(chatSelection().messages)'));
  messages.push({by:mine,text:body.text,photo:body.photo});
  return {ok:true,status:200,json:async()=>({messages})};
 };
 w.URL.createObjectURL=()=>`blob:isolated-${decodes.length}`;w.URL.revokeObjectURL=url=>revoked.push(url);
 w.Image=class{width=1200;height=800;set src(url){this.url=url;decodes.push(this)}};
 w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
 w.HTMLCanvasElement.prototype.toDataURL=()=>encoded;
 const input=()=>d.querySelector('#message,#outgoingMessage');
 const type=text=>{input().value=text;input().dispatchEvent(new w.Event('input',{bubbles:true}))};
 const upload=(options={},node=d.querySelector('#chatPhotoInput'))=>{
  const file=new w.File(['test image'],options.name||'picture.jpg',{type:options.type||'image/jpeg'});
  if(options.size!==undefined)Object.defineProperty(file,'size',{value:options.size});
  Object.defineProperty(node,'files',{configurable:true,value:options.cancel?[]:[file]});
  let value=options.cancel?'':'C:\\fakepath\\picture.jpg';
  Object.defineProperty(node,'value',{configurable:true,get:()=>value,set:next=>{value=next}});
  node.dispatchEvent(new w.Event('change',{bubbles:true}));
  return node;
 };
 const complete=async(index=decodes.length-1,data=photo)=>{encoded=data;decodes[index].onload();await tick()};
 const fail=async(index=decodes.length-1)=>{decodes[index].onerror();await tick()};
 const draft=()=>w.eval('chatDrafts.get(chatDraftKey(chatSelection()))');
 const choose=id=>w.eval(`selectChempat('${id}')`);
 return {dom,w,d,mine,calls,decodes,revoked,input,type,upload,complete,fail,draft,choose,failSend:()=>{failSend=true},allowSend:()=>{failSend=false}};
}

for(const mode of modes)for(const view of ['dashboard','conversation']){
 test(`${mode} ${view}: shared labels, accessible Photo, image and caption send`,async()=>{
  const f=fixture(mode,view);try{
   const {w,d}=f,label=d.querySelector('.chatUpload'),file=d.querySelector('#chatPhotoInput');
   assert.equal(label.textContent,'Photo');assert.equal(label.htmlFor,file.id);assert.equal(file.labels[0],label);
   assert.equal(file.getAttribute('aria-label'),'Add a photo');assert.equal(file.getAttribute('accept'),'image/jpeg,image/png,image/webp');
   assert.equal(file.dataset.chatKey,w.eval('chatDraftKey(chatSelection())'));
   assert.equal(d.querySelector('.inlineMessage.mine .chatSender').textContent,'You');
   assert.equal(w.getComputedStyle(d.querySelector('.chatSender')).textAlign,'right');
   assert.equal(d.querySelector('.inlineMessage:not(.mine) b'),null);
   assert.equal(d.querySelector('.messageReactions'),null);assert.equal(d.querySelector('.inlineChat button'),null);
   assert.equal(w.eval('chatSelection().messages[0].reactions.member'),'like');assert.equal(typeof w.reactChat,'function');
   assert.equal(w.getComputedStyle(file).padding,'0px');assert.equal(w.getComputedStyle(file).width,'100%');
   for(const caption of ['', 'Photo with my caption']){
    f.type(caption);const selected=f.upload();assert.equal(selected.value,'');
    assert.equal(d.querySelector('.inlineComposer button').disabled,true);
    await w.sendMessage();assert.equal(f.calls.length,caption?1:0,'preparing image cannot send prematurely');
    await f.complete();assert.equal(d.querySelector('.chatDraft img').getAttribute('src'),photo);
    assert.equal(f.input().value,caption);assert.equal(d.querySelector('.inlineComposer button').disabled,false);
    await w.sendMessage();assert.equal(f.calls.at(-1).text,caption);assert.equal(f.calls.at(-1).photo,photo);
    assert.equal(mode==='token-received'?f.calls.at(-1).token:f.calls.at(-1).id,mode==='token-received'?'original-token':'pair');
    assert.equal(d.querySelector('.chatDraft'),null);assert.equal(f.input().value,'');assert.ok(d.querySelector('.inlineChat .chatPhoto'));
   }
   assert.equal(f.revoked.length,2);
  }finally{f.dom.window.close()}
 });

 test(`${mode} ${view}: cancel, validation, decode error and same-file retry preserve draft`,async()=>{
  const f=fixture(mode,view);try{
   f.type('Keep my draft');f.upload();await f.complete();
   f.upload({cancel:true});assert.equal(f.draft().photo,photo);assert.equal(f.input().value,'Keep my draft');
   for(const [options,error] of [[{type:'image/svg+xml'},/JPEG, PNG, or WebP/],[{size:10*1024*1024+1},/under 10 MB/]]){
    const selected=f.upload(options);assert.equal(selected.value,'');assert.match(f.d.querySelector('#chatError').textContent,error);
    assert.equal(f.draft().photo,photo);assert.equal(f.input().value,'Keep my draft');
   }
   const selected=f.upload();await f.fail();assert.equal(selected.value,'');
   assert.match(f.d.querySelector('#chatError').textContent,/Could not open/);assert.equal(f.draft().photo,photo);assert.equal(f.input().value,'Keep my draft');
   f.upload();await f.complete(undefined,replacement);assert.equal(f.draft().photo,replacement);assert.equal(f.d.querySelector('#chatError').textContent,'');
   f.failSend();await f.w.sendMessage();assert.match(f.d.querySelector('#chatError').textContent,/Send interrupted/);
   assert.equal(f.draft().photo,replacement);assert.equal(f.input().value,'Keep my draft');
   f.allowSend();await f.w.sendMessage();assert.equal(f.calls.at(-1).photo,replacement);assert.equal(f.calls.at(-1).text,'Keep my draft');
   assert.equal(f.d.querySelector('.chatDraft'),null);
  }finally{f.dom.window.close()}
 });

 test(`${mode} ${view}: delayed decode, reselection and removal cannot corrupt a newer draft`,async()=>{
  const f=fixture(mode,view);try{
   f.type('Before photo');f.upload();f.type('While photo loads');await f.complete();assert.equal(f.input().value,'While photo loads');
   f.upload();const old=f.decodes.length-1;f.upload();const current=f.decodes.length-1;
   await f.fail(old);assert.match(f.d.querySelector('#chatError').textContent,/Preparing photo/);assert.equal(f.draft().photo,photo);
   await f.complete(current,replacement);assert.equal(f.draft().photo,replacement);
   f.upload();const removed=f.decodes.length-1;f.d.querySelector('.chatDraft button').click();
   await f.complete(removed);assert.equal(f.d.querySelector('.chatDraft'),null);assert.equal(f.input().value,'While photo loads');
   f.upload();const earlier=f.decodes.length-1;f.upload();const latest=f.decodes.length-1;
   await f.complete(latest,replacement);await f.complete(earlier,photo);assert.equal(f.draft().photo,replacement,'old success cannot overwrite latest photo');
  }finally{f.dom.window.close()}
 });

 test(`${mode} ${view}: file change and decode stay with originating pair across navigation`,async()=>{
  const f=fixture(mode,view);try{
   const original=mode==='token-received'?'first':'pair';
   f.type('Original pair caption');const originalInput=f.d.querySelector('#chatPhotoInput');
   f.choose('other');f.type('Other pair caption');f.upload({},originalInput);await f.complete();
   assert.equal(f.d.querySelector('.chatDraft'),null);assert.equal(f.input().value,'Other pair caption');
   f.choose(original);assert.equal(f.draft().photo,photo);assert.equal(f.input().value,'Original pair caption');
   f.upload();f.choose('other');await f.complete(undefined,replacement);
   assert.equal(f.d.querySelector('.chatDraft'),null);assert.equal(f.input().value,'Other pair caption');
   f.choose(original);assert.equal(f.draft().photo,replacement);assert.equal(f.input().value,'Original pair caption');
   f.w.eval(`navigate('${view==='dashboard'?'conversation':'dashboard'}')`);
   assert.equal(f.d.querySelector('.chatDraft img').getAttribute('src'),replacement);assert.equal(f.input().value,'Original pair caption');
  }finally{f.dom.window.close()}
 });
}

test('photo dimensions, decoded size and 10 MB boundary retain existing limits',async()=>{
 const f=fixture('live-sent','dashboard');try{
  f.type('Keep this caption');f.upload({size:10*1024*1024});await f.complete();assert.equal(f.draft().photo,photo);
  f.upload();f.decodes.at(-1).width=8000;f.decodes.at(-1).height=6000;await f.complete();
  assert.match(f.d.querySelector('#chatError').textContent,/smaller photo/);assert.equal(f.draft().photo,photo);
  f.upload();await f.complete(undefined,'data:image/jpeg;base64,'+'A'.repeat(250000));
  assert.match(f.d.querySelector('#chatError').textContent,/too large/);assert.equal(f.draft().photo,photo);assert.equal(f.input().value,'Keep this caption');
 }finally{f.dom.window.close()}
});

test('an earlier send finishing during replacement decode retains the pending photo',async()=>{
 const f=fixture('live-sent','dashboard');try{
  f.upload();await f.complete();
  let finishSend;f.w.fetch=()=>new Promise(resolve=>{finishSend=()=>resolve({ok:true,status:200,json:async()=>({messages:[{by:'member',text:'',photo}]})})});
  const sending=f.w.sendMessage();f.upload();finishSend();await sending;
  assert.ok(f.draft().photoRequest,'earlier send must not delete the new selection');
  assert.equal(f.d.querySelector('.inlineComposer button').disabled,true);
  await f.complete(undefined,replacement);assert.equal(f.draft().photo,replacement);
  assert.equal(f.d.querySelector('.chatDraft img').getAttribute('src'),replacement);
 }finally{f.dom.window.close()}
});
