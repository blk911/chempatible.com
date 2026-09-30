// Live admin pages: Dash, Members, Reports and Activity, backed by /api/admin.
// admin.js keeps the Questions, Templates and Settings pages; this file takes over Dash and Members.
(()=>{
const OPS={dash:'Dash',members:'Members',reports:'Reports',activity:'Activity'};
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when=v=>v?new Date(v).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'}):'—';
const day=v=>v?new Date(v).toLocaleDateString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',year:'numeric'}):'—';
const KINDS={signup:'Signed up',profile_updated:'Updated profile',ten_answered:'Finished their ten',qr_created:'Made a QR code',qr_scanned:'QR code scanned',invite_emailed:'Emailed an invitation',first_five:'Answered first five',request:'Asked to connect',accept:'Accepted',pass:'Passed',message:'Sent a message',next_five:'Answered next five',email_shared:'Shared email',unmatch:'Unmatched',report:'Filed a report',auto_suspend:'Auto-suspended (3rd report)',auto_block:'Auto-blocked (4th report)',admin_login:'Admin signed in',admin_note:'Admin note added',admin_suspend:'Admin suspended',admin_block:'Admin blocked',admin_reinstate:'Admin reinstated',signin:'Opened their page with a code',logout:'Logged out',admin_delete:'Admin deleted a member',report_reviewed:'Report reviewed',report_dismissed:'Report dismissed',report_open:'Report reopened',report_linked:'Report linked to member'};
const ALERT=new Set(['report','auto_suspend','auto_block','admin_suspend','admin_block','admin_delete']);
let reasons={harassment:'Harassment or threats',fake:'Fake profile or impersonation',inappropriate:'Inappropriate photo or messages',safety:'Made me feel unsafe',underage:'May be under 18',other:'Something else'};

async function api(path,body){
 const response=await fetch(path,body?{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)}:{credentials:'same-origin',cache:'no-store'});
 if(response.status===401){location.href='/admin-login';throw Error('Sign in required.')}
 let data={};try{data=await response.json()}catch{}
 if(!response.ok)throw Error(data.error||'Request failed.');
 return data;
}
function standing(m){
 if(m.blocked_at)return '<span class="ops-badge bad">BLOCKED</span>';
 if(m.suspended_until&&new Date(m.suspended_until)>new Date())return `<span class="ops-badge warn">SUSPENDED TO ${esc(day(m.suspended_until).toUpperCase())}</span>`;
 return '<span class="ops-badge ok">GOOD STANDING</span>';
}
const memberLink=(id,name)=>id?`<a href="/admin#members/${esc(id)}" data-ops-link="members/${esc(id)}">${esc(name||'Member')}</a>`:esc(name||'—');
function detailText(a){
 const d=a.detail||{},bits=[];
 if(d.name)bits.push(d.name);
 if(d.reason)bits.push(reasons[d.reason]||d.reason);
 if(d.side)bits.push(d.side==='member'?'as inviter':'as invitee');
 if(d.strikes)bits.push(`strike ${d.strikes}`);
 if(d.by)bits.push(d.by==='member'?'from inviter':'from invitee');
 if(d.length)bits.push(`${d.length} chars`);
 if(d.channel)bits.push(d.channel);
 return bits.join(' · ');
}
const feed=rows=>rows.length?`<ol class="ops-feed">${rows.map(a=>`<li class="${ALERT.has(a.kind)?'alert':''}"><time>${esc(when(a.at))}</time><b>${esc(KINDS[a.kind]||a.kind)}</b><span>${a.member_id?memberLink(a.member_id,a.member_name):'<i>visitor</i>'}${detailText(a)?` · ${esc(detailText(a))}`:''}</span></li>`).join('')}</ol>`:'<p class="ops-empty">Nothing yet.</p>';

function activate(page){
 for(const b of document.querySelectorAll('.side-nav button')){const on=(b.dataset.page||b.dataset.ops)===page;b.classList.toggle('active',on);on?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current')}
}
async function open(page,arg=''){
 $('templatePage').hidden=true;document.querySelector('.draft-badge')?.setAttribute('hidden','');
 const host=$('otherPage');host.hidden=false;host.classList.remove('questions-layout');host.classList.add('ops-page');
 $('pageTitle').textContent=OPS[page];document.title=`${OPS[page]} · chem-PATIBLE admin`;
 activate(page);history.replaceState(null,'',`/admin#${page}${arg?`/${arg}`:''}`);
 host.innerHTML='<p class="ops-empty">Loading…</p>';
 try{host.innerHTML=await renderers[page](arg)}catch(e){host.innerHTML=`<p class="error">${esc(e.message)}</p>`}
}

const renderers={
 async dash(){
  const {counts:c,daily,recent}=await api('/api/admin?view=summary');
  const tile=(label,value,sub='',link='')=>`<${link?`a href="/admin#${link}" data-ops-link="${link}"`:'div'} class="ops-tile"><small>${label}</small><b>${value}</b>${sub?`<span>${sub}</span>`:''}</${link?'a':'div'}>`;
  const invites=c.qr_codes+c.email_invites,steps=[['Invitations made',invites],['Five answered',c.five_answered],['Asked to connect',c.requests],['Chat opened',c.chats]];
  const days=[...new Set(daily.map(r=>r.day))],kinds=['signup','qr_created','qr_scanned','request','accept','report'],cell=(d,k)=>daily.find(r=>r.day===d&&r.kind===k)?.n||'';
  return `<section class="ops-tiles">
   ${tile('Members',c.members,`+${c.members_day} today · +${c.members_week} this week`,'members')}
   ${tile('Ready to play',c.members_ready,'finished their ten')}
   ${tile('QR codes',c.qr_codes,`${c.qr_scanned} scanned`)}
   ${tile('Email invites',c.email_invites)}
   ${tile('Chats opened',c.chats,`${c.messages_day} messages today`)}
   ${tile('Passes',c.passes)}
   ${tile('Ended',c.ended,'unmatched or reported')}
   ${tile('Open reports',c.reports_open,`${c.reports_total} all time`,'reports')}
   ${tile('Suspended',c.suspended,'30-day pause')}
   ${tile('Blocked',c.blocked)}
  </section>
  <section class="ops-card"><span class="eyebrow">CONNECTION FUNNEL</span><div class="ops-funnel">${steps.map(([label,n])=>`<div><span>${label}</span><i style="width:${invites?Math.max(2,Math.round(n/invites*100)):2}%"></i><b>${n}</b></div>`).join('')}</div></section>
  <section class="ops-card"><span class="eyebrow">LAST 14 DAYS · MOUNTAIN TIME</span>${days.length?`<div class="ops-scroll"><table class="ops-table"><thead><tr><th>Day</th>${kinds.map(k=>`<th>${esc(KINDS[k])}</th>`).join('')}</tr></thead><tbody>${days.map(d=>`<tr><td>${esc(d)}</td>${kinds.map(k=>`<td>${cell(d,k)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<p class="ops-empty">Daily activity appears here as people play. Tracking began with this release; earlier history only shows in the totals above.</p>'}</section>
  <section class="ops-card"><span class="eyebrow">LATEST ACTIVITY</span>${feed(recent)}<a class="text-button" href="/admin#activity" data-ops-link="activity">All activity →</a></section>`;
 },
 async members(id){
  if(id)return memberDetail(id);
  const q=sessionStorage.getItem('ops.q')||'';
  const {members}=await api(`/api/admin?view=members&q=${encodeURIComponent(q)}`);
  return `<form class="ops-search" data-ops-search><input type="search" name="q" value="${esc(q)}" placeholder="Search name, email or cell" aria-label="Search members"><button class="button primary" type="submit">SEARCH</button></form>
  <div class="ops-scroll"><table class="ops-table"><thead><tr><th>Member</th><th>Contact</th><th>Confirmed</th><th>Joined</th><th>Answered</th><th>Invites</th><th>Strikes</th><th>Standing</th><th>Last active</th></tr></thead><tbody>
  ${members.map(m=>`<tr><td>${memberLink(m.id,m.name)}</td><td>${esc(m.contact)}</td><td>${m.verified?'✓':'<span class="strike">not yet</span>'}</td><td>${esc(day(m.created_at))}</td><td>${m.answered}/10</td><td>${m.invites}</td><td class="${m.strikes?'strike':''}">${m.strikes}</td><td>${standing(m)}</td><td>${esc(when(m.last_active))}</td></tr>`).join('')||'<tr><td colspan="9" class="ops-empty">No members match.</td></tr>'}
  </tbody></table></div>`;
 },
 async reports(filter){
  const status=filter||'open';
  const data=await api(`/api/admin?view=reports&status=${status}`);reasons={...reasons,...data.reasons};
  const tabs=['open','reviewed','dismissed','all'].map(s=>`<a href="/admin#reports/${s}" data-ops-link="reports/${s}" class="${s===status?'on':''}">${s.toUpperCase()}</a>`).join('');
  const cards=await Promise.all(data.reports.map(async r=>{
   let link='';
   if(!r.reported_member_id&&r.reported_contact){try{const {members}=await api(`/api/admin?view=members&q=${encodeURIComponent(r.reported_contact)}`);link=members.length?`<div class="ops-link">Possible match: ${members.map(m=>`<button class="text-button" data-act="link_report" data-id="${esc(r.id)}" data-member="${esc(m.id)}">Link to ${esc(m.name)} (${esc(m.contact)})</button>`).join(' ')}</div>`:''}catch{}}
   return `<article class="ops-report ${esc(r.status)}"><header><div><span class="eyebrow">${esc(reasons[r.reason]||r.reason)}</span><h3>${esc(r.reporter_name||'A member')} reported ${memberLink(r.reported_member_id,r.reported_name||'someone')}</h3><small>${esc(when(r.created_at))} · ${esc(r.reported_contact||'no contact on file')} · ${r.reported_member_id?`<b class="${r.strikes>=3?'strike':''}">${r.strikes} strike${r.strikes===1?'':'s'}</b>`:'<b>not linked to a member page</b>'}</small></div><span class="ops-badge ${r.status==='open'?'warn':'ok'}">${esc(r.status.toUpperCase())}</span></header>
    ${r.note?`<p class="ops-note">“${esc(r.note)}”</p>`:''}${link}
    <details><summary>Chat at the time of the report (${r.chat.length} message${r.chat.length===1?'':'s'})</summary>${r.chat.length?`<ol class="ops-chat">${r.chat.map(m=>`<li><b>${m.by==='member'?'Inviter':'Invitee'}</b> <time>${esc(when(m.at))}</time><p>${esc(m.text)}</p></li>`).join('')}</ol>`:'<p class="ops-empty">No messages.</p>'}</details>
    <div class="ops-actions">${r.status!=='reviewed'?`<button class="button primary" data-act="report_status" data-id="${esc(r.id)}" data-status="reviewed">MARK REVIEWED</button>`:''}${r.status!=='dismissed'?`<button class="button" data-act="report_status" data-id="${esc(r.id)}" data-status="dismissed" data-confirm="Dismiss this report? It will no longer count as a strike.">DISMISS (REMOVES STRIKE)</button>`:''}${r.status!=='open'?`<button class="text-button" data-act="report_status" data-id="${esc(r.id)}" data-status="open">Reopen</button>`:''}</div></article>`;
  }));
  return `<p class="ops-lead">Every report ends that connection and counts as a strike against the reported member. The 3rd strike pauses them for 30 days; the 4th blocks them. Dismissing a report removes its strike but doesn’t lift a pause or block. Use Reinstate on their page for that.</p><nav class="ops-tabs">${tabs}</nav>${cards.join('')||'<p class="ops-empty">No reports here.</p>'}`;
 },
 async activity(kind){
  const {activity}=await api(`/api/admin?view=activity&kind=${encodeURIComponent(kind||'')}`);
  return `<form class="ops-search" data-ops-kind><select name="kind" aria-label="Filter activity"><option value="">All activity</option>${Object.entries(KINDS).map(([k,v])=>`<option value="${k}" ${k===kind?'selected':''}>${esc(v)}</option>`).join('')}</select><button class="button primary" type="submit">FILTER</button></form><div id="opsFeed">${feed(activity)}</div>${activity.length===150?`<button class="text-button" data-more="${activity[activity.length-1].id}" data-kind="${esc(kind||'')}">Load older →</button>`:''}`;
 }
};

async function memberDetail(id){
 const {member:m,reportsAgainst,reportsFiled,connections,activity}=await api(`/api/admin?view=member&id=${encodeURIComponent(id)}`);
 const strikes=reportsAgainst.filter(r=>r.status!=='dismissed').length;
 const notes=[...(m.admin_notes||[])].reverse();
 const paused=m.suspended_until&&new Date(m.suspended_until)>new Date();
 return `<a class="text-button" href="/admin#members" data-ops-link="members">← All members</a>
 <section class="ops-card ops-profile">${/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(m.photo||'')?`<img src="${m.photo}" alt="">`:''}<div><h2>${esc(m.name)}</h2><p>${esc(m.contact)} · joined ${esc(day(m.created_at))} · ${m.answers.length}/10 answered</p>${standing(m)} <b class="${strikes>=3?'strike':''}">${strikes} strike${strikes===1?'':'s'}</b>
  <div class="ops-actions">${!paused&&!m.blocked_at?`<button class="button" data-act="suspend" data-id="${esc(m.id)}" data-confirm="Pause ${esc(m.name)} for 30 days?">SUSPEND 30 DAYS</button>`:''}${!m.blocked_at?`<button class="button" data-act="block" data-id="${esc(m.id)}" data-confirm="Block ${esc(m.name)} from playing?">BLOCK</button>`:''}${paused||m.blocked_at?`<button class="button primary" data-act="reinstate" data-id="${esc(m.id)}" data-confirm="Lift the pause or block for ${esc(m.name)}?">REINSTATE</button>`:''}<button class="button danger" data-act="delete_member" data-id="${esc(m.id)}" data-name="${esc(m.name)}" data-blocked="${m.blocked_at||paused?'1':''}">DELETE MEMBER</button></div></div></section>
 <section class="ops-card"><span class="eyebrow">PRIVATE NOTES · ADMIN ONLY</span><form class="ops-noteform" data-note="${esc(m.id)}"><textarea name="text" rows="2" maxlength="1000" placeholder="Add a note only admins can see"></textarea><button class="button primary" type="submit">ADD NOTE</button></form>${notes.length?`<ol class="ops-feed">${notes.map(n=>`<li class="${n.by==='system'?'alert':''}"><time>${esc(when(n.at))}</time><b>${n.by==='system'?'System':'Admin'}</b><span>${esc(n.text)}</span></li>`).join('')}</ol>`:'<p class="ops-empty">No notes.</p>'}</section>
 <section class="ops-card"><span class="eyebrow">REPORTS AGAINST (${reportsAgainst.length})</span>${reportsAgainst.length?`<ol class="ops-feed">${reportsAgainst.map(r=>`<li class="${r.status==='dismissed'?'':'alert'}"><time>${esc(when(r.created_at))}</time><b>${esc(reasons[r.reason]||r.reason)}</b><span>from ${esc(r.reporter_name||'a member')} · ${esc(r.status)}${r.note?` · “${esc(r.note)}”`:''}</span></li>`).join('')}</ol>`:'<p class="ops-empty">None.</p>'}</section>
 <section class="ops-card"><span class="eyebrow">REPORTS FILED (${reportsFiled.length})</span>${reportsFiled.length?`<ol class="ops-feed">${reportsFiled.map(r=>`<li><time>${esc(when(r.created_at))}</time><b>${esc(reasons[r.reason]||r.reason)}</b><span>against ${memberLink(r.reported_member_id,r.reported_name)} · ${esc(r.status)}</span></li>`).join('')}</ol>`:'<p class="ops-empty">None.</p>'}</section>
 <section class="ops-card"><span class="eyebrow">CONNECTIONS (${connections.length})</span>${connections.length?`<div class="ops-scroll"><table class="ops-table"><thead><tr><th>Started</th><th>With</th><th>Role</th><th>How</th><th>Status</th><th>Messages</th></tr></thead><tbody>${connections.map(c=>`<tr><td>${esc(when(c.created_at))}</td><td>${memberLink(c.other_id,c.other_name||'Not yet answered')}</td><td>${esc(c.role)}</td><td>${esc(c.channel)}</td><td>${esc(c.status)}</td><td>${c.messages}</td></tr>`).join('')}</tbody></table></div>`:'<p class="ops-empty">None yet.</p>'}</section>
 <section class="ops-card"><span class="eyebrow">ACTIVITY</span>${feed(activity)}</section>`;
}

function route(){
 const [page,arg]=location.hash.slice(1).split('/');
 if(OPS[page])open(page,arg||'');else if(!location.hash)open('dash');
}

// New sidebar entries; DASH and MEMBERS already exist in the admin shell.
const nav=document.querySelector('.side-nav'),membersButton=nav.querySelector('[data-page="members"]');
membersButton.insertAdjacentHTML('afterend','<button data-ops="reports">REPORTS</button><button data-ops="activity">ACTIVITY</button>');
document.querySelector('.exit').insertAdjacentHTML('afterend','<button type="button" class="exit ops-logout">LOG OUT</button>');

// Capture phase: runs before admin.js's own button handlers, so Dash and Members open the live pages.
document.addEventListener('click',event=>{
 const button=event.target.closest('.side-nav button');
 if(!button)return;
 const page=button.dataset.ops||button.dataset.page;
 if(OPS[page]){event.stopPropagation();event.preventDefault();open(page)}
 else{$('otherPage').classList.remove('ops-page');document.querySelector('.draft-badge')?.removeAttribute('hidden');for(const b of nav.querySelectorAll('[data-ops]')){b.classList.remove('active');b.removeAttribute('aria-current')}}
},true);

document.addEventListener('click',async event=>{
 const link=event.target.closest('[data-ops-link]');
 if(link){event.preventDefault();const [page,arg]=link.dataset.opsLink.split('/');open(page,arg||'');window.scrollTo(0,0);return}
 if(event.target.closest('.ops-logout')){await api('/api/admin',{action:'logout'}).catch(()=>{});location.href='/admin-login';return}
 const more=event.target.closest('[data-more]');
 if(more){const {activity}=await api(`/api/admin?view=activity&kind=${encodeURIComponent(more.dataset.kind)}&before=${more.dataset.more}`);$('opsFeed').insertAdjacentHTML('beforeend',feed(activity));if(activity.length<150)more.remove();else more.dataset.more=activity[activity.length-1].id;return}
 const act=event.target.closest('[data-act]');
 if(!act)return;
 if(act.dataset.confirm&&!confirm(act.dataset.confirm))return;
 if(act.dataset.act==='delete_member'){
  const typed=prompt(`Permanently delete ${act.dataset.name}? This removes their page, picture, answers, invitations, chats, reports and activity, and can’t be undone.${act.dataset.blocked?' It also removes their pause or block, so they could sign up again.':''}

Type DELETE to confirm.`);
  if(typed!=='DELETE')return;
 }
 act.disabled=true;
 try{await api('/api/admin',{action:act.dataset.act,id:act.dataset.id,status:act.dataset.status,member:act.dataset.member});if(act.dataset.act==='delete_member')open('members');else route()}
 catch(e){alert(e.message);act.disabled=false}
});
document.addEventListener('submit',async event=>{
 const form=event.target;
 if(form.matches('[data-ops-search]')){event.preventDefault();try{sessionStorage.setItem('ops.q',form.q.value.trim())}catch{}open('members')}
 else if(form.matches('[data-ops-kind]')){event.preventDefault();open('activity',form.kind.value)}
 else if(form.matches('[data-note]')){event.preventDefault();const text=form.text.value.trim();if(!text)return;try{await api('/api/admin',{action:'note',id:form.dataset.note,text});route()}catch(e){alert(e.message)}}
});

api('/api/admin?view=reports&status=open').then(d=>{reasons={...reasons,...d.reasons};const n=d.reports.length;const b=nav.querySelector('[data-ops="reports"]');if(n)b.insertAdjacentHTML('beforeend',` <span class="ops-count">${n}</span>`)}).catch(()=>{});
route();
})();
