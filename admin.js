const storageKey = 'chempatibility.member-profile-template.v1';
const defaults = {
  greeting: 'Hi, {name}.',
  intro: 'Meet, ask, answer, and keep the conversation moving.',
  connectTitle: 'Someone caught your interest?',
  connectText: 'Open your invitation. Show it in person or send it to keep the conversation going.',
  connectButton: 'CONNECT NOW →',
  qrText: 'When you meet someone interesting, show your code. Their first move opens your five most important questions.',
  showConnect: true,
  showQr: true,
  showPriorities: true,
  showConnections: true
};
const priorityNames = [
  'Truth when it costs something', 'Communication when something feels off',
  'Repair after conflict', 'Respect for boundaries', 'Keeping agreements',
  'Emotional expression', 'Closeness and independence', 'Responsiveness',
  'Non-negotiables', 'Love and affection preferences'
];
const questionBank = [
  { phase: 'first', topic: 'CORE VALUES', prompt: 'When the truth may disappoint someone you like, what do you do?', answers: ['Tell them directly, with care.', 'Say most of it gently.', 'Wait for a better moment.', 'Leave it alone if it seems unhelpful.'] },
  { phase: 'first', topic: 'COMMUNICATION', prompt: 'Someone says “I’m fine,” but you sense something is wrong. What happens next?', answers: ['Ask once and make room to talk.', 'Let them know I am here when ready.', 'Try to solve it.', 'Give space until they approach me.'] },
  { phase: 'first', topic: 'CONFLICT REPAIR', prompt: 'You still think you were right after a disagreement. What do you do next?', answers: ['Ask how they experienced it.', 'Own my part first.', 'Wait to cool off.', 'Leave it unless they bring it up.'] },
  { phase: 'first', topic: 'BOUNDARIES', prompt: 'Someone you like says a behavior is not okay with them. Your first move?', answers: ['Listen and ask what they need.', 'Explain what I meant, then listen.', 'Take time before responding.', 'Decide whether that boundary works for me.'] },
  { phase: 'first', topic: 'AGREEMENTS', prompt: 'You promised to call tonight, but cannot. What do you do?', answers: ['Let them know before the agreed time.', 'Call later and explain.', 'Apologize tomorrow.', 'Assume they will understand.'] },
  { phase: 'return', topic: 'EMOTIONAL EXPRESSION', prompt: 'After a hard day, what would you tell someone you are getting close to?', answers: ['I care, and I need a little time.', 'I could use comfort.', 'I am not sure what I feel yet.', 'I would rather keep things light.'] },
  { phase: 'return', topic: 'CLOSENESS', prompt: 'When a connection gets serious, what tends to matter most?', answers: ['Feeling understood.', 'Knowing where I stand.', 'Keeping room for myself.', 'Seeing actions match words.'] },
  { phase: 'return', topic: 'RESPONSIVENESS', prompt: 'If someone important texts during a busy day, what is your usual move?', answers: ['Send a quick acknowledgment.', 'Reply when I can give it attention.', 'Call when free.', 'Respond when my day is over.'] },
  { phase: 'return', topic: 'NON-NEGOTIABLES', prompt: 'A new partner has a firm preference you do not share. What do you do?', answers: ['Ask why it matters to them.', 'Explain my position and look for room.', 'Take time to decide if it works.', 'Treat it as a sign we may differ.'] },
  { phase: 'return', topic: 'COMMITMENTS', prompt: 'You and someone you date set a plan, then a better invitation arrives. What do you do?', answers: ['Keep the plan we made.', 'Ask whether changing it is okay.', 'Suggest another time.', 'Choose what makes sense that day.'] }
];
const testPlans = [
  { slug: 'love-language', name: 'Love Language', order: '01', theme: 'How I give and receive affection', detail: 'A gentle first shared test about gestures, attention, words, time, and care.' },
  { slug: 'attachment', name: 'Attachment', order: '02', theme: 'Closeness, independence, and fears', detail: 'A deeper reflection on safety, distance, reassurance, and what closeness brings up.' },
  { slug: 'communication-style', name: 'Communication Style', order: '03', theme: 'How we talk when it matters', detail: 'Explore directness, timing, listening, repair, and the moments when words get hard.' },
  { slug: 'emotional-expression', name: 'Emotional Expression', order: '04', theme: 'How feelings are shown', detail: 'Explore comfort, openness, pacing, and the ways each person names a feeling.' },
  { slug: 'personality', name: 'Personality', order: '05', theme: 'Patterns that shape a connection', detail: 'A wider look at preferences and habits after the first exchange has built trust.' }
];
const pages = {
  dash: { title: 'Dash', eyebrow: 'AT A GLANCE', body: 'The admin home will bring members, questions and template activity together as the live system grows.' },
  members: { title: 'Members', eyebrow: 'PEOPLE', body: 'Member accounts and connection histories will appear here when account storage is built. The profile preview uses Cindy as sample content.' },
  questions: { title: 'Questions' },
  settings: { title: 'Settings', eyebrow: 'SITE SETUP', body: 'This is a design draft. Access control, member storage, invitation delivery and real QR links need to be added before this becomes a live admin system.' }
};
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
let draft = { ...defaults };
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && typeof saved === 'object') {
    for (const key of Object.keys(defaults)) {
      if (typeof saved[key] === typeof defaults[key]) draft[key] = saved[key];
    }
  }
} catch (_) { /* Browser storage is optional for this design draft. */ }

