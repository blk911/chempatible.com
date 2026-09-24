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
  showConnections: true,
  selectedQuestions: [],
  questionEdits: {}
};
const questionBank = [
  {
    "topic": "CORE VALUES",
    "prompt": "What are three things you will protect even when doing so costs you something?"
  },
  {
    "topic": "CORE VALUES",
    "prompt": "What does respect look like in an ordinary week together?"
  },
  {
    "topic": "CORE VALUES",
    "prompt": "When have you changed your mind about something important?"
  },
  {
    "topic": "CORE VALUES",
    "prompt": "What kind of promise do you consider binding?"
  },
  {
    "topic": "CORE VALUES",
    "prompt": "Which matters more in a hard moment: being understood, being right, or finding a way forward? Why?"
  },
  {
    "topic": "COMMUNICATION STYLE",
    "prompt": "When something bothers you, how do you usually bring it up?"
  },
  {
    "topic": "COMMUNICATION STYLE",
    "prompt": "Your partner makes a big mistake that embarrasses you in front of friends. Later, alone, what are the first two sentences you say?"
  },
  {
    "topic": "COMMUNICATION STYLE",
    "prompt": "What does someone do that helps you feel heard?"
  },
  {
    "topic": "COMMUNICATION STYLE",
    "prompt": "When you disagree, do you want to talk immediately or take time first? What do you say to let the other person know?"
  },
  {
    "topic": "COMMUNICATION STYLE",
    "prompt": "What is a sentence you wish you had handled differently in a past relationship?"
  },
  {
    "topic": "LOVE & FEAR",
    "prompt": "What makes you feel chosen by someone?"
  },
  {
    "topic": "LOVE & FEAR",
    "prompt": "When closeness starts to matter, what do you worry could happen?"
  },
  {
    "topic": "LOVE & FEAR",
    "prompt": "What does love ask of you that does not come easily?"
  },
  {
    "topic": "LOVE & FEAR",
    "prompt": "How do you act when you begin to fear losing someone?"
  },
  {
    "topic": "LOVE & FEAR",
    "prompt": "What helps you feel safe enough to be fully yourself?"
  },
  {
    "topic": "EMOTIONAL EXPRESSION",
    "prompt": "How can someone tell you are hurt before you say so?"
  },
  {
    "topic": "EMOTIONAL EXPRESSION",
    "prompt": "Your partner forgets something important to you. You feel hurt and angry. What do you actually say when you bring it up?"
  },
  {
    "topic": "EMOTIONAL EXPRESSION",
    "prompt": "When you are upset, what do you need from a partner—and how do you ask for it?"
  },
  {
    "topic": "EMOTIONAL EXPRESSION",
    "prompt": "Which feeling is hardest for you to express plainly?"
  },
  {
    "topic": "EMOTIONAL EXPRESSION",
    "prompt": "What do you do when your partner is upset about something you do not understand?"
  },
  {
    "topic": "BOUNDARIES",
    "prompt": "What is a boundary you need a partner to understand early?"
  },
  {
    "topic": "BOUNDARIES",
    "prompt": "How do you respond when someone you care about says, 'I need some space'?"
  },
  {
    "topic": "BOUNDARIES",
    "prompt": "What do you consider private even in a close relationship?"
  },
  {
    "topic": "BOUNDARIES",
    "prompt": "When have you had to tell someone 'no' despite caring about them?"
  },
  {
    "topic": "BOUNDARIES",
    "prompt": "What is the difference, for you, between asking for reassurance and demanding it?"
  },
  {
    "topic": "PREFERENCES",
    "prompt": "What does a good ordinary evening together look like?"
  },
  {
    "topic": "PREFERENCES",
    "prompt": "How much time together feels good to you in a growing relationship?"
  },
  {
    "topic": "PREFERENCES",
    "prompt": "What kind of affection feels natural to give? What feels good to receive?"
  },
  {
    "topic": "PREFERENCES",
    "prompt": "How do you prefer to make plans together?"
  },
  {
    "topic": "PREFERENCES",
    "prompt": "What small habit makes living or spending time together easier for you?"
  },
  {
    "topic": "NON-NEGOTIABLE PREFERENCES",
    "prompt": "What relationship arrangement could you enjoy but could never sustain?"
  },
  {
    "topic": "NON-NEGOTIABLE PREFERENCES",
    "prompt": "What must be true about honesty between you and a partner?"
  },
  {
    "topic": "NON-NEGOTIABLE PREFERENCES",
    "prompt": "Which difference between two people would eventually become too costly for you?"
  },
  {
    "topic": "NON-NEGOTIABLE PREFERENCES",
    "prompt": "What do you need to know about someone’s commitments before becoming serious?"
  },
  {
    "topic": "NON-NEGOTIABLE PREFERENCES",
    "prompt": "What would make you kindly end a promising connection?"
  },
  {
    "topic": "COMMITMENTS & AGREEMENTS",
    "prompt": "What does keeping your word mean when circumstances change?"
  },
  {
    "topic": "COMMITMENTS & AGREEMENTS",
    "prompt": "If you cannot keep a commitment, when and how do you tell your partner?"
  },
  {
    "topic": "COMMITMENTS & AGREEMENTS",
    "prompt": "What decisions should two people explicitly make together?"
  },
  {
    "topic": "COMMITMENTS & AGREEMENTS",
    "prompt": "How do you handle an agreement that no longer works for you?"
  },
  {
    "topic": "COMMITMENTS & AGREEMENTS",
    "prompt": "Tell me about a commitment you kept when it became inconvenient."
  },
  {
    "topic": "CONFLICT RESOLUTION — APR",
    "prompt": "When a disagreement gets heated, what do you do to keep it from getting worse?"
  },
  {
    "topic": "CONFLICT RESOLUTION — APR",
    "prompt": "Your partner makes a choice that costs you time or money. It was their mistake. What do you say first, and what do you want to happen next?"
  },
  {
    "topic": "CONFLICT RESOLUTION — APR",
    "prompt": "What does a meaningful apology include for you?"
  },
  {
    "topic": "CONFLICT RESOLUTION — APR",
    "prompt": "After you have hurt someone, how do you try to repair it?"
  },
  {
    "topic": "CONFLICT RESOLUTION — APR",
    "prompt": "How do you know a conflict is resolved rather than merely over?"
  },
  {
    "topic": "ATTACHMENT",
    "prompt": "When someone you care about pulls back, what story do you first tell yourself?"
  },
  {
    "topic": "ATTACHMENT",
    "prompt": "What helps you stay connected while giving someone room?"
  },
  {
    "topic": "ATTACHMENT",
    "prompt": "When you need reassurance, how do you ask for it?"
  },
  {
    "topic": "ATTACHMENT",
    "prompt": "What makes you withdraw even when you want closeness?"
  },
  {
    "topic": "ATTACHMENT",
    "prompt": "What has a past relationship taught you about how you attach?"
  }
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
      if (key === 'selectedQuestions' && Array.isArray(saved[key])) draft[key] = saved[key].filter(n => Number.isInteger(n) && n >= 0 && n < 50).slice(0, 10);
      else if (key === 'questionEdits' && saved[key] && typeof saved[key] === 'object') draft[key] = saved[key];
      else if (typeof saved[key] === typeof defaults[key]) draft[key] = saved[key];
    }
  }
} catch (_) { /* Browser storage is optional for this design draft. */ }

