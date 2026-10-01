import {createHash,randomBytes} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import * as ops from './_ops.mjs';
import {pairBlocked,lockedWrite,targetAllowed} from './_connections.mjs';
import {reinvite} from './_reinvite.mjs';
import {reviewGate} from './_review.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
const validToken=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const validPhoto=s=>typeof s==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s)&&s.length<250000;
const validAnswers=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(x=>Number.isInteger(x)&&x>=0&&x<=2);
const validEmail=s=>typeof s==='string'&&s.length<255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
function cookie(req){return Object.fromEntries((req.headers.get('cookie')||'').split(';').map(x=>x.trim().split('=')))}
async function senderEmail(req,sql){const token=cookie(req).chempat_session;if(!validToken(token))return null;const rows=await sql`SELECT email FROM email_sessions WHERE token_hash=${hash(token)} AND expires_at>now()`;return rows[0]?.email||null}
async function senderMember(req,sql){const token=cookie(req).chempat_member;if(!validToken(token))return null;const rows=await sql`SELECT id FROM members WHERE session_hash=${hash(token)}`;return rows[0]?.id||null}
const claimCookie=id=>`chempat_pair_${id.slice(0,16)}`;
async function connectionRow(sql,id){const rows=await sql`SELECT i.token_hash,i.created_at,i.sender_name,i.sender_photo,i.sender_answers,i.recipient_name,i.recipient_email,i.sender_member_id,i.sender_email,i.channel,i.expires_at,i.intended_member_id,i.intended_email,i.reinvite_from,i.delivery_status,c.claim_hash,c.prospect_member_id,c.prospect_name,c.prospect_photo,c.prospect_answers,c.prospect_phone,c.prospect_email,c.status,c.messages,c.ended_at,c.ended_by,EXISTS(SELECT 1 FROM activity a WHERE a.connection_id=i.token_hash AND ((i.channel='email' AND a.kind='invite_emailed') OR (i.channel='friend' AND a.kind='friend_invited'))) AS invitation_sent FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.token_hash=${id}`;return rows[0]||null}
const friend=row=>row.channel==='friend';
const expired=row=>((row.channel==='qr'&&!row.claim_hash)||((friend(row)||!!row.reinvite_from||!!row.intended_member_id||!!row.intended_email)&&!row.prospect_member_id))&&!(new Date(row.expires_at).getTime()>Date.now());
async function ownInvitation(sql,body,req){
 const token=typeof body==='string'?body:body.token,id=validToken(token)?hash(token):body.id;
 if(!validToken(id))return null;
 const row=await connectionRow(sql,id);if(!row||expired(row))return null;
 const member=await senderMember(req,sql);
 if(!await targetAllowed(sql,row,member))return null;
 // Friend links are previews only. Account binding after explicit acceptance is the sole chat authority.
 if(friend(row))return member&&row.prospect_member_id===member?row:null;
 // A linked account is the recovery authority; neither a forwarded token nor an old claim cookie can take it over.
 if(row.prospect_member_id)return member===row.prospect_member_id?row:null;
 if(!validToken(token))return null;
 if(row.channel==='qr'&&(!row.claim_hash||hash(cookie(req)[claimCookie(row.token_hash)]||'')!==row.claim_hash))return null;
 return row;
}
const closed=row=>!!row.pair_blocked||['ended','declined'].includes(row.status);
const allRevealed=row=>!closed(row)&&['nextResults','secondResults','chatRequested','chat','email','tests'].includes(row.status)&&(row.prospect_answers||[]).length===10&&(row.sender_answers||[]).length===10;
const shared=row=>!closed(row)&&['email','tests'].includes(row.status);
const canChat=row=>!row.pair_blocked&&['chat','secondResults','email','tests'].includes(row.status);
// The old secondResults state already enabled chat. New rounds use an internal
// marker so upgrading preserves access to existing conversations.
const publicStatus=row=>row.pair_blocked?'ended':row.status==='nextResults'?'secondResults':row.status==='secondResults'?'chat':row.status;
function prospectView(row){if(friend(row))return {id:row.token_hash,kind:'friend',invitedAt:row.created_at||null,side:'prospect',name:row.sender_name,photo:row.sender_photo,answers:[],recipientName:'',prospectName:row.prospect_name,prospectPhoto:row.prospect_photo,prospectAnswers:[],prospectPhone:null,prospectEmail:null,status:publicStatus(row),memberSecondDone:false,prospectSecondDone:false,messages:canChat(row)?row.messages:[]};const answers=closed(row)||row.status==='invited'?[]:allRevealed(row)?row.sender_answers:row.sender_answers.slice(0,5);return {id:row.token_hash,invitedAt:row.created_at||null,side:'prospect',name:row.sender_name,photo:row.sender_photo,answers,recipientName:row.recipient_name,prospectName:row.prospect_name,prospectPhoto:row.prospect_photo,prospectAnswers:closed(row)?[]:row.prospect_answers,prospectPhone:null,prospectEmail:shared(row)?row.prospect_email:null,status:publicStatus(row),memberSecondDone:row.sender_answers.length===10,prospectSecondDone:row.prospect_answers.length===10,messages:canChat(row)?row.messages:[]}}
function inboxView(row,side){if(friend(row)){const view=prospectView(row);return {id:row.id||row.token_hash,kind:'friend',channel:'friend',invitedAt:row.created_at||null,side,recipient_name:side==='member'?row.recipient_name:'',recipient_email:null,claimed:!!row.prospect_member_id,prospect_name:row.prospect_name,prospect_photo:row.prospect_photo,prospect_answers:[],prospect_phone:null,prospect_email:null,status:publicStatus(row),memberSecondDone:false,prospectSecondDone:false,own_answers:[],messages:view.messages,...(side==='prospect'?{...view,sender_name:row.sender_name,sender_photo:row.sender_photo,sender_answers:[]}: {})}}const view=prospectView(row),full=allRevealed(row);return {id:row.id||row.token_hash,invitedAt:row.created_at||null,side,recipient_name:row.recipient_name,recipient_email:null,channel:row.channel,claimed:!!row.claimed,prospect_name:row.prospect_name,prospect_photo:row.prospect_photo,prospect_answers:closed(row)?[]:(row.prospect_answers||[]).slice(0,full?10:5),prospect_phone:null,prospect_email:shared(row)?row.prospect_email:null,status:publicStatus(row),memberSecondDone:view.memberSecondDone,prospectSecondDone:view.prospectSecondDone,own_answers:closed(row)?[]:side==='prospect'?row.prospect_answers:row.sender_answers,messages:view.messages,...(side==='prospect'?{...view,sender_name:row.sender_name,sender_photo:row.sender_photo,sender_answers:view.answers}: {})}}
function historyAction(row){
 if(row.blocked_by_me)return 'block';
 if(row.status==='ended'&&row.action==='freeze')return !row.prospect_member_id&&row.ended_by==='member'?'cancel':'freeze';
 if(row.status==='ended'&&row.action==='block')return 'ended';
 if(row.status==='ended')return row.ended_by==='member'&&!row.prospect_member_id?'cancel':'ended';
 if(row.status==='declined')return 'declined';
 if(row.pair_blocked)return 'ended';
 if(expired(row))return 'expired';
 return row.action==='freeze'?'freeze':null;
}
function metadata(row,side,member){
 const action=historyAction(row),other=side==='member'?(row.prospect_member_id||row.intended_member_id):row.sender_member_id;
 const ended=closed(row)||expired(row),historyEmail=side==='member'?(row.recipient_email||(!friend(row)&&(shared(row)||row.history_email_shared)?row.prospect_email:null)||null):null;
 return {invitationDateLabel:(row.invitation_sent||row.delivery_status==='sent')&&(row.channel==='email'||row.channel==='friend'&&!!(row.recipient_email||row.intended_member_id||row.intended_email))?'Sent':'Created',frozenAt:row.frozen_at||null,freezerAction:action,freezerActionAt:action==='block'?row.blocked_at||row.action_at||null:action==='freeze'&&row.status!=='ended'?row.action_at||null:row.ended_at||(action==='expired'?row.expires_at:null)||null,endedAt:row.ended_at||null,endedBy:row.ended_by||null,
  location:row.trashed_at?'trash':action?'freezer':'active',trashedAt:row.trashed_at||null,restoredAt:row.restored_at||null,
  legacyFrozen:!!row.frozen_at&&!ended,canFreeze:!ended&&!row.trashed_at,
  canTrash:ended&&!row.trashed_at,canRestore:!!row.trashed_at,
  canCancel:side==='member'&&row.status==='invited'&&!row.prospect_member_id&&!expired(row)&&!row.pair_blocked,
  canBlock:!!member&&[row.sender_member_id,row.prospect_member_id].includes(member)&&!!other&&other!==member&&!row.blocked_by_me,
  canUnblock:!!row.blocked_by_me,blockedByMe:!!row.blocked_by_me,blockedAt:row.blocked_at||null,
  hasHistoryPhoto:side==='prospect'?!!row.sender_member_id:!!row.prospect_member_id,
  canReport:!!member&&!!other&&other!==member&&!!row.prospect_member_id,
  canReinvite:ended&&!row.trashed_at&&!row.pair_blocked&&!!(other||historyEmail),historyEmail};
}
function historyView(row,side,member){
 return {id:row.id||row.token_hash,kind:friend(row)?'friend':'vibe',channel:row.channel,side,invitedAt:row.created_at||null,status:publicStatus(row),recipient_name:side==='member'?row.recipient_name:'',prospect_name:row.prospect_name,...(side==='prospect'?{sender_name:row.sender_name,name:row.sender_name}:{}),...metadata(row,side,member)};
}
async function privateMetadata(sql,row,side,member){
 if(!member)return row;
 const rows=await sql`SELECT v.frozen_at,v.action,v.action_at,v.trashed_at,v.restored_at,(SELECT b.created_at FROM member_blocks b WHERE b.blocker_id=${member} AND b.blocked_id=${side==='member'?(row.prospect_member_id||row.intended_member_id):row.sender_member_id}) AS blocked_at,EXISTS(SELECT 1 FROM member_blocks b WHERE b.blocker_id=${member} AND b.blocked_id=${side==='member'?(row.prospect_member_id||row.intended_member_id):row.sender_member_id}) AS blocked_by_me,EXISTS(SELECT 1 FROM activity a WHERE a.connection_id=${row.token_hash} AND a.kind='email_shared') AS history_email_shared FROM (SELECT 1) unused LEFT JOIN connection_visibility v ON v.member_id=${member} AND v.invitation_hash=${row.token_hash}`;
 return {...row,...rows[0],pair_blocked:await pairBlocked(sql,row.sender_member_id,row.prospect_member_id||row.intended_member_id)};
}
async function actionView(sql,id,side,member){
 const row=await connectionRow(sql,id),own=await privateMetadata(sql,row,side,member);
 return historyAction(own)?historyView(own,side,member):{...inboxView(own,side),...metadata(own,side,member)};
}
async function listConnections(sql,{member,sender,cursor=null,historyOnly=false,trashOnly=false}){
 let before=null,beforeId=null;
 if(cursor){try{const parts=JSON.parse(Buffer.from(cursor,'base64url').toString());if(!Array.isArray(parts)||parts.length!==2||!Number.isFinite(Date.parse(parts[0]))||!validToken(parts[1]))throw Error();[before,beforeId]=parts}catch{return null}}
 const ownership=`(i.sender_member_id=$1 OR c.prospect_member_id=$1 OR (i.sender_member_id IS NULL AND i.sender_email=$2))`;
 const isHistory=`(v.frozen_at IS NOT NULL OR c.status IN ('ended','declined') OR EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_id=i.sender_member_id AND b.blocked_id=coalesce(c.prospect_member_id,i.intended_member_id)) OR (b.blocked_id=i.sender_member_id AND b.blocker_id=coalesce(c.prospect_member_id,i.intended_member_id))) OR (i.channel='qr' AND c.claim_hash IS NULL OR (i.channel='friend' OR i.reinvite_from IS NOT NULL OR i.intended_member_id IS NOT NULL OR i.intended_email IS NOT NULL) AND c.prospect_member_id IS NULL) AND coalesce(i.expires_at<=now(),true))`;
 const common=`FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash LEFT JOIN connection_visibility v ON v.invitation_hash=i.token_hash AND v.member_id=$1 WHERE ${ownership} AND (i.channel<>'friend' OR c.status<>'declined' OR c.claim_hash IS NULL) AND ${trashOnly?'v.trashed_at IS NOT NULL':'v.trashed_at IS NULL'}`;
 const fields=`i.token_hash AS id,i.token_hash,i.created_at,i.created_at::text AS cursor_created_at,i.expires_at,i.sender_name,i.sender_member_id,i.recipient_name,i.recipient_email,i.channel,i.intended_member_id,i.intended_email,i.reinvite_from,i.delivery_status,c.claim_hash,c.prospect_member_id,c.prospect_name,c.status,c.ended_at,c.ended_by,v.frozen_at,v.action,v.action_at,v.trashed_at,v.restored_at,(SELECT b.created_at FROM member_blocks b WHERE b.blocker_id=$1 AND b.blocked_id=CASE WHEN i.sender_member_id=$1 THEN coalesce(c.prospect_member_id,i.intended_member_id) ELSE i.sender_member_id END) AS blocked_at,EXISTS(SELECT 1 FROM activity a WHERE a.connection_id=i.token_hash AND ((i.channel='email' AND a.kind='invite_emailed') OR (i.channel='friend' AND a.kind='friend_invited'))) AS invitation_sent,EXISTS(SELECT 1 FROM member_blocks b WHERE b.blocker_id=$1 AND b.blocked_id=CASE WHEN i.sender_member_id=$1 THEN coalesce(c.prospect_member_id,i.intended_member_id) ELSE i.sender_member_id END) AS blocked_by_me,EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_id=i.sender_member_id AND b.blocked_id=coalesce(c.prospect_member_id,i.intended_member_id)) OR (b.blocked_id=i.sender_member_id AND b.blocker_id=coalesce(c.prospect_member_id,i.intended_member_id))) AS pair_blocked`;
 const active=historyOnly||trashOnly?[]:await sql.query(`SELECT ${fields},i.sender_photo,i.sender_answers,c.prospect_photo,c.prospect_answers,c.prospect_phone,c.prospect_email,c.messages,(c.claim_hash IS NOT NULL) AS claimed ${common} AND NOT ${isHistory} ORDER BY i.created_at DESC,i.token_hash DESC LIMIT 50`,[member,sender||'']);
 const history=await sql.query(`SELECT ${fields},CASE WHEN i.channel<>'friend' AND (c.status IN ('email','tests') OR EXISTS(SELECT 1 FROM activity a WHERE a.connection_id=i.token_hash AND a.kind='email_shared')) THEN c.prospect_email ELSE NULL END AS prospect_email,EXISTS(SELECT 1 FROM activity a WHERE a.connection_id=i.token_hash AND a.kind='email_shared') AS history_email_shared ${common} AND ${isHistory} AND ($3::timestamptz IS NULL OR (i.created_at,i.token_hash)<($3::timestamptz,$4::text)) ORDER BY i.created_at DESC,i.token_hash DESC LIMIT 51`,[member,sender||'',before,beforeId]);
 const page=history.slice(0,50),last=page.at(-1);
 return {connections:[...active.map(r=>{const side=member&&r.prospect_member_id===member?'prospect':'member';return {...inboxView(r,side),...metadata(r,side,member)}}),...page.map(r=>historyView(r,member&&r.prospect_member_id===member?'prospect':'member',member))],[trashOnly?'trashCursor':'freezerCursor']:history.length>50?Buffer.from(JSON.stringify([last.cursor_created_at,last.token_hash])).toString('base64url'):null};
}
async function participant(sql,body,req,{history=false}={}){
 if(body.token){const row=await ownInvitation(sql,body,req);return row?{row,id:row.token_hash,invitedAt:row.created_at||null,side:'prospect'}:null}
 if(!validToken(body.id))return null;
 const row=await connectionRow(sql,body.id);if(!row||(!history&&expired(row)))return null;
 const member=await senderMember(req,sql),email=await senderEmail(req,sql);
 if(friend(row)){if(!member)return null;if(member===row.prospect_member_id)return {row,id:body.id,side:'prospect'};return member===row.sender_member_id?{row,id:body.id,side:'member'}:null}
 if(member&&row.prospect_member_id===member)return {row,id:body.id,side:'prospect'};
 if(member&&row.sender_member_id===member||!row.sender_member_id&&email&&row.sender_email===email)return {row,id:body.id,side:'member'};
 return null;
}
async function handler(req){
 const blocked=reviewGate();if(blocked)return blocked;
 if(!process.env.DATABASE_URL)return reply({error:'Connection storage is unavailable.'},503);
 const sql=neon(process.env.DATABASE_URL);
 try{
  const url=new URL(req.url);
  if(req.method==='GET'){
   const token=url.searchParams.get('invite');
   if(token){
    if(!validToken(token))return reply({error:'Invitation not found.'},404);
    const id=hash(token);
    let row=await connectionRow(sql,id);if(!row)return reply({error:'Invitation not found.'},404);
    const viewer=await senderMember(req,sql);
    if(!viewer&&(row.intended_member_id||row.intended_email))return reply({error:'Sign in or create your member page to open this invitation.',requiresSignIn:true},401);
    if(!await targetAllowed(sql,row,viewer))return reply({error:'Open the member page this invitation was sent to.'},403);
    if(closed(row)||expired(row))return reply({error:'This invitation is closed. Ask for a fresh invitation.'},410);
    if(await pairBlocked(sql,row.sender_member_id,row.prospect_member_id||row.intended_member_id||viewer))return reply({error:'This connection is unavailable.'},403);
    if(friend(row)){const own=await ownInvitation(sql,token,req);return own?reply({...prospectView(own),...metadata(await privateMetadata(sql,own,'prospect',viewer),'prospect',viewer)}):reply({error:'Open your linked member page to see this friend connection.'},403)}
    if(row.prospect_member_id){const own=await ownInvitation(sql,token,req);return own?reply({...prospectView(own),...metadata(await privateMetadata(sql,own,'prospect',viewer),'prospect',viewer)}):reply({error:'Sign in to the member page linked to this connection.'},403)}
    if(row.channel!=='qr')return reply(prospectView(row));
    const guest=cookie(req)[claimCookie(id)];
    if(row.claim_hash)return guest&&hash(guest)===row.claim_hash?reply(prospectView(row)):reply({error:'This code is already in play on another phone.'},409);
    if(new Date(row.expires_at).getTime()<=Date.now())return reply({error:'This code expired. Ask for a fresh one.'},410);
    const member=await senderMember(req,sql);
    if(member&&member===row.sender_member_id)return reply({error:'Show this code to the other person on their phone.'},409);
    const claim=randomBytes(32).toString('hex');
    const claimed=await lockedWrite(sql,id,member,tx=>tx`UPDATE connection_state SET claim_hash=${hash(claim)},updated_at=now() WHERE invitation_hash=${id} AND claim_hash IS NULL AND status='invited' AND EXISTS (SELECT 1 FROM invitations WHERE token_hash=${id} AND expires_at>now()) RETURNING claim_hash`);
    if(!claimed[0])return reply({error:'This code is already in play or has expired.'},409);
    await ops.log(sql,'qr_scanned',{member:row.sender_member_id,connection:id});
    return Response.json(prospectView(row),{headers:{'cache-control':'no-store','set-cookie':`${claimCookie(id)}=${claim}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=15552000`}});
   }
   if(url.searchParams.has('inbox')||url.searchParams.has('freezer')||url.searchParams.has('trash')){
    const sender=await senderEmail(req,sql),member=await senderMember(req,sql);
    if(cookie(req).chempat_member&&!member)return reply({error:'Your sign-in expired. Sign in again to see your connections.',sessionExpired:true},401);
    if(!sender&&!member)return reply({error:'Open your member page to see connections.'},401);
    const result=await listConnections(sql,{member,sender,cursor:url.searchParams.get('cursor'),historyOnly:url.searchParams.has('freezer'),trashOnly:url.searchParams.has('trash')});
    return result?reply(result):reply({error:'Invalid history cursor.'},400);
   }
   return reply({error:'Missing connection.'},400);
  }
  if(req.method!=='POST')return reply({error:'Method not allowed.'},405);
  let body;try{body=await req.json()}catch{return reply({error:'Invalid request.'},400)}
  if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'Invalid request.'},400);
  const actor=await senderMember(req,sql);
  if(!actor&&!['unmatch','report','cancel'].includes(body.action))return reply({error:'Open your member page to continue.'},401);
  if(!['unmatch','report','cancel','freeze','unfreeze','block','trash','restore','unblock'].includes(body.action)){const paused=await ops.standing(sql,actor);if(paused)return reply(paused,403)}
  // Scanners can reveal their first five before confirming their email; everything after needs it.
  if(['request','decision','message','react','second','email','chat'].includes(body.action)){const unproven=await ops.requireVerified(sql,actor);if(unproven)return reply(unproven,403)}
  if(!['unmatch','report','cancel','freeze','unfreeze','block','trash','restore','unblock'].includes(body.action)){
   const target=validToken(body.token)?hash(body.token):body.id;
   const row=validToken(target)?await connectionRow(sql,target):null;
   if(row&&row.sender_member_id!==actor&&!await targetAllowed(sql,row,actor))return reply({error:'Open the member page this invitation was sent to.'},403);
   if(row&&await pairBlocked(sql,row.sender_member_id,row.prospect_member_id||row.intended_member_id||actor))return reply({error:'This connection is unavailable.'},403);
  }
  // Derive connection kind from storage so client fields cannot unlock romantic actions for friends.
  if(['first','request','decision','second','chat','email'].includes(body.action)){
   const target=validToken(body.token)?hash(body.token):body.id;
   const row=validToken(target)?await connectionRow(sql,target):null;
   if(row&&friend(row))return reply({error:'Friends connect through their friend invitation. Romantic sharing is unavailable here.'},409);
  }
  if(['cancel','freeze','unfreeze','block','trash','restore','unblock','prepareReinvite','reinvite'].includes(body.action)){
   const who=await participant(sql,body,req,{history:true});
   if(!who)return reply({error:'Connection not found.'},404);
   const {row,id,side}=who;
   if(['prepareReinvite','reinvite'].includes(body.action)){
    const unproven=await ops.requireVerified(sql,actor);if(unproven)return reply(unproven,403);
    const result=await reinvite(sql,{body,req,row:await privateMetadata(sql,row,side,actor),side,actor,ops});
    return reply(result.body,result.status);
   }
   if(body.action==='unfreeze')return reply({error:'A frozen interaction cannot be reopened. Send a fresh invitation from the Freezer.'},409);
   if(body.action==='cancel'){
    if(side!=='member')return reply({error:'Only the sender can cancel an invitation.'},403);
    const results=await sql.transaction(tx=>[
     tx`SELECT id FROM members WHERE id=${actor} OR id IN (SELECT sender_member_id FROM invitations WHERE token_hash=${id} UNION SELECT prospect_member_id FROM connection_state WHERE invitation_hash=${id}) ORDER BY id FOR UPDATE`,
     tx`UPDATE connection_state SET status='ended',ended_at=now(),ended_by='member',updated_at=now() WHERE invitation_hash=${id} AND status='invited' AND prospect_member_id IS NULL AND EXISTS(SELECT 1 FROM invitations i WHERE i.token_hash=${id} AND NOT ((i.channel='friend' OR i.intended_member_id IS NOT NULL OR i.intended_email IS NOT NULL OR i.channel='qr' AND connection_state.claim_hash IS NULL) AND coalesce(i.expires_at<=now(),true))) RETURNING invitation_hash`,
     ...(actor?[tx`INSERT INTO connection_visibility(member_id,invitation_hash,frozen_at,action,action_at) SELECT ${actor},c.invitation_hash,c.ended_at,'cancel',c.ended_at FROM connection_state c WHERE c.invitation_hash=${id} AND c.status='ended' AND c.ended_by='member' AND c.prospect_member_id IS NULL AND c.ended_at IS NOT NULL ON CONFLICT(member_id,invitation_hash) DO UPDATE SET frozen_at=excluded.frozen_at,action=excluded.action,action_at=excluded.action_at RETURNING invitation_hash`]:[])
    ],{isolationLevel:'ReadCommitted'});
    if(!results[1][0]&&!(row.status==='ended'&&row.ended_by==='member'&&!row.prospect_member_id))return reply({error:'This invitation was already accepted or is no longer pending.'},409);
   }else if(body.action==='block'||body.action==='unblock'){
    const other=side==='member'?(row.prospect_member_id||row.intended_member_id):row.sender_member_id;
    if(!actor||!other||actor===other||![row.sender_member_id,row.prospect_member_id].includes(actor))return reply({error:'This person has not connected with an identified member account. You can cancel or freeze the invitation.'},409);
    if(body.action==='unblock'){
     await sql.transaction(tx=>[
      tx`SELECT id FROM members WHERE id IN (${actor},${other}) ORDER BY id FOR UPDATE`,
      tx`DELETE FROM member_blocks WHERE blocker_id=${actor} AND blocked_id=${other} RETURNING blocker_id`
     ],{isolationLevel:'ReadCommitted'});
    }else await sql.transaction(tx=>[
     tx`SELECT id FROM members WHERE id IN (${actor},${other}) ORDER BY id FOR UPDATE`,
     tx`INSERT INTO member_blocks(blocker_id,blocked_id) SELECT ${actor},${other} FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.token_hash=${id} AND ((i.sender_member_id=${actor} AND coalesce(c.prospect_member_id,i.intended_member_id)=${other}) OR (i.sender_member_id=${other} AND c.prospect_member_id=${actor})) ON CONFLICT(blocker_id,blocked_id) DO NOTHING RETURNING blocker_id`,
     tx`WITH shared_history AS (INSERT INTO activity(kind,connection_id) SELECT 'email_shared',i.token_hash FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.channel<>'friend' AND c.status IN ('email','tests') AND c.prospect_email IS NOT NULL AND ((i.sender_member_id=${actor} AND (coalesce(c.prospect_member_id,i.intended_member_id)=${other} OR c.prospect_member_id IS NULL AND i.intended_member_id IS NULL AND EXISTS(SELECT 1 FROM members target WHERE target.id=${other} AND target.email_verified_at IS NOT NULL AND lower(target.contact) IN (lower(i.intended_email),lower(i.recipient_email))))) OR (i.sender_member_id=${other} AND (coalesce(c.prospect_member_id,i.intended_member_id)=${actor} OR c.prospect_member_id IS NULL AND i.intended_member_id IS NULL AND EXISTS(SELECT 1 FROM members target WHERE target.id=${actor} AND target.email_verified_at IS NOT NULL AND lower(target.contact) IN (lower(i.intended_email),lower(i.recipient_email)))))) AND NOT EXISTS(SELECT 1 FROM activity a WHERE a.connection_id=i.token_hash AND a.kind='email_shared') RETURNING connection_id) UPDATE connection_state c SET status='ended',ended_at=coalesce(c.ended_at,now()),ended_by=coalesce(c.ended_by,CASE WHEN i.sender_member_id=${actor} THEN 'member' ELSE 'prospect' END),updated_at=now() FROM invitations i WHERE i.token_hash=c.invitation_hash AND c.status NOT IN ('ended','declined') AND ((i.sender_member_id=${actor} AND (coalesce(c.prospect_member_id,i.intended_member_id)=${other} OR c.prospect_member_id IS NULL AND i.intended_member_id IS NULL AND EXISTS(SELECT 1 FROM members target WHERE target.id=${other} AND target.email_verified_at IS NOT NULL AND lower(target.contact) IN (lower(i.intended_email),lower(i.recipient_email))))) OR (i.sender_member_id=${other} AND (coalesce(c.prospect_member_id,i.intended_member_id)=${actor} OR c.prospect_member_id IS NULL AND i.intended_member_id IS NULL AND EXISTS(SELECT 1 FROM members target WHERE target.id=${actor} AND target.email_verified_at IS NOT NULL AND lower(target.contact) IN (lower(i.intended_email),lower(i.recipient_email)))))) AND EXISTS(SELECT 1 FROM member_blocks WHERE blocker_id=${actor} AND blocked_id=${other}) RETURNING c.invitation_hash`,
     tx`INSERT INTO connection_visibility(member_id,invitation_hash,frozen_at,action,action_at) SELECT ${actor},i.token_hash,now(),'block',now() FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE ((i.sender_member_id=${actor} AND (coalesce(c.prospect_member_id,i.intended_member_id)=${other} OR c.prospect_member_id IS NULL AND i.intended_member_id IS NULL AND EXISTS(SELECT 1 FROM members target WHERE target.id=${other} AND target.email_verified_at IS NOT NULL AND lower(target.contact) IN (lower(i.intended_email),lower(i.recipient_email))))) OR (i.sender_member_id=${other} AND (coalesce(c.prospect_member_id,i.intended_member_id)=${actor} OR c.prospect_member_id IS NULL AND i.intended_member_id IS NULL AND EXISTS(SELECT 1 FROM members target WHERE target.id=${actor} AND target.email_verified_at IS NOT NULL AND lower(target.contact) IN (lower(i.intended_email),lower(i.recipient_email)))))) AND EXISTS(SELECT 1 FROM member_blocks WHERE blocker_id=${actor} AND blocked_id=${other}) ON CONFLICT(member_id,invitation_hash) DO UPDATE SET frozen_at=coalesce(connection_visibility.frozen_at,excluded.frozen_at),action='block',action_at=CASE WHEN connection_visibility.action='block' THEN connection_visibility.action_at ELSE excluded.action_at END RETURNING invitation_hash`
    ],{isolationLevel:'ReadCommitted'});
   }else if(body.action==='trash'||body.action==='restore'){
    if(body.action==='restore'&&!closed(row)&&!expired(row))return reply({error:'Only a closed invitation can be restored to the Freezer.'},409);
    if(!actor||![row.sender_member_id,row.prospect_member_id].includes(actor))return reply({error:'Open your linked member page to manage your history.'},401);
    if(body.action==='trash'){
     const result=await sql.transaction(tx=>[
      tx`SELECT id FROM members WHERE id=${actor} OR id IN (SELECT sender_member_id FROM invitations WHERE token_hash=${id} UNION SELECT prospect_member_id FROM connection_state WHERE invitation_hash=${id}) ORDER BY id FOR UPDATE`,
      tx`INSERT INTO connection_visibility(member_id,invitation_hash,frozen_at,action,action_at,trashed_at) SELECT ${actor},i.token_hash,NULL,'unfreeze',now(),now() FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.token_hash=${id} AND (i.sender_member_id=${actor} OR c.prospect_member_id=${actor}) AND (c.status IN ('ended','declined') OR ((i.channel='qr' AND c.claim_hash IS NULL OR (i.channel='friend' OR i.reinvite_from IS NOT NULL OR i.intended_member_id IS NOT NULL OR i.intended_email IS NOT NULL) AND c.prospect_member_id IS NULL) AND coalesce(i.expires_at<=now(),true)) OR EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_id=i.sender_member_id AND b.blocked_id=coalesce(c.prospect_member_id,i.intended_member_id)) OR (b.blocked_id=i.sender_member_id AND b.blocker_id=coalesce(c.prospect_member_id,i.intended_member_id)))) ON CONFLICT(member_id,invitation_hash) DO UPDATE SET trashed_at=coalesce(connection_visibility.trashed_at,excluded.trashed_at) RETURNING invitation_hash`
     ],{isolationLevel:'ReadCommitted'});
     if(!result[1][0])return reply({error:'Freeze this connection before moving it to Trash.'},409);
    }else{
     await sql.transaction(tx=>[
      tx`SELECT id FROM members WHERE id=${actor} ORDER BY id FOR UPDATE`,
      tx`UPDATE connection_visibility SET trashed_at=NULL,restored_at=now() WHERE member_id=${actor} AND invitation_hash=${id} AND trashed_at IS NOT NULL RETURNING invitation_hash`
     ],{isolationLevel:'ReadCommitted'});
    }
   }else{
    if(!actor||![row.sender_member_id,row.prospect_member_id].includes(actor))return reply({error:'Open your linked member page to manage the Freezer.'},401);
    const current=await privateMetadata(sql,row,side,actor);
    if(current.trashed_at)return reply({error:'Restore this invitation to the Freezer first.'},409);
    if(closed(current)||expired(current)){
     if(row.status==='ended'&&current.action==='freeze')return reply({ok:true,connection:await actionView(sql,id,side,actor)});
     return reply({error:'This interaction is already closed.'},409);
    }
    const frozen=await sql.transaction(tx=>[
     tx`SELECT id FROM members WHERE id=${actor} OR id IN (SELECT sender_member_id FROM invitations WHERE token_hash=${id} UNION SELECT prospect_member_id FROM connection_state WHERE invitation_hash=${id}) ORDER BY id FOR UPDATE`,
     tx`WITH shared_history AS (INSERT INTO activity(kind,connection_id) SELECT 'email_shared',i.token_hash FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.token_hash=${id} AND i.channel<>'friend' AND c.status IN ('email','tests') AND c.prospect_email IS NOT NULL AND NOT EXISTS(SELECT 1 FROM activity a WHERE a.connection_id=i.token_hash AND a.kind='email_shared') RETURNING connection_id) UPDATE connection_state c SET status='ended',ended_at=coalesce(c.ended_at,now()),ended_by=coalesce(c.ended_by,${side}),updated_at=now() FROM invitations i WHERE c.invitation_hash=${id} AND i.token_hash=c.invitation_hash AND c.status NOT IN ('ended','declined') AND (i.sender_member_id=${actor} OR c.prospect_member_id=${actor}) AND NOT ((i.channel='qr' AND c.claim_hash IS NULL OR (i.channel='friend' OR i.reinvite_from IS NOT NULL OR i.intended_member_id IS NOT NULL OR i.intended_email IS NOT NULL) AND c.prospect_member_id IS NULL) AND coalesce(i.expires_at<=now(),true)) AND NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_id=i.sender_member_id AND b.blocked_id=coalesce(c.prospect_member_id,i.intended_member_id)) OR (b.blocked_id=i.sender_member_id AND b.blocker_id=coalesce(c.prospect_member_id,i.intended_member_id))) RETURNING c.invitation_hash`,
     tx`INSERT INTO connection_visibility(member_id,invitation_hash,frozen_at,action,action_at) SELECT ${actor},c.invitation_hash,c.ended_at,'freeze',c.ended_at FROM connection_state c WHERE c.invitation_hash=${id} AND c.status='ended' AND c.ended_by=${side} AND c.ended_at=now() ON CONFLICT(member_id,invitation_hash) DO UPDATE SET frozen_at=coalesce(connection_visibility.frozen_at,excluded.frozen_at),action='freeze',action_at=excluded.action_at WHERE connection_visibility.action IN ('freeze','unfreeze') RETURNING invitation_hash`
    ],{isolationLevel:'ReadCommitted'});
    if(!frozen[1][0])return reply({error:'This connection is no longer available to freeze.'},409);
   }
   await ops.log(sql,body.action,{member:actor,connection:id});
   return reply({ok:true,connection:await actionView(sql,id,side,actor)});
  }
  if(body.action==='first'){
   const row=await ownInvitation(sql,body,req);
   if(!row)return reply({error:'Invitation not found.'},404);
   if(!validAnswers(body.answers,5)||!validPhoto(body.photo))return reply({error:'Complete your five answers and add a picture.'},400);
   if(row.status!=='invited')return reply({error:'This invitation has moved on.'},409);
   const memberToken=cookie(req).chempat_member;
   const prospect=await senderMember(req,sql);
   if(!prospect||prospect===row.sender_member_id)return reply({error:'Open your own member page to reveal your five.'},401);
   const visitor=validToken(memberToken)?await sql`SELECT name FROM members WHERE session_hash=${hash(memberToken)}`:[];
   const visitorName=visitor[0]?.name||row.recipient_name;
   if(!visitorName)return reply({error:'Finish your member page to reveal your five.'},400);
   const updated=await lockedWrite(sql,row.token_hash,actor,tx=>tx`UPDATE connection_state SET prospect_name=${visitorName},prospect_photo=${body.photo},prospect_answers=${JSON.stringify(body.answers)}::jsonb,prospect_member_id=${prospect},status='firstResults',updated_at=now() WHERE invitation_hash=${row.token_hash} AND status=${row.status} RETURNING status`);
   if(!updated[0])return reply({error:'This connection has moved on.'},409);
   await ops.log(sql,'first_five',{member:actor,connection:row.token_hash});
   return reply({ok:true,answers:row.sender_answers.slice(0,5)});
  }
  if(body.action==='request'){
   const row=await ownInvitation(sql,body,req),name=String(body.name||'').trim(),contact=String(body.contact||body.phone||'').trim().toLowerCase();
   if(!row)return reply({error:'Invitation not found.'},404);
   const isEmail=validEmail(contact),isCell=ops.CELL_ENABLED&&!isEmail&&contact.length<=30&&contact.replace(/\D/g,'').length>=10;
   if(row.status!=='firstResults'||name.length<1||name.length>50||(!isEmail&&!isCell)||!validPhoto(body.photo))return reply({error:ops.CELL_ENABLED?'Add your name, picture, and an email or ten-digit cell number.':'Add your name, picture, and email.'},400);
   const updated=await lockedWrite(sql,row.token_hash,actor,tx=>tx`UPDATE connection_state SET prospect_name=${name},prospect_phone=${isCell?contact:null},prospect_email=${isEmail?contact:null},prospect_photo=${body.photo},prospect_member_id=coalesce(prospect_member_id,${actor}),status='request',updated_at=now() WHERE invitation_hash=${row.token_hash} AND status=${row.status} RETURNING status`);
   if(!updated[0])return reply({error:'This connection has moved on.'},409);
   await ops.log(sql,'request',{member:actor,connection:row.token_hash});
   return reply({ok:true});
  }
  if(body.action==='decision'){
   const who=await participant(sql,body,req);
   if(!who||who.side!=='member')return reply({error:'Connection not found.'},404);
   if(!['accept','decline'].includes(body.decision))return reply({error:'Invalid decision.'},400);
   if(!['request','chatRequested'].includes(who.row.status))return reply({error:'Request no longer pending.'},409);
   const next=body.decision==='decline'?'declined':who.row.status==='request'?'secondFive':'chat';
   const rows=await lockedWrite(sql,who.id,actor,tx=>tx`UPDATE connection_state SET status=${next},updated_at=now() WHERE invitation_hash=${who.id} AND status=${who.row.status} RETURNING status`);
   if(rows[0])await ops.log(sql,body.decision==='accept'?'accept':'pass',{member:actor,connection:who.id});
   return rows[0]?reply({ok:true,status:rows[0].status}):reply({error:'Request no longer pending.'},409);
  }
  if(body.action==='chat'){
   const row=await ownInvitation(sql,body,req);if(!row)return reply({error:'Connection not found.'},404);
   if(row.status!=='nextResults'||(row.prospect_answers.length!==10||row.sender_answers.length!==10))return reply({error:'Finish both rounds before choosing chat.'},409);
   const rows=await lockedWrite(sql,row.token_hash,actor,tx=>tx`UPDATE connection_state SET status='chatRequested',updated_at=now() WHERE invitation_hash=${row.token_hash} AND status='nextResults' RETURNING status`);
   return rows[0]?reply({ok:true,status:'chatRequested'}):reply({error:'This connection has moved on.'},409);
  }

  if(body.action==='second'){
   const who=await participant(sql,body,req);if(!who)return reply({error:'Invitation not found.'},404);
   const {row,id,side}=who,previous=side==='member'?row.sender_answers:row.prospect_answers;
   const repeated=previous.length===10&&validAnswers(body.answers,10)&&body.answers.every((a,i)=>a===previous[i]);
   if(!validAnswers(body.answers,10)||body.answers.slice(0,5).some((a,i)=>a!==previous[i])||(!repeated&&(!['secondFive','chat'].includes(row.status)||previous.length!==5))||!['secondFive','nextResults','chatRequested','chat','secondResults','email','tests'].includes(row.status))return reply({error:'Complete the next five in order.'},400);
   // Both writers serialize through the connection row. The separate finalization
   // statement gets a fresh snapshot, so concurrent completions cannot strand it.
   const saved=repeated?[{alreadySaved:true}]:side==='member'
    ?await lockedWrite(sql,id,actor,tx=>tx`WITH locked AS (SELECT invitation_hash FROM connection_state WHERE invitation_hash=${id} AND status IN ('secondFive','chat') FOR UPDATE) UPDATE invitations i SET sender_answers=${JSON.stringify(body.answers)}::jsonb FROM locked c WHERE i.token_hash=c.invitation_hash AND jsonb_array_length(i.sender_answers)=5 RETURNING i.token_hash`)
    :await lockedWrite(sql,id,actor,tx=>tx`UPDATE connection_state SET prospect_answers=${JSON.stringify(body.answers)}::jsonb,updated_at=now() WHERE invitation_hash=${id} AND status IN ('secondFive','chat') AND jsonb_array_length(prospect_answers)=5 RETURNING invitation_hash`);
   if(!saved[0])return reply({error:'This connection has moved on.'},409);
   await lockedWrite(sql,id,actor,tx=>tx`UPDATE connection_state c SET status=CASE WHEN c.status='chat' THEN 'chat' ELSE 'nextResults' END,updated_at=now() FROM invitations i WHERE c.invitation_hash=i.token_hash AND c.invitation_hash=${id} AND c.status IN ('secondFive','chat') AND jsonb_array_length(i.sender_answers)=10 AND jsonb_array_length(c.prospect_answers)=10 RETURNING c.status`);
   const latest=await connectionRow(sql,id);if(!latest||closed(latest))return reply({error:'This connection has ended.'},409);
   await ops.log(sql,'next_five',{member:actor,connection:id,detail:{side}});
   const other=side==='member'?latest.prospect_answers:latest.sender_answers;
   return reply({ok:true,status:publicStatus(latest),answers:other.slice(0,allRevealed(latest)?10:5),memberSecondDone:latest.sender_answers.length===10,prospectSecondDone:latest.prospect_answers.length===10});
  }
  if(body.action==='email'){
   const row=await ownInvitation(sql,body,req),address=String(body.email||'').trim().toLowerCase();
   if(!row)return reply({error:'Invitation not found.'},404);
   if(!['chat','secondResults','email','tests'].includes(row.status)||row.prospect_answers.length!==10||row.sender_answers.length!==10||!validEmail(address))return reply({error:'Choose chat together before sharing your email.'},400);
   const updated=await lockedWrite(sql,row.token_hash,actor,tx=>tx`UPDATE connection_state SET prospect_email=${address},status='email',updated_at=now() WHERE invitation_hash=${row.token_hash} AND status=${row.status} RETURNING status`);
   if(!updated[0])return reply({error:'This connection has moved on.'},409);
   await ops.log(sql,'email_shared',{member:actor,connection:row.token_hash});
   return reply({ok:true});
  }
  if(body.action==='message'||body.action==='react'){
   const who=await participant(sql,body,req);if(!who)return reply({error:'Connection not found.'},404);
   const {id,side:by,row}=who;if(!canChat(row))return reply({error:'Chat is not open yet.'},409);
   if(body.action==='react'){
    const index=body.index,reaction=body.reaction;
    if(!Number.isInteger(index)||index<0||index>=1000||!['like','dislike',null].includes(reaction))return reply({error:'Choose a message reaction.'},400);
    const rows=await lockedWrite(sql,id,actor,tx=>tx`UPDATE connection_state SET messages=jsonb_set(messages,ARRAY[${String(index)}]::text[],(messages->${index}::int) || jsonb_build_object('reactions',coalesce(messages->${index}::int->'reactions','{}'::jsonb) || jsonb_build_object(${by}::text,${reaction}::text)),false),updated_at=now() WHERE invitation_hash=${id} AND status IN ('chat','secondResults','email','tests') AND jsonb_array_length(messages)>${index} RETURNING messages`);
    return rows[0]?reply({messages:rows[0].messages}):reply({error:'Message no longer available.'},409);
   }
   const message=String(body.text||'').trim(),photo=body.photo||null;
   if(message.length>500||photo&&!validPhoto(photo)||!message&&!photo)return reply({error:'Send a message under 500 characters or a photo.'},400);
   const item={by,text:message,at:new Date().toISOString(),...(photo?{photo}:{})};
   const rows=await lockedWrite(sql,id,actor,tx=>tx`UPDATE connection_state SET messages=messages || ${JSON.stringify([item])}::jsonb,updated_at=now() WHERE invitation_hash=${id} AND status IN ('chat','secondResults','email','tests') RETURNING messages`);
   if(rows[0])await ops.log(sql,'message',{member:actor,connection:id,detail:{by,length:message.length,photo:!!photo}});
   return rows[0]?reply({messages:rows[0].messages}):reply({error:'Chat is not open yet.'},409);
  }
  if(body.action==='unmatch'||body.action==='report'){
   const who=await participant(sql,body,req,{history:true});if(!who)return reply({error:'Connection not found.'},404);
   const {id,side}=who;
   const result=await ops.endConnection(sql,{id,side,actorId:actor,report:body.action==='report'?{reason:body.reason,note:body.note}:null});
   return reply(result.body,result.status);
  }
  return reply({error:'Unknown action.'},400);
 }catch(e){console.error('Connection error:',e);return reply({error:'Could not update the connection. Try again.'},500)}
}
export default {fetch:handler};
