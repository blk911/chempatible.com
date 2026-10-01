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
const row=(id='pair',kind='vibe',side='member',overrides={})=>({id,kind,channel:kind==='friend'?'friend':'email',side,status:'chat',sender_name:side==='member'?own.name:'Morgan Other',prospect_name:side==='member'?'Morgan Other':own.name,sender_photo:photo,prospect_photo:photo,sender_answers:own.answers,prospect_answers:own.answers,own_answers:own.answers,messages:[],invitedAt:sentAt,canCancel:false,canBlock:true,historyEmail:'',...overrides});
const flush=async()=>{await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0))};
function fixture(rows=[row()],{token=false,cursor=null}={}){
 const dom=new JSDOM(html,{url:'https://freezer.example/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
 w.fetch=async()=>({ok:false,status:401,json:async()=>({})});w.setInterval=()=>0;w.scrollTo=()=>{};
 const style=d.createElement('style');style.textContent=css;d.head.append(style);
 const script=d.createElement('script');script.textContent=source;d.body.append(script);
 const server={rows:clone(rows),cursor,next:[],nextCursor:null,calls:[],fail:false};
 const state=token?{view:'dashboard',actor:'prospect',member:{name:'Morgan Other',photo,answers:own.answers},prospect:{...own,email:own.contact},prospectId:own.id,liveInvite:true,liveToken:'original-token',liveId:rows[0].id,phase:rows[0].status,firstConnection:rows[0],invitedAt:sentAt,selectedChempat:'first'}:{view:'dashboard',actor:'member',member:own,memberId:own.id,account:own,liveMember:true,inbox:rows.filter(c=>c.kind!=='friend'),friends:rows.filter(c=>c.kind==='friend'),selectedChempat:rows[0]?.id||'',freezerCursor:cursor};
 w.eval(`s={...blank(),...${JSON.stringify(state)}};render()`);
 const response=(body,status=200)=>({ok:status<400,status,json:async()=>clone(body)});
 const fetch=async(url,options={})=>{
  assert.ok(url.startsWith('/api/'),'all requests stay in isolated API stubs');const body=options.body?JSON.parse(options.body):null;server.calls.push({url,body});
  if(url==='/api/member'&&body?.action==='logout')return response({ok:true});
  if(url==='/api/connection?inbox=1')return response({connections:server.rows,freezerCursor:server.cursor});
  if(url.startsWith('/api/connection?freezer='))return response({connections:server.next,freezerCursor:server.nextCursor});
  if(url.startsWith('/api/connection?invite='))return response({...server.rows[0],answers:own.answers,prospectAnswers:own.answers});
  assert.equal(url,'/api/connection');if(server.fail)return response({error:'The change was interrupted. Try again.'},503);
  const c=server.rows.find(c=>c.id===(body.id||rows[0].id));assert.ok(c,'action keeps original target');
  if(body.action==='freeze'){c.frozenAt=actedAt;c.freezerAction='freeze';c.freezerActionAt=actedAt}
  else if(body.action==='unfreeze'){c.frozenAt=null;c.freezerAction=null;c.freezerActionAt=null}
  else if(['cancel','block','unmatch','report'].includes(body.action)){
   for(const candidate of body.action==='block'?server.rows:[c]){candidate.status='ended';candidate.canCancel=false;candidate.freezerAction=body.action==='block'?'block':body.action==='cancel'?'cancel':'ended';candidate.freezerActionAt=actedAt;candidate.endedAt=actedAt;candidate.blockedByMe=body.action==='block';candidate.canBlock=!candidate.blockedByMe;candidate.messages=[]}
  }else throw Error(`Unexpected action ${body.action}`);
  return response({ok:true,connection:c});
 };
 w.fetch=fetch;
 return {dom,w,d,server,fetch,state:()=>JSON.parse(w.eval('JSON.stringify(s)')),open:(id,kind)=>w.openEnd(id,kind),close:()=>dom.window.close()};
}
const archive=f=>f.d.querySelector('.socialFreezer');
const menu=f=>f.d.querySelector('.connectionFocus .connectionMenu');
const buttons=node=>[...node.querySelectorAll('button')].map(b=>b.textContent);

for(const kind of ['vibe','friend'])for(const side of ['member','prospect'])test(`${kind}/${side}: freeze is personal, survives incoming messages, restores only active connection and draft`,async()=>{
 const f=fixture([row('pair',kind,side)]);
 try{
  assert.deepEqual(buttons(menu(f)),['Block','Freezer','Unmatch','Report']);assert.equal(f.d.querySelector('.socialSecrets').nextElementSibling,archive(f));
  f.d.querySelector('#message').value='A saved private draft';f.open('pair','freeze');assert.match(f.d.querySelector('.endModal').textContent,/does not end the connection or block contact/);await f.w.confirmEnd();
  assert.equal(f.server.rows[0].status,'chat');assert.equal(f.d.querySelector('.inlineComposer'),null);assert.equal(f.d.querySelectorAll('.chempatContact').length,0);assert.match(archive(f).textContent,/Morgan.*In Freezer/s);assert.match(archive(f).textContent,/Return to connections/);
  f.server.rows[0].messages.push({by:side==='member'?'prospect':'member',text:'A message while hidden'});await f.w.refreshLive();assert.equal(f.d.querySelector('.inlineChat'),null);assert.equal(f.d.querySelectorAll('.freezerItem').length,1);
  f.open('pair','unfreeze');assert.match(f.d.querySelector('.endModal').textContent,/does not unblock anyone, reopen an ended connection, or reactivate a canceled invitation/);await f.w.confirmEnd();
  assert.equal(f.d.querySelectorAll('.freezerItem').length,0);assert.match(f.d.querySelector('.inlineChat').textContent,/A message while hidden/);assert.equal(f.d.querySelector('#message').value,'A saved private draft');assert.equal(f.server.rows[0].status,'chat');
  assert.deepEqual(f.server.calls.filter(c=>c.body).map(c=>c.body.action),['freeze','unfreeze']);
 }finally{f.close()}
});

for(const kind of ['vibe','friend'])test(`${kind}: sender can cancel unaccepted invitation; unnamed records stay honest`,async()=>{
 const f=fixture([row('pending',kind,'member',{status:'invited',prospect_name:'',recipient_name:'',canCancel:true,canBlock:false,historyEmail:'provided-recipient@example.com'})]);
 try{
  const expected='Mystery Guest';assert.equal(f.d.querySelector('#connectionName').textContent,expected);assert.deepEqual(buttons(menu(f)),['Cancel invitation','Freezer']);
  f.open('pending','block');assert.equal(f.state().modal,'');f.open('pending','cancel');assert.match(f.d.querySelector('.endModal').textContent,/link will stop working/);await f.w.confirmEnd();
  assert.match(archive(f).textContent,new RegExp(expected));assert.match(archive(f).textContent,/provided-recipient@example.com/);assert.match(archive(f).textContent,/Invitation canceled/);assert.equal(archive(f).querySelector('.returnConnection'),null);f.open('pending','unfreeze');assert.equal(f.state().modal,'');
  const dates=[...archive(f).querySelectorAll('time')].map(n=>n.dateTime);assert.deepEqual(dates,[sentAt,actedAt]);
 }finally{f.close()}
});

test('capabilities come only from server; a pending name/email does not authorize block or receiver cancel',()=>{
 for(const side of ['member','prospect']){
  const f=fixture([row('pending','friend',side,{status:'invited',recipient_name:'Named Invitee',recipient_email:'pending@example.com',canCancel:false,canBlock:false})]);
  try{assert.deepEqual(buttons(menu(f)),['Freezer']);f.open('pending','cancel');f.open('pending','block');assert.equal(f.state().modal,'')}finally{f.close()}
 }
});

test('block copy covers both kinds, moves both histories, and return never unblocks or revives cancellation',async()=>{
 const f=fixture([row('vibe'),row('friend','friend')]);
 try{
  f.open('vibe','block');assert.match(f.d.querySelector('.endModal').textContent,/ends your existing Friend and Vibe connections/);await f.w.confirmEnd();assert.equal(f.d.querySelectorAll('.freezerItem').length,2);assert.equal(f.d.querySelectorAll('.chempatContact').length,0);assert.equal(f.d.querySelectorAll('.returnConnection').length,0);assert.equal(f.d.querySelector('.inlineComposer'),null);
  for(const id of ['vibe','friend']){f.open(id,'unfreeze');assert.equal(f.state().modal,'');assert.match(archive(f).querySelector(`[data-connection-id="${id}"]`).textContent,/Blocked by you/)}
 }finally{f.close()}
});

test('old cancellations, missing dates, hidden emails and unclaimed labels are projected without invention',()=>{
 const rows=[row('old','friend','member',{status:'ended',prospect_name:'',recipient_name:'',freezerAction:'cancel',invitedAt:null,freezerActionAt:null,endedAt:null,canBlock:false,historyEmail:'',recipient_email:'private-recipient@example.com',prospect_email:'private-profile@example.com'}),row('received','vibe','prospect',{status:'ended',freezerAction:'ended',freezerActionAt:'invalid-date',invitedAt:'invalid-date',historyEmail:'explicitly-shared@example.com',sender_email:'private-sender@example.com'})];
 const f=fixture(rows);
 try{assert.match(archive(f).textContent,/Mystery Guest/);assert.equal((archive(f).textContent.match(/Date unavailable/g)||[]).length,4);assert.equal(archive(f).querySelector('time'),null);assert.doesNotMatch(f.d.body.textContent,/private-recipient@|private-profile@|private-sender@|private-owner@/);assert.match(archive(f).textContent,/explicitly-shared@example.com/);assert.equal(f.d.querySelectorAll('.returnConnection').length,0);assert.equal(f.d.querySelectorAll('.inlineComposer').length,0)}finally{f.close()}
});

test('QR sender can find Cancel and Freezer before anyone scans',()=>{
 const f=fixture([row('qr','vibe','member',{status:'invited',channel:'qr',claimed:false,prospect_name:'',canCancel:true,canBlock:false})]);
 try{assert.equal(f.d.querySelectorAll('.chempatContact').length,0);assert.deepEqual(buttons(f.d.querySelector('.pendingInvite .connectionMenu')),['Cancel invitation','Freezer'])}finally{f.close()}
});

for(const action of ['freeze','block'])test(`token recipient: ${action} uses original token and inbox projection`,async()=>{
 const f=fixture([row('incoming','vibe','prospect')],{token:true});
 try{await f.w.refreshOutgoing();f.open('first',action);await f.w.confirmEnd();assert.equal(f.server.calls.find(c=>c.body)?.body.token,'original-token');assert.equal(f.server.calls.find(c=>c.body)?.body.id,undefined);assert.equal(f.d.querySelector('.inlineComposer'),null);assert.match(archive(f).textContent,action==='freeze'?/In Freezer/:/Blocked by you/)}finally{f.close()}
});

test('history pagination appends once, preserves active connections, and does not invent absent identity',async()=>{
 const f=fixture([row('active'),row('first-old','friend','member',{status:'ended',freezerAction:'cancel',canBlock:false})],{cursor:'opaque one'});
 try{
  f.server.next=[row('older','friend','member',{status:'ended',freezerAction:'cancel',prospect_name:'',recipient_name:'',canBlock:false}),f.server.rows[1]];let release;f.w.fetch=async(url,options)=>url.includes('freezer=1')?new Promise(resolve=>{release=async()=>resolve(await f.fetch(url,options))}):f.fetch(url,options);
  const pending=f.w.loadFreezerHistory();await f.w.loadFreezerHistory();assert.ok(f.d.querySelector('.loadFreezer').disabled);await release();await pending;
  assert.equal(f.server.calls.filter(c=>c.url.includes('freezer=1')).length,1);assert.equal(f.d.querySelectorAll('.freezerItem').length,2);assert.equal(f.d.querySelectorAll('.chempatContact').length,1);assert.equal(f.d.querySelector('#connectionName').textContent,'Morgan');assert.match(archive(f).textContent,/Mystery Guest/);assert.equal(f.d.querySelector('.loadFreezer'),null);
  await f.w.refreshLive();assert.equal(f.d.querySelectorAll('.freezerItem').length,2,'polling retains already loaded history');assert.equal(f.d.querySelector('.loadFreezer'),null,'polling does not reset completed pagination');
 }finally{f.close()}
});

for(const action of ['freeze','cancel','block','unfreeze'])test(`${action}: duplicate clicks and late success preserve newer modal and draft`,async()=>{
 const c=row('pair','friend','member',action==='cancel'?{status:'invited',canCancel:true,canBlock:false}:action==='unfreeze'?{frozenAt:actedAt,freezerAction:'freeze',freezerActionAt:actedAt}:{}),f=fixture([c]);
 try{
  let release;f.w.fetch=async(url,options)=>options?.method==='POST'?new Promise(resolve=>{release=async()=>resolve(await f.fetch(url,options))}):f.fetch(url,options);
  f.open('pair',action);const pending=f.w.confirmEnd();await f.w.confirmEnd();assert.ok(f.d.querySelector('#endConfirm').disabled);f.w.closeInvite();f.w.openFriendShare();f.d.querySelector('#friendName').value='New draft';f.d.querySelector('#friendEmail').value='new@example.com';
  await release();await pending;assert.equal(f.server.calls.filter(c=>c.body).length,1);assert.equal(f.state().modal,'friendShare');assert.equal(f.d.querySelector('#friendName').value,'New draft');assert.equal(f.d.querySelector('#friendEmail').value,'new@example.com');
 }finally{f.close()}
});

test('late failure, dismissal/reopen, and account replacement do not apply another request result',async()=>{
 const f=fixture();
 try{
  let release;f.w.fetch=async(url,options)=>options?.method==='POST'?new Promise(resolve=>{release=async()=>resolve(await f.fetch(url,options))}):f.fetch(url,options);
  f.server.fail=true;f.open('pair','freeze');let pending=f.w.confirmEnd();f.w.closeInvite();f.open('pair','freeze');await release();await pending;assert.equal(f.d.querySelector('#endConfirm').disabled,false);assert.doesNotMatch(f.d.querySelector('#endError').textContent,/interrupted/);
  f.server.fail=false;pending=f.w.confirmEnd();f.w.eval(`s={...blank(),view:'dashboard',member:{...${JSON.stringify(own)},id:'new-account'},memberId:'new-account',account:{...${JSON.stringify(own)},id:'new-account'}};render()`);const before=f.state();await release();await pending;assert.deepEqual(f.state(),before);
 }finally{f.close()}
});

test('poll begun before freeze cannot restore stale active data; report draft survives polling',async()=>{
 const f=fixture();
 try{
  f.open('pair','report');f.d.querySelector('input[value="other"]').checked=true;f.d.querySelector('#reportNote').value='Saved report details';f.server.rows[0].messages.push({by:'prospect',text:'Poll update'});await f.w.refreshLive();assert.equal(f.d.querySelector('#reportNote').value,'Saved report details');assert.ok(f.d.querySelector('input[value="other"]').checked);f.w.closeInvite();
  let release;const stale=clone(f.server.rows);let hold=true;f.w.fetch=async(url,options)=>url.includes('inbox=1')&&hold?(hold=false,new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({connections:stale})})})):f.fetch(url,options);
  const polling=f.w.refreshLive();f.open('pair','freeze');const action=f.w.confirmEnd();await flush();release();await Promise.all([polling,action]);assert.equal(f.d.querySelector('.inlineComposer'),null);assert.match(archive(f).textContent,/In Freezer/);
 }finally{f.close()}
});

