/* Wild Hub static review. Memory-only state. No APIs, accounts, email, uploads or identity verification. */
'use strict';
const main = document.getElementById('main');
const dialog = document.getElementById('dialog');
const dialogContent = document.getElementById('dialog-content');
const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const arrow = '<span class="arrow-icon" aria-hidden="true"></span>';
const lock = '<svg class="lock" viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="8" width="12" height="10" rx="2"/><path d="M6.5 8V5a3.5 3.5 0 0 1 7 0v3M10 12v3"/></svg>';
const avatar = (name, cls='') => `<span class="avatar ${cls}" aria-label="${esc(name)} sample profile">${esc(name.trim().slice(0,1).toUpperCase())}</span>`;
const initialRequests = () => [
  {id:'alex', name:'Alex', email:'alex@example.com', intro:'Here for considered conversations, interesting spaces, and the projects in between.', status:'pending'},
  {id:'sam', name:'Sam', email:'sam@example.com', intro:'We share an interest in photography and design. I’d like to follow along and contribute.', status:'pending'},
  {id:'jules', name:'Jules', email:'jules@example.com', intro:'A friend pointed me here. Always up for exchanging recommendations and new perspectives.', status:'pending'}
];
const blankJoin = () => ({name:'', email:'', agreed:false, codeComplete:false, photo:false, intro:'', camera:false});
let requests = initialRequests(), ownRequest = null, join = blankJoin(), returnFocus = null, toastTimer;
const demoEmail = email => /^[^\s@]+@(?:[a-z0-9-]+\.)*(?:example\.(?:com|org|net)|test|invalid)$/i.test(email);
const sampleNote = '<p class="demo-note">Static preview. Use fictional details. No real emails or accounts are created.</p>';
const editorial = (cls='') => `<img class="editorial-photo ${cls}" src="assets/editorial.jpg" alt="Sunlight across a quiet studio, with a wooden table, books and sculptural objects" width="1536" height="1024">`;

