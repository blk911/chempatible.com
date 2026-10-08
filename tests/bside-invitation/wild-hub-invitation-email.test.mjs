import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createWildHubService} from '../../wild-hub-hosted/server/_wildhub-service.mjs';
import {createWildHubMailAdapter} from '../../wild-hub-hosted/server/_wildhub-adapters.mjs';
import {renderInvitationEmail,invitationEmailDraft,invitationPreviewStylePolicy} from '../../wild-hub-hosted/server/_wildhub-invitation-email.mjs';
const origin='https://bsidevibes.com',sha=v=>createHash('sha256').update(v).digest('hex');
async function fixture(t,{send}={}){
 const db=new PGlite();t.after(()=>db.close());await db.exec(await readFile(new URL('./fixtures/001-base.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('./fixtures/004-notifications.sql',import.meta.url),'utf8'));
 let time=Date.parse('2026-10-08T12:00:00Z');const hostId=randomUUID(),hubId=randomUUID(),token='a'.repeat(64),outbox=[],queries=[];
 await db.query('INSERT INTO wh_users(id,email,verified_at,name,photo_id,acknowledged_at,created_at) VALUES($1,$2,$3,$4,$5,$3,$3)',[hostId,'host@example.test',new Date(time).toISOString(),'Taylor',randomUUID()]);
 await db.query('INSERT INTO wh_hubs(id,owner_id,slug,name,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5)',[hubId,hostId,'my-circle','Taylor’s circle',new Date(time).toISOString()]);
 await db.query('INSERT INTO wh_sessions(token_hash,user_id,expires_at,created_at) VALUES($1,$2,$3,$4)',[sha(token),hostId,new Date(time+86400000).toISOString(),new Date(time).toISOString()]);
 const observed={query(sql,args){queries.push(sql);return db.query(sql,args)},transaction(fn){return db.transaction(tx=>fn({query(sql,args){queries.push(sql);return tx.query(sql,args)}}))}};
 const mail={deliveryMode:'provider',sender:{name:'BsideVibes',email:'hello@example.test'},async send(message){outbox.push(message);return send?send(message):{accepted:true}}};
 const errors=[],handler=createWildHubService({db:observed,mail,origin,secret:'test-secret-only-not-valid-outside-tests'.repeat(2),sharp:()=>{},emailAllowed:address=>address.endsWith('.test'),now:()=>time,onError:e=>errors.push(e)});
 async function call(action,body,{authenticated=true,requestOrigin=origin}={}){const response=await handler(new Request(origin+'/api/wildhub?action='+action,{method:'POST',headers:{'content-type':'application/json',origin:requestOrigin,...(authenticated?{cookie:'wh_session='+token}:{})},body:JSON.stringify(body)}));return {status:response.status,...await response.json()}}
 return {db,mail,hostId,hubId,outbox,queries,errors,call,tick:ms=>time+=ms,async preview(extra={}){const result=await call('invite_email_preview',{hubId,email:'friend@example.test',...extra});assert.equal(result.status,200,JSON.stringify(result));return result.preview},async send(preview,extra={}){return call('invite_create',{hubId,email:preview.to,previewToken:preview.previewToken,...extra})}};
}
test('preview is authenticated, owner-only and completely read-only with no invitation or provider mail',async t=>{
 const f=await fixture(t);const p=await f.preview();assert.equal(f.outbox.length,0);assert.equal(f.queries.some(s=>/^(INSERT|UPDATE|DELETE)/.test(s)),false);assert.equal((await f.db.query('SELECT count(*)::int n FROM wh_invites')).rows[0].n,0);assert.deepEqual(p.from,{name:'BsideVibes',email:'hello@example.test'});assert.match(p.html,/There’s a B-side/);assert.match(p.html,/#invitation-preview/);assert.doesNotMatch(p.html,/#invite\/[a-f0-9]{64}/);assert.equal((await f.call('invite_email_preview',{hubId:f.hubId,email:'friend@example.test'},{authenticated:false})).status,401);assert.equal((await f.call('invite_email_preview',{hubId:f.hubId,email:'friend@example.test'},{requestOrigin:'https://evil.test'})).status,403);
 const other=randomUUID();await f.db.query('INSERT INTO wh_users(id,email,verified_at,name,created_at) VALUES($1,$2,$3,$4,$3)',[other,'other@example.test','2026-10-08T12:00:00Z','Other host']);await f.db.query('UPDATE wh_hubs SET owner_id=$1 WHERE id=$2',[other,f.hubId]);assert.equal((await f.call('invite_email_preview',{hubId:f.hubId,email:'friend@example.test'})).status,403);assert.equal(f.outbox.length,0);
});
test('edited preview equals actual HTML and plain-text send except private acceptance URL, retry is idempotent',async t=>{
 const f=await fixture(t),p=await f.preview({subject:'A little invitation',message:'Hey friend!\nA place to catch up. <script>alert(1)</script>'});const first=await f.send(p);assert.equal(first.status,200,JSON.stringify(first));assert.deepEqual(first.delivery,{status:'accepted',mode:'provider'});assert.equal(f.outbox.length,1);const m=f.outbox[0];assert.equal(m.subject,p.subject);assert.equal(m.html.replaceAll(m.url,origin+'/#invitation-preview'),p.html);assert.equal(m.text.replaceAll(m.url,origin+'/#invitation-preview'),p.text);assert.match(m.html,/&lt;script&gt;/);assert.doesNotMatch(m.html,/<script>/);assert.equal(JSON.stringify(first).includes(m.token),false);f.tick(1_800_001);assert.equal((await f.send(p)).status,200);assert.equal(f.outbox.length,1);assert.equal((await f.db.query('SELECT ready FROM wh_invites WHERE id=$1',[first.inviteId])).rows[0].ready,true);
});
test('tampered, foreign, expired or changed previews and arbitrary content are rejected',async t=>{
 const f=await fixture(t),p=await f.preview();for(const extra of [{previewToken:p.previewToken.slice(0,-2)+'aa'},{email:'other@example.test'},{html:'<script>bad</script>'},{subject:'unreviewed subject'},{message:'unreviewed message'}])assert.notEqual((await f.send(p,extra)).status,200);assert.equal(f.outbox.length,0);await f.db.query('UPDATE wh_users SET name=$1 WHERE id=$2',['New name',f.hostId]);assert.equal((await f.send(p)).error.code,'preview_changed');const next=await f.preview();f.tick(1_800_001);assert.equal((await f.send(next)).error.code,'preview_expired');assert.equal(f.outbox.length,0);
});
test('untrusted email editing enforces limits, header safety and escaped content, link stays server-owned',async()=>{
 for(const subject of ['','x'.repeat(161),'a\r\nBcc: other@example.test','A\u202eB'])assert.throws(()=>invitationEmailDraft({hostName:'H',hubName:'Hub',subject}),/subject/);
 for(const message of ['','x'.repeat(1501),'a\0b','a\rb'])assert.throws(()=>invitationEmailDraft({hostName:'H',hubName:'Hub',message}),/message/);
 const r=renderInvitationEmail({origin,to:'f@example.test',hostName:'<img src=x onerror=alert(1)>',hubName:'<svg/onload=alert(1)>',message:'<a href="https://evil.test">click</a>',link:origin+'/#invitation-preview'});assert.doesNotMatch(r.html,/<img|<svg|href="https:\/\/evil/);assert.match(r.html,/&lt;a/);for(const link of ['javascript:alert(1)','https://evil.test/#invitation-preview',origin+'/elsewhere',origin+'/?x=1#invitation-preview'])assert.throws(()=>renderInvitationEmail({origin,to:'f@example.test',hostName:'H',hubName:'Hub',link}));
});
test('known provider rejection can retry same preview; uncertain outcome never repeats a send',async t=>{
 let fail=true;const f=await fixture(t,{send:()=>{if(fail)throw Object.assign(Error('rejected'),{delivery:'not_accepted'});return {accepted:true}}}),p=await f.preview();assert.equal((await f.send(p)).error.code,'mail_unavailable');assert.equal((await f.db.query('SELECT count(*)::int n FROM wh_invites')).rows[0].n,0);fail=false;assert.equal((await f.send(p)).status,200);assert.equal(f.outbox.length,2);
 const g=await fixture(t,{send:()=>{throw Object.assign(Error('ambiguous'),{delivery:'uncertain'})}}),q=await g.preview();assert.equal((await g.send(q)).error.code,'invitation_uncertain');g.tick(1_800_001);assert.equal((await g.send(q)).error.code,'invitation_uncertain');assert.equal(g.outbox.length,1);assert.equal((await g.db.query('SELECT ready FROM wh_invites')).rows[0].ready,false);
});
test('overlapping sends send one provider message and no acceptance before provider accepts',async t=>{
 let release;const waiting=new Promise(r=>release=r);const f=await fixture(t,{send:()=>waiting}),p=await f.preview(),sending=f.send(p);while(!f.outbox.length)await new Promise(r=>setTimeout(r,2));assert.equal((await f.send(p)).error.code,'invitation_uncertain');release({accepted:true});assert.equal((await sending).status,200);assert.equal((await f.send(p)).status,200);assert.equal(f.outbox.length,1);
});
test('provider transport contains both MIME alternatives, preserves subject, sender, tracking off and only 202 accepts',async()=>{
 const sent=[],mail=createWildHubMailAdapter({sendgridKey:'fake-key-for-unit-test-only-12345',from:'hello@example.test',recipients:['friend@example.test'],fetchImpl:async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return {status:202}}});const r=renderInvitationEmail({origin,to:'friend@example.test',hostName:'Taylor',hubName:'Circle',link:origin+'/#invite/'+'b'.repeat(64)});await mail.send({to:'friend@example.test',kind:'invite',...r});assert.deepEqual(sent[0].body.content,[{type:'text/plain',value:r.text},{type:'text/html',value:r.html}]);assert.deepEqual(mail.sender,sent[0].body.from);assert.equal(sent[0].body.tracking_settings.click_tracking.enable,false);await assert.rejects(mail.send({to:'friend@example.test',kind:'otp',subject:'test',text:'text',html:'html'}));
});
test('app/header CSP permits only renderer style hashes and a sandboxed same-origin frame',async()=>{
 const {HOSTED_HEADERS}=await import('../../wild-hub-hosted/server/_wildhub-hosted.mjs'),html=await readFile(new URL('../../wild-hub-hosted/wild-hub-app/index.html',import.meta.url),'utf8');const policy=invitationPreviewStylePolicy();assert.ok(HOSTED_HEADERS['content-security-policy'].includes(policy));assert.ok(html.includes(policy));assert.match(policy,/style-src-attr 'unsafe-hashes' 'sha256-/);assert.doesNotMatch(HOSTED_HEADERS['content-security-policy'],/'unsafe-inline'|'unsafe-eval'/);assert.match(HOSTED_HEADERS['content-security-policy'],/frame-src 'self'/);
});

test('hosted preview never starts background mail or billing jobs',async()=>{
 const {createWildHubHostedHandler}=await import('../../wild-hub-hosted/server/_wildhub-hosted.mjs');const calls=[];
 const handler=createWildHubHostedHandler({origin,service:async()=>Response.json({ok:true}),dispatchNotifications:async()=>calls.push('mail'),billing:{reconcileMembershipEvents:async()=>calls.push('reconcile'),runCancellationJobs:async()=>calls.push('cancel')},schedule:()=>calls.push('schedule')});
 const result=await handler(new Request(origin+'/api/wildhub?action=invite_email_preview',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'}));assert.equal(result.status,200);assert.deepEqual(calls,[]);
});

test('a sender or rendered-template fingerprint change requires a new preview',async t=>{
 const f=await fixture(t),p=await f.preview();const receipt=JSON.parse(Buffer.from(p.previewToken.split('.')[0],'base64url').toString('utf8'));assert.match(receipt.contentHash,/^[a-f0-9]{64}$/);f.mail.sender={name:'Changed sender',email:'other@example.test'};assert.equal((await f.send(p)).error.code,'preview_changed');assert.equal(f.outbox.length,0);
});