test('a delayed history page cannot append to a different account or after an action',async()=>{
 for(const outcome of ['success','failure','account']){
  const f=fixture([row()],{cursor:'opaque'});
  try{f.server.next=[row('old','friend','member',{status:'ended',freezerAction:'cancel'})];let release;f.w.fetch=async(url,options)=>url.includes('freezer=1')?new Promise(resolve=>{release=async()=>resolve(await f.fetch(url,options))}):f.fetch(url,options);const pending=f.w.loadFreezerHistory();if(outcome==='account')f.w.eval(`s={...blank(),view:'dashboard',member:${JSON.stringify(own)},memberId:'other'};render()`);else{f.server.fail=outcome==='failure';f.open('pair','freeze');await f.w.confirmEnd()}await release();await pending;assert.equal(f.d.querySelector('[data-connection-id="old"]'),null);if(outcome==='failure')assert.equal(f.d.querySelector('.loadFreezer').disabled,false)}finally{f.close()}
 }
});

test('history labels creation conservatively and uses server sent evidence only',()=>{
 const f=fixture([row('qr','vibe','member',{status:'ended',channel:'qr',freezerAction:'cancel'}),row('link','friend','member',{status:'ended',freezerAction:'cancel',prospect_name:'',recipient_name:''}),row('email','friend','member',{status:'ended',freezerAction:'cancel',invitationDateLabel:'Sent',historyEmail:'supplied@example.com'})]);
 try{for(const id of ['qr','link']){const item=archive(f).querySelector(`[data-connection-id="${id}"]`);assert.equal(item.querySelector('dt').textContent,'Created');assert.doesNotMatch(item.textContent,/Sent/)}assert.equal(archive(f).querySelector('[data-connection-id="email"] dt').textContent,'Sent')}finally{f.close()}
});

