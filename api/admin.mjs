import {reviewGate,reviewRecipientAllowed} from './_review.mjs';
import {createHash,randomInt,timingSafeEqual} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import * as ops from './_ops.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
const reply=(data,status=200,headers={})=>Response.json(data,{status,headers:{'cache-control':'no-store',...headers}});
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const SESSION_HOURS=12;
const codeKey=`admin:${ops.ADMIN_EMAIL}`;

async function login(sql,body){
 if(body.action==='start'){
  const address=String(body.email||'').trim().toLowerCase();
  // Same answer for every address, so the page never confirms who the admin is.
  if(address!==ops.ADMIN_EMAIL||!reviewRecipientAllowed(address))return reply({ok:true});
  const recent=await sql`SELECT last_sent_at FROM email_codes WHERE email=${codeKey}`;
  if(recent[0]&&Date.now()-new Date(recent[0].last_sent_at).getTime()<60000)return reply({error:'A code was just sent. Wait a minute before trying again.'},429);
  const code=String(randomInt(100000,1000000));
  await sql`INSERT INTO email_codes(email,code_hash,expires_at,last_sent_at,attempts) VALUES(${codeKey},${hash(code)},now()+interval '10 minutes',now(),0) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,last_sent_at=excluded.last_sent_at,attempts=0`;
  await ops.sendMail(ops.ADMIN_EMAIL,`${code} is your Chem-patible admin code`,`Your admin sign-in code is ${code}. It expires in ten minutes.\n\nIf you didn't try to sign in, someone may be trying to reach the admin page.`);
  return reply({ok:true});
 }
 if(body.action==='verify'){
  const address=String(body.email||'').trim().toLowerCase(),code=String(body.code||'');
  if(address!==ops.ADMIN_EMAIL||!/^\d{6}$/.test(code))return reply({error:'Code expired or incorrect.'},400);
  const rows=await sql`UPDATE email_codes SET attempts=attempts+1 WHERE email=${codeKey} AND expires_at>now() AND attempts<5 RETURNING code_hash`;
  if(!rows[0]||!timingSafeEqual(Buffer.from(hash(code)),Buffer.from(rows[0].code_hash)))return reply({error:'Code expired or incorrect.'},400);
  await sql`DELETE FROM email_codes WHERE email=${codeKey}`;
  await ops.log(sql,'admin_login',{detail:{email:ops.ADMIN_EMAIL}});
  const expires=Date.now()+SESSION_HOURS*3600000;
  return reply({ok:true},200,{'set-cookie':`${ops.ADMIN_COOKIE}=${ops.signAdmin(ops.ADMIN_EMAIL,expires)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS*3600}`});
 }
 if(body.action==='logout')return reply({ok:true},200,{'set-cookie':`${ops.ADMIN_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`});
 return null;
}

