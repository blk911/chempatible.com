import {createHash,randomBytes} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import * as ops from './_ops.mjs';
import {pairBlocked,reserveInvitation,deliveryBlocked,targetAllowed} from './_connections.mjs';
import {reviewGate,requireReviewRecipient} from './_review.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const reply=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
const validToken=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const validPhoto=value=>typeof value==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)&&value.length<250000;
const validName=value=>typeof value==='string'&&value.trim().length>0&&value.length<=50;
const validEmail=value=>typeof value==='string'&&value.length<255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const first=value=>String(value).trim().split(/\s+/)[0];
export async function sendFriendMail(to,recipientName,senderName,senderPhoto,link){
 requireReviewRecipient(to);
 const senderFirst=first(senderName),recipientFirst=first(recipientName),safeSender=escape(senderFirst),safeRecipient=escape(recipientFirst);
 const html=`<div style="font-family:Arial,sans-serif;max-width:440px;margin:auto;color:#17262e;text-align:center;padding:22px 12px"><p style="font-size:12px;letter-spacing:2px;color:#7440b3;font-weight:bold">Duh <em>Wild</em> · FRIEND INVITATION</p><img src="cid:inviter-photo" width="160" height="160" alt="${safeSender}" style="width:160px;height:160px;object-fit:cover;border-radius:18px"><p style="font-size:14px;letter-spacing:1px;font-weight:bold;color:#7440b3;margin:18px 0 5px">HEY ${safeRecipient}</p><h1 style="font-size:31px;line-height:1.12;margin:7px 0 16px">Come try Duh Wild with me.</h1><p style="font-size:17px;line-height:1.5;margin:0 0 22px">Connect as friends and open a private chat. No dating questions required.</p><a href="${link}" style="display:inline-block;background:#7440b3;color:#fff;padding:16px 25px;border-radius:9px;text-decoration:none;font-weight:bold;font-size:16px">CONNECT AS FRIENDS →</a><p style="font-size:14px;color:#53656e;margin-top:24px">— ${safeSender}</p></div>`;
 const text=`Hey ${recipientFirst},\n\nCome try Duh Wild with me. Connect as friends and open a private chat. No dating questions required.\n\n${link}\n\n— ${senderFirst}`;
 const body={personalizations:[{to:[{email:to}]}],from:{email:'hello@chempatible.com',name:'Duh Wild'},subject:`${senderFirst} invited you to Duh Wild`,content:[{type:'text/plain',value:text},{type:'text/html',value:html}],attachments:[{content:senderPhoto.slice('data:image/jpeg;base64,'.length),filename:'invitation.jpg',type:'image/jpeg',disposition:'inline',content_id:'inviter-photo'}]};
 const response=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{authorization:`Bearer ${process.env.SENDGRID_API_KEY}`,'content-type':'application/json'},body:JSON.stringify(body)});
 if(!response.ok)throw Error(`Email provider returned ${response.status}`);
}
const tokenFrom=req=>(req.headers.get('cookie')||'').match(/(?:^|;\s*)chempat_member=([a-f0-9]{64})(?:;|$)/)?.[1]||null;
const available=row=>!!row.sender_exists&&!!row.sender_verified&&!row.sender_blocked&&(!row.sender_suspended||new Date(row.sender_suspended).getTime()<=Date.now());
const elapsed=row=>!row.prospect_member_id&&!(new Date(row.expires_at).getTime()>Date.now());
async function friendRow(sql,id){
 const rows=await sql`SELECT i.token_hash,i.sender_member_id,i.sender_name,i.sender_photo,i.recipient_name,i.recipient_email,i.expires_at,i.intended_member_id,i.intended_email,i.reinvite_from,c.status,c.prospect_member_id,c.claim_hash,m.id AS sender_exists,m.email_verified_at AS sender_verified,m.blocked_at AS sender_blocked,m.suspended_until AS sender_suspended FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash LEFT JOIN members m ON m.id=i.sender_member_id WHERE i.token_hash=${id} AND i.channel='friend'`;
 return rows[0]||null;
}
function publicInvite(row){
 const status=row.status==='chat'||row.status==='declined'&&validToken(row.claim_hash)?'used':['ended','declined'].includes(row.status)?'closed':elapsed(row)?'expired':!available(row)?'unavailable':'invited';
 return {kind:'friend',status,expiresAt:row.expires_at,...(status==='invited'?{name:row.sender_name,photo:row.sender_photo}:{})};
}
async function accepted(sql,row,member){
 if(row.prospect_member_id!==member)return reply({error:'This friend invitation is already in use.'},409);
 if(row.status==='chat')return reply({ok:true,id:row.token_hash,kind:'friend',status:'chat'});
 // A declined duplicate stores only its canonical friend ID in claim_hash. It is
 // a spent link, never a browser claim, and only its bound member can recover it.
 if(row.status==='declined'&&validToken(row.claim_hash)){
  const existing=await friendRow(sql,row.claim_hash);
  if(existing?.status==='chat'&&((existing.sender_member_id===row.sender_member_id&&existing.prospect_member_id===member)||(existing.sender_member_id===member&&existing.prospect_member_id===row.sender_member_id)))return reply({ok:true,id:existing.token_hash,kind:'friend',status:'chat',alreadyConnected:true});
 }
 return reply({error:'This friend invitation is closed.'},410);
}
async function handler(req){
 const blocked=reviewGate();if(blocked)return blocked;
 if(!['GET','POST'].includes(req.method))return reply({error:'Method not allowed.'},405);
 if(!process.env.DATABASE_URL)return reply({error:'Friend invitations are unavailable.'},503);
 const sql=neon(process.env.DATABASE_URL);
 try{
  if(req.method==='GET'){
   const token=new URL(req.url).searchParams.get('invite');
   if(!validToken(token))return reply({error:'Friend invitation not found.'},404);
   const row=await friendRow(sql,hash(token));
   const viewer=await ops.memberIdFromToken(sql,tokenFrom(req));
   if(row&&!viewer&&(row.intended_member_id||row.intended_email))return reply({kind:'friend',status:'signInRequired',requiresSignIn:true});
   if(row&&!await targetAllowed(sql,row,viewer))return reply({kind:'friend',status:'signInRequired',requiresSignIn:true,error:'Open the member page this invitation was sent to.'},403);
   if(row&&await pairBlocked(sql,row.sender_member_id,row.prospect_member_id||row.intended_member_id||viewer))return reply({kind:'friend',status:'unavailable',expiresAt:row.expires_at});
   return row?reply(publicInvite(row)):reply({error:'Friend invitation not found.'},404);
  }
  let body;try{body=await req.json()}catch{return reply({error:'Invalid request.'},400)}
  if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'Invalid request.'},400);
  if(!['create','accept'].includes(body.action))return reply({error:'Unknown action.'},400);
  const session=tokenFrom(req);
  if(!session)return reply({error:'Open your member page to connect with friends.'},401);
  const members=await sql`SELECT id,name,photo,contact FROM members WHERE session_hash=${hash(session)}`;
  const member=members[0];
  if(!member)return reply({error:'Your sign-in expired. Sign in again.',sessionExpired:true},401);
  const denied=await ops.standing(sql,member.id)||await ops.requireVerified(sql,member.id);
  if(denied)return reply(denied,403);
  if(!validName(member.name)||!validPhoto(member.photo))return reply({error:'Add your name and picture before connecting with friends.'},400);
  if(body.action==='create'){
   if(!process.env.SENDGRID_API_KEY)return reply({error:'Friend email invitations are being set up. Please try again shortly.'},503);
   const recipientName=String(body.recipient?.name||'').trim(),recipientEmail=String(body.recipient?.email||'').trim().toLowerCase();
   if(!validName(recipientName)||!validEmail(recipientEmail))return reply({error:'Enter your friend’s name and a valid email address.'},400);
   const token=randomBytes(32).toString('hex'),id=hash(token),link=new URL(`/friend?friend=${token}`,req.url).href;
   // Friend invitations stay separate from Vibe invitations. The recipient fields
   // identify the intended friend; answers and private contact details are never exposed.
   const rows=await reserveInvitation(sql,member.id,recipientEmail,tx=>tx`WITH invitation AS (INSERT INTO invitations(token_hash,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,sender_member_id,channel,expires_at) SELECT ${id},${''},${member.name},${member.photo},'[]'::jsonb,${recipientName},${recipientEmail},${member.id},'friend',now()+interval '7 days' WHERE NOT EXISTS(SELECT 1 FROM member_blocks b JOIN members recipient ON recipient.id=CASE WHEN b.blocker_id=${member.id} THEN b.blocked_id ELSE b.blocker_id END WHERE (b.blocker_id=${member.id} OR b.blocked_id=${member.id}) AND lower(recipient.contact)=${recipientEmail}) RETURNING token_hash,expires_at), connection AS (INSERT INTO connection_state(invitation_hash) SELECT token_hash FROM invitation RETURNING invitation_hash) SELECT invitation.token_hash AS id,invitation.expires_at FROM invitation JOIN connection ON connection.invitation_hash=invitation.token_hash`);
   if(!rows[0])return reply({error:'This invitation is unavailable.'},403);
   if(await deliveryBlocked(sql,member.id,recipientEmail)){await sql`DELETE FROM invitations WHERE token_hash=${id}`;return reply({error:'This invitation is unavailable.'},403)}
   try{await sendFriendMail(recipientEmail,recipientName,member.name,member.photo,link)}catch(error){await sql`DELETE FROM invitations WHERE token_hash=${id}`;throw error}
   await ops.log(sql,'friend_invited',{member:member.id,connection:id});
   return reply({id,token,url:`/friend?friend=${token}`,expiresAt:rows[0].expires_at,kind:'friend',recipient:{name:recipientName,email:recipientEmail},code:token.slice(0,8).toUpperCase()});
  }
  if(!validToken(body.token))return reply({error:'Friend invitation not found.'},404);
  const id=hash(body.token),row=await friendRow(sql,id);
  if(!row)return reply({error:'Friend invitation not found.'},404);
  if(!await targetAllowed(sql,row,member.id))return reply({error:'Open the member page this invitation was sent to.'},403);
  if(await pairBlocked(sql,row.sender_member_id,member.id))return reply({error:'This friend invitation is unavailable.'},403);
  if(row.sender_member_id===member.id)return reply({error:'Send this invitation to your friend to accept.'},409);
  if(row.prospect_member_id)return accepted(sql,row,member.id);
  if(row.status!=='invited')return reply({error:'This friend invitation is closed.'},410);
  if(elapsed(row))return reply({error:'This friend invitation expired. Ask for a new one.'},410);
  if(!available(row))return reply({error:'This friend invitation is unavailable.'},403);
  // All acceptances for a pair lock the same two members in the same order.
  // READ COMMITTED gives the following statement a fresh snapshot after waiting,
  // so simultaneous links cannot create duplicate chats in either direction.
  const results=await sql.transaction(tx=>[
   tx`SELECT id FROM members WHERE id IN (${member.id},${row.sender_member_id}) ORDER BY id FOR UPDATE`,
   tx`WITH existing_friend AS (SELECT i.token_hash FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.channel='friend' AND c.status='chat' AND ((i.sender_member_id=${member.id} AND c.prospect_member_id=${row.sender_member_id}) OR (i.sender_member_id=${row.sender_member_id} AND c.prospect_member_id=${member.id})) ORDER BY i.created_at LIMIT 1)
   UPDATE connection_state c SET prospect_member_id=recipient.id,prospect_name=recipient.name,prospect_photo=recipient.photo,prospect_answers='[]'::jsonb,prospect_phone=NULL,prospect_email=NULL,claim_hash=(SELECT token_hash FROM existing_friend),status=CASE WHEN EXISTS(SELECT 1 FROM existing_friend) THEN 'declined' ELSE 'chat' END,updated_at=now()
   FROM invitations i,members sender,members recipient WHERE c.invitation_hash=${id} AND i.token_hash=c.invitation_hash AND i.channel='friend' AND i.sender_member_id=sender.id AND sender.id=${row.sender_member_id} AND recipient.id=${member.id} AND recipient.session_hash=${hash(session)} AND c.prospect_member_id IS NULL AND c.status='invited' AND i.expires_at>now()
   AND sender.email_verified_at IS NOT NULL AND sender.blocked_at IS NULL AND (sender.suspended_until IS NULL OR sender.suspended_until<=now()) AND recipient.email_verified_at IS NOT NULL AND recipient.blocked_at IS NULL AND (recipient.suspended_until IS NULL OR recipient.suspended_until<=now())
   AND NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_id=sender.id AND b.blocked_id=recipient.id) OR (b.blocked_id=sender.id AND b.blocker_id=recipient.id))
   AND (i.intended_member_id IS NULL OR i.intended_member_id=recipient.id) AND (i.intended_member_id IS NOT NULL OR i.intended_email IS NULL OR (lower(recipient.contact)=i.intended_email AND recipient.email_verified_at IS NOT NULL))
   RETURNING c.invitation_hash,c.status,c.claim_hash`
  ],{isolationLevel:'ReadCommitted'});
  if(!results[1][0]){
   const latest=await friendRow(sql,id);
   if(latest?.prospect_member_id)return accepted(sql,latest,member.id);
   return reply({error:'This friend invitation is no longer available.'},409);
  }
  const result=results[1][0],existing=result.claim_hash;
  await ops.log(sql,existing?'friend_duplicate':'friend_accepted',{member:member.id,connection:id});
  return reply({ok:true,id:existing||id,kind:'friend',status:'chat',...(existing?{alreadyConnected:true}:{})});
 }catch(error){console.error('Friend invitation error:',error);return reply({error:'Could not update this friend invitation. Try again.'},500)}
}
export default {fetch:handler};