function questionText(index) { return draft.questionEdits[index] ?? questionBank[index].prompt; }
function renderBankEditor() {
  $('selectedCount').textContent = `${draft.selectedQuestions.length} / 10 selected`;
  $('bankEditorList').innerHTML = questionBank.map((item, index) => `<div class="bank-row"><label class="bank-select"><input type="checkbox" data-question-select="${index}" ${draft.selectedQuestions.includes(index) ? 'checked' : ''} ${draft.selectedQuestions.length >= 10 && !draft.selectedQuestions.includes(index) ? 'disabled' : ''} aria-label="Select question ${index + 1}"></label><div class="bank-copy"><small>${String(index + 1).padStart(2, '0')} · ${escapeHtml(item.topic)}</small><p>${escapeHtml(questionText(index))}</p><button type="button" class="text-button" data-question-edit="${index}">Edit</button></div></div>`).join('');
}
$('bankEditorList').addEventListener('change', event => {
  const input = event.target.closest('[data-question-select]');
  if (!input) return;
  const index = Number(input.dataset.questionSelect);
  if (input.checked && draft.selectedQuestions.length < 10) draft.selectedQuestions.push(index);
  else draft.selectedQuestions = draft.selectedQuestions.filter(n => n !== index);
  renderBankEditor(); preview(); $('saveStatus').textContent = 'Unsaved changes';
});
$('bankEditorList').addEventListener('click', event => {
  const button = event.target.closest('[data-question-edit]');
  if (!button) return;
  const index = Number(button.dataset.questionEdit);
  const copy = button.closest('.bank-copy');
  const current = questionText(index);
  copy.innerHTML = `<small>${String(index + 1).padStart(2, '0')} · ${escapeHtml(questionBank[index].topic)}</small><label class="edit-label">Question wording<textarea rows="3" maxlength="400">${escapeHtml(current)}</textarea></label><div class="edit-actions"><button type="button" class="button primary" data-save-edit>Save question</button><button type="button" class="text-button" data-cancel-edit>Cancel</button></div>`;
  copy.querySelector('textarea').focus();
  copy.querySelector('[data-save-edit]').addEventListener('click', () => {
    const value = copy.querySelector('textarea').value.trim();
    if (!value) { copy.querySelector('textarea').focus(); return; }
    if (value === questionBank[index].prompt) delete draft.questionEdits[index];
    else draft.questionEdits[index] = value;
    renderBankEditor(); preview(); $('saveStatus').textContent = 'Unsaved changes';
  });
  copy.querySelector('[data-cancel-edit]').addEventListener('click', renderBankEditor);
});
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
    draft.showPriorities ? `<section class="member-card"><h3>My 10</h3><p>The questions I care about. My top five lead the first exchange.</p><ol class="priorities">${draft.selectedQuestions.map(index => `<li>${escapeHtml(questionText(index))}</li>`).join('') || '<li>Choose your first ten in the editor.</li>'}</ol></section>` : ''
  ].join('');
  const connections = draft.showConnections ? `<div class="member-column"><section class="member-card"><h3>Connections</h3><button type="button" class="connection-row"><span class="avatar">M</span><span><b>Mike</b><small>Five answered · Your move</small></span><span style="margin-left:auto">→</span></button><div class="conversation"><b>Cindy + Mike</b>Mike answered your first five. Read his answers, then continue the exchange.</div></section></div>` : '';
  $('profilePreview').innerHTML = `<header class="member-bar"><div class="member-logo">CHEM<span>PATIBILITY</span></div><div class="member-id"><span class="avatar">C</span><span><b>Cindy</b><br>cindy@example.com · Cell private</span></div></header><div class="member-content"><div class="member-hero"><span class="member-eyebrow">MY PAGE</span><h2>${greeting}</h2><p>${escapeHtml(draft.intro)}</p></div>${draft.showConnect ? `<section class="member-cta"><div><span class="member-eyebrow">YOUR NEXT CONNECTION</span><h3>${escapeHtml(draft.connectTitle)}</h3><p>${escapeHtml(draft.connectText)}</p></div><button type="button" class="cta-button">${escapeHtml(draft.connectButton)}</button></section>` : ''}${contents || connections ? `<div class="member-grid"><div class="member-column">${contents}</div>${connections}</div>` : '<p>Turn on a section to see it here.</p>'}</div>`;
}
function questionPage(testSlug) {
  if (testSlug) {
    const test = testPlans.find(item => item.slug === testSlug);
    if (test) return `<div class="question-page"><a class="back-link" href="/admin#questions" data-question-link>← ALL QUESTIONS & TESTS</a><div class="question-hero"><span class="eyebrow">WILDCARD TEST / ${test.order}</span><h2>${test.name}</h2><p>${test.theme}</p><span class="test-status">ASSESSMENT DRAFT · NOT LIVE</span></div><div class="test-brief"><h3>What this test explores</h3><p>${test.detail}</p><h3>How two people get here</h3><ol><li>They answer each other’s five questions.</li><li>Each privately chooses MORE.</li><li>One sends this test; the other sees the same invitation.</li><li>Both independently complete the same in-house assessment. Results reveal to both together.</li></ol><p class="question-caveat">Questions, scoring, and the shared results screen still need to be designed. This link opens the test brief, not a live assessment.</p></div></div>`;
  }
  const cards = questionBank.map((item, index) => `<article class="question-card" data-search="${escapeHtml((item.topic + ' ' + questionText(index)).toLowerCase())}"><div class="question-card-head"><span class="number">${String(index + 1).padStart(2, '0')}</span><span class="eyebrow">${escapeHtml(item.topic)}</span></div><h3>${escapeHtml(questionText(index))}</h3></article>`).join('');
  const tests = testPlans.map(test => `<a class="test-card" href="/admin#questions/test-${test.slug}" data-question-link><span class="test-order">${test.order}</span><span><b>${test.name}</b><small>${test.theme}</small></span><span class="test-arrow">↗</span></a>`).join('');
  return `<div class="question-page"><div class="question-hero"><span class="eyebrow">THE INTRINSIC DIG</span><h2>Questions that open a connection.</h2><p>Fifty questions across ten intrinsic areas. Choose and edit the first ten in Templates.</p><div class="sequence"><span>YOUR 5</span><span>THEIR 5</span><span>PRIVATE MORE / THANK YOU</span><span>SHARED TESTS</span></div></div><section class="question-section"><div class="section-heading"><div><span class="eyebrow">01 / QUESTION BANK</span><h3>All 50 questions</h3></div><span class="count-badge">50 DRAFTED</span></div><div class="question-controls"><label for="questionSearch">Find a question<input id="questionSearch" type="search" placeholder="Search topic or wording"></label></div><div id="questionList" class="question-list">${cards}</div><p id="emptyQuestions" class="question-caveat" hidden>No questions match that search.</p></section><section class="question-section" id="wildcardTests"><div class="section-heading"><div><span class="eyebrow">02 / AFTER MUTUAL MORE</span><h3>Tests they take together</h3><p>Both complete the same in-house assessment independently; their results are revealed together.</p></div></div><div class="test-list">${tests}</div></section></div>`;
}
function filterQuestions() {
  const term = $('questionSearch')?.value.toLowerCase().trim() || '';
  let shown = 0;
  for (const card of document.querySelectorAll('.question-card')) {
    const match = card.dataset.search.includes(term);
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
  } else if (!isTemplate) {
    $('otherPage').classList.remove('questions-layout');
    const item = pages[page];
    $('otherPage').innerHTML = `<span class="eyebrow">${item.eyebrow}</span><h2>${item.title}</h2><p>${item.body}</p><button type="button" class="button primary" id="backToTemplate">OPEN MEMBER PROFILE TEMPLATE →</button>`;
    $('backToTemplate').addEventListener('click', () => showPage('templates'));
  } else $('otherPage').classList.remove('questions-layout');
  history.replaceState(null, '', page === 'templates' ? '/admin' : `/admin#${page}${testSlug ? `/test-${testSlug}` : ''}`);
}
writeFields();
renderBankEditor();
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
  draft = { ...defaults, selectedQuestions: [], questionEdits: {} };
  try { localStorage.removeItem(storageKey); } catch (_) { /* The page still resets. */ }
  writeFields(); renderBankEditor(); preview(); $('saveStatus').textContent = 'Draft reset.';
});
const initial = location.hash.slice(1);
if (initial.startsWith('questions/test-')) showPage('questions', initial.slice('questions/test-'.length));
else if (pages[initial]) showPage(initial);