async function view(sql,url){
 const name=url.searchParams.get('view');
 if(name==='me')return {email:ops.ADMIN_EMAIL};
 if(name==='summary'){
  const [counts]=await sql`SELECT
   (SELECT count(*)::int FROM members) AS members,
   (SELECT count(*)::int FROM members WHERE created_at>now()-interval '1 day') AS members_day,
   (SELECT count(*)::int FROM members WHERE created_at>now()-interval '7 days') AS members_week,
   (SELECT count(*)::int FROM members WHERE jsonb_array_length(answers)=10) AS members_ready,
   (SELECT count(*)::int FROM invitations WHERE channel='qr') AS qr_codes,
   (SELECT count(*)::int FROM invitations WHERE channel<>'qr') AS email_invites,
   (SELECT count(*)::int FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.channel='qr' AND c.claim_hash IS NOT NULL) AS qr_scanned,
   (SELECT count(*)::int FROM connection_state WHERE status<>'invited') AS five_answered,
   (SELECT count(*)::int FROM connection_state WHERE status NOT IN ('invited','firstResults')) AS requests,
   (SELECT count(*)::int FROM connection_state WHERE status IN ('chat','secondFive','secondResults','email','tests') OR (status='ended' AND jsonb_array_length(messages)>0)) AS chats,
   (SELECT count(*)::int FROM connection_state WHERE status='declined') AS passes,
   (SELECT count(*)::int FROM connection_state WHERE status='ended') AS ended,
   (SELECT count(*)::int FROM reports WHERE status='open') AS reports_open,
   (SELECT count(*)::int FROM reports) AS reports_total,
   (SELECT count(*)::int FROM members WHERE blocked_at IS NULL AND suspended_until>now()) AS suspended,
   (SELECT count(*)::int FROM members WHERE blocked_at IS NOT NULL) AS blocked,
   (SELECT count(*)::int FROM activity WHERE kind='message' AND at>now()-interval '1 day') AS messages_day`;
  const daily=await sql`SELECT to_char(date_trunc('day',at AT TIME ZONE 'America/Denver'),'YYYY-MM-DD') AS day,kind,count(*)::int AS n FROM activity WHERE at>now()-interval '14 days' AND kind IN ('signup','qr_created','qr_scanned','request','accept','report') GROUP BY 1,2 ORDER BY 1`;
  const recent=await activity(sql,{limit:12});
  return {counts,daily,recent};
 }
 if(name==='members'){
  const q=`%${String(url.searchParams.get('q')||'').trim().toLowerCase()}%`;
  const rows=await sql`SELECT m.id,m.name,m.contact,m.created_at,jsonb_array_length(m.answers) AS answered,m.email_verified_at IS NOT NULL AS verified,m.suspended_until,m.blocked_at,
   (SELECT count(*)::int FROM reports r WHERE r.reported_member_id=m.id AND r.status<>'dismissed') AS strikes,
   (SELECT count(*)::int FROM invitations i WHERE i.sender_member_id=m.id) AS invites,
   (SELECT max(at) FROM activity a WHERE a.member_id=m.id) AS last_active
   FROM members m WHERE lower(m.name) LIKE ${q} OR lower(m.contact) LIKE ${q} ORDER BY m.created_at DESC LIMIT 200`;
  return {members:rows};
 }
 if(name==='member'){
  const id=url.searchParams.get('id');if(!uuid(id))return null;
  const rows=await sql`SELECT id,name,contact,photo,answers,created_at,updated_at,suspended_until,blocked_at,admin_notes FROM members WHERE id=${id}`;
  if(!rows[0])return null;
  const reportsAgainst=await sql`SELECT id,created_at,reason,note,status,reporter_name,connection_id FROM reports WHERE reported_member_id=${id} ORDER BY created_at DESC`;
  const reportsFiled=await sql`SELECT id,created_at,reason,status,reported_name,reported_member_id FROM reports WHERE reporter_member_id=${id} ORDER BY created_at DESC`;
  const connections=await sql`SELECT i.token_hash AS id,i.channel,i.created_at,c.status,c.updated_at,jsonb_array_length(c.messages) AS messages,
   CASE WHEN i.sender_member_id=${id} THEN 'inviter' ELSE 'invitee' END AS role,
   CASE WHEN i.sender_member_id=${id} THEN coalesce(c.prospect_name,nullif(i.recipient_name,'')) ELSE i.sender_name END AS other_name,
   CASE WHEN i.sender_member_id=${id} THEN c.prospect_member_id ELSE i.sender_member_id END AS other_id
   FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash
   WHERE i.sender_member_id=${id} OR c.prospect_member_id=${id} ORDER BY i.created_at DESC LIMIT 100`;
  const recent=await activity(sql,{member:id,limit:100});
  return {member:rows[0],reportsAgainst,reportsFiled,connections,activity:recent};
 }
 if(name==='reports'){
  const status=url.searchParams.get('status')||'open';
  const rows=status==='all'?await sql`SELECT r.*,(SELECT count(*)::int FROM reports x WHERE x.reported_member_id=r.reported_member_id AND x.status<>'dismissed') AS strikes FROM reports r ORDER BY r.created_at DESC LIMIT 200`
   :await sql`SELECT r.*,(SELECT count(*)::int FROM reports x WHERE x.reported_member_id=r.reported_member_id AND x.status<>'dismissed') AS strikes FROM reports r WHERE r.status=${status} ORDER BY r.created_at DESC LIMIT 200`;
  return {reports:rows,reasons:ops.REPORT_REASONS};
 }
 if(name==='activity'){
  const kind=url.searchParams.get('kind')||'',before=Number(url.searchParams.get('before'))||0;
  return {activity:await activity(sql,{kind,before,limit:150})};
 }
 return null;
}

async function activity(sql,{member=null,kind='',before=0,limit=100}){
 return sql`SELECT a.id,a.at,a.kind,a.member_id,a.connection_id,a.detail,m.name AS member_name FROM activity a LEFT JOIN members m ON m.id=a.member_id
  WHERE (${member}::uuid IS NULL OR a.member_id=${member}::uuid) AND (${kind}='' OR a.kind=${kind}) AND (${before}=0 OR a.id<${before})
  ORDER BY a.id DESC LIMIT ${limit}`;
}