test('a remotely hidden selected connection leaves the composer even while its input has focus',async()=>{
 const f=fixture();
 try{const input=f.d.querySelector('#message');input.value='Draft before remote freeze';input.focus();Object.assign(f.server.rows[0],{frozenAt:actedAt,freezerAction:'freeze',freezerActionAt:actedAt});await f.w.refreshLive();assert.equal(f.d.querySelector('.inlineComposer'),null);f.open('pair','unfreeze');await f.w.confirmEnd();assert.equal(f.d.querySelector('#message').value,'Draft before remote freeze')}finally{f.close()}
});

test('returning paginated received history from a token page restores the actual pair',async()=>{
 const original=row('original','vibe','prospect'),older=row('older','vibe','prospect',{frozenAt:actedAt,freezerAction:'freeze',freezerActionAt:actedAt});const f=fixture([original],{token:true});
 try{f.server.rows.push(older);await f.w.refreshOutgoing();f.open('older','unfreeze');await f.w.confirmEnd();f.w.selectChempat('older');await flush();assert.equal(f.state().liveMember,true);assert.equal(f.state().liveId,'older');assert.equal(f.w.eval('connectionRef().id'),'older');assert.equal(f.w.eval('chatRequest(chatSelection()).id'),'older');assert.equal(f.state().liveToken,'')}finally{f.close()}
});

