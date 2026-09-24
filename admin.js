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
const pages = {
  dash: { title: 'Dash', eyebrow: 'AT A GLANCE', body: 'The admin home will bring members, questions and template activity together as the live system grows.' },
  members: { title: 'Members', eyebrow: 'PEOPLE', body: 'Member accounts and connection histories will appear here when account storage is built. The profile preview uses Cindy as sample content.' },
  questions: { title: 'Questions', eyebrow: 'THE EXCHANGE', body: 'The first five questions start each exchange. The next five come back from the person who scanned. We can grow the bank to fifty here.' },
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
function showPage(page) {
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
  if (!isTemplate) {
    const item = pages[page];
    $('otherPage').innerHTML = `<span class="eyebrow">${item.eyebrow}</span><h2>${item.title}</h2><p>${item.body}</p><button type="button" class="button primary" id="backToTemplate">OPEN MEMBER PROFILE TEMPLATE →</button>`;
    $('backToTemplate').addEventListener('click', () => showPage('templates'));
  }
  history.replaceState(null, '', page === 'templates' ? '/admin' : `/admin#${page}`);
}
writeFields();
preview();
for (const input of document.querySelectorAll('[data-copy], [data-visible]')) {
  input.addEventListener('input', () => { readDraft(); preview(); $('saveStatus').textContent = 'Unsaved changes'; });
  input.addEventListener('change', () => { readDraft(); preview(); $('saveStatus').textContent = 'Unsaved changes'; });
}
for (const button of document.querySelectorAll('[data-page]')) button.addEventListener('click', () => showPage(button.dataset.page));
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
if (pages[initial]) showPage(initial);
