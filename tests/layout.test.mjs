import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace('<script src="game.js"></script>','');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const photo='data:image/jpeg;base64,AA==',otherPhoto='data:image/jpeg;base64,AQ==';
const own={id:'owner',name:'Taylor Owner',contact:'private-owner@example.com',photo,answers:Array(10).fill(0),verified:true};
const sent={id:'a'.repeat(64),side:'member',prospect_name:'Morgan Other',prospect_photo:otherPhoto,prospect_answers:Array(10).fill(1),sender_name:own.name,sender_photo:photo,sender_answers:own.answers,own_answers:own.answers,status:'chat',canReport:true,messages:[{by:'prospect',text:'Hi Taylor'}],invitedAt:'2026-09-21T12:30:00.000Z',recipient_email:'private-invite@example.com',prospect_email:'unshared@example.com'};
const received={id:'b'.repeat(64),side:'prospect',sender_name:'Riley Friend',sender_photo:otherPhoto,sender_answers:Array(10).fill(2),prospect_name:own.name,prospect_photo:photo,prospect_answers:own.answers,own_answers:own.answers,status:'email',messages:[{by:'member',text:'Hi from Riley'}],invitedAt:'2026-09-22T17:45:00.000Z',sender_email:'private-sender@example.com',prospect_email:'my-shared@example.com'};
const longName='AlexandriaCassandraMontgomery';
const longVibe={...sent,id:'c'.repeat(64),prospect_name:longName,status:'request'};
const pendingFriend={...sent,id:'friend-pending',kind:'friend',channel:'friend',prospect_name:'',recipient_name:'Katie',prospect_photo:'',status:'invited',messages:[]};
const acceptedFriend={...sent,id:'friend-chat',kind:'friend',channel:'friend',prospect_name:longName,status:'chat',messages:[]};
const dom=new JSDOM(html,{url:'https://layout.example/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,d=w.document;
w.fetch=async()=>({ok:false,status:401,json:async()=>({})});w.setInterval=()=>0;w.scrollTo=()=>{};
const script=d.createElement('script');script.textContent=source;d.body.append(script);
const seed=()=>w.eval(`s={...blank(),view:'dashboard',actor:'member',member:${JSON.stringify(own)},memberId:'owner',account:${JSON.stringify(own)},liveMember:true,inbox:${JSON.stringify([sent,received,longVibe])},friends:${JSON.stringify([pendingFriend,acceptedFriend])},selectedChempat:'${sent.id}'};render()`);
const choose=(id,secrets=false)=>w.eval(`selectChempat('${id}',${secrets})`);
const panel=()=>d.querySelector('.connectionFocus');
const header=()=>d.querySelector('.focusHeader');
const privateButton=()=>d.querySelector('.chempatContact.selected .privateChatButton');

try{
 seed();
 // Capture the actual empty Vibe/Friend cards, then restore the populated
 // dashboard so both empty and populated states share responsive checks.
 w.eval('s.inbox=[];s.friends=[];render()');
 const emptyProbe=d.querySelector('.socialWorkspace').cloneNode(true);
 assert.equal(emptyProbe.querySelectorAll('.railEmpty').length,2);
 seed();d.body.append(emptyProbe);
 const samplePieces=['Feel Loved','Closeness Reflection',longName+' Snapshot'].map((title,i)=>({moduleId:'layout-piece-'+i,version:1,title,result:{summary:'A private result',dimensions:[]}}));
 w.eval(`mergeDiscoveryPieces(${JSON.stringify(samplePieces)});paintDiscovery()`);
 const memberHeader=d.querySelector('#root .socialMemberHeader');
 assert.deepEqual([...memberHeader.children].map(el=>el.className),['socialMemberIdentity','socialMemberAction','rewardLadder'],'desktop DOM order stays profile, Caught/action, collection');
 assert.equal(d.querySelectorAll('#root #earnedPieces').length,1,'only one collection is rendered');
 assert.equal(d.querySelectorAll('#root #earnedPiecesTitle').length,1);
 const rootIds=[...d.querySelectorAll('#root [id]')].map(el=>el.id);assert.equal(new Set(rootIds).size,rootIds.length,'dashboard has no duplicate IDs');
 assert.doesNotMatch(memberHeader.textContent,/Your first five are ready to share/);
 assert.equal(memberHeader.querySelector('.friendShareButton'),null,'friend action no longer crowds the member header');
 assert.equal(memberHeader.nextElementSibling.id,'gamePieceFeed','shared game pieces sit between the profile and workspace');
 assert.equal(memberHeader.nextElementSibling.nextElementSibling.className,'socialWorkspace');
 assert.equal(d.querySelectorAll('#root #gamePieceFeed').length,1,'there is one shared game-piece feed');
 // JSDOM has no viewport layout engine. Activate the matching media rules
 // explicitly so computed styles still catch mobile flex-axis regressions.
 const cssSource=d.createElement('style');cssSource.textContent=fs.readFileSync(new URL('../site.css',import.meta.url),'utf8');d.head.append(cssSource);
 const cssRules=[...cssSource.sheet.cssRules];cssSource.remove();
 // JSDOM hard-codes summary display as list-item, so verify its authored
 // flex layout through CSSOM and all other disclosure styles below.
 assert.equal(cssRules.find(rule=>rule.selectorText==='.earnedPieceResult summary').style.display,'flex');
 assert.equal(cssRules.find(rule=>rule.selectorText==='.dashboardDisclosure>summary').style.display,'flex');
 const readyProbe=d.createElement('div');readyProbe.innerHTML=w.renderVibeReady();d.body.append(readyProbe);
 const cssAtWidth=(rules,width,containerWidth=width<=700?width-34:Math.max(280,(Math.min(width,1100)-50)*.35)-2,rootSize=16)=>rules.map(rule=>{
  if(rule.constructor.name==='CSSContainerRule'){
   assert.equal(rule.containerName,'connectionList');
   const match=rule.containerQuery.match(/^\(max-width:\s*(\d+)(px|rem)\)$/);
   assert.ok(match,`layout test must handle container condition ${rule.containerQuery}`);
   const limit=Number(match[1])*(match[2]==='rem'?rootSize:1);
   return containerWidth<=limit?cssAtWidth([...rule.cssRules],width,containerWidth,rootSize):'';
  }
  if(rule.type!==w.CSSRule.MEDIA_RULE)return rule.cssText;
  const matches=rule.conditionText.split(/\s+and\s+/).every(condition=>{
   const match=condition.match(/^\((min|max)-width:\s*(\d+)px\)$/);
   assert.ok(match,`layout test must handle media condition ${condition}`);
   return match[1]==='min'?width>=Number(match[2]):width<=Number(match[2]);
  });
  return matches?cssAtWidth([...rule.cssRules],width,containerWidth,rootSize):'';
 }).join('\n');
 for(const width of [320,360,375,390,430,700,701,800,900,1150,1280]){
  const viewportCss=d.createElement('style');viewportCss.textContent=cssAtWidth(cssRules,width);d.head.append(viewportCss);
  const emptyInset=width<=700?'12px':'14px';
  for(const empty of emptyProbe.querySelectorAll('.railEmpty')){
   const style=w.getComputedStyle(empty),title=w.getComputedStyle(empty.parentElement.previousElementSibling);
   assert.equal(style.paddingLeft,emptyInset,`${width}px: empty text stays inside the card border`);
   assert.equal(style.paddingRight,emptyInset,`${width}px: wrapping text retains its right inset`);
   assert.equal(style.paddingLeft,title.paddingLeft,`${width}px: empty text aligns with the section heading`);
   assert.equal(style.paddingTop,'16px');assert.equal(style.paddingBottom,'16px');
   assert.notEqual(style.whiteSpace,'nowrap');
   assert.equal(title.borderBottomWidth,'1px','keep the existing section divider');
  }
  // Exercise actual rendered Friend and Vibe rows, including waiting/chat
  // states and long display names. Both kinds keep controls beside identity.
  const rows=d.querySelectorAll('#root .chempatContact');
  assert.equal(rows.length,5);
  for(const row of rows){
   const friend=!!row.closest('.friendRail'),person=row.querySelector('.chempatPerson'),controls=row.querySelector('.chempatControls'),name=person.querySelector('b'),status=person.querySelector('small');
   const rowStyle=w.getComputedStyle(row),personStyle=w.getComputedStyle(person),controlsStyle=w.getComputedStyle(controls);
   assert.equal(rowStyle.display,'grid');
   assert.equal(rowStyle.gridTemplateColumns,'minmax(0,1fr) auto',`${width}px: identity may shrink while controls stay on the same row`);
   assert.equal(parseFloat(personStyle.minWidth),0);assert.equal(personStyle.flexDirection,'row');
   assert.equal(parseFloat(w.getComputedStyle(person.querySelector('span:nth-child(2)')).minWidth),0);
   assert.equal(controlsStyle.display,'flex');assert.equal(controlsStyle.justifyContent,'flex-end');
   assert.equal(parseFloat(controlsStyle.paddingLeft)||0,0,`${width}px: controls have no old second-line indent`);
   assert.equal(controls.children.length,friend?1:2,'Friends keep one pill; Vibes keep both pills');
   assert.ok(person.getAttribute('aria-label').includes(name.textContent),'truncated display names remain fully accessible');
   for(const text of [name,status]){
    const style=w.getComputedStyle(text);assert.equal(style.whiteSpace,'nowrap');assert.equal(style.textOverflow,'ellipsis');
   }
   for(const control of controls.children){
    const style=w.getComputedStyle(control);
    assert.ok(parseFloat(style.minHeight)>=44,`${width}px: ${control.textContent} retains a 44px hit height`);
    assert.ok(parseFloat(style.minWidth)>=44,`${width}px: ${control.textContent} retains a 44px hit width`);
    assert.equal(style.fontSize,'11.2px',`${width}px: labels stay readable as padding shrinks`);
    assert.equal(style.whiteSpace,'nowrap');assert.equal(style.flexShrink,'0');assert.notEqual(style.display,'none');
   }
  }
  assert.equal(d.querySelector('.friendRail .privateChatButton').disabled,true,'waiting Friend chat remains disabled');
  assert.equal(d.querySelector('.friendRail .chempatContact:last-child .privateChatButton').disabled,false,'accepted Friend chat stays available');
  const workspace=w.getComputedStyle(d.querySelector('#root .socialWorkspace'));
  if(width>700){
   assert.equal(workspace.gridTemplateColumns,'minmax(280px,35%) minmax(0,1fr)',`${width}px: sidebar has room for names and the conversation takes only the remaining width`);
  }else assert.equal(workspace.display,'block','phone dashboard keeps its existing single-column layout');
  for(const disclosure of d.querySelectorAll('#root .dashboardDisclosure')){
   const summary=disclosure.querySelector(':scope > summary'),copy=summary.querySelector('.dashboardDisclosureCopy'),note=summary.querySelector('.dashboardDisclosureNote'),chevron=summary.querySelector('svg');
   assert.ok(parseFloat(w.getComputedStyle(summary).minHeight)>=44,`${width}px: every disclosure has a full summary hit target`);
   assert.equal(w.getComputedStyle(disclosure).padding,'0px','closed rows have no old section padding');
   assert.equal(w.getComputedStyle(copy).display,'flex');assert.equal(w.getComputedStyle(copy).flexWrap,'wrap');assert.equal(parseFloat(w.getComputedStyle(copy).minWidth),0);
   assert.equal(w.getComputedStyle(note).overflowWrap,'anywhere');assert.notEqual(w.getComputedStyle(note).whiteSpace,'nowrap');assert.notEqual(w.getComputedStyle(note).textOverflow,'ellipsis');
   assert.equal(w.getComputedStyle(chevron).width,'16px');assert.equal(w.getComputedStyle(chevron).flexShrink,'0');
  }
  const actions=d.querySelector('.socialMemberAction'),prompt=actions.querySelector('.ctaPrompt'),friendButton=d.querySelector('#root .connectionsHeading .friendShareButton');
  assert.ok(friendButton,'friend invitation sits beside the Connections heading');
  assert.equal(friendButton.previousElementSibling.textContent,'Connections');
  assert.equal(friendButton.getAttribute('onclick'),'openFriendShare()');
  assert.equal(w.getComputedStyle(friendButton).width,'auto','friend invite stays a small secondary action');
  assert.ok(parseFloat(w.getComputedStyle(friendButton).minHeight)>=44);
  const memberStyle=w.getComputedStyle(memberHeader),collection=memberHeader.querySelector('#rewardLadder');
  assert.equal(memberStyle.display,'grid');
  assert.equal(memberStyle.gridTemplateColumns,width>900?'minmax(0,0.75fr) minmax(0,1.1fr) minmax(0,1.65fr)':width>520?'minmax(0,0.8fr) minmax(0,1.2fr)':'minmax(0,1fr)',`${width}px: header uses three compact areas, then natural two/one-column stacking`);
  if(width<=900)assert.equal(w.getComputedStyle(collection).gridColumn,'1 / -1','collection spans the tablet/mobile header');
  assert.equal(parseFloat(w.getComputedStyle(collection).minWidth),0);
  assert.equal(collection.querySelectorAll('.rewardSlot').length,5,'exactly five collectible slots');
  assert.equal(w.getComputedStyle(collection.querySelector('.rewardSlots')).gridTemplateColumns,'repeat(5,minmax(0,1fr))','five slots fit their compact area');
  for(const slot of collection.querySelectorAll('.rewardSlot'))assert.ok(parseFloat(w.getComputedStyle(slot).minHeight)>=44,'reward slots remain touch-friendly');
  assert.equal(memberHeader.querySelector('.earnedPiece'),null,'named optional reflections are secondary');
  const readyFriend=readyProbe.querySelector('.vibeReady .friendShareButton');
  assert.ok(readyFriend,'friend invitation remains available after the first five');
  assert.equal(readyFriend.getAttribute('onclick'),'openFriendShare()');
  const vibeRow=actions.querySelector('.socialVibeAction'),vibeButton=vibeRow.querySelector('.button');
  assert.equal(actions.firstElementChild,vibeRow,'prompt and primary action share one row');
  assert.equal(vibeRow.firstElementChild,prompt);
  assert.equal(vibeButton.getAttribute('onclick'),'createMyVibe()');assert.equal(vibeButton.textContent,'Send a vibe →');assert.equal(prompt.textContent,'Caught their vibe?');
  assert.equal(vibeRow.nextElementSibling,null,'only the primary invitation is in the compact action area');
  assert.equal(w.getComputedStyle(vibeRow).display,'flex');
  assert.equal(w.getComputedStyle(vibeRow).flexWrap,'wrap','tiny viewports may wrap rather than overflow');
  assert.equal(w.getComputedStyle(actions).flexDirection,'column');
  assert.equal(w.getComputedStyle(actions).alignItems,'flex-start','Caught/action stays near the profile, aligned left');
  assert.equal(w.getComputedStyle(actions).gap,'4px','invitation choices stay grouped');
  assert.equal(w.getComputedStyle(d.querySelector('.socialMemberIdentity>div')).overflowWrap,'anywhere','long member names can wrap');
  for(const action of actions.querySelectorAll('.button')){
   const style=w.getComputedStyle(action);
   assert.ok(parseFloat(style.minHeight)>=44,`${width}px: buttons retain a usable touch target`);
   assert.equal(style.whiteSpace,'normal',`${width}px: action labels may wrap if needed`);
   assert.notEqual(style.display,'none');
  }
  if(width<=700){
   assert.equal(w.getComputedStyle(readyFriend).display,'block');
   assert.equal(w.getComputedStyle(readyFriend).width,'100%');
   assert.ok(parseFloat(w.getComputedStyle(readyFriend).minHeight)>=44);
  }
  viewportCss.remove();
 }
 // At exceptional narrow widths or enlarged text, reflow is based on the
 // list's own width. This simulates query activation; JSDOM cannot measure
 // box geometry, overflowing text, or pseudo-element paint.
 for(const {width,containerWidth,rootSize,columns} of [
  {width:320,containerWidth:271,rootSize:16,columns:'minmax(0,1fr) auto'},
  {width:701,containerWidth:263,rootSize:16,columns:'minmax(0,1fr) auto'},
  {width:320,containerWidth:223,rootSize:16,columns:'minmax(0,1fr)'},
  {width:390,containerWidth:356,rootSize:32,columns:'minmax(0,1fr)'}
 ]){
  d.documentElement.style.fontSize=`${rootSize}px`;
  const style=d.createElement('style');style.textContent=cssAtWidth(cssRules,width,containerWidth,rootSize);d.head.append(style);
  for(const row of d.querySelectorAll('#root .chempatContact')){
   assert.equal(w.getComputedStyle(row).gridTemplateColumns,columns,`${containerWidth}px list / ${rootSize}px root font reflows only when needed`);
   const controls=row.querySelector('.chempatControls');
   if(columns==='minmax(0,1fr)')assert.equal(w.getComputedStyle(controls).flexWrap,'wrap','large labels may wrap within the separate controls row');
   for(const control of controls.children)assert.ok(parseFloat(w.getComputedStyle(control).minHeight)>=44);
  }
  style.remove();
 }
 d.documentElement.style.removeProperty('font-size');
 // The compact surface is separate from the full-sized real button. Inspect
 // its CSSOM declarations because JSDOM does not compute pseudo-elements.
 const paint=cssRules.find(rule=>rule.selectorText?.replaceAll(', ', ',')==='.privateChatButton::before,.chempatControls .secretsButton::before');
 assert.ok(paint,'both pills have the same compact visual surface');
 assert.equal(paint.style.inset,'6px 0');assert.equal(paint.style.pointerEvents,'none');
 assert.equal(paint.style.position,'absolute');assert.equal(paint.style.zIndex,'-1');
 assert.match(paint.style.border,/1px solid var\(--pill-border/);assert.match(paint.style.background,/var\(--pill-bg/);
 const pillCss=d.createElement('style');pillCss.textContent=cssAtWidth(cssRules,390);d.head.append(pillCss);
 assert.equal(w.getComputedStyle(privateButton()).getPropertyValue('--pill-bg'),'#71439c','selected Vibe pill keeps its active color');
 const waitingFriend=d.querySelector('.friendRail .privateChatButton');
 assert.equal(w.getComputedStyle(waitingFriend).getPropertyValue('--pill-bg'),'#f4f7f5','waiting Friend keeps the disabled surface');
 const activeFriend=d.querySelector('.friendRail .chempatContact:last-child .privateChatButton');activeFriend.classList.add('on');
 assert.equal(w.getComputedStyle(activeFriend).getPropertyValue('--pill-bg'),'#327b74','selected Friend keeps its green surface');activeFriend.classList.remove('on');
 pillCss.remove();readyProbe.remove();emptyProbe.remove();
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
 // Safety actions are available through one labelled menu button.
 seed();const menu=d.querySelector('.connectionMenu');assert.ok(menu.querySelector('button[aria-label="Connection options for Morgan"][aria-haspopup="menu"]'));
 assert.equal(menu.querySelectorAll('[role=menuitem]').length,2);assert.match(menu.textContent,/Report/);d.querySelector('.connectionMenuTrigger').click();d.querySelector('[data-action=freeze]').click();assert.equal(w.eval('s.endTarget.id'),sent.id);assert.equal(w.eval('s.endTarget.kind'),'freeze');
 w.eval('closeInvite()');assert.equal(w.eval('s.inbox[0].status'),'chat','cancel does not end the connection');
 d.querySelector('.connectionMenuTrigger').click();d.querySelector('[data-action=report]').click();assert.equal(w.eval('s.endTarget.kind'),'report');w.eval('closeInvite()');
 // Token-based prospect pages retain their original incoming pair while selecting outgoing.
 w.eval(`s={...blank(),view:'dashboard',actor:'prospect',member:{name:'Original Sender',photo:'${photo}',answers:Array(10).fill(0)},prospect:{name:'Taylor',photo:'${photo}',email:'private-owner@example.com',answers:Array(10).fill(0)},prospectId:'owner',phase:'chat',messages:[],invitedAt:'2026-09-20T08:00:00Z',outgoing:[{id:'outgoing',name:'Outgoing Friend',photo:'${otherPhoto}',answers:Array(10).fill(2),status:'email',invitedAt:'2026-09-23T08:00:00Z',sharedEmail:'shared-outgoing@example.com',email:'private-recipient@example.com',messages:[]}]};render()`);
 choose('outgoing');assert.equal(d.querySelector('#connectionName').textContent,'Outgoing');assert.equal(d.querySelector('.sharedContact').textContent,'shared-outgoing@example.com');assert.doesNotMatch(header().textContent,/Original|private-recipient/);
 d.querySelector('#outgoingMessage').value='Outgoing draft';choose('first');assert.equal(d.querySelector('#connectionName').textContent,'Original');assert.equal(d.querySelector('.sharedContact'),null);assert.equal(w.eval('s.member.name'),'Original Sender');
 choose('outgoing');assert.equal(d.querySelector('#outgoingMessage').value,'Outgoing draft');
 console.log('Dashboard layout passed: incoming/outgoing identity, compact controls, mutual chat gating, server dates, email privacy, safety menu, and persistent pair drafts');
}finally{dom.window.close()}