test('Freezer uses vertical mobile cards and wraps contact details',()=>{
 const f=fixture([row('old','friend','member',{status:'ended',freezerAction:'cancel',historyEmail:'an.extremely.long.synthetic.recipient@example.com'})]);
 try{const style=f.d.createElement('style');style.textContent='';const originalStyle=f.d.querySelector('style'),rules=[...originalStyle.sheet.cssRules];originalStyle.remove();for(const width of [320,375,700,1280]){style.textContent=rules.map(rule=>rule.type===f.w.CSSRule.MEDIA_RULE?rule.conditionText==='(max-width:700px)'&&width<=700?[...rule.cssRules].map(r=>r.cssText).join('\n'):'':rule.cssText).join('\n');f.d.head.append(style);assert.equal(f.w.getComputedStyle(f.d.querySelector('.freezerEmail')).overflowWrap,'anywhere');if(width<=700){assert.equal(f.w.getComputedStyle(f.d.querySelector('.freezerItem')).gridTemplateColumns,'minmax(0,1fr)');assert.equal(f.w.getComputedStyle(f.d.querySelector('.freezerDates')).gridTemplateColumns,'minmax(0,1fr) minmax(0,1fr)')}style.remove()}}finally{f.close()}
});

test('a remotely blocked original token recovers authenticated history and removes stale chat',async()=>{
 const f=fixture([row('original','vibe','prospect')],{token:true});
 try{Object.assign(f.server.rows[0],{status:'ended',freezerAction:'ended',endedAt:actedAt,freezerActionAt:actedAt,messages:[]});f.w.fetch=async(url,options)=>url.includes('?invite=')?{ok:false,status:403,json:async()=>({error:'This connection is unavailable.'})}:f.fetch(url,options);await f.w.refreshLive();assert.equal(f.state().liveMember,true);assert.equal(f.state().liveInvite,false);assert.equal(f.state().liveToken,'');assert.equal(f.d.querySelector('.inlineComposer'),null);assert.match(archive(f).textContent,/Connection ended/);assert.equal(f.d.querySelector('.returnConnection'),null)}finally{f.close()}
});