async function act(sql,body){
 const id=body.id;
 if(body.action==='note'){
  const text=String(body.text||'').trim().slice(0,1000);if(!uuid(id)||!text)return reply({error:'Write a note first.'},400);
  const note={at:new Date().toISOString(),by:'admin',text};
  const rows=await sql`UPDATE members SET admin_notes=admin_notes || ${JSON.stringify([note])}::jsonb WHERE id=${id} RETURNING id`;
  if(rows[0])await ops.log(sql,'admin_note',{member:id});
  return rows[0]?reply({ok:true}):reply({error:'Member not found.'},404);
 }
 if(['suspend','block','reinstate'].includes(body.action)){
  if(!uuid(id))return reply({error:'Member not found.'},404);
  const rows=body.action==='suspend'?await sql`UPDATE members SET suspended_until=now()+${`${ops.SUSPEND_DAYS} days`}::interval WHERE id=${id} RETURNING id`
   :body.action==='block'?await sql`UPDATE members SET blocked_at=coalesce(blocked_at,now()) WHERE id=${id} RETURNING id`
   :await sql`UPDATE members SET suspended_until=NULL,blocked_at=NULL WHERE id=${id} RETURNING id`;
  if(!rows[0])return reply({error:'Member not found.'},404);
  const text={suspend:`Suspended ${ops.SUSPEND_DAYS} days by admin.`,block:'Blocked by admin.',reinstate:'Reinstated by admin.'}[body.action];
  await sql`UPDATE members SET admin_notes=admin_notes || ${JSON.stringify([{at:new Date().toISOString(),by:'admin',text}])}::jsonb WHERE id=${id}`;
  await ops.log(sql,`admin_${body.action}`,{member:id});
  return reply({ok:true});
 }
 if(body.action==='report_status'){
  if(!uuid(id)||!['open','reviewed','dismissed'].includes(body.status))return reply({error:'Invalid report update.'},400);
  const rows=await sql`UPDATE reports SET status=${body.status},reviewed_at=CASE WHEN ${body.status}='open' THEN NULL ELSE now() END WHERE id=${id} RETURNING reported_member_id`;
  if(!rows[0])return reply({error:'Report not found.'},404);
  await ops.log(sql,`report_${body.status}`,{member:rows[0].reported_member_id,detail:{report:id}});
  return reply({ok:true});
 }
 if(body.action==='delete_member'){
  if(!uuid(id))return reply({error:'Member not found.'},404);
  const rows=await sql`SELECT name,contact FROM members WHERE id=${id}`;
  if(!rows[0])return reply({error:'Member not found.'},404);
  const {name,contact}=rows[0];
  // One transaction: their page, invitations they sent (connections cascade), reports and activity about them,
  // their email sign-ins, and their details on connections they joined through someone else's invitation.
  await sql.transaction([
   sql`DELETE FROM reports WHERE reporter_member_id=${id} OR reported_member_id=${id} OR connection_id IN (SELECT token_hash FROM invitations WHERE sender_member_id=${id} OR sender_email=${contact})`,
   sql`DELETE FROM activity WHERE member_id=${id} OR connection_id IN (SELECT token_hash FROM invitations WHERE sender_member_id=${id} OR sender_email=${contact})`,
   sql`UPDATE connection_state SET prospect_name='Deleted member',prospect_photo=NULL,prospect_phone=NULL,prospect_email=NULL,prospect_answers='[]'::jsonb,messages='[]'::jsonb,prospect_member_id=NULL,status=CASE WHEN status='invited' THEN status ELSE 'ended' END,ended_at=coalesce(ended_at,now()),ended_by=coalesce(ended_by,'admin'),updated_at=now() WHERE prospect_member_id=${id} OR prospect_email=${contact} OR prospect_phone=${contact}`,
   sql`UPDATE invitations SET recipient_name='Deleted member',recipient_email='' WHERE recipient_email=${contact} AND sender_member_id IS DISTINCT FROM ${id}::uuid`,
   sql`DELETE FROM invitations WHERE sender_member_id=${id} OR sender_email=${contact}`,
   sql`DELETE FROM email_sessions WHERE email=${contact}`,
   sql`DELETE FROM email_codes WHERE email=${contact}`,
   sql`DELETE FROM members WHERE id=${id}`
  ]);
  await ops.log(sql,'admin_delete',{detail:{name}});
  return reply({ok:true});
 }
 if(body.action==='link_report'){
  if(!uuid(id)||!uuid(body.member))return reply({error:'Choose a member to link.'},400);
  const rows=await sql`UPDATE reports SET reported_member_id=${body.member} WHERE id=${id} RETURNING id`;
  if(rows[0])await ops.log(sql,'report_linked',{member:body.member,detail:{report:id}});
  return rows[0]?reply({ok:true}):reply({error:'Report not found.'},404);
 }
 return reply({error:'Unknown action.'},400);
}

async function handler(req){
 const blocked=reviewGate();if(blocked)return blocked;
 if(!process.env.DATABASE_URL)return reply({error:'Admin storage is unavailable.'},503);
 const sql=neon(process.env.DATABASE_URL);
 try{
  await ops.ensureOps(sql);
  if(req.method==='POST'){
   let body;try{body=await req.json()}catch{return reply({error:'Invalid request.'},400)}
   const signedIn=await login(sql,body);if(signedIn)return signedIn;
   if(!ops.readAdmin(req))return reply({error:'Sign in to the admin page.'},401);
   return await act(sql,body);
  }
  if(req.method!=='GET')return reply({error:'Method not allowed.'},405);
  if(!ops.readAdmin(req))return reply({error:'Sign in to the admin page.'},401);
  const data=await view(sql,new URL(req.url));
  return data?reply(data):reply({error:'Not found.'},404);
 }catch(error){console.error('Admin error:',error);return reply({error:'Admin request failed. Try again.'},500)}
}
export default {fetch:handler};