function landing() {
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="status-dot"></span> A NETWORK ON YOUR TERMS</p><h1>Your people.<br>Your space.</h1><p class="hero-lead">A public profile. A private circle.<br>You decide who comes in.</p><p class="intro">Share what you’re into, invite people you know, and make room for conversations that go further.</p><div class="button-row"><a class="button" href="#host">Explore a hub ${arrow}</a><a class="text-link" href="#dashboard">Try the host view ${arrow}</a></div><p class="hero-note">${lock} Your private network. Open to requests. Yours to approve.</p></div><div class="hero-art"><div class="editorial-frame">${editorial()}<div class="photo-overlay"><span class="image-label">A SPACE FOR WHAT MOVES YOU</span><span class="image-number">SAMPLE HUB</span></div></div><div class="feature-profile"><div class="feature-heading">${avatar('Alex')}<div><h2>Alex’s open studio</h2><p>@alex · Fictional demo host</p></div><a href="#host" class="icon-link" aria-label="Explore Alex’s sample hub">${arrow}</a></div><div class="profile-bottom"><p>Design, everyday observations,<br>and conversations worth keeping.</p><span class="tiny-pill"><span class="status-dot"></span> Open to requests</span></div></div></div></section>
  <section class="principles" aria-label="Your network, on your terms"><div><span>01</span><h2>A public introduction</h2><p>A profile people can find and a clear way to say hello.</p></div><div><span>02</span><h2>A considered invitation</h2><p>Review each introduction. Approve or pass. It’s your call.</p></div><div><span>03</span><h2>A closer conversation</h2><p>A member space for the people you choose to let in.</p></div></section>
  <section class="how" id="how-it-works"><div class="section-heading"><p class="eyebrow">LESS NOISE. MORE CONNECTION.</p><h2>Make it personal.</h2><p>A familiar sign-up, then a proper introduction.</p></div><div class="steps"><article><span class="step-number">01 / CREATE YOUR PROFILE</span><h3>Start with the basics.</h3><p>Name and email, an email code, then a photo. The same simple registration flow.</p></article><article><span class="step-number">02 / SAY HELLO</span><h3>Introduce yourself.</h3><p>Add a short note to the host. Share how you know each other or what brings you here.</p></article><article><span class="step-number">03 / JOIN THE CIRCLE</span><h3>Wait for a welcome.</h3><p>The host reviews your request before you can enter their circle.</p></article></div></section>`;
}
function publicHost() {
  const request = ownRequest && requests.find(r => r.id === ownRequest);
  return `<section class="page-shell"><a href="#home" class="back-link">← Wild Hub</a><div class="public-layout"><article class="public-profile"><div class="profile-cover">${editorial()}<span class="image-label">ALEX’S OPEN STUDIO</span></div><div class="profile-body"><div class="profile-top">${avatar('Alex','host-avatar')}<span class="tiny-pill"><span class="status-dot"></span> Open to requests</span></div><p class="handle">@alex · Fictional demo host</p><h1>Alex’s open studio</h1><p class="profile-lead">For the things that catch your eye.<br>And the people who get it.</p><p>Design, photography, a good place to sit. This is where I share work in progress, recent finds, and thoughts that need a little more room.</p><div class="tag-row"><span>Design</span><span>Photography</span><span>Everyday life</span></div><div class="profile-footer">${lock}<span>Public profile · Circle content opens after approval</span></div></div></article><aside class="public-side"><p class="eyebrow">JOIN THE CONVERSATION</p><h2>Good connections<br>start with a hello.</h2><p>Set up your profile, then send a short introduction. Alex decides who joins the circle.</p>${request ? requestState(request) : `<div class="gate-card"><div class="gate-title">${lock}<h3>Request an invitation</h3></div><p>Sign up with your name and email, confirm your email, and add a picture. Your introduction comes next.</p><button class="button full-width" data-action="request">Request to join ${arrow}</button>${sampleNote}</div>`}<div class="circle-guidelines"><h3>Inside this circle</h3><ul><li>Be thoughtful. Make space for different perspectives.</li><li>Keep private conversations in the circle.</li><li>The host reviews every request.</li></ul></div><button class="support-link" data-action="support"><span>Membership & support</span>${arrow}</button><p class="demo-note">Proposed sharing: the host sees your name, picture and introduction. Email is used for verification and invitations; it is not shown in host requests or member lists. Circle members see your name and picture. This preview has no authentication or server-enforced access controls.</p></aside></div></section>`;
}
function requestState(r) {
  if (r.status === 'approved') return `<div class="state-panel"><span class="eyebrow">APPROVED IN DEMO</span><h3>You’re in, ${esc(r.name)}.</h3><p>Alex approved your sample request. Explore the member view.</p><a class="button" href="#circle">Enter the sample circle ${arrow}</a><p class="demo-note">Simulated approval. Sample content only.</p></div>`;
  if (r.status === 'passed') return `<div class="state-panel"><span class="eyebrow">PASSED IN DEMO</span><h3>This request was passed on.</h3><p>The sample circle stays closed in this walkthrough.</p><button class="button secondary" data-action="reset">Reset the walkthrough</button></div>`;
  return `<div class="state-panel"><span class="eyebrow">REQUEST PENDING · DEMO</span><h3>Your introduction is ready.</h3><p>The host would review your introduction before you could enter.</p><a class="button" href="#dashboard">Try the host view ${arrow}</a><button class="text-link" data-action="withdraw">Withdraw sample request</button><p class="demo-note">Nothing was sent and no account was created. This sample request exists only in this tab.</p></div>`;
}
function dashboard(tab='requests') {
  const pending = requests.filter(r => r.status === 'pending'), approved = requests.filter(r => r.status === 'approved');
  const list = requests.filter(r => r.status === (tab === 'members' ? 'approved' : tab === 'passed' ? 'passed' : 'pending'));
  return `<section class="page-shell"><a href="#host" class="back-link">← View public profile</a><div class="dashboard-head"><div><p class="eyebrow">HOST VIEW · DEMO</p><h1>Your circle, your call.</h1><p>Review the introduction. Choose who comes in.</p></div><button class="button secondary" data-action="invite">Invite a friend ${arrow}</button></div><nav class="dashboard-tabs" aria-label="Host sections"><a href="#dashboard" ${tab === 'requests' ? 'aria-current="page"' : ''}>Requests <span class="count">${pending.length}</span></a><a href="#members" ${tab === 'members' ? 'aria-current="page"' : ''}>Members <span class="count">${approved.length}</span></a><a href="#passed" ${tab === 'passed' ? 'aria-current="page"' : ''}>Passed</a></nav><div class="dashboard-intro"><p>${tab === 'requests' ? 'An introduction is a starting point. Take your time.' : tab === 'members' ? 'People approved in this walkthrough.' : 'Passed requests remain outside the sample circle.'}</p><button class="text-link" data-action="reset">Reset demo</button></div><div class="request-list">${list.length ? list.map(requestCard).join('') : `<div class="empty-state"><h2>${tab === 'requests' ? 'You’re up to date.' : tab === 'members' ? 'Your circle starts here.' : 'No passed requests.'}</h2><p>${tab === 'members' ? 'Go to Requests to try approving someone.' : 'Visit the public profile to make a sample request.'}</p><a class="button secondary" href="${tab === 'members' ? '#dashboard' : '#host'}">${tab === 'members' ? 'View requests' : 'View public profile'} ${arrow}</a></div>`}</div><div class="review-note">${lock}<p>Approve and Pass are simulated. Host controls are available to anyone reviewing this page. No identity is verified; all changes clear on refresh.</p></div></section>`;
}
function requestCard(r) {
  return `<article class="request-card" data-request-id="${r.id}"><div class="request-person">${avatar(r.name)}<div><h3>${esc(r.name)}</h3><p class="request-date">Sample profile</p></div></div><p class="sample-label">Sample introduction${r.id === ownRequest ? ' · Your walkthrough' : ''}</p><p class="request-bio">${esc(r.intro)}</p>${r.status === 'pending' ? `<div class="button-row"><button class="button" data-action="approve" data-id="${r.id}" aria-label="Approve ${esc(r.name)}">Approve ${arrow}</button><button class="button secondary" data-action="pass" data-id="${r.id}" aria-label="Pass on ${esc(r.name)}">Pass</button></div>` : `<p class="status-label">${r.status === 'approved' ? '✓ Approved in demo' : 'Passed in demo'}</p>${r.status === 'approved' && r.id === ownRequest ? '<a class="text-link" href="#circle">View the sample circle →</a>' : ''}`}</article>`;
}
function circle() {
  const member = requests.find(r => r.id === ownRequest);
  if (member?.status !== 'approved') return `<section class="page-shell"><a class="back-link" href="#host">← Back to Alex’s profile</a><div class="empty-state">${lock}<h1>This door opens with approval.</h1><p>Request to join, then approve your sample request in the host view.</p><a class="button" href="#host">View the public profile ${arrow}</a><p class="demo-note">Visual flow only. Real access controls must be enforced by a server.</p></div></section>`;
  return `<section class="page-shell"><div class="dashboard-head"><div><p class="eyebrow">SAMPLE MEMBER VIEW</p><h1>Inside the open studio.</h1><p>Welcome, ${esc(member.name)}. Stay a while.</p></div><a class="button secondary" href="#host">Public profile ${arrow}</a></div><div class="warning-box">Sample content only. This is a design walkthrough, not a secure private space.</div><div class="circle-layout"><div><article class="post"><div class="post-author">${avatar('Alex')}<div><strong>Alex</strong><small>Demo host · Sample post</small></div><span class="post-type">STUDIO NOTES</span></div>${editorial('post-photo')}<div class="post-body"><span class="eyebrow">OBSERVATIONS / 001</span><h2>Room to think.</h2><p>Some spaces make you slow down. A table by a window, a book left open, the afternoon light. This is the kind of space I want to make here.</p><p>What’s something you’ve noticed lately?</p><div class="post-meta">Sample post · Conversation is not connected</div></div></article><article class="post text-post"><div class="post-author">${avatar('Alex')}<div><strong>Alex</strong><small>Demo host · Sample conversation</small></div></div><h2>Worth passing on.</h2><p>A place, a film, an idea that stayed with you. What’s your latest find?</p><p class="demo-note">Posting and chat are not connected in this preview.</p></article></div><aside class="sidebar"><h3>The circle</h3><div class="member-row">${avatar('Alex')}<div>Alex<small>Demo host</small></div></div>${requests.filter(r => r.status === 'approved').map(r => `<div class="member-row">${avatar(r.name)}<div>${esc(r.name)}<small>Approved in demo</small></div></div>`).join('')}<p>Sample member list. Email addresses do not appear here.</p><button class="button secondary full-width" data-action="support">Support this circle ${arrow}</button><button class="text-link" data-action="leave">Leave the sample circle</button></aside></div></section>`;
}

// Registration follows game.js: stacked name/email + agreeBox, signinCard code, photo, then the Wild Hub introduction.
function agreeBox() {
  return `<label class="agree"><input type="checkbox" id="joinAgree" ${join.agreed ? 'checked' : ''}><span>I’m 18 or older and agree to the <a class="inline-link" href="https://chempatible.com/terms" target="_blank" rel="noreferrer">Terms</a> and <a class="inline-link" href="https://chempatible.com/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</span></label>`;
}
function joinShell(content, step) {
  return `<section class="registration-shell"><a class="back-link" href="#host">← Back to Alex’s profile</a><div class="registration-layout"><aside class="registration-aside"><p class="eyebrow">ALEX’S OPEN STUDIO</p><h2>A familiar face.<br>A new conversation.</h2><p>Set up your profile first. Then introduce yourself to the host.</p><ol class="join-progress" aria-label="Registration steps"><li ${step === 1 ? 'aria-current="step"' : ''}><span>1</span>Your details & email code</li><li ${step === 2 ? 'aria-current="step"' : ''}><span>2</span>Your picture</li><li ${step === 3 ? 'aria-current="step"' : ''}><span>3</span>Your introduction</li></ol><p class="demo-note">This is a static walkthrough of the existing registration flow. No real email, camera access, photo upload or account creation occurs.</p></aside><section class="box joinCard instantEntry" aria-label="${step === 3 ? 'Separate circle introduction' : 'Registration'}">${content}</section></div></section>`;
}
function detailsCard() {
  return joinShell(`<p class="eyebrow">1 · YOUR DETAILS</p><h1>Make your page.</h1><p class="entryNote">Start with your name and email.</p><form id="join-form" data-step-action="continue-details" novalidate><input class="joinInput" id="joinName" aria-label="Your name" autocomplete="off" maxlength="50" placeholder="Your first name" value="${esc(join.name)}"><input class="joinInput" id="joinContact" type="email" aria-label="Your email" autocomplete="off" maxlength="254" placeholder="Your email" value="${esc(join.email)}">${agreeBox()}<p class="legal-preview">Registration-layout preview. No account is created or legal acceptance recorded.</p><p id="joinError" class="error" role="alert" tabindex="-1"></p><button type="button" class="button nextButton" data-action="continue-details">CONTINUE ${arrow}</button></form><button type="button" class="link" data-action="show-signin">Already have a page? Sign in →</button><button type="button" class="link" data-action="fill-sample">Use sample details →</button>${sampleNote}<p class="modal-footnote">Use an example.com address. Your photo and introduction come in the following steps.</p>`, 1);
}
function signinCard(signingIn=false, code=true) {
  if (!code) return joinShell(`<p class="eyebrow">WELCOME BACK</p><h1>Sign in.</h1><p>The live flow emails a six digit code to the address on your page.</p><form id="signin-form" data-step-action="continue-signin" novalidate><input class="joinInput" id="signinEmail" type="email" aria-label="Your email" autocomplete="off" maxlength="254" placeholder="Your email" value="${esc(join.email)}"><p id="joinError" class="error" role="alert" tabindex="-1"></p><button type="button" class="button nextButton" data-action="continue-signin">SEND CODE ${arrow}</button></form><button type="button" class="link" data-action="start-fresh">← New here? Start your page</button><div class="simulation-note"><strong>Sign-in simulation</strong><p>Use taylor@example.com or another example.com address. No email is sent and no account is signed in. This previews a fictional returning profile.</p></div>`, 1);
  return joinShell(`<p class="eyebrow">${signingIn ? 'WELCOME BACK' : '1 · CHECK YOUR EMAIL'}</p><h1>Enter your code.</h1><p>The live flow sends a six digit code to <b>${esc(join.email)}</b>.</p><div class="simulation-note"><strong>Email simulation</strong><p>No email has been sent. Use demo code <b>246810</b> to continue.</p></div><form id="${signingIn ? 'signin-code-form' : 'code-form'}" data-step-action="${signingIn ? 'continue-signin-code' : 'continue-code'}" novalidate><input class="joinInput" id="signinCode" inputmode="numeric" autocomplete="off" maxlength="6" aria-label="Six digit code" placeholder="000000"><p id="joinError" class="error" role="alert" tabindex="-1"></p><button type="button" class="button nextButton" data-action="${signingIn ? 'continue-signin-code' : 'continue-code'}">${signingIn ? 'SIGN IN' : 'CONTINUE'} ${arrow}</button></form><p class="small">Not there? <button type="button" class="inline-link" data-action="resend-code">Resend code</button></p><button type="button" class="link" data-action="${signingIn ? 'show-signin' : 'back-details'}">Use a different email</button><p class="demo-note">This step is simulated. It does not verify an email address or a person’s identity. No account is created or signed in.</p>`, 1);
}
function stepError(errorId, message, fieldId) {
  const error = document.getElementById(errorId);
  if (!error) return;
  error.closest('form')?.querySelectorAll('[aria-invalid]').forEach(field => field.removeAttribute('aria-invalid'));
  if (fieldId) {const field = document.getElementById(fieldId); field?.setAttribute('aria-invalid','true'); field?.setAttribute('aria-describedby',errorId);}
  error.textContent = message;
  error.tabIndex = -1;
  error.focus({preventScroll:true});
  error.scrollIntoView({block:'nearest'});
}
const sampleEmailError = 'This demo accepts sample email addresses only. Use taylor@example.com or choose “Use sample details” below. Nothing will be sent.';
function signinStart() {
  const email = document.getElementById('signinEmail').value.trim().toLowerCase();
  if (!demoEmail(email)) {stepError('joinError','This demo accepts sample email addresses only. Use taylor@example.com. Nothing will be sent.','signinEmail'); return;}
  join = {...blankJoin(), email}; navigate('signin-code');
}
function photoCard() {
  return joinShell(`<p class="eyebrow">2 · YOUR PICTURE</p><h1>Add your picture.</h1><p>Let the host recognize you.</p><div class="photoActions"><button type="button" class="button alt" data-action="camera">CAMERA</button><label class="button light photoPick" role="button" tabindex="0" data-action="choose-photo">CHOOSE FILE PHOTO<input id="memberPhoto" class="photoFileInput" type="file" accept="image/*" disabled hidden aria-hidden="true"></label></div><video id="cameraPreview" class="cameraPreview" autoplay muted playsinline hidden></video><canvas id="cameraCanvas" hidden></canvas>${join.camera ? `<div class="camera-simulation" aria-label="Simulated camera preview">${avatar(join.name)}<span>Sample profile placeholder</span></div><button id="captureBtn" type="button" class="button captureButton" data-action="capture">SMILE & CAPTURE</button>` : '<button id="captureBtn" type="button" class="button captureButton" hidden>SMILE & CAPTURE</button>'}<p id="joinError" class="error" role="alert"></p><button type="button" class="link" data-action="back-details">← Back to details</button><div class="simulation-note"><strong>Photo simulation</strong><p>Both options use a sample profile placeholder. Your camera and files are never accessed. No photo is uploaded.</p></div>`, 2);
}
function introductionCard() {
  return joinShell(`<p class="eyebrow">PROFILE COMPLETE · DEMO</p><h1>Say hello to Alex.</h1><p>A short introduction helps the host decide who joins. This is separate from signing up.</p><div class="intro-identity">${avatar(join.name)}<div><strong>${esc(join.name)}</strong><small>Sample profile · No account created</small></div></div><form id="request-form" data-step-action="preview-request" novalidate><label class="field" for="request-intro">Your introduction</label><textarea id="request-intro" maxlength="280" placeholder="How do you know Alex, or what brings you here?">${esc(join.intro)}</textarea><p class="input-hint">A few thoughtful words. Up to 280 characters.</p><p class="error" id="request-error" role="alert" tabindex="-1"></p><button class="button nextButton" type="button" data-action="preview-request">Preview my request ${arrow}</button></form><button class="link" data-action="fill-intro">Use a sample introduction →</button><button class="link" data-action="back-photo">← Back to picture</button><p class="demo-note">Nothing is sent. In the proposed live flow, Alex would see your name, picture and introduction to review your request. Your email would be used for verification and invitations; it would not be exposed in host requests or member lists.</p>`, 3);
}
function rememberDetails() {
  if (!document.getElementById('joinName')) return;
  join.name = document.getElementById('joinName').value.trim();
  const email = document.getElementById('joinContact').value.trim().toLowerCase();
  if (email !== join.email) {join.codeComplete = false; join.photo = false;}
  join.email = email;
  join.agreed = document.getElementById('joinAgree').checked;
}
function nextJoinStep() {
  rememberDetails();
  if (!join.name) {stepError('joinError','Enter a fictional first name to try this demo.','joinName'); return;}
  if (!demoEmail(join.email)) {stepError('joinError',sampleEmailError,'joinContact'); return;}
  if (!join.agreed) {stepError('joinError','Confirm the adult and terms acknowledgement to try this demo. No legal acceptance is recorded.','joinAgree'); return;}
  join.codeComplete = false; join.photo = false; join.camera = false;
  navigate('join-code');
}
function signinVerify(signingIn=false) {
  if (document.getElementById('signinCode').value.trim() !== '246810') {stepError('joinError','Use the six digit demo code 246810. No email was sent.','signinCode'); return;}
  join.codeComplete = true;
  if (signingIn) {join.name = 'Taylor'; join.agreed = true; join.photo = true; navigate('introduce');}
  else navigate('join-photo');
}
function finishRegistration() {
  if (!join.codeComplete) return;
  join.photo = true; join.camera = false; closeModal(); navigate('introduce');
}
function submitRequest() {
  if (ownRequest || !join.codeComplete || !join.photo) return;
  join.intro = document.getElementById('request-intro').value.trim();
  if (!join.intro) {stepError('request-error','Add a few words to introduce yourself.','request-intro'); return;}
  ownRequest = 'visitor';
  requests.unshift({id:ownRequest, name:join.name, email:join.email, intro:join.intro, status:'pending'});
  navigate('host'); toast('Sample request ready. Nothing was sent.');
}
function navigate(route) {
  if (location.hash !== '#'+route) location.hash = route;
  else {render(); main.focus({preventScroll:true});}
}
function render() {
  let route = location.hash.slice(1) || 'home';
  if (['join-code','join-photo','introduce'].includes(route) && (!join.name || !demoEmail(join.email) || !join.agreed)) route = 'join';
  if (['join-photo','introduce'].includes(route) && !join.codeComplete) route = 'join-code';
  if (route === 'introduce' && !join.photo) route = 'join-photo';
  if (route === 'signin-code' && !demoEmail(join.email)) route = 'signin';
  if (ownRequest && ['join','join-code','join-photo','introduce','signin','signin-code'].includes(route)) route = 'host';
  main.innerHTML = route === 'host' ? publicHost() : route === 'dashboard' ? dashboard() : route === 'members' ? dashboard('members') : route === 'passed' ? dashboard('passed') : route === 'circle' ? circle() : route === 'join' ? detailsCard() : route === 'signin' ? signinCard(true,false) : route === 'signin-code' ? signinCard(true,true) : route === 'join-code' ? signinCard() : route === 'join-photo' ? photoCard() : route === 'introduce' ? introductionCard() : landing();
  document.title = route === 'host' ? 'Alex’s open studio · Wild Hub preview' : ['join','join-code','join-photo','introduce','signin','signin-code'].includes(route) ? 'Join the circle · Wild Hub preview' : 'Wild Hub · Your people. Your space.';
  document.querySelectorAll('.site-header nav a').forEach(a => {if(a.hash === '#'+route) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');});
  if (route === 'how-it-works') document.getElementById('how-it-works')?.scrollIntoView(); else window.scrollTo(0,0);
}
function modal(content) {
  if (!dialog.open) returnFocus = document.activeElement;
  dialogContent.innerHTML = `<div class="modal-content">${content}</div>`;
  if (!dialog.open) dialog.showModal();
  document.body.style.overflow = 'hidden'; dialog.querySelector('input,button')?.focus();
}
function closeModal() {
  if (!dialog.open) return;
  dialog.close(); document.body.style.overflow = ''; if (returnFocus?.isConnected) returnFocus.focus();
}
const modalHeader = title => `<div class="modal-top"><h2 id="dialog-title">${title}</h2><button type="button" class="close" data-action="close" aria-label="Close dialog">×</button></div>`;
function openInvite() {
  modal(`${modalHeader('Invite someone in.')}<p>A personal invitation to your circle.</p><form id="invite-form" data-step-action="preview-invite" novalidate><label>Friend’s name<input id="invite-name" maxlength="50" placeholder="Sam" autocomplete="off" required></label><label>Friend’s email<input id="invite-email" type="email" maxlength="254" placeholder="sam@example.com" autocomplete="off" required></label><p class="modal-footnote">Use fictional details and an example.com address. This form never sends email or creates an invitation.</p><p class="error" id="invite-error" role="alert" tabindex="-1"></p><div class="button-row"><button type="button" class="button" data-action="preview-invite">Preview invitation ${arrow}</button><button type="button" class="button secondary" data-action="close">Cancel</button></div></form>`);
}
function previewInvite(form) {
  const name = form.querySelector('#invite-name').value.trim(), email = form.querySelector('#invite-email').value.trim();
  if (!name || !demoEmail(email)) {stepError('invite-error','Add a fictional name and valid email at example.com. Nothing will be sent.',!name?'invite-name':'invite-email'); return;}
  modal(`${modalHeader('An invitation from Alex.')}<p class="eyebrow">EMAIL PREVIEW · NOT SENT</p><p>To: ${esc(name)} &lt;${esc(email)}&gt;</p><div class="gate-card"><p>Hi ${esc(name)},</p><h3>Join me in the open studio.</h3><p>A space for sharing ideas, recent finds, and conversations with people I know. I’d like to have you there.</p><p>— Alex</p></div><p class="modal-footnote">No email was sent and no invitation link was created.</p><button class="button secondary" data-action="close">Done</button>`);
}
function support() {
  modal(`${modalHeader('Support the circle.')}<p>Optional membership and one-time support. Illustrative amounts only; no payments are connected.</p><div class="support-options"><button data-action="preview-monthly"><span class="support-type">MONTHLY MEMBERSHIP</span><strong>$2<small> / month</small></strong><span>Monthly subscription</span><em>Preview monthly ${arrow}</em></button><button data-action="preview-annual"><span class="support-type">ANNUAL MEMBERSHIP</span><strong>$10<small> / year</small></strong><span>Annual subscription</span><em>Preview annual ${arrow}</em></button></div><div class="support-one-time"><h3>A one-time contribution</h3><p>Support this circle without a subscription.</p><div class="contribution-options"><button data-action="preview-support" data-id="5">$5</button><button data-action="preview-support" data-id="10">$10</button><button data-action="preview-support" data-id="25">$25</button></div></div><p class="modal-footnote">Payment never bypasses host approval. Billing, cancellation terms, fees and membership benefits need to be defined before launch. Contributions are not represented as tax-deductible.</p>`);
}
function paymentPreview(kind, amount) {
  if (kind === 'support' && !['5','10','25'].includes(amount)) return;
  modal(`${modalHeader('Preview only. No charge.')}<p>You selected ${kind === 'support' ? `a one-time $${esc(amount)} contribution` : kind === 'monthly' ? 'a $2/month membership' : 'a $10/year membership'}.</p><p class="modal-footnote">No subscription, payment, or membership was created. Payment setup and final terms come separately.</p><div class="button-row"><button class="button" data-action="close">Done</button><button class="button secondary" data-action="support-back">Back to options</button></div>`);
}
function about() {
  modal(`${modalHeader('Wild Hub. A first look.')}<p>A static design concept using the existing registration sequence.</p><ul class="about-list"><li>All people, requests and posts are fictional samples. Profile images are monogram placeholders.</li><li>The studio photograph is original AI-generated artwork, not a real host’s space.</li><li>No real emails or accounts are created. Code and photo steps are simulated.</li><li>No uploads, payments, analytics or database are connected.</li><li>Host controls are open for review. This is not a secure private space.</li><li>All sample changes live in this tab and clear on refresh. No person’s identity is verified.</li></ul><button class="button" data-action="close">Got it</button>`);
}
function toast(message) {
  clearTimeout(toastTimer); const el = document.getElementById('toast'); el.textContent = message; el.classList.add('visible'); toastTimer = setTimeout(() => el.classList.remove('visible'), 3500);
}
function action(type,id) {
  switch (type) {
    case 'about': about(); break;
    case 'continue-details': if (document.getElementById('join-form')) nextJoinStep(); break;
    case 'continue-signin': if (document.getElementById('signin-form')) signinStart(); break;
    case 'continue-code': if (document.getElementById('code-form')) signinVerify(); break;
    case 'continue-signin-code': if (document.getElementById('signin-code-form')) signinVerify(true); break;
    case 'preview-request': if (document.getElementById('request-form')) submitRequest(); break;
    case 'preview-invite': {const form = document.getElementById('invite-form'); if (form) previewInvite(form); break;}
    case 'request': if (!ownRequest) {join = blankJoin(); navigate('join');} break;
    case 'fill-sample': document.getElementById('joinName').value = 'Taylor'; document.getElementById('joinContact').value = 'taylor@example.com'; document.getElementById('joinAgree').focus(); break;
    case 'back-details': join.camera = false; navigate('join'); break;
    case 'show-signin': rememberDetails(); join.camera = false; navigate('signin'); break;
    case 'start-fresh': join = blankJoin(); navigate('join'); break;
    case 'resend-code': document.getElementById('joinError').textContent = 'Demo code: 246810. No email has been sent.'; break;
    case 'camera': if (join.codeComplete) {join.camera = true; render(); document.getElementById('captureBtn')?.focus();} break;
    case 'capture': if (join.camera) finishRegistration(); break;
    case 'choose-photo': if (join.codeComplete) modal(`${modalHeader('Choose a sample picture.')}<p>The file picker is simulated. Use this profile placeholder to continue.</p><div class="sample-photo">${avatar(join.name)}</div><div class="button-row"><button class="button" data-action="use-photo">Use sample picture ${arrow}</button><button class="button secondary" data-action="close">Cancel</button></div><p class="demo-note">Your files are never accessed or uploaded.</p>`); break;
    case 'use-photo': finishRegistration(); break;
    case 'fill-intro': document.getElementById('request-intro').value = 'Here for ideas, interesting spaces, and thoughtful conversation. I’d like to join the studio.'; break;
    case 'back-photo': join.intro = document.getElementById('request-intro').value; navigate('join-photo'); break;
    case 'invite': openInvite(); break;
    case 'support': case 'support-back': support(); break;
    case 'preview-monthly': paymentPreview('monthly'); break;
    case 'preview-annual': paymentPreview('annual'); break;
    case 'preview-support': paymentPreview('support',id); break;
    case 'close': closeModal(); break;
    case 'approve': case 'pass': {const r = requests.find(r => r.id === id); if (!r || r.status !== 'pending') return; r.status = type === 'approve' ? 'approved' : 'passed'; render(); toast(`${r.name} ${type === 'approve' ? 'approved' : 'passed'} in the demo. Nothing was sent.`); main.querySelector('.request-card button,.dashboard-tabs a')?.focus(); break;}
    case 'reset': requests = initialRequests(); ownRequest = null; join = blankJoin(); closeModal(); render(); toast('Demo reset. All sample changes cleared.'); break;
    case 'withdraw': case 'leave': requests = requests.filter(r => r.id !== ownRequest); ownRequest = null; join = blankJoin(); if (type === 'leave') navigate('host'); else render(); toast(type === 'leave' ? 'You left the sample circle.' : 'Sample request withdrawn.'); break;
  }
}
document.addEventListener('click', event => {const control = event.target.closest('[data-action]'); if (control) {event.preventDefault(); action(control.dataset.action,control.dataset.id);}});
document.addEventListener('keydown', event => {
  if (event.isComposing) return;
  const control = event.target.closest('[data-action]');
  if (control && ((control.matches('button') && event.key === 'Enter') || (control.getAttribute('role') === 'button' && ['Enter',' '].includes(event.key)))) {
    event.preventDefault(); if (!event.repeat) action(control.dataset.action,control.dataset.id); return;
  }
  const form = event.target.closest('form[data-step-action]');
  const input = event.target.matches('input:not([type="checkbox"]):not([type="file"])');
  const textareaShortcut = event.target.matches('textarea') && (event.ctrlKey || event.metaKey);
  if (form && event.key === 'Enter' && (input || textareaShortcut)) {event.preventDefault(); if (!event.repeat) action(form.dataset.stepAction);}
});
document.addEventListener('input', event => {if (['joinName','joinContact'].includes(event.target.id)) rememberDetails(); if (event.target.id === 'request-intro') join.intro = event.target.value;});
document.addEventListener('change', event => {if(event.target.id === 'joinAgree') rememberDetails();});
// Static controls dispatch locally on click/Enter. Native submissions never advance or send anything.
document.addEventListener('submit', event => {event.preventDefault();});
dialog.addEventListener('cancel', event => {event.preventDefault(); closeModal();});
dialog.addEventListener('click', event => {if(event.target === dialog) {const box = dialog.getBoundingClientRect(); if(event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeModal();}});
window.addEventListener('hashchange', () => {closeModal(); render(); main.focus({preventScroll:true});});
render();