test('Mystery Guest stays intact until the server supplies a real counterpart name',async()=>{
 for(const kind of ['vibe','friend']){
  const f=fixture([row('pending',kind,'member',{status:'invited',prospect_name:'',recipient_name:'',canCancel:true,canBlock:false})]);
  try{assert.equal(f.d.querySelector('#connectionName').textContent,'Mystery Guest');f.server.rows[0].prospect_name='Riley Actual';await f.w.refreshLive();assert.equal(f.d.querySelector('#connectionName').textContent,'Riley');assert.doesNotMatch(f.d.querySelector('.connectionFocus').textContent,/Mystery Guest/)}finally{f.close()}
 }
});


test('a connection ended after personal freezing shows the final status with only its actual date',()=>{
 const endedAt='2026-09-30T12:00:00.000Z';
 for(const status of ['ended','declined','expired'])for(const date of [endedAt,null]){
  const f=fixture([row('old','friend','member',{status,frozenAt:actedAt,freezerAction:'freeze',freezerActionAt:actedAt,endedAt:date})]);
  try{const item=archive(f).querySelector('.freezerItem'),action=item.querySelector('.freezerDates>div:last-child');assert.equal(action.querySelector('dt').textContent,({ended:'Connection ended',declined:'Connection passed',expired:'Invitation expired'})[status]);assert.equal(item.querySelector('.returnConnection'),null);assert.doesNotMatch(action.textContent,/In Freezer/);if(date)assert.equal(action.querySelector('time').dateTime,endedAt);else{assert.equal(action.querySelector('time'),null);assert.match(action.textContent,/Date unavailable/)}assert.notEqual(action.querySelector('time')?.dateTime,actedAt,'freeze date is never presented as the later ending date')}finally{f.close()}
 }
});