function readDraft() {
  for (const input of document.querySelectorAll('[data-copy]')) draft[input.id] = input.value;
  for (const input of document.querySelectorAll('[data-visible]')) draft[input.id] = input.checked;
}
function writeFields() {
  for (const input of document.querySelectorAll('[data-copy]')) input.value = draft[input.id];
  for (const input of document.querySelectorAll('[data-visible]')) input.checked = draft[input.id];
}
function preview() {
  const greeting = escapeHtml(draft.greeting.replaceAll('{name}', 'Cindy'));
  const contents = [
    draft.showQr ? `<section class="member-card"><h3>My QR</h3><div class="qr-row"><div class="qr-sample" aria-label="QR placement preview"><span>YOUR QR</span></div><p>${escapeHtml(draft.qrText)}</p></div></section>` : '',
    draft.showPriorities ? `<section class="member-card"><h3>My 10</h3><p>The questions I care about. My top five lead the first exchange.</p><ol class="priorities">${priorityNames.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol></section>` : ''
  ].join('');
  const connections = draft.showConnections ? `<div class="member-column"><section class="member-card"><h3>Connections</h3><button type="button" class="connection-row"><span class="avatar">M</span><span><b>Mike</b><small>Five answered · Your move</small></span><span style="margin-left:auto">→</span></button><div class="conversation"><b>Cindy + Mike</b>Mike answered your first five. Read his answers, then continue the exchange.</div></section></div>` : '';
  $('profilePreview').innerHTML = `<header class="member-bar"><div class="member-logo">CHEM<span>PATIBILITY</span></div><div class="member-id"><span class="avatar">C</span><span><b>Cindy</b><br>cindy@example.com · Cell private</span></div></header><div class="member-content"><div class="member-hero"><span class="member-eyebrow">MY PAGE</span><h2>${greeting}</h2><p>${escapeHtml(draft.intro)}</p></div>${draft.showConnect ? `<section class="member-cta"><div><span class="member-eyebrow">YOUR NEXT CONNECTION</span><h3>${escapeHtml(draft.connectTitle)}</h3><p>${escapeHtml(draft.connectText)}</p></div><button type="button" class="cta-button">${escapeHtml(draft.connectButton)}</button></section>` : ''}${contents || connections ? `<div class="member-grid"><div class="member-column">${contents}</div>${connections}</div>` : '<p>Turn on a section to see it here.</p>'}</div>`;
}
function questionPage(testSlug) {
  if (testSlug) {
    const test = testPlans.find(item => item.slug === testSlug);
    if (test) return `<div class="question-page"><a class="back-link" href="/admin#questions" data-question-link>← ALL QUESTIONS & TESTS</a><div class="question-hero"><span class="eyebrow">WILDCARD TEST / ${test.order}</span><h2>${test.name}</h2><p>${test.theme}</p><span class="test-status">ASSESSMENT DRAFT · NOT LIVE</span></div><div class="test-brief"><h3>What this test explores</h3><p>${test.detail}</p><h3>How two people get here</h3><ol><li>They answer each other’s five questions.</li><li>Each privately chooses MORE.</li><li>One sends this test; the other sees the same invitation.</li><li>Both independently complete the same in-house assessment. Results reveal to both together.</li></ol><p class="question-caveat">Questions, scoring, and the shared results screen still need to be designed. This link opens the test brief, not a live assessment.</p></div></div>`;
  }
  const cards = questionBank.map((item, index) => `<article class="question-card" data-phase="${item.phase}" data-search="${escapeHtml((item.topic + ' ' + item.prompt).toLowerCase())}"><div class="question-card-head"><span class="number">${String(index + 1).padStart(2, '0')}</span><span class="eyebrow">${item.topic}</span><span class="phase-pill ${item.phase}">${item.phase === 'first' ? 'HER FIRST FIVE' : 'HIS RETURN FIVE'}</span></div><h3>${escapeHtml(item.prompt)}</h3><details><summary>See answer choices</summary><ol type="A">${item.answers.map(answer => `<li>${escapeHtml(answer)}</li>`).join('')}</ol></details></article>`).join('');
  const tests = testPlans.map(test => `<a class="test-card" href="/admin#questions/test-${test.slug}" data-question-link><span class="test-order">${test.order}</span><span><b>${test.name}</b><small>${test.theme}</small></span><span class="test-arrow">↗</span></a>`).join('');
  return `<div class="question-page"><div class="question-hero"><span class="eyebrow">THE INTRINSIC DIG</span><h2>Go deeper than a first impression.</h2><p>Ten drafted questions open the conversation. Her prioritized five go first; when he answers, his next five go to her. We’ll build toward a bank of 50 as we learn what matters.</p><div class="sequence"><span>HER 5</span><span>HIS 5</span><span>PRIVATE MORE / THANK YOU</span><span>SHARED TESTS</span></div></div><section class="question-section"><div class="section-heading"><div><span class="eyebrow">01 / QUESTION BANK</span><h3>Ten questions to start</h3><p>Values, communication, love and fear, emotional expression, boundaries, preferences, agreements, and conflict repair shape the deeper bank.</p></div><span class="count-badge">10 DRAFTED / 50 PLANNED</span></div><div class="question-controls"><label for="questionSearch">Find a question<input id="questionSearch" type="search" placeholder="Search topic or wording"></label><label for="questionPhase">Exchange<select id="questionPhase"><option value="all">All ten</option><option value="first">Her first five</option><option value="return">His return five</option></select></label></div><div id="questionList" class="question-list">${cards}</div><p id="emptyQuestions" class="question-caveat" hidden>No questions match that search.</p><p class="question-caveat">These ten are the current prototype prompts. The other 40 have not been written or approved yet.</p></section><section class="question-section" id="wildcardTests"><div class="section-heading"><div><span class="eyebrow">02 / AFTER MUTUAL MORE</span><h3>Tests they take together</h3><p>One person sends a test. Both complete the same in-house assessment independently; their results are revealed to both together.</p></div><span class="count-badge">FIVE PLANNED</span></div><div class="test-list">${tests}</div><p class="question-caveat">The links open individual test briefs. Assessments and result sharing are not live yet.</p></section></div>`;
}
function filterQuestions() {
  const term = $('questionSearch')?.value.toLowerCase().trim() || '';
  const phase = $('questionPhase')?.value || 'all';
  let shown = 0;
  for (const card of document.querySelectorAll('.question-card')) {
    const match = (phase === 'all' || card.dataset.phase === phase) && card.dataset.search.includes(term);
    card.hidden = !match;
    if (match) shown++;
  }
  if ($('emptyQuestions')) $('emptyQuestions').hidden = shown > 0;
}
function showPage(page, testSlug = '') {
  const isTemplate = page === 'templates';
  $('templatePage').hidden = !isTemplate;
  $('otherPage').hidden = isTemplate;
  $('pageTitle').textContent = isTemplate ? 'Member Profile' : pages[page].title;
  document.title = `${isTemplate ? 'Member Profile Template' : pages[page].title} · Chempatibility`;
  for (const button of document.querySelectorAll('[data-page]')) {
    const selected = button.dataset.page === page;
    button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
  if (page === 'questions') {
    $('otherPage').classList.add('questions-layout');
    $('otherPage').innerHTML = questionPage(testSlug);
    $('questionSearch')?.addEventListener('input', filterQuestions);
    $('questionPhase')?.addEventListener('change', filterQuestions);
  } else if (!isTemplate) {
    $('otherPage').classList.remove('questions-layout');
    const item = pages[page];
    $('otherPage').innerHTML = `<span class="eyebrow">${item.eyebrow}</span><h2>${item.title}</h2><p>${item.body}</p><button type="button" class="button primary" id="backToTemplate">OPEN MEMBER PROFILE TEMPLATE →</button>`;
    $('backToTemplate').addEventListener('click', () => showPage('templates'));
  } else $('otherPage').classList.remove('questions-layout');
  history.replaceState(null, '', page === 'templates' ? '/admin' : `/admin#${page}${testSlug ? `/test-${testSlug}` : ''}`);
}
writeFields();
preview();
for (const input of document.querySelectorAll('[data-copy], [data-visible]')) {
  input.addEventListener('input', () => { readDraft(); preview(); $('saveStatus').textContent = 'Unsaved changes'; });
  input.addEventListener('change', () => { readDraft(); preview(); $('saveStatus').textContent = 'Unsaved changes'; });
}
for (const button of document.querySelectorAll('[data-page]')) button.addEventListener('click', () => showPage(button.dataset.page));
$('otherPage').addEventListener('click', event => {
  const link = event.target.closest('[data-question-link]');
  if (!link) return;
  event.preventDefault();
  const match = link.getAttribute('href').match(/#questions\/test-(.+)$/);
  showPage('questions', match ? match[1] : '');
  window.scrollTo(0, 0);
});
for (const [id, mobile] of [['desktopView', false], ['mobileView', true]]) {
  $(id).addEventListener('click', () => {
    $('profilePreview').classList.toggle('mobile', mobile);
    for (const viewId of ['desktopView', 'mobileView']) {
      const selected = viewId === id;
      $(viewId).classList.toggle('selected', selected);
      $(viewId).setAttribute('aria-pressed', selected);
    }
  });
}
$('saveButton').addEventListener('click', () => {
  readDraft();
  try { localStorage.setItem(storageKey, JSON.stringify(draft)); $('saveStatus').textContent = 'Draft saved in this browser.'; }
  catch (_) { $('saveStatus').textContent = 'This browser could not save the draft.'; }
});
$('resetButton').addEventListener('click', () => {
  if (!confirm('Reset the Member Profile template draft in this browser?')) return;
  draft = { ...defaults };
  try { localStorage.removeItem(storageKey); } catch (_) { /* The page still resets. */ }
  writeFields(); preview(); $('saveStatus').textContent = 'Draft reset.';
});
const initial = location.hash.slice(1);
if (initial.startsWith('questions/test-')) showPage('questions', initial.slice('questions/test-'.length));
else if (pages[initial]) showPage(initial);
