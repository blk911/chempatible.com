// Local game walkthrough with a verified email invitation entry point.
const QUESTIONS=[
  {topic:'CORE VALUES',q:'A truth might disappoint someone you like. What do you do?',a:['Tell them directly, with care.','Wait for a better moment.','Keep it to myself unless they ask.']},
  {topic:'COMMUNICATION',q:'Something they said bothers you. How do you start the conversation?',a:['Tell them what I heard and ask what they meant.','Give myself time, then bring it up.','Wait to see if it happens again.']},
  {topic:'REPAIR',q:'You still think you were right after an argument. What happens next?',a:['Ask how it felt from their side.','Own what I could have done differently.','Give us space and let it pass.']},
  {topic:'BOUNDARIES',q:'Someone you like asks for a little space. What do you say?',a:['“Of course. When should we check in?”','“Okay, I’ll let you reach out.”','“I need to understand why first.”']},
  {topic:'ACCOUNTABILITY',q:'You forget something that mattered to them. What do you say first?',a:['“I forgot. I’m sorry. Tell me how it affected you.”','“I didn’t mean to hurt you.”','“I’ve had a lot going on.”']},
  {topic:'EMOTIONAL EXPRESSION',q:'You’ve had a rough day. How do you let someone close to you know?',a:['“I could use some company.”','“I need a little time, then let’s talk.”','I tend to keep it to myself.']},
  {topic:'CLOSENESS',q:'You’re beginning to care about someone. What feels most important?',a:['Feeling safe enough to be honest.','Keeping room for our own lives.','Seeing steady actions, not just words.']},
  {topic:'RESPONSIVENESS',q:'They text while you’re swamped. What do you usually do?',a:['Send a quick “busy, talk soon.”','Wait until I can give a real answer.','Reply when my day is done.']},
  {topic:'NON-NEGOTIABLES',q:'They want something from a relationship that you don’t. What comes first?',a:['Ask why it matters to them.','Explain my own limit clearly.','Take time to decide whether we fit.']},
  {topic:'KEEPING AGREEMENTS',q:'You made plans, then something better comes up. What do you do?',a:['Keep our plans.','Ask if changing plans would be okay.','Suggest another time.']}
];
const KEY='chempatibility.walkthrough.v7';
const invitationToken=new URLSearchParams(location.search).get('invite');
const friendInvitationToken=new URLSearchParams(location.search).get('friend');
// Keep bearer invitations out of subsequent navigation and referrers.
if(friendInvitationToken||invitationToken){const clean=new URL(location.href);clean.searchParams.delete('friend');clean.searchParams.delete('invite');history.replaceState(null,'',clean.pathname+clean.search+clean.hash)}
// A new key starts everyone with a clean walkthrough after this deployment.
try{for(const old of ['v2','v3','v4','v5','v6'])sessionStorage.removeItem(`chempatibility.walkthrough.${old}`)}catch{}
const blank=()=>({view:'landing',joinStep:1,actor:'member',member:{name:'',contact:'',photo:'',answers:[],agreed:false},prospect:{name:'',phone:'',email:'',photo:'',answers:[],agreed:false},connectionId:'',liveInvite:false,liveToken:'',liveMember:false,liveId:'',inbox:[],memberQuestionsOpen:false,prospectQuestionsOpen:false,phase:'registration',index:0,pick:null,modal:'',messages:[],notice:'',testRequest:'',memberId:'',prospectId:'',resumePhase:'',outgoing:[],selectedOutgoing:'',selectedChempat:'',secretsFor:'',qrInvite:null,qrError:'',signinEmail:'',codeSentAt:0,codeSentTo:'',verifyEmail:'',qrNeedsVerify:false,prospectVerified:null,friends:[],friendToken:'',friendInvite:null,friendError:'',friendChoice:'',friendExit:'',friendAcceptedId:'',friendShare:null,friendShareError:'',friendVibeState:null,firstConnection:null,freezerExtra:[],freezerCursor:null,freezerError:'',received:[],trashRows:[],trashCursor:null,trashLoaded:false,trashOpen:false,trashError:'',reinviteTarget:null,reinviteAttempts:{},pendingVibeToken:'',invitationAuthError:'',invitationRetry:false});
let s;try{s={...blank(),...JSON.parse(sessionStorage.getItem(KEY)||'{}')}}catch{s=blank()}
if(s.joinStep===0)s.joinStep=1; // Resume earlier review tabs directly at the form.
if(!['landing','dashboard','profile','questions','invitee','revealPhoto','results','request','conversation','email','tests','friendInvite','inviteAuth'].includes(s.view))s.view='landing';
if(s.view==='request'&&['request','declined'].includes(s.phase)&&s.actor==='prospect')s.view='dashboard';
if(s.view==='questions'&&s.actor==='member'){s.view='dashboard';s.memberQuestionsOpen=true}
if(s.view==='questions'&&s.actor==='prospect'&&s.phase!=='secondFive'&&s.prospect.answers.length<5){s.view='invitee';s.prospectQuestionsOpen=true}
const $=id=>document.getElementById(id);
// Launching email only: a cell number shows the owner's name on caller ID. Turn on with SMS codes (and CHEMPAT_SMS=on on the server).
const CELL_ENABLED=false;
const CONTACT_LABEL=CELL_ENABLED?'Email or cell':'Your email';
const validContact=c=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)||(CELL_ENABLED&&c.length<=30&&c.replace(/\D/g,'').length>=10);
const agreeBox=(id,on)=>`<label class="agree"><input type="checkbox" id="${id}" ${on?'checked':''}><span>I’m 18 or older and agree to the <a href="/terms" target="_blank">Terms</a> and <a href="/privacy" target="_blank">Privacy Policy</a>.</span></label>`;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const first=x=>(x||'Friend').trim().split(/\s+/)[0];
const name=a=>first(a==='member'?s.member.name:s.prospect.name);
const pic=x=>/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(x||'')?x:'';
const photo=a=>pic(a==='member'?s.member.photo:s.prospect.photo);
const owner=()=>s.actor==='prospect'?{...s.prospect,contact:s.prospect.email||s.prospect.phone}:s.member;
const face=(a,size='')=>`<span class="face ${size}">${photo(a)?`<img src="${photo(a)}" alt="${esc(name(a))}">`:esc(name(a)[0])}</span>`;
const personCard=(a,caption)=>`<div class="personCard">${face(a)}<span><small>${esc(caption)}</small><b>${esc(name(a))}</b></span></div>`;
const pairTag=()=>s.connectionId?`<span class="pairTag">Connection ${esc(s.connectionId)}</span>`:'';
function ensureConnection(){if(!s.connectionId)s.connectionId='CP-'+(globalThis.crypto?.randomUUID?.().slice(0,8)||Math.random().toString(36).slice(2,10)).toUpperCase()}
const button=(label,action,style='')=>`<button type="button" class="button ${style}" onclick="${action}">${label}</button>`;
function walkthroughStorageState(){const cached=gamePieceAccount===activeMemberId()&&(gamePieceConnections.get(s.liveId)||wildcardConnections.get(s.liveId));if(!cached)return s;return {...s,messages:[],pairOwnAnswers:[],...(cached.row.side==='prospect'?{member:{...s.member,photo:'',answers:[]}}:{prospect:{...s.prospect,photo:'',answers:[],phone:'',email:''}})}}
const save=()=>{try{const stored=walkthroughStorageState();sessionStorage.setItem(KEY,JSON.stringify(ownsTransientNotice(transientNotice)?{...stored,notice:''}:stored))}catch{ /* Camera images may exceed browser storage; this tab still works. */ }};
const mask=phone=>phone?`••• ••• ${phone.replace(/\D/g,'').slice(-4)}`:'Phone pending';
const isFriend=c=>c?.kind==='friend'||c?.channel==='friend';
const friendContext=()=>({friendToken:s.friendToken,friendInvite:s.friendInvite,friendError:s.friendError,friendChoice:s.friendChoice||'',friendExit:s.friendExit||'',friendVibeState:s.friendVibeState,pendingVibeToken:s.pendingVibeToken||'',invitationAuthError:s.invitationAuthError||'',invitationRetry:!!s.invitationRetry});
const hasMember=()=>!!(s.memberId||s.prospectId);
const activeMemberId=()=>s.account?.id||(s.actor==='prospect'?s.prospectId:s.memberId)||'';
const memberRequestHeaders=account=>account?{'x-chempat-member-id':account}:{};
// Profile edits stay in memory until saved; this controller never enters signup.
let memberProfileDraft=null,memberProfileSequence=0;
const memberProfileOwner=d=>!!d&&d.state===s&&d.account===activeMemberId();
const currentMemberProfile=()=>memberProfileOwner(memberProfileDraft)&&s.view==='profile'?memberProfileDraft:null;
function stopMemberProfileCamera(d=memberProfileDraft){if(!d)return;d.mediaVersion++;d.stream?.getTracks().forEach(track=>track.stop());d.stream=null;d.cameraPending=false;const video=$('memberProfileCamera');if(video){video.srcObject=null;video.hidden=true}}
function discardMemberProfile(){const d=memberProfileDraft;if(d){stopMemberProfileCamera(d);d.photoCleanup?.();d.photoCleanup=null}memberProfileDraft=null;memberProfileSequence++}
function syncMemberProfileOwner(){if(memberProfileDraft&&(!memberProfileOwner(memberProfileDraft)||s.view!=='profile'))discardMemberProfile();if(s.view==='profile'&&!activeMemberId())s.view='landing'}
function createMemberProfileDraft(){const who=s.account||owner();return {state:s,account:activeMemberId(),sequence:++memberProfileSequence,name:who.name||'',photo:pic(who.photo),contact:who.contact||owner().contact||'',revision:'',discovery:{listed:false,eligible:false},dirty:false,updateDiscovery:false,latest:null,needsReview:false,loading:null,pending:null,photoPending:null,mediaVersion:0,stream:null,cameraPending:false,error:'',notice:'',loaded:false,blocked:false,updated:0}}
function openMemberProfile(){if(!activeMemberId())return;if(currentMemberProfile()){$('memberProfileTitle')?.focus();return}discardMemberProfile();interactionVersion++;if(s.modal)changeModal('');s.view='profile';setNotice('');memberProfileDraft=createMemberProfileDraft();render();window.scrollTo(0,0);$('memberProfileTitle')?.focus();loadMemberProfile();loadRewards(true)}
function cancelMemberProfile(){discardMemberProfile();goHome()}
function memberProfileFocus(){const focused=document.activeElement;return focused&&$('memberProfileEditor')?.contains(focused)?{id:focused.id,action:focused.getAttribute('onclick'),start:typeof focused.selectionStart==='number'?focused.selectionStart:null,end:focused.selectionEnd}:null}
function restoreMemberProfileFocus(focus){if(!focus||s.modal)return;const target=focus.id?$(focus.id):[...($('memberProfileEditor')?.querySelectorAll('[onclick]')||[])].find(node=>node.getAttribute('onclick')===focus.action);if(target&&!target.disabled){target.focus({preventScroll:true});if(focus.start!==null&&target.setSelectionRange)target.setSelectionRange(focus.start,focus.end)}}
function attachMemberProfileCamera(){const d=currentMemberProfile(),video=$('memberProfileCamera');if(d?.stream&&video){video.srcObject=d.stream;video.hidden=false;try{video.play()?.catch(()=>{})}catch{}}}
function paintOwnProfileIdentity(){const nav=$('navUser').querySelector('.navIdentity');if(nav)nav.innerHTML=`${face(s.actor)}<b>${esc(name(s.actor))}</b>`;const heading=document.querySelector('.socialMemberIdentity h1');if(heading)heading.textContent=name(s.actor);for(const node of document.querySelectorAll('.socialMemberIdentity > .face,.quickIdentity > .face,.vibeReady > .face'))node.outerHTML=face(s.actor,node.classList.contains('large')?'large':'')}
function paintMemberProfile(){if(!currentMemberProfile())return;paintOwnProfileIdentity();const focus=memberProfileFocus();$('root').innerHTML=renderMemberProfile();attachMemberProfileCamera();restoreMemberProfileFocus(focus)}
function memberProfilePhoneContent(){if(rewardsAuthError)return `<p class="error" role="alert">${esc(rewardsAuthError)}</p>`;if(!rewardsData)return `<h3>Your private phone number</h3><p>${esc(rewardsError||'Checking saved progress…')}</p>${rewardsError?rewardButton('Try again','loadRewards(true)',!!rewardsLoading):''}`;if(rewardLevel()<2)return '<h3>Your private phone number</h3><p>Available after you finish Step 2. Adding a number is optional; sharing always needs a separate choice in a connection.</p>';return renderPrivateRewardPhone('profile')}
function paintMemberProfilePhone(){const d=currentMemberProfile(),host=$('memberProfilePhonePanel');if(!d||d.blocked||!host)return;const focus=memberProfileFocus();host.innerHTML=memberProfilePhoneContent();restoreMemberProfileFocus(focus)}
function renderMemberProfile(){
 const d=currentMemberProfile();if(!d)return '';if(d.blocked)return `<section class="box memberProfileEditor" id="memberProfileEditor"><h1 id="memberProfileTitle" tabindex="-1">My profile</h1><p class="error" role="alert">${esc(d.error)}</p>${button('Sign in again','showSignin()')}</section>`;
 const busy=!!d.pending,mediaBusy=!!d.photoPending||d.cameraPending,disabled=busy||!!d.loading||!d.loaded;
 return `<section class="box memberProfileEditor" id="memberProfileEditor" aria-labelledby="memberProfileTitle"><header class="memberProfileHeading"><div><div class="eyebrow">YOUR DETAILS</div><h1 id="memberProfileTitle" tabindex="-1">My profile</h1></div><button type="button" class="link" onclick="cancelMemberProfile()">Back to my page</button></header><div class="memberProfilePhotoRow"><figure class="memberProfilePreview">${pic(d.photo)?`<img id="memberProfilePreviewImage" src="${pic(d.photo)}" alt="Your profile photo preview">`:'<span aria-hidden="true">?</span>'}<figcaption>Photo preview</figcaption></figure><div class="memberProfilePhotoActions"><button type="button" class="button light" onclick="openMemberProfileCamera()" ${disabled||mediaBusy?'disabled':''}>Use camera</button><label class="button light photoPick">Choose photo<input id="memberProfilePhotoFile" data-profile-sequence="${d.sequence}" data-profile-account="${esc(d.account)}" class="photoFileInput" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose your profile photo" aria-describedby="memberProfilePhotoHelp memberProfileError" onchange="uploadMemberProfilePhoto(event)" ${disabled||busy?'disabled':''}></label><p id="memberProfilePhotoHelp">JPEG, PNG or WebP, up to 10 MB.</p></div></div><video id="memberProfileCamera" class="cameraPreview" autoplay muted playsinline ${d.stream?'':'hidden'}></video>${d.stream?`<div class="memberProfileActions">${button('Capture photo','captureMemberProfilePhoto()')}${button('Stop camera','closeMemberProfileCamera()','light')}</div>`:''}<label class="field" for="memberProfileName">First name<input id="memberProfileName" autocomplete="given-name" maxlength="50" value="${esc(d.name)}" oninput="updateMemberProfileName(this.value)" aria-describedby="memberProfileError" ${disabled?'disabled':''}></label><label class="field" for="memberProfileEmail">Sign-in email<input id="memberProfileEmail" type="email" value="${esc(d.contact)}" readonly aria-readonly="true"></label><p class="memberProfileDisclosure">Save updates your name and photo for new invitations and active accepted connections. Older invitations and connection history keep their saved name and photo.</p>${d.discovery.listed&&d.discovery.eligible?`<label class="memberProfileDiscovery"><input id="memberProfileDiscovery" type="checkbox" ${d.updateDiscovery?'checked':''} onchange="updateMemberProfileDiscovery(this.checked)" ${disabled?'disabled':''}><span>Also update my name and photo in my existing discovery listing. Eligible signed-in members can see that listing. This does not publish a video.</span></label>`:'<p class="memberProfileDisclosure">Saving here does not list you in member discovery or publish a video.</p>'}${d.needsReview?`<div class="memberProfileConflict" role="status"><p>Your profile changed elsewhere. Your draft is kept.${d.latest?` Saved first name: <b>${esc(d.latest.profile.name)}</b>.`:''}</p>${d.latest?.profile.photo?`<img src="${pic(d.latest.profile.photo)}" alt="Latest saved profile photo">`:''}${rewardButton('Keep my changes for review','reviewMemberProfileConflict()',!d.latest||busy)}${rewardButton('Use saved profile','reviewMemberProfileConflict(true)',!d.latest||busy)}${!d.latest?rewardButton('Reload saved profile','loadMemberProfile(true)',!!d.loading||busy):''}</div>`:''}<div class="memberProfileActions"><button type="button" class="button" onclick="saveMemberProfile()" ${disabled||mediaBusy||d.needsReview?'disabled':''}>Save profile</button><button type="button" class="button light" onclick="cancelMemberProfile()">Cancel</button></div><p id="memberProfileStatus" role="status">${esc(busy?'Saving your profile…':mediaBusy?'Preparing your photo…':d.loading&&!d.loaded?'Loading your saved profile…':d.notice)}</p><p id="memberProfileError" class="error" role="alert">${esc(d.error)}</p>${!d.loaded&&d.error?rewardButton('Try again','loadMemberProfile(true)',!!d.loading):''}<div id="memberProfilePhonePanel">${memberProfilePhoneContent()}</div></section>`;
}
function updateMemberProfileName(value){const d=currentMemberProfile();if(!d||d.pending||!d.loaded)return;d.name=value;d.dirty=true;d.error='';d.notice='Not saved yet.';if($('memberProfileStatus'))$('memberProfileStatus').textContent=d.notice;if($('memberProfileError'))$('memberProfileError').textContent=''}
function updateMemberProfileDiscovery(checked){const d=currentMemberProfile();if(!d||d.pending||!d.loaded)return;d.updateDiscovery=!!checked&&d.discovery.listed&&d.discovery.eligible;d.dirty=true;d.notice='Not saved yet.'}
function validMemberProfileResponse(data,d){const p=data?.profile;return p&&p.id===d.account&&typeof p.name==='string'&&typeof p.contact==='string'&&typeof p.photo==='string'&&!!pic(p.photo)&&/^[a-f0-9]{64}$/.test(p.revision)&&typeof data.discovery?.listed==='boolean'&&typeof data.discovery?.eligible==='boolean'}
function applyOwnMemberProfile(profile){if(profile.id!==activeMemberId())return;const identity={name:profile.name,photo:profile.photo,contact:profile.contact};if(s.account)s.account={...s.account,...identity};if(s.actor==='prospect')s.prospect={...s.prospect,name:identity.name,photo:identity.photo,email:identity.contact.includes('@')?identity.contact:'',phone:identity.contact.includes('@')?'':identity.contact};else s.member={...s.member,...identity};save()}
function acceptMemberProfile(data,d,{saved=false}={}){
 if(!validMemberProfileResponse(data,d))throw Error('Your profile could not be loaded completely. Try again.');
 if(!saved&&d.loaded&&d.dirty&&(d.revision!==data.profile.revision||d.updateDiscovery&&(!data.discovery.listed||!data.discovery.eligible))){d.latest=data;d.needsReview=true;d.updated=Date.now();d.notice='';return}
 d.loaded=true;d.updated=Date.now();d.discovery=data.discovery;d.contact=data.profile.contact;d.latest=null;
 if(saved||!d.dirty){d.name=data.profile.name;d.photo=data.profile.photo;d.revision=data.profile.revision;d.dirty=false;d.updateDiscovery=false;d.needsReview=false;applyOwnMemberProfile(data.profile)}
}
async function memberProfileApi(d,body){const response=await fetch('/api/member-profile',{credentials:'same-origin',cache:'no-store',headers:{'x-chempat-member-id':d.account,...(body?{'content-type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});let data;try{data=await response.json()}catch{data={}}if(!response.ok)throw Object.assign(Error(data.error||'Your profile could not be saved. Try again.'),{status:response.status,profileConflict:data.profileConflict===true,discoveryConflict:data.discoveryConflict===true});return data}
function failMemberProfile(d,e){d.error=e.message||'Your profile could not be loaded. Try again.';if([401,403].includes(e.status)){stopMemberProfileCamera(d);d.photoCleanup?.();d.blocked=true;d.photo='';d.name='';d.contact='';d.latest=null;d.loaded=false;d.pending=null;d.photoPending=null;d.loading=null;d.revision='';d.notice=''}}
async function loadMemberProfile(force=false){const d=currentMemberProfile();if(!d||d.loading||d.pending||d.blocked||(!force&&(d.loaded||d.error)))return;const request={};d.loading=request;d.error='';try{const data=await memberProfileApi(d);if(currentMemberProfile()!==d||d.loading!==request||d.blocked)return;acceptMemberProfile(data,d)}catch(e){if(currentMemberProfile()===d&&d.loading===request)failMemberProfile(d,e)}finally{if(d.loading===request)d.loading=null;if(currentMemberProfile()===d)paintMemberProfile()}}
function reviewMemberProfileConflict(useSaved=false){const d=currentMemberProfile();if(!d||d.pending||!d.latest||!d.needsReview)return;const latest=d.latest;d.discovery=latest.discovery;d.contact=latest.profile.contact;d.revision=latest.profile.revision;d.needsReview=false;d.latest=null;d.updateDiscovery=false;d.error='';if(useSaved){d.dirty=false;acceptMemberProfile(latest,d);d.notice='Saved profile loaded.'}else{d.notice='Review your name and photo, then save again. Choose discovery again if you want to update your listing.'}paintMemberProfile()}
async function saveMemberProfile(){
 const d=currentMemberProfile();if(!d||d.blocked||!d.loaded||d.pending||d.loading||d.photoPending||d.cameraPending||d.needsReview)return;
 const name=d.name.trim();if(!name||name.length>50||/[\u0000-\u001f\u007f]/.test(name)||!pic(d.photo)){d.error='Add a first name (up to 50 characters) and a valid photo.';paintMemberProfile();$('memberProfileName')?.focus();return}
 stopMemberProfileCamera(d);const request={updateDiscovery:d.updateDiscovery};d.pending=request;d.error='';d.notice='';paintMemberProfile();
 try{const data=await memberProfileApi(d,{action:'save',name,photo:d.photo,profileRevision:d.revision,updateDiscovery:d.updateDiscovery});if(currentMemberProfile()!==d){if(memberProfileOwner(d)&&!memberProfileDraft&&memberProfileSequence===d.sequence+1&&d.pending===request&&!d.blocked&&!['landing','inviteAuth'].includes(s.view)&&validMemberProfileResponse(data,d)){applyOwnMemberProfile(data.profile);paintOwnProfileIdentity();if(request.updateDiscovery){rewardDirectory=null;rewardDirectoryRevision++}}return}if(d.pending!==request||d.blocked)return;acceptMemberProfile(data,d,{saved:true});d.notice='Your profile is saved.';if(request.updateDiscovery){rewardDirectory=null;rewardDirectoryRevision++}render(true);refreshLive(true)}
 catch(e){if(currentMemberProfile()!==d||d.pending!==request)return;failMemberProfile(d,e);if(e.profileConflict||e.discoveryConflict){d.needsReview=true;d.latest=null;try{const latest=await memberProfileApi(d);if(currentMemberProfile()!==d||d.pending!==request||d.blocked)return;if(!validMemberProfileResponse(latest,d))throw Error('Reload your profile before trying again.');d.latest=latest;d.error=e.discoveryConflict?'Your discovery listing changed. Review your profile and choose again before saving.':'Your profile changed elsewhere. Review the saved profile before trying again.'}catch(refreshError){if(currentMemberProfile()===d&&d.pending===request)failMemberProfile(d,refreshError)}}}
 finally{if(d.pending===request)d.pending=null;if(currentMemberProfile()===d)paintMemberProfile()}
}
function closeMemberProfileCamera(){const d=currentMemberProfile();if(!d)return;stopMemberProfileCamera(d);paintMemberProfile()}
async function openMemberProfileCamera(){
 const d=currentMemberProfile();if(!d||!d.loaded||d.pending||d.photoPending||d.cameraPending)return;stopMemberProfileCamera(d);const version=d.mediaVersion;d.error='';
 if(!navigator.mediaDevices?.getUserMedia){d.error='No camera is available in this browser. Choose a photo file instead.';paintMemberProfile();return}d.cameraPending=true;paintMemberProfile();
 try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});if(currentMemberProfile()!==d||d.mediaVersion!==version||d.blocked){stream.getTracks().forEach(track=>track.stop());return}d.stream=stream;d.cameraPending=false;paintMemberProfile();const video=$('memberProfileCamera');await video.play();if(currentMemberProfile()!==d||d.mediaVersion!==version)stream.getTracks().forEach(track=>track.stop())}
 catch(e){if(currentMemberProfile()!==d||d.mediaVersion!==version)return;stopMemberProfileCamera(d);d.error=e.name==='NotAllowedError'?'Camera access was blocked. Choose a photo file, or allow camera access and try again.':'The camera could not start. Choose a photo file or try again.';paintMemberProfile()}
}
function profilePhotoData(source,width,height){if(!width||!height||width*height>40000000)throw Error('Choose a photo smaller than 40 megapixels.');const canvas=document.createElement('canvas'),side=Math.min(width,height);canvas.width=canvas.height=320;const context=canvas.getContext('2d');if(!context)throw Error('This browser could not prepare your photo.');context.drawImage(source,(width-side)/2,(height-side)/2,side,side,0,0,320,320);let data='';for(const quality of [.78,.6,.42]){data=canvas.toDataURL('image/jpeg',quality);if(data.length<200000)break}if(!pic(data)||data.length>=250000)throw Error('This photo is too large. Choose a smaller image.');return data}
function captureMemberProfilePhoto(){const d=currentMemberProfile(),video=$('memberProfileCamera');if(!d?.stream||d.pending)return;try{if(!video?.videoWidth)throw Error('Wait for the camera, then capture your picture.');const data=profilePhotoData(video,video.videoWidth,video.videoHeight);stopMemberProfileCamera(d);d.photo=data;d.dirty=true;d.notice='Photo preview ready. Save to keep it.';d.error=''}catch(e){d.error=e.message}paintMemberProfile()}
async function uploadMemberProfilePhoto(event){
 const input=event.currentTarget||event.target,d=currentMemberProfile();if(!d||input?.dataset?.profileSequence!==String(d.sequence)||input.dataset.profileAccount!==d.account)return;const file=input.files?.[0];input.value='';if(!file||!d.loaded||d.pending)return;stopMemberProfileCamera(d);d.photoCleanup?.();const request={};d.photoPending=request;d.error='';d.notice='';
 const finish=error=>{if(currentMemberProfile()!==d||d.photoPending!==request||d.blocked)return;d.photoPending=null;d.photoCleanup=null;d.error=error||'';paintMemberProfile()};
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)){finish('Choose a JPEG, PNG or WebP photo.');return}if(!file.size||file.size>10*1024*1024){finish('Choose a non-empty photo no larger than 10 MB.');return}paintMemberProfile();
 try{const data=await new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);let finished=false;const cleanup=()=>{if(finished)return;finished=true;clearTimeout(timer);img.onload=null;img.onerror=null;URL.revokeObjectURL(url)};const fail=error=>{cleanup();reject(error)};const timer=setTimeout(()=>fail(Error('This photo took too long to open. Choose another image.')),15000);d.photoCleanup=()=>fail(Error('Photo selection cancelled.'));img.onload=()=>{try{const data=profilePhotoData(img,img.naturalWidth||img.width,img.naturalHeight||img.height);cleanup();resolve(data)}catch(e){fail(e)}};img.onerror=()=>fail(Error('Could not open this photo. Choose another image.'));img.src=url});if(currentMemberProfile()!==d||d.photoPending!==request||d.blocked)return;d.photo=data;d.dirty=true;d.notice='Photo preview ready. Save to keep it.';finish()}catch(e){finish(e.message||'Could not prepare this photo.')}
}
function syncMemberProfileUI(){if(s.view!=='profile'||!activeMemberId())return;if(!currentMemberProfile()){memberProfileDraft=createMemberProfileDraft();paintMemberProfile()}loadMemberProfile();if(!rewardsData&&!rewardsError)loadRewards();attachMemberProfileCamera()}
function refreshMemberProfile(){const d=currentMemberProfile();if(!document.hidden&&d&&!d.error&&d.loaded&&Date.now()-d.updated>15000)loadMemberProfile(true)}
// Disclosure choices belong to the signed-in account, never to a connection.
let dashboardDisclosureAccount=null,dashboardDisclosures={progress:false,secrets:false,pieces:false,results:false,freezer:false};
function syncDashboardDisclosures(){if(dashboardDisclosureAccount!==activeMemberId()){dashboardDisclosureAccount=activeMemberId();dashboardDisclosures={progress:false,secrets:false,pieces:false,results:false,freezer:false}}}
function rememberDashboardDisclosure(details){
 syncDashboardDisclosures();const key=details.dataset.dashboardDisclosure;
 if(details.isConnected&&details.dataset.disclosureAccount===dashboardDisclosureAccount&&Object.hasOwn(dashboardDisclosures,key))dashboardDisclosures[key]=details.open;
}
function captureDashboardDisclosures(){
 syncDashboardDisclosures();let focus='';
 for(const details of document.querySelectorAll('.dashboardDisclosure')){rememberDashboardDisclosure(details);if(details.dataset.disclosureAccount===dashboardDisclosureAccount&&details.querySelector(':scope > summary')===document.activeElement)focus=details.dataset.dashboardDisclosure}
 return focus;
}
function setDashboardDisclosure(key,open){
 syncDashboardDisclosures();dashboardDisclosures[key]=open;
 const details=document.querySelector(`[data-dashboard-disclosure="${key}"]`);if(details?.dataset.disclosureAccount===dashboardDisclosureAccount)details.open=open;
}
function dashboardDisclosureAttributes(key){syncDashboardDisclosures();return `data-dashboard-disclosure="${key}" data-disclosure-account="${esc(dashboardDisclosureAccount)}" ontoggle="rememberDashboardDisclosure(this)" ${dashboardDisclosures[key]?'open':''}`}
function dashboardDisclosureSummary(title,note,count,titleId,countLabel,countId=''){
 return `<summary><span class="dashboardDisclosureCopy"><strong id="${titleId}">${title}</strong><span class="dashboardDisclosureNote">${note}</span></span><span class="dashboardDisclosureCount"${countId?` id="${countId}"`:''} aria-label="${esc(countLabel)}">${esc(count)}</span><svg class="dashboardDisclosureChevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></summary>`;
}
const ACTION_NOTICES={block:'Contact blocked across Friends and Vibe.',unblock:'Your block was removed. Existing connections stay ended.',cancel:'Invitation cancelled and saved in your Freezer.',freeze:'Connection ended and saved in your Freezer.',trash:'Record moved to your Trash.',restore:'Record restored to your Freezer. Contact stays ended.',report:'Thanks for telling us. We’ll review your report. This connection has ended.'};
// Discard action confirmations saved by older versions, without dropping saved errors.
if(Object.values(ACTION_NOTICES).includes(s.notice)||/^New (?:friend|Vibe) invitation sent\. They need to accept again\.$/.test(s.notice))s.notice='';
let transientNotice=null,noticeVersion=0;
const ownsTransientNotice=notice=>!!notice&&notice===transientNotice&&notice.state===s&&notice.account===activeMemberId()&&notice.text===s.notice;
function cancelNoticeTimer(){if(transientNotice)clearTimeout(transientNotice.timer);transientNotice=null}
function clearTransientNotice(notice=transientNotice){
 if(!notice||notice!==transientNotice)return;const owns=ownsTransientNotice(notice);cancelNoticeTimer();if(!owns)return;
 s.notice='';const element=document.querySelector('#root > .notice');if(element?.dataset.noticeVersion===String(notice.version)&&element.textContent===notice.text)element.remove();save();
}
function setNotice(text,{duration=0,dismissOnSelection=false}={}){
 cancelNoticeTimer();s.notice=text;noticeVersion++;
 if(text&&duration){const notice={state:s,account:activeMemberId(),text,version:noticeVersion,dismissOnSelection};transientNotice=notice;notice.timer=setTimeout(()=>clearTransientNotice(notice),duration)}
}
function showActionNotice(text){setNotice(text,{duration:5000,dismissOnSelection:true})}
function dismissActionNotice(){if(transientNotice?.dismissOnSelection)clearTransientNotice()}
function syncNoticeOwner(){
 const notice=transientNotice;if(!notice||ownsTransientNotice(notice))return;cancelNoticeTimer();
 if(notice.state===s&&notice.account!==activeMemberId()&&s.notice===notice.text)s.notice='';
}
const connectionRef=()=>s.liveToken?{token:s.liveToken}:{id:s.liveId};
const chatOpen=status=>['chat','email','tests'].includes(status);
const endedConnection=c=>['ended','declined','expired'].includes(c?.status);
const inTrash=c=>c?.location==='trash'||!!c?.trashedAt;
const inFreezer=c=>!inTrash(c)&&(c?.location==='freezer'||!!(c?.frozenAt||c?.freezerAction)||endedConnection(c));
const inactiveConnection=c=>inFreezer(c)||inTrash(c);
const UNCLAIMED_CONNECTION_LABELS={friend:'Mystery Guest',vibe:'Mystery Guest'};
function connectionDisplayName(value,kind='vibe'){const trimmed=typeof value==='string'?value.trim():'';return trimmed?(Object.values(UNCLAIMED_CONNECTION_LABELS).includes(trimmed)?trimmed:first(trimmed)):UNCLAIMED_CONNECTION_LABELS[kind]}
const connectionHistory=c=>({invitationDateLabel:c.invitationDateLabel==='Sent'?'Sent':'Created',frozenAt:c.frozenAt||null,freezerAction:c.freezerAction||null,freezerActionAt:c.freezerActionAt||null,endedAt:c.endedAt||null,endedBy:c.endedBy||null,location:c.location||'',hasHistoryPhoto:c.hasHistoryPhoto===true,trashedAt:c.trashedAt||null,blockedAt:c.blockedAt||null,legacyFrozen:c.legacyFrozen===true,canFreeze:c.canFreeze===true,canCancel:c.canCancel===true,canTrash:c.canTrash===true,canRestore:c.canRestore===true,canReinvite:c.canReinvite===true,canUnblock:c.canUnblock===true,canReport:c.canReport===true,canBlock:c.canBlock===true,blockedByMe:c.blockedByMe===true,historyEmail:typeof c.historyEmail==='string'?c.historyEmail:''});
function connectionName(c){return connectionDisplayName(c.side==='prospect'?c.sender_name:c.prospect_name||c.recipient_name,isFriend(c)?'friend':'vibe')}
const steps=()=>`<div aria-label="Game stages"><span class="miniStep">1 · My five</span><span class="miniStep">2 · Their first five</span><span class="miniStep">3 · Reveal &amp; request</span><span class="miniStep">4 · Chat &amp; next five</span></div>`;
function selectChempat(id,showSecrets=false){const input=$('message')||$('outgoingMessage');if(input)rememberChatText(input.value);const chosen=memberConnections().find(c=>c.id===id);if(!chosen||inactiveConnection(chosen))return;dismissActionNotice();adoptReceivedConnection(chosen);interactionVersion++;s.selectedChempat=id;if(isFriend(chosen)&&s.view!=='dashboard')s.view='dashboard';s.secretsFor=showSecrets&&!isFriend(chosen)?id:'';if(!isFriend(chosen)){if(s.liveMember){const c=s.inbox.find(item=>item.id===id)||hydratedConnectionRow(id);if(c){s.liveId=id;applyConnection(c)}}else if(s.actor==='prospect'&&id!=='first')s.selectedOutgoing=id}render()}
function adoptReceivedConnection(c){const hydrated=gamePieceAccount===activeMemberId()&&(gamePieceConnections.get(c.id)||wildcardConnections.get(c.id));if(hydrated&&!isFriend(c)&&!s.liveMember){s.account={...owner(),id:activeMemberId()};s.member={...s.account};s.memberId=s.account.id;s.liveMember=true;s.liveInvite=false;s.liveToken='';s.actor='member';s.liveId=c.id;applyConnection(hydrated.row);return}if(isFriend(c)||s.liveMember||c.side!=='received'||c.id==='first')return;const raw=(s.received||[]).find(item=>item.id===c.id);if(!raw)return;s.account={...owner(),id:activeMemberId()};s.member={...s.account};s.memberId=s.account.id;s.liveMember=true;s.liveInvite=false;s.liveToken='';s.inbox=[raw];s.actor='member';s.liveId=c.id;applyConnection(raw);refreshLive(true)}
function selectPrivateChat(id){const c=memberConnections().find(item=>item.id===id);if(!c||inactiveConnection(c)||!chatOpen(c.status))return;selectChempat(id);($('message')||$('outgoingMessage'))?.focus()}
function normalizeConnection(c){return {id:c.id,kind:isFriend(c)?'friend':'vibe',name:connectionName(c),photo:c.side==='prospect'?c.sender_photo:c.prospect_photo||'',status:c.status,upgraded:c.upgraded===true,side:c.side==='prospect'?'received':'sent',invitedAt:c.invitedAt,...connectionHistory(c),sharedEmail:isFriend(c)?'':c.side==='prospect'?'':c.prospect_email,channel:c.channel,claimed:c.claimed,ownSecondDone:c.side==='prospect'?c.prospectSecondDone:c.memberSecondDone,otherSecondDone:c.side==='prospect'?c.memberSecondDone:c.prospectSecondDone,ownAnswers:isFriend(c)?[]:c.own_answers,messages:c.messages||[],answers:isFriend(c)?[]:c.side==='prospect'?c.sender_answers||[]:c.prospect_answers||[]}}
function memberConnections(){
 const friends=(s.friends||[]).map(normalizeConnection),extra=[...(s.freezerExtra||[]),...(s.trashRows||[]),...(gamePieceAccount===activeMemberId()?[...gamePieceConnections.values(),...wildcardConnections.values()].map(entry=>entry.row):[])].filter((c,i,rows)=>rows.findIndex(item=>item.id===c.id)===i).filter(c=>!s.inbox.some(item=>item.id===c.id)&&!s.friends.some(item=>item.id===c.id)&&!s.outgoing.some(item=>item.id===c.id)&&!(s.received||[]).some(item=>item.id===c.id)&&(s.liveMember||s.firstConnectionMissing||c.id!==s.liveId)).map(normalizeConnection);
 if(s.liveMember)return [...s.inbox.map(normalizeConnection),...friends.filter(c=>!s.inbox.some(item=>item.id===c.id)),...extra];
 if(s.actor==='member')return [...friends,...extra];
 return [...(s.firstConnectionMissing?[]:[{id:'first',kind:'vibe',name:connectionDisplayName(s.member.name),photo:photo('member'),status:s.phase,upgraded:s.firstConnection?.upgraded===true,side:'received',invitedAt:s.invitedAt,...connectionHistory(s.firstConnection||{}),ownSecondDone:s.prospectSecondDone,otherSecondDone:s.memberSecondDone,ownAnswers:s.pairOwnAnswers,messages:s.messages||[],answers:s.member.answers}]),...(s.outgoing||[]).map(c=>({...c,name:connectionDisplayName(c.name,isFriend(c)?'friend':'vibe'),side:'sent',messages:c.messages||[],answers:isFriend(c)?[]:c.answers||[]})),...friends.filter(c=>!s.outgoing.some(item=>item.id===c.id)),...(s.received||[]).map(normalizeConnection),...extra];
}
const connectionFace=c=>`<span class="face">${pic(c.photo)?`<img src="${pic(c.photo)}" alt="${esc(c.name)}">`:esc(c.name[0])}</span>`;
function connectionMeta(c){const date=c.invitedAt?new Date(c.invitedAt):null,invited=date&&Number.isFinite(date.getTime())?`<time datetime="${date.toISOString()}">Invited ${esc(date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}))}</time>`:'',email=!isFriend(c)&&c.side==='sent'&&['email','tests'].includes(c.status)&&typeof c.sharedEmail==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.sharedEmail)?`<span class="sharedContact" aria-label="Shared email">${esc(c.sharedEmail)}</span>`:'';return `<div class="connectionMeta">${invited}<span>${esc(chatOpen(c.status)?'Private chat':connectionLine(c))}</span>${email}</div>`}
let connectionMenuSequence=0,openConnectionMenu=null,connectionMenuFocus=null,endDialogFocus=null;
function connectionMenuActions(c){return (inactiveConnection(c)?[]:[[allowedConnectionAction(c,'cancel')?'cancel':'freeze',allowedConnectionAction(c,'cancel')?'Cancel invitation':'Freeze connection'],['block','Block'],['report','Report']]).filter(([kind])=>allowedConnectionAction(c,kind))}
function connectionMenuItems(c){return connectionMenuActions(c).map(([kind,label])=>`<button type="button" role="menuitem" tabindex="-1" data-action="${kind}" onclick="chooseConnectionAction(this)">${label}</button>`).join('')}
function connectionMenu(c){
 const actions=connectionMenuActions(c);if(!actions.length)return '';const id=`connection-options-${++connectionMenuSequence}`;
 return `<div class="connectionMenu" data-connection-id="${esc(c.id)}"><button type="button" class="connectionMenuTrigger" id="${id}-trigger" aria-label="Connection options for ${esc(c.name)}" aria-haspopup="menu" aria-expanded="false" aria-controls="${id}" onclick="toggleConnectionMenu(this)"><span aria-hidden="true">⋯</span></button><div class="connectionMenuPanel" id="${id}" role="menu" aria-labelledby="${id}-trigger" hidden>${connectionMenuItems(c)}</div></div>`;
}
function connectionMenuSignature(c){return JSON.stringify([c?.status,c?.location,connectionMenuActions(c)])}
function connectionMenuCurrent(menu){return !!menu&&menu.state===s&&menu.account===activeMemberId()&&menu.view===s.view&&menu.selected===s.selectedChempat&&!s.modal&&menu.trigger.isConnected&&menu.signature===connectionMenuSignature(memberConnections().find(c=>c.id===menu.id))}
function restoreConnectionMenuFocus(menu){
 if(!menu||menu.state!==s||menu.account!==activeMemberId()||menu.view!==s.view||menu.selected!==s.selectedChempat)return;
 const trigger=menu.trigger.isConnected?menu.trigger:[...document.querySelectorAll('.connectionMenu')].find(node=>node.dataset.connectionId===menu.id)?.querySelector('.connectionMenuTrigger');trigger?.focus({preventScroll:true});
}
function closeConnectionMenu(returnFocus=false){
 const menu=openConnectionMenu;if(!menu)return null;openConnectionMenu=null;menu.trigger.setAttribute('aria-expanded','false');menu.panel.hidden=true;
 if(menu.holder.isConnected)menu.holder.append(menu.panel);else menu.panel.remove();if(returnFocus){connectionMenuFocus=menu;restoreConnectionMenuFocus(menu)}return menu;
}
function syncConnectionMenu(){if(openConnectionMenu&&!connectionMenuCurrent(openConnectionMenu))closeConnectionMenu(openConnectionMenu.panel.contains(document.activeElement))}
function positionConnectionMenu(){
 syncConnectionMenu();const menu=openConnectionMenu;if(!menu)return;
 const viewport=window.visualViewport,margin=8,gap=5,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||window.innerWidth,height=viewport?.height||window.innerHeight,rect=menu.trigger.getBoundingClientRect();
 if(rect.bottom<top||rect.top>top+height||rect.right<left||rect.left>left+width){closeConnectionMenu();return}
 menu.panel.style.maxWidth=`${Math.max(0,width-margin*2)}px`;menu.panel.style.maxHeight=`${Math.max(0,height-margin*2)}px`;
 const size=menu.panel.getBoundingClientRect(),x=Math.max(left+margin,Math.min(rect.right-size.width,left+width-size.width-margin)),below=top+height-rect.bottom-gap-margin,above=rect.top-top-gap-margin;
 const up=size.height>below&&above>below,available=Math.max(0,up?above:below);menu.panel.style.maxHeight=`${available}px`;
 menu.panel.style.left=`${x}px`;menu.panel.style.top=`${up?Math.max(top+margin,rect.top-gap-Math.min(size.height,available)):Math.max(top+margin,rect.bottom+gap)}px`;
}
function toggleConnectionMenu(trigger,last=false){
 if(openConnectionMenu?.trigger===trigger){closeConnectionMenu(true);return}
 closeConnectionMenu();const holder=trigger.closest('.connectionMenu'),c=memberConnections().find(c=>c.id===holder?.dataset.connectionId),panel=holder?.querySelector('.connectionMenuPanel');if(!c||!panel||s.modal||!connectionMenuActions(c).length)return;
 const input=$('message')||$('outgoingMessage');if(input)rememberChatText(input.value);
 panel.innerHTML=connectionMenuItems(c);trigger.setAttribute('aria-label',`Connection options for ${c.name}`);
 const menu={state:s,account:activeMemberId(),view:s.view,selected:s.selectedChempat,id:c.id,signature:connectionMenuSignature(c),trigger,holder,panel};openConnectionMenu=menu;
 document.body.append(panel);panel.hidden=false;trigger.setAttribute('aria-expanded','true');positionConnectionMenu();if(openConnectionMenu===menu){const items=panel.querySelectorAll('[role="menuitem"]');(last?items[items.length-1]:items[0])?.focus({preventScroll:true})}
}
function chooseConnectionAction(button){
 const menu=openConnectionMenu;if(!connectionMenuCurrent(menu)||!menu.panel.contains(button)){syncConnectionMenu();return}
 const kind=button.dataset.action,c=memberConnections().find(c=>c.id===menu.id);if(!connectionMenuActions(c).some(([action])=>action===kind)){closeConnectionMenu(true);return}
 closeConnectionMenu();openEnd(menu.id,kind);if(s.modal==='end'){endDialogFocus=menu;document.querySelector('.endModal .close')?.focus({preventScroll:true})}
}
document.addEventListener('click',event=>{const menu=openConnectionMenu;if(menu&&!menu.panel.contains(event.target)&&!menu.trigger.contains(event.target))closeConnectionMenu(menu.panel.contains(document.activeElement))},true);
document.addEventListener('focusin',event=>{const trigger=event.target.closest?.('.connectionMenuTrigger');if(trigger)connectionMenuFocus={state:s,account:activeMemberId(),view:s.view,selected:s.selectedChempat,id:trigger.closest('.connectionMenu').dataset.connectionId,trigger};const menu=openConnectionMenu;if(menu&&!menu.panel.contains(event.target)&&!menu.trigger.contains(event.target))closeConnectionMenu()});
document.addEventListener('keydown',event=>{
 const trigger=event.target.closest?.('.connectionMenuTrigger');if(trigger&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();if(openConnectionMenu?.trigger===trigger)closeConnectionMenu();toggleConnectionMenu(trigger,event.key==='ArrowUp');return}
 syncConnectionMenu();const menu=openConnectionMenu;if(!menu)return;
 if(event.key==='Escape'){event.preventDefault();closeConnectionMenu(true);return}
 if(event.key==='Tab'){closeConnectionMenu(true);return}
 if(!menu.panel.contains(event.target))return;const items=[...menu.panel.querySelectorAll('[role="menuitem"]')],index=items.indexOf(document.activeElement);
 const next=event.key==='ArrowDown'?(index+1)%items.length:event.key==='ArrowUp'?(index+items.length-1)%items.length:event.key==='Home'?0:event.key==='End'?items.length-1:-1;
 if(next>=0){event.preventDefault();items[next].focus()}
});
window.addEventListener('resize',positionConnectionMenu);window.addEventListener('scroll',positionConnectionMenu,true);
window.visualViewport?.addEventListener('resize',positionConnectionMenu);window.visualViewport?.addEventListener('scroll',positionConnectionMenu);
function connectionLine(c){
 if(isFriend(c))return c.status==='invited'?'Waiting for your friend to connect':chatOpen(c.status)?'Friend · Private chat':'Friend connection ended';
 if(c.status==='request')return c.side==='received'?'Waiting for their answer':'Your move · Keep going or pass';
 if(c.status==='firstResults')return c.side==='received'?'Your move · Keep going?':'Waiting for their answer';
 if(c.status==='secondFive')return c.ownSecondDone?(c.otherSecondDone?'Your move · Reveal saved secrets':'Waiting for their next five'):'Your move · Play the next five';
 if(c.status==='secondResults')return c.side==='received'?'Your move · Open chat?':'Next five revealed · Waiting for their decision';
 if(c.status==='chatRequested')return c.side==='received'?'Waiting for their chat decision':'Your move · Open chat or pass';
 if(c.status==='invited'&&c.channel==='qr')return c.claimed?'Waiting for their first five':'Code ready · waiting for scan';
 return ({invited:'Invitation sent',chat:'Chat open',email:'Chat open · Email shared',tests:'Chat open',declined:'Connection passed',ended:'Connection ended'})[c.status]||'Your connection';
}
const needsAction=c=>c.status==='secondFive'?(!c.ownSecondDone||c.otherSecondDone):c.side==='received'?['firstResults','secondResults'].includes(c.status):['request','chatRequested'].includes(c.status);
function connectionDetail(c){
 if(isFriend(c))return c.status==='invited'?'Share your invitation. Chat opens when your friend chooses to connect.':chatOpen(c.status)?'You’re connected as friends. Say hello.':'This friend connection has ended.';
 if(c.status==='firstResults')return c.side==='received'?'Your first five are revealed. Want to discover five more together?':`Your first five are revealed. Waiting for ${esc(c.name)} to choose whether to keep going.`;
 if(c.status==='request')return c.side==='received'?`You chose to keep going. Waiting for ${esc(c.name)} to choose too.`:`${esc(c.name)} wants to keep going. Choose together before the next five unlock.`;
 if(c.status==='secondFive')return c.ownSecondDone?(c.otherSecondDone?'Both sets are saved. Retry the reveal to see them together.':'Your next five are saved. Waiting for theirs before either set is revealed.'):'You both chose to keep going. Complete five more; both sets stay hidden until you both finish.';
 if(c.status==='secondResults')return 'Ten secrets revealed. Chat opens only when you both choose it.';
 if(c.status==='chatRequested')return c.side==='received'?`You asked to chat. Waiting for ${esc(c.name)} to choose too.`:`${esc(c.name)} would like to chat. Your choice comes next.`;
 if(c.status==='invited')return c.channel==='qr'&&c.claimed?`${esc(c.name)} opened your code. Their first five are next.`:`${esc(c.name)} has your invitation. Their first five are next.`;
 if(chatOpen(c.status))return 'You both chose to chat. Your conversation is open.';
 return 'This connection has ended.';
}
function connectionActions(c){
 if(isFriend(c))return '';
 if(c.status==='secondFive')return c.ownSecondDone?(c.otherSecondDone?button('RETRY OUR REVEAL →','startSecondFive()'):''):button('PLAY OUR NEXT FIVE →','startSecondFive()');
 if(c.side==='received')return c.status==='firstResults'?button('KEEP GOING →','showRequest()'):c.status==='secondFive'?button('PLAY OUR NEXT FIVE →','startSecondFive()'):c.status==='secondResults'?button('SEE OUR NEXT FIVE →','showSecondResults()')+button('ASK TO CHAT →','requestChat()'):'';
 const outgoing=s.actor==='prospect'&&!s.liveMember,accept=outgoing?"decideOutgoing('accept')":'acceptRequest()',decline=outgoing?"decideOutgoing('decline')":'declineRequest()';
 return ['request','chatRequested'].includes(c.status)?button(c.status==='request'?'KEEP GOING →':'OPEN CHAT →',accept)+button('PASS',decline,'light'):c.status==='secondResults'?button('SEE OUR NEXT FIVE →',outgoing?`selectChempat('${c.id}',true)`:'showSecondResults()'):'';
}
function chatThread(chosen){if(!chosen)return '<p>Open this connection from My Page to chat.</p>';if(dateConnection(chosen.id))return renderDateConversation(chosen,true);const messages=(chosen.messages||[]).filter(message=>message.type!=='dateCard'),mine=chosen.side==='received'?'prospect':'member';return `<div class="inlineChat" aria-label="Private Chat with ${esc(chosen.name)}">${messages.length?messages.map(m=>m.by==='system'?`<div class="chatGameNote"><span aria-hidden="true">✦</span><p>${esc(m.text)}</p><small>Connection game</small></div>`:`<div class="inlineMessage ${m.by===mine?'mine':''}">${m.by===mine?'<b class="chatSender">You</b>':''}${m.photo&&pic(m.photo)?`<img class="chatPhoto" src="${pic(m.photo)}" alt="Photo shared in chat">`:''}${m.text?`<p>${esc(m.text)}</p>`:''}</div>`).join(''):`<p class="chatEmpty">${isFriend(chosen)?'You’re connected as friends. Say hello.':'Say hello. You have five things to talk about.'}</p>`}</div>${chatComposer(chosen)}`;}
function historyDate(value){const date=typeof value==='string'&&value.trim()?new Date(value):null;return date&&Number.isFinite(date.getTime())?`<time datetime="${date.toISOString()}">${esc(date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}))}</time>`:'<span>Date unavailable</span>'}
function freezerStatus(c){return ({freeze:'Frozen',cancel:'Cancelled',block:'Blocked',ended:'Ended',declined:'Passed',expired:'Expired'})[c.freezerAction]||({declined:'Passed',expired:'Expired'})[c.status]||'Ended'}
function freezerActionDate(c){return c.freezerActionAt||c.endedAt||null}
const unavailableHistoryPhotos=new Set();
function historyPhotoFailed(image){unavailableHistoryPhotos.add(image.dataset.historyPhoto);image.parentElement.textContent=image.dataset.initial||'?'}
function historyConnectionFace(c){const id=c.id==='first'?s.liveId:c.id,key=`${activeMemberId()}:${id}`;if(pic(c.photo)||!c.hasHistoryPhoto||unavailableHistoryPhotos.has(key))return connectionFace(c);return `<span class="face"><img src="/api/connection-photo?id=${encodeURIComponent(id)}" alt="${esc(c.name)}" loading="lazy" referrerpolicy="no-referrer" data-history-photo="${esc(key)}" data-initial="${esc(c.name[0])}" onerror="historyPhotoFailed(this)"></span>`}
function historyIdentity(c){return `<div class="freezerIdentity">${historyConnectionFace(c)}<div><b>${esc(c.name)}</b><small>${isFriend(c)?'Friend':'Vibe'} · ${c.side==='received'?'Received invitation':'Your invitation'}</small>${c.historyEmail?`<span class="freezerEmail">${esc(c.historyEmail)}</span>`:''}${c.blockedByMe?'<span class="blockedLabel">Blocked by you</span>':''}</div></div>`}
function historyDates(c){return `<dl class="freezerDates"><div><dt>${c.invitationDateLabel==='Sent'?'Sent':'Created'}</dt><dd>${historyDate(c.invitedAt)}</dd></div><div><dt>${esc(freezerStatus(c))}</dt><dd>${historyDate(freezerActionDate(c))}</dd></div>${c.blockedByMe&&c.freezerAction!=='block'?`<div><dt>Blocked</dt><dd>${historyDate(c.blockedAt)}</dd></div>`:''}${inTrash(c)?`<div><dt>Trashed</dt><dd>${historyDate(c.trashedAt)}</dd></div>`:''}</dl>`}
function historyActions(c){const actions=inTrash(c)?[['restore','Restore to Freezer']]:[['freeze','End and freeze'],['reinvite','Invite again'],['block','Block'],['unblock','Unblock'],['trash','Trash'],['report','Report']];return actions.filter(([kind])=>allowedConnectionAction(c,kind)).map(([kind,label])=>`<button type="button" class="historyAction ${kind==='trash'?'trashAction':''}" onclick="${kind==='reinvite'?`openReinvite('${c.id}')`:`openEnd('${c.id}','${kind}')`}">${label}</button>`).join('')}
function renderFreezer(connections){return `<details class="socialFreezer dashboardDisclosure" ${dashboardDisclosureAttributes('freezer')}>${dashboardDisclosureSummary('Freezer','Ended connections &amp; cancelled invites',`${connections.length}${s.freezerCursor?'+':''}`,'freezerTitle',`${connections.length} records loaded${s.freezerCursor?', more history available':''}`)}<div class="dashboardDisclosureBody"><p class="freezerIntro">A new invitation needs a new acceptance.</p>${connections.length?`<ul class="freezerList">${connections.map(c=>`<li class="freezerItem" data-connection-id="${esc(c.id)}">${historyIdentity(c)}${c.legacyFrozen?'<p class="legacyFreezeNote">This older hide is still connected. End and freeze it before inviting again or moving it to Trash.</p>':historyDates(c)}<div class="freezerActions">${historyActions(c)}</div></li>`).join('')}</ul>`:'<p class="freezerEmpty">Nothing in your Freezer yet.</p>'}${s.freezerCursor?`<button type="button" class="loadFreezer" onclick="loadFreezerHistory()" ${loadingFreezer&&currentInvitation(loadingFreezer)?'disabled':''}>${loadingFreezer&&currentInvitation(loadingFreezer)?'Loading history…':'Load more history'}</button>`:''}<p id="freezerError" class="error" role="alert">${esc(s.freezerError)}</p></div></details>`}
function renderTrash(){const loading=loadingTrash&&currentInvitation(loadingTrash),connections=(s.trashRows||[]).map(c=>({...normalizeConnection(c),id:!s.liveMember&&!s.firstConnectionMissing&&c.id===s.liveId?'first':c.id}));return `<div class="trashEntry"><button type="button" class="link trashLink" onclick="toggleTrash()" aria-expanded="${s.trashOpen}" aria-controls="personalTrash">${s.trashOpen?'Close Trash':'Trash'}</button></div>${s.trashOpen?`<section class="socialTrash" id="personalTrash" aria-labelledby="trashTitle"><div class="socialSectionTitle"><h2 id="trashTitle">Trash</h2><span>${connections.length}</span></div><p class="freezerIntro">Only you see this list. Restore puts a record back in your Freezer. It never reopens contact or removes a block.</p>${connections.length?`<ul class="freezerList">${connections.map(c=>`<li class="freezerItem" data-connection-id="${esc(c.id)}">${historyIdentity(c)}${historyDates(c)}<div class="freezerActions">${historyActions(c)}</div></li>`).join('')}</ul>`:`<p class="freezerEmpty">${loading?'Loading Trash…':s.trashLoaded?'Nothing in Trash.':'Your Trash could not be loaded.'}</p>`}${s.trashCursor||!s.trashLoaded||s.trashError?`<button type="button" class="loadTrash" onclick="loadTrashHistory(!!s.trashError)" ${loading?'disabled':''}>${loading?'Loading Trash…':s.trashLoaded&&!s.trashError?'Load more Trash':'Try again'}</button>`:''}<p id="trashError" class="error" role="alert">${esc(s.trashError)}</p></section>`:''}`}
function toggleTrash(){dismissActionNotice();s.trashOpen=!s.trashOpen;render(true);if(s.trashOpen)loadTrashHistory(true)}
function renderSocialDashboard(){
 const all=memberConnections(),active=all.filter(c=>!inactiveConnection(c)),frozen=all.filter(inFreezer),people=active.filter(c=>!(c.channel==='qr'&&!c.claimed&&c.status==='invited')),pendingCode=active.find(c=>c.channel==='qr'&&!c.claimed&&c.status==='invited'),chosen=people.find(c=>c.id===s.selectedChempat)||people[0];
 if(!chosen)s.selectedChempat='';
 if(chosen){adoptReceivedConnection(chosen);s.selectedChempat=chosen.id;if(!isFriend(chosen)&&chosen.side==='sent'&&s.actor==='prospect'&&!s.liveMember)s.selectedOutgoing=chosen.id;if(!isFriend(chosen)&&s.liveMember&&chosen.id!==s.liveId){s.liveId=chosen.id;const c=s.inbox.find(item=>item.id===chosen.id)||hydratedConnectionRow(chosen.id);if(c)applyConnection(c)}}
 const who=owner();
 const action=`<div class="socialVibeAction">${button('Send a vibe →','createMyVibe()')}${button('Invite a friend','openFriendShare()','light friendShareButton')}</div><p class="connectionEntryHint">A Vibe starts with five secrets. Friends can go straight to chat.</p>`;
 const contact=c=>`<div class="chempatContact ${chosen?.id===c.id?'selected':''}"><button type="button" class="chempatPerson" onclick="selectChempat('${c.id}')" aria-label="Show ${esc(c.name)} and connection status">${connectionFace(c)}<span><b>${esc(c.name)}</b><small>${esc(connectionLine(c))}</small><small class="gettingCloser" data-reward-badge="${esc(c.id)}" ${rewardBadge(c)?'':'hidden'}>${rewardBadge(c)?'✦ Getting closer':''}</small><small class="wildcardPending" data-wildcard-pending="${esc(c.id)}" hidden></small></span>${needsAction(c)?'<i aria-label="Your move"></i>':''}</button><div class="chempatControls"><button type="button" class="privateChatButton ${chosen?.id===c.id&&s.secretsFor!==c.id&&chatOpen(c.status)?'on':''}" onclick="selectPrivateChat('${c.id}')" aria-label="Private Chat with ${esc(c.name)}" aria-controls="connectionPanel" aria-pressed="${chosen?.id===c.id&&s.secretsFor!==c.id&&chatOpen(c.status)}" ${chatOpen(c.status)?'':'disabled title="Chat opens after you both choose it"'}>Private Chat</button>${isFriend(c)?'':`<button type="button" class="secretsButton ${s.secretsFor===c.id?'on':''}" onclick="selectChempat('${c.id}',true)" aria-label="Our Secrets with ${esc(c.name)}" aria-controls="connectionPanel" aria-pressed="${s.secretsFor===c.id}">Our Secrets</button>`}</div></div>`;
 const vibes=people.filter(c=>!isFriend(c)),friends=people.filter(isFriend);
 const activeChat=chosen&&chatOpen(chosen.status);
 const showingSecrets=chosen&&!isFriend(chosen)&&s.secretsFor===chosen.id;
 const thread=activeChat?chatThread(chosen):'';
 const unlocked=chosen&&chosen.answers.length>=5&&who.answers.length>=5&&!['invited','declined','ended'].includes(chosen.status);
 const five=!chosen?'':showingSecrets?unlocked?`<div class="focusReveals"><div class="eyebrow">OUR SECRETS</div><div class="secretAnswerHeads"><span>MY ANSWER</span><span>THEIR ANSWER</span></div>${QUESTIONS.slice(0,chosen.answers.length>=10?10:5).map((q,i)=>{const own=(chosen.ownAnswers?.length>=5?chosen.ownAnswers:who.answers)[i],theirs=chosen.answers[i];return `<div class="secretCompare"><b>${i+1} · ${esc(q.topic)}</b><div class="secretAnswers"><span class="${own===theirs?'agree':''}">${esc(q.a[own]||'Waiting')}</span><span class="${own===theirs?'agree':''}">${esc(q.a[theirs]||'Waiting')}</span></div></div>`}).join('')}</div>`:`<div class="focusStatus"><p>${chosen.status==='invited'?`${esc(chosen.name)} can unlock your first five when they play.`:['declined','ended'].includes(chosen.status)?'This connection has ended.':'Your answers will appear together after you both play.'}</p></div>`:!activeChat?`<div class="focusStatus"><p>${connectionDetail(chosen)}</p></div>`:'';
 const nextActions=chosen&&!activeChat?connectionActions(chosen):'';
 return `<header class="socialMemberHeader"><p class="ctaPrompt socialMemberTagline">Catch a vibe.</p><div class="socialMemberIdentity">${face(s.actor)}<div><h1>${esc(first(who.name))}</h1></div></div><div class="socialMemberAction">${action}${unconfirmed()?button('CONFIRM MY EMAIL','openVerify(owner().contact,null)','light'):''}</div></header>${renderGamePieceFeed()}
 <div class="socialWorkspace"><section class="socialConnections" aria-labelledby="connectionsTitle"><header class="connectionsHeading"><h2 id="connectionsTitle">Connections</h2><span class="connectionsCount">${people.length}</span></header><div class="socialSectionTitle"><h3>Vibe connections</h3><span>${vibes.length}</span></div><div class="chempatRail">${vibes.map(contact).join('')||`<div class="railEmpty">Your connections will appear here after someone plays.</div>`}</div>${pendingCode?`<div class="pendingInvite"><button type="button" onclick="openInvite()">Send an Instant Vibe →</button><small>Connection status · Code ready · waiting for scan</small>${activeConnectionControls(pendingCode)}</div>`:''}<div class="socialSectionTitle friendSectionTitle"><h3>Friends</h3><span>${friends.length}</span></div><div class="chempatRail friendRail">${friends.map(contact).join('')||'<div class="railEmpty">Share a link to connect with a friend.</div>'}</div></section>
 ${chosen?`<section class="connectionFocus" id="connectionPanel" aria-labelledby="connectionName"><header class="focusHeader"><div class="focusIdentity">${connectionFace(chosen)}<div class="focusConversation"><h2 id="connectionName">${esc(chosen.name)}</h2>${connectionMeta(chosen)}</div></div>${activeConnectionControls(chosen)}</header>${showingSecrets?five:thread||five}${(!activeChat||showingSecrets)?renderDateConversation(chosen,false):''}${renderRewardConnection(chosen)}${renderWildcardPanel(chosen)}${renderDiscoveryPanel(chosen)}${nextActions?`<div class="focusActions focusNextActions">${nextActions}</div>`:''}<p class="error focusError" id="outgoingError" role="alert"></p></section>`:`<section class="connectionFocus emptyFocus"><span class="emptyConnectionMark" aria-hidden="true">↗</span><h2>It starts with one hello.</h2><p>Send a Vibe to someone you’re curious about, or invite a friend. Pick a connection here to keep it going.</p>${pendingCode?`<small class="connectionStatus">Connection status · Code ready · waiting for scan</small>`:''}</section>`}</div>
 ${renderDashboardProgress()}<details class="socialSecrets dashboardDisclosure" ${dashboardDisclosureAttributes('secrets')}>${dashboardDisclosureSummary('My secrets','Your saved answers',who.answers.length,'mySecretsTitle',`${who.answers.length} saved answers`)}<div class="dashboardDisclosureBody">${who.answers.length?`<ol class="answeredList">${QUESTIONS.slice(0,who.answers.length).map((q,i)=>`<li><strong>${esc(q.q)}</strong><span>${esc(q.a[who.answers[i]])}</span></li>`).join('')}</ol>`:'<p class="discoveryEmpty">Your saved answers will appear here.</p>'}</div></details>${renderDashboardGameResults()}${renderFreezer(frozen)}${renderTrash()}`;
}
function render(preserveModal=false){syncDateOwner();syncMemberProfileOwner();const profileFocus=memberProfileFocus();const disclosureFocus=captureDashboardDisclosures();const gamePieceFocus=s.view==='dashboard'&&document.activeElement?.matches('.socialMemberAction button,[data-reward-level],#gamePiecesDetailLink,[data-game-piece-action]')?{id:document.activeElement.id,action:document.activeElement.getAttribute('onclick'),account:activeMemberId()}:null;const menuFocus=openConnectionMenu&&(openConnectionMenu.panel.contains(document.activeElement)||openConnectionMenu.trigger===document.activeElement)?openConnectionMenu:connectionMenuFocus?.trigger===document.activeElement?connectionMenuFocus:null;connectionMenuFocus=null;closeConnectionMenu();syncNoticeOwner();if(isFriend(memberConnections().find(c=>c.id===s.selectedChempat))&&['conversation','email','tests','results'].includes(s.view))s.view='dashboard';if(s.view==='conversation'&&(!chatOpen(s.phase)||!memberConnections().some(c=>c.id===s.selectedChempat&&!inactiveConnection(c)&&chatOpen(c.status))))s.view='dashboard';save();let actor=s.actor; $('navUser').innerHTML=s.view==='landing'?'':`<div class="user"><button class="navIdentity" type="button" onclick="goHome()" aria-label="Open my page">${face(actor)}<b>${esc(name(actor))}</b></button>${activeMemberId()?`<button class="navProfile" type="button" onclick="openMemberProfile()" ${s.view==='profile'?'aria-current="page"':''}>My profile</button>`:''}${s.view==='dashboard'?`<button class="navHome" type="button" onclick="confirmLogout()">LOG OUT</button>`:`<button class="navHome" type="button" onclick="goHome()">MY PAGE</button>`}</div>`;
let html='';
if(s.view==='profile')html=renderMemberProfile();
if(s.view==='friendInvite')html=renderFriendInvitation();
if(s.view==='inviteAuth')html=renderInvitationAuth();
if(s.view==='landing')html=`<section class="box joinCard instantEntry${!s.friendToken&&s.joinStep===1?' landingEntry':''}">${s.friendToken?friendIntro()+'<button type="button" class="link friendBack" onclick="showFriendInvitation()">← Back to invitation</button>':''}${['signin','signinCode','joinCode'].includes(s.joinStep)?signinCard():s.joinStep===2?`<div class="eyebrow">2 · YOUR PICTURE</div><h2>Add your picture.</h2><p>${s.friendToken?'Let your friend recognize you.':'Let them see who they’re playing with.'}</p><div class="photoActions"><button type="button" class="button alt" onclick="openCamera()">CAMERA</button><label class="button light photoPick">CHOOSE FILE PHOTO<input id="memberPhoto" class="photoFileInput" type="file" accept="image/*" onchange="uploadPhoto(event,'member')"></label></div><video id="cameraPreview" class="cameraPreview" autoplay muted playsinline hidden></video><canvas id="cameraCanvas" hidden></canvas><button id="captureBtn" type="button" class="button captureButton" onclick="captureCamera()" hidden>SMILE &amp; CAPTURE</button><p id="joinError" class="error" role="alert"></p><button type="button" class="link" onclick="backToDetails()">← Back to details</button>`:`${s.friendToken?'<h1>Make your page.</h1><p class="entryNote">Start with your name and email. Your email stays private.</p>':'<h1>Catch a vibe.<br><em>In Duhwild.</em></h1><p class="entryHook">You weren’t looking. Then you caught their eye.</p><p class="entryInvitation">Skip the pickup line. Give them something to discover.</p>'}<input class="joinInput" id="joinName" aria-label="Your name" autocomplete="given-name" maxlength="50" placeholder="Your first name" value="${esc(s.member.name)}"><input class="joinInput" id="joinContact" type="${CELL_ENABLED?'text':'email'}" aria-label="${CONTACT_LABEL}" autocomplete="email" placeholder="${CONTACT_LABEL}" value="${esc(owner().contact)}">${agreeBox('joinAgree',s.member.agreed)}<button type="button" class="button nextButton" onclick="nextJoinStep()">${s.friendToken?'CONTINUE →':'Get my vibe ready →'}</button>${s.friendToken?'':'<p class="entryPromise">Your photo. Five secrets. Your move.</p><p class="entryPrivacy">Your email stays private.</p>'}<p id="joinError" class="error" role="alert"></p><button type="button" class="link" onclick="showSignin()">Already have a page? Sign in →</button>`}</section>`
if(s.view==='dashboard'&&s.actor==='member'){
 const answered=s.member.answers.length;
 html=answered>=5?(s.liveMember||memberConnections().length||s.trashLoaded?renderSocialDashboard():renderVibeReady()):s.memberQuestionsOpen?quickChoices(0,s.member.answers):s.liveMember||s.friends.length||s.friendAcceptedId?renderSocialDashboard():quickChoices(0,s.member.answers);
}
if(s.view==='dashboard'&&s.actor==='prospect')html=renderSocialDashboard();
if(s.view==='questions')html=quickChoices(['secondFive','memberNextFive'].includes(s.phase)?5:0,s.actor==='member'?s.member.answers:s.prospect.answers);
if(s.view==='invitee'){
 const answered=s.prospect.answers.length,q=QUESTIONS[answered]||QUESTIONS[0];
 html=`<div class="inviteeHero"><div class="hero compactHero"><div class="eyebrow">AN INVITATION FOR YOU</div><h1>${esc(name('member'))} invited you.</h1><p>A little game for two.</p></div><div class="inviterIdentity">${face('member')}<span><small>Invited you to play</small><b>${esc(name('member'))}</b></span></div></div>
 <section class="introCard memberIntro"><div class="introPitch"><div class="eyebrow">${answered?'FIVE TO VIBE · IN PROGRESS':'FIVE TO VIBE'}</div><h2>“I’ll tell you five secrets about me. Want to see if we vibe?”</h2><p>Pick your answers to five quick ones. Then we’ll show each other ours.</p>${!s.prospectQuestionsOpen?button(answered?'CONTINUE MY FIVE →':'LET’S GO →','startProspect()'):''}</div>
 <div id="prospectQuestion" class="memberQuestion">${s.prospectQuestionsOpen?`<div class="eyebrow">QUESTION ${answered+1} OF 5 · ${esc(q.topic)}</div><h3>${esc(q.q)}</h3><div class="progress">${Array.from({length:5},(_,i)=>`<span class="${i<=answered?'done':''}"></span>`).join('')}</div>${q.a.map((a,i)=>`<button type="button" class="option ${s.pick===i?'on':''}" aria-pressed="${s.pick===i}" onclick="chooseQuick(${i},${answered})">${'ABC'[i]}. ${esc(a)}</button>`).join('')}${answered?button('← BACK','backQuick()','light'):''}<p id="answerError" class="error" role="alert"></p>`:`<div class="eyebrow">YOUR FIVE</div><h3>One question at a time.</h3><p>Tap Play My Five to put your first answer here.</p>`}</div></section>`;
}
if(s.view==='revealPhoto')html=`<section class="box revealPhotoStep"><div class="eyebrow">YOUR FIVE ARE IN</div><h2>Now put your face to them.</h2><p>Sign up to save these five answers and return to this connection. Your picture and name identify you. You’ll verify your email before connecting; it stays private.</p>${s.prospect.photo?`<div class="revealIdentity">${face('prospect')}<b>Looking good.</b></div>`:''}<div class="photoActions"><button type="button" class="button alt" onclick="openCamera()">CAMERA</button><label class="button light photoPick">CHOOSE FILE PHOTO<input id="revealPhotoInput" class="photoFileInput" type="file" accept="image/*" onchange="uploadPhoto(event,'prospect')"></label></div><video id="cameraPreview" class="cameraPreview" autoplay muted playsinline hidden></video><canvas id="cameraCanvas" hidden></canvas><button id="captureBtn" type="button" class="button captureButton" onclick="captureCamera()" hidden>SMILE &amp; CAPTURE</button><input class="joinInput" id="newMemberName" aria-label="Your first name" autocomplete="given-name" maxlength="50" placeholder="Your first name" value="${esc(s.prospect.name)}" oninput="s.prospect.name=this.value"><input class="joinInput" id="newMemberContact" type="${CELL_ENABLED?'text':'email'}" aria-label="${CONTACT_LABEL}" autocomplete="email" placeholder="${CONTACT_LABEL}" value="${esc(s.prospect.email||s.prospect.phone)}" oninput="s.prospect.email=this.value">${agreeBox('newMemberAgree',s.prospect.agreed)}<button type="button" class="button" onclick="finishProspectRegistration()">SHOW OUR FIVE →</button><p id="revealPhotoError" class="error" role="alert"></p></section>`;
if(s.view==='results'){const ownPair=s.pairOwnAnswers?.length>=5?s.pairOwnAnswers:null,leftAnswers=s.actor==='member'&&ownPair?ownPair:s.member.answers,rightAnswers=s.actor==='prospect'&&ownPair?ownPair:s.prospect.answers;let offset=s.revealOffset===5||['secondResults','chatRequested','email','tests'].includes(s.phase)?5:0;html=`<div class="revealIntro"><div class="eyebrow">${offset?'NEXT FIVE':'FIRST FIVE'} · BOTH SIDES</div><h2>How you answered.</h2></div><section class="box revealBoard"><div class="revealPeople"><div aria-label="${esc(name('member'))}'s answers">${face('member')}</div><div aria-label="${esc(name('prospect'))}'s answers">${face('prospect')}</div></div>${QUESTIONS.slice(offset,offset+5).map((q,i)=>{const left=q.a[leftAnswers[offset+i]]||'Waiting',right=q.a[rightAnswers[offset+i]]||'Waiting',match=leftAnswers[offset+i]!==undefined&&leftAnswers[offset+i]===rightAnswers[offset+i];return `<div class="revealItem"><div class="revealQuestion"><span>${i+1} · ${esc(q.topic)}</span><strong>${esc(q.q)}</strong></div><div class="revealChoices"><button type="button" class="revealChoice ${match?'match matchLight':'different'}" title="${esc(left)}" aria-label="${esc(name('member'))}: ${esc(left)}" onclick="this.classList.toggle('expanded')">${esc(left)}</button><button type="button" class="revealChoice ${match?'match matchDark':'different'}" title="${esc(right)}" aria-label="${esc(name('prospect'))}: ${esc(right)}" onclick="this.classList.toggle('expanded')">${esc(right)}</button></div></div>`}).join('')}<div class="row revealNext">${offset?(s.phase==='secondResults'&&s.actor==='prospect'?button('ASK TO CHAT →','requestChat()'):button('MY PAGE →','goHome()')):s.actor==='prospect'&&!['request','chat','secondFive','secondResults','email','tests','declined'].includes(s.phase)?button('KEEP GOING →','showRequest()')+button('CREATE MY INSTANT VIBE →','createMyVibe()','alt'):button('MY PAGE →','goHome()','alt')}</div></section>`}
if(s.view==='request')html=`<div class="hero compactHero"><div class="eyebrow">FIRST FIVE REVEALED</div><h1>Keep going with ${esc(name('member'))}?</h1><p>Both of you choose before five more secrets unlock. Chat comes after your next reveal and another mutual choice.</p></div><section class="box requestCard"><div class="chatPair"><div>${face('member')}<b>${esc(name('member'))}</b></div><div>${face('prospect')}<b>${esc(name('prospect'))}</b></div></div><p>Your saved name and picture are ready. Your email stays private; verify it before connecting so you can safely return.</p><div class="row">${button('KEEP GOING →','sendRequest()')}${button('BACK TO OUR FIVE','backToFirstResults()','light')}</div><p class="error" id="requestError" role="alert"></p></section>`;
if(s.view==='conversation'){let nextReady=s.prospect.answers.length===10;html=`<div class="hero chatHeader"><div class="eyebrow">OUR SPACE · ${esc(name('member'))} + ${esc(name('prospect'))}</div><h1>Private Chat</h1><div class="chatPair"><div class="chatPerson">${face('member')}<b>${esc(name('member'))}</b></div><div class="chatPerson">${face('prospect')}<b>${esc(name('prospect'))}</b></div></div><p>You both saw the first five. Say what’s on your mind.</p><button type="button" class="link" onclick="goHome()">← MY PAGE</button></div><div class="grid"><section class="box"><h2>Private Chat</h2>${chatThread(chatSelection())}${renderWildcardPanel(chatSelection())}${renderDiscoveryPanel(chatSelection())}</section><aside class="stack"><div class="box"><h3>Your next chapter.</h3><p>${nextReady?'Both sets of answers are ready to see.':s.actor==='prospect'?'Keep playing to reveal more.':'The next five are ready for them when they come back.'}</p><div class="row">${nextReady?button('SEE OUR NEXT FIVE →','showSecondResults()')+(s.actor==='prospect'?button('SHARE MY EMAIL →','continueAfterSecond()','light'):''):s.actor==='prospect'?button('PLAY THE NEXT FIVE →','startSecondFive()'):''}</div></div><div class="box"><h3>Connection</h3><p>${esc(name('prospect'))} · ${CELL_ENABLED?esc(mask(s.prospect.phone)):'email private'}</p><p class="small">Your email stays private until you choose to share it after all ten and mutual chat.</p></div></aside></div>`}
if(s.view==='email')html=`<div class="hero"><div class="eyebrow">TEN ANSWERS IN</div><h1>Keep this connection close.</h1><p>Five to Vibe gave you a start. There’s more to discover together.</p></div><section class="box" style="max-width:530px"><h2>Your email and more.</h2><p>Save an email for the next chapter of your conversation.</p>${s.actor==='prospect'?`<label class="field">Your email<input id="prospectEmail" type="email" autocomplete="email" value="${esc(s.prospect.email)}" placeholder="you@example.com"></label><div class="row">${button('SAVE & SEE WHAT’S NEXT →','saveEmail()')}</div><p id="emailError" class="error" role="alert"></p>`:`<p>${s.prospect.email?'Email provided for this preview.':'Waiting for their email.'}</p>${button('SEE WHAT’S NEXT →','showTests()')}`}</section>`;
if(s.view==='tests')html=`<div class="hero"><div class="eyebrow">GO DEEPER TOGETHER</div><h1>Choose what to explore next.</h1><p>Optional games, whenever you both feel like it.</p></div><section class="box">${renderDiscoveryPanel(chatSelection())||'<p>Open an active Vibe connection from My Page to explore games.</p>'}<div class="row">${button('BACK TO MY PAGE →','goHome()','light')}</div></section>`;
if(s.notice)html=`<div class="notice" role="status"${ownsTransientNotice(transientNotice)?` data-notice-version="${transientNotice.version}"`:''}>${esc(s.notice)}</div>`+html;
$('root').innerHTML=html;if(!preserveModal||renderedModalState!==s||renderedModalVersion!==modalVersion||s.modal==='outgoing')renderModal();syncDiscoveryUI();syncRewardUI();syncWildcardUI();syncDateUI();syncMemberProfileUI();restoreMemberProfileFocus(profileFocus);if(menuFocus)restoreConnectionMenuFocus(menuFocus);else if(disclosureFocus&&!s.modal)document.querySelector(`[data-dashboard-disclosure="${disclosureFocus}"] > summary`)?.focus({preventScroll:true});else if(gamePieceFocus&&!s.modal&&s.view==='dashboard'&&gamePieceFocus.account===activeMemberId()){const target=gamePieceFocus.id?$(gamePieceFocus.id):[...document.querySelectorAll('.socialMemberAction button,[data-reward-level]')].find(button=>button.getAttribute('onclick')===gamePieceFocus.action);if(target&&!target.disabled)target.focus({preventScroll:true})}}
function navigate(view,actor){interactionVersion++;if(s.modal)changeModal('');s.view=view;if(actor)s.actor=actor;s.pick=null;setNotice('');s.secretsFor='';render();window.scrollTo(0,0)}
function goHome(){if(s.friendToken&&hasMember()){navigate('friendInvite');return}if(s.friends.length||s.friendAcceptedId){s.memberQuestionsOpen=false;navigate('dashboard');return}if(s.actor==='member'&&!s.memberId&&!s.liveMember&&!s.liveInvite){cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;s.joinStep=1;navigate('landing','member');return}if(s.phase==='memberNextFive'){s.phase=s.resumePhase||'firstResults';s.creatingVibe=false;}if(s.actor==='prospect'&&s.prospectId){navigate('dashboard','prospect');return}if(s.actor==='prospect'&&!s.liveInvite){navigate('dashboard','prospect');return}if(s.liveInvite){navigate(['request','chat','secondFive','secondResults','email','tests','declined','ended'].includes(s.phase)?'dashboard':s.prospect.answers.length>=5?'results':'invitee','prospect');return}navigate(hasMember()||s.member.answers.length?'dashboard':'landing','member')}
let pendingIdentity=null;
function identityRequest(){return {state:s,account:activeMemberId(),view:s.view,step:s.joinStep,token:s.friendToken,interactionVersion}}
const currentIdentity=request=>s===request.state&&activeMemberId()===request.account&&s.view===request.view&&s.joinStep===request.step&&s.friendToken===request.token&&interactionVersion===request.interactionVersion;
function nextJoinStep(){if(pendingIdentity&&currentIdentity(pendingIdentity))return;const n=$('joinName').value.trim(),c=$('joinContact').value.trim().toLowerCase();if(!n||!validContact(c)){$('joinError').textContent=CELL_ENABLED?'Enter your name and an email or ten-digit cell number.':'Enter your first name and email.';return}if(!$('joinAgree').checked){$('joinError').textContent='Confirm you’re 18 or older and agree to the Terms and Privacy Policy.';return}s.member.name=n;s.member.contact=c;s.member.agreed=true;const request=identityRequest();pendingIdentity=request;sendCode(c,'joinError').then(ok=>{if(ok&&currentIdentity(request)){s.signinEmail=c;s.joinStep='joinCode';render();$('signinCode')?.focus()}}).finally(()=>{if(pendingIdentity===request)pendingIdentity=null})}
function backToDetails(){cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;s.joinStep=1;render()}
let cameraStream=null;
async function openCamera(){
 const error=$(s.view==='request'?'requestError':s.view==='revealPhoto'?'revealPhotoError':'joinError');error.textContent='';
 if(!navigator.mediaDevices?.getUserMedia){error.textContent='No camera is available in this browser. Use CHOOSE FILE PHOTO.';return}
 try{
  cameraStream?.getTracks().forEach(t=>t.stop());
  cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
  const video=$('cameraPreview');video.srcObject=cameraStream;video.hidden=false;$('captureBtn').hidden=false;
  await video.play();
 }catch(e){cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;const video=$('cameraPreview');if(video){video.srcObject=null;video.hidden=true}const capture=$('captureBtn');if(capture)capture.hidden=true;error.textContent=e.name==='NotAllowedError'?'Camera access was blocked. Allow camera access in your browser, or use CHOOSE FILE PHOTO.':'No camera was found. Use CHOOSE FILE PHOTO.'}
}
async function captureCamera(){
 const video=$('cameraPreview');if(!video?.videoWidth){$(s.view==='request'?'requestError':s.view==='revealPhoto'?'revealPhotoError':'joinError').textContent='Wait for the camera, then capture your picture.';return}
 const canvas=$('cameraCanvas'),side=Math.min(video.videoWidth,video.videoHeight);canvas.width=canvas.height=320;
 canvas.getContext('2d').drawImage(video,(video.videoWidth-side)/2,(video.videoHeight-side)/2,side,side,0,0,320,320);
 const picture=canvas.toDataURL('image/jpeg',.78);if(s.view==='landing')s.member.photo=picture;else s.prospect.photo=picture;
 cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;
 video.srcObject=null;video.hidden=true;$('captureBtn').hidden=true;
 if(s.view==='landing')finishRegistration();
 else if(s.view==='revealPhoto')render();
 else{const n=$('prospectName').value,c=$('prospectContact').value;render();$('prospectName').value=n;$('prospectContact').value=c}
 save();
}
async function uploadPhoto(event,actor){
 const file=event.target.files?.[0];if(!file)return;
 const target=actor==='member'?'joinError':s.view==='revealPhoto'?'revealPhotoError':'requestError';
 if(!file.type.startsWith('image/')){$(target).textContent='Choose an image file.';return}
 try{
  const data=await new Promise((resolve,reject)=>{
   const img=new Image(),url=URL.createObjectURL(file);
   img.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=canvas.height=320;const side=Math.min(img.width,img.height);canvas.getContext('2d').drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,320,320);resolve(canvas.toDataURL('image/jpeg',.78))}catch(e){reject(e)}finally{URL.revokeObjectURL(url)}};
   img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Could not open this picture.'))};img.src=url;
  });
  if(actor==='member')s.member.photo=data;else s.prospect.photo=data;
  if(actor==='member'){cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;const v=$('cameraPreview');if(v){v.srcObject=null;v.hidden=true}$(target).textContent='';finishRegistration()}
  else if(s.view==='revealPhoto'){render()}else{cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;const n=$('prospectName').value,c=$('prospectContact').value;render();$('prospectName').value=n;$('prospectContact').value=c}
  save();
 }catch(e){$(target).textContent=e.message||'Could not open this picture.'}
}
async function finishRegistration(){if(pendingIdentity&&currentIdentity(pendingIdentity))return;if(!s.member.name||!s.member.contact||!s.member.photo){$('joinError').textContent='Complete your details and picture to continue.';return}const request=identityRequest();pendingIdentity=request;try{const registered=await memberApi({action:'register',...s.member});if(!currentIdentity(request))return;s.memberId=registered.member.id;s.member={...s.member,name:registered.member.name,photo:registered.member.photo,contact:registered.member.contact,verified:registered.member.verified,answers:Array.isArray(registered.member.answers)?[...registered.member.answers]:s.member.answers};s.account={...registered.member};if(s.pendingVibeToken){await openEmailInvitation(s.pendingVibeToken);return}if(s.friendVibeState){restoreFriendVibe(registered.member);navigate('friendInvite','prospect');await openFriendInvitation(s.friendToken);save();return}changeModal('');s.memberQuestionsOpen=!s.friendToken&&s.member.answers.length<5;s.phase=s.member.answers.length>=5?'ready':'registration';if(s.friendToken){s.liveMember=true;navigate('friendInvite','member');await openFriendInvitation(s.friendToken)}else navigate('dashboard','member');save()}catch(e){if(currentIdentity(request)&&$('joinError'))$('joinError').textContent=e.message}finally{if(pendingIdentity===request)pendingIdentity=null}}
function enterGame(){changeModal('');navigate('dashboard','member')}
function startMemberQuestions(){s.actor='member';s.view='dashboard';s.memberQuestionsOpen=true;s.pick=null;render();$('memberQuestion')?.scrollIntoView({behavior:'smooth',block:'nearest'})}
function pick(i){s.pick=i;document.querySelectorAll('.option').forEach((el,j)=>{el.classList.toggle('on',j===i);el.setAttribute('aria-pressed',j===i)})}
let answering=false,quickLockUntil=0;
function quickChoices(offset,answers){
 const index=answers.length,q=QUESTIONS[index],step=index-offset;
 if(!q||step>=5)return `<section class="box"><p>Your five are saved.</p>${button('MY PAGE','goHome()')}</section>`;
 return `<section class="box quickChoices"><div class="quickIdentity">${face(s.actor)}<span>${offset?'FIVE MORE':'YOUR FIRST FIVE'}</span></div><div class="progress quickDots" aria-label="Secret ${step+1} of 5">${Array.from({length:5},(_,i)=>`<span class="${i<=step?'done':''}"></span>`).join('')}</div><div class="question" tabindex="-1"><small>${esc(q.topic)}</small><h2>${esc(q.q)}</h2>${q.a.map((a,i)=>`<button type="button" class="option" onclick="chooseQuick(${i},${index})">${esc(a)}</button>`).join('')}</div>${step?button('← BACK','backQuick()','light'):''}<p class="quickHint">Tap your choice. ${offset?'Both sets stay hidden until you both finish.':'Your secrets stay hidden until you both reveal.'}</p><p id="answerError" class="error" role="alert"></p></section>`;
}
function renderVibeReady(){return `<section class="box vibeReady">${face('member','large')}<h1>Your Instant Vibe<br>is ready.</h1><p>Five secrets. One introduction.</p>${button('SHOW MY INSTANT VIBE →','openInvite()')}${button('Share with a friend','openFriendShare()','light friendShareButton')}<button class="link" type="button" onclick="inviteMode('send')">Send an email invitation instead</button><button class="link" type="button" onclick="reviseLastChoice()">← Change my last choice</button></section>`}
async function chooseQuick(choice,index){const arr=s.actor==='member'?s.member.answers:s.prospect.answers;if(answering||Date.now()<quickLockUntil||arr.length!==index)return;quickLockUntil=Date.now()+350;pick(choice);await answerQuestion();document.querySelector('.question')?.focus()}
function backQuick(){if(answering)return;const arr=s.actor==='member'?s.member.answers:s.prospect.answers,minimum=['secondFive','memberNextFive'].includes(s.phase)?5:0;if(arr.length<=minimum)return;arr.pop();if(s.account)s.account.answers=[...arr];s.pick=null;quickLockUntil=Date.now()+350;render()}
function reviseLastChoice(){if(s.member.answers.length!==5)return;s.member.answers.pop();if(s.account)s.account.answers=[...s.member.answers];s.memberQuestionsOpen=true;s.phase='registration';render()}
async function finishSecond(){
 const mine=s.actor==='member'?s.member.answers:s.prospect.answers,data=await connectionApi({action:'second',...connectionRef(),answers:mine});
 s.pairOwnAnswers=[...mine];s.phase=data.status||'secondResults';s.memberSecondDone=data.memberSecondDone;s.prospectSecondDone=data.prospectSecondDone;
 if(s.actor==='member')s.prospect.answers=data.answers||s.prospect.answers;else s.member.answers=data.answers||s.member.answers;
 syncSelectedStatus();if(s.liveMember)await refreshLive();
 if(s.phase==='secondResults'){s.revealOffset=5;navigate('results',s.actor)}else navigate('dashboard',s.actor);
}
async function answerQuestion(){
 if(answering)return;if(s.pick===null){$('answerError').textContent='Pick one answer to continue.';return}
 answering=true;
 const member=s.actor==='member',arr=member?s.member.answers:s.prospect.answers,choice=s.pick,second=s.phase==='secondFive';
 arr.push(choice);s.pick=null;if(s.account)s.account.answers=[...arr];
 try{
  if(second&&arr.length===10){await memberApi({action:'answers',answers:arr});await finishSecond()}
  else if(member&&arr.length===5){
   if(!s.memberId){const data=await memberApi({action:'register',...s.member});s.memberId=data.member.id;s.account={...data.member}}
   else await memberApi({action:'answers',answers:arr});
   s.memberQuestionsOpen=false;s.phase='ready';navigate('dashboard','member');
  }else if(!member&&arr.length===5){
   if(s.prospectId&&s.prospect.photo){await recordFirstFive();s.phase='firstResults';navigate('results','prospect')}
   else{s.phase='awaitingPhoto';navigate('revealPhoto','prospect')}
  }else render();
 }catch(e){if(second&&arr.length===10){s.view='dashboard';await refreshLive();setNotice(e.message);render();return}arr.pop();if(s.account)s.account.answers=[...arr];s.pick=choice;render();const error=$('answerError');if(error)error.textContent=e.message;else{setNotice(e.message);render()}}finally{answering=false}
}
let qrPending=null;
const validQrInvite=()=>s.qrInvite&&new Date(s.qrInvite.expiresAt).getTime()>Date.now()+60000;
function openInvite(){if(owner().answers.length<5)return;changeModal('qr');s.qrError='';makeQrInvite()}
function makeQrInvite(background=false){
 if(qrPending)return qrPending;
 s.qrInvite=null;s.qrError='';if(!background&&s.modal==='qr')renderModal();
 qrPending=(async()=>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  try{
   const response=await fetch('/api/qr',{method:'POST',credentials:'same-origin',signal:controller.signal});
   const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Could not make your code.'),{needsVerify:!!data.needsVerify});
   if(!globalThis.ChempatQR?.toString)throw Error('Code display is still loading. Refresh this page and try again.');
   data.svg=await ChempatQR.toString(data.url,{type:'svg',errorCorrectionLevel:'Q',margin:3,width:384,color:{dark:'#173b4c',light:'#ffffff'}});
   s.qrInvite=data;
   if(s.actor==='member'){s.liveMember=true;s.liveId=data.id;s.selectedChempat=data.id;refreshLive()}
   else{s.outgoing.unshift({id:data.id,name:'',status:'invited',channel:'qr',claimed:false});s.selectedChempat=data.id;refreshOutgoing()}
   save();
  }catch(e){s.qrNeedsVerify=!!e.needsVerify;s.qrError=e.needsVerify?'Confirm your email to show your code.':e.name==='AbortError'?'The code is taking too long. Tap NEW CODE to try again.':e.message||'Could not make your code.'}
  finally{clearTimeout(timeout);qrPending=null;if(s.modal==='qr')renderModal()}
  return s.qrInvite;
 })();return qrPending;
}
function updateQrCountdown(){const timer=$('qrTimer');if(!timer||!s.qrInvite)return;const seconds=Math.max(0,Math.ceil((new Date(s.qrInvite.expiresAt).getTime()-Date.now())/1000));timer.textContent=seconds?`Ready for ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'Code expired · make a new one';if(!seconds&&!timer.dataset.expired){timer.dataset.expired='1';renderModal()}}
let modalVersion=0,interactionVersion=0,renderedModalState=null,renderedModalVersion=-1;
function changeModal(modal){if(modal&&currentMemberProfile())stopMemberProfileCamera();closeConnectionMenu();if(modal)dismissActionNotice();if(modal!=='end')endDialogFocus=null;s.modal=modal;modalVersion++}
function invitationRequest(recipient){return {state:s,account:activeMemberId(),modal:s.modal,modalVersion,interactionVersion,view:s.view,actor:s.actor,member:{...owner()},recipient:{...recipient}}}
const currentInvitation=request=>s===request.state&&activeMemberId()===request.account;
const ownsInvitationModal=request=>currentInvitation(request)&&s.modal===request.modal&&modalVersion===request.modalVersion&&interactionVersion===request.interactionVersion&&s.view===request.view;
function closeInvite(e){if(e&&e.target!==e.currentTarget)return;if(s.modal==='gamePiece'){holdGamePiece();return}const endFocus=s.modal==='end'?endDialogFocus:null,dateFocus=s.modal==='datecard'?dateDialog:null,returnAction=s.modal==='datecard'?dateDialog?.returnFocusAction:s.modal==='wildcard'?wildcardDialog?.returnFocusAction:s.modal==='reward'?rewardDialog?.returnFocusAction:s.modal==='discovery'?discoveryDialog?.returnFocusAction:null,focus=s.modal==='datecard'?dateDialog?.returnFocus:s.modal==='wildcard'?wildcardDialog?.returnFocus:s.modal==='reward'?rewardDialog?.returnFocus:s.modal==='discovery'?discoveryDialog?.returnFocus:null;if(s.modal==='verifyEmail')afterVerify=null;changeModal('');renderModal();if(currentMemberProfile())paintMemberProfile();if(dateFocus?.returnSelection){const input=focus?.isConnected?focus:focus?.id?$(focus.id):null;if(input?.setSelectionRange)input.setSelectionRange(dateFocus.returnSelection.start,dateFocus.returnSelection.end)}if(endFocus)restoreConnectionMenuFocus(endFocus);else if(focus?.isConnected)focus.focus();else if(focus?.id&&$(focus.id))$(focus.id).focus();else if(returnAction)[...document.querySelectorAll('#root button')].find(button=>button.getAttribute('onclick')===returnAction)?.focus()}
function inviteMode(m){changeModal(m);renderModal();if(m==='qr'&&!validQrInvite())makeQrInvite()}
function openOutgoing(id){if(!s.outgoing.some(item=>item.id===id))return;s.selectedOutgoing=id;changeModal('outgoing');renderModal();refreshOutgoing()}
function renderOutgoing(){const item=s.outgoing.find(c=>c.id===s.selectedOutgoing);if(!item){changeModal('');$('modalHost').innerHTML='';return}const theirs=item.answers||[],ours=item.ownAnswers?.length>=5?item.ownAnswers:s.prospect.answers,showFive=theirs.length>=5;const status=({invited:'Invitation sent. Their first five are next.',firstResults:'Their first five are in.',request:'They want to connect with you.',chat:'Your Private Chat is open.',secondResults:'Your next five are in.',email:'Email shared.',declined:'Connection passed.',ended:'Connection ended.'})[item.status]||'Your invitation is open.';$('modalHost').innerHTML=`<div class="modalBackdrop" onclick="closeInvite(event)"><section class="modal outgoingModal" role="dialog" aria-modal="true" aria-labelledby="outgoingTitle"><button class="close" type="button" aria-label="Close" onclick="closeInvite()">×</button><div class="eyebrow">YOUR CONNECTION</div><h2 id="outgoingTitle">${esc(first(item.name))}</h2><div class="outgoingFaces"><img src="${pic(s.prospect.photo)}" alt="${esc(name('prospect'))}">${item.photo?`<img src="${pic(item.photo)}" alt="${esc(first(item.name))}">`:`<span class="face">${esc(first(item.name)[0])}</span>`}</div><p>${esc(status)}</p>${showFive?`<details class="outgoingFive"><summary>OUR FIRST FIVE →</summary>${QUESTIONS.slice(0,5).map((q,i)=>`<div><b>${esc(q.topic)}</b><span>You: ${esc(q.a[ours[i]]||'—')}</span><span>${esc(first(item.name))}: ${esc(q.a[theirs[i]]||'—')}</span></div>`).join('')}</details>`:''}${['request','chatRequested'].includes(item.status)?`<div class="row">${button(item.status==='request'?'KEEP GOING →':'OPEN CHAT →',"decideOutgoing('accept')")}${button('PASS',"decideOutgoing('decline')",'light')}</div>`:''}${chatOpen(item.status)?`<div class="outgoingMessages">${(item.messages||[]).map(m=>m.by==='system'?`<p class="chatGameNote"><small>Connection game</small> ${esc(m.text)}</p>`:`<p class="${m.by==='member'?'mine':''}"><b>${esc(m.by==='member'?'You':first(item.name))}</b> ${esc(m.text)}</p>`).join('')}</div><input id="outgoingMessage" class="joinInput" maxlength="500" aria-label="Private message" placeholder="Say something…" onkeydown="if(event.key==='Enter')sendOutgoingMessage()"><div class="row">${button('SEND →','sendOutgoingMessage()','alt')}</div>`:''}<p class="error" id="outgoingError" role="alert"></p></section></div>`}
async function decideOutgoing(decision){const item=s.outgoing.find(c=>c.id===s.selectedOutgoing);if(!item)return;try{await connectionApi({action:'decision',id:item.id,decision});item.status=decision==='accept'?(item.status==='request'?'secondFive':'chat'):'declined';render();await refreshOutgoing()}catch(e){if(gate(e,()=>decideOutgoing(decision)))return;$('outgoingError').textContent=e.message}}
async function sendOutgoingMessage(){const item=s.outgoing.find(c=>c.id===s.selectedOutgoing),field=$('outgoingMessage'),value=field?.value.trim();if(!item||!value)return;try{const data=await connectionApi({action:'message',id:item.id,text:value});item.messages=data.messages;render()}catch(e){if(gate(e,()=>sendOutgoingMessage()))return;$('outgoingError').textContent=e.message}}
let connectionRevision=0,loadingFreezer=null,loadingTrash=null;
function acceptFreezerPage(data){if(!s.freezerExtra?.length)s.freezerCursor=data.freezerCursor||null;const current=new Set((data.connections||[]).map(c=>c.id));s.freezerExtra=(s.freezerExtra||[]).filter(c=>!current.has(c.id))}
async function loadFreezerHistory(){
 if(!s.freezerCursor||loadingFreezer&&currentInvitation(loadingFreezer))return;
 const request={...invitationRequest(),revision:connectionRevision,cursor:s.freezerCursor};loadingFreezer=request;s.freezerError='';render(true);
 try{const response=await fetch(`/api/connection?freezer=1&cursor=${encodeURIComponent(request.cursor)}`,{credentials:'same-origin',cache:'no-store',headers:memberRequestHeaders(request.account)}),data=await response.json();if(!currentInvitation(request)||request.revision!==connectionRevision||loadingFreezer!==request)return;if(!response.ok)throw Error(data.error||'Could not load more history.');const ids=new Set(memberConnections().map(c=>c.id==='first'?s.liveId:c.id));s.freezerExtra.push(...(data.connections||[]).filter(c=>inFreezer(c)&&!ids.has(c.id)));s.freezerCursor=data.freezerCursor||null;save()}
 catch(e){if(currentInvitation(request)&&request.revision===connectionRevision)s.freezerError=e.message}
 finally{if(loadingFreezer===request)loadingFreezer=null;if(currentInvitation(request))render(true)}
}
async function loadTrashHistory(reset=false){
 if(loadingTrash&&currentInvitation(loadingTrash)||!reset&&s.trashLoaded&&!s.trashCursor)return;
 const request={...invitationRequest(),revision:connectionRevision,cursor:reset?null:s.trashCursor};loadingTrash=request;s.trashError='';render(true);
 try{const response=await fetch(`/api/connection?trash=1${request.cursor?`&cursor=${encodeURIComponent(request.cursor)}`:''}`,{credentials:'same-origin',cache:'no-store',headers:memberRequestHeaders(request.account)}),data=await response.json();if(!currentInvitation(request)||request.revision!==connectionRevision||loadingTrash!==request)return;if(!response.ok)throw Error(data.error||'Could not load Trash.');const rows=reset?[]:s.trashRows||[],ids=new Set(rows.map(c=>c.id));s.trashRows=[...rows,...(data.connections||[]).filter(c=>inTrash(c)&&!ids.has(c.id))];s.trashCursor=data.trashCursor||null;s.trashLoaded=true;save()}
 catch(e){if(currentInvitation(request)&&request.revision===connectionRevision)s.trashError=e.message}
 finally{if(loadingTrash===request)loadingTrash=null;if(currentInvitation(request))render(true)}
}
async function refreshOutgoing(){if(!s.liveInvite||!s.prospectId)return;const state=s,account=activeMemberId(),revision=connectionRevision;try{const response=await fetch('/api/connection?inbox=1',{credentials:'same-origin',cache:'no-store',headers:memberRequestHeaders(account)});if(!response.ok)return;const data=await response.json();if(s!==state||activeMemberId()!==account||revision!==connectionRevision)return;const old=JSON.stringify([s.outgoing,s.friends,s.firstConnection,s.freezerCursor,s.received,s.member.name,s.member.photo]);const hidden=!!s.selectedChempat&&!(data.connections||[]).some(c=>c.id===(s.selectedChempat==='first'?s.liveId:s.selectedChempat)&&!inactiveConnection(c));if(hidden){const input=$('message')||$('outgoingMessage');if(input)rememberChatText(input.value)}acceptFreezerPage(data);s.friends=(data.connections||[]).filter(isFriend);s.outgoing=(data.connections||[]).filter(c=>!isFriend(c)&&c.side!=='prospect').map(normalizeConnection);s.received=(data.connections||[]).filter(c=>!isFriend(c)&&c.side==='prospect'&&c.id!==s.liveId);const original=(data.connections||[]).find(c=>c.id===s.liveId&&!isFriend(c)&&c.side==='prospect');s.firstConnectionMissing=!original&&s.phase!=='invited';if(s.firstConnectionMissing&&hidden){s.phase='ended';s.messages=[]}if(original){s.member.name=original.sender_name||original.name||s.member.name;if(typeof original.sender_photo==='string'||typeof original.photo==='string')s.member.photo=original.sender_photo??original.photo;s.firstConnection=connectionHistory(original);if(endedConnection(original)){s.phase=original.status;s.messages=[]}}syncConnectionMenu();if(old!==JSON.stringify([s.outgoing,s.friends,s.firstConnection,s.freezerCursor,s.received,s.member.name,s.member.photo])&&s.view==='dashboard'&&(hidden||document.activeElement?.id!=='outgoingMessage'))render(true);save();return data}catch{}}
function renderModal(){renderedModalState=s;renderedModalVersion=modalVersion;let host=$('modalHost');if(!s.modal){host.innerHTML='';return}if(s.modal==='datecard'){renderDateModal();return}if(s.modal==='gamePiece'){renderGamePieceModal();return}if(s.modal==='wildcard'){renderWildcardModal();return}if(s.modal==='reward'){renderRewardModal();return}if(s.modal==='discovery'){renderDiscoveryModal();return}if(s.modal==='friendShare'){renderFriendShare();return}if(s.modal==='outgoing'){renderOutgoing();return}if(s.modal==='end'){renderEnd();return}if(s.modal==='reinvite'){renderReinvite();return}if(s.modal==='logout'){renderLogout();return}if(s.modal==='verifyEmail'){renderVerifyEmail();return}if(s.modal==='verify'){renderVerify();return}if(s.modal==='welcome'){host.innerHTML=`<div class="modalBackdrop" onclick="closeInvite(event)"><section class="modal welcomeModal" role="dialog" aria-modal="true" aria-labelledby="welcomeTitle"><button class="close" type="button" aria-label="Close" onclick="closeInvite()">×</button><div class="eyebrow">3 · YOUR PAGE</div><div class="welcomeFace">${face('member')}</div><h2 id="welcomeTitle">Ready to play, ${esc(name('member'))}?</h2><p>Your page is next. Answer five quick choices to make it yours, then invite someone into your first five.</p>${button('STEP 3 — OPEN MY PAGE →','enterGame()')}<p class="small">Your page is ready for you.</p></section></div>`;return}host.innerHTML=`<div class="modalBackdrop" onclick="closeInvite(event)"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="inviteTitle"><button class="close" type="button" aria-label="Close invitation" onclick="closeInvite()">×</button><div class="eyebrow">YOUR INVITATION</div><h2 id="inviteTitle">${s.modal==='qr'?`I’ll tell you five secrets about me. Want to see if we vibe?`:'I caught your vibe. Let’s talk.'}</h2>${s.modal==='qr'?`<p>In person? Let them scan now. This code expires in 15 minutes; it is not a sendable link.</p><div class="invitePair"><div>${owner().photo?`<img class="portrait" src="${pic(owner().photo)}" alt="${esc(first(owner().name))}">`:face(s.actor)}<b style="display:block;margin-top:8px">${esc(first(owner().name))}</b></div><div>${s.qrInvite&&new Date(s.qrInvite.expiresAt).getTime()>Date.now()?`<img class="liveQr" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.qrInvite.svg)}" alt="Scan to open ${esc(first(owner().name))}'s invitation"><small id="qrTimer" class="qrTimer" aria-live="off"></small>`:`<div class="qrWaiting">${s.qrError?esc(s.qrError):s.qrInvite?'Code expired.':'Making your code…'}</div>`}</div></div>${s.qrNeedsVerify?button('CONFIRM MY EMAIL →','verifyForQr()'):s.qrInvite&&new Date(s.qrInvite.expiresAt).getTime()<=Date.now()||s.qrError?button('NEW CODE →','makeQrInvite()','alt'):''}<button class="link" type="button" onclick="inviteMode('send')">Send a separate email invitation →</button>`:`<div class="modalForm"><p class="small">Email invitation: send your picture and a separate invitation link to their inbox. This is different from the 15-minute in-person code. We’ll verify your email first.</p><label class="field">Their name<input id="inviteName" autocomplete="given-name" maxlength="50" placeholder="First name"></label><label class="field">Their email<input id="inviteContact" type="email" autocomplete="email" placeholder="them@example.com"></label><div class="row">${button('IN DUH WILD →','prepareInvite()')}${button('INVITE A FRIEND','openFriendShare()','light')}</div><p id="inviteError" class="error" role="alert"></p><button class="link" type="button" onclick="inviteMode('qr')">← Show code instead</button></div>`}</section></div>`;updateQrCountdown()}
async function memberApi(data){const response=await fetch('/api/member',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify(data)});const body=await response.json();if(!response.ok)throw Object.assign(Error(body.error||'Could not save your member page.'),{status:response.status,needsVerify:!!body.needsVerify,exists:!!body.exists});return body}
async function finishProspectRegistration(){
 if(pendingIdentity&&currentIdentity(pendingIdentity))return;
 const error=$('revealPhotoError'),n=$('newMemberName').value.trim(),c=$('newMemberContact').value.trim().toLowerCase(),isEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c),isCell=CELL_ENABLED&&!isEmail&&c.replace(/\D/g,'').length>=10;
 if(!n||(!isEmail&&!isCell)||!s.prospect.photo){error.textContent=CELL_ENABLED?'Add a picture, first name, and email or cell.':'Add a picture, first name, and email.';return}
 if(!$('newMemberAgree').checked){error.textContent='Confirm you’re 18 or older and agree to the Terms and Privacy Policy.';return}
 const request=identityRequest();let account=request.account;const current=()=>s===request.state&&activeMemberId()===account&&s.view===request.view&&interactionVersion===request.interactionVersion;
 pendingIdentity=request;s.prospect.agreed=true;error.textContent='Making your page…';
 try{
  s.prospect.name=n;s.prospect.email=isEmail?c:'';s.prospect.phone=isCell?c:'';
  if(s.liveInvite&&!s.prospectId){
   const registered=await memberApi({action:'register',name:n,contact:c,photo:s.prospect.photo,answers:s.prospect.answers.slice(0,5),agreed:true});if(!current())return;
   s.prospectId=registered.member.id;s.prospectVerified=registered.member.verified;s.prospect={...s.prospect,name:registered.member.name,photo:registered.member.photo,email:registered.member.contact?.includes('@')?registered.member.contact:'',phone:registered.member.contact?.includes('@')?'':registered.member.contact||''};s.account={...registered.member,answers:[...s.prospect.answers]};account=registered.member.id;
   if(!registered.member.verified)sendCode(registered.member.contact,null);
  }else if(!s.liveInvite&&!s.liveMember)throw Error('Open a current invitation to save these answers.');
  await recordFirstFive();if(!current())return;s.phase='firstResults';navigate('results','prospect');
 }catch(e){if(!current())return;if(e.exists){error.textContent='';openVerify(c,()=>finishProspectRegistration(),'That email already has a page. Enter the code we sent to open it.');return}error.textContent=e.message}
 finally{if(pendingIdentity===request)pendingIdentity=null}
}
async function connectionApi(data){const pieceOwner={state:s,account:activeMemberId(),epoch:wildcardEpoch,connectionId:data.id||data.connectionId||s.liveId};const response=await fetch('/api/connection',{method:'POST',headers:{'content-type':'application/json',...memberRequestHeaders(pieceOwner.account)},credentials:'same-origin',body:JSON.stringify(data)});let body;try{body=await response.json()}catch{throw Error('Connection service did not respond.')}if(!response.ok)throw Object.assign(Error(body.error||'Could not update the connection.'),{status:response.status,needsVerify:!!body.needsVerify});if(wildcardOwnerMatches(pieceOwner)){const hydrated=gamePieceConnections.get(pieceOwner.connectionId);if(hydrated)hydrated.revision=(hydrated.revision||0)+1;if(data.action==='decision')completeGamePieces(pieceOwner.connectionId,['continue-request','chat-request']);if(data.action==='request')completeGamePieces(pieceOwner.connectionId,['step-complete'],undefined,1);if(data.action==='second')completeGamePieces(pieceOwner.connectionId,['continue-ready','step-complete'],undefined,2)}return body}
async function emailApi(data){const response=await fetch('/api/email',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify(data)});let body;try{body=await response.json()}catch{throw Error('The email service did not respond.')}if(!response.ok)throw Error(body.error||'Could not send the email.');return body}
let pendingInvite=null,preparingInvite=null,verifyingInvite=null,sendingInvite=null,inviteVerified=false;
const emailInvitationBusy=()=>[preparingInvite,verifyingInvite,sendingInvite].some(request=>request&&currentInvitation(request));
async function prepareInvite(){
 if(s.modal!=='send'||emailInvitationBusy())return;const n=$('inviteName')?.value.trim()||'',c=$('inviteContact')?.value.trim().toLowerCase()||'',error=$('inviteError');
 if(!n||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)){if(error)error.textContent='Enter their name and email.';return}
 pendingInvite={name:n,email:c};inviteVerified=false;const request=invitationRequest(pendingInvite);preparingInvite=request;error.textContent='Checking your email…';
 try{
  const status=await fetch('/api/email',{credentials:'same-origin'}).then(r=>r.json());if(!ownsInvitationModal(request))return;
  if(status.email&&status.email===request.member.contact.trim().toLowerCase())return await sendInvitation(request);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.member.contact)){error.textContent='Your own contact needs to be an email address to send invitations. Update it in your details.';return}
  await emailApi({action:'start',email:request.member.contact});if(ownsInvitationModal(request))renderVerify();
 }catch(e){if(ownsInvitationModal(request))error.textContent=e.message}
 finally{if(preparingInvite===request)preparingInvite=null}
}
function renderVerify(){
 if(s.modal!=='verify')changeModal('verify');renderedModalState=s;renderedModalVersion=modalVersion;const code=$('emailCode')?.value||'',error=$('verifyError')?.textContent||'';
 $('modalHost').innerHTML=`<div class="modalBackdrop" onclick="closeInvite(event)"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="verifyTitle"><button class="close" type="button" aria-label="Close" onclick="closeInvite()">×</button><div class="eyebrow">ONE QUICK CHECK</div><h2 id="verifyTitle">Check your email.</h2><p>Enter the six digit code sent to ${esc(owner().contact)}. Then we’ll send your invitation to ${esc(pendingInvite?.name)}.</p><div class="modalForm"><label class="field">Your code<input id="emailCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" value="${esc(code)}" ${inviteVerified?'disabled':''}></label>${button(inviteVerified?'RETRY SEND →':'VERIFY & SEND →',inviteVerified?'sendInvitation()':'verifyAndSend()')}<p id="verifyError" class="error" role="alert">${esc(error)}</p></div></section></div>`;
}
async function verifyAndSend(){
 if(s.modal!=='verify'||!pendingInvite||emailInvitationBusy())return;const request=invitationRequest(pendingInvite),code=$('emailCode')?.value.trim()||'',error=$('verifyError');verifyingInvite=request;error.textContent='Verifying…';
 try{await emailApi({action:'verify',email:request.member.contact,code});if(!ownsInvitationModal(request))return;inviteVerified=true;renderVerify();await sendInvitation(request)}
 catch(e){if(ownsInvitationModal(request))$('verifyError').textContent=e.message}
 finally{if(verifyingInvite===request)verifyingInvite=null}
}
async function sendInvitation(request){
 if(!request){if(emailInvitationBusy()||!pendingInvite)return;request=invitationRequest(pendingInvite)}
 if(!ownsInvitationModal(request)||!['send','verify'].includes(s.modal)||sendingInvite&&currentInvitation(sendingInvite))return;
 sendingInvite=request;const error=$('verifyError')||$('inviteError');if(error)error.textContent='Sending…';
 try{
  const sent=await emailApi({action:'send',member:request.member,recipient:request.recipient});if(!currentInvitation(request))return;
  if(!ownsInvitationModal(request)){if(!s.liveInvite)s.liveMember=true;await refreshLive(true);return}
  const invitedName=request.recipient.name;
  if(request.actor==='prospect'){s.outgoing.push({id:sent.id,name:invitedName,email:request.recipient.email,status:'invited'});changeModal('');navigate('dashboard','prospect');setNotice(`Invitation sent to ${first(invitedName)}.`);render();refreshOutgoing()}
  else{s.liveMember=true;s.liveId=sent.id;s.prospect.name=invitedName;ensureConnection();changeModal('');navigate('dashboard','member');setNotice(`Invitation sent to ${first(invitedName)}. You’ll see them in Vibe connections.`);render();refreshLive(true)}
 }catch(e){if(ownsInvitationModal(request)){const currentError=$('verifyError')||$('inviteError');if(currentError)currentError.textContent=e.message}}
 finally{if(sendingInvite===request)sendingInvite=null}
}
let openingVibe=0;
function renderInvitationAuth(){return `<section class="box friendInvitation"><div class="eyebrow">A VIBE INVITATION</div><h1>Open your invitation.</h1><p>${esc(s.invitationAuthError||'Sign in with the account this invitation was sent to. You can use your existing page, photo, and saved answers.')}</p><div class="row">${s.invitationRetry?button('TRY INVITATION AGAIN','openEmailInvitation()'):button(hasMember()?'SIGN IN WITH ANOTHER ACCOUNT':'SIGN IN','showSignin()')}${!s.invitationRetry&&!hasMember()?button('CREATE A PAGE','startFresh()','light'):''}</div><button type="button" class="link" onclick="dismissVibeInvitation()">${hasMember()?'Not now · My page':'Not now'}</button></section>`}
function dismissVibeInvitation(){openingVibe++;s.pendingVibeToken='';s.invitationAuthError='';if(hasMember())navigate('dashboard');else navigate('landing','member')}
async function openEmailInvitation(token=s.pendingVibeToken||invitationToken){
 if(!token)return;s.pendingVibeToken=token;save();const request={state:s,account:activeMemberId(),version:++openingVibe,interactionVersion},current=()=>s===request.state&&activeMemberId()===request.account&&openingVibe===request.version&&interactionVersion===request.interactionVersion&&s.pendingVibeToken===token;
 try{
  const response=await fetch(`/api/connection?invite=${encodeURIComponent(token)}`,{credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',headers:memberRequestHeaders(request.account)}),data=await response.json();if(!current())return;
  if(data.requiresSignIn||response.status===403){s.invitationRetry=false;s.view='inviteAuth';s.invitationAuthError=response.status===403?'This invitation is for a different account. Sign in with the account it was sent to.':'Sign in with the account this invitation was sent to, or create your page with the invited email. Your existing page, photo, and saved answers can be used.';render();return}
  if(!response.ok)throw Error(data.error||'Invitation unavailable.');
  let own=null;try{const res=await fetch('/api/member',{credentials:'same-origin',cache:'no-store'});if(res.ok)own=(await res.json()).member}catch{}if(!current())return;
  s=blank();s.member.name=data.name;s.member.photo=data.photo;s.member.answers=data.answers;
  s.liveInvite=true;s.liveToken=token;s.liveId=data.id;s.invitedAt=data.invitedAt;s.firstConnection=connectionHistory(data);
  s.prospect.name=own?.name||data.prospectName||data.recipientName||'';
  s.prospect.photo=own?.photo||data.prospectPhoto||'';
  s.prospect.answers=data.prospectAnswers?.length?data.prospectAnswers:own?.answers||[];
  s.prospect.phone=own?.contact&&!own.contact.includes('@')?own.contact:data.prospectPhone||'';
  s.prospect.email=own?.contact?.includes('@')?own.contact:data.prospectEmail||'';
  s.memberSecondDone=data.memberSecondDone;s.prospectSecondDone=data.prospectSecondDone;s.pairOwnAnswers=data.prospectAnswers;s.prospect.agreed=!!own;s.prospectId=own?.id||'';s.prospectVerified=own?own.verified:null;s.messages=data.messages||[];s.actor='prospect';s.phase=data.status;
  s.view=data.status==='invited'?'invitee':['request','declined','chat','ended','secondFive','chatRequested'].includes(data.status)?'dashboard':data.status==='secondResults'?'results':data.status==='email'?'tests':data.status==='firstResults'?'results':'invitee';
  render();if(s.prospectId)refreshOutgoing();
 }catch(e){if(!current())return;s.invitationRetry=true;s.invitationAuthError=e.message;s.view='inviteAuth';render()}
}
async function recordFirstFive(){if(s.liveInvite||s.liveMember){const request={state:s,account:activeMemberId(),liveId:s.liveId,token:s.liveToken,interactionVersion,answers:s.prospect.answers.slice(0,5)};const data=await connectionApi({action:'first',...connectionRef(),answers:request.answers,photo:s.prospect.photo});if(s!==request.state||activeMemberId()!==request.account||s.liveId!==request.liveId||s.liveToken!==request.token||interactionVersion!==request.interactionVersion)return;s.member.answers=data.answers;s.pairOwnAnswers=request.answers}}
function applyConnection(c){
 if(isFriend(c))return;
 if(!s.account)s.account={...owner(),id:s.memberId||s.prospectId};
 if(c.side==='prospect'){
  s.actor='prospect';s.prospect={...s.account,email:s.account.contact?.includes('@')?s.account.contact:'',phone:'',answers:[...(s.account.answers?.length>=5?s.account.answers:c.prospect_answers||[])]};s.prospectId=s.account.id;s.prospectVerified=s.account.verified;
  s.member={name:c.sender_name||c.name,photo:c.sender_photo||c.photo,answers:c.sender_answers||c.answers||[]};
 }else{
  s.actor='member';s.member={...s.account};s.memberId=s.account.id;
  s.prospect={name:c.prospect_name||c.recipient_name||'',photo:c.prospect_photo||'',answers:c.prospect_answers||[],phone:c.prospect_phone||'',email:c.prospect_email||''};
 }
 s.messages=c.messages||[];s.phase=c.status;s.memberSecondDone=c.memberSecondDone;s.prospectSecondDone=c.prospectSecondDone;s.pairOwnAnswers=c.own_answers;
}
function selectLiveConnection(id){const friend=memberConnections().find(c=>c.id===id&&isFriend(c));if(friend){s.selectedChempat=id;navigate('dashboard');return}const c=s.inbox.find(item=>item.id===id);if(!c||inactiveConnection(c))return;s.liveId=id;s.selectedChempat=id;applyConnection(c);if(['firstResults','secondResults'].includes(c.status))navigate('results',s.actor);else if(chatOpen(c.status))navigate('conversation',s.actor);else navigate('dashboard',s.actor)}
let refreshing=null;
async function refreshLive(afterCurrent=false){const state=s,account=activeMemberId(),revision=connectionRevision;if(refreshing){if(!afterCurrent)return;await refreshing;if(s!==state)return;return refreshLive(true)}if(document.hidden||(!s.liveMember&&!s.liveInvite))return;let finish;refreshing=new Promise(resolve=>{finish=resolve});try{
 if(s.liveMember){const response=await fetch('/api/connection?inbox=1',{credentials:'same-origin',cache:'no-store',headers:memberRequestHeaders(account)}),data=await response.json();if(s!==state||activeMemberId()!==account||revision!==connectionRevision)return;if(data.sessionExpired){const email=s.account?.contact||owner().contact||'';chatDrafts.clear();s={...blank(),...friendContext()};s.signinEmail=email;s.joinStep='signin';render();$('joinError').textContent=data.error;return}if(!response.ok)throw Error(data.error);const before=JSON.stringify([s.inbox,s.friends,s.freezerCursor]),previous=s.phase,hidden=!!s.selectedChempat&&!(data.connections||[]).some(c=>c.id===s.selectedChempat&&!inactiveConnection(c));if(hidden){const input=$('message')||$('outgoingMessage');if(input)rememberChatText(input.value)}acceptFreezerPage(data);s.friends=(data.connections||[]).filter(isFriend);s.inbox=(data.connections||[]).filter(c=>!isFriend(c));if(!s.liveId&&s.inbox.length)s.liveId=s.inbox[0].id;const selected=s.inbox.find(c=>c.id===s.liveId);if(selected&&s.view!=='questions')applyConnection(selected);syncConnectionMenu();if(before!==JSON.stringify([s.inbox,s.friends,s.freezerCursor])&&['dashboard','conversation','request','results'].includes(s.view)&&(hidden||document.activeElement?.id!=='message'))render(true);if(previous!=='request'&&s.phase==='request'&&s.view==='dashboard')render(true)}
 else{const response=await fetch(`/api/connection?invite=${encodeURIComponent(s.liveToken)}`,{credentials:'same-origin',cache:'no-store',headers:memberRequestHeaders(account)}),data=await response.json();if(s!==state||activeMemberId()!==account||revision!==connectionRevision)return;if(!response.ok&&s.prospectId){const inbox=await refreshOutgoing();if(s!==state||activeMemberId()!==account||revision!==connectionRevision)return;if(inbox){s.account={...owner(),id:activeMemberId()};s.member={...s.account};s.memberId=s.account.id;s.liveMember=true;s.liveInvite=false;s.liveToken='';s.actor='member';s.inbox=(inbox.connections||[]).filter(c=>!isFriend(c));s.view='dashboard';render(true);return}}if(!response.ok)throw Error(data.error);const previous=s.phase,oldMessages=JSON.stringify(s.messages),oldIdentity=JSON.stringify([s.member.name,s.member.photo]);s.member.name=data.name||s.member.name;if(typeof data.photo==='string')s.member.photo=data.photo;s.liveId=data.id||s.liveId;s.invitedAt=data.invitedAt;if('freezerAction' in data)s.firstConnection=connectionHistory(data);s.member.answers=data.answers;s.memberSecondDone=data.memberSecondDone;s.prospectSecondDone=data.prospectSecondDone;s.pairOwnAnswers=data.prospectAnswers;s.messages=data.messages||[];if(data.prospectAnswers?.length>s.prospect.answers.length)s.prospect.answers=data.prospectAnswers;if(!(s.view==='questions'&&s.prospect.answers.length>=5))s.phase=data.status;syncConnectionMenu();if(previous!==s.phase&&s.view==='dashboard')render(true);else if(['conversation','dashboard'].includes(s.view)&&(oldMessages!==JSON.stringify(s.messages)||oldIdentity!==JSON.stringify([s.member.name,s.member.photo]))&&document.activeElement?.id!=='message')render(true);await refreshOutgoing()}
 save()
 }catch(e){if(s!==state||activeMemberId()!==account||revision!==connectionRevision)return;if(['Invitation not found.','Verify your email to see connections.'].includes(e.message)){s=blank();render()}else{setNotice(e.message);render(true)}}finally{refreshing=null;finish();maybePresentGamePiece()}}
async function startProspect(){if(s.prospect.answers.length>=5){if(s.prospectId&&s.prospect.photo){try{await recordFirstFive();s.phase='firstResults';navigate('results','prospect')}catch(e){setNotice(e.message);render()}}else navigate('revealPhoto','prospect');return}s.actor='prospect';s.view='invitee';s.prospectQuestionsOpen=true;s.pick=null;render();$('prospectQuestion')?.scrollIntoView({behavior:'smooth',block:'nearest'})}
function showRequest(){ensureConnection();navigate('request','prospect')}
function backToFirstResults(){s.revealOffset=0;navigate('results','prospect')}
async function sendRequest(){const n=s.prospect.name,c=s.prospect.email||s.prospect.phone;try{if(s.liveInvite||s.liveMember)await connectionApi({action:'request',...connectionRef(),name:n,contact:c,photo:s.prospect.photo});s.phase='request';syncSelectedStatus();navigate('dashboard','prospect')}catch(e){if(gate(e,()=>sendRequest()))return;$('requestError').textContent=e.message}}
function syncSelectedStatus(){const item=s.inbox.find(c=>c.id===s.liveId)||hydratedConnectionRow(s.liveId);if(item)item.status=s.phase}
async function acceptRequest(){if(!['request','chatRequested'].includes(s.phase))return;try{const next=s.phase==='request'?'secondFive':'chat';if(s.liveMember)await connectionApi({action:'decision',id:s.liveId,decision:'accept'});s.phase=next;syncSelectedStatus();navigate('dashboard','member')}catch(e){if(gate(e,()=>acceptRequest()))return;setNotice(e.message);render()}}
async function requestChat(){if(s.phase!=='secondResults')return;try{if(s.liveInvite||s.liveMember)await connectionApi({action:'chat',...connectionRef()});s.phase='chatRequested';syncSelectedStatus();navigate('dashboard','prospect')}catch(e){if(gate(e,()=>requestChat()))return;setNotice(e.message);render()}}
async function declineRequest(){try{if(s.liveMember)await connectionApi({action:'decision',id:s.liveId,decision:'decline'});s.phase='declined';const item=s.inbox.find(c=>c.id===s.liveId)||hydratedConnectionRow(s.liveId);if(item)item.status='declined';render()}catch(e){setNotice(e.message);render()}}
function openConversation(){if(chatOpen(s.phase))navigate('conversation',s.actor)}
function connectionStatus(){return ({awaitingPhoto:'Five answered · photo pending',firstResults:'First five revealed',request:'Connection request · Your move',chat:'Chat open · Next five ready',secondFive:'Next five in progress',secondResults:'Next five revealed',email:'Email stage',tests:'More secrets ahead',declined:'Request passed'})[s.phase]||'Invitation open'}
function chatSelection(){const c=memberConnections().find(item=>item.id===s.selectedChempat);if(!c||inactiveConnection(c)||!chatOpen(c.status))return null;return c}
function chatRequest(c){return c.id==='first'?connectionRef():{id:c.id}}
function updateChatMessages(c,messages){connectionRevision++;const id=rewardRealId(c);for(const cache of [gamePieceConnections,wildcardConnections]){const entry=cache.get(id);if(entry){entry.row.messages=messages;entry.revision=(entry.revision||0)+1}}if(isFriend(c)){const item=(s.friends||[]).find(item=>item.id===c.id)||s.inbox.find(item=>item.id===c.id)||hydratedConnectionRow(c.id);if(item)item.messages=messages}else if(s.liveMember){const item=s.inbox.find(item=>item.id===c.id)||hydratedConnectionRow(c.id);if(item)item.messages=messages;if(s.liveId===c.id)s.messages=messages}else if(s.actor==='prospect'&&c.id==='first')s.messages=messages;else if(s.actor==='prospect'){const item=s.outgoing.find(item=>item.id===c.id);if(item)item.messages=messages}else{const item=s.inbox.find(item=>item.id===c.id)||hydratedConnectionRow(c.id);if(item)item.messages=messages;if(s.liveId===c.id)s.messages=messages}render()}
async function reactChat(index,reaction){const c=chatSelection();if(!c)return;const mine=c.side==='received'?'prospect':'member',current=c.messages[index]?.reactions?.[mine];try{const data=await connectionApi({action:'react',...chatRequest(c),index:c.messages[index]?.messageIndex??index,reaction:current===reaction?null:reaction});updateChatMessages(c,data.messages)}catch(e){const error=$('chatError');if(error)error.textContent=e.message}}
const chatDrafts=new Map(),sendingChats=new Set();
const chatDraftKey=c=>`${s.account?.id||(s.actor==='prospect'?s.prospectId:s.memberId)}:${c.id}`;
function rememberChatText(value){const c=chatSelection();if(!c)return;const key=chatDraftKey(c),draft=chatDrafts.get(key)||{};draft.text=value;chatDrafts.set(key,draft)}
function removeChatPhoto(){const c=chatSelection();if(!c)return;const key=chatDraftKey(c),text=$('message')?.value??$('outgoingMessage')?.value??chatDrafts.get(key)?.text??'';chatDrafts.set(key,{text});render()}
function chatComposer(c){const key=chatDraftKey(c),draft=chatDrafts.get(key)||{},outgoing=c.side==='sent'&&s.actor==='prospect'&&!s.liveMember;return `${draft.photo?`<figure class="chatDraft"><img src="${pic(draft.photo)}" alt="Photo ready to send"><figcaption>Photo ready to send <button type="button" onclick="removeChatPhoto()">Remove photo</button></figcaption></figure>`:''}<div class="inlineComposer" aria-busy="${!!draft.photoRequest}"><label class="chatUpload" for="chatPhotoInput">Photo<input id="chatPhotoInput" type="file" aria-label="Add a photo" aria-describedby="chatError" data-chat-key="${esc(key)}" accept="image/jpeg,image/png,image/webp" onchange="sendChatPhoto(event)"></label><input id="${outgoing?'outgoingMessage':'message'}" maxlength="500" aria-label="Message ${esc(c.name)}" placeholder="Message ${esc(c.name)}…" value="${esc(draft.text||'')}" oninput="rememberChatText(this.value)" onkeydown="if(event.key==='Enter')sendMessage()"><button type="button" onclick="sendMessage()" ${draft.photoRequest?'disabled':''}>SEND →</button></div><p class="chatError error" id="chatError" role="alert">${esc(draft.photoRequest?'Preparing photo…':draft.photoError||'')}</p>`}
async function sendChatPhoto(event){
 const input=event.currentTarget||event.target,c=chatSelection(),file=input.files?.[0],key=input.dataset?.chatKey||(c?chatDraftKey(c):'');if(!key||!file)return;
 input.value=''; // Re-selecting the same file must fire change after an error or removal.
 const selected=()=>chatSelection()&&chatDraftKey(chatSelection())===key;
 const draft=chatDrafts.get(key)||{};if(selected())draft.text=$('message')?.value??$('outgoingMessage')?.value??draft.text??'';chatDrafts.set(key,draft);
 const request={};draft.photoRequest=request;draft.photoError='';
 const finish=error=>{if(chatDrafts.get(key)!==draft||draft.photoRequest!==request)return;delete draft.photoRequest;draft.photoError=error||'';if(selected())render()};
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)){finish('Choose an image in JPEG, PNG, or WebP format.');return}
 if(file.size>10*1024*1024){finish('Choose a photo under 10 MB.');return}
 if(selected())render();
 try{const photo=await new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{try{if(!img.width||!img.height||img.width*img.height>40000000)throw Error('Choose a smaller photo.');const canvas=document.createElement('canvas'),scale=Math.min(1,720/Math.max(img.width,img.height));canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);let data;for(const quality of [.78,.6,.42]){data=canvas.toDataURL('image/jpeg',quality);if(data.length<200000)break}if(data.length>=250000)throw Error('This photo is too large. Choose a smaller image.');resolve(data)}catch(e){reject(e)}finally{URL.revokeObjectURL(url)}};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Could not open this photo.'))};img.src=url});
 if(chatDrafts.get(key)!==draft||draft.photoRequest!==request)return;draft.photo=photo;finish();
 }catch(e){finish(e.message||'Could not prepare this photo.')}
}
async function sendMessage(){
 const c=chatSelection();if(!c)return;const key=chatDraftKey(c),draft=chatDrafts.get(key)||{},text=($('message')?.value??$('outgoingMessage')?.value??draft.text??'').trim(),photo=draft.photo;
 if((!text&&!photo)||draft.photoRequest||sendingChats.has(key))return;sendingChats.add(key);
 try{const data=await connectionApi({action:'message',...chatRequest(c),text,...(photo?{photo}:{})});const current=chatDrafts.get(key);if(current){if((current.text||'').trim()===text)current.text='';if(current.photo===photo)current.photo=null;if(!current.text&&!current.photo&&!current.photoRequest)chatDrafts.delete(key)}updateChatMessages(c,data.messages)}catch(e){if(gate(e,()=>sendMessage()))return;const error=$('chatError');if(error)error.textContent=e.message;else{setNotice(e.message);render()}}finally{sendingChats.delete(key)}
}
async function startSecondFive(){
 let chosen=memberConnections().find(c=>c.id===s.selectedChempat);
 if(chosen?.side==='sent'&&s.liveInvite&&!s.liveMember){
  const account={...owner(),id:s.prospectId,verified:s.prospectVerified};s.account=account;s.member={...account};s.memberId=account.id;s.liveMember=true;s.liveInvite=false;s.liveToken='';s.actor='member';s.liveId=chosen.id;await refreshLive();chosen=memberConnections().find(c=>c.id===s.liveId);
 }
 if(!['secondFive','chat'].includes(s.phase))return;
 const mine=s.actor==='member'?s.member:s.prospect,stored=chosen?.ownAnswers||s.pairOwnAnswers;
 if(stored?.length===10||stored?.length===5&&mine.answers.slice(0,5).some((v,i)=>v!==stored[i]))mine.answers=[...stored];
 if(mine.answers.length===10){try{await memberApi({action:'answers',answers:mine.answers});await finishSecond()}catch(e){if(gate(e,()=>startSecondFive()))return;setNotice(e.message);render()}return}
 s.phase='secondFive';navigate('questions',s.actor);
}
function createMyVibe(){s.secretsFor='';if(owner().answers.length>=5){openInvite();return}if(s.actor==='member'){s.memberQuestionsOpen=true;navigate('dashboard','member');return}startProspect()}
function startMyNextFive(){if(s.prospect.answers.length>=10)return;s.resumePhase=s.phase;s.phase='memberNextFive';s.creatingVibe=true;navigate('questions','prospect')}
function showSecondResults(){const c=memberConnections().find(item=>item.id===s.selectedChempat);if(s.liveInvite&&!s.liveMember&&c?.side==='sent'){s.view='dashboard';selectChempat(c.id,true);return}s.revealOffset=5;navigate('results',s.actor)}
function continueAfterSecond(){if(chatOpen(s.phase))navigate('email',s.actor)}
async function saveEmail(){let v=$('prospectEmail').value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)){$('emailError').textContent='Enter a valid email address.';return}try{if(s.liveInvite||s.liveMember)await connectionApi({action:'email',...connectionRef(),email:v});s.prospect.email=v;showTests()}catch(e){if(gate(e,()=>saveEmail()))return;$('emailError').textContent=e.message}}
function showTests(){s.phase='tests';navigate('tests',s.actor)}
// Freezer ends contact. Trash and Restore change only the owner's history list.
const REPORT_REASONS=[['harassment','Harassment or threats'],['fake','Fake profile or impersonation'],['inappropriate','Inappropriate photo or messages'],['safety','Made me feel unsafe'],['underage','May be under 18'],['other','Something else']];
const endingConnections=new Map();
function allowedConnectionAction(c,kind){if(!c)return false;return ({cancel:!inactiveConnection(c)&&c.status==='invited'&&c.canCancel===true,freeze:!inTrash(c)&&!endedConnection(c)&&(!inFreezer(c)||c.canFreeze),trash:inFreezer(c)&&c.canTrash,restore:inTrash(c)&&c.canRestore,reinvite:inFreezer(c)&&c.canReinvite&&!c.blockedByMe,block:!inTrash(c)&&c.canBlock&&!c.blockedByMe,unblock:inFreezer(c)&&c.canUnblock&&c.blockedByMe,report:!inTrash(c)&&c.canReport})[kind]===true}
function activeConnectionControls(c){return `<div class="activeConnectionActions">${connectionMenu(c)}</div>`}
function openEnd(id,kind){const c=memberConnections().find(item=>item.id===id);if(!allowedConnectionAction(c,kind))return;const input=$('message')||$('outgoingMessage');if(input)rememberChatText(input.value);endDialogFocus=null;s.endTarget={id,kind};changeModal('end');renderModal()}
function endActionKey(id){return `${activeMemberId()}:${id}`}
function renderEnd(){
 const t=s.endTarget||{},c=memberConnections().find(item=>item.id===t.id),who=esc(c?.name||'this connection'),report=t.kind==='report';
 const copy={cancel:['CANCEL INVITATION',`Cancel the invitation for ${who}?`,'This cancels the invitation immediately. Its old link will stop working. The record stays in your Freezer.','CANCEL INVITATION'],block:['BLOCK',`Block ${who}?`,'This ends your existing Friend and Vibe connections with this person and prevents contact between your accounts. Moving records to Trash or restoring them will keep this block.','BLOCK'],unblock:['UNBLOCK',`Unblock ${who}?`,'This removes only the block you placed. It does not reopen any connection. Contact needs a new invitation and acceptance.','UNBLOCK'],freeze:['FREEZER',`Put ${who} in your Freezer?`,c?.status==='invited'?'This cancels the invitation immediately. Its old link will stop working. Invite again from your Freezer if you want to send a new invitation.':'This ends the connection immediately for both of you and closes chat. Invite again from your Freezer if you want to reconnect. A new acceptance is required.','PUT IN FREEZER'],trash:['TRASH',`Move ${who} to Trash?`,'This moves only your history record to your recoverable Trash. It does not remove any block.','MOVE TO TRASH'],restore:['RESTORE TO FREEZER',`Restore ${who} to your Freezer?`,'This restores only the history record. It never reopens chat, reactivates an old invitation, or removes a block.','RESTORE TO FREEZER'],report:['REPORT',`Report ${who}?`,'Your report goes privately to the Duh Wild team. It also ends this connection for both of you.','REPORT &amp; END →']}[t.kind];
 if(!copy||!c){changeModal('');$('modalHost').innerHTML='';return}
 const pending=endingConnections.get(endActionKey(t.id)),busy=pending&&currentInvitation(pending);
 $('modalHost').innerHTML=`<div class="modalBackdrop" onclick="closeInvite(event)"><section class="modal endModal" role="dialog" aria-modal="true" aria-labelledby="endTitle"><button class="close" type="button" aria-label="Close" onclick="closeInvite()">×</button><div class="eyebrow">${copy[0]}</div><h2 id="endTitle">${copy[1]}</h2><p>${copy[2]}</p>${report?`<div class="modalForm"><fieldset class="reportReasons"><legend>What happened?</legend>${REPORT_REASONS.map(([k,v])=>`<label><input type="radio" name="reportReason" value="${k}"> ${esc(v)}</label>`).join('')}</fieldset><label class="field">Anything else we should know? (optional)<textarea id="reportNote" rows="3" maxlength="1000"></textarea></label></div>`:''}<div class="row"><button type="button" id="endConfirm" class="button" onclick="confirmEnd()" ${busy?'disabled':''}>${copy[3]}</button>${button('KEEP AS IS','closeInvite()','light')}</div><p id="endError" class="error" role="alert">${busy?'Saving your previous choice…':''}</p></section></div>`
}
function applyActionConnection(id,connection,kind){
 if(!connection)return;
 const realId=id==='first'?s.liveId:id,first=id==='first';
 if(first){s.firstConnection=connectionHistory(connection);s.phase=connection.status;s.messages=[]}
 const locations=[['outgoing',true],['friends',false],['inbox',false],['freezerExtra',false],['received',false]];let placed=first;
 for(const [field,normalized] of locations){const rows=s[field]||[],index=rows.findIndex(c=>c.id===realId);if(index<0)continue;if(inTrash(connection))rows.splice(index,1);else{rows[index]=normalized?normalizeConnection(connection):connection;placed=true}}
 s.trashRows=(s.trashRows||[]).filter(c=>c.id!==realId);
 if(inTrash(connection))s.trashRows.push(connection);else if(!placed)s.freezerExtra.push(connection);
 if(!first&&s.liveId===realId&&!isFriend(connection)){s.phase=connection.status;s.messages=[]}
 if(inactiveConnection(connection)){chatDrafts.delete(`${activeMemberId()}:${id}`);if(s.selectedChempat===id)s.selectedChempat='';s.secretsFor=''}
}
async function confirmEnd(){
 const t=s.endTarget,c=memberConnections().find(item=>item.id===t?.id);if(s.modal!=='end'||!t)return;
 const error=$('endError'),key=endActionKey(t.id);if(endingConnections.has(key)&&currentInvitation(endingConnections.get(key)))return;
 if(!allowedConnectionAction(c,t.kind)){error.textContent='This connection changed. Close this dialog to see its current status.';return}
 const report=t.kind==='report',reason=document.querySelector('input[name=reportReason]:checked')?.value,note=$('reportNote')?.value.trim()||'';
 if(report&&!reason){error.textContent='Choose what happened.';return}
 const request={...invitationRequest(),target:{...t}},first=t.id==='first',outgoing=s.outgoing.find(item=>item.id===t.id),live=first?s.liveInvite:(s.liveMember||!!outgoing&&s.liveInvite||s.friends.some(c=>c.id===t.id)||hasMember()&&[...(s.freezerExtra||[]),...(s.received||[]),...(s.trashRows||[])].some(c=>c.id===t.id));
 endingConnections.set(key,request);connectionRevision++;$('endConfirm').disabled=true;error.textContent=report?'Sending your report…':'Saving your choice…';
 try{
  if(!live)throw Error('Sign in to update this connection.');
  const data=await connectionApi({action:t.kind,...(first?connectionRef():{id:t.id}),...(report?{reason,note}:{})});
  if(!currentInvitation(request))return;
  connectionRevision++;applyActionConnection(t.id,data.connection,t.kind);
  const owns=ownsInvitationModal(request)&&s.endTarget===t;
  if(owns){s.endTarget=null;changeModal('');s.view='dashboard';s.secretsFor='';showActionNotice(ACTION_NOTICES[t.kind]);if(inFreezer(data.connection)&&['freeze','cancel','restore','block','report'].includes(t.kind))setDashboardDisclosure('freezer',true)}
  save();render(true);
  if(s.liveMember)await refreshLive(true);else if(s.prospectId)await refreshOutgoing();if(currentInvitation(request)&&s.trashOpen)await loadTrashHistory(true);
 }catch(e){if(ownsInvitationModal(request)&&s.endTarget===t){const current=$('endError');if(current)current.textContent=e.message}}
 finally{if(endingConnections.get(key)===request)endingConnections.delete(key);if(currentInvitation(request)&&s.modal==='end'&&s.endTarget?.id===t.id){const confirm=$('endConfirm');if(confirm)confirm.disabled=false;if(!ownsInvitationModal(request)){const current=$('endError');if(current)current.textContent='The previous request finished. Check this connection before continuing.'}}}
}
const preparingReinvites=new Map(),sendingReinvites=new Map();
function reinviteKey(id){return `${activeMemberId()}:${id==='first'?s.liveId:id}`}
function newReinviteId(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),value=>value.toString(16).padStart(2,'0')).join('')}
function openReinvite(id){const c=memberConnections().find(item=>item.id===id);if(!allowedConnectionAction(c,'reinvite'))return;const key=reinviteKey(id);s.reinviteAttempts=s.reinviteAttempts||{};s.reinviteAttempts[key]=s.reinviteAttempts[key]||newReinviteId();s.reinviteTarget={id,kind:isFriend(c)?'friend':'vibe',requestId:s.reinviteAttempts[key],prepared:null,error:''};save();changeModal('reinvite');renderModal();prepareReinvite()}
function renderReinvite(){
 const t=s.reinviteTarget,c=memberConnections().find(item=>item.id===t?.id);if(!t||!c){changeModal('');$('modalHost').innerHTML='';return}
 const key=reinviteKey(t.id),preparing=preparingReinvites.get(key),sending=sendingReinvites.get(key),busy=!!(preparing&&currentInvitation(preparing)||sending&&currentInvitation(sending)),p=t.prepared,friend=t.kind==='friend';
 $('modalHost').innerHTML=`<div class="modalBackdrop" onclick="closeInvite(event)"><section class="modal reinviteModal" role="dialog" aria-modal="true" aria-labelledby="reinviteTitle"><button class="close" type="button" aria-label="Close" onclick="closeInvite()">×</button><div class="eyebrow">NEW ${friend?'FRIEND':'VIBE'} INVITATION</div><h2 id="reinviteTitle">Invite ${esc(c.name)} again?</h2><p>${friend?'A new friend invitation opens chat only after they accept.':'A new Vibe starts fresh. You both choose each step before chat opens.'} The old connection stays in your Freezer.</p>${p?`<p class="reinviteDestination">${p.destination==='member'?'This invitation goes to the same Duhwild account. They can sign in to their existing page to accept.':p.recipient?.email?`This invitation goes to ${esc(p.recipient.email)}.`:'This invitation uses the recipient already linked to this record.'}</p>`:''}${p?.needsAnswers?'<p>Play your first five before sending a new Vibe invitation.</p>'+button('PLAY MY FIVE →','playBeforeReinvite()'):''}<div class="row">${p&&!p.needsAnswers?`<button type="button" class="button" id="reinviteConfirm" onclick="sendReinvite()" ${busy||!p.canSend?'disabled':''}>SEND NEW INVITATION</button>`:!busy&&!p?button('TRY AGAIN','prepareReinvite()'):''}${button('KEEP AS IS','closeInvite()','light')}</div><p id="reinviteStatus" class="small" role="status">${sending&&currentInvitation(sending)?'Sending your new invitation…':preparing&&currentInvitation(preparing)?'Checking this invitation…':''}</p><p id="reinviteError" class="error" role="alert">${esc(t.error||'')}</p></section></div>`
}
async function prepareReinvite(){
 const t=s.reinviteTarget;if(s.modal!=='reinvite'||!t)return;const key=reinviteKey(t.id),pending=preparingReinvites.get(key);if(pending&&currentInvitation(pending))return;
 const request={...invitationRequest(),target:t};preparingReinvites.set(key,request);t.error='';renderModal();
 try{const data=await connectionApi({action:'prepareReinvite',id:t.id==='first'?s.liveId:t.id,kind:t.kind});if(!ownsInvitationModal(request)||s.reinviteTarget!==t)return;t.prepared=data}
 catch(e){if(ownsInvitationModal(request)&&s.reinviteTarget===t)t.error=e.message}
 finally{if(preparingReinvites.get(key)===request)preparingReinvites.delete(key);if(ownsInvitationModal(request)&&s.reinviteTarget===t)renderModal();else if(currentInvitation(request)&&s.modal==='reinvite'&&s.reinviteTarget?.id===t.id){renderModal();if(!s.reinviteTarget.prepared)prepareReinvite()}}
}
function playBeforeReinvite(){const t=s.reinviteTarget;if(!t?.prepared?.needsAnswers)return;changeModal('');s.reinviteTarget=null;if(s.actor==='member'){s.memberQuestionsOpen=true;navigate('dashboard','member')}else{startProspect()}}
async function sendReinvite(){
 const t=s.reinviteTarget,c=memberConnections().find(item=>item.id===t?.id);if(s.modal!=='reinvite'||!t?.prepared?.canSend||t.prepared.needsAnswers||!allowedConnectionAction(c,'reinvite'))return;
 const key=reinviteKey(t.id),pending=sendingReinvites.get(key);if(pending&&currentInvitation(pending))return;
 const request={...invitationRequest(),target:t};sendingReinvites.set(key,request);t.error='';save();renderModal();
 try{const data=await connectionApi({action:'reinvite',id:t.id==='first'?s.liveId:t.id,kind:t.kind,requestId:t.requestId});if(!currentInvitation(request))return;connectionRevision++;delete s.reinviteAttempts[key];const owns=ownsInvitationModal(request)&&s.reinviteTarget===t;if(owns){s.reinviteTarget=null;changeModal('');s.view='dashboard';showActionNotice(`New ${t.kind==='friend'?'friend':'Vibe'} invitation sent. They need to accept again.`)}save();render(true);if(s.liveMember)await refreshLive(true);else if(s.prospectId)await refreshOutgoing()}
 catch(e){if(ownsInvitationModal(request)&&s.reinviteTarget===t){t.error=e.message;renderModal()}}
 finally{if(sendingReinvites.get(key)===request)sendingReinvites.delete(key);if(currentInvitation(request)&&s.modal==='reinvite'){if(s.reinviteTarget===t&&ownsInvitationModal(request))renderModal();else{const button=$('reinviteConfirm');if(button)button.disabled=!s.reinviteTarget?.prepared?.canSend;const status=$('reinviteStatus');if(status)status.textContent='The previous request finished. Check your connections before sending another invitation.'}}}
}
// Friendship is a separate, explicit invitation. It never advances a Vibe pair.
function friendIntro(){const invite=s.friendInvite;return `<div class="friendIntro"><div class="eyebrow">A FRIEND INVITATION</div>${invite?.name?`${connectionFace({name:first(invite.name),photo:invite.photo})}<h2>${esc(first(invite.name))} invited you.</h2>`:'<h2>Come try Duh Wild with me.</h2>'}<p>${s.friendChoice==='decline'?'Sign in with the invited email to record your pass.':hasMember()?'Choose whether to connect as friends.':'Accept to make your page and connect as friends.'} Your email stays private.</p></div>`}
function friendInvitationAvailable(){return !!s.friendInvite&&['invited','open','claimed','used','chat'].includes(s.friendInvite.status)}
const activeFriendChoice=request=>!!request&&s===request.state&&activeMemberId()===request.account&&s.friendToken===request.token;
function friendChoiceBusy(){return activeFriendChoice(choosingFriend)}
function renderFriendInvitation(){
 const invite=s.friendInvite,name=first(invite?.name),available=friendInvitationAvailable(),retry=available&&!invite?.name,busy=friendChoiceBusy();
 if(s.friendExit)return `<section class="box friendInvitation friendExit"><h1>No worries. Your next connection is out there.</h1>${s.friendExit==='declined'?'<p>You passed on this invitation.</p>':'<p>This invitation hasn’t changed. Sign in with the invited email if you’d like to record your pass.</p>'}${button('Explore Duhwild →','dismissFriendInvitation()')}${s.friendToken?'<button type="button" class="link" onclick="beginFriendIdentity(&quot;decline&quot;,true)">Sign in to record your pass</button><button type="button" class="link friendBack" onclick="showFriendInvitation()">← Back to invitation</button>':''}</section>`;
 if(s.friendLoading)return '<section class="box friendInvitation"><p role="status">Opening your invitation…</p><button type="button" class="link" onclick="dismissFriendInvitation()">Explore Duhwild →</button></section>';
 if(invite?.status==='own')return `<section class="box friendInvitation"><div class="eyebrow">YOUR FRIEND INVITATION</div><h1>You sent this invitation.</h1><p>Your friend can open this link to accept or pass. You’re signed in to your own page.</p>${button('MY PAGE','friendInvitationMyPage()')}${button('SIGN IN WITH ANOTHER ACCOUNT',"beginFriendIdentity('switch',true)",'light')}<p class="small">Your invitation will stay here while you switch accounts.</p></section>`;
 return `<section class="box friendInvitation">${friendIntro()}${invite?.requiresSignIn?`<p>${esc(s.friendError||'Sign in with the account this invitation was sent to, or create your page with the invited email.')}</p>${button(hasMember()?'SIGN IN WITH ANOTHER ACCOUNT':'SIGN IN',"beginFriendIdentity('accept',true)")}${!hasMember()?button('CREATE A PAGE',"beginFriendIdentity('accept')",'light'):''}<button type="button" class="button light" id="friendPass" onclick="passFriendInvitation()">PASS</button>`:available?`<p>${retry?'If you already accepted this invitation, you can reopen your friend connection.':'Accept to open a private chat with '+esc(name)+'. Passing leaves you free to meet other people.'}</p>${s.friendChoice==='decline'?'<p class="small">Choose PASS below to finish responding to this invitation.</p>':''}<div class="row friendChoices"><button type="button" class="button" id="friendAccept" onclick="acceptFriendInvitation()" ${busy?'disabled':''}>${retry?'OPEN FRIEND CONNECTION':'ACCEPT'}</button>${!retry?`<button type="button" class="button light" id="friendPass" onclick="passFriendInvitation()" ${busy?'disabled':''}>PASS</button>`:''}</div><p id="friendStatus" role="status">${busy?(choosingFriend.action==='decline'?'Saving your pass…':'Connecting…'):''}</p>`:`<p>${esc(s.friendError||'This invitation is no longer available. Ask your friend for a new link.')}</p>${button('Try again','openFriendInvitation(s.friendToken)','light')}`}<p class="error" id="friendError" role="alert">${available?esc(s.friendError):''}</p><button type="button" class="link" onclick="dismissFriendInvitation()">Explore Duhwild →</button></section>`
}
function showFriendInvitation(){const n=$('joinName'),c=$('joinContact');if(n)s.member.name=n.value;if(c)s.member.contact=c.value;s.friendChoice='';s.friendExit='';navigate('friendInvite')}
function restoreFriendVibe(member){const prior=s.friendVibeState,context=friendContext();if(!prior)return false;s={...blank(),...prior,...context,friendVibeState:null};if(member){s.account={...member};s.prospect={...s.prospect,name:member.name,photo:member.photo,email:member.contact,answers:s.prospect.answers?.length?s.prospect.answers:member.answers||[],agreed:true};s.prospectId=member.id;s.prospectVerified=member.verified;s.actor='prospect'}return true}
function friendInvitationMyPage(){s.memberQuestionsOpen=false;dismissFriendInvitation()}
function dismissFriendInvitation(){openingFriend++;cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;if(s.friendVibeState)restoreFriendVibe();s.friendToken='';s.friendInvite=null;s.friendError='';s.friendChoice='';s.friendExit='';if(hasMember())navigate('dashboard');else if(s.liveInvite)navigate('invitee','prospect');else{s.joinStep=1;navigate('landing','member')}}
function beginFriendIdentity(choice,signin=false){s.friendChoice=choice;s.friendExit='';s.friendError='';if(signin)showSignin();else startFresh()}
async function friendApi(data){const response=await fetch('/api/friend',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify(data)});let body;try{body=await response.json()}catch{throw Error('The friend service did not respond. Try again.')}if(!response.ok)throw Object.assign(Error(body.error||'Could not update this friend invitation.'),{status:response.status,needsVerify:!!body.needsVerify,sessionExpired:!!body.sessionExpired});return body}
let openingFriend=0,choosingFriend=null;
async function openFriendInvitation(token){
 if(!token)return;const resumeIdentity=s.friendToken===token&&s.view==='landing'&&!!s.friendChoice;if(s.friendToken!==token)s.friendChoice='';s.friendToken=token;s.friendInvite=null;s.friendError='';s.friendExit='';s.friendLoading=true;changeModal('');s.view='friendInvite';
 const request={state:s,account:activeMemberId(),version:++openingFriend,interactionVersion},current=()=>s===request.state&&activeMemberId()===request.account&&openingFriend===request.version&&interactionVersion===request.interactionVersion&&s.friendToken===token;save();render();
 try{
  const response=await fetch(`/api/friend?invite=${encodeURIComponent(token)}`,{credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer'}),invite=await response.json();if(!current())return;
  if(!response.ok&&response.status!==403)throw Error(invite.error||'This friend invitation is unavailable.');
  s.friendInvite=response.status===403?{kind:'friend',status:'signInRequired',requiresSignIn:true}:invite;if(response.status===403)s.friendError=invite.error||'Sign in with the account this invitation was sent to.';
  let own=null,expired=false;try{const accountResponse=await fetch('/api/member',{credentials:'same-origin',cache:'no-store'});if(accountResponse.ok)own=(await accountResponse.json()).member;else expired=accountResponse.status===401}catch{}if(!current())return;
  if(own){if(own.id!==activeMemberId()){openPage(own,'',false);request.state=s;request.account=activeMemberId();request.interactionVersion=interactionVersion}else s.account={...own};s.view=resumeIdentity?'landing':'friendInvite'}
  else if(expired&&hasMember()){const context=friendContext();s={...blank(),...context};request.state=s;request.account='';s.view='friendInvite'}
  else if(!hasMember()){
   if(s.liveInvite&&!s.friendVibeState){const prior={...s,view:s.prospect.answers.length>=5?'results':'invitee',friendToken:'',friendInvite:null,friendLoading:false};s={...blank(),...friendContext(),friendVibeState:prior};request.state=s;request.account=''}
   s.view=resumeIdentity?'landing':'friendInvite';if(resumeIdentity)s.actor='member';
  }
 }catch(e){if(current())s.friendError=e.message}
 finally{if(current()){s.friendLoading=false;render()}}
}
const currentFriendChoice=request=>activeFriendChoice(request)&&s.view===request.view&&interactionVersion===request.interactionVersion&&modalVersion===request.modalVersion;
async function acceptFriendInvitation(){return chooseFriendInvitation('accept')}
async function passFriendInvitation(){
 if(friendChoiceBusy()||s.friendExit||!s.friendToken||(!s.friendInvite?.requiresSignIn&&(!friendInvitationAvailable()||s.friendInvite.status!=='invited')))return;
 if(s.friendInvite.requiresSignIn||!hasMember()||s.friendInvite.canDecline===false&&!unconfirmed()){s.friendChoice='decline';s.friendExit='local';navigate('friendInvite');return}
 return chooseFriendInvitation('decline')
}
async function chooseFriendInvitation(action){
 if(friendChoiceBusy()||s.friendExit||!s.friendToken||!friendInvitationAvailable()||s.view!=='friendInvite')return;
 if(!hasMember()){beginFriendIdentity(action);return}
 const request={state:s,account:activeMemberId(),token:s.friendToken,view:s.view,interactionVersion,modalVersion,action,senderName:s.friendInvite?.name||'',senderPhoto:s.friendInvite?.photo||''};choosingFriend=request;s.friendError='';render();
 try{
  const data=await friendApi({action,token:request.token});if(!currentFriendChoice(request))return;
  if(action==='decline'){s.friendToken='';s.friendInvite=null;s.friendError='';s.friendChoice='';s.friendExit='declined';connectionRevision++;render();return}
  s.friendToken='';s.friendInvite=null;s.friendError='';s.friendChoice='';s.friendExit='';s.friendAcceptedId=data.id;s.selectedChempat=data.id;s.secretsFor='';s.memberQuestionsOpen=false;
  if(!s.liveInvite)s.liveMember=true;
  // Persist the confirmed connection even when the inbox is temporarily unavailable.
  if(!data.alreadyConnected&&!s.friends.some(c=>c.id===data.id))s.friends.push({id:data.id,kind:'friend',channel:'friend',status:'chat',side:'prospect',sender_name:request.senderName,sender_photo:request.senderPhoto,messages:[]});
  save();const version=interactionVersion;await refreshLive();if(s!==request.state||activeMemberId()!==request.account||interactionVersion!==version||s.view!==request.view)return;s.selectedChempat=data.id;navigate('dashboard');
 }catch(e){
  if(!currentFriendChoice(request))return;
  if(e.needsVerify){const token=request.token;s.friendChoice=action;openVerify(owner().contact||s.prospect.email,()=>openFriendInvitation(token));return}
  if(e.status===401){s.friendError='Your sign-in expired. Sign in again to respond to this invitation.';s.friendInvite={kind:'friend',status:'signInRequired',requiresSignIn:true};s.friendChoice=action;render();return}
  if(e.status===403){s.friendInvite={kind:'friend',status:'signInRequired',requiresSignIn:true};s.friendChoice=action}
  if(e.status===410)s.friendInvite={kind:'friend',status:'closed'};
  s.friendError=e.message;render();
 }finally{if(choosingFriend===request)choosingFriend=null;if(activeFriendChoice(request)&&s.view==='friendInvite')render()}
}
let sharingFriend=null;
function openFriendShare(){changeModal('friendShare');s.friendShareError='';s.friendShare=null;s.friendShareDraft={name:'',email:''};renderModal();const request=invitationRequest();setTimeout(()=>{if(ownsInvitationModal(request))$('friendName')?.focus()},0)}
function updateFriendSending(){const pending=sharingFriend&&currentInvitation(sharingFriend),button=$('friendSendButton'),status=$('friendSending');if(button)button.disabled=!!pending;for(const id of ['friendName','friendEmail']){const input=$(id);if(input)input.disabled=!!pending&&ownsInvitationModal(sharingFriend)}if(status)status.textContent=pending?(ownsInvitationModal(sharingFriend)?'Sending your invitation…':'Sending your previous invitation…'):''}
async function makeFriendInvitation(){
 if(s.modal!=='friendShare'||sharingFriend&&currentInvitation(sharingFriend))return;const friendName=$('friendName')?.value.trim()||'',friendEmail=$('friendEmail')?.value.trim().toLowerCase()||'';
 if(!friendName||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(friendEmail)){s.friendShareError='Enter your friend’s name and email.';const error=$('friendShareError');if(error)error.textContent=s.friendShareError;return}
 s.friendShareDraft={name:friendName,email:friendEmail};const request=invitationRequest(s.friendShareDraft);sharingFriend=request;s.friendShareError='';renderModal();
 try{
  const invite=await friendApi({action:'create',recipient:request.recipient});if(!currentInvitation(request))return;
  const token=invite.token||new URL(invite.url,location.origin).searchParams.get('friend');if(!token)throw Error('The invitation link could not be verified. Try again.');const url=new URL('/friend',location.origin);url.searchParams.set('friend',token);
  const shared={...invite,url:url.href,recipient:invite.recipient||request.recipient};if(!s.liveInvite)s.liveMember=true;
  // Keep the original form pending until its post-send inbox refresh completes.
  await refreshLive(true);if(!currentInvitation(request))return;
  if(!s.friends.some(c=>c.id===invite.id)){s.friends.push({id:invite.id,kind:'friend',channel:'friend',status:'invited',side:'member',recipient_name:shared.recipient.name,messages:[]});render(true)}
  if(!ownsInvitationModal(request)){save();return}
  s.friendShare=shared;s.selectedChempat=invite.id;changeModal('');setNotice(`Invite sent to ${first(friendName)}.`,{duration:1800});render();
 }catch(e){if(!ownsInvitationModal(request))return;if(gate(e,()=>openFriendShare()))return;s.friendShareError=e.message}
 finally{if(sharingFriend===request)sharingFriend=null;if(currentInvitation(request)){save();if(ownsInvitationModal(request))renderModal();else if(s.modal==='friendShare')updateFriendSending()}}
}
function renderFriendShare(){const invite=s.friendShare,expired=invite&&new Date(invite.expiresAt).getTime()<=Date.now();$('modalHost').innerHTML=`<div class="modalBackdrop" onclick="closeInvite(event)"><section class="modal friendShareModal" role="dialog" aria-modal="true" aria-labelledby="friendShareTitle"><button class="close" type="button" aria-label="Close" onclick="closeInvite()">×</button><div class="eyebrow">INVITE A FRIEND</div><h2 id="friendShareTitle">Come try Duh Wild with me.</h2>${invite&&!expired?`<p>Your friend invitation is on its way.</p><div class="friendSentCard"><b>${esc(invite.recipient?.name||'Friend')}</b><span>${esc(invite.recipient?.email||'')}</span><small>INVITE CODE</small><strong>${esc(invite.code||'')}</strong></div><label class="field">Friend invitation link<input id="friendShareLink" readonly value="${esc(invite.url)}" onclick="this.select()"></label><p class="small">One use · expires ${esc(new Date(invite.expiresAt).toLocaleString())}.</p>${navigator.share?button('Share invitation','shareFriendInvitation()'):''}${button('Copy invitation','copyFriendInvitation()','light')}`:`<p>Send this to someone you already know. They’ll connect as your friend and go straight to private chat — no dating questions.</p><label class="field">Friend’s name<input id="friendName" autocomplete="given-name" maxlength="50" placeholder="First name" value="${esc(s.friendShareDraft?.name||'')}" oninput="s.friendShareDraft.name=this.value"></label><label class="field">Friend’s email<input id="friendEmail" type="email" autocomplete="email" placeholder="friend@example.com" value="${esc(s.friendShareDraft?.email||'')}" oninput="s.friendShareDraft.email=this.value"></label><button id="friendSendButton" type="button" class="button" onclick="makeFriendInvitation()">SEND FRIEND INVITATION →</button><p id="friendSending" role="status"></p>`}<p class="error" id="friendShareError" role="alert">${esc(s.friendShareError)}</p><p class="small" id="friendShareStatus" role="status"></p></section></div>`;updateFriendSending()}
async function shareFriendInvitation(){if(!s.friendShare||!navigator.share)return;const state=s,invite=s.friendShare;try{await navigator.share({title:'Duh Wild',text:`Come try Duh Wild with me. Invite code: ${invite.code||''}`.trim(),url:invite.url});if(s!==state||s.friendShare!==invite)return;const status=$('friendShareStatus');if(status)status.textContent='Invitation shared.'}catch(e){if(s!==state||s.friendShare!==invite)return;const error=$('friendShareError');if(error&&e.name!=='AbortError')error.textContent='Sharing did not finish. Copy your invitation below and try again.'}}
async function copyFriendInvitation(){if(!s.friendShare)return;const state=s,invite=s.friendShare,text=`Come try Duh Wild with me.\nInvite code: ${invite.code||''}\n${invite.url}`;try{if(!navigator.clipboard?.writeText)throw Error('Copy the invitation link above and send it to your friend.');await navigator.clipboard.writeText(text);if(s!==state||s.friendShare!==invite)return;const status=$('friendShareStatus');if(status)status.textContent='Invitation copied. Send it to your friend.'}catch(e){if(s!==state||s.friendShare!==invite)return;$('friendShareLink')?.select();const error=$('friendShareError');if(error)error.textContent=e.message||'Copy the invitation link above and send it to your friend.'}}

// Sign in and log out. Signing in emails a six digit code to the address on the member's page.
function signinCard(){const joining=s.joinStep==='joinCode',code=joining||s.joinStep==='signinCode';
 if(code)return `<div class="eyebrow">${joining?'1 · CHECK YOUR EMAIL':'WELCOME BACK'}</div><h2>Enter your code.</h2><p>We sent a six digit code to <b>${esc(s.signinEmail)}</b>. It’s at the start of the email’s subject line.</p><input class="joinInput" id="signinCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="Six digit code" placeholder="000000" onkeydown="if(event.key==='Enter')signinVerify()"><button type="button" class="button nextButton" onclick="signinVerify()">${joining?'CONTINUE →':'SIGN IN →'}</button><p id="joinError" class="error" role="alert"></p><p class="small">Not there? Check spam or promotions. <button type="button" class="link" onclick="resendCode()">Resend code</button></p><button type="button" class="link" onclick="${joining?'startFresh()':'showSignin()'}">Use a different email</button>`;
 return `<div class="eyebrow">WELCOME BACK</div><h2>Sign in.</h2><p>We’ll email a six digit code to the address on your page.</p><input class="joinInput" id="signinEmail" type="email" aria-label="Your email" autocomplete="email" placeholder="Your email" value="${esc(s.signinEmail)}" onkeydown="if(event.key==='Enter')signinStart()"><button type="button" class="button nextButton" onclick="signinStart()">SEND CODE →</button><p id="joinError" class="error" role="alert"></p><button type="button" class="link" onclick="startFresh()">← New here? Start your page</button>`}
function showSignin(){dismissActionNotice();interactionVersion++;s.view='landing';s.joinStep='signin';render()}
function startFresh(){dismissActionNotice();interactionVersion++;s.view='landing';s.joinStep=1;render()}
// One code step for sign-up, sign-in, and confirming an email later. A code is good for ten minutes, so don't replace one that's still fresh.
async function sendCode(email,errorId,force=false){const error=$(errorId),request=invitationRequest();
 if(!force&&s.codeSentTo===email&&Date.now()-s.codeSentAt<9*60000){if(error)error.textContent='';return true}
 if(error)error.textContent='Sending your code…';
 try{await memberApi({action:'code_start',email});if(!ownsInvitationModal(request))return false;s.codeSentTo=email;s.codeSentAt=Date.now();if(error)error.textContent='';return true}
 catch(e){if(!ownsInvitationModal(request))return false;if(e.status===429&&s.codeSentTo===email){if(error)error.textContent='';return true}if(error)error.textContent=e.message;return false}}
async function resendCode(){if(await sendCode(s.signinEmail,'joinError',true))$('joinError').textContent='New code sent. Use the newest email.'}
async function signinStart(){if(pendingIdentity&&currentIdentity(pendingIdentity))return;const email=$('signinEmail').value.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){$('joinError').textContent='Enter the email on your page.';return}const request=identityRequest();pendingIdentity=request;try{if(await sendCode(email,'joinError')&&currentIdentity(request)){s.signinEmail=email;s.joinStep='signinCode';render();$('signinCode')?.focus()}}finally{if(pendingIdentity===request)pendingIdentity=null}}
function openPage(member,notice='',reloadFriend=true){resetGamePieceVisit();if(s.friendVibeState){restoreFriendVibe(member);navigate(s.friendToken?'friendInvite':'dashboard','prospect');if(s.friendToken&&reloadFriend)openFriendInvitation(s.friendToken);refreshLive();return}s={...blank(),...friendContext()};s.account={...member};s.member={name:member.name,contact:member.contact,photo:member.photo,answers:member.answers||[],agreed:true,verified:member.verified!==false};s.memberId=member.id;s.phase=s.member.answers.length>=5?'ready':'registration';s.liveMember=true;if(s.pendingVibeToken){s.view='inviteAuth';render();openEmailInvitation(s.pendingVibeToken);return}navigate(s.friendToken?'friendInvite':'dashboard','member');if(s.friendToken&&reloadFriend)openFriendInvitation(s.friendToken);if(notice){setNotice(notice);render()}refreshLive()}
async function signinVerify(){if(pendingIdentity&&currentIdentity(pendingIdentity))return;const code=$('signinCode').value.trim(),joining=s.joinStep==='joinCode';if(!/^\d{6}$/.test(code)){$('joinError').textContent='Enter the six digit code from your email.';return}$('joinError').textContent='Checking…';const request=identityRequest();pendingIdentity=request;
 try{const result=await memberApi({action:'code_verify',email:s.signinEmail,code});if(!currentIdentity(request))return;s.codeSentAt=0;
  if(result.existing){openPage(result.member,joining?'That email already has a page, so we opened it.':'');return}
  if(joining){s.member.verified=true;s.joinStep=2;render();return}
  s.member.contact=s.signinEmail;s.joinStep=1;render();$('joinError').textContent='There’s no page for that email yet. Start one here.'}
 catch(e){if(currentIdentity(request)&&$('joinError'))$('joinError').textContent=e.message}finally{if(pendingIdentity===request)pendingIdentity=null}}
// Confirm-your-email modal: used by scanners before connecting and by older pages that never confirmed.
let afterVerify=null,verifyingEmail=null;
function unconfirmed(){return s.actor==='prospect'?s.prospectVerified===false:s.member.verified===false}
function gate(e,retry){if(!e?.needsVerify)return false;openVerify(owner().contact||s.prospect.email,retry);return true}
function openVerify(email,then,lead=''){afterVerify=then;s.verifyEmail=email;s.verifyLead=lead;changeModal('verifyEmail');renderModal();sendCode(email,'verifyEmailError')}
function verifyForQr(){s.qrError='';s.qrNeedsVerify=false;openVerify(owner().contact,()=>openInvite())}
function renderVerifyEmail(){$('modalHost').innerHTML=`<div class="modalBackdrop" onclick="closeInvite(event)"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="verifyEmailTitle"><button class="close" type="button" aria-label="Close" onclick="closeInvite()">×</button><div class="eyebrow">ONE QUICK CHECK</div><h2 id="verifyEmailTitle">Confirm your email.</h2><p>${esc(s.verifyLead||'Enter the code we sent to')} <b>${esc(s.verifyEmail)}</b>. It’s at the start of the email’s subject line.</p><div class="modalForm"><input class="joinInput" id="verifyEmailCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="Six digit code" placeholder="000000" onkeydown="if(event.key==='Enter')confirmVerify()"></div><div class="row">${button('CONFIRM →','confirmVerify()')}</div><p id="verifyEmailError" class="error" role="alert"></p><p class="small">Not there? Check spam or promotions. <button type="button" class="link" onclick="sendCode(s.verifyEmail,'verifyEmailError',true).then(ok=>{if(ok)$('verifyEmailError').textContent='New code sent. Use the newest email.'})">Resend code</button></p></section></div>`}
async function confirmVerify(){if(verifyingEmail&&ownsInvitationModal(verifyingEmail))return;const error=$('verifyEmailError'),code=$('verifyEmailCode').value.trim();if(!/^\d{6}$/.test(code)){error.textContent='Enter the six digit code from your email.';return}error.textContent='Checking…';const request={...invitationRequest(),email:s.verifyEmail,then:afterVerify};verifyingEmail=request;
 try{const result=await memberApi({action:'code_verify',email:request.email,code});if(!ownsInvitationModal(request))return;s.codeSentAt=0;
  if(result.member){if(s.actor==='prospect'){s.prospectId=result.member.id;s.prospectVerified=true;s.prospect.name=result.member.name;s.prospect.photo=result.member.photo;s.prospect.email=result.member.contact;if(result.member.answers?.length>=5)s.prospect.answers=result.member.answers}else s.member.verified=true}
  const then=request.then;afterVerify=null;changeModal('');s.verifyLead='';renderModal();if(then)await then();else render()}
 catch(e){if(ownsInvitationModal(request))error.textContent=e.message}finally{if(verifyingEmail===request)verifyingEmail=null}}
function confirmLogout(){changeModal('logout');renderModal()}
function renderLogout(){const contact=owner().contact||'',byEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
 $('modalHost').innerHTML=`<div class="modalBackdrop" onclick="closeInvite(event)"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="logoutTitle"><button class="close" type="button" aria-label="Close" onclick="closeInvite()">×</button><div class="eyebrow">LOG OUT</div><h2 id="logoutTitle">Log out on this phone?</h2><p>${byEmail?`To come back, tap <b>Sign in</b> on the first screen and we’ll email a code to ${esc(contact)}.`:'Your page was made with a phone number, so you can’t sign back in until text codes arrive.'}</p><div class="row">${button('LOG OUT','logout()')}${button('CANCEL','closeInvite()','light')}</div><p id="logoutError" class="error" role="alert"></p></section></div>`}
async function logout(){chatDrafts.clear();const state=s,account=activeMemberId(),error=$('logoutError');error.textContent='Logging out…';
 try{const response=await fetch('/api/member',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({action:'logout'})});if(!response.ok)throw Error('Could not log out. Try again.');if(s!==state||activeMemberId()!==account)return;discardMemberProfile();
  cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;try{sessionStorage.removeItem(KEY)}catch{}s={...blank(),...friendContext()};render();window.scrollTo(0,0)}
 catch(e){if(s===state&&activeMemberId()===account&&error.isConnected)error.textContent=e.message}}
// Capture control selections before inline handlers can create a new confirmation.
for(const id of ['root','navUser','modalHost'])$(id).addEventListener('click',event=>{const control=event.target.closest?.('button,a,summary,input,select,textarea,label');if(control&&!control.matches(':disabled,[aria-disabled="true"]'))dismissActionNotice()},true);
window.addEventListener('pagehide',()=>{discardMemberProfile();closeConnectionMenu();clearTransientNotice()});
window.addEventListener('pageshow',event=>{if(event.persisted&&s.view==='profile'){render();loadRewards(true)}});
function visibleModalControl(control){
 if(control.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
 for(let parent=control.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS'&&!parent.open){const summary=[...parent.children].find(child=>child.tagName==='SUMMARY');if(!summary?.contains(control))return false}
 return true;
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&s.modal)closeInvite();if(e.key==='Tab'&&['discovery','reward','wildcard','gamePiece','end','datecard'].includes(s.modal)){const controls=[...document.querySelectorAll('.discoveryModal button:not(:disabled),.discoveryModal input:not(:disabled),.discoveryModal a[href],.rewardModal button:not(:disabled),.rewardModal input:not(:disabled),.rewardModal summary,.rewardModal video[controls],.wildcardModal button:not(:disabled),.wildcardModal textarea:not(:disabled),.gamePieceModal button:not(:disabled),.gamePieceModal video[controls],.endModal button:not(:disabled),.endModal input:not(:disabled),.endModal textarea:not(:disabled),.dateModal button:not(:disabled),.dateModal input:not(:disabled),.dateModal select:not(:disabled),.dateModal textarea:not(:disabled)')].filter(visibleModalControl);if(!controls.length)return;const first=controls[0],last=controls.at(-1);if(e.shiftKey&&(document.activeElement===first||['wildcard','gamePiece','end','datecard'].includes(s.modal)&&!controls.includes(document.activeElement))){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
// Optional discovery games are scoped to an authenticated owner and one active
// Vibe connection. Private drafts/results never enter sessionStorage or chat.
let discoveryOwner=null,discoveryAccount='',discoveryPairs=new Map(),discoveryDrafts=new Map(),discoveryExpandedPieces=new Set(),discoveryDraftEpoch=0,discoveryPieces=null,discoveryPiecesRequest=null,discoveryPiecesError='',discoveryPiecesRevision=0,discoveryDialog=null;
function syncDiscoveryOwner(){
 if(discoveryOwner===s&&discoveryAccount===activeMemberId())return;
 discoveryOwner=s;discoveryAccount=activeMemberId();discoveryPairs=new Map();discoveryDrafts=new Map();discoveryExpandedPieces=new Set();discoveryDraftEpoch++;discoveryPieces=null;discoveryPiecesRequest=null;discoveryPiecesError='';discoveryPiecesRevision++;discoveryDialog=null;
}
function discoveryConnection(id=s.selectedChempat){
 const c=memberConnections().find(item=>item.id===id);
 return activeMemberId()&&c&&!isFriend(c)&&!inactiveConnection(c)&&chatOpen(c.status)?c:null;
}
const discoveryConnectionId=c=>c.id==='first'?s.liveId:c.id;
const discoveryModuleKey=value=>`${value.id||value.moduleId}:${String(value.version)}`;
const sameDiscoveryModule=(a,b)=>!!a&&!!b&&discoveryModuleKey(a)===discoveryModuleKey(b);
function discoveryEntry(c){
 syncDiscoveryOwner();const id=discoveryConnectionId(c);
 if(!discoveryPairs.has(id))discoveryPairs.set(id,{data:null,error:'',loading:null,pending:null,updated:0,revision:0});
 return discoveryPairs.get(id);
}
function discoveryButton(label,action,extra=''){
 return `<button type="button" class="button light discoveryButton" ${extra} onclick="${esc(action)}">${esc(label)}</button>`;
}
const discoveryCall=(fn,...args)=>`${fn}(${args.map(value=>JSON.stringify(value)).join(',')})`;
function renderDiscoveryPanel(c){
 if(!c||!discoveryConnection(c.id)||!discoveryConnectionId(c))return '';
 return `<section class="connectionGames" id="connectionGames" data-connection="${esc(c.id)}" aria-labelledby="connectionGamesTitle">${discoveryPanelContent(c)}</section>`;
}
function discoveryPanelContent(c){
 const entry=discoveryEntry(c),games=entry.data?.games||[];
 return `<div class="discoveryHeading"><div><h3 id="connectionGamesTitle">A little more to discover</h3><p>Optional. Your chat stays open.</p></div>${discoveryButton('Add a game',discoveryCall('openDiscoveryPicker',c.id))}</div>${entry.data?games.length?`<ul class="discoveryGameList">${games.map(game=>`<li><div><b>${esc(game.title)}</b><small>${esc(discoveryStatus(game,c))}</small></div>${discoveryButton(game.own?.completed?'View piece':game.own?.started?'Continue game':'Play privately',discoveryCall('openDiscoveryGame',c.id,game.moduleId,game.version))}</li>`).join('')}</ul>`:'<p class="discoveryEmpty">Pick a game when you’re curious. Neither of you has to play.</p>':`<p class="discoveryEmpty">${entry.error?'Games aren’t available right now. Your chat is still open.':'Loading your connection’s games…'}</p>`}${entry.error?`<p class="error" role="alert">${esc(entry.error)}</p>${discoveryButton('Try again',discoveryCall('loadDiscovery',c.id,true),entry.loading?'disabled':'')}`:''}`;
}
function discoveryStatus(game,c){
 if(game.revealed)return 'Both pieces shared · Ready to compare';
 if(game.own?.consent)return `Your sharing choice is saved · Waiting for ${c.name}`;
 if(game.own?.completed)return 'Your piece is earned · Private until you choose to share';
 if(game.own?.started)return 'Your answers are private · Continue whenever you like';
 return `${c.name} added this game · Join only if you want to`;
}
function mergeDiscoveryPieces(pieces){
 const merged=new Map((discoveryPieces||[]).map(piece=>[discoveryModuleKey(piece),piece]));for(const piece of pieces)merged.set(discoveryModuleKey(piece),piece);discoveryPieces=[...merged.values()];discoveryPiecesRevision++;discoveryPiecesError='';
}
function discoveryPiecesCount(){return discoveryPieces?String(discoveryPieces.length):discoveryPiecesError?'–':'…'}
function discoveryPiecesCountLabel(){return discoveryPieces?`${discoveryPieces.length} saved game results`:discoveryPiecesError?'Game results unavailable':'Loading game results'}
function dashboardProgressCount(){return rewardsAuthError?'–':rewardsData?`${rewardLevel()} / 5`:'…'}
function dashboardProgressLabel(){return rewardsAuthError?'Sign in to see saved progress':rewardsData?`${rewardLevel()} of 5 profile steps complete`:'Checking saved profile progress'}
function renderDashboardProgress(){
 if(!activeMemberId())return '';syncRewardOwner();
 return `<details class="profileProgress dashboardDisclosure" id="profileProgress" ${dashboardDisclosureAttributes('progress')}>${dashboardDisclosureSummary('My progress','Saved to your profile',dashboardProgressCount(),'profileProgressTitle',dashboardProgressLabel(),'profileProgressCount')}<div class="dashboardDisclosureBody"><p class="profileProgressNote">Your completed steps stay with your profile. Each connection moves at its own pace.</p>${renderRewardLadder()}</div></details>`;
}
function paintDashboardProgress(){const count=$('profileProgressCount');if(count){count.textContent=dashboardProgressCount();count.setAttribute('aria-label',dashboardProgressLabel())}}
function renderDashboardGamePieces(){
 if(!activeMemberId())return '';syncRewardOwner();
 return `<details class="gamePieces dashboardDisclosure" id="gamePieces" ${dashboardDisclosureAttributes('pieces')}>${dashboardDisclosureSummary('Game Pieces','Five little unlocks. Where will you take them?',rewardsData?`${rewardLevel()} / 5`:'…','gamePiecesTitle',rewardsData?`${rewardLevel()} of 5 game pieces unlocked`:'Checking unlocked game pieces','gamePiecesProgress')}<div class="dashboardDisclosureBody"><div class="gamePiecesIntro"><p class="eyebrow">PLAY. UNLOCK. MAKE YOUR MOVE.</p><h2>There’s more than one way to catch a vibe.</h2><p>Five choices at a time. A new possibility with every piece. You decide what happens next.</p></div><div id="gamePieceCards">${gamePieceCardsContent()}</div></div></details>`;
}
function showGamePieces(event){
 event?.preventDefault();const details=$('gamePieces');
 if(s.view!=='dashboard'||!activeMemberId()||!details||details.dataset.disclosureAccount!==activeMemberId())return;
 setDashboardDisclosure('pieces',true);details.querySelector(':scope > summary')?.focus({preventScroll:true});
 details.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
}
function renderDashboardGameResults(){
 if(!activeMemberId())return '';syncDiscoveryOwner();
 return `<details class="moreReflections dashboardDisclosure" ${dashboardDisclosureAttributes('results')}>${dashboardDisclosureSummary('My game results','Optional games · Private until shared',discoveryPiecesCount(),'earnedPiecesTitle',discoveryPiecesCountLabel(),'gameResultsCount')}${renderDiscoveryPieces(true)}</details>`;
}
function renderDiscoveryPieces(compact=false){
 if(!activeMemberId())return '';syncDiscoveryOwner();
 return `<section class="earnedPieces${compact?' dashboardDisclosureBody':''}" id="earnedPieces" data-discovery-account="${esc(activeMemberId())}" data-compact="${compact}" aria-labelledby="earnedPiecesTitle">${discoveryPiecesContent(compact)}</section>`;
}
function rememberDiscoveryPiece(details){if(!details.isConnected||details.closest('#earnedPieces')?.dataset.discoveryAccount!==activeMemberId())return;if(details.open)discoveryExpandedPieces.add(details.dataset.pieceKey);else discoveryExpandedPieces.delete(details.dataset.pieceKey)}
function discoveryPiecesContent(compact=false){
 const pieces=discoveryPieces||[];
 return `${compact?'':'<div class="discoveryHeading"><h2 id="earnedPiecesTitle">My earned pieces</h2><span class="discoveryPrivate">Only you</span></div><p class="earnedPiecesNote">Private until you choose to share.</p>'}${pieces.length?`<div class="earnedPieceGrid">${pieces.map(piece=>`<article class="earnedPiece"><details class="earnedPieceResult" data-piece-key="${esc(discoveryModuleKey(piece))}" ontoggle="rememberDiscoveryPiece(this)" ${discoveryExpandedPieces.has(discoveryModuleKey(piece))?'open':''}><summary><span class="discoveryPieceMark" aria-hidden="true">✦</span><span class="earnedPieceName">${esc(piece.title)}</span><span class="earnedPieceToggle" aria-hidden="true">⌄</span></summary><div class="earnedPieceBody">${renderDiscoveryResult(piece.result)}<p class="discoveryPieceHint">To offer this piece, open a Vibe connection and choose Add a game.</p></div></details></article>`).join('')}</div>`:`<p class="discoveryEmpty">${discoveryPiecesError?'Your game results could not be loaded.':discoveryPieces?'Results from optional connection games will appear here.':'Loading your game results…'}</p>`}${discoveryPiecesError?`<p class="error" role="alert">${esc(discoveryPiecesError)}</p>${discoveryButton('Try again','loadDiscoveryPieces(true)',discoveryPiecesRequest?'disabled':'')}`:''}`;
}
function discoveryProvenance(module){
 const sources=Array.isArray(module.sources)?module.sources.filter(source=>/^https:\/\//.test(source.url||'')):[];
 return module.provenance?`<details class="discoveryAbout"><summary>About this game</summary><p>${esc(module.provenance)}</p>${module.caution?`<p>${esc(module.caution)}</p>`:''}${sources.length?`<ul>${sources.map(source=>`<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a></li>`).join('')}</ul>`:''}</details>`:'';
}
function renderDiscoveryResult(result){
 if(!result)return '<p>Your result is not available yet.</p>';
 return `<div class="discoveryResult">${result.summary?`<p class="discoverySummary">${esc(result.summary)}</p>`:''}${Array.isArray(result.dimensions)?`<dl class="discoveryDimensions">${result.dimensions.map(d=>`<div><dt>${esc(d.label)}</dt><dd>${Number.isFinite(d.score)&&Number.isFinite(d.maxScore)?`<span class="discoveryScore">${esc(d.score)} / ${esc(d.maxScore)}</span>`:''}${d.description?`<p>${esc(d.description)}</p>`:''}</dd></div>`).join('')}</dl>`:''}${result.caution?`<p class="discoveryCaution">${esc(result.caution)}</p>`:''}</div>`;
}
function discoveryOwnerMatches(request){return s===request.state&&activeMemberId()===request.account}
function paintDiscovery(){
 syncDiscoveryOwner();
 const panel=$('connectionGames'),c=panel&&discoveryConnection(panel.dataset.connection);
 if(panel){if(c&&s.selectedChempat===c.id)panel.innerHTML=discoveryPanelContent(c);else panel.remove()}
 const pieces=$('earnedPieces');if(pieces){
  const focused=document.activeElement,focusKey=pieces.contains(focused)&&focused?.matches('summary')?focused.closest('.earnedPieceResult')?.dataset.pieceKey:null,scrollTop=pieces.querySelector('.earnedPieceGrid')?.scrollTop||0;
  pieces.innerHTML=discoveryPiecesContent(pieces.dataset.compact==='true');const count=$('gameResultsCount');if(count){count.textContent=discoveryPiecesCount();count.setAttribute('aria-label',discoveryPiecesCountLabel())}const grid=pieces.querySelector('.earnedPieceGrid');if(grid)grid.scrollTop=scrollTop;
  if(focusKey)[...pieces.querySelectorAll('.earnedPieceResult')].find(details=>details.dataset.pieceKey===focusKey)?.querySelector('summary')?.focus({preventScroll:true});
 }
}
function syncDiscoveryUI(){
 syncDiscoveryOwner();
 // Closing or switching a connection must never leave a previous pair's result open.
 if(s.modal==='discovery'&&!currentDiscoveryDialog()){changeModal('');renderModal()}
 const panel=$('connectionGames');if(panel)loadDiscovery(panel.dataset.connection);
 if($('earnedPieces'))loadDiscoveryPieces();
}
async function discoveryApi(url,body){
 const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
 let data;try{data=await response.json()}catch{throw Error('The game service did not respond. Try again.')}
 if(!response.ok)throw Object.assign(Error(data.error||'Could not load this game. Try again.'),{status:response.status,draftConflict:data.draftConflict===true});
 return data;
}
async function loadDiscovery(id,force=false){
 const c=discoveryConnection(id);if(!c||!discoveryConnectionId(c))return;
 const entry=discoveryEntry(c);if(entry.loading||entry.pending||(!force&&(entry.data||entry.error)))return;
 const request={state:s,account:activeMemberId(),revision:entry.revision,draftEpoch:discoveryDraftEpoch};entry.loading=request;entry.error='';paintDiscovery();
 try{
  const data=await discoveryApi(`/api/discovery?connection=${encodeURIComponent(discoveryConnectionId(c))}`);
  if(!discoveryOwnerMatches(request)||entry.loading!==request||entry.revision!==request.revision)return;
  if(!Array.isArray(data.modules)||!Array.isArray(data.games)||!Array.isArray(data.pieces))throw Error('The game service returned an incomplete response. Try again.');
  entry.data=data;if(request.draftEpoch===discoveryDraftEpoch)mergeDiscoveryDrafts(data);entry.updated=Date.now();mergeDiscoveryPieces(data.pieces);
 }catch(e){if(discoveryOwnerMatches(request)&&entry.loading===request&&entry.revision===request.revision){entry.error=e.message;if([401,403,404].includes(e.status))entry.data=null}}
 finally{
  if(entry.loading===request)entry.loading=null;
  if(discoveryOwnerMatches(request)){paintDiscovery();refreshDiscoveryDialog(entry,id)}
 }
}
async function loadDiscoveryPieces(force=false){
 syncDiscoveryOwner();if(!activeMemberId()||discoveryPiecesRequest||(!force&&(discoveryPieces||discoveryPiecesError)))return;
 const request={state:s,account:activeMemberId(),revision:discoveryPiecesRevision};discoveryPiecesRequest=request;discoveryPiecesError='';
 try{const data=await discoveryApi('/api/discovery?pieces=1');if(!discoveryOwnerMatches(request)||discoveryPiecesRequest!==request||discoveryPiecesRevision!==request.revision)return;if(!Array.isArray(data.pieces))throw Error('The game service returned an incomplete response. Try again.');mergeDiscoveryPieces(data.pieces)}
 catch(e){if(discoveryOwnerMatches(request)&&discoveryPiecesRequest===request&&discoveryPiecesRevision===request.revision)discoveryPiecesError=e.message}
 finally{if(discoveryPiecesRequest===request)discoveryPiecesRequest=null;if(discoveryOwnerMatches(request))paintDiscovery()}
}
function refreshDiscovery(){
 if(document.hidden)return;const panel=$('connectionGames'),c=panel&&discoveryConnection(panel.dataset.connection);
 if(c&&!discoveryEntry(c).error&&Date.now()-discoveryEntry(c).updated>=15000)loadDiscovery(c.id,true);
}
function currentDiscoveryDialog(){
 const dialog=discoveryDialog;
 return dialog&&s.modal==='discovery'&&dialog.state===s&&dialog.account===activeMemberId()&&dialog.modalVersion===modalVersion&&s.selectedChempat===dialog.connectionId&&discoveryConnection(dialog.connectionId)?dialog:null;
}
function openDiscoveryPicker(id){
 const c=discoveryConnection(id);if(!c||s.selectedChempat!==id)return;
 syncDiscoveryOwner();changeModal('discovery');
 discoveryDialog={state:s,account:activeMemberId(),modalVersion,connectionId:id,moduleId:'',screen:'picker',error:'',notice:'',returnFocus:document.activeElement,returnFocusAction:document.activeElement?.getAttribute('onclick')};
 renderModal();loadDiscovery(id,true);
}
function openDiscoveryGame(id,moduleId,version){
 const c=discoveryConnection(id);if(!c||s.selectedChempat!==id)return;
 const entry=discoveryEntry(c),module=entry.data?.modules.find(m=>m.id===moduleId&&(version===undefined||String(m.version)===String(version)));if(!module||entry.pending)return;
 if(!currentDiscoveryDialog())openDiscoveryPicker(id);
 const dialog=currentDiscoveryDialog();if(!dialog)return;
 dialog.moduleId=moduleId;dialog.moduleVersion=module.version;dialog.error='';dialog.notice='';
 const game=entry.data.games.find(g=>sameDiscoveryModule(g,module));
 const piece=(discoveryPieces||entry.data.pieces).find(p=>sameDiscoveryModule(p,module));dialog.screen=game?.own?.completed?'result':piece?'intro':game?.own?.started?'questions':'intro';renderDiscoveryModal();
}
function discoveryScreen(screen){
 const dialog=currentDiscoveryDialog();if(!dialog)return;
 if(discoveryEntry(discoveryConnection(dialog.connectionId)).pending)return;dialog.screen=screen;dialog.error='';dialog.notice='';renderDiscoveryModal();
}
function discoveryDraftRecord(module,game){
 const key=discoveryModuleKey(module);
 if(!discoveryDrafts.has(key))discoveryDrafts.set(key,{answers:{...(game?.own?.answers||{})},dirty:new Set(),revision:game?.own?.draftRevision||0,pending:null});
 return discoveryDrafts.get(key);
}
function discoveryDraft(entry,module,game){return discoveryDraftRecord(module,game).answers}
function mergeDiscoveryDrafts(data,submitted){
 for(const game of data.games){
  const module=data.modules.find(m=>sameDiscoveryModule(m,game));if(!module)continue;
  const record=discoveryDraftRecord(module,game),revision=game.own?.draftRevision||0;
  if(revision<record.revision)continue;
  if(submitted&&sameDiscoveryModule(module,submitted.module))for(const [question,value] of Object.entries(submitted.answers))if(record.answers[question]===value)record.dirty.delete(question);
  const merged={...(game.own?.answers||{})};for(const question of record.dirty)merged[question]=record.answers[question];
  record.answers=merged;record.revision=revision;
 }
}
function refreshDiscoveryDialog(entry,id){
 const dialog=currentDiscoveryDialog();if(dialog?.connectionId!==id)return;
 if(dialog.screen!=='questions'||!entry.data){renderDiscoveryModal();return}
 const module=entry.data.modules.find(m=>m.id===dialog.moduleId&&String(m.version)===String(dialog.moduleVersion));if(!module)return;
 const game=entry.data.games.find(g=>sameDiscoveryModule(g,module)),piece=(discoveryPieces||entry.data.pieces).find(p=>sameDiscoveryModule(p,module));
 if(game?.own?.completed||piece){dialog.screen=game?.own?.completed?'result':'intro';renderDiscoveryModal();return}
 const draft=discoveryDraft(entry,module,game);module.questions.forEach((question,index)=>{for(const input of document.querySelectorAll(`input[name="discovery-${index}"]`))input.checked=Number(input.value)===draft[question.id]});
 const count=$('discoveryAnswerCount');if(count)count.textContent=`${module.questions.filter(q=>draft[q.id]).length} of ${module.questions.length} answered`;
}
function chooseDiscoveryAnswer(question,value){
 const dialog=currentDiscoveryDialog();if(!dialog||dialog.screen!=='questions')return;
 const c=discoveryConnection(dialog.connectionId),entry=discoveryEntry(c),module=entry.data?.modules.find(m=>m.id===dialog.moduleId&&String(m.version)===String(dialog.moduleVersion)),game=entry.data?.games.find(g=>sameDiscoveryModule(g,module));
 if(!module||entry.pending||discoveryDraftRecord(module,game).pending||!module.questions.some(q=>q.id===question)||!Number.isInteger(value)||value<1||value>5)return;
 discoveryDraft(entry,module,game)[question]=value;discoveryDraftRecord(module,game).dirty.add(question);dialog.notice='Changes in this tab haven’t been saved yet.';
 const status=$('discoverySaveStatus');if(status)status.textContent=dialog.notice;
 const count=$('discoveryAnswerCount');if(count)count.textContent=`${module.questions.filter(q=>discoveryDraft(entry,module,game)[q.id]).length} of ${module.questions.length} answered`;
}
function renderDiscoveryModal(){
 const dialog=currentDiscoveryDialog();if(!dialog){if(s.modal==='discovery'){changeModal('');$('modalHost').innerHTML=''}return}
 const c=discoveryConnection(dialog.connectionId),entry=discoveryEntry(c),module=entry.data?.modules.find(m=>m.id===dialog.moduleId&&String(m.version)===String(dialog.moduleVersion)),game=entry.data?.games.find(g=>sameDiscoveryModule(g,module)),piece=(discoveryPieces||entry.data?.pieces||[]).find(p=>sameDiscoveryModule(p,module)),busy=!!entry.pending||!!(module&&discoveryDraftRecord(module,game).pending),disabled=busy?'disabled':'',action=(label,kind)=>discoveryButton(label,discoveryCall('discoveryAction',kind),disabled);
 let content='';
 if(!entry.data)content=`<h2 id="discoveryTitle">Choose a game together</h2><p>${entry.error?esc(entry.error):'Loading games…'}</p>${entry.error?discoveryButton('Try again',discoveryCall('loadDiscovery',c.id,true),entry.loading?'disabled':''):''}`;
 else if(dialog.screen==='picker'||!module)content=`<h2 id="discoveryTitle">Add a little discovery</h2><p>Pick something to explore with ${esc(c.name)}. Playing is optional; your answers stay private.</p><div class="discoveryPicker">${entry.data.modules.map(m=>{const g=entry.data.games.find(g=>sameDiscoveryModule(g,m)),p=(discoveryPieces||entry.data.pieces).find(p=>sameDiscoveryModule(p,m));return `<article><div class="eyebrow">${m.questions.length} QUESTIONS${p?' · PIECE EARNED':''}</div><h3>${esc(m.title)}</h3><p>${esc(m.description)}</p>${discoveryButton(g?.own?.completed?'View my piece':g?.own?.started?'Continue privately':p?'See my options':'Explore this game',discoveryCall('openDiscoveryGame',c.id,m.id,m.version),disabled)}</article>`}).join('')}</div>`;
 else if(dialog.screen==='intro')content=`<h2 id="discoveryTitle">${esc(module.title)}</h2><p>${esc(module.description)}</p>${discoveryProvenance(module)}<p class="discoveryPrivacy">${module.questions.length} questions, at your pace. Starting adds this game to your connection and lets ${esc(c.name)} know. Your answers and result stay private until you both complete the game and choose to share.</p>${piece?'':action('Start my private answers','start')}${piece?`<div class="discoveryExisting"><h3>You’ve already earned this piece</h3><p>You can offer your saved result to this connection without playing again.</p>${discoveryButton('Review my saved piece',"discoveryScreen('reuse')",disabled)}</div>`:''}`;
 else if(dialog.screen==='questions'){
  const draft=discoveryDraft(entry,module,game);
  content=`<h2 id="discoveryTitle">${esc(module.title)}</h2><p class="discoveryPrivacy">Just your answers. Save and come back whenever you like.</p><p id="discoveryAnswerCount" class="discoveryCount">${module.questions.filter(q=>draft[q.id]).length} of ${module.questions.length} answered</p><div class="discoveryQuestions">${module.questions.map((q,index)=>`<fieldset id="discoveryQuestion${index}" ${disabled}><legend>${index+1}. ${esc(q.text)}</legend><div class="discoveryScale">${module.scale.map(option=>`<label><input type="radio" name="discovery-${index}" value="${option.value}" ${draft[q.id]===option.value?'checked':''} onchange="${esc(discoveryCall('chooseDiscoveryAnswer',q.id,option.value))}"><span><b>${option.value}</b>${esc(option.label)}</span></label>`).join('')}</div></fieldset>`).join('')}</div><div class="discoveryFormActions">${action('Save progress','save')}${action('Finish & earn my piece','complete')}</div><p class="discoveryPrivacy">Finishing earns a piece on your page. It does not share it.</p>`;
 }else if(dialog.screen==='reuse')content=`<h2 id="discoveryTitle">Offer your ${esc(module.title)} piece?</h2>${renderDiscoveryResult(piece?.result)}<p class="discoveryPrivacy">This offers your saved result to ${esc(c.name)} and records your choice to share it in this connection. It appears to you both only after they complete this game and agree to share too. Your individual answers stay private.</p>${piece?action('Offer this piece & agree to share','reuse'):''}${discoveryButton('Not now',"discoveryScreen('intro')",disabled)}`;
 else if(dialog.screen==='share')content=`<h2 id="discoveryTitle">Share your piece with ${esc(c.name)}?</h2>${renderDiscoveryResult(game?.own?.result)}<p class="discoveryPrivacy">You’re choosing to share this result in this connection. Both results appear only after you both finish and agree to share. Your individual answers stay private.</p>${action('Agree to share my result','share')}${discoveryButton('Keep private for now',"discoveryScreen('result')",disabled)}`;
 else{
  const shared=game?.revealed===true&&game.sharedResults?.own&&game.sharedResults?.other;
  content=`<h2 id="discoveryTitle">${esc(module.title)}</h2>${shared?`<p class="discoveryPrivacy">You both chose to share these pieces with each other.</p><div class="discoveryComparison"><section><h3>Your piece</h3>${renderDiscoveryResult(game.sharedResults.own)}</section><section><h3>${esc(c.name)}’s piece</h3>${renderDiscoveryResult(game.sharedResults.other)}</section></div>`:`<span class="discoveryPrivate">Your earned piece</span>${renderDiscoveryResult(game?.own?.result)}<p class="discoveryPrivacy">${game?.own?.consent?`Your choice to share is saved. Waiting for ${esc(c.name)} to finish and agree to share too.`:'This result belongs to you. It stays private until you both finish and choose to share.'}</p>${game?.own?.completed&&!game.own.consent?discoveryButton('Choose whether to share',"discoveryScreen('share')",disabled):''}`}`;
 }
 const old=$('modalHost').querySelector('.discoveryModal'),hadFocus=old?.contains(document.activeElement),scroll=dialog.renderedScreen===dialog.screen?old?.scrollTop||0:0;dialog.renderedScreen=dialog.screen;
 $('modalHost').innerHTML=`<div class="modalBackdrop" onclick="closeInvite(event)"><section class="modal discoveryModal" role="dialog" aria-modal="true" aria-labelledby="discoveryTitle"><button class="close" type="button" aria-label="Close game" onclick="closeInvite()">×</button><div class="eyebrow">OPTIONAL · WITH ${esc(c.name)}</div>${content}<p id="discoverySaveStatus" class="discoverySaveStatus" role="status">${esc(busy?'Saving…':dialog.notice)}</p><p class="error" id="discoveryError" role="alert">${esc(dialog.error)}</p>${dialog.screen!=='picker'?discoveryButton('Back to games',"discoveryScreen('picker')",disabled):''}<p class="discoveryFootnote">A conversation starter, not a diagnosis or a compatibility verdict.</p></section></div>`;
 const modal=$('modalHost').querySelector('.discoveryModal');modal.scrollTop=scroll;
 if(!old||hadFocus)modal.querySelector('.close')?.focus();
}
async function discoveryAction(action){
 const dialog=currentDiscoveryDialog();if(!dialog)return;
 const c=discoveryConnection(dialog.connectionId),entry=discoveryEntry(c),module=entry.data?.modules.find(m=>m.id===dialog.moduleId&&String(m.version)===String(dialog.moduleVersion)),game=entry.data?.games.find(g=>sameDiscoveryModule(g,module));
 if(!module||entry.pending||discoveryDraftRecord(module,game).pending)return;
 const valid={start:'intro',save:'questions',complete:'questions',share:'share',reuse:'reuse'};
 if(dialog.screen!==valid[action])return;
 const answers=['save','complete'].includes(action)?{...discoveryDraft(entry,module,game)}:undefined;
 if(action==='complete'){
  const missing=module.questions.findIndex(q=>!Number.isInteger(answers[q.id])||answers[q.id]<1||answers[q.id]>5);
  if(missing!==-1){dialog.error='Answer every question before earning your piece. You can save your progress instead.';renderDiscoveryModal();$(`discoveryQuestion${missing}`)?.querySelector('input')?.focus();return}
 }
 const request={state:s,account:activeMemberId(),dialog,modalVersion,connectionId:dialog.connectionId,moduleId:module.id,moduleVersion:module.version};entry.pending=request;entry.revision++;if(answers)discoveryDraftRecord(module,game).pending=request;dialog.error='';dialog.notice='';renderDiscoveryModal();
 try{
  const data=await discoveryApi('/api/discovery',{action,connectionId:discoveryConnectionId(c),moduleId:module.id,version:module.version,...(answers?{answers,draftRevision:discoveryDraftRecord(module,game).revision}:{})});
  if(!discoveryOwnerMatches(request)||entry.pending!==request)return;
  if(!Array.isArray(data.modules)||!Array.isArray(data.games)||!Array.isArray(data.pieces))throw Error('The save response was interrupted. Try again to check your progress.');
  entry.data=data;discoveryDraftEpoch++;mergeDiscoveryDrafts(data,answers?{module,answers}:null);entry.error='';entry.updated=Date.now();mergeDiscoveryPieces(data.pieces);
  if(currentDiscoveryDialog()===dialog){dialog.screen=action==='start'||action==='save'?'questions':'result';dialog.notice=action==='save'?'Progress saved. Your answers are still private.':action==='complete'?'Piece earned. You haven’t shared it yet.':action==='share'||action==='reuse'?'Your sharing choice is saved for this connection.':''}
 }catch(e){if(discoveryOwnerMatches(request)){if([401,403,404].includes(e.status)){entry.data=null;entry.error=e.message}if(currentDiscoveryDialog()===dialog)dialog.error=e.message;if(e.status===409&&e.draftConflict&&answers)request.reloadDraft=true}}
 finally{
  if(entry.pending===request)entry.pending=null;const record=discoveryDrafts.get(discoveryModuleKey(module));if(record?.pending===request)record.pending=null;
  if(discoveryOwnerMatches(request)&&request.reloadDraft){await loadDiscovery(request.connectionId,true);if(currentDiscoveryDialog()===dialog)dialog.error='Newer saved answers were loaded. Your unsaved choices are kept; review them before saving again.'}
  if(discoveryOwnerMatches(request)){paintDiscovery();const open=currentDiscoveryDialog();if(open?.connectionId===request.connectionId){if(open!==dialog&&open.moduleId===request.moduleId&&String(open.moduleVersion)===String(request.moduleVersion)&&open.screen==='intro'){const current=entry.data?.games.find(g=>g.moduleId===open.moduleId&&String(g.version)===String(open.moduleVersion));if(current?.own?.started)open.screen=current.own.completed?'result':'questions'}renderDiscoveryModal()}else if(answers&&open?.moduleId===request.moduleId&&String(open.moduleVersion)===String(request.moduleVersion)){refreshDiscoveryDialog(discoveryEntry(discoveryConnection(open.connectionId)),open.connectionId);renderDiscoveryModal()}}
 }
}

// Five short rounds unlock choices. Reward answers stay in memory, never in walkthrough storage.
const REWARD_LABELS=['First 5','Second 5','Next 5','Next 5','Next 5'];
const REWARD_NAMES=['Send a vibe','Mutual phone exchange','Duhwildcards','Member discovery','15-second intro video'];
const REWARD_TILES=['Email','Cell','Duhwildcards','Be discovered','Your 15 seconds'];
const REWARD_BENEFITS=['Invite by email','Both choose to share','3 each per connection','Opt-in name & photo','Private until you publish'];
const REWARD_DETAILS=['Send a vibe invitation by email; your email address stays private.','Share phone numbers only after you both finish Second 5 and both opt in.','Unlock 3 Duhwildcards per person, per connection. Play with an accepted Friend or a Vibe connection where you both opened chat.','Let eligible signed-in members discover your name and photo, only if you opt in.','Save a 15-second intro privately and publish it only if you choose.'];
const REWARD_NEXT=['email Vibe invitations','mutual phone exchange','3 Duhwildcards each per connection','opt-in member discovery','your private 15-second intro'];
const GAME_PIECE_COPY=[
 {hook:'Make the first move.',description:'Five secrets. One intriguing invitation. Send a Vibe by email and give someone a reason to play along.',choice:'Your email stays private. They choose whether to join; going further takes both of you.',action:'Send a vibe →'},
 {hook:'Take the vibe off-screen.',description:'Got a connection worth another round? Your Second 5 unlocks the option to exchange numbers in a Vibe chat.',choice:'Both people must finish Second 5 and separately offer their numbers. Numbers appear only when you both opt in.',action:'My phone options →'},
 {hook:'Three cards. Ask something good.',description:'Spend a Duhwildcard on a question you actually want answered. After Step 3, each person gets 3 cards per connection with an accepted Friend or a Vibe chat you both opened. Answering is free.',choice:'They decide whether to answer. A card never opens chat or shares contact details.',action:'Play a card →'},
 {hook:'Let curiosity come to you.',description:'Step into member discovery. Browse the possibilities, then choose whether your name and photo join the mix.',choice:'Listing is opt-in and visible only to eligible signed-in members. Your email, phone and private answers stay out.',action:'Explore discovery →'},
 {hook:'Give them a reason to press play.',description:'A grin. A hello. A little of your kind of wild. Give your name and photo a 15-second spark with an intro video.',choice:'Upload privately first. It appears in member discovery only when you choose to list your profile and publish the clip.',note:'MP4 (H.264) · Up to 15 seconds · 2 MiB max',action:'My intro video →'}
];
// This explains the existing rewards; eligibility and actions use the same saved state.
function gamePieceCardsContent(){
 const known=!!rewardsData&&!rewardsAuthError,level=rewardLevel();
 const notice=rewardsAuthError?`<p class="gamePieceProgressNotice" role="alert">${esc(rewardsAuthError)} ${rewardButton('Sign in again','showSignin()')}</p>`:!known||rewardsError?`<p class="gamePieceProgressNotice" role="status">${rewardsError?'Your progress couldn’t refresh. Your saved rewards haven’t changed.':'Checking which pieces you’ve unlocked…'} ${rewardButton('Check progress','loadRewards(true)',!!rewardsLoading)}</p>`:'';
 return `${notice}<div class="gamePieceCardGrid">${GAME_PIECE_COPY.map((copy,i)=>{
  const n=i+1,earned=known&&n<=level,next=known&&n===level+1,status=!known?'Checking progress':earned?'Yours to play':next?'Your next unlock':`Unlocks at Step ${n}`;
  const action=earned?["inviteMode('send')",'openRewardLevel(2)','openWildcardConnections()',"openRewardDirectory('directory')","openRewardDirectory('video')"][i]:rewardCall('openRewardLevel',Math.min(n,level+1));
  const label=earned?copy.action:`Play Step ${Math.min(n,level+1)} →`;
  return `<article class="gamePieceCard ${earned?'earned':next?'next':'locked'}" aria-labelledby="gamePieceTitle${n}"><div class="gamePieceCardTop"><span class="gamePieceCardIcon">${rewardIcon(['email','cell','spark','photo','play'][i])}</span><span class="gamePieceCardStep">PIECE 0${n}</span><span class="gamePieceCardStatus">${esc(status)}</span></div><h3 id="gamePieceTitle${n}">${esc(REWARD_TILES[i])}</h3><p class="gamePieceHook">${esc(copy.hook)}</p><p class="gamePieceDescription">${esc(copy.description)}</p><p class="gamePieceConsent"><b>Your call:</b> ${esc(copy.choice)}</p>${copy.note?`<p class="gamePieceFormat">${esc(copy.note)}</p>`:''}<div class="gamePieceCardAction"><button type="button" class="button rewardButton ${earned||next?'rewardPrimary':'light'}" id="gamePieceAction${n}" data-game-piece-action="${n}" onclick="${esc(action)}" ${!known?'disabled':''}>${esc(known?label:'Checking progress…')}</button>${known&&!earned?`<span>${next?'This one’s next. Five choices unlock it.':`Step ${n} is ahead. Start with Step ${level+1}.`}</span>`:''}</div></article>`;
 }).join('')}</div>`;
}
function paintGamePieceCards(){
 const panel=$('gamePieceCards');if(!panel)return;
 const focused=panel.contains(document.activeElement)?document.activeElement?.dataset.gamePieceAction:null;
 panel.innerHTML=gamePieceCardsContent();const progress=$('gamePiecesProgress');if(progress){progress.textContent=rewardsData?`${rewardLevel()} / 5`:'…';progress.setAttribute('aria-label',rewardsData?`${rewardLevel()} of 5 game pieces unlocked`:'Checking unlocked game pieces')}
 if(focused){const button=panel.querySelector(`[data-game-piece-action="${focused}"]`);if(button&&!button.disabled)button.focus({preventScroll:true});else $('gamePieces')?.querySelector(':scope > summary')?.focus({preventScroll:true})}
}
function rewardIcon(name){
 const paths={email:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',cell:'<rect x="7" y="2" width="10" height="20" rx="3"/><path d="M10 5h4m-3 14h2"/>',spark:'<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z"/>',photo:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',play:'<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/>',check:'<path d="m5 12 4 4L19 6"/>',lock:'<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'};
 return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]||''}</svg>`;
}
let rewardsEpoch=0,rewardsAuthError='',rewardsOwner=null,rewardsAccount='',rewardsData=null,rewardsError='',rewardsLoading=null,rewardsPending=null,rewardsRevision=0,rewardsUpdated=0,rewardDrafts=new Map(),rewardConnections=new Map(),rewardStatuses=new Map(),rewardDialog=null,rewardPhoneDraft=null,rewardDirectory=null,rewardProfiles=[],rewardRequests={incoming:[],outgoing:[]},rewardCursor=null,rewardDirectoryLoading=null,rewardDirectoryPending=null,rewardDirectoryRevision=0;
function syncRewardOwner(){
 if(rewardsOwner===s&&rewardsAccount===activeMemberId())return;
 rewardsEpoch++;rewardsAuthError='';rewardsOwner=s;rewardsAccount=activeMemberId();rewardsData=null;rewardsError='';rewardsLoading=null;rewardsPending=null;rewardsRevision++;rewardsUpdated=0;rewardDrafts=new Map();rewardConnections=new Map();rewardStatuses=new Map();rewardDialog=null;rewardPhoneDraft=null;rewardDirectory=null;rewardProfiles=[];rewardRequests={incoming:[],outgoing:[]};rewardCursor=null;rewardDirectoryLoading=null;rewardDirectoryPending=null;rewardDirectoryRevision++;
}
const rewardOwnerMatches=r=>!!r&&r.state===s&&r.account===activeMemberId()&&r.epoch===rewardsEpoch;
function invalidateRewardAccess(error){
 rewardsEpoch++;rewardsRevision++;rewardDirectoryRevision++;rewardsAuthError=error?.message||'Please sign in again to see your private rewards.';rewardsData=null;rewardsError='';rewardsLoading=null;rewardsPending=null;rewardsUpdated=0;rewardDrafts.clear();rewardConnections.clear();rewardStatuses.clear();rewardDirectory=null;rewardProfiles=[];rewardRequests={incoming:[],outgoing:[]};rewardCursor=null;rewardDirectoryLoading=null;rewardDirectoryPending=null;rewardDialog=null;rewardPhoneDraft=null;wildcardEpoch++;wildcardTargets.clear();wildcardConnections.clear();wildcardPairs.clear();wildcardSummary.clear();wildcardSummaryRevision++;wildcardSummaryLoading=null;wildcardSummaryUpdated=0;wildcardSummaryQueued=false;wildcardDialog=null;gamePieceDialog=null;gamePiecePhoneRequests.clear();gamePiecePhonesUpdated=0;gamePiecePhonesRevision++;gamePiecePhonesLoading=null;gamePieceAutoUsed=true;gamePieceFeed=[];gamePieceFeedRevision++;gamePieceFeedLoading=null;gamePieceFeedUpdated=0;gamePieceConnections.clear();gamePieceHydrationLoading.clear();paintGamePieceFeed();
 if(s.modal==='gamePiece'){changeModal('');renderModal()}
 if(s.modal==='wildcard'){changeModal('');renderModal()}
 if(s.modal==='reward'){changeModal('');renderModal()}paintRewards();
}
async function rewardApi(url,body){
 const request={state:s,account:activeMemberId(),epoch:rewardsEpoch};
 const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{'x-chempat-member-id':request.account,...(body?{'content-type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 let data;try{data=await response.json()}catch{data={error:'The rewards service did not respond. Try again.'}}
 if(!response.ok){const error=Object.assign(Error(data.error||'Could not load your rewards. Try again.'),{status:response.status,draftConflict:data.draftConflict===true,phoneConflict:data.phoneConflict===true});if(rewardOwnerMatches(request)&&[401,403].includes(error.status))invalidateRewardAccess(error);throw error}return data;
}
const rewardLevel=()=>rewardsData?.level??0;
const rewardCall=(fn,...args)=>`${fn}(${args.map(value=>JSON.stringify(value)).join(',')})`;
const rewardButton=(label,action,disabled=false,primary=false)=>`<button type="button" class="button ${primary?'rewardPrimary':'light'} rewardButton" onclick="${esc(action)}" ${disabled?'disabled':''}>${esc(label)}</button>`;
// The profile number is owner-only memory; it is never copied into walkthrough storage.
function rewardPhoneProfile(){return rewardsData?.phoneProfile||{phone:null,confirmedAt:null,revision:0}}
function privatePhoneDraft(){
 const profile=rewardPhoneProfile();
 if(!rewardPhoneDraft)rewardPhoneDraft={value:profile.phone||'',revision:profile.revision,dirty:false,editing:!profile.phone,needsReview:false,error:'',notice:''};
 return rewardPhoneDraft;
}
function mergePrivatePhoneDraft(){
 if(!rewardPhoneDraft)return;const profile=rewardPhoneProfile(),draft=rewardPhoneDraft;
 if(profile.revision<=draft.revision)return;
 if(draft.dirty){draft.needsReview=true;draft.notice='';return}
 draft.value=profile.phone||'';draft.revision=profile.revision;draft.editing=!profile.phone;draft.needsReview=false;draft.error='';draft.notice='';
}
function privatePhoneContext(scope='reward'){if(rewardsAuthError||rewardLevel()<2)return null;const d=scope==='profile'?currentMemberProfile():currentRewardDialog();return scope==='profile'?d&&!d.blocked?d:null:d&&d.screen==='level'&&d.level===2?d:null}
function privatePhoneInputId(scope){return scope==='profile'?'memberProfilePhone':'rewardProfilePhone'}
function paintPrivatePhoneContext(scope){if(scope==='profile')paintMemberProfilePhone();else if(currentRewardDialog())renderRewardModal()}
function editRewardProfilePhone(scope='reward'){const d=privatePhoneContext(scope);if(!d||rewardsPending)return;const draft=privatePhoneDraft();draft.editing=true;draft.error='';draft.notice='';paintPrivatePhoneContext(scope);$(privatePhoneInputId(scope))?.focus()}
function updateRewardProfilePhone(value,scope='reward'){const d=privatePhoneContext(scope);if(!d||rewardsPending)return;const draft=privatePhoneDraft();draft.value=value;draft.dirty=true;draft.editing=true;draft.error='';draft.notice=''}
function reviewRewardProfileConflict(useSaved=false,scope='reward'){
 const d=privatePhoneContext(scope);if(!d||rewardsPending)return;const draft=privatePhoneDraft(),profile=rewardPhoneProfile();
 if(!draft.needsReview)return;draft.revision=profile.revision;draft.needsReview=false;draft.error='';draft.notice='Review the number, then confirm it to save privately.';
 if(useSaved){draft.value=profile.phone||'';draft.dirty=false;draft.editing=!profile.phone}
 paintPrivatePhoneContext(scope);if(draft.editing)$(privatePhoneInputId(scope))?.focus();
}
async function confirmRewardProfilePhone(scope='reward'){
 const d=privatePhoneContext(scope);if(!d||rewardsPending)return;
 const draft=privatePhoneDraft();if(draft.needsReview)return;const input=$(privatePhoneInputId(scope));if(input&&input.value!==draft.value)updateRewardProfilePhone(input.value,scope);
 const phone=draft.value.trim();if(phone.length>64||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15||!/^\+[1-9][\d\s().-]+$/.test(phone)){draft.error='Enter a valid phone number, including your country code.';paintPrivatePhoneContext(scope);$(privatePhoneInputId(scope))?.focus();return}
 draft.dirty=true;const request={state:s,account:activeMemberId(),epoch:rewardsEpoch,dialog:d,kind:'phoneProfile'};rewardsPending=request;rewardsRevision++;draft.error='';draft.notice='';paintPrivatePhoneContext(scope);
 try{
  const data=await rewardApi('/api/rewards',{action:'confirmProfilePhone',phone,phoneRevision:draft.revision});
  if(!rewardOwnerMatches(request)||rewardsPending!==request)return;
  if(!data.phoneProfile?.phone||!data.phoneProfile.confirmedAt||!Number.isInteger(data.phoneProfile.revision)||data.phoneProfile.revision<=draft.revision)throw Error('Refresh your saved number to check whether it was confirmed. Your entry is kept.');
  acceptRewards(data);rewardPhoneDraft=null;const saved=privatePhoneDraft();saved.notice='Confirmed and saved privately. No phone offer was sent.';
 }catch(e){
  if(!rewardOwnerMatches(request))return;draft.error=e.message;
  if(e.phoneConflict){
   draft.needsReview=true;
   try{const data=await rewardApi('/api/rewards');if(!rewardOwnerMatches(request))return;acceptRewards(data);draft.error='Your saved number changed elsewhere. Review it below before confirming your choice.'}
   catch(error){if(rewardOwnerMatches(request))draft.error=`${error.message} Your entry is kept. Refresh before trying again.`}
  }
 }finally{if(rewardsPending===request)rewardsPending=null;if(rewardOwnerMatches(request)){paintRewards();if(currentRewardDialog())renderRewardModal()}}
}
function renderPrivateRewardPhone(scope='reward'){
 const prefix=scope==='profile'?'member':'reward',profile=rewardPhoneProfile(),draft=privatePhoneDraft(),busy=!!rewardsPending,call=(fn,...args)=>scope==='profile'?rewardCall(fn,...args,'profile'):rewardCall(fn,...args);
 return `<section class="rewardPrivatePhone" aria-labelledby="${prefix}PrivatePhoneTitle"><div class="rewardPrivatePhoneHeading"><h3 id="${prefix}PrivatePhoneTitle">Your private phone number</h3><span>Only you</span></div><p id="${prefix}ProfilePhoneHelp">Confirm this is your number. It stays private until you separately offer it to a named connection. No text message is sent.</p>${draft.editing?`<label class="field" for="${prefix}ProfilePhone">Phone number with country code<input id="${prefix}ProfilePhone" type="tel" inputmode="tel" autocomplete="tel" maxlength="64" placeholder="+1 555 123 4567" value="${esc(draft.value)}" aria-describedby="${prefix}ProfilePhoneHelp${draft.error?` ${prefix}ProfilePhoneError`:''}" ${draft.error?'aria-invalid="true"':''} oninput="updateRewardProfilePhone(this.value,'${scope}')" ${busy?'disabled':''}></label>`:`<p class="rewardSavedPhone"><b>${esc(profile.phone)}</b><small>${profile.confirmedAt?'Confirmed by you':'Saved number · please confirm'}</small></p>`}${draft.needsReview?`<div class="rewardPhoneConflict"><p>A newer saved number is ${profile.phone?`<b>${esc(profile.phone)}</b>`:'not available yet'}. Your entry is kept.</p>${rewardButton('Keep my entry for review',call('reviewRewardProfileConflict',false),busy||profile.revision<=draft.revision)}${rewardButton('Use saved number',call('reviewRewardProfileConflict',true),busy||profile.revision<=draft.revision)}${profile.revision<=draft.revision?rewardButton('Refresh saved number','loadRewards(true)',busy||!!rewardsLoading):''}</div>`:''}<div class="rewardPrivatePhoneActions">${rewardButton(draft.editing?'Confirm & save privately':'Confirm this number',call('confirmRewardProfilePhone'),busy||draft.needsReview,!profile.confirmedAt||draft.editing)}${!draft.editing?rewardButton('Edit number',call('editRewardProfilePhone'),busy):''}</div><p id="${prefix}ProfilePhoneStatus" role="status">${esc(draft.notice)}</p><p id="${prefix}ProfilePhoneError" class="error" role="alert">${esc(draft.error)}</p></section>`;
}
function renderRewardStepTrail(viewed){
 const completed=rewardLevel(),known=!!rewardsData;
 return `<nav class="rewardStepTrail" aria-label="Your five reward steps"><ol>${REWARD_TILES.map((label,i)=>{const step=i+1,state=!known?'pending':step<=completed?'completed':step===completed+1?'current':'locked',status=state==='completed'?'Complete':state==='current'?'Next':state==='locked'?'Locked':'Checking';return `<li><button type="button" class="rewardStep ${state}${step===viewed?' viewing':''}" data-reward-step="${step}" onclick="openRewardTile(${step})" aria-label="Step ${step}, ${esc(REWARD_NAMES[i])}, ${status}. ${state==='completed'?'View completed reward':state==='locked'?'View locked reward details':'View step'}" ${step===viewed?'aria-current="step"':''}><span class="rewardStepNumber">${state==='completed'?rewardIcon('check'):state==='locked'?rewardIcon('lock'):step}</span><b>${esc(label)}</b><small>${step} · ${status}</small></button></li>`}).join('')}</ol></nav>`;
}
function rewardConnection(id=s.selectedChempat){return memberConnections().find(c=>c.id===id&&!isFriend(c)&&!inactiveConnection(c)&&!(c.status==='invited'&&c.claimed===false))}
function rewardRealId(c){return c.id==='first'?s.liveId:c.id}
function rewardConnectionData(c){return c?rewardConnections.get(rewardRealId(c))?.data:null}
function rewardBadge(c){return !rewardsAuthError&&c&&!inactiveConnection(c)&&(c.upgraded===true||rewardStatuses.get(rewardRealId(c))?.upgraded===true||rewardConnectionData(c)?.upgraded===true)}
function renderRewardLadder(){if(!activeMemberId())return '';syncRewardOwner();return `<section class="rewardLadder" id="rewardLadder" aria-labelledby="rewardLadderTitle">${rewardLadderContent()}</section>`}
function rewardNextAnswered(){
 if(!rewardsData||rewardLevel()>=5)return null;
 const next=rewardLevel()+1;
 if(next===1){const answers=owner().answers;return Array.isArray(answers)?QUESTIONS.slice(0,5).filter((q,i)=>Number.isInteger(answers[i])&&answers[i]>=0&&answers[i]<q.a.length).length:null}
 const round=rewardRound(next),answers=rewardDrafts.get(next)?.answers||rewardsData.answers;
 if(!round||!answers||typeof answers!=='object'||Array.isArray(answers))return null;
 return round.questions.filter(q=>Object.hasOwn(answers,q.id)&&q.choices.some(choice=>choice.value===answers[q.id])).length;
}
function rewardLadderContent(){
 if(rewardsAuthError)return `<div class="rewardLadderHeading"><h2 id="rewardLadderTitle">Your rewards are private</h2></div><p class="rewardLoadError" role="alert">${esc(rewardsAuthError)}</p>${rewardButton('Check my sign-in','loadRewards(true)',!!rewardsLoading)}${rewardButton('Sign in again','showSignin()')}`;
 const level=rewardLevel(),known=!!rewardsData,next=Math.min(5,level+1),answered=rewardNextAnswered();
 const nextText=!known?'Your rewards come from saved progress.':level===5?'All five unlocked. Your choices stay yours.':answered===null?`Next reward: ${REWARD_NEXT[next-1]}. Open it to check your progress.`:next===1&&answered===5?'Five picked. Check saved progress for your email Vibe invitations.':answered===5?`Five picked. Review and unlock ${REWARD_NEXT[next-1]}.`:`${5-answered} ${answered===4?'pick':'picks'} left to unlock ${REWARD_NEXT[next-1]}.`;
 return `<div class="rewardLadderHeading"><h2 id="rewardLadderTitle">Your profile steps</h2><div class="rewardLadderMeta"><span>${known?`${level} / 5 unlocked`:'Checking saved progress'}</span></div></div><ol class="rewardSlots">${REWARD_TILES.map((label,i)=>{const n=i+1,state=!known?'pending':n<=level?'unlocked':n===next?'current':'locked',status=state==='unlocked'?'Earned':state==='current'?'Next':state==='locked'?'Locked':'Checking';return `<li><button type="button" class="rewardSlot ${state}" data-reward-level="${n}" onclick="openRewardTile(${n})" aria-label="Level ${n}, ${esc(label)}, ${esc(REWARD_NAMES[i])}, ${status}. ${esc(REWARD_BENEFITS[i])}. View reward details" ${state==='current'?'aria-current="step"':''}><span class="rewardSlotTop" aria-hidden="true"><span>${n}</span><span class="rewardSlotState">${state==='unlocked'?rewardIcon('check'):state==='locked'?rewardIcon('lock'):state==='current'?'→':'·'}</span></span><span class="rewardSlotMark">${rewardIcon(['email','cell','spark','photo','play'][i])}</span><b>${i===3?'Be dis<wbr>covered':label}</b><small class="rewardSlotBenefit">${esc(REWARD_BENEFITS[i])}</small><span class="rewardSlotStatus">${status}</span></button></li>`}).join('')}</ol><div class="rewardNext"><span>${esc(nextText)}</span>${rewardButton(!known?'Check progress':level===5?'My rewards':next===1&&answered===5?'Check saved progress →':answered===5?'Review & unlock →':answered===null?'View next reward →':answered>0?'Continue →':'Play five →',!known||next===1&&answered===5?'loadRewards(true)':rewardCall('openRewardLevel',level<5?next:5),(!known||next===1&&answered===5)&&!!rewardsLoading,true)}</div>${rewardsError?`<p class="rewardLoadError" role="status">Rewards couldn’t refresh. ${rewardButton('Try again','loadRewards(true)',!!rewardsLoading)}</p>`:''}`;
}
function renderRewardConnection(c){if(!c||!rewardConnection(c.id))return '';return `<div class="rewardConnection" data-reward-connection="${esc(c.id)}">${rewardConnectionContent(c)}</div>`}
function rewardPhoneReadiness(c,phone){
 const own=rewardPhoneProfile(),self=phone?.ownOffered?'Offer sent':own.confirmedAt?'Number confirmed':own.phone?'Confirm your saved number':'Add your number';
 const other=phone?.otherOffered?'Offer sent':!phone?'Checking readiness':!phone.ownEligible?'Finish your Second 5 to check readiness':!phone.otherEligible?'Second 5 needed':phone.otherProfileConfirmed?'Number confirmed':'Number not confirmed';
 return `<div class="rewardPhoneReadiness"><span><b>You</b> · ${esc(self)}</span><span><b>${esc(c.name)}</b> · ${esc(other)}</span></div>`;
}
function rewardConnectionContent(c){
 if(rewardsAuthError)return `<span class="rewardConnectionHint">Check your sign-in before phone exchange.</span>${rewardButton('Check my sign-in','loadRewards(true)',!!rewardsLoading)}`;
 const data=rewardConnectionData(c),phone=data?.phone,profile=rewardPhoneProfile();
 return `${rewardBadge(c)?'<span class="gettingCloser">✦ Getting closer</span>':''}${rewardButton(phone?.shared?'Phone exchange':phone?.ownOffered?'Phone offer sent':'Exchange phones',rewardCall('openRewardPhone',c.id))}<span class="rewardConnectionHint">${phone?.shared?'Both of you opted in':phone?.ownOffered?`Waiting for ${esc(c.name)} to opt in`:'Only when you both choose'}</span>${rewardLevel()>=2?`${rewardPhoneReadiness(c,phone)}${!profile.confirmedAt&&!phone?.ownOffered?rewardButton(profile.phone?'Confirm my number':'Add my number','openRewardLevel(2)'):''}`:''}`;
}

function paintRewardLadder(){const ladder=$('rewardLadder');if(ladder){const focused=ladder.contains(document.activeElement)?document.activeElement:null,level=focused?.dataset.rewardLevel,detail=focused?.id==='gamePiecesDetailLink';ladder.innerHTML=rewardLadderContent();if(level)(ladder.querySelector(`[data-reward-level="${level}"]`)||document.querySelector('#profileProgress > summary'))?.focus({preventScroll:true});else if(detail)$('gamePiecesDetailLink')?.focus({preventScroll:true})}}
function paintRewards(){
 syncRewardOwner();paintRewardLadder();paintDashboardProgress();paintGamePieceCards();
 for(const panel of document.querySelectorAll('[data-reward-connection]')){const c=rewardConnection(panel.dataset.rewardConnection);if(c)panel.innerHTML=rewardConnectionContent(c);else panel.remove()}
 for(const badge of document.querySelectorAll('[data-reward-badge]')){const c=memberConnections().find(c=>c.id===badge.dataset.rewardBadge);badge.textContent=rewardBadge(c)?'✦ Getting closer':'';badge.hidden=!rewardBadge(c)}
 syncWildcardUI();paintMemberProfilePhone();
}
function syncRewardUI(){
 syncRewardOwner();if(s.modal==='reward'&&!currentRewardDialog()){changeModal('');renderModal()}
 if($('rewardLadder'))loadRewards();const c=rewardConnection();if(c&&document.querySelector('[data-reward-connection]'))loadRewardConnection(c.id);
}
function refreshRewardDialog(){
 const d=currentRewardDialog(),round=d&&rewardRound(d.level);if(!d)return;
 if(d.screen==='phone'&&!d.phoneDirty&&!d.phone&&rewardPhoneProfile().confirmedAt)d.phone=rewardPhoneProfile().phone||'';
 if(d.screen!=='level'||d.level!==rewardLevel()+1||!round||!document.querySelector('.rewardQuestions')){renderRewardModal();return}
 const draft=rewardDraft(d.level);round.questions.forEach((q,index)=>{for(const input of document.querySelectorAll(`input[name="reward-${index}"]`))input.checked=String(draft.answers[q.id])===input.value});const count=$('rewardAnswerCount');if(count)count.textContent=`${round.questions.filter(q=>Object.hasOwn(draft.answers,q.id)).length} of 5 answered`;const progress=$('rewardProgress');if(progress)progress.value=round.questions.filter(q=>Object.hasOwn(draft.answers,q.id)).length;
}
function rewardRound(level){
 const round=Array.isArray(rewardsData?.rounds)?rewardsData.rounds.find(round=>round?.level===level):null;
 return Array.isArray(round?.questions)&&round.questions.length===5&&round.questions.every(q=>q&&typeof q.id==='string'&&Array.isArray(q.choices)&&q.choices.length&&q.choices.every(choice=>choice&&Number.isInteger(choice.value)))&&new Set(round.questions.map(q=>q.id)).size===5?round:null;
}
function rewardDraft(level){if(!rewardDrafts.has(level))rewardDrafts.set(level,{answers:{},dirty:new Set()});return rewardDrafts.get(level)}
function acceptRewards(data,submitted){
 if(!Number.isInteger(data.level)||data.level<0||data.level>5||!Array.isArray(data.rounds)||!data.answers||!Number.isInteger(data.draftRevision))throw Error('Rewards returned an incomplete response. Try again.');
 if(data.phoneProfile&&(!Number.isInteger(data.phoneProfile.revision)||data.phoneProfile.revision<0||data.phoneProfile.phone!==null&&typeof data.phoneProfile.phone!=='string'||data.phoneProfile.confirmedAt!==null&&typeof data.phoneProfile.confirmedAt!=='string'))throw Error('Your saved phone number could not be loaded. Try again.');
 const previousPhone=rewardsData?.phoneProfile;data={...data,phoneProfile:!data.phoneProfile||previousPhone&&previousPhone.revision>data.phoneProfile.revision?previousPhone:data.phoneProfile};
 if(rewardsData&&data.draftRevision<rewardsData.draftRevision){if(data.phoneProfile)rewardsData={...rewardsData,phoneProfile:data.phoneProfile};mergePrivatePhoneDraft();return}
 rewardsData=data;mergePrivatePhoneDraft();rewardsAuthError='';rewardsError='';rewardsUpdated=Date.now();if(Array.isArray(data.connections))rewardStatuses=new Map(data.connections.map(c=>[c.id,c]));
 for(const round of Array.isArray(data.rounds)?data.rounds:[]){if(!rewardRound(round?.level))continue;const draft=rewardDraft(round.level);if(submitted?.level===round.level)for(const [id,value] of Object.entries(submitted.answers))if(draft.answers[id]===value)draft.dirty.delete(id);const merged={};for(const q of round.questions)if(Object.hasOwn(data.answers,q.id))merged[q.id]=data.answers[q.id];for(const id of draft.dirty)merged[id]=draft.answers[id];draft.answers=merged}
 // Completing the personal second five does not advance any connection's consent.
 const second=rewardRound(2);if(data.level>=2&&second?.questions?.length===5&&owner().answers?.length===5){const values=second.questions.map(q=>data.answers[q.id]);if(values.every(Number.isInteger)){const all=[...owner().answers,...values];if(s.account)s.account.answers=[...all];if(s.actor==='member')s.member.answers=all;else s.prospect.answers=all;save()}}
}
async function loadRewards(force=false){
 syncRewardOwner();if(!activeMemberId()||rewardsLoading||rewardsPending||(!force&&rewardsAuthError)||(!force&&(rewardsData||rewardsError)))return;
 let finish;const request={state:s,account:activeMemberId(),epoch:rewardsEpoch,revision:rewardsRevision,done:new Promise(resolve=>{finish=resolve})};rewardsLoading=request;
 try{const data=await rewardApi('/api/rewards');if(!rewardOwnerMatches(request)||request.revision!==rewardsRevision)return;acceptRewards(data)}catch(e){if(rewardOwnerMatches(request)&&request.revision===rewardsRevision){rewardsError=e.message;if([401,403].includes(e.status)){rewardsData=null;rewardDrafts.clear()}}}
 finally{if(rewardsLoading===request)rewardsLoading=null;finish();if(rewardOwnerMatches(request)){paintRewards();if(currentRewardDialog()&&!rewardsPending)refreshRewardDialog()}}
}
async function loadRewardConnection(id,force=false){
 syncRewardOwner();const c=rewardConnection(id);if(rewardsAuthError||!c||!['chat','secondResults','email','tests'].includes(c.status))return;const realId=rewardRealId(c);if(!realId)return;let entry=rewardConnections.get(realId);if(!entry){entry={data:null,error:'',pending:null,loading:null,updated:0,revision:0};rewardConnections.set(realId,entry)}if(entry.loading||entry.pending||(!force&&(entry.data||entry.error)))return;
 const request={state:s,account:activeMemberId(),epoch:rewardsEpoch,revision:entry.revision};entry.loading=request;
 try{const data=await rewardApi(`/api/rewards?connection=${encodeURIComponent(realId)}`);if(!rewardOwnerMatches(request)||entry.revision!==request.revision)return;if(!data.connection)throw Error('Phone exchange is unavailable. Try again.');entry.data=data.connection;entry.error='';entry.updated=Date.now()}
 catch(e){if(rewardOwnerMatches(request)&&entry.revision===request.revision){entry.error=e.message;if([401,403,404].includes(e.status))entry.data=null}}
 finally{if(entry.loading===request)entry.loading=null;if(rewardOwnerMatches(request)){paintRewards();const dialog=currentRewardDialog();if(dialog?.connectionId===id)renderRewardModal()}}
}
function currentRewardDialog(){const d=rewardDialog;return d&&s.modal==='reward'&&rewardOwnerMatches(d)&&d.modalVersion===modalVersion&&(!d.connectionId||(s.selectedChempat===d.connectionId&&rewardConnection(d.connectionId)))?d:null}
function newRewardDialog(screen,extra={}){syncRewardOwner();if(!activeMemberId()||rewardsAuthError)return null;const previous=currentRewardDialog(),returnFocus=previous?.returnFocus||document.activeElement;changeModal('reward');rewardDialog={state:s,account:activeMemberId(),epoch:rewardsEpoch,modalVersion,screen,level:0,error:'',notice:'',returnFocus,returnFocusAction:previous?.returnFocusAction||returnFocus?.getAttribute('onclick'),...extra};return rewardDialog}
function openRewardLevel(level){
 syncRewardOwner();if(!activeMemberId()||rewardsAuthError||!Number.isInteger(level)||level<1||level>5)return;
 if(level===1&&rewardsData&&rewardLevel()===0&&rewardNextAnswered()!==5){if(s.modal)closeInvite();createMyVibe();return}
 const d=newRewardDialog('level',{level});if(!d)return;renderModal();if(!rewardsData)loadRewards(true);
}
function openRewardTile(level){
 // The first tile explains its reward before handing off to the existing First 5 flow.
 if(level===1&&rewardsData&&rewardLevel()===0){const d=newRewardDialog('level',{level});if(d)renderModal();return}
 openRewardLevel(level);
}
function rewardScreen(screen){const d=currentRewardDialog();if(!d||rewardsPending||rewardDirectoryPending)return;d.screen=screen;d.error='';d.notice='';renderRewardModal()}
function chooseRewardAnswer(id,value){const d=currentRewardDialog(),round=d&&rewardRound(d.level);if(!d||d.screen!=='level'||rewardsPending||d.level<=rewardLevel()||!round?.questions.some(q=>q.id===id&&q.choices.some(choice=>choice.value===value)))return;const draft=rewardDraft(d.level);draft.answers[id]=value;draft.dirty.add(id);d.notice='Not saved yet.';const status=$('rewardStatus');if(status)status.textContent=d.notice;const count=$('rewardAnswerCount');if(count)count.textContent=`${round.questions.filter(q=>Object.hasOwn(draft.answers,q.id)).length} of 5 answered`;const progress=$('rewardProgress');if(progress)progress.value=round.questions.filter(q=>Object.hasOwn(draft.answers,q.id)).length;paintRewardLadder()}
async function rewardAction(action){
 const d=currentRewardDialog(),round=d&&rewardRound(d.level);if(!d||d.screen!=='level'||!['save','complete'].includes(action)||rewardsPending||!round||d.level!==rewardLevel()+1||d.level<2||d.needsRefresh)return;
 const draft=rewardDraft(d.level),answers={...draft.answers};if(action==='complete'&&!round.questions.every(q=>q.choices.some(c=>c.value===answers[q.id]))){d.error='Choose an answer for all five questions before finishing.';renderRewardModal();return}
 const request={state:s,account:activeMemberId(),epoch:rewardsEpoch,dialog:d,level:d.level,answers};rewardsPending=request;rewardsRevision++;d.error='';renderRewardModal();
 try{const data=await rewardApi('/api/rewards',{action,level:d.level,answers,draftRevision:rewardsData.draftRevision});if(!rewardOwnerMatches(request))return;acceptRewards(data,request);d.notice=action==='complete'?'':'Progress saved.';if(action==='complete'){for(const entry of rewardConnections.values())entry.updated=0;const c=rewardConnection();if(c)loadRewardConnection(c.id,true)}}
 catch(e){if(!rewardOwnerMatches(request))return;d.error=e.message;if(e.draftConflict){try{const data=await rewardApi('/api/rewards');if(!rewardOwnerMatches(request))return;acceptRewards(data);d.error='Newer saved answers were loaded. Your changes are still here. Review all five, then save or finish again.'}catch(refreshError){if(rewardOwnerMatches(request))d.error=`${refreshError.message} Your local answers are kept. Reload the latest answers before trying again.`;d.needsRefresh=true}}}
 finally{if(rewardsPending===request)rewardsPending=null;if(rewardOwnerMatches(request)){paintRewards();if(currentRewardDialog())renderRewardModal()}}
}
function openRewardPhone(id=s.selectedChempat){syncRewardOwner();const c=rewardConnection(id);if(rewardsAuthError||!c||s.selectedChempat!==id)return;newRewardDialog('phone',{level:2,connectionId:id,phone:rewardPhoneProfile().confirmedAt?rewardPhoneProfile().phone||'':''});renderModal();loadRewardConnection(id,true)}
function reviewRewardPhone(){const d=currentRewardDialog(),c=d&&rewardConnection(d.connectionId),phone=$('rewardPhone')?.value.trim()||'';if(!d||d.screen!=='phone'||!c)return;const entry=rewardConnections.get(rewardRealId(c));if(entry?.pending)return;d.phone=phone;if(phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15||!/^\+[1-9][\d\s().-]+$/.test(phone)){d.error='Enter a valid phone number, including your country code.';renderRewardModal();return}d.phone=phone;d.screen='phoneConfirm';d.error='';renderRewardModal()}
async function rewardPhoneAction(action){
 const d=currentRewardDialog(),c=d&&rewardConnection(d.connectionId);if(!d||!c||!['offerPhone','withdrawPhone'].includes(action)||action==='offerPhone'&&d.screen!=='phoneConfirm'||action==='withdrawPhone'&&d.screen!=='phone')return;
 const id=rewardRealId(c),entry=rewardConnections.get(id);if(!entry?.data||entry.pending)return;
 const request={state:s,account:activeMemberId(),epoch:rewardsEpoch};entry.pending=request;entry.revision++;d.error='';renderRewardModal();
 try{const data=await rewardApi('/api/rewards',{action,connectionId:id,...(action==='offerPhone'?{phone:d.phone}:{})});if(!rewardOwnerMatches(request))return;if(!data.connection?.phone)throw Error('Refresh phone exchange to check your saved choice.');entry.data=data.connection;entry.error='';entry.updated=Date.now();if(data.connection.phone.ownOffered){gamePiecePhoneRequests.delete(id);gamePiecePhonesRevision++;if(action==='offerPhone')completeGamePieces(id,['phone-offer'])}d.screen='phone';d.notice=action==='offerPhone'?'Your choice is saved. Numbers appear only when you both opt in.':'Your offer is withdrawn. A number already seen or saved cannot be taken back.';d.phone=''}catch(e){if(rewardOwnerMatches(request))d.error=e.message}
 finally{if(entry.pending===request)entry.pending=null;if(rewardOwnerMatches(request)){paintRewards();if(currentRewardDialog())renderRewardModal()}}
}
function renderRewardPhone(d){
 const c=rewardConnection(d.connectionId),entry=c&&rewardConnections.get(rewardRealId(c)),phone=entry?.data?.phone,busy=!!entry?.pending;if(!c)return '';
 if(!['chat','secondResults','email','tests'].includes(c.status))return `<h2 id="rewardTitle">Exchange phones with ${esc(c.name)}</h2><p class="rewardConsent">Keep going through your connection’s shared choices first. Once your Vibe chat is open, both of you need to finish Second 5 and explicitly offer your numbers.</p>${rewardButton('Back to my page','closeInvite()')}`;
 if(!phone)return `<h2 id="rewardTitle">Exchange phones with ${esc(c.name)}</h2><p>${entry?.error?esc(entry.error):'Checking this connection…'}</p>${entry?.error?rewardButton('Try again',rewardCall('loadRewardConnection',c.id,true),!!entry.loading):''}`;
 if(d.screen==='phoneConfirm')return `<h2 id="rewardTitle">Offer your number to ${esc(c.name)}?</h2><p class="rewardConsent">Your phone number <b>${esc(d.phone)}</b> will be shared with <b>${esc(c.name)}</b> in this connection, only after they also offer their number. They may save or contact you using it.</p>${rewardButton(`Offer my number to ${c.name}`,"rewardPhoneAction('offerPhone')",busy,true)}${rewardButton('Back',"rewardScreen('phone')",busy)}`;
 const eligible=phone.eligible===true;
 return `<h2 id="rewardTitle">Exchange phones with ${esc(c.name)}</h2><p>Both of you need your Second 5. Numbers stay private until you both explicitly offer them here.</p><p class="small">Numbers are member-provided, not verified by text message.</p>${rewardPhoneReadiness(c,phone)}${phone.shared?`<div class="sharedPhone"><b>${esc(c.name)}’s number</b><span>${esc(phone.otherPhone||'Refresh to view')}</span><small>Your shared number: ${esc(phone.ownPhone||'Saved')}</small></div>`:phone.ownOffered?`<p class="rewardConsent">Your offer is waiting for ${esc(c.name)}. No number is shown to them until they opt in too.</p>`:eligible?`<label class="field">Your phone number<input id="rewardPhone" type="tel" autocomplete="tel" maxlength="30" value="${esc(d.phone)}" placeholder="+1 555 123 4567" oninput="if(currentRewardDialog()){currentRewardDialog().phone=this.value;currentRewardDialog().phoneDirty=true}" ${busy?'disabled':''}></label>${rewardButton('Review my offer →','reviewRewardPhone()',busy,true)}`:`<p class="rewardConsent">${rewardLevel()<2?'Finish your Second 5 to make a phone offer.':`${esc(c.name)} needs to finish their Second 5 before phone exchange is available.`}</p>${rewardLevel()<2?rewardButton('Play my Second 5','openRewardLevel(2)'):rewardButton('Check again',rewardCall('loadRewardConnection',c.id,true),!!entry.loading)}`}${phone.ownOffered?rewardButton('Withdraw my offer',"rewardPhoneAction('withdrawPhone')",busy):''}<p class="small">Withdrawing removes access here. It cannot erase a number someone already saw or saved.</p>`;
}
function openRewardDirectory(screen='directory'){
 syncRewardOwner();if(!activeMemberId()||rewardsAuthError)return;if(rewardLevel()<4){openRewardLevel(4);return}newRewardDialog(screen,{level:screen==='video'?5:4});renderModal();return loadRewardDirectory(true);
}
async function loadRewardDirectory(force=false,more=false){
 syncRewardOwner();if(!activeMemberId()||rewardLevel()<4||rewardDirectoryPending)return;if(rewardDirectoryLoading){const pending=rewardDirectoryLoading;await pending.done;if(more&&rewardOwnerMatches(pending))return loadRewardDirectory(force,more);return}
 let finish;const request={state:s,account:activeMemberId(),epoch:rewardsEpoch,revision:rewardDirectoryRevision,done:new Promise(resolve=>{finish=resolve})};rewardDirectoryLoading=request;const d=currentRewardDialog();if(d)d.error='';
 try{const [own,list,requests]=await Promise.all([rewardApi('/api/reward-directory?profile=1'),rewardApi(`/api/reward-directory?directory=1${more&&rewardCursor?`&cursor=${encodeURIComponent(rewardCursor)}`:''}`),rewardApi('/api/reward-requests')]);if(!rewardOwnerMatches(request)||request.revision!==rewardDirectoryRevision)return;if(!own.profile||!own.eligibility||!Array.isArray(list.profiles)||!Array.isArray(requests.incoming)||!Array.isArray(requests.outgoing))throw Error('Discovery returned an incomplete response. Try again.');rewardDirectory=own;rewardRequests=requests;rewardProfiles=more?[...new Map([...rewardProfiles,...list.profiles].map(p=>[p.id,p])).values()]:list.profiles;rewardCursor=list.nextCursor||null}
 catch(e){if(rewardOwnerMatches(request)&&request.revision===rewardDirectoryRevision){if([401,403].includes(e.status)){rewardDirectory=null;rewardProfiles=[]}if(d)d.error=e.message}}
 finally{if(rewardDirectoryLoading===request)rewardDirectoryLoading=null;finish();if(rewardOwnerMatches(request)&&currentRewardDialog()&&['directory','video','directoryConsent','requestConsent','requestAccepted'].includes(currentRewardDialog().screen))renderRewardModal()}
}
function rewardMediaUrl(url,kind){return typeof url==='string'&&new RegExp(`^/api/(?:reward-directory|reward-requests)\\?${kind}=[a-zA-Z0-9-]+$`).test(url)?url:''}
function reviewRewardDirectory(action){const d=currentRewardDialog();if(!d||!rewardDirectory||rewardDirectoryPending||!['list','unlist','publishVideo','hideVideo'].includes(action))return;d.directoryAction=action;d.screen='directoryConsent';d.error='';renderRewardModal()}
async function rewardDirectoryAction(){
 const d=currentRewardDialog();if(!d||d.screen!=='directoryConsent'||rewardDirectoryPending)return;const action=d.directoryAction;if(!['list','unlist','publishVideo','hideVideo'].includes(action))return;
 const request={state:s,account:activeMemberId(),epoch:rewardsEpoch};let succeeded=false;rewardDirectoryPending=request;rewardDirectoryRevision++;d.error='';renderRewardModal();
 try{const data=await rewardApi('/api/reward-directory',{action});if(!rewardOwnerMatches(request))return;if(!data.profile||!data.eligibility)throw Error('Discovery returned an incomplete response. Refresh to check your choice.');rewardDirectory=data;succeeded=true;d.screen=['publishVideo','hideVideo'].includes(action)?'video':'directory';d.notice=({list:'Your name and photo are now listed for signed-in eligible members.',unlist:'Your listing and video are hidden from discovery.',publishVideo:'Your intro video is now visible in member discovery.',hideVideo:'Your video is private again.'})[action]}
 catch(e){if(rewardOwnerMatches(request))d.error=e.message}
 finally{if(rewardDirectoryPending===request)rewardDirectoryPending=null;if(rewardOwnerMatches(request)&&currentRewardDialog()){renderRewardModal();if(succeeded)loadRewardDirectory(true)}}
}
async function uploadRewardVideo(event){
 const d=currentRewardDialog(),file=event.target.files?.[0];if(!d||d.screen!=='video'||!file||rewardDirectoryPending||!rewardDirectory?.eligibility.video)return;
 if(file.type!=='video/mp4'||file.size>2097152||file.size===0){d.error='Choose an MP4 video up to 2 MiB and 15 seconds.';renderRewardModal();return}
 const request={state:s,account:activeMemberId(),epoch:rewardsEpoch,dialog:d};rewardDirectoryPending=request;rewardDirectoryRevision++;d.error='';d.notice='Checking your video…';renderRewardModal();
 try{
  const duration=await rewardVideoDuration(file);if(!rewardOwnerMatches(request)||currentRewardDialog()!==d)return;if(!Number.isFinite(duration)||duration<=0||duration>15)throw Error('Your video must be no longer than 15 seconds.');
  d.notice='Uploading privately…';renderRewardModal();const response=await fetch('/api/reward-directory?upload=1',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'video/mp4','x-chempat-member-id':request.account},body:file});let data;try{data=await response.json()}catch{data={}}if(!rewardOwnerMatches(request))return;if(!response.ok){const error=Object.assign(Error(data.error||'Video upload failed. Try again.'),{status:response.status});if([401,403].includes(error.status))invalidateRewardAccess(error);throw error}if(!data.profile||!data.eligibility)throw Error('Refresh discovery to check whether your video saved.');rewardDirectory=data;d.notice='Your video is saved privately. Review it, then choose whether to publish.';
 }catch(e){if(rewardOwnerMatches(request))d.error=e.message||'Video upload failed. Try again.'}
 finally{if(rewardDirectoryPending===request)rewardDirectoryPending=null;if(rewardOwnerMatches(request)&&currentRewardDialog())renderRewardModal()}
}
function rewardVideoDuration(file){return new Promise((resolve,reject)=>{const video=document.createElement('video'),url=URL.createObjectURL(file);let timer;const finish=(error)=>{clearTimeout(timer);video.removeAttribute('src');video.load();URL.revokeObjectURL(url);error?reject(Error('Could not read this MP4 video. Try another file.')):resolve(video.duration)};video.preload='metadata';video.onloadedmetadata=()=>{const duration=video.duration;clearTimeout(timer);video.onloadedmetadata=null;video.onerror=null;video.removeAttribute('src');video.load();URL.revokeObjectURL(url);resolve(duration)};video.onerror=()=>finish(true);timer=setTimeout(()=>finish(true),10000);video.src=url})}
function rewardIncomingFor(targetId){return rewardRequests.incoming.find(request=>request.memberId===targetId)||null}
function rewardRequestFor(targetId){return rewardRequests.outgoing.find(request=>request.memberId===targetId)||null}
function renderRewardRequestList(){
 if(!rewardRequests.incoming.length&&!rewardRequests.outgoing.length)return '<div class="rewardRequestEmpty"><span>Vibe requests</span><small>None yet</small></div>';
 const cards=(list,kind)=>list.map(request=>{const image=rewardMediaUrl(request.photo,'photo');return `<article class="rewardRequestCard">${image?`<img src="${esc(image)}" alt="${esc(request.name)}" loading="lazy">`:''}<div><b>${esc(request.name)}</b><p>${kind==='incoming'?'Would like to start a Vibe connection.':'Your request is waiting for their choice.'}</p></div><div>${kind==='incoming'?rewardButton('Review accepting →',rewardCall('reviewRewardRequest','accept',request.id),!!rewardDirectoryPending)+rewardButton('Pass',rewardCall('reviewRewardRequest','pass',request.id),!!rewardDirectoryPending):rewardButton('Cancel request',rewardCall('reviewRewardRequest','cancel',request.id),!!rewardDirectoryPending)}</div></article>`}).join('');
 return `<section class="rewardRequests" aria-labelledby="rewardRequestsTitle"><h3 id="rewardRequestsTitle">Vibe requests</h3>${rewardRequests.incoming.length?`<h4>Received</h4>${cards(rewardRequests.incoming,'incoming')}`:''}${rewardRequests.outgoing.length?`<h4>Sent</h4>${cards(rewardRequests.outgoing,'outgoing')}`:''}${!rewardRequests.incoming.length&&!rewardRequests.outgoing.length?'<p class="small">Your requests appear here.</p>':''}</section>`;
}
function reviewRewardRequest(action,id){
 const d=currentRewardDialog();if(!d||d.screen!=='directory'||rewardDirectoryPending||!rewardDirectory?.eligibility.directory)return;
 const target=action==='request'?rewardProfiles.find(p=>p.id===id):action==='cancel'?rewardRequests.outgoing.find(r=>r.id===id):['accept','pass'].includes(action)?rewardRequests.incoming.find(r=>r.id===id):null;
 if(!target||action==='request'&&(target.id===activeMemberId()||rewardRequestFor(id)))return;
 d.requestAction=action;d.requestTarget={...target};d.screen='requestConsent';d.error='';d.notice='';renderRewardModal();
}
function renderRewardRequestConsent(d){
 const target=d.requestTarget,action=d.requestAction;if(!target)return '';
 const description=action==='request'?`This sends a Vibe request to ${target.name} and shares your name and profile photo with them inside Duhwild. If they accept, you’ll both share your current first five Vibe answers. Until then, your answers stay private. No email is sent.`:action==='accept'?`Accepting starts a Vibe connection with ${target.name}. Your saved first five answers will be shared with them, and their first five with you. Both of you still choose Keep going and then choose whether to open chat. Phone numbers, email, and later answers are not shared by accepting.`:action==='pass'?`Pass on ${target.name}’s request? No connection is created and no answers are shared.`:`Cancel your request to ${target.name}? They will no longer be able to accept it.`;
 const label=({request:'Send my Vibe request',accept:'Accept & share our first five',pass:'Pass on this request',cancel:'Cancel my request'})[action];
 return `<h2 id="rewardTitle">${action==='request'?`Send ${esc(target.name)} a Vibe request?`:action==='accept'?`Connect with ${esc(target.name)}?`:action==='pass'?`Pass on ${esc(target.name)}?`:`Cancel the request to ${esc(target.name)}?`}</h2><p class="rewardConsent">${esc(description)}</p>${rewardButton(label,'rewardRequestAction()',!!rewardDirectoryPending,true)}${rewardButton('Back',"rewardScreen('directory')",!!rewardDirectoryPending)}`;
}
async function rewardRequestAction(){
 const d=currentRewardDialog();if(!d||d.screen!=='requestConsent'||rewardDirectoryPending||!d.requestTarget)return;
 const action=d.requestAction,target=d.requestTarget;if(!['request','accept','pass','cancel'].includes(action))return;
 const request={state:s,account:activeMemberId(),epoch:rewardsEpoch};let succeeded=false;rewardDirectoryPending=request;rewardDirectoryRevision++;d.error='';renderRewardModal();
 try{const data=await rewardApi('/api/reward-requests',{action,...(action==='request'?{targetId:target.id}:{id:target.id})});if(!rewardOwnerMatches(request))return;if(data.ok!==true||!['pending','accepted','passed','cancelled'].includes(data.status)||data.status==='accepted'&&!/^[a-f0-9]{64}$/.test(data.connectionId||''))throw Error('Refresh your requests to check the result.');succeeded=true;if(data.status==='accepted'&&typeof data.connectionId==='string'){d.acceptedConnection=data.connectionId;d.acceptedName=target.name;d.screen='requestAccepted';d.notice='Your first-five connection is ready.'}else{d.screen='directory';d.notice=({request:`Your Vibe request was sent to ${target.name}.`,pass:`You passed on ${target.name}’s request.`,cancel:`Your request to ${target.name} was cancelled.`,accept:'Your request was updated.'})[action]}}
 catch(e){if(rewardOwnerMatches(request))d.error=e.message}
 finally{if(rewardDirectoryPending===request)rewardDirectoryPending=null;if(rewardOwnerMatches(request)&&currentRewardDialog()){renderRewardModal();if(succeeded)loadRewardDirectory(true)}}
}
async function openRewardAccepted(){
 const d=currentRewardDialog();if(!d||d.screen!=='requestAccepted'||!d.acceptedConnection||d.openingConnection)return;
 d.openingConnection=true;d.error='';renderRewardModal();await refreshLive(true);if(currentRewardDialog()!==d)return;d.openingConnection=false;
 const connection=memberConnections().find(c=>c.id===d.acceptedConnection&&!inactiveConnection(c));if(!connection){d.error='Your connection is saved, but your page hasn’t refreshed yet. Try opening it again.';renderRewardModal();return}closeInvite();selectChempat(connection.id,true);
}

function renderRewardDirectory(d){
 const data=rewardDirectory,busy=!!rewardDirectoryPending,p=data?.profile,video=rewardMediaUrl(p?.video,'video');
 if(!data)return `<h2 id="rewardTitle">Member discovery</h2><p>${d.error?'Your discovery settings could not be loaded.':'Loading member discovery…'}</p>${rewardButton('Try again','loadRewardDirectory(true)',!!rewardDirectoryLoading)}`;
 if(d.screen==='directoryConsent'){const action=d.directoryAction,copy={list:`List your name, ${p.name||first(owner().name)}, and your profile photo in the member directory? Signed-in members who have unlocked Level 4 can see them. Your private answers, phone, email, and chats are not listed.`,unlist:'Hide your name, photo, and video from member discovery? Your private profile and connections remain available.',publishVideo:'Publish your saved intro video to the member directory? Signed-in members who have unlocked Level 4 can watch it alongside your name and photo. They may record what they can see.',hideVideo:'Hide your intro video from member discovery? Your saved clip remains private for you to review.'};return `<h2 id="rewardTitle">${action==='list'?'List your profile?':action==='publishVideo'?'Publish your intro video?':'Update your visibility?'}</h2><p class="rewardConsent">${esc(copy[action])}</p>${rewardButton(({list:'List my name and photo',unlist:'Hide my listing',publishVideo:'Publish my video',hideVideo:'Make my video private'})[action],'rewardDirectoryAction()',busy,true)}${rewardButton('Not now',rewardCall('rewardScreen',['publishVideo','hideVideo'].includes(action)?'video':'directory'),busy)}`}
 if(d.screen==='video')return `<h2 id="rewardTitle">Your 15-second hello</h2><p class="rewardRoundLead">Save privately. Publish only if you choose.</p><p class="rewardMediaLimits"><b>15 seconds · 2 MiB max</b><span>MP4 · H.264 · up to 720p · optional AAC audio</span><span>MOV and HEVC clips need converting first.</span></p>${!data.eligibility.video?`<p class="rewardConsent">Finish Level 5 to upload your intro video.</p>${rewardButton('Play my next five','openRewardLevel(5)')}`:`${video?`<video class="rewardVideo" src="${esc(video)}" controls playsinline preload="metadata"></video><p>${p.videoPublished?'Visible to signed-in eligible members.':'Only you can view this saved video.'}</p>`:''}<label class="button rewardUpload ${!video?'rewardPrimary':'light'}">${video?'Choose a replacement MP4':'Choose an MP4 video'}<input type="file" accept="video/mp4" aria-label="Choose a private intro video" onchange="uploadRewardVideo(event)" ${busy?'disabled':''}></label>${video?rewardButton(p.videoPublished?'Make video private':'Review publishing →',rewardCall('reviewRewardDirectory',p.videoPublished?'hideVideo':'publishVideo'),busy||!p.listed,!!p.listed):''}${video&&!p.listed?`<p>List your name and photo before publishing a video.</p>${rewardButton('Review my listing',"rewardScreen('directory')",busy,true)}`:''}`}<div class="row">${rewardButton('Member discovery',"rewardScreen('directory')",busy)}</div>`;
 return `<h2 id="rewardTitle">Member discovery</h2><p>For signed-in Level 4 members. Listing yourself is optional.</p><details class="rewardDirectoryOwn" ${d.directoryOwnOpen?'open':''} ontoggle="if(this.isConnected&&currentRewardDialog())currentRewardDialog().directoryOwnOpen=this.open"><summary>Your profile · ${p.listed?'Listed':'Private'}<span>Manage</span></summary><div><p>${p.listed?'Your name and photo can be discovered here.':'Your name and photo are not in this directory.'}</p>${rewardButton(p.listed?'Review hiding my profile':'Review listing my profile →',rewardCall('reviewRewardDirectory',p.listed?'unlist':'list'),busy||!data.eligibility.directory)}${rewardButton(data.eligibility.video?'My intro video':'Unlock my intro video',data.eligibility.video?"rewardScreen('video')":'openRewardLevel(5)',busy)}</div></details>${renderRewardRequestList()}<h3>People to discover</h3><div class="rewardDirectoryGrid">${rewardProfiles.map(profile=>{const image=rewardMediaUrl(profile.photo||profile.photoUrl,'photo'),clip=profile.videoAvailable?rewardMediaUrl(profile.videoUrl||`/api/reward-directory?video=${profile.id}`,'video'):'';return `<article data-directory-member="${esc(profile.id)}" tabindex="-1">${image?`<img src="${esc(image)}" alt="${esc(profile.name)}" loading="lazy">`:''}<h4>${esc(profile.name)}</h4>${profile.id===activeMemberId()?'<p class="small">Your listing</p>':rewardRequestFor(profile.id)?'<p class="small">Vibe request sent</p>':rewardIncomingFor(profile.id)?rewardButton('Review their request',rewardCall('reviewRewardRequest','accept',rewardIncomingFor(profile.id).id),busy):rewardButton('Send a Vibe request',rewardCall('reviewRewardRequest','request',profile.id),busy)}${clip?`<details><summary>Watch intro video</summary><video src="${esc(clip)}" controls playsinline preload="none"></video></details>`:''}</article>`}).join('')||'<p>No profiles are listed yet. Your own listing is always your choice.</p>'}</div>${rewardCursor?rewardButton('Load more','loadRewardDirectory(true,true)',!!rewardDirectoryLoading):''}${rewardButton('Refresh directory','loadRewardDirectory(true)',!!rewardDirectoryLoading)}`;
}
function renderRewardModal(){
 const d=currentRewardDialog();if(!d){if(s.modal==='reward'){changeModal('');$('modalHost').innerHTML=''}return}let content='';const level=rewardLevel(),busy=!!rewardsPending;
 if(d.screen==='phone'||d.screen==='phoneConfirm')content=renderRewardPhone(d);
 else if(d.screen==='requestConsent')content=renderRewardRequestConsent(d);
 else if(d.screen==='requestAccepted')content=`<h2 id="rewardTitle">You’re connected with ${esc(d.acceptedName)}</h2><p>Your first five are ready. Take a look together.</p>${rewardButton(d.openingConnection?'Opening connection…':'Open our first five →','openRewardAccepted()',!!d.openingConnection,true)}`;
 else if(['directory','directoryConsent','video'].includes(d.screen))content=renderRewardDirectory(d);
 else if(!rewardsData)content=`<h2 id="rewardTitle">Your saved progress</h2><p>${rewardsError?esc(rewardsError):'Checking your saved progress before opening this round…'}</p>${rewardButton('Check again','loadRewards(true)',!!rewardsLoading)}`;
 else if(d.level===1&&level===0)content=`<h2 id="rewardTitle">${esc(REWARD_NAMES[0])} · Step 1</h2><p class="rewardExplanation">${esc(REWARD_DETAILS[0])}</p>${rewardNextAnswered()===5?rewardButton('Check saved progress →','loadRewards(true)',!!rewardsLoading,true):rewardButton('Play my First 5 →','closeInvite();createMyVibe()',false,true)}`;
 else if(d.level>level+1)content=`<h2 id="rewardTitle">${esc(REWARD_NAMES[d.level-1])} · Step ${d.level}</h2><p class="rewardExplanation">${esc(REWARD_DETAILS[d.level-1])}</p><p class="rewardConsent">First unlock ${esc(REWARD_NAMES[level])} at Step ${level+1}.</p>${rewardButton(`Next: ${REWARD_NAMES[level]} →`,rewardCall('openRewardLevel',level+1),busy,true)}`;
 else if(d.level<=level){
  const c=rewardConnection(),phoneNeedsConfirmation=d.level===2&&(!rewardPhoneProfile().confirmedAt||privatePhoneDraft().editing);
  content=`<p class="rewardStepContext">Step ${d.level} complete · ${esc(REWARD_LABELS[d.level-1])}</p><h2 id="rewardTitle">${d.level===3?'You’ve earned 3 Duhwildcards. What are you curious about?':`${esc(REWARD_NAMES[d.level-1])} unlocked`}</h2><p class="rewardExplanation">${d.level===3?'Each person gets 3 Duhwildcards per connection after Step 3. Answering a card is always free.':esc(REWARD_DETAILS[d.level-1])}</p>${d.level===1?rewardButton('Send a vibe →','closeInvite();createMyVibe()',false,true):d.level===2?`${renderPrivateRewardPhone()}<div class="rewardPhoneSharing"><p>Offering your number is a separate choice for each connection.</p>${c?rewardButton(`Phone options with ${c.name}`,rewardCall('openRewardPhone',c.id),busy):'<p>Choose a Vibe connection on your page when you want to review an exchange.</p>'}</div>`:d.level===3?`${rewardButton('Play a card','openWildcardConnections()',busy,true)}<details class="rewardDetails"><summary>About Duhwildcards</summary><p>Choose an accepted Friend or a Vibe connection where you both opened chat. Each person gets 3 cards per connection after Step 3. Played questions are unavailable for both of you. A card never opens chat or shares contact details.</p></details>`:rewardButton(d.level===4?'Open member discovery':'Review my video',rewardCall('openRewardDirectory',d.level===4?'directory':'video'),false,true)}${level<5?`<div class="rewardNextStep">${rewardButton(`Next: ${REWARD_NAMES[level]} →`,rewardCall('openRewardLevel',level+1),busy,!phoneNeedsConfirmation&&d.level===2)}<small>Step ${level+1} · five choices.${d.level===2?' Adding a number is optional.':''}</small></div>`:''}`;
 }
 else{const round=rewardRound(d.level),draft=rewardDraft(d.level);content=`<h2 id="rewardTitle">${esc(REWARD_NAMES[d.level-1])} · Step ${d.level}</h2><p class="rewardExplanation">${esc(REWARD_DETAILS[d.level-1])}</p><p class="rewardRoundLead">Five choices. Your answers stay private.</p>${round?.questions?.length===5?`<div class="rewardRoundProgress"><p id="rewardAnswerCount" class="discoveryCount">${round.questions.filter(q=>Object.hasOwn(draft.answers,q.id)).length} of 5 answered</p><progress id="rewardProgress" max="5" value="${round.questions.filter(q=>Object.hasOwn(draft.answers,q.id)).length}" aria-labelledby="rewardAnswerCount"></progress></div><div class="rewardQuestions">${round.questions.map((q,i)=>`<fieldset ${busy?'disabled':''}><legend>${i+1}. ${esc(q.text)}</legend><div class="rewardChoices">${q.choices.map(choice=>`<label><input type="radio" name="reward-${i}" value="${esc(choice.value)}" ${draft.answers[q.id]===choice.value?'checked':''} onchange="${esc(rewardCall('chooseRewardAnswer',q.id,choice.value))}"><span>${esc(choice.label)}</span></label>`).join('')}</div></fieldset>`).join('')}</div><div class="discoveryFormActions rewardFormActions">${rewardButton('Save progress',"rewardAction('save')",busy||d.needsRefresh)}${rewardButton('Unlock my reward →',"rewardAction('complete')",busy||d.needsRefresh,true)}</div><details class="rewardDetails"><summary>What happens next?</summary><p>Finishing unlocks a choice. It never shares answers, opens chat, or lists your profile automatically.</p></details>`:`<p>${rewardsError?esc(rewardsError):'Loading your five questions…'}</p>${rewardButton('Try again','loadRewards(true)',!!rewardsLoading)}`}${d.needsRefresh?rewardButton('Load latest answers','refreshRewardConflict()',!!rewardsLoading):''}`}
 const previous=$('modalHost').querySelector('.rewardModal'),focused=previous?.contains(document.activeElement)?document.activeElement:null,viewKey=`${d.screen}:${d.level}:${d.connectionId||''}`,sameView=previous?.dataset.rewardView===viewKey;
 const focusKey=focused?.id?{id:focused.id}:focused?.dataset.rewardStep?{step:focused.dataset.rewardStep}:focused?.getAttribute('onclick')?{action:focused.getAttribute('onclick')}:null,selection=focused&&typeof focused.selectionStart==='number'?{start:focused.selectionStart,end:focused.selectionEnd}:null,scroll=sameView?previous.scrollTop:0;
 $('modalHost').innerHTML=`<div class="modalBackdrop" onclick="closeInvite(event)"><section class="modal rewardModal" data-reward-view="${esc(viewKey)}" role="dialog" aria-modal="true" aria-labelledby="rewardTitle"><button type="button" class="close" aria-label="Close rewards" onclick="closeInvite()">×</button><div class="eyebrow">FIVE AT A TIME</div>${renderRewardStepTrail(d.level)}${content}<p id="rewardStatus" class="discoverySaveStatus" role="status">${esc(rewardsPending?rewardsPending.kind==='phoneProfile'?'Saving your private number…':'Saving…':d.notice)}</p><p id="rewardError" class="error" role="alert">${esc(d.error)}</p></section></div>`;
 const modal=$('modalHost').querySelector('.rewardModal');modal.scrollTop=scroll;
 if(!previous||focused){
  const restore=sameView&&focusKey?(focusKey.id?$(focusKey.id):focusKey.step?modal.querySelector(`[data-reward-step="${focusKey.step}"]`):[...modal.querySelectorAll('[onclick]')].find(el=>el.getAttribute('onclick')===focusKey.action)):null;
  const target=restore&&!restore.disabled?restore:modal.querySelector('.close');target?.focus({preventScroll:true});if(target===restore&&selection&&target.setSelectionRange)target.setSelectionRange(selection.start,selection.end);
 }
}
async function refreshRewardConflict(){const d=currentRewardDialog();if(!d||!d.needsRefresh)return;await loadRewards(true);if(currentRewardDialog()===d&&!rewardsError){d.needsRefresh=false;d.error='Latest answers loaded. Review your choices and try again.';renderRewardModal()}}
function refreshRewards(){if(document.hidden)return;if($('rewardLadder')&&!rewardsError&&Date.now()-rewardsUpdated>15000)loadRewards(true);const c=rewardConnection(),entry=c&&rewardConnections.get(rewardRealId(c));if(c&&!entry?.error&&Date.now()-(entry?.updated||0)>15000)loadRewardConnection(c.id,true)}

// Datecards are a shared invitation, independent of game progress. Private
// idea bookmarks contain only catalog IDs and are scoped to this account/device.
const DATE_IDEAS=[
 {id:'dinner',title:'Dinner for two',short:'Dinner for two',line:'A little candlelight. A lot to talk about.',art:'dinner',tone:'peach'},
 {id:'movie',title:'Movie night out',short:'Movie night',line:'Pick a film. Share the popcorn. Compare reviews.',art:'movie',tone:'pink'},
 {id:'topgolf',title:'A round at Topgolf',short:'Topgolf',line:'A friendly challenge, with time to talk between swings.',art:'golf',tone:'mint'},
 {id:'dave-busters',title:'Play at Dave & Buster’s',short:'Arcade date',line:'A few games, a little friendly competition.',art:'arcade',tone:'lilac'},
 {id:'museum',title:'Wander a museum',short:'Museum wander',line:'Find a favorite. Make up a story. Take your time.',art:'museum',tone:'peach'},
 {id:'concert',title:'Catch a concert',short:'Live music',line:'Your favorite song sounds better together.',art:'music',tone:'pink'},
 {id:'picnic',title:'A just-us picnic',short:'Picnic for two',line:'Pack something good and find a patch of sunshine.',art:'picnic',tone:'mint'},
 {id:'grocery-games',title:'Guy’s Grocery Games-inspired cooking challenge',short:'Cooking challenge',line:'Choose a budget, pick surprise ingredients, cook together.',art:'dinner',tone:'peach'},
 {id:'popcorn-night',title:'Popcorn night in',short:'Popcorn night in',line:'Comfy clothes, a good movie, and your favorite snacks.',art:'movie',tone:'lilac'},
 {id:'staycation',title:'A little staycation',short:'Staycation',line:'Play tourist close to home. Make the details yours.',art:'stay',tone:'mint'},
 {id:'overnight-trip',title:'An overnight adventure',short:'Overnight trip',line:'Somewhere new, whenever you both feel ready.',art:'trip',tone:'pink'}
];
let dateOwner=null,dateAccount='',dateEpoch=0,datePairs=new Map(),dateDialog=null,dateAuthError='',dateSaved=new Set(),dateSaveMode='device';
const dateRealId=c=>c.id==='first'?s.liveId:c.id;
const dateIdea=id=>DATE_IDEAS.find(idea=>idea.id===id);
const dateCall=(fn,...args)=>`${fn}(${args.map(value=>JSON.stringify(value)).join(',')})`;
function syncDateOwner(){
 if(dateOwner===s&&dateAccount===activeMemberId())return;
 dateOwner=s;dateAccount=activeMemberId();dateEpoch++;datePairs=new Map();dateDialog=null;dateAuthError='';dateSaved=new Set();dateSaveMode='device';
 if(dateAccount)try{const stored=JSON.parse(localStorage.getItem(`duhwild.date-ideas.${dateAccount}`)||'[]');if(Array.isArray(stored))dateSaved=new Set(stored.filter(id=>dateIdea(id)))}catch{dateSaveMode='visit'}
}
function dateConnection(id=s.selectedChempat){
 const c=memberConnections().find(item=>item.id===id);
 return activeMemberId()&&!dateAuthError&&c&&/^[a-f0-9]{64}$/.test(dateRealId(c)||'')&&!inactiveConnection(c)&&!c.blockedAt&&!c.blockedByMe&&(isFriend(c)?c.status==='chat'&&c.claimed===true:['firstResults','request','secondFive','nextResults','secondResults','chatRequested','chat','email','tests'].includes(c.status))?c:null;
}
function dateEntry(c){syncDateOwner();const id=dateRealId(c);if(!datePairs.has(id))datePairs.set(id,{cards:[],side:c.side==='received'?'prospect':'member',loaded:false,updated:0,revision:0,loading:null,pending:null,error:'',notice:'',drafts:new Map(),attempts:new Map(),removed:new Set(),unavailable:false});return datePairs.get(id)}
const dateOwns=request=>!!request&&request.state===s&&request.account===activeMemberId()&&request.epoch===dateEpoch;
function dateRequestCurrent(request){return dateOwns(request)&&datePairs.get(request.realId)===request.entry&&!!dateConnection(request.connectionId)}
function dateArt(kind){
 const shapes={dinner:'<ellipse cx="48" cy="50" rx="33" ry="8" fill="#fff9e9"/><circle cx="31" cy="47" r="11" fill="#fff"/><circle cx="65" cy="47" r="11" fill="#fff"/><circle cx="31" cy="47" r="7" fill="#ecc6a5"/><circle cx="65" cy="47" r="7" fill="#ecc6a5"/><path d="M48 43V27" stroke="#518c7b" stroke-width="4"/><path d="M48 26c-8-8 0-13 0-13s8 5 0 13" fill="#ef896f"/><path d="M20 23v13m-4-13v8m8-8v8m52-8v13" stroke="#846757" stroke-width="2"/>',movie:'<rect x="16" y="14" width="64" height="37" rx="5" fill="#3e6266"/><rect x="21" y="19" width="54" height="27" rx="2" fill="#eff9ef"/><path d="m42 25 15 9-15 8z" fill="#e6a383"/><path d="m61 39 4 23h17l4-23" fill="#fff9e9"/><path d="m68 41 2 18m8-18-2 18" stroke="#db7682" stroke-width="4"/><g fill="#fff6bc"><circle cx="66" cy="38" r="5"/><circle cx="74" cy="35" r="6"/><circle cx="81" cy="39" r="5"/></g>',golf:'<ellipse cx="47" cy="49" rx="34" ry="15" fill="#94c8a5"/><ellipse cx="49" cy="48" rx="21" ry="10" fill="#cce6b7"/><ellipse cx="50" cy="47" rx="8" ry="4" fill="#80ad8e"/><path d="M50 47V12" stroke="#3e6266" stroke-width="3"/><path d="m51 12 18 7-18 6" fill="#e5847a"/><circle cx="26" cy="51" r="5" fill="#fff"/>',arcade:'<path d="M24 12h43l7 44H20z" fill="#58747d"/><rect x="30" y="18" width="30" height="22" rx="3" fill="#c6e2ce"/><path d="m44 23 9 5-9 7-8-5z" fill="#db879c"/><path d="M21 46h51l5 15H17z" fill="#dc9bab"/><path d="M33 49v7" stroke="#3e6266" stroke-width="3"/><circle cx="33" cy="48" r="3" fill="#fff4bf"/><circle cx="55" cy="53" r="3" fill="#fff4bf"/><circle cx="63" cy="53" r="3" fill="#fff"/>',museum:'<path d="m15 25 33-15 33 15z" fill="#e9a48d"/><path d="M19 29h58M17 58h62" stroke="#5d8079" stroke-width="5"/><path d="M25 30v24m15-24v24m16-24v24m15-24v24" stroke="#fff9e9" stroke-width="8"/>',music:'<path d="M42 47V20l29-6v27M43 29l27-6" fill="none" stroke="#4b736d" stroke-width="5"/><ellipse cx="34" cy="50" rx="10" ry="7" fill="#4b736d"/><ellipse cx="62" cy="44" rx="10" ry="7" fill="#4b736d"/><path d="m20 16 2 7 7 2-7 2-2 7-2-7-7-2 7-2z" fill="#e6a383"/>',picnic:'<path d="m22 41 41-9 20 27-56 4-15-13z" fill="#fff8e3"/><path d="m29 39 10 23m8-27 12 26M19 49l54-7m-47 17 53-8" stroke="#d98b92" stroke-width="4"/><path d="M34 40V27q0-16 22-9l5 17" fill="none" stroke="#b78251" stroke-width="3"/><path d="m30 34 31-3-3 20H33z" fill="#c79b67"/><circle cx="72" cy="18" r="8" fill="#edc66f"/>',stay:'<rect x="16" y="31" width="64" height="22" rx="5" fill="#f7f1da"/><path d="M19 30v28m59-28v28" stroke="#547b70" stroke-width="5"/><rect x="22" y="22" width="22" height="13" rx="4" fill="#fff"/><rect x="50" y="22" width="22" height="13" rx="4" fill="#fff"/><path d="M19 37h58v13H19z" fill="#df9cad"/><path d="m47 12 2 4 4 1-4 2-2 4-1-4-4-2 4-1z" fill="#e7b967"/>',trip:'<path d="m12 53 24-35 22 35" fill="#91b8a2"/><path d="m42 54 20-29 23 29" fill="#6e9b90"/><path d="m27 31 9-13 9 13-9-4z" fill="#fff8eb"/><rect x="33" y="42" width="29" height="21" rx="4" fill="#e7ae8b"/><path d="M41 42v-6h13v6m-11 1v19m10-19v19" fill="none" stroke="#846b62" stroke-width="3"/><circle cx="73" cy="15" r="7" fill="#efcc8a"/>'};
 return `<svg class="dateIllustration" viewBox="0 0 96 72" aria-hidden="true" focusable="false">${shapes[kind]||shapes.dinner}</svg>`;
}
function dateButton(label,action,{primary=false,disabled=false,key='',cancel=false,ariaLabel=''}={}){return `<button type="button" class="dateButton ${primary?'datePrimary':''}${cancel?' dateCancel':''}" data-date-focus="${esc(key||action)}" onclick="${esc(action)}" ${ariaLabel?`aria-label="${esc(ariaLabel)}"`:''} ${disabled?'disabled':''}>${esc(label)}</button>`}
function dateIdeaTile(c,idea,cardId=''){return `<button type="button" class="dateIdeaTile dateTone-${idea.tone}" data-date-focus="idea:${idea.id}" onclick="${esc(dateCall('openDateIdea',c.id,idea.id,cardId))}">${dateArt(idea.art)}<span>${esc(idea.short)}</span>${dateSaved.has(idea.id)?'<small>Saved</small>':''}</button>`}
function renderDateIdeas(c){return `<aside class="dateIdeas" aria-label="Date ideas"><div class="dateIdeasHeading"><b>A little date?</b><span>Pick something fun.</span></div><div class="dateIdeaStrip">${DATE_IDEAS.slice(0,4).map(idea=>dateIdeaTile(c,idea)).join('')}${dateButton('More ideas →',dateCall('openDateChooser',c.id),{key:'more'})}</div></aside>`}
function validDateMessage(message){const card=message?.card;return message?.type==='dateCard'&&typeof message.id==='string'&&['member','prospect'].includes(message.by)&&card&&dateIdea(card.ideaId)&&['pending','accepted'].includes(card.status)&&Number.isInteger(card.version)&&card.version>0&&['member','prospect'].includes(card.proposer)&&['date','place','note'].every(key=>typeof card[key]==='string')}
function mergeDateMessages(c,chat=true){
 if(dateAuthError)return chat?(c.messages||[]).filter(message=>message.type!=='dateCard'):[];
 const entry=dateEntry(c);if(entry.unavailable)return chat?(c.messages||[]).filter(message=>message.type!=='dateCard'):[];
 // Only the dedicated active-card snapshot can reveal shared cards. Cached
 // connection messages may predate a cancellation, including after a reload.
 const cards=new Map();for(const message of entry.loaded?entry.cards:[])if(validDateMessage(message)&&!entry.removed.has(message.id))cards.set(message.id,message);
 // Inbox polling may have a newer version, but cannot restore an absent ID.
 for(const message of c.messages||[]){const prior=cards.get(message.id);if(prior&&validDateMessage(message)&&message.card.version>prior.card.version)cards.set(message.id,message)}
 const merged=[],seen=new Set();for(const message of chat?c.messages||[]:[]){if(message.type==='dateCard'){if(cards.has(message.id)&&!seen.has(message.id)){merged.push(cards.get(message.id));seen.add(message.id)}}else merged.push(message)}
 for(const message of cards.values())if(!seen.has(message.id))merged.push(message);
 return merged.sort((a,b)=>{const left=Date.parse(a.at),right=Date.parse(b.at);return Number.isFinite(left)&&Number.isFinite(right)?left-right:0});
}
function dateWhen(value){if(!value)return '';const match=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);if(!match)return value;const date=new Date(Date.UTC(+match[1],+match[2]-1,+match[3],+(match[4]||12),+(match[5]||0)));return date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})+(match[4]?` · ${date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit',timeZone:'UTC'})} (local time, as entered)`:'')}
function dateContext(card){return [dateWhen(card.date),card.place].filter(Boolean).join(' · ')}
function renderSharedDateCard(c,message){
 const entry=dateEntry(c),card=message.card,idea=dateIdea(card.ideaId),mine=entry.side,waiting=card.status==='pending',canAccept=waiting&&card.proposer!==mine,busy=!!entry.pending,cancelAttempt=entry.attempts.get(`cancel:${message.id}`),cancelling=entry.pending?.action==='cancel'&&entry.pending.cardId===message.id,locked=busy||!!cancelAttempt?.uncertain;
 return `<article class="sharedDateCard dateTone-${idea.tone} ${message.by===mine?'mine':''}" data-date-card="${esc(message.id)}" data-date-version="${card.version}"><div class="dateCardTop">${dateArt(idea.art)}<div><small>${card.status==='accepted'?'It’s a date!':card.proposer===mine?`Your invite to ${esc(c.name)}`:`${esc(c.name)} has a date idea`}</small><h3>${esc(idea.title)}</h3></div><span class="dateCardStamp">${card.status==='accepted'?'Agreed':'Invite'}</span></div>${dateContext(card)?`<p class="dateCardContext">${esc(dateContext(card))}</p>`:''}${card.note?`<p class="dateCardNote">${esc(card.note)}</p>`:''}<div class="dateCardActions">${canAccept?dateButton('I’m in',dateCall('acceptDateCard',c.id,message.id),{primary:true,disabled:locked,key:`accept:${message.id}`}):''}${dateButton('Suggest a change',dateCall('openDateIdea',c.id,card.ideaId,message.id),{disabled:locked,key:`change:${message.id}`})}${dateButton('Another idea',dateCall('openDateChooser',c.id,message.id),{disabled:locked,key:`another:${message.id}`})}${dateButton(cancelling?'Cancelling…':cancelAttempt?.uncertain?'Retry cancel':'Cancel',dateCall('cancelDateCard',c.id,message.id),{disabled:busy,key:`cancel:${message.id}`,cancel:true,ariaLabel:`${cancelling?'Cancelling':cancelAttempt?.uncertain?'Retry cancelling':'Cancel'} ${idea.short} datecard for both of you`})}</div>${waiting?`<p class="dateCardWaiting">${canAccept?'What do you think?':`Waiting for ${esc(c.name)}.`}</p>`:''}</article>`;
}
function dateMessagesHTML(c,chat=true){const mine=c.side==='received'?'prospect':'member',messages=mergeDateMessages(c,chat);return messages.length?messages.map(message=>message.type==='dateCard'?renderSharedDateCard(c,message):message.by==='system'?`<div class="chatGameNote"><span aria-hidden="true">✦</span><p>${esc(message.text)}</p><small>Connection game</small></div>`:`<div class="inlineMessage ${message.by===mine?'mine':''}">${message.by===mine?'<b class="chatSender">You</b>':''}${message.photo&&pic(message.photo)?`<img class="chatPhoto" src="${pic(message.photo)}" alt="Photo shared in chat">`:''}${message.text?`<p>${esc(message.text)}</p>`:''}</div>`).join(''):`<p class="chatEmpty">${chat?isFriend(c)?'You’re connected as friends. Say hello.':'Say hello. You have five things to talk about.':'Make a little plan together.<br>You can send a datecard while you keep playing.'}</p>`}
function datePlanHTML(c){const agreed=mergeDateMessages(c,false).filter(message=>message.card.status==='accepted').sort((a,b)=>Date.parse(b.card.updatedAt)-Date.parse(a.card.updatedAt))[0];return agreed?`<span aria-hidden="true">♡</span><div><b>It’s a date · ${esc(dateIdea(agreed.card.ideaId).short)}</b>${dateContext(agreed.card)?`<span>${esc(dateContext(agreed.card))}</span>`:''}</div>`:''}
function dateStatusHTML(c){const entry=dateEntry(c);return `${entry.error?`<p class="error" role="alert">${esc(entry.error)}</p>${!entry.unavailable?dateButton('Refresh datecards',dateCall('loadDateCards',c.id,true),{disabled:!!entry.loading,key:'retry'}):''}`:''}<p role="status">${esc(entry.pending?entry.pending.action==='cancel'?'Cancelling your datecard…':'Sending your datecard…':entry.loading&&!entry.loaded?'Checking datecards…':entry.notice)}</p>`}
function renderDateConversation(c,chat=true){if(!dateConnection(c?.id))return '';const plan=datePlanHTML(c);return `<div class="dateConversation ${chat?'':'dateBeforeChat'}" data-date-connection="${esc(c.id)}" data-date-chat="${chat}"><div class="datePlan" aria-label="Latest agreed date" ${plan?'':'hidden'}>${plan}</div><div class="${chat?'inlineChat ':''}dateMessages" aria-label="${chat?'Private Chat':'Datecards'} with ${esc(c.name)}">${dateMessagesHTML(c,chat)}</div>${renderDateIdeas(c)}${chat?`<div class="dateComposer">${chatComposer(c)}</div>`:''}<div class="dateStatus">${dateStatusHTML(c)}</div></div>`}
function acceptDateSnapshot(entry,data){
 if(!Array.isArray(data.cards)||!['member','prospect'].includes(data.side)||data.cards.some(message=>!validDateMessage(message)))throw Error('Datecards could not be checked. Please refresh.');
 // An absent card is cancelled; never union it back in from an older cache.
 // Requests that began before a local mutation are already fenced by revision.
 const known=new Map(entry.cards.map(message=>[message.id,message])),active=new Set(data.cards.map(message=>message.id));
 for(const id of known.keys())if(!active.has(id)){if(entry.attempts.get(`cancel:${id}`)?.uncertain)entry.notice='Datecard cancelled for both of you.';entry.removed.add(id)}
 for(const id of entry.removed){entry.drafts.delete(id);for(const key of entry.attempts.keys())if(key.endsWith(`:${id}`))entry.attempts.delete(key)}
 entry.cards=data.cards.filter(message=>!entry.removed.has(message.id)).map(message=>{const prior=known.get(message.id);return prior&&prior.card.version>message.card.version?prior:message});entry.side=data.side;entry.loaded=true;entry.updated=Date.now();entry.error='';entry.unavailable=false;
}
function paintDateCards(){
 syncDateOwner();let removedDialog=null;const dialog=currentDateDialog(),dialogConnection=dialog&&dateConnection(dialog.connectionId);
 if(dialog?.cardId&&dateEntry(dialogConnection).loaded&&!dateFindMessage(dialogConnection,dialog.cardId)){removedDialog=dialog;dateEntry(dialogConnection).notice='This datecard was cancelled. It’s been removed for both of you.';closeInvite()}
 for(const region of document.querySelectorAll('[data-date-connection]')){const c=dateConnection(region.dataset.dateConnection),entry=c&&dateEntry(c);if(!c||s.selectedChempat!==c.id||entry.unavailable){const selected=memberConnections().find(item=>item.id===region.dataset.dateConnection);if((dateAuthError||entry?.unavailable)&&selected&&!inactiveConnection(selected)&&chatOpen(selected.status)&&region.dataset.dateChat==='true'){region.classList.add('dateUnavailable');region.querySelector('.dateMessages').innerHTML=dateMessagesHTML(selected,true);region.querySelector('.dateIdeas').hidden=true;region.querySelector('.datePlan').hidden=true;region.querySelector('.dateStatus').innerHTML=`<p class="error" role="alert">${esc(dateAuthError||entry.error)}</p>`}else{region.hidden=true;region.innerHTML=''}continue}
  const thread=region.querySelector('.dateMessages'),focused=thread.contains(document.activeElement)?document.activeElement.dataset.dateFocus:null,scroll=thread.scrollTop,nearBottom=thread.scrollHeight-thread.scrollTop-thread.clientHeight<36,html=dateMessagesHTML(c,region.dataset.dateChat==='true');
  if(thread.innerHTML!==html){thread.innerHTML=html;thread.scrollTop=nearBottom?thread.scrollHeight:scroll;if(focused)[...thread.querySelectorAll('[data-date-focus]')].find(button=>button.dataset.dateFocus===focused&&!button.disabled)?.focus({preventScroll:true})}
  const plan=region.querySelector('.datePlan'),content=datePlanHTML(c);plan.hidden=!content;if(plan.innerHTML!==content)plan.innerHTML=content;
  const status=region.querySelector('.dateStatus');status.innerHTML=dateStatusHTML(c);
 }
 if(s.modal==='datecard'&&!currentDateDialog()){changeModal('');renderModal()}else if(s.modal==='datecard')renderDateModal();
 if(removedDialog&&document.activeElement===document.body)document.querySelector('[data-date-connection] .dateIdeaTile')?.focus({preventScroll:true});
}
function syncDateUI(){syncDateOwner();paintDateCards();const c=dateConnection();if(document.querySelector('[data-date-connection]')&&c)loadDateCards(c.id)}
async function dateAPI(url,options){
 const controller=new AbortController();let timer;
 try{return await Promise.race([(async()=>{const response=await fetch(url,{...options,signal:controller.signal});let data;try{data=await response.json()}catch{throw Error('The datecard request could not be confirmed. Please try again.')}return {response,data}})(),new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('The datecard request timed out. Please try again.'))},20000)})])}
 finally{clearTimeout(timer)}
}
async function loadDateCards(id=s.selectedChempat,force=false){
 syncDateOwner();const c=dateConnection(id);if(!c)return;const entry=dateEntry(c);if(entry.pending||entry.loading||entry.unavailable||!force&&entry.loaded)return;
 const request={state:s,account:activeMemberId(),epoch:dateEpoch,realId:dateRealId(c),connectionId:id,entry,revision:entry.revision};entry.loading=request;
 try{const {response,data}=await dateAPI(`/api/datecards?id=${encodeURIComponent(request.realId)}`,{credentials:'same-origin',cache:'no-store',headers:memberRequestHeaders(request.account)});
  if(!dateRequestCurrent(request)||request.revision!==entry.revision)return;
  if(!response.ok)throw Object.assign(Error(data.error||'Datecards could not load. Try again.'),{status:response.status});acceptDateSnapshot(entry,data);
 }catch(error){if(!dateRequestCurrent(request)||request.revision!==entry.revision)return;entry.error=error.message;if(error.status===401){dateAuthError='Sign in again to see your datecards.';datePairs.clear();dateDialog=null}else if([403,404,410].includes(error.status)){entry.cards=[];entry.drafts.clear();entry.unavailable=true}}
 finally{if(entry.loading===request)entry.loading=null;if(dateOwns(request)){paintDateCards();if(currentDateDialog()?.connectionId===id)renderDateModal()}}
}
function refreshDateCards(){if(document.hidden)return;syncDateOwner();const c=dateConnection();if(c&&document.querySelector('[data-date-connection]'))loadDateCards(c.id,true)}
function currentDateDialog(){const d=dateDialog;return d&&s.modal==='datecard'&&dateOwns(d)&&d.modalVersion===modalVersion&&d.interactionVersion===interactionVersion&&d.view===s.view&&d.connectionId===s.selectedChempat&&dateConnection(d.connectionId)&&!dateEntry(dateConnection(d.connectionId)).unavailable?d:null}
function dateDraft(entry,cardId='',ideaId=''){
 const key=cardId||'new';let draft=entry.drafts.get(key);if(!draft){const message=entry.cards.find(message=>message.id===cardId);draft={ideaId:ideaId||message?.card.ideaId||'dinner',date:message?.card.date||'',place:message?.card.place||'',note:message?.card.note||'',version:message?.card.version||null,attempt:null};entry.drafts.set(key,draft)}return draft;
}
function dateFindMessage(c,cardId){return mergeDateMessages(c,false).find(message=>message.id===cardId)}
function beginDateDialog(id,screen,ideaId='',cardId=''){
 syncDateOwner();const c=dateConnection(id);if(!c||id!==s.selectedChempat)return;const entry=dateEntry(c),message=cardId&&dateFindMessage(c,cardId);if(entry.unavailable||cardId&&(entry.pending||!message||entry.attempts.get(`cancel:${cardId}`)?.uncertain))return;
 const previous=currentDateDialog(),input=$('message')||$('outgoingMessage');if(input)rememberChatText(input.value);
 if(message){const index=entry.cards.findIndex(item=>item.id===cardId);if(index<0)entry.cards.push(message);else if(entry.cards[index].card.version<message.card.version)entry.cards[index]=message;}
 const draft=dateDraft(entry,cardId,ideaId);if(ideaId&&!draft.attempt)draft.ideaId=ideaId;
 const returnFocus=previous?.returnFocus||document.activeElement,returnSelection=previous?.returnSelection||(returnFocus===input?{start:input.selectionStart,end:input.selectionEnd}:null),returnFocusAction=previous?.returnFocusAction||document.activeElement?.getAttribute('onclick');
 changeModal('datecard');dateDialog={state:s,account:activeMemberId(),epoch:dateEpoch,modalVersion,interactionVersion,view:s.view,connectionId:id,screen,cardId,draft,error:'',notice:'',returnFocus,returnSelection,returnFocusAction};renderModal();loadDateCards(id,true);
}
function openDateChooser(id=s.selectedChempat,cardId=''){beginDateDialog(id,'ideas','',cardId)}
function openDateIdea(id,ideaId,cardId=''){if(dateIdea(ideaId))beginDateDialog(id,'invite',ideaId,cardId)}
function dateBack(){const d=currentDateDialog();if(!d)return;d.screen='ideas';d.error='';renderDateModal('heading')}
// Keep date and time parts independently, including unfinished choices. A blank
// clock means a date-only plan; no time zone conversion or default time is used.
function dateWhenParts(value=''){
 const match=/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
 return {day:match?.[1]||'',hour:match?.[2]!==undefined?String(+match[2]%12||12):'',minute:match?.[3]||'',period:match?.[2]!==undefined?(+match[2]<12?'AM':'PM'):''};
}
function dateWhenValue(parts){
 const hasTime=!!(parts.hour||parts.minute||parts.period);
 if(!hasTime)return parts.day||'';
 if(!parts.day||!/^(?:[1-9]|1[0-2])$/.test(parts.hour)||!/^[0-5]\d$/.test(parts.minute)||!['AM','PM'].includes(parts.period))return null;
 const hour=+parts.hour%12+(parts.period==='PM'?12:0);
 return `${parts.day}T${String(hour).padStart(2,'0')}:${parts.minute}`;
}
function editableDateDraft(){const d=currentDateDialog();return d&&d.screen==='invite'&&!dateEntry(dateConnection(d.connectionId)).pending&&!d.draft.attempt?.uncertain?d:null}
function updateDateDraft(key,value){const d=editableDateDraft();if(!d||!['date','place','note'].includes(key))return;d.draft[key]=value;if(key==='date')d.draft.when=dateWhenParts(value);d.draft.attempt=null;d.error=''}
function updateDateWhenPart(part,value){
 const d=editableDateDraft();if(!d||!['day','hour','minute','period'].includes(part))return;
 const parts=d.draft.when||(d.draft.when=dateWhenParts(d.draft.date));parts[part]=value;
 // The partial parts remain the editor source of truth. Submission validates
 // them before using draft.date, so a partial clock cannot become date-only.
 d.draft.date=dateWhenValue(parts)??parts.day;d.draft.attempt=null;d.error='';renderDateModal();
}
function clearDateTime(){
 const d=editableDateDraft();if(!d)return;const parts=d.draft.when||(d.draft.when=dateWhenParts(d.draft.date));
 Object.assign(parts,{hour:'',minute:'',period:''});d.draft.date=parts.day;d.draft.attempt=null;d.error='';
 for(const id of ['dateHour','dateMinute','datePeriod'])if($(id))$(id).value='';renderDateModal();
}
function saveDateIdea(){const d=currentDateDialog();if(!d)return;dateSaved.add(d.draft.ideaId);if(dateSaveMode==='device')try{localStorage.setItem(`duhwild.date-ideas.${activeMemberId()}`,JSON.stringify([...dateSaved]))}catch{dateSaveMode='visit'}d.notice=dateSaveMode==='device'?'Saved privately on this device.':'Saved privately for this visit.';renderDateModal();const region=document.querySelector('.dateIdeas');if(region){const c=dateConnection(d.connectionId);region.outerHTML=renderDateIdeas(c)}}
function renderDateWhen(draft){
 const parts=draft.when||(draft.when=dateWhenParts(draft.date));
 const options=(values,current)=>values.map(value=>`<option value="${value}" ${value===current?'selected':''}>${value}</option>`).join('');
 return `<label for="dateWhen">When <span>optional · local time, as entered</span><input id="dateWhen" data-date-focus="date" type="date" min="1900-01-01" max="9999-12-31" value="${esc(parts.day)}" oninput="updateDateWhenPart('day',this.value)" onchange="updateDateWhenPart('day',this.value)"></label><fieldset class="dateTimeFields"><legend>Time <span>optional</span></legend><div class="dateTimeParts"><label for="dateHour">Hour<select id="dateHour" data-date-focus="hour" oninput="updateDateWhenPart('hour',this.value)" onchange="updateDateWhenPart('hour',this.value)"><option value="">Hour</option>${options(Array.from({length:12},(_,i)=>String(i+1)),parts.hour)}</select></label><label for="dateMinute">Minute<select id="dateMinute" data-date-focus="minute" oninput="updateDateWhenPart('minute',this.value)" onchange="updateDateWhenPart('minute',this.value)"><option value="">Minute</option>${options(Array.from({length:60},(_,i)=>String(i).padStart(2,'0')),parts.minute)}</select></label><label for="datePeriod">AM / PM<select id="datePeriod" data-date-focus="period" oninput="updateDateWhenPart('period',this.value)" onchange="updateDateWhenPart('period',this.value)"><option value="">AM / PM</option>${options(['AM','PM'],parts.period)}</select></label></div><div class="dateTimeHelp"><small>Leave time blank to choose the day only.</small>${dateButton('Clear time','clearDateTime()',{key:'clear-time'})}</div></fieldset>`;
}
function patchDateModal(modal,d,c,entry){
 const draft=d.draft,message=d.cardId&&dateFindMessage(c,d.cardId),conflict=!!message&&message.card.version!==draft.version&&!draft.attempt?.uncertain,busy=!!entry.pending,locked=busy||!!draft.attempt?.uncertain;
 const text=(selector,value)=>{const node=modal.querySelector(selector);if(node&&node.textContent!==value)node.textContent=value};
 const disable=(selector,value)=>{for(const node of modal.querySelectorAll(selector))if(node.disabled!==value)node.disabled=value};
 const hide=(selector,value)=>{const node=modal.querySelector(selector);if(node&&node.hidden!==value)node.hidden=value};
 const scroll=modal.scrollTop;
 text('#dateModalStatus',busy?entry.pending.action==='cancel'?'Cancelling your datecard…':'Sending your datecard…':d.notice);text('#dateModalError',d.error||entry.error);
 disable('.dateInviteFields input,.dateInviteFields select,.dateInviteFields textarea,[data-date-focus="clear-time"]',locked);
 disable('[data-date-focus="back"],[data-date-focus="latest"]',busy);disable('[data-date-focus="send"]',busy||conflict);
 hide('#dateConflict',!conflict);hide('#dateRetryHelp',!draft.attempt?.uncertain);
 text('[data-date-focus="send"]',`${draft.attempt?.uncertain?'Retry send':d.cardId?'Send change':'Send'} to ${c.name}`);
 text('[data-date-focus="save"]',dateSaved.has(draft.ideaId)?'Idea saved':'Save idea');
 text('#dateShareHelp',`Send shares this datecard with ${c.name}. Save idea is private, ${dateSaveMode==='device'?'on this device only':'for this visit only'}.`);
 if(modal.scrollTop!==scroll)modal.scrollTop=scroll;
}
function renderDateModal(focusKey){
 const d=currentDateDialog();if(!d){if(s.modal==='datecard'){changeModal('');$('modalHost').innerHTML=''}return}
 const c=dateConnection(d.connectionId),entry=dateEntry(c),draft=d.draft,idea=dateIdea(draft.ideaId),viewKey=`${d.screen}:${draft.ideaId}:${d.editorRevision||0}`,previous=$('modalHost').querySelector('.dateModal');
 // Polling, private saving and mutation feedback update only status/action nodes.
 // Never replace live editors or reassign their values: native pickers can own
 // focus outside the DOM, and a text cursor is not enough to restore a popup.
 if(previous?._dateDialog===d&&previous.dataset.dateView===viewKey){patchDateModal(previous,d,c,entry);return}
 let content;if(d.screen==='ideas')content=`<h2 id="dateTitle" tabindex="-1">${d.cardId?'Try another idea':'What sounds like you two?'}</h2><p class="dateModalLead">Pick a little adventure with ${esc(c.name)}.</p><div class="datePicker">${DATE_IDEAS.map(idea=>dateIdeaTile(c,idea,d.cardId)).join('')}</div><p class="datePrivateHelp">Looking is just looking. You choose when to send.</p><small class="dateBrandNote">Independent date ideas. No venue or show affiliation.</small>`;
 else content=`${dateButton('← More ideas','dateBack()',{key:'back'})}<div class="dateInviteHero dateTone-${idea.tone}">${dateArt(idea.art)}<span>A date with ${esc(c.name)}</span></div><h2 id="dateTitle" tabindex="-1">${esc(idea.title)}</h2><p class="dateModalLead">${esc(idea.line)}</p><div class="dateInviteFields">${renderDateWhen(draft)}<label for="datePlace">Where <span>optional</span><input id="datePlace" data-date-focus="place" maxlength="160" placeholder="Your favorite place, or decide together" value="${esc(draft.place)}" oninput="updateDateDraft('place',this.value)"></label><label for="dateNote">Make it yours <span>optional</span><textarea id="dateNote" data-date-focus="note" maxlength="500" rows="3" placeholder="I thought this would be fun with you…" oninput="updateDateDraft('note',this.value)">${esc(draft.note)}</textarea></label></div><div id="dateConflict" hidden><p class="dateConflict">This datecard has changed. Load the latest details before sending a new suggestion.</p>${dateButton('Use latest details','resetDateConflict()',{key:'latest'})}</div><div class="dateInviteActions">${dateButton(`Send to ${c.name}`,'submitDateCard()',{primary:true,key:'send'})}${dateButton('Save idea','saveDateIdea()',{key:'save'})}</div><p class="datePrivateHelp" id="dateShareHelp"></p><p class="datePrivateHelp" id="dateRetryHelp" hidden>The last send could not be confirmed. Retry checks the same send, without creating a duplicate.</p>`;
 $('modalHost').innerHTML=`<div class="modalBackdrop" onclick="closeInvite(event)"><section class="modal dateModal" data-date-view="${esc(viewKey)}" role="dialog" aria-modal="true" aria-labelledby="dateTitle"><button type="button" class="close" data-date-focus="close" aria-label="Close date ideas" onclick="closeInvite()">×</button><div class="eyebrow">MAKE A LITTLE PLAN</div>${content}<p class="dateModalStatus" id="dateModalStatus" role="status"></p><p class="error" id="dateModalError" role="alert"></p></section></div>`;
 const modal=$('modalHost').querySelector('.dateModal');modal._dateDialog=d;patchDateModal(modal,d,c,entry);
 const target=[...modal.querySelectorAll('[data-date-focus]')].find(button=>button.dataset.dateFocus===focusKey&&!button.disabled);(target||$('dateTitle')).focus({preventScroll:true});
}
function resetDateConflict(){const d=currentDateDialog(),c=d&&dateConnection(d.connectionId),message=c&&dateFindMessage(c,d.cardId);if(!message||dateEntry(c).pending||d.draft.attempt?.uncertain)return;Object.assign(d.draft,{...message.card,when:dateWhenParts(message.card.date),attempt:null});d.editorRevision=(d.editorRevision||0)+1;d.error='Latest details loaded. Review them before sending.';renderDateModal('heading')}
function dateUUID(){if(globalThis.crypto?.randomUUID)return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=bytes[6]&15|64;bytes[8]=bytes[8]&63|128;const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`}
async function submitDateCard(){
 const d=currentDateDialog(),c=d&&dateConnection(d.connectionId);if(!d||d.screen!=='invite'||!c||dateEntry(c).pending)return;const draft=d.draft;
 if(!draft.attempt?.uncertain){
  const parts=draft.when||(draft.when=dateWhenParts(draft.date)),day=$('dateWhen');
  // Read the visible controls on this explicit send as well as listening to
  // input/change. Some native pickers commit only when the user leaves them.
  for(const [part,id] of [['day','dateWhen'],['hour','dateHour'],['minute','dateMinute'],['period','datePeriod']])if($(id))parts[part]=$(id).value;
  for(const [key,id] of [['place','datePlace'],['note','dateNote']])if($(id))draft[key]=$(id).value;
  if(day&&!day.validity.valid){d.error='Choose a complete date between 1900 and 9999, or clear the date.';renderDateModal();return}
  const value=dateWhenValue(parts);if(value===null){d.error=parts.day?'Choose an hour, minute and AM or PM, or clear the time.':'Choose a date for your time, or clear the time.';renderDateModal();return}
  draft.date=value;
 }
 if(draft.place.length>160||draft.note.length>500){d.error='Use up to 160 characters for a place and 500 for your note.';renderDateModal();return}
 const message=d.cardId&&dateFindMessage(c,d.cardId);if(d.cardId&&!message){paintDateCards();return}if(d.cardId&&message.card.version!==draft.version&&!draft.attempt?.uncertain){renderDateModal();return}
 return mutateDateCard(c,d.cardId?'change':'send',{ideaId:draft.ideaId,date:draft.date,place:draft.place.trim(),note:draft.note.trim(),...(d.cardId?{cardId:d.cardId,version:draft.version}:{})},d)
}
async function acceptDateCard(id,cardId){syncDateOwner();const c=dateConnection(id);if(!c||s.selectedChempat!==id)return;const message=dateFindMessage(c,cardId),entry=dateEntry(c);if(!message||message.card.status!=='pending'||message.card.proposer===entry.side||entry.attempts.get(`cancel:${cardId}`)?.uncertain)return;return mutateDateCard(c,'accept',{cardId,version:message.card.version})}
async function cancelDateCard(id,cardId){
 syncDateOwner();const c=dateConnection(id);if(!c||s.selectedChempat!==id)return;
 const entry=dateEntry(c),message=dateFindMessage(c,cardId),attempt=entry.attempts.get(`cancel:${cardId}`);if(!message||entry.pending||entry.unavailable)return;
 // A timed-out request keeps its original version even if a poll sees a newer
 // one. The server can then replay its receipt or reject that exact attempt.
 return mutateDateCard(c,'cancel',attempt?.uncertain?attempt.fields:{cardId,version:message.card.version});
}
async function mutateDateCard(c,action,fields,dialog=null){
 const entry=dateEntry(c);if(entry.pending||entry.unavailable)return;const attemptKey=`${action}:${fields.cardId||'new'}`,fingerprint=JSON.stringify(fields);let attempt=dialog?.draft.attempt||entry.attempts.get(attemptKey);
 if(!attempt||attempt.fingerprint!==fingerprint)attempt={requestId:dateUUID(),fingerprint,fields:{...fields},uncertain:false};entry.attempts.set(attemptKey,attempt);if(dialog)dialog.draft.attempt=attempt;
 const request={state:s,account:activeMemberId(),epoch:dateEpoch,realId:dateRealId(c),connectionId:c.id,entry,action,cardId:fields.cardId,interactionVersion,focusedCancel:action==='cancel'&&document.activeElement?.dataset.dateFocus===`cancel:${fields.cardId}`};entry.pending=request;entry.revision++;entry.error='';entry.notice='';if(dialog)dialog.error='';paintDateCards();if(currentDateDialog())renderDateModal();
 let reload=false;try{const {response,data}=await dateAPI('/api/datecards',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',...memberRequestHeaders(request.account)},body:JSON.stringify({action,id:request.realId,requestId:attempt.requestId,...fields})});
  if(!dateRequestCurrent(request))return;if(!response.ok)throw Object.assign(Error(data.error||(action==='cancel'?'The datecard could not be cancelled. Try again.':'The datecard could not be sent. Try again.')),{status:response.status,dateCardConflict:!!data.dateCardConflict});if(action==='cancel'&&data.cards?.some(message=>message.id===fields.cardId))throw Error('Cancellation could not be confirmed. Please try again.');acceptDateSnapshot(entry,data);entry.attempts.delete(attemptKey);if(dialog)entry.drafts.delete(dialog.cardId||'new');entry.notice=action==='cancel'?'Datecard cancelled for both of you.':action==='accept'?'It’s a date!':action==='change'?'Your new suggestion is sent.':'Datecard sent.';
  if(currentDateDialog()===dialog&&dialog)closeInvite();
 }catch(error){if(!dateRequestCurrent(request))return;const ambiguous=!error.status||error.status>=500;attempt.uncertain=ambiguous;if(!ambiguous){entry.attempts.delete(attemptKey);if(dialog)dialog.draft.attempt=null}entry.error=action==='cancel'&&ambiguous?`${error.message} Choose Retry cancel to check the same cancellation.`:error.message;if(dialog)dialog.error=error.message;
  if(error.status===409&&error.dateCardConflict){reload=true;entry.error='This datecard changed. Refreshing the latest details…';if(dialog)dialog.error=entry.error}else if(error.status===401){dateAuthError='Sign in again to see your datecards.';datePairs.clear();dateDialog=null}else if([403,404,410].includes(error.status)){entry.cards=[];entry.drafts.clear();entry.unavailable=true}
 }finally{if(entry.pending===request)entry.pending=null;if(dateOwns(request)){if(reload)await loadDateCards(c.id,true);paintDateCards();if(currentDateDialog())renderDateModal();if(request.focusedCancel&&request.interactionVersion===interactionVersion&&s.selectedChempat===c.id&&!s.modal&&document.activeElement===document.body){const region=[...document.querySelectorAll('[data-date-connection]')].find(node=>node.dataset.dateConnection===c.id);const retry=[...region?.querySelectorAll('[data-date-focus]')||[]].find(node=>node.dataset.dateFocus===`cancel:${fields.cardId}`&&!node.disabled);(retry||region?.querySelector('.dateIdeaTile'))?.focus({preventScroll:true})}}}
}

// Wildcards are an optional Level 3 perk, scoped to one member and one open
// accepted Friend or mutually open Vibe chat. Balances stay server-owned.
let wildcardTargets=new Map(),wildcardConnections=new Map();
const hydratedConnectionRow=id=>gamePieceConnections.get(id)?.row||wildcardConnections.get(id)?.row;
let wildcardOwner=null,wildcardAccount='',wildcardEpoch=0,wildcardPairs=new Map(),wildcardDialog=null,wildcardSummary=new Map(),wildcardSummaryLoading=null,wildcardSummaryRevision=0,wildcardSummaryUpdated=0,wildcardSummaryQueued=false;
function syncWildcardOwner(){
 syncGamePieceOwner();if(wildcardOwner===s&&wildcardAccount===activeMemberId())return;
 wildcardOwner=s;wildcardAccount=activeMemberId();wildcardEpoch++;wildcardTargets=new Map();wildcardConnections=new Map();wildcardPairs=new Map();wildcardDialog=null;wildcardSummary=new Map();wildcardSummaryLoading=null;wildcardSummaryRevision++;wildcardSummaryUpdated=0;wildcardSummaryQueued=false;
}
function wildcardConnection(id=s.selectedChempat){
 const c=memberConnections().find(item=>item.id===id);
 return activeMemberId()&&!rewardsAuthError&&wildcardConnectionEligible(c)?c:null;
}
const wildcardRealId=c=>c.id==='first'?s.liveId:c.id;
function wildcardConnectionEligible(c){return !!c&&/^[a-f0-9]{64}$/.test(wildcardRealId(c)||'')&&!inactiveConnection(c)&&!c.blockedAt&&!c.blockedByMe&&(isFriend(c)?c.channel==='friend'&&c.status==='chat'&&c.claimed===true:chatOpen(c.status))}
function wildcardEntry(c){
 syncWildcardOwner();const id=wildcardRealId(c);
 if(!wildcardPairs.has(id))wildcardPairs.set(id,{data:null,error:'',loading:null,pending:null,attempts:new Map(),answerDrafts:new Map(),revision:0,updated:0,notice:'',refreshQueued:false});
 return wildcardPairs.get(id);
}
const wildcardOwnerMatches=r=>!!r&&r.state===s&&r.account===activeMemberId()&&r.epoch===wildcardEpoch;
const wildcardCall=(fn,...args)=>`${fn}(${args.map(value=>JSON.stringify(value)).join(',')})`;
const wildcardButton=(label,action,{disabled=false,primary=false,key=''}={})=>`<button type="button" class="button ${primary?'wildcardPrimary':'light'} wildcardButton" onclick="${esc(action)}" ${disabled?'disabled':''} ${key?`data-wildcard-focus="${esc(key)}"`:''}>${esc(label)}</button>`;
function wildcardHasContent(c){const data=c&&wildcardEntry(c).data;return !!c&&(data?.eligible===true||data?.cards?.length>0||!data&&rewardLevel()>=3)}
function renderWildcardPanel(c){
 if(!wildcardConnection(c?.id))return '';
 return `<section id="connectionWildcards" class="connectionWildcards" data-connection="${esc(c.id)}" aria-label="Your wildcards" ${wildcardHasContent(wildcardConnection(c.id))?'':'hidden'}>${wildcardHasContent(wildcardConnection(c.id))?wildcardPanelContent(c):''}</section>`;
}
function renderWildcardCards(c,entry){
 return `<div class="wildcardCards">${(entry.data?.cards||[]).map(card=>`<article class="wildcardPlayedCard ${card.status}" data-wildcard-card="${esc(card.questionId)}"><div class="wildcardCardHeading"><b>${card.direction==='incoming'?`${esc(c.name)} played a card`:`You played a card for ${esc(c.name)}`}</b><span>${card.status==='answered'?'Answered':card.direction==='incoming'?'Your reply':'Waiting for reply'}</span></div><p class="wildcardCardQuestion">${esc(card.ask.text)}</p>${card.reply?`<div class="wildcardCardReply"><b>${card.direction==='incoming'?'Your answer':`${esc(c.name)}’s answer`}</b><p>${esc(card.reply.text)}</p></div>`:card.canAnswer?wildcardButton('Answer now',wildcardCall('openWildcardAnswer',c.id,card.questionId),{disabled:!!entry.pending,primary:true,key:`answer:${card.questionId}`}):`<p class="wildcardHint">${card.direction==='outgoing'?`Waiting for ${esc(c.name)} to answer.`:'This card is waiting for a reply.'}</p>`}</article>`).join('')}</div>`;
}
function wildcardPanelContent(c){
 const entry=wildcardEntry(c),data=entry.data;if(data?.eligible===false&&!data.cards?.length)return '';
 return `<div class="wildcardPanelHeading"><div><b>Wildcards</b><span class="wildcardBalance">${data?.eligible?`${data.remaining} of ${data.limit} left with ${esc(c.name)}`:data?.cards?.length?'Replying never uses a wildcard':entry.error?'Balance unavailable':'Checking your wildcards…'}</span></div>${data?.eligible!==false?wildcardButton('Play a wildcard',wildcardCall('openWildcardPicker',c.id),{disabled:!data||!data.eligible||data.remaining===0||!!entry.pending,primary:true,key:'open'}):''}</div>${data?.eligible&&data.remaining===0?'<p class="wildcardHint">You’ve played all 3 here. Your chat stays open.</p>':''}${renderWildcardCards(c,entry)}${entry.error?`<p class="error" role="alert">${esc(entry.error)}</p>${wildcardButton('Try again',wildcardCall('loadWildcards',c.id,true),{disabled:!!entry.loading})}`:''}<p class="wildcardNotice" role="status">${esc(entry.pending?entry.pending.kind==='answer'?'Sending your reply…':'Sending your wildcard…':entry.notice)}</p>`;
}
function paintWildcardIndicators(){
 for(const indicator of document.querySelectorAll('[data-wildcard-pending]')){
  const c=memberConnections().find(c=>c.id===indicator.dataset.wildcardPending&&!inactiveConnection(c)),realId=c&&rewardRealId(c),summary=c&&wildcardConnection(c.id)&&wildcardSummary.get(realId),phoneOffer=c&&!isFriend(c)&&gamePiecePhoneRequests.has(realId),feedCount=c?gamePieceFeed.filter(piece=>piece.connectionId===realId&&(!isFriend(c)||friendWildcardPiece(piece))).length:0;
  const cardText=summary?.pendingIncoming?`${summary.pendingIncoming} card${summary.pendingIncoming===1?'':'s'} to answer`:summary?.pendingOutgoing?`${summary.pendingOutgoing} card${summary.pendingOutgoing===1?'':'s'} waiting`:'',text=[cardText,phoneOffer?'Phone offer to review':'',!cardText&&!phoneOffer&&feedCount?`${feedCount} game piece${feedCount===1?'':'s'}`:''].filter(Boolean).join(' · ');
  indicator.textContent=text;indicator.hidden=!text;const button=indicator.closest('button');if(button&&c)button.setAttribute('aria-label',`Show ${c.name} and connection status${text?`. ${text}`:''}`);
 }
}

function paintWildcards(){
 syncWildcardOwner();const panel=$('connectionWildcards'),c=panel&&wildcardConnection(panel.dataset.connection);
 if(panel){const hidden=!c||s.selectedChempat!==c.id||!wildcardHasContent(c);panel.hidden=hidden;if(hidden)panel.innerHTML='';else{const focused=panel.contains(document.activeElement)?document.activeElement?.dataset.wildcardFocus:null;panel.innerHTML=wildcardPanelContent(c);if(focused)[...panel.querySelectorAll('[data-wildcard-focus]')].find(button=>button.dataset.wildcardFocus===focused&&!button.disabled)?.focus({preventScroll:true})}}
 paintWildcardIndicators();if(s.modal==='wildcard'&&!currentWildcardDialog()){changeModal('');renderModal()}
}
function syncWildcardUI(){
 syncWildcardOwner();paintWildcards();const panel=$('connectionWildcards'),c=panel&&wildcardConnection(panel.dataset.connection);if(panel&&!$('rewardLadder')&&activeMemberId()&&!rewardsData&&!rewardsAuthError)loadRewards();if(c)loadWildcards(c.id,!!wildcardEntry(c).data&&!wildcardEntry(c).data.eligible&&rewardLevel()>=3);loadWildcardSummary();loadGamePiecePhones();loadGamePieces();maybePresentGamePiece();
}
function updateWildcardSummaryFromCards(id,cards){
 const next={pendingIncoming:cards.filter(card=>card.direction==='incoming'&&card.status==='waiting').length,pendingOutgoing:cards.filter(card=>card.direction==='outgoing'&&card.status==='waiting').length},previous=wildcardSummary.get(id);
 if(previous&&(previous.pendingIncoming!==next.pendingIncoming||previous.pendingOutgoing!==next.pendingOutgoing)){wildcardSummaryRevision++;if(wildcardSummaryLoading)wildcardSummaryQueued=true}
 wildcardSummary.set(id,next);
}
async function loadWildcardSummary(force=false){
 syncWildcardOwner();if(!activeMemberId()||rewardsAuthError||!memberConnections().some(c=>wildcardConnection(c.id)))return;
 if(wildcardSummaryLoading){if(force)wildcardSummaryQueued=true;return}if(!force&&wildcardSummaryUpdated)return;
 const request={state:s,account:activeMemberId(),epoch:wildcardEpoch,revision:wildcardSummaryRevision};wildcardSummaryLoading=request;
 try{const data=await wildcardApi('/api/wildcards?summary=1');if(!wildcardOwnerMatches(request)||request.revision!==wildcardSummaryRevision)return;if(!Array.isArray(data.connections)||!data.connections.every(row=>/^[a-f0-9]{64}$/.test(row.id)&&['pendingIncoming','pendingOutgoing'].every(key=>Number.isInteger(row[key])&&row[key]>=0&&row[key]<=3)))throw Error('Wildcard replies could not be checked.');wildcardSummary=new Map(data.connections.map(row=>[row.id,row]));wildcardSummaryUpdated=Date.now()}
 catch(e){if(wildcardOwnerMatches(request)&&request.revision===wildcardSummaryRevision){wildcardSummaryUpdated=Date.now();if([401,403].includes(e.status)){wildcardSummary.clear();invalidateRewardAccess(e)}}}
 finally{if(wildcardSummaryLoading===request)wildcardSummaryLoading=null;if(wildcardOwnerMatches(request)){paintWildcardIndicators();if(wildcardSummaryQueued){wildcardSummaryQueued=false;await loadWildcardSummary(true)}maybePresentGamePiece()}}
}
function acceptWildcards(entry,data,id){
 const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
 if(!data||data.connectionId!==id||typeof data.eligible!=='boolean'||data.limit!==3||!Number.isInteger(data.remaining)||data.remaining<0||data.remaining>3||!Array.isArray(data.usedQuestionIds)||!data.usedQuestionIds.every(validId)||!Array.isArray(data.categories))throw Error('Wildcards returned an incomplete response. Try again.');
 const categories=new Set(),questions=new Set();for(const category of data.categories){if(!validId(category.id)||categories.has(category.id)||typeof category.title!=='string'||!category.title.trim()||!Array.isArray(category.questions))throw Error('Wildcards returned an incomplete response. Try again.');categories.add(category.id);for(const q of category.questions){if(!validId(q.id)||questions.has(q.id)||typeof q.text!=='string'||!q.text.trim())throw Error('Wildcards returned an incomplete response. Try again.');questions.add(q.id)}}
 // Usage only grows within a connection. An older cross-tab snapshot must not
 // bring back a played question or increase a member's remaining balance.
 const previous=entry.data,cards=data.cards||[];
 const validMessage=message=>message&&typeof message.id==='string'&&typeof message.text==='string'&&typeof message.at==='string'&&['member','prospect'].includes(message.by);
 const cardIds=new Set();if(!Array.isArray(cards)||cards.some(card=>{const valid=validId(card.questionId)&&validId(card.categoryId)&&!cardIds.has(card.questionId)&&['incoming','outgoing'].includes(card.direction)&&['waiting','answered'].includes(card.status)&&typeof card.canAnswer==='boolean'&&validMessage(card.ask)&&(card.status==='answered'?validMessage(card.reply)&&!card.canAnswer:card.reply===null&&(!card.canAnswer||card.direction==='incoming'));cardIds.add(card.questionId);return !valid})||data.answerMaxLength!==undefined&&data.answerMaxLength!==1000)throw Error('Wildcard cards returned an incomplete response. Try again.');
 const mergedCards=cards.map(card=>{const before=previous?.cards?.find(old=>old.questionId===card.questionId&&old.ask.id===card.ask.id&&old.direction===card.direction);return before?.status==='answered'&&card.status==='waiting'?before:card});
 entry.data={...data,cards:mergedCards,answerMaxLength:1000,remaining:previous?.eligible&&data.eligible?Math.min(previous.remaining,data.remaining):data.remaining,usedQuestionIds:[...new Set([...(previous?.usedQuestionIds||[]),...data.usedQuestionIds])]};entry.error='';entry.updated=Date.now();updateWildcardSummaryFromCards(id,mergedCards);
}
async function wildcardApi(url,body){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'x-chempat-member-id':activeMemberId(),...(body?{'content-type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});let data;try{data=await response.json()}catch{throw Error('We couldn’t confirm the response. Try again.')};if(!response.ok)throw Object.assign(Error(data.error||'Wildcards are unavailable. Try again.'),{status:response.status,snapshot:data});return data}
 catch(e){if(e.name==='AbortError')throw Error('We couldn’t confirm your wildcard. Try again.');throw e}
 finally{clearTimeout(timeout)}
}
async function loadWildcards(id,force=false){
 syncWildcardOwner();const c=wildcardConnection(id);if(!c||s.selectedChempat!==id||!wildcardRealId(c))return;const entry=wildcardEntry(c);if(entry.loading){if(force)entry.refreshQueued=true;return}if(entry.pending||!force&&(entry.data||entry.error))return;
 let finish;const request={state:s,account:activeMemberId(),epoch:wildcardEpoch,revision:entry.revision,connectionRevision,cacheRevision:wildcardConnections.get(wildcardRealId(c))?.revision||0,done:new Promise(resolve=>{finish=resolve})};entry.loading=request;
 try{const data=await wildcardApi(`/api/wildcards?connection=${encodeURIComponent(wildcardRealId(c))}${wildcardConnections.has(wildcardRealId(c))?'&hydrate=1':''}`);if(!wildcardOwnerMatches(request)||request.revision!==entry.revision||!wildcardConnection(id))return;acceptWildcards(entry,data,wildcardRealId(c));if(data.connection&&request.connectionRevision===connectionRevision&&request.cacheRevision===(wildcardConnections.get(wildcardRealId(c))?.revision||0))acceptWildcardConnection(data.connection,wildcardRealId(c))}
 catch(e){if(wildcardOwnerMatches(request)&&request.revision===entry.revision){if([401,403].includes(e.status)){invalidateRewardAccess(e);return}entry.error=e.message;if(e.status===404){entry.data=null;if(request.connectionRevision===connectionRevision&&request.cacheRevision===(wildcardConnections.get(wildcardRealId(c))?.revision||0))evictHydratedConnection(wildcardRealId(c))}}}
 finally{if(entry.loading===request)entry.loading=null;if(wildcardOwnerMatches(request)){paintWildcards();if(currentWildcardDialog()?.connectionId===id)renderWildcardModal();if(entry.refreshQueued&&!entry.pending){entry.refreshQueued=false;await loadWildcards(id,true)}}finish()}
}
function currentWildcardDialog(){
 const d=wildcardDialog;return d&&s.modal==='wildcard'&&wildcardOwnerMatches(d)&&d.modalVersion===modalVersion&&d.interactionVersion===interactionVersion&&d.view===s.view&&(d.screen==='connections'||s.selectedChempat===d.connectionId&&wildcardConnection(d.connectionId))?d:null;
}
function openWildcardConnections(){
 syncWildcardOwner();if(!activeMemberId()||rewardsAuthError||rewardLevel()<3)return;
 const previous=currentWildcardDialog(),reward=currentRewardDialog(),input=$('message')||$('outgoingMessage');if(input)rememberChatText(input.value);
 const returnFocus=previous?.returnFocus||reward?.returnFocus||document.activeElement;changeModal('wildcard');
 wildcardDialog={state:s,account:activeMemberId(),epoch:wildcardEpoch,modalVersion,interactionVersion,view:s.view,screen:'connections',connectionId:'',categoryId:'',questionId:'',error:'',targets:[],nextCursor:null,targetsLoaded:false,targetsLoading:false,selecting:'',returnFocus,returnFocusAction:rewardCall('openRewardTile',3),fromReward:true};
 renderModal();loadWildcardTargets(true);
}
async function loadWildcardTargets(reset=false){
 const d=currentWildcardDialog();if(!d||d.screen!=='connections'||d.targetsLoading||d.selecting||!reset&&d.targetsLoaded&&!d.nextCursor)return;
 const focusKey=document.activeElement?.dataset.wildcardFocus;d.targetsLoading=true;d.error='';if(reset){d.targets=[];d.nextCursor=null;d.targetsLoaded=false}renderWildcardModal();
 const cursor=reset?null:d.nextCursor;
 try{
  const data=await wildcardApi(`/api/wildcards?targets=1${cursor?`&after=${encodeURIComponent(cursor)}`:''}`);if(currentWildcardDialog()!==d)return;
  const valid=row=>row&&/^[a-f0-9]{64}$/.test(row.id)&&typeof row.name==='string'&&row.name.trim()&&['friend','vibe'].includes(row.kind)&&typeof row.eligible==='boolean'&&row.limit===3&&Number.isInteger(row.remaining)&&row.remaining>=0&&row.remaining<=3;
  if(!Array.isArray(data.connections)||!data.connections.every(valid)||data.nextCursor!==null&&!/^[a-f0-9]{64}$/.test(data.nextCursor||'')||data.nextCursor&&(!data.connections.length||data.nextCursor!==data.connections.at(-1).id||cursor&&data.nextCursor<=cursor)||data.connections.some((row,i)=>row.id<=(i?data.connections[i-1].id:cursor||'')))throw Error('Connections returned an incomplete response. Try again.');
  if(reset)wildcardTargets.clear();for(const row of data.connections)wildcardTargets.set(row.id,row);
  d.targets=[...d.targets,...data.connections.map(row=>row.id)];d.nextCursor=data.nextCursor;d.targetsLoaded=true;
 }catch(e){if(currentWildcardDialog()!==d)return;if([401,403].includes(e.status)){invalidateRewardAccess(e);return}d.error=e.message||'Your connections couldn’t refresh. Try again.'}
 finally{if(currentWildcardDialog()===d){d.targetsLoading=false;renderWildcardModal(document.activeElement?.id==='wildcardTitle'?focusKey:undefined)}}
}
function repaintHydratedConnection(id){
 if(rewardRealId({id:s.selectedChempat})!==id||!['dashboard','conversation'].includes(s.view))return;
 const input=$('message')||$('outgoingMessage'),focused=input===document.activeElement,selection=focused?{start:input.selectionStart,end:input.selectionEnd}:null,chat=document.querySelector('.inlineChat'),scroll=chat?.scrollTop;
 if(input)rememberChatText(input.value);render(true);
 const next=$('message')||$('outgoingMessage');if(focused&&next&&rewardRealId({id:s.selectedChempat})===id){next.focus({preventScroll:true});if(selection)next.setSelectionRange(selection.start,selection.end)}const nextChat=document.querySelector('.inlineChat');if(nextChat&&scroll!==undefined)nextChat.scrollTop=scroll;
}
function evictHydratedConnection(id){
 const input=$('message')||$('outgoingMessage');if(input&&rewardRealId({id:s.selectedChempat})===id)rememberChatText(input.value);
 const cached=gamePieceConnections.has(id)||wildcardConnections.has(id);gamePieceConnections.delete(id);wildcardConnections.delete(id);wildcardTargets.delete(id);wildcardSummary.delete(id);gamePieceFeed=gamePieceFeed.filter(piece=>piece.connectionId!==id);
 if(cached)repaintHydratedConnection(id);paintGamePieceFeed();
}
function acceptWildcardConnection(row,id){
 if(!row||row.id!==id||!['member','prospect'].includes(row.side)||!wildcardConnectionEligible(row))throw Error('This connection is no longer available for cards. Refresh your connections.');
 const previous=hydratedConnectionRow(id),changed=JSON.stringify(previous)!==JSON.stringify(row),revision=(wildcardConnections.get(id)?.revision||0)+1;
 wildcardConnections.set(id,{row,updated:Date.now(),revision});const pieceCache=gamePieceConnections.get(id);if(pieceCache){pieceCache.row=row;pieceCache.updated=Date.now();pieceCache.revision=(pieceCache.revision||0)+1}
 // Replace only a matching inbox projection; never infer acceptance from its name.
 for(const key of ['inbox','friends','received']){const index=s[key].findIndex(c=>c.id===id);if(index>=0)s[key][index]=row}
 const outgoing=s.outgoing.findIndex(c=>c.id===id);if(outgoing>=0)s.outgoing[outgoing]=normalizeConnection(row);
 if(!s.liveMember&&s.actor==='prospect'&&s.liveId===id){s.firstConnection=connectionHistory(row);s.phase=row.status;s.messages=row.messages||[]}
 if(changed)repaintHydratedConnection(id);
}
async function chooseWildcardConnection(id){
 const d=currentWildcardDialog(),target=wildcardTargets.get(id);if(!d||d.screen!=='connections'||d.targetsLoading||d.selecting||!d.targets.includes(id)||!target?.eligible||target.remaining===0)return;
 d.selecting=id;d.error='';const revision=connectionRevision;renderWildcardModal();
 try{
  const data=await wildcardApi(`/api/wildcards?connection=${encodeURIComponent(id)}&hydrate=1`);if(currentWildcardDialog()!==d)return;
  // Validate the full snapshot before adopting this named connection or navigating.
  if(revision!==connectionRevision)throw Error('Your conversation changed while opening. Choose the connection again to refresh it.');const row=data.connection;if(!row||row.id!==id||!wildcardConnectionEligible(row))throw Error('This connection is no longer available for cards. Refresh your connections.');
  const entry=wildcardEntry(normalizeConnection(row));acceptWildcards(entry,data,id);
  if(!data.eligible||!data.remaining){target.eligible=data.eligible;target.remaining=data.remaining;throw Error(data.eligible?'You’ve played all 3 cards with this connection. Choose someone else.':'Cards are no longer available with this connection. Refresh and try again.')}
  acceptWildcardConnection(row,id);const chosen=memberConnections().find(c=>wildcardRealId(c)===id);if(!chosen)throw Error('This connection could not be opened. Try again.');
  const returnFocus=d.returnFocus,returnFocusAction=d.returnFocusAction;changeModal('');selectChempat(chosen.id);openWildcardPicker(chosen.id);
  const next=currentWildcardDialog();if(next){next.fromReward=true;next.returnFocus=returnFocus;next.returnFocusAction=returnFocusAction;renderWildcardModal('heading')}
 }catch(e){if(currentWildcardDialog()!==d)return;if([401,403].includes(e.status)){invalidateRewardAccess(e);return}if(e.status===404){wildcardTargets.delete(id);d.targets=d.targets.filter(target=>target!==id)}d.error=e.message||'This connection couldn’t open. Try again.'}
 finally{if(currentWildcardDialog()===d){d.selecting='';renderWildcardModal()}}
}
function wildcardRewardBack(){const d=currentWildcardDialog();if(!d||d.screen!=='connections'||d.selecting)return;const focus=d.returnFocus,action=d.returnFocusAction;openRewardLevel(3);if(currentRewardDialog()){rewardDialog.returnFocus=focus;rewardDialog.returnFocusAction=action}}
function wildcardInviteFriend(){const d=currentWildcardDialog();if(!d||d.screen!=='connections'||d.selecting)return;openFriendShare()}
function renderWildcardConnections(d){
 const busy=d.targetsLoading||!!d.selecting,targets=d.targets.map(id=>wildcardTargets.get(id)).filter(Boolean);
 return `${wildcardButton('← Step 3','wildcardRewardBack()',{disabled:!!d.selecting,key:'back'})}<h2 id="wildcardTitle" tabindex="-1">Who are you curious about?</h2><p class="wildcardTargetHelp">Choose an accepted Friend or a Vibe connection where you both opened chat.</p>${targets.length?`<div class="wildcardConnections">${targets.map(target=>`<button type="button" class="wildcardConnectionChoice" data-wildcard-focus="${esc(`connection:${target.id}`)}" onclick="${esc(wildcardCall('chooseWildcardConnection',target.id))}" ${busy||!target.eligible||target.remaining===0?'disabled':''}><span><b>${esc(connectionDisplayName(target.name,target.kind))}</b><small>${target.kind==='friend'?'Friend':'Vibe'} · ${target.eligible?`${target.remaining} of 3 left for you`: 'Unavailable'}</small></span><span aria-hidden="true">${d.selecting===target.id?'Opening…':'→'}</span></button>`).join('')}</div>`:d.targetsLoaded&&!d.error?'<p class="wildcardEmpty">No eligible connections yet. Cards work after a friend accepts your invitation, or after you both open a Vibe chat. Pending invitations can’t receive a card.</p>':''}${d.targetsLoaded&&targets.length&&!d.nextCursor&&targets.every(target=>target.eligible&&target.remaining===0)?'<p class="wildcardEmpty">You’ve played all 3 cards with each of these connections. A new eligible connection has its own allowance.</p>':''}${wildcardButton('Invite a friend','wildcardInviteFriend()',{disabled:!!d.selecting,primary:d.targetsLoaded&&!targets.length&&!d.error,key:'invite'})}${d.nextCursor?wildcardButton('More connections','loadWildcardTargets()',{disabled:busy,key:'more'}):''}${wildcardButton(d.error?'Try again':'Refresh connections','loadWildcardTargets(true)',{disabled:busy,key:'refresh'})}<p class="wildcardTargetStatus" role="status">${d.selecting?'Checking this connection and your balance…':d.targetsLoading?'Checking your connections…':''}</p>`;
}
function openWildcardPicker(id=s.selectedChempat){
 syncWildcardOwner();const c=wildcardConnection(id);if(!c||s.selectedChempat!==id)return;const entry=wildcardEntry(c);if(!entry.data?.eligible||entry.data.remaining===0||entry.pending)return;
 const returnFocus=document.activeElement;changeModal('wildcard');wildcardDialog={state:s,account:activeMemberId(),epoch:wildcardEpoch,modalVersion,interactionVersion,view:s.view,connectionId:id,screen:'categories',categoryId:'',questionId:'',error:'',returnFocus,returnFocusAction:wildcardCall('openWildcardPicker',id)};
 renderModal();loadWildcards(id,true);
}
function wildcardAnswerDraft(entry,id){if(!entry.answerDrafts.has(id))entry.answerDrafts.set(id,{text:'',attempt:null});return entry.answerDrafts.get(id)}
function openWildcardAnswer(id,questionId){
 syncWildcardOwner();const c=wildcardConnection(id);if(!c||s.selectedChempat!==id)return;const entry=wildcardEntry(c),card=entry.data?.cards?.find(card=>card.questionId===questionId);
 if(entry.pending||!card?.canAnswer||card.status!=='waiting'||card.direction!=='incoming')return;
 const returnFocus=document.activeElement;changeModal('wildcard');wildcardDialog={state:s,account:activeMemberId(),epoch:wildcardEpoch,modalVersion,interactionVersion,view:s.view,connectionId:id,screen:'answer',categoryId:card.categoryId,questionId,error:'',returnFocus,returnFocusAction:wildcardCall('openWildcardAnswer',id,questionId)};renderModal();loadWildcards(id,true);
}
function updateWildcardAnswer(value){const d=currentWildcardDialog();if(!d||d.screen!=='answer')return;const entry=wildcardEntry(wildcardConnection(d.connectionId));if(entry.pending)return;wildcardAnswerDraft(entry,d.questionId).text=value;d.error=''}
async function answerWildcard(){
 const d=currentWildcardDialog();if(!d||d.screen!=='answer')return;const c=wildcardConnection(d.connectionId),entry=wildcardEntry(c),card=entry.data?.cards?.find(card=>card.questionId===d.questionId);
 if(entry.pending||!card?.canAnswer||card.status!=='waiting'||card.direction!=='incoming')return;
 const draft=wildcardAnswerDraft(entry,d.questionId),field=$('wildcardAnswer');if(field)draft.text=field.value;const answer=draft.text.trim();
 if(!answer||answer.length>1000){d.error='Write an answer between 1 and 1,000 characters.';renderWildcardModal('answer');return}
 if(!draft.attempt||draft.attempt.text!==answer)draft.attempt={text:answer,requestId:globalThis.crypto?.randomUUID?.()||`reply_${Date.now()}_${Math.random().toString(36).slice(2)}`};
 const request={state:s,account:activeMemberId(),epoch:wildcardEpoch,connectionId:wildcardRealId(c),questionId:card.questionId,requestId:draft.attempt.requestId,kind:'answer'};entry.pending=request;entry.revision++;wildcardSummaryRevision++;d.error='';entry.error='';renderWildcardModal();paintWildcards();
 try{
  const data=await wildcardApi('/api/wildcards',{action:'answer',connectionId:request.connectionId,questionId:card.questionId,requestId:request.requestId,answer});
  if(!wildcardOwnerMatches(request)||!wildcardConnection(d.connectionId))return;
  const answered=data.cards?.find(item=>item.questionId===card.questionId&&item.ask.id===card.ask.id);if(answered?.status!=='answered'||answered.direction!=='incoming'||!answered.reply||answered.reply.text!==answer)throw Error('We couldn’t confirm your reply. Your answer is kept; try again.');
  acceptWildcards(entry,data,request.connectionId);completeGamePieces(request.connectionId,['wildcard-ask'],card.questionId);entry.answerDrafts.delete(card.questionId);entry.notice='Your answer is saved for both of you. No wildcard was used.';connectionRevision++;request.refreshConnection=wildcardConnections.has(request.connectionId);
  const returnToChat=currentWildcardDialog()===d;if(returnToChat)closeInvite();await refreshLive(true);if(returnToChat&&wildcardOwnerMatches(request)&&s.selectedChempat===d.connectionId&&!s.modal)($('message')||$('outgoingMessage'))?.focus({preventScroll:true});
 }catch(e){if(!wildcardOwnerMatches(request))return;if([401,403].includes(e.status)){invalidateRewardAccess(e);return}if(e.status===404){entry.data=null;evictHydratedConnection(request.connectionId)}entry.error=e.message;if(currentWildcardDialog()===d)d.error=e.message;if(e.status===409){try{acceptWildcards(entry,e.snapshot,request.connectionId)}catch{request.reload=true}}}
 finally{if(entry.pending===request)entry.pending=null;if(wildcardOwnerMatches(request)){if(request.reload||request.refreshConnection)await loadWildcards(d.connectionId,true);paintWildcards();if(currentWildcardDialog()?.connectionId===d.connectionId)renderWildcardModal();loadWildcardSummary(true)}}
}
function chooseWildcardCategory(id){
 const d=currentWildcardDialog();if(!d||d.screen==='connections')return;const entry=wildcardEntry(wildcardConnection(d.connectionId));if(entry.pending||!entry.data?.eligible||!entry.data.categories.some(category=>category.id===id))return;
 d.categoryId=id;d.questionId='';d.screen='questions';d.error='';renderWildcardModal('heading');
}
function chooseWildcardQuestion(id){
 const d=currentWildcardDialog();if(!d||d.screen!=='questions')return;const entry=wildcardEntry(wildcardConnection(d.connectionId)),category=entry.data?.categories.find(category=>category.id===d.categoryId);if(entry.pending||!entry.data?.eligible||entry.data.remaining===0||entry.data.usedQuestionIds.includes(id)||!category?.questions.some(q=>q.id===id))return;
 d.questionId=id;d.screen='confirm';d.error='';renderWildcardModal('heading');
}
function wildcardBack(){
 const d=currentWildcardDialog();if(!d||d.screen==='connections')return;const entry=wildcardEntry(wildcardConnection(d.connectionId));if(entry.pending)return;
 const focus=d.screen==='confirm'?`question:${d.questionId}`:`category:${d.categoryId}`;d.screen=d.screen==='confirm'?'questions':'categories';d.questionId='';d.error='';renderWildcardModal(focus);
}
function renderWildcardModal(focusKey){
 const d=currentWildcardDialog();if(!d){if(s.modal==='wildcard'){changeModal('');$('modalHost').innerHTML=''}return}
 const c=wildcardConnection(d.connectionId),entry=c?wildcardEntry(c):{data:null,error:'',pending:null},data=entry.data,busy=!!entry.pending,category=data?.categories.find(category=>category.id===d.categoryId),question=category?.questions.find(q=>q.id===d.questionId);
 if(d.screen==='confirm'&&(!question||data.usedQuestionIds.includes(d.questionId)||data.remaining===0)){d.screen=category?'questions':'categories';d.questionId='';d.error='That wildcard is no longer available. Your balance is up to date.'}
 const card=data?.cards?.find(card=>card.questionId===d.questionId);
 let content='';if(d.screen==='connections')content=renderWildcardConnections(d);else if(d.screen==='answer'){const draft=wildcardAnswerDraft(entry,d.questionId);content=card?`<h2 id="wildcardTitle" tabindex="-1">${card.status==='answered'?'Card answered':`Answer ${esc(c.name)}’s card`}</h2><p class="wildcardPreview">${esc(card.ask.text)}</p>${card.reply?`<div class="wildcardCardReply"><b>Your saved answer</b><p>${esc(card.reply.text)}</p></div>`:card.canAnswer?`<label class="wildcardAnswerLabel" for="wildcardAnswer">Your answer</label><textarea id="wildcardAnswer" class="wildcardAnswerInput" data-wildcard-focus="answer" maxlength="1000" rows="4" aria-describedby="wildcardAnswerHelp" oninput="updateWildcardAnswer(this.value)" ${busy?'disabled':''}>${esc(draft.text)}</textarea><p id="wildcardAnswerHelp" class="wildcardHint">Your reply is shared only in this chat with ${esc(c.name)}. Replying uses no wildcard.</p><div class="wildcardActions">${wildcardButton(`Send answer to ${c.name}`,'answerWildcard()',{disabled:busy,primary:true,key:'send-answer'})}${wildcardButton('Not now','closeInvite()',{disabled:busy,key:'cancel'})}</div>`:'<p>This card cannot be answered right now.</p>'}`:`<h2 id="wildcardTitle" tabindex="-1">Card unavailable</h2><p>This card is no longer available in this connection.</p>`}
 else if(!data?.eligible)content=`<h2 id="wildcardTitle" tabindex="-1">Wildcards unavailable</h2><p>${esc(entry.error||'Duhwildcards unlock after Step 3 for an accepted Friend or a Vibe chat you both opened.')}</p>${wildcardButton('Check again',wildcardCall('loadWildcards',c.id,true),{disabled:!!entry.loading})}`;
 else if(d.screen==='categories')content=`${d.fromReward?wildcardButton('← Connections','openWildcardConnections()',{disabled:busy,key:'back'}):''}<h2 id="wildcardTitle" tabindex="-1">Pick a category</h2><div class="wildcardCategories">${data.categories.map(category=>wildcardButton(category.title,wildcardCall('chooseWildcardCategory',category.id),{disabled:busy,key:`category:${category.id}`})).join('')}</div>`;
 else if(d.screen==='questions')content=`${wildcardButton('← Categories','wildcardBack()',{disabled:busy,key:'back'})}<h2 id="wildcardTitle" tabindex="-1">${esc(category?.title||'Pick a question')}</h2><div class="wildcardQuestions">${(category?.questions||[]).map(q=>data.usedQuestionIds.includes(q.id)?'<button type="button" class="wildcardQuestion played" disabled aria-label="Already played"><span class="wildcardMask" aria-hidden="true">•••• ••••• •••••</span><span>Already played</span></button>':`<button type="button" class="wildcardQuestion" data-wildcard-focus="${esc(`question:${q.id}`)}" onclick="${esc(wildcardCall('chooseWildcardQuestion',q.id))}" ${busy||data.remaining===0?'disabled':''}>${esc(q.text)}</button>`).join('')}</div>`;
 else content=`${wildcardButton('← Questions','wildcardBack()',{disabled:busy,key:'back'})}<h2 id="wildcardTitle" tabindex="-1">Ask ${esc(c.name)}?</h2><p class="wildcardPreview">${esc(question.text)}</p><p class="wildcardHint">This posts to your private chat and uses 1 wildcard. They can answer whenever they like, or pass.</p><div class="wildcardActions">${wildcardButton('Ask this','askWildcard()',{disabled:busy,primary:true,key:'ask'})}${wildcardButton('Cancel','closeInvite()',{disabled:busy,key:'cancel'})}</div>`;
 const previous=$('modalHost').querySelector('.wildcardModal'),hadFocus=previous?.contains(document.activeElement),previousFocus=hadFocus?document.activeElement.dataset.wildcardFocus:null,selection=hadFocus&&typeof document.activeElement.selectionStart==='number'?{start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:null,scroll=previous?.scrollTop||0;
 $('modalHost').innerHTML=`<div class="modalBackdrop" onclick="closeInvite(event)"><section class="modal wildcardModal" role="dialog" aria-modal="true" aria-labelledby="wildcardTitle" aria-describedby="wildcardRemaining"><button type="button" class="close" data-wildcard-focus="close" aria-label="Close wildcards" onclick="closeInvite()">×</button><div class="eyebrow">A LITTLE MORE TO ASK</div><p id="wildcardRemaining" class="wildcardRemaining">${d.screen==='connections'?'3 cards per person, per connection after Step 3. Answering uses no card.':data?.eligible?`${data.remaining} of ${data.limit} left with ${esc(c.name)} · Your own allowance`:'Your balance is unchanged here.'}</p>${content}<p id="wildcardStatus" role="status">${busy?entry.pending.kind==='answer'?'Sending your reply…':'Sending your wildcard…':''}</p><p id="wildcardError" class="error" role="alert">${esc(d.error||entry.error)}</p></section></div>`;
 const modal=$('modalHost').querySelector('.wildcardModal');modal.scrollTop=focusKey?0:scroll;
 if(focusKey||!previous||hadFocus){const key=focusKey||previousFocus,target=key&&[...modal.querySelectorAll('[data-wildcard-focus]')].find(button=>button.dataset.wildcardFocus===key&&!button.disabled);(target||$('wildcardTitle')).focus({preventScroll:true});if(target&&selection&&target.setSelectionRange)target.setSelectionRange(selection.start,selection.end)}
}
async function askWildcard(){
 const d=currentWildcardDialog();if(!d||d.screen!=='confirm')return;const c=wildcardConnection(d.connectionId),entry=wildcardEntry(c),question=entry.data?.categories.find(category=>category.id===d.categoryId)?.questions.find(q=>q.id===d.questionId);
 if(entry.pending||!entry.data?.eligible||entry.data.remaining===0||entry.data.usedQuestionIds.includes(d.questionId)||!question)return;
 let requestId=entry.attempts.get(question.id);if(!requestId){requestId=globalThis.crypto?.randomUUID?.()||`wildcard_${Date.now()}_${Math.random().toString(36).slice(2)}`;entry.attempts.set(question.id,requestId)}
 const request={state:s,account:activeMemberId(),epoch:wildcardEpoch,connectionId:wildcardRealId(c),questionId:question.id,requestId};entry.pending=request;entry.revision++;wildcardSummaryRevision++;entry.error='';d.error='';renderWildcardModal();paintWildcards();
 try{
  const data=await wildcardApi('/api/wildcards',{action:'ask',connectionId:request.connectionId,questionId:question.id,requestId});
  if(!wildcardOwnerMatches(request)||!wildcardConnection(d.connectionId))return;
  if(!data.eligible||!data.usedQuestionIds?.includes(question.id)||!data.message||data.message.wildcardQuestionId!==question.id||typeof data.message.id!=='string'||!['member','prospect'].includes(data.message.by)||typeof data.message.text!=='string')throw Error('We couldn’t confirm your wildcard. Try again.');
  acceptWildcards(entry,data,request.connectionId);entry.attempts.delete(question.id);entry.notice='Wildcard sent to your private chat.';connectionRevision++;request.refreshConnection=wildcardConnections.has(request.connectionId);
  const returnToChat=currentWildcardDialog()===d;if(returnToChat)closeInvite();
  // A refresh uses the established chat path; no local balance decrement or
  // synthetic chat message can turn a failed request into a successful ask.
  await refreshLive(true);if(returnToChat&&wildcardOwnerMatches(request)&&s.selectedChempat===d.connectionId&&!s.modal)($('message')||$('outgoingMessage'))?.focus({preventScroll:true});
 }catch(e){
  if(!wildcardOwnerMatches(request))return;
  if([401,403].includes(e.status)){invalidateRewardAccess(e);return}if(e.status===404){entry.data=null;evictHydratedConnection(request.connectionId)}
  entry.error=e.message;if(currentWildcardDialog()===d)d.error=e.message;
  if(e.status===409){try{acceptWildcards(entry,e.snapshot,request.connectionId)}catch{request.reload=true}}
 }finally{
  if(entry.pending===request)entry.pending=null;
  if(wildcardOwnerMatches(request)){if(request.reload||request.refreshConnection)await loadWildcards(d.connectionId,true);paintWildcards();if(currentWildcardDialog()?.connectionId===d.connectionId)renderWildcardModal();loadWildcardSummary(true)}
 }
}
function refreshWildcards(){
 if(document.hidden)return;if(Date.now()-wildcardSummaryUpdated>=15000)loadWildcardSummary(true);if(Date.now()-gamePiecePhonesUpdated>=15000)loadGamePiecePhones(true);if(Date.now()-gamePieceFeedUpdated>=15000)loadGamePieces(true);const hydrated=gamePieceConnections.get(s.selectedChempat);if(hydrated&&Date.now()-hydrated.updated>=15000)hydrateGamePieceConnection(hydrated.piece,true,true);const panel=$('connectionWildcards'),c=panel&&wildcardConnection(panel.dataset.connection);if(c){const entry=wildcardEntry(c);if(!entry.error&&Date.now()-entry.updated>=15000)loadWildcards(c.id,true)}
}

// One arrival card after sign-in/resume. Held metadata contains IDs only, never
// questions, answers, or numbers. Polling updates badges but does not reopen it.
const GAME_PIECE_HOLDS='duhwild.game-piece-holds.v1';
let gamePieceAccount=null,gamePieceVisit='',gamePieceHeld=new Set(),gamePieceAutoUsed=false,gamePieceLoading=null,gamePieceDialog=null,gamePiecePhoneRequests=new Map(),gamePiecePhonesLoading=null,gamePiecePhonesRevision=0,gamePiecePhonesUpdated=0,gamePieceFeed=[],gamePieceFeedLoading=null,gamePieceFeedRevision=0,gamePieceFeedUpdated=0,gamePieceFeedError='',gamePieceReceipts=new Map(),gamePieceReceiptRevisions=new Map(),gamePieceConnections=new Map(),gamePieceHydrationLoading=new Map();
function persistGamePieceVisit(){if(!gamePieceAccount)return;try{sessionStorage.setItem(GAME_PIECE_HOLDS,JSON.stringify({account:gamePieceAccount,visit:gamePieceVisit,held:[...gamePieceHeld].slice(-500)}))}catch{}}
function resetGamePieceVisit(){try{sessionStorage.removeItem(GAME_PIECE_HOLDS)}catch{}gamePieceAccount=null;gamePieceVisit='';gamePieceHeld=new Set();gamePieceAutoUsed=false;gamePieceLoading=null;gamePieceDialog=null;gamePiecePhoneRequests=new Map();gamePiecePhonesLoading=null;gamePiecePhonesRevision++;gamePiecePhonesUpdated=0;gamePieceFeed=[];gamePieceFeedLoading=null;gamePieceFeedRevision++;gamePieceFeedUpdated=0;gamePieceFeedError='';gamePieceReceipts=new Map();gamePieceReceiptRevisions=new Map();gamePieceConnections=new Map();gamePieceHydrationLoading=new Map()}
function syncGamePieceOwner(){
 const account=activeMemberId();if(account===gamePieceAccount)return;const previous=gamePieceAccount;
 if(previous&&previous!==account){try{sessionStorage.removeItem(GAME_PIECE_HOLDS)}catch{}}
 gamePieceAccount=account;gamePieceHeld=new Set();gamePieceAutoUsed=false;gamePieceLoading=null;gamePieceDialog=null;gamePiecePhoneRequests=new Map();gamePiecePhonesLoading=null;gamePiecePhonesRevision++;gamePiecePhonesUpdated=0;gamePieceFeed=[];gamePieceFeedLoading=null;gamePieceFeedRevision++;gamePieceFeedUpdated=0;gamePieceFeedError='';gamePieceReceipts=new Map();gamePieceReceiptRevisions=new Map();gamePieceConnections=new Map();gamePieceHydrationLoading=new Map();gamePieceVisit='';
 if(account){try{const saved=JSON.parse(sessionStorage.getItem(GAME_PIECE_HOLDS)||'null');if(saved?.account===account&&/^[a-zA-Z0-9_-]{8,128}$/.test(saved.visit||'')){gamePieceVisit=saved.visit;if(Array.isArray(saved.held))gamePieceHeld=new Set(saved.held.filter(id=>typeof id==='string'&&/^[1-9][0-9]{0,18}$/.test(id)).slice(0,500))}}catch{}if(!gamePieceVisit)gamePieceVisit=globalThis.crypto?.randomUUID?.()||`visit_${Date.now()}_${Math.random().toString(36).slice(2)}`;persistGamePieceVisit()}
}
function rememberHeldGamePiece(id){gamePieceHeld.add(id);persistGamePieceVisit()}
const friendWildcardPiece=piece=>['wildcard-ask','wildcard-answer'].includes(piece.kind)&&piece.target?.type==='wildcard';
function gamePieceConnection(piece){return memberConnections().find(c=>rewardRealId(c)===piece.connectionId&&!inactiveConnection(c)&&(!isFriend(c)||friendWildcardPiece(piece)&&wildcardConnectionEligible(c)))}
async function hydrateGamePieceConnection(piece,force=false,background=false){
 const known=gamePieceConnection(piece),cached=gamePieceConnections.get(piece.connectionId);if(known&&!cached)return known;if(cached&&!force&&Date.now()-cached.updated<15000)return known;
 if(gamePieceHydrationLoading.has(piece.connectionId))return gamePieceHydrationLoading.get(piece.connectionId);
 const request={state:s,account:activeMemberId(),epoch:wildcardEpoch,visit:gamePieceVisit,revision:cached?.revision||0,connectionRevision};
 const promise=(async()=>{
  try{const data=await wildcardApi(`/api/game-pieces?visit=${encodeURIComponent(request.visit)}&piece=${piece.id}&connection=${piece.connectionId}${background?'&refresh=1':''}`);if(!wildcardOwnerMatches(request))return null;if(request.connectionRevision!==connectionRevision||(gamePieceConnections.get(piece.connectionId)?.revision||0)!==request.revision)return gamePieceConnection(piece);const row=data.connection;if(!background&&(!validGamePiece(data.piece)||data.piece.id!==piece.id)||!row||row.id!==piece.connectionId||!['member','prospect'].includes(row.side)||typeof row.status!=='string'||isFriend(row)&&(!friendWildcardPiece(piece)||!wildcardConnectionEligible(row))||inactiveConnection(row))throw Error('This game piece’s connection is no longer available.');
   const currentPiece=background?piece:data.piece;gamePieceConnections.set(row.id,{row,piece:currentPiece,updated:Date.now(),revision:request.revision});if(wildcardConnections.has(row.id))wildcardConnections.set(row.id,{row,updated:Date.now(),revision:(wildcardConnections.get(row.id).revision||0)+1});if(!background){const index=gamePieceFeed.findIndex(item=>item.id===piece.id);if(index>=0)gamePieceFeed[index]=data.piece;gamePieceReceiptRevisions.set(piece.id,Math.max(data.piece.receiptRevision,gamePieceReceiptRevisions.get(piece.id)||0))}if(background&&!isFriend(row)&&s.selectedChempat===row.id&&s.liveId===row.id&&s.view!=='questions'&&!s.memberQuestionsOpen&&!s.prospectQuestionsOpen)applyConnection(row);if(background&&s.selectedChempat===row.id&&['dashboard','conversation'].includes(s.view))repaintHydratedConnection(row.id);return gamePieceConnection(currentPiece);
  }catch(e){if(!wildcardOwnerMatches(request))return null;if(request.connectionRevision!==connectionRevision||(gamePieceConnections.get(piece.connectionId)?.revision||0)!==request.revision)return gamePieceConnection(piece);if([401,403].includes(e.status))invalidateRewardAccess(e);else{if(e.status===404){evictHydratedConnection(piece.connectionId);if(s.selectedChempat===piece.connectionId&&!memberConnections().some(c=>c.id===piece.connectionId))render(true)}gamePieceFeedError=e.message||'This connection could not be loaded. Try again.';paintGamePieceFeed()}return null}
 })();gamePieceHydrationLoading.set(piece.connectionId,promise);try{return await promise}finally{if(gamePieceHydrationLoading.get(piece.connectionId)===promise)gamePieceHydrationLoading.delete(piece.connectionId)}
}
function gamePieceCopy(piece){
 const actor=piece.actorName||gamePieceConnection(piece)?.name||'Your connection';
 if(piece.kind==='phone-offer'&&piece.status==='answered')return {title:`Your phone exchange with ${actor} is ready`,detail:'You both chose to exchange numbers. You can view the already-shared exchange in your private connection.',action:'View numbers'};
 const copy={
  'step-complete':{title:`${actor} finished Step ${piece.level}`,detail:`${actor} completed ${REWARD_LABELS[(piece.level||1)-1]}. ${REWARD_NAMES[(piece.level||1)-1]} is now available to them. Your own progress and both sharing choices stay separate.`,action:'See our connection'},
  'continue-request':{title:`${actor} wants to keep going`,detail:'Review your first five together, then choose whether you want to continue.',action:'Review our next step'},
  'continue-ready':{title:'Your next five are ready',detail:`You and ${actor} both chose to keep going. Open your connection to see your next step.`,action:'Open our connection'},
  'chat-request':{title:`${actor} is ready to chat`,detail:'Open your connection and choose whether to open Private Chat. Nothing is accepted for you.',action:'Review opening chat'},
  'chat-ready':{title:`Private Chat with ${actor} is ready`,detail:'You both chose to open chat. Pick up your conversation whenever you like.',action:'Open our chat'},
  'phone-offer':{title:`${actor} offered a phone exchange`,detail:'Review your own number and choose whether to offer it to this connection. Numbers appear only after you both opt in.',action:'Review phone offer'},
  'directory-listed':{title:`${actor} is ready to be discovered`,detail:'They chose to list their name and photo. View their currently available listing in member discovery.',action:'View their profile'},
  'intro-published':{title:`${actor} shared a 15-second hello`,detail:'Open their available introduction in member discovery. The video plays only when you choose.',action:'View their introduction'},
  'wildcard-ask':{title:`${actor} played a card`,detail:'Your reply belongs in this private chat. Answering uses no wildcard.',action:'Play now'},
  'wildcard-answer':{title:`${actor} answered your card`,detail:'The question and their reply are together in your private connection.',action:'View their answer'}
 };
 return copy[piece.kind]||{title:'A new game piece',detail:'Open your connection to review what changed.',action:'Open connection'};
}
function validGamePiece(piece){
 const kinds=['step-complete','continue-request','continue-ready','chat-request','chat-ready','phone-offer','directory-listed','intro-published','wildcard-ask','wildcard-answer'];
 const base=piece&&/^[1-9][0-9]{0,18}$/.test(piece.id)&&piece.version===1&&kinds.includes(piece.kind)&&/^[a-f0-9]{64}$/.test(piece.connectionId)&&typeof piece.actorName==='string'&&['your-turn','waiting','answered','ready'].includes(piece.status)&&typeof piece.held==='boolean'&&typeof piece.shouldPrompt==='boolean'&&Number.isInteger(piece.receiptRevision)&&piece.receiptRevision>=0&&piece.target&&['connection','phone','reward','intro','wildcard','directory'].includes(piece.target.type)&&piece.target.connectionId===piece.connectionId&&(piece.level===undefined||Number.isInteger(piece.level)&&piece.level>=1&&piece.level<=5)&&(piece.target.questionId===undefined||/^[a-zA-Z0-9_-]{1,128}$/.test(piece.target.questionId))&&(piece.target.memberId===undefined||/^[a-zA-Z0-9_-]{1,128}$/.test(piece.target.memberId));
 if(!base)return false;const expected=piece.kind==='phone-offer'?'phone':piece.kind==='intro-published'?'intro':piece.kind==='directory-listed'?'directory':piece.kind.startsWith('wildcard-')?'wildcard':'connection';
 return piece.target.type===expected&&(piece.kind!=='step-complete'||Number.isInteger(piece.level)&&piece.target.level===piece.level)&&(!piece.kind.startsWith('wildcard-')||typeof piece.questionId==='string'&&piece.target.questionId===piece.questionId)&&(!['intro','directory'].includes(expected)||typeof piece.target.memberId==='string');
}
function renderGamePieceFeed(){return `<section class="gamePieceFeed" id="gamePieceFeed" aria-label="Your shared game pieces" ${gamePieceFeed.length||gamePieceFeedError?'':'hidden'}>${gamePieceFeedContent()}</section>`}
function gamePieceFeedContent(){return `<div class="gamePieceFeedHeading"><h2>Game pieces</h2><span>${gamePieceFeed.length} to review</span></div><div class="gamePieceFeedItems">${gamePieceFeed.map(piece=>{const copy=gamePieceCopy(piece);return `<button type="button" class="gamePieceFeedItem" data-piece-id="${piece.id}" onclick="openGamePiece('${piece.id}')"><span><b>${esc(copy.title)}</b><small>${esc(piece.status==='your-turn'?'Your turn':piece.status==='answered'?'Answered':piece.status==='waiting'?'Waiting':'Ready')}${piece.held||gamePieceHeld.has(piece.id)?' · Held for later':''}</small></span><span aria-hidden="true">→</span></button>`}).join('')}</div>${gamePieceFeedError?`<p class="error" role="status">${esc(gamePieceFeedError)}</p><button type="button" class="button light rewardButton" onclick="loadGamePieces(true)">Refresh game pieces</button>`:''}`}
function paintGamePieceFeed(){const host=$('gamePieceFeed');if(host){const focused=host.contains(document.activeElement)?document.activeElement.dataset.pieceId:null;host.hidden=!gamePieceFeed.length&&!gamePieceFeedError;host.innerHTML=gamePieceFeedContent();if(focused)host.querySelector(`[data-piece-id="${focused}"]`)?.focus({preventScroll:true})}paintWildcardIndicators()}
async function loadGamePieces(force=false){
 syncGamePieceOwner();if(!activeMemberId()||rewardsAuthError||gamePieceFeedLoading||!force&&gamePieceFeedUpdated||!['dashboard','conversation'].includes(s.view))return;
 const request={state:s,account:activeMemberId(),epoch:wildcardEpoch,revision:gamePieceFeedRevision,visit:gamePieceVisit};gamePieceFeedLoading=request;
 try{
  const pieces=[],cursors=new Set();let cursor=null;
  do{const data=await wildcardApi(`/api/game-pieces?visit=${encodeURIComponent(request.visit)}${cursor?`&after=${encodeURIComponent(cursor)}`:''}`);if(!wildcardOwnerMatches(request)||request.revision!==gamePieceFeedRevision)return;if(!Array.isArray(data.pieces)||!data.pieces.every(validGamePiece)||!Number.isInteger(data.pendingCount)||data.pendingCount<0||data.nextCursor!==undefined&&data.nextCursor!==null&&!/^[1-9][0-9]{0,18}$/.test(data.nextCursor))throw Error('Game pieces returned an incomplete response. Try again.');pieces.push(...data.pieces);cursor=data.nextCursor||null;if(cursor){if(cursors.has(cursor))throw Error('Game pieces repeated a page. Try again.');cursors.add(cursor)}}while(cursor);
  if(new Set(pieces.map(piece=>piece.id)).size!==pieces.length)throw Error('Game pieces repeated an item. Try again.');gamePieceFeed=pieces;for(const piece of pieces)gamePieceReceiptRevisions.set(piece.id,Math.max(piece.receiptRevision,gamePieceReceiptRevisions.get(piece.id)||0));gamePieceFeedError='';gamePieceFeedUpdated=Date.now();
 }
 catch(e){if(wildcardOwnerMatches(request)&&request.revision===gamePieceFeedRevision){gamePieceFeedUpdated=Date.now();if([401,403].includes(e.status)){invalidateRewardAccess(e);return}gamePieceFeedError='Your game pieces couldn’t refresh. Try again.'}}
 finally{if(gamePieceFeedLoading===request)gamePieceFeedLoading=null;if(wildcardOwnerMatches(request)){paintGamePieceFeed();if(s.modal==='gamePiece')renderGamePieceModal();maybePresentGamePiece()}}
}
function recordGamePiece(action,piece){
 const owner={state:s,account:activeMemberId(),epoch:wildcardEpoch,visit:gamePieceVisit},previous=gamePieceReceipts.get(piece.id);gamePieceFeedRevision++;
 const promise=(async()=>{if(previous)await previous.catch(()=>{});if(!wildcardOwnerMatches(owner))return;try{const data=await wildcardApi('/api/game-pieces',{action,id:piece.id,version:piece.version,visit:owner.visit,receiptRevision:gamePieceReceiptRevisions.get(piece.id)??piece.receiptRevision});if(!wildcardOwnerMatches(owner))return;if(data.ok!==true||!Number.isInteger(data.receiptRevision)||data.receiptRevision<0)throw Error('Game-piece choice could not be saved.');piece.receiptRevision=data.receiptRevision;gamePieceReceiptRevisions.set(piece.id,data.receiptRevision);if(action==='handled')gamePieceFeed=gamePieceFeed.filter(item=>item.id!==piece.id);else{const current=gamePieceFeed.find(item=>item.id===piece.id);if(current){current.receiptRevision=data.receiptRevision;current.shouldPrompt=false;if(action==='hold')current.held=true}}gamePieceFeedError='';paintGamePieceFeed()}catch(e){if(!wildcardOwnerMatches(owner))return;if([401,403].includes(e.status))invalidateRewardAccess(e);else if(e.status===409&&e.snapshot?.receiptConflict){await loadGamePieces(true)}else if(e.status===404){gamePieceFeed=gamePieceFeed.filter(item=>item.id!==piece.id);paintGamePieceFeed()}else{gamePieceFeedError=action==='hold'?'Held in this tab. That choice couldn’t save to your account yet.':'Your game-piece update couldn’t save. Refresh to check it.';paintGamePieceFeed()}}})();
 gamePieceReceipts.set(piece.id,promise);promise.finally(()=>{if(gamePieceReceipts.get(piece.id)===promise)gamePieceReceipts.delete(piece.id)});return promise;
}
function completeGamePieces(connectionId,kinds,questionId,level){for(const piece of [...gamePieceFeed])if(piece.connectionId===connectionId&&kinds.includes(piece.kind)&&(!questionId||piece.target.questionId===questionId)&&(level===undefined||piece.kind!=='step-complete'||piece.level===level))recordGamePiece('handled',piece)}
async function loadGamePiecePhones(force=false){
 syncGamePieceOwner();if(!activeMemberId()||rewardsAuthError||gamePiecePhonesLoading||!force&&gamePiecePhonesUpdated)return;
 if(!memberConnections().some(c=>!isFriend(c)&&wildcardConnection(c.id))){gamePiecePhonesUpdated=Date.now();return}
 const request={state:s,account:activeMemberId(),epoch:wildcardEpoch,revision:gamePiecePhonesRevision};gamePiecePhonesLoading=request;
 try{const data=await rewardApi('/api/rewards?phoneRequests=1');if(!wildcardOwnerMatches(request)||request.revision!==gamePiecePhonesRevision)return;if(!Array.isArray(data.phoneRequests)||!data.phoneRequests.every(row=>/^[a-f0-9]{64}$/.test(row.connectionId)&&typeof row.offeredAt==='string'&&Number.isFinite(Date.parse(row.offeredAt))))throw Error('Phone requests could not be checked.');gamePiecePhoneRequests=new Map(data.phoneRequests.map(row=>[row.connectionId,row]));gamePiecePhonesUpdated=Date.now()}
 catch(e){if(wildcardOwnerMatches(request)&&request.revision===gamePiecePhonesRevision)gamePiecePhonesUpdated=Date.now()}
 finally{if(gamePiecePhonesLoading===request)gamePiecePhonesLoading=null;if(wildcardOwnerMatches(request)){paintWildcardIndicators();if(s.modal==='gamePiece')renderGamePieceModal();maybePresentGamePiece()}}
}
function safeGamePieceArrival(){
 if(s.view!=='dashboard'||s.modal||openConnectionMenu||refreshing||rewardsAuthError||s.memberQuestionsOpen||s.prospectQuestionsOpen||rewardsPending||rewardDirectoryPending)return false;
 const active=document.activeElement;if(active?.matches('input,textarea,select,[contenteditable="true"]'))return false;
 if([...document.querySelectorAll('#root input:not([type="radio"]):not([type="checkbox"]):not([type="file"]),#root textarea')].some(field=>field.value?.trim()))return false;
 return ![...chatDrafts.entries()].some(([key,draft])=>key.startsWith(`${activeMemberId()}:`)&&(draft.text?.trim()||draft.photo||draft.photoRequest));
}
async function maybePresentGamePiece(){
 syncGamePieceOwner();if(gamePieceAutoUsed||gamePieceLoading||!gamePieceFeedUpdated||!safeGamePieceArrival())return;
 const pieces=gamePieceFeed.filter(piece=>piece.shouldPrompt&&!piece.held&&!gamePieceHeld.has(piece.id)&&piece.status!=='waiting'),request={state:s,account:activeMemberId(),epoch:wildcardEpoch,interactionVersion,modalVersion,view:s.view};gamePieceLoading=request;
 try{for(const piece of pieces){const c=await hydrateGamePieceConnection(piece);if(!wildcardOwnerMatches(request)||interactionVersion!==request.interactionVersion||modalVersion!==request.modalVersion||s.view!==request.view||!safeGamePieceArrival())return;if(c){presentGamePiece(gamePieceFeed.find(item=>item.id===piece.id)||piece,pieces.length);return}}if(!gamePieceFeedError)gamePieceAutoUsed=true}
 finally{if(gamePieceLoading===request)gamePieceLoading=null}
}

function presentGamePiece(piece,total,manual=false){
 if(!manual&&!safeGamePieceArrival()||s.modal)return;gamePieceAutoUsed=true;const returnFocus=document.activeElement;changeModal('gamePiece');gamePieceDialog={state:s,account:activeMemberId(),epoch:wildcardEpoch,modalVersion,piece,total,returnFocus,error:''};renderModal();recordGamePiece('seen',piece);
}
async function openGamePiece(id){const piece=gamePieceFeed.find(piece=>piece.id===id);if(!piece||s.modal)return;const request={state:s,account:activeMemberId(),epoch:wildcardEpoch,interactionVersion,modalVersion,view:s.view};const c=await hydrateGamePieceConnection(piece);if(c&&wildcardOwnerMatches(request)&&interactionVersion===request.interactionVersion&&modalVersion===request.modalVersion&&s.view===request.view&&!s.modal)presentGamePiece(gamePieceFeed.find(item=>item.id===id)||piece,gamePieceFeed.length,true)}
function currentGamePiece(){const d=gamePieceDialog;return d&&s.modal==='gamePiece'&&wildcardOwnerMatches(d)&&d.modalVersion===modalVersion&&s.view==='dashboard'&&(d.mode==='media'?rewardLevel()>=4:gamePieceFeed.some(piece=>piece.id===d.piece.id))&&gamePieceConnection(d.piece)?d:null}
function holdGamePiece(){const d=currentGamePiece();if(d&&!d.media?.acknowledged){rememberHeldGamePiece(d.piece.id);recordGamePiece('hold',d.piece)}const focus=d?.returnFocus;gamePieceDialog=null;changeModal('');renderModal();paintGamePieceFeed();if(focus?.isConnected)focus.focus({preventScroll:true})}
function currentGamePieceRoute(request){return wildcardOwnerMatches(request)&&s.view===request.view&&interactionVersion===request.interactionVersion&&modalVersion===request.modalVersion&&!s.modal}
async function playGamePiece(){
 const d=currentGamePiece();if(!d){changeModal('');renderModal();return}const piece=d.piece,request={state:s,account:activeMemberId(),epoch:wildcardEpoch},target=piece.target;
 rememberHeldGamePiece(piece.id);const actionable=piece.status==='your-turn';if(actionable)recordGamePiece('hold',piece);gamePieceDialog=null;changeModal('');renderModal();request.interactionVersion=interactionVersion;request.modalVersion=modalVersion;request.view=s.view;let opened=false,actionAlreadyComplete=false;
 try{
  await refreshLive(true);if(!currentGamePieceRoute(request))return;const c=await hydrateGamePieceConnection(piece,true);if(!currentGamePieceRoute(request))return;if(!c)throw Error('This game piece is no longer available in that connection.');selectChempat(c.id,target.type==='connection'&&!!target.level&&target.level<=2);request.interactionVersion=interactionVersion;request.modalVersion=modalVersion;request.view=s.view;
  if(target.type==='phone'){await loadRewardConnection(c.id,true);if(!currentGamePieceRoute(request)||s.selectedChempat!==c.id||!safeGamePieceArrival())return;const phone=rewardConnectionData(c)?.phone;if(!phone?.eligible||!phone.otherOffered||phone.ownOffered&&!phone.shared)throw Error('This phone offer is no longer available.');actionAlreadyComplete=phone.shared===true;openRewardPhone(c.id);opened=currentRewardDialog()?.connectionId===c.id}
  else if(target.type==='wildcard'){
   const reading=loadWildcards(c.id,true);await (wildcardEntry(c).loading?.done||reading);if(!currentGamePieceRoute(request)||s.selectedChempat!==c.id||!safeGamePieceArrival())return;const entry=wildcardEntry(c),card=entry.data?.cards?.find(card=>card.questionId===target.questionId);
   if(!card)throw Error('This card is no longer available in this connection.');if(card.canAnswer){openWildcardAnswer(c.id,card.questionId);opened=currentWildcardDialog()?.questionId===card.questionId}else{const node=[...document.querySelectorAll('[data-wildcard-card]')].find(node=>node.dataset.wildcardCard===card.questionId);if(node){node.tabIndex=-1;node.focus({preventScroll:true});node.scrollIntoView({block:'center',behavior:'smooth'});opened=true}}
  }else if(['directory','intro'].includes(target.type)){
   if(!rewardsData){const reading=loadRewards(true);await (rewardsLoading?.done||reading);if(!currentGamePieceRoute(request))return}if(!rewardsData)throw Error('Your saved progress could not be checked. Refresh and try again.');if(rewardLevel()<4)throw Error('Member discovery is not currently available to your account.');
   const photo=rewardMediaUrl(`/api/reward-directory?photo=${target.memberId}`,'photo'),video=target.type==='intro'?rewardMediaUrl(`/api/reward-directory?video=${target.memberId}`,'video'):'';if(!photo||target.type==='intro'&&!video)throw Error('This game piece has no available media target.');
   for(const url of [photo,video].filter(Boolean)){const response=await fetch(url,{method:'HEAD',credentials:'same-origin',cache:'no-store',headers:{'x-chempat-member-id':request.account}});if(!currentGamePieceRoute(request))return;if(!response.ok){if([401,403].includes(response.status))invalidateRewardAccess(Error('Your discovery access changed. Sign in again to continue.'));throw Error('That listing or introduction is no longer available.')}}
   if(!currentGamePieceRoute(request)||!safeGamePieceArrival())return;
   const returnFocus=document.activeElement;changeModal('gamePiece');gamePieceDialog={state:s,account:activeMemberId(),epoch:wildcardEpoch,modalVersion,piece,total:1,returnFocus,mode:'media',media:{photo,video,photoReady:false,videoReady:!video,acknowledged:false},error:''};renderModal();return;

  }else{
   if(piece.kind==='step-complete'){setNotice(`${piece.actorName} completed Step ${piece.level}: ${REWARD_NAMES[piece.level-1]}. Your own progress is unchanged.`);render(true)}opened=!!gamePieceConnection(piece)&&s.selectedChempat===c.id;
  }
  if(opened&&(!actionable||actionAlreadyComplete)&&wildcardOwnerMatches(request))await recordGamePiece('handled',piece);
 }catch(e){if(!currentGamePieceRoute(request))return;gamePieceFeedError=e.message||'This game piece could not be opened. Refresh and try again.';paintGamePieceFeed();const dialog=currentRewardDialog();if(dialog){dialog.error=gamePieceFeedError;renderRewardModal()}}
}
function confirmGamePieceMediaReady(kind,node){const d=currentGamePiece();if(!d||d.mode!=='media'||d.error||!['photo','video'].includes(kind)||!node?.isConnected||node.closest('.gamePieceMedia')!==$('modalHost').querySelector('.gamePieceMedia')||node.getAttribute('src')!==d.media[kind])return;d.media[`${kind}Ready`]=true;if(d.media.photoReady&&d.media.videoReady&&!d.media.acknowledged){d.media.acknowledged=true;recordGamePiece('handled',d.piece)}}
function gamePieceMediaUnavailable(node){const d=currentGamePiece();if(!d||d.mode!=='media'||!node?.isConnected||node.closest('.gamePieceMedia')!==$('modalHost').querySelector('.gamePieceMedia'))return;d.error='This listing or introduction is no longer available. Refresh your game pieces to check what’s current.';d.media.photo='';d.media.video='';renderGamePieceModal();loadGamePieces(true)}
function renderGamePieceModal(){
 const d=currentGamePiece();if(!d){if(s.modal==='gamePiece'){changeModal('');$('modalHost').innerHTML=''}return}
 const copy=gamePieceCopy(d.piece),previous=$('modalHost').querySelector('.gamePieceModal'),focus=previous?.contains(document.activeElement)?document.activeElement.dataset.pieceAction:null;
 if(d.mode==='media'){
  if(previous?.classList.contains('gamePieceMedia')&&d.renderedMedia===d.media&&d.renderedMediaError===d.error)return;d.renderedMedia=d.media;d.renderedMediaError=d.error;
  $('modalHost').innerHTML=`<div class="modalBackdrop" onclick="closeInvite(event)"><section class="modal gamePieceModal gamePieceMedia" role="dialog" aria-modal="true" aria-labelledby="gamePieceTitle"><button class="close" type="button" data-piece-action="close" aria-label="Close preview" onclick="closeInvite()">×</button><div class="eyebrow">SHARED WITH ELIGIBLE MEMBERS</div><h2 id="gamePieceTitle" tabindex="-1">${esc(d.piece.actorName)}${d.piece.target.type==='intro'?'’s 15-second hello':'’s profile'}</h2>${d.error?`<p class="error" role="alert">${esc(d.error)}</p>`:`<img class="gamePieceProfilePhoto" src="${esc(d.media.photo)}" alt="${esc(d.piece.actorName)}" onload="confirmGamePieceMediaReady('photo',this)" onerror="gamePieceMediaUnavailable(this)">${d.media.video?`<video class="rewardVideo" src="${esc(d.media.video)}" controls tabindex="0" playsinline preload="metadata" onloadedmetadata="confirmGamePieceMediaReady('video',this)" onerror="gamePieceMediaUnavailable(this)"></video>`:''}`}<button type="button" class="button light rewardButton" data-piece-action="close" onclick="closeInvite()">Back to my page</button></section></div>`;
  if(!previous||focus)$('gamePieceTitle')?.focus({preventScroll:true});return;
 }
 $('modalHost').innerHTML=`<div class="modalBackdrop" onclick="closeInvite(event)"><section class="modal gamePieceModal" role="dialog" aria-modal="true" aria-labelledby="gamePieceTitle" aria-describedby="gamePieceCount"><button class="close" type="button" data-piece-action="close" aria-label="Hold this game piece for later" onclick="holdGamePiece()">×</button><div class="eyebrow">A PIECE TO PLAY</div><p id="gamePieceCount" class="gamePieceCount">1 of ${d.total} to review</p><h2 id="gamePieceTitle" tabindex="-1">${esc(copy.title)}</h2><p>${esc(copy.detail)}</p><div class="wildcardActions"><button type="button" class="button wildcardPrimary" data-piece-action="play" onclick="playGamePiece()">${esc(copy.action)}</button><button type="button" class="button light" data-piece-action="hold" onclick="holdGamePiece()">${d.piece.kind==='phone-offer'?'Not now':'Hold for later'}</button></div><p class="gamePieceHoldHint">You can return from Game pieces or this connection’s badge.</p></section></div>`;
 const modal=$('modalHost').querySelector('.gamePieceModal');if(!previous||focus){const target=focus&&[...modal.querySelectorAll('[data-piece-action]')].find(button=>button.dataset.pieceAction===focus);(target||$('gamePieceTitle')).focus({preventScroll:true})}
}

async function resumeMember(){try{const response=await fetch('/api/member',{credentials:'same-origin',cache:'no-store'});if(!response.ok)return;const {member}=await response.json();if(s.memberId||s.prospectId)return;s.account={...member};s.member={name:member.name,contact:member.contact,photo:member.photo,answers:member.answers||[],verified:member.verified};s.memberId=member.id;s.phase=s.member.answers.length>=5?'ready':'registration';s.liveMember=true;navigate('dashboard','member');refreshLive()}catch{}}
if(friendInvitationToken){s.pendingVibeToken='';openFriendInvitation(friendInvitationToken)}else if(invitationToken){s.friendToken='';s.friendInvite=null;openEmailInvitation()}else if(s.friendToken)openFriendInvitation(s.friendToken);else if(s.pendingVibeToken)openEmailInvitation(s.pendingVibeToken);else{render();if(s.liveMember||s.liveInvite)refreshLive();else if(s.view==='landing'&&!s.member.name)resumeMember()}
setInterval(()=>{refreshLive();refreshDiscovery();refreshRewards();refreshWildcards();refreshDateCards();refreshMemberProfile()},5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshLive();refreshDiscovery();refreshRewards();refreshWildcards();refreshDateCards();refreshMemberProfile()}});
window.addEventListener('focus',refreshDateCards);
setInterval(updateQrCountdown,1000);
