import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const photo='data:image/jpeg;base64,AA==',otherPhoto='data:image/jpeg;base64,AQ==';
const own={id:'owner',name:'Taylor Owner',contact:'private-owner@example.com',photo,answers:Array(10).fill(0),verified:true};
const sent={id:'a'.repeat(64),side:'member',prospect_name:'Morgan Other',prospect_photo:otherPhoto,prospect_answers:Array(10).fill(1),sender_name:own.name,sender_photo:photo,sender_answers:own.answers,own_answers:own.answers,status:'chat',messages:[{by:'prospect',text:'Hi Taylor'}],invitedAt:'2026-09-21T12:30:00.000Z',recipient_email:'private-invite@example.com',prospect_email:'unshared@example.com'};
const received={id:'b'.repeat(64),side:'prospect',sender_name:'Riley Friend',sender_photo:otherPhoto,sender_answers:Array(10).fill(2),prospect_name:own.name,prospect_photo:photo,prospect_answers:own.answers,own_answers:own.answers,status:'email',messages:[{by:'member',text:'Hi from Riley'}],invitedAt:'2026-09-22T17:45:00.000Z',sender_email:'private-sender@example.com',prospect_email:'my-shared@example.com'};
const dom=new JSDOM(html,{url:'https://layout.example/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
w.fetch=async()=>({ok:false,status:401,json:async()=>({})});w.setInterval=()=>0;w.scrollTo=()=>{};
const script=d.createElement('script');script.textContent=source;d.body.append(script);
const seed=()=>w.eval(`s={...blank(),view:'dashboard',actor:'member',member:${JSON.stringify(own)},memberId:'owner',account:${JSON.stringify(own)},liveMember:true,inbox:${JSON.stringify([sent,received])},selectedChempat:'${sent.id}'};render()`);
const choose=(id,secrets=false)=>w.eval(`selectChempat('${id}',${secrets})`);
const panel=()=>d.querySelector('.connectionFocus');
const header=()=>d.querySelector('.focusHeader');
const privateButton=()=>d.querySelector('.chempatContact.selected .privateChatButton');

try{
 seed();
 // JSDOM has no viewport layout engine. Activate the matching media rules
 // explicitly so computed styles still catch mobile flex-axis regressions.
 const cssSource=d.createElement('style');cssSource.textContent=fs.readFileSync(new URL('../site.css',import.meta.url),'utf8');d.head.append(cssSource);
 const cssRules=[...cssSource.sheet.cssRules];cssSource.remove();
 const readyProbe=d.createElement('div');readyProbe.innerHTML=w.renderVibeReady();d.body.append(readyProbe);
 const cssAtWidth=(rules,width)=>rules.map(rule=>{
  if(rule.type!==w.CSSRule.MEDIA_RULE)return rule.cssText;
  const matches=rule.conditionText.split(/\s+and\s+/).every(condition=>{
   const match=condition.match(/^\((min|max)-width:\s*(\d+)px\)$/);
   assert.ok(match,`layout test must handle media condition ${condition}`);
   return match[1]==='min'?width>=Number(match[2]):width<=Number(match[2]);
  });
  return matches?cssAtWidth([...rule.cssRules],width):'';
 }).join('\n');
 for(const width of [320,375,390,430,700,701,1280]){
  const viewportCss=d.createElement('style');viewportCss.textContent=cssAtWidth(cssRules,width);d.head.append(viewportCss);
  const actions=d.querySelector('.socialMemberAction'),prompt=actions.querySelector('.ctaPrompt'),friendButton=actions.querySelector('.friendShareButton');
  assert.ok(friendButton,'friend invitation remains a dashboard action');
  assert.equal(friendButton.getAttribute('onclick'),'openFriendShare()');
  const readyFriend=readyProbe.querySelector('.vibeReady .friendShareButton');
  assert.ok(readyFriend,'friend invitation remains available after the first five');
  assert.equal(readyFriend.getAttribute('onclick'),'openFriendShare()');
  assert.equal(actions.firstElementChild,prompt,'prompt stays above the action buttons');
  assert.equal(w.getComputedStyle(prompt).flexBasis,'100%');
  if(width<=700){
   assert.equal(w.getComputedStyle(actions).flexDirection,'row',`${width}px: button basis must control width, never height`);
   assert.equal(w.getComputedStyle(actions).flexWrap,'wrap',`${width}px: narrow screens can wrap the buttons`);
   for(const action of actions.querySelectorAll('.button')){
    const style=w.getComputedStyle(action);
    assert.equal(style.flexBasis,'155px',`${width}px: buttons retain their horizontal sizing`);
    assert.ok(parseFloat(style.minHeight)>=44,`${width}px: buttons retain a usable touch target`);
    assert.notEqual(style.display,'none');
   }
   assert.equal(w.getComputedStyle(readyFriend).display,'block');
   assert.equal(w.getComputedStyle(readyFriend).width,'100%');
   assert.ok(parseFloat(w.getComputedStyle(readyFriend).minHeight)>=44);
  }else{
   assert.equal(w.getComputedStyle(actions).flexDirection,'column',`${width}px: desktop action layout stays unchanged`);
   assert.equal(w.getComputedStyle(friendButton).flexBasis,'auto');
  }
  viewportCss.remove();
 }
 readyProbe.remove();
 // Sent details must remain separate rows, including long recipient values.
 w.eval(`s.friendShare={expiresAt:'2099-01-01',recipient:{name:'A long synthetic friend name',email:'a.long.synthetic.recipient@example.com'},code:'ABC12345',url:'https://layout.example/friend?friend=synthetic'};s.modal='friendShare';renderModal()`);
 const sentCss=d.createElement('style');sentCss.textContent=fs.readFileSync(new URL('../site.css',import.meta.url),'utf8');d.head.append(sentCss);
 const sentCard=d.querySelector('.friendSentCard');
 assert.ok(sentCard);
 assert.equal(w.getComputedStyle(sentCard).display,'grid');
 assert.equal(w.getComputedStyle(sentCard).gap,'8px');
 assert.equal(w.getComputedStyle(sentCard).overflowWrap,'anywhere');
 assert.equal(sentCard.children.length,4);
 sentCss.remove();w.closeInvite();
 // Sent and received selections always identify the other person with one image.
 for(const [connection,name] of [[sent,'Morgan'],[received,'Riley']]){
  choose(connection.id);
  assert.equal(d.querySelector('#connectionName').textContent,name);
  assert.equal(header().querySelectorAll('img').length,1);
  assert.equal(header().querySelector('img').getAttribute('src'),otherPhoto);
  assert.equal(header().querySelector('img').alt,name);
  assert.doesNotMatch(header().textContent,/Taylor|YOUR CHEMPAT|Chat open|You both chose/);
  assert.equal(d.querySelector('.focusPhotos'),null);
  assert.ok(d.querySelector('.inlineComposer'),'approved chat retains shared composer');
  assert.equal(privateButton().nextElementSibling.textContent,'Our Secrets','chat pill sits immediately left of secrets');
  assert.equal(privateButton().getAttribute('aria-pressed'),'true');
  assert.equal(header().querySelector('time').dateTime,connection.invitedAt);
  assert.doesNotMatch(panel().textContent,/private-owner@|private-invite@|private-sender@|my-shared@|unshared@/);
 }
 // Only the other person's explicitly shared address is visible.
 w.eval(`s.inbox[0].status='email';s.inbox[0].prospect_email='morgan-shared@example.com'`);choose(sent.id);
 assert.equal(d.querySelector('.sharedContact').textContent,'morgan-shared@example.com');
 for(const status of ['chat','ended','declined','invited']){
  w.eval(`s.inbox[0].status='${status}'`);choose(sent.id);
  assert.equal(d.querySelector('.sharedContact'),null,`email stays hidden in ${status}`);
 }
 // Missing or invalid dates are omitted rather than replaced with the current date.
 for(const date of [null,'not-a-date']){w.eval(`s.inbox[0].invitedAt=${JSON.stringify(date)}`);choose(sent.id);assert.equal(header().querySelector('time'),null)}
 seed();
 // Switching secrets and connections preserves independent drafts and pair routing.
 choose(sent.id);d.querySelector('#message').value='Draft for Morgan';d.querySelector('.chempatContact.selected .secretsButton').click();
 assert.equal(d.querySelector('.inlineChat'),null);assert.equal(d.querySelectorAll('.secretCompare').length,10);
 assert.equal(d.querySelector('.chempatContact.selected .secretsButton').getAttribute('aria-pressed'),'true');
 privateButton().click();assert.equal(d.querySelector('#message').value,'Draft for Morgan');assert.equal(d.activeElement.id,'message');
 choose(received.id);assert.equal(d.querySelector('#message').value,'');d.querySelector('#message').value='Draft for Riley';choose(sent.id);
 assert.equal(d.querySelector('#message').value,'Draft for Morgan');assert.equal(w.eval('chatRequest(chatSelection()).id'),sent.id);
 choose(received.id);assert.equal(d.querySelector('#message').value,'Draft for Riley');assert.equal(w.eval('chatRequest(chatSelection()).id'),received.id);
 for(let i=0;i<3;i++)privateButton().click();assert.equal(d.querySelector('#message').value,'Draft for Riley','repeated activation retains draft');
 assert.equal(d.querySelectorAll('.inlineComposer').length,1);
 // Mutual consent remains required in every pending phase and direction.
 const expected={member:{invited:null,firstResults:null,request:'KEEP GOING',secondFive:'PLAY OUR NEXT FIVE',secondResults:'SEE OUR NEXT FIVE',chatRequested:'OPEN CHAT'},prospect:{invited:null,firstResults:'KEEP GOING',request:null,secondFive:'PLAY OUR NEXT FIVE',secondResults:'ASK TO CHAT',chatRequested:null}};
 for(const side of ['member','prospect'])for(const status of Object.keys(expected[side])){
  const id=side==='member'?sent.id:received.id;
  w.eval(`s.inbox.find(c=>c.id==='${id}').status='${status}'`);choose(id);
  assert.equal(privateButton().disabled,true,`${side}/${status} cannot open chat`);
  w.eval(`selectPrivateChat('${id}')`);assert.equal(d.querySelector('.inlineComposer'),null);assert.equal(d.querySelector('.inlineChat'),null);
  const action=expected[side][status];if(action)assert.ok(panel().textContent.includes(action),`${side}/${status} keeps next action ${action}`);
  else assert.equal(d.querySelector('.focusNextActions'),null,`${side}/${status} is waiting`);
 }
 // Safety actions are available through a labelled, keyboard-native menu.
 seed();const menu=d.querySelector('.connectionMenu');assert.ok(menu.querySelector('summary[aria-label="Connection options for Morgan"]'));
 assert.equal(menu.querySelectorAll('button').length,2);menu.querySelector('button').click();assert.equal(w.eval('s.endTarget.id'),sent.id);assert.equal(w.eval('s.endTarget.kind'),'unmatch');
 w.eval('closeInvite()');assert.equal(w.eval('s.inbox[0].status'),'chat','cancel does not end the connection');
 d.querySelector('.connectionMenu button:last-child').click();assert.equal(w.eval('s.endTarget.kind'),'report');w.eval('closeInvite()');
 // Token-based prospect pages retain their original incoming pair while selecting outgoing.
 w.eval(`s={...blank(),view:'dashboard',actor:'prospect',member:{name:'Original Sender',photo:'${photo}',answers:Array(10).fill(0)},prospect:{name:'Taylor',photo:'${photo}',email:'private-owner@example.com',answers:Array(10).fill(0)},prospectId:'owner',phase:'chat',messages:[],invitedAt:'2026-09-20T08:00:00Z',outgoing:[{id:'outgoing',name:'Outgoing Friend',photo:'${otherPhoto}',answers:Array(10).fill(2),status:'email',invitedAt:'2026-09-23T08:00:00Z',sharedEmail:'shared-outgoing@example.com',email:'private-recipient@example.com',messages:[]}]};render()`);
 choose('outgoing');assert.equal(d.querySelector('#connectionName').textContent,'Outgoing');assert.equal(d.querySelector('.sharedContact').textContent,'shared-outgoing@example.com');assert.doesNotMatch(header().textContent,/Original|private-recipient/);
 d.querySelector('#outgoingMessage').value='Outgoing draft';choose('first');assert.equal(d.querySelector('#connectionName').textContent,'Original');assert.equal(d.querySelector('.sharedContact'),null);assert.equal(w.eval('s.member.name'),'Original Sender');
 choose('outgoing');assert.equal(d.querySelector('#outgoingMessage').value,'Outgoing draft');
 console.log('Dashboard layout passed: incoming/outgoing identity, compact controls, mutual chat gating, server dates, email privacy, safety menu, and persistent pair drafts');
}finally{dom.window.close()}
