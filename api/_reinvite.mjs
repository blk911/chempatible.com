import {createHash} from 'node:crypto';
import {sendFriendMail} from './friend.mjs';
import {sendVibeMail} from './email.mjs';
import {reviewRecipientAllowed} from './_review.mjs';
import {pairBlocked,deliveryBlocked} from './_connections.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const validEmail=value=>typeof value==='string'&&value.length<255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validAnswers=value=>Array.isArray(value)&&[5,10].includes(value.length)&&value.every(x=>Number.isInteger(x)&&x>=0&&x<=2);
const validPhoto=value=>typeof value==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)&&value.length<250000;
const result=(body,status=200)=>({body,status});

export async function reinvite(sql,{body,req,row,side,actor,ops}){
 const kind=row.channel==='friend'?'friend':'vibe';
 if(body.kind&&body.kind!==kind)return result({error:'Invite again keeps the original connection kind.'},409);
 if(row.trashed_at)return result({error:'Restore this invitation to the Freezer first.'},409);
 const terminal=['ended','declined'].includes(row.status)||(!row.prospect_member_id&&((row.channel==='qr'&&!row.claim_hash)||row.channel==='friend'||row.reinvite_from||row.intended_member_id||row.intended_email)&&!(new Date(row.expires_at).getTime()>Date.now()));
 if(!terminal)return result({error:'Freeze this connection before inviting again.'},409);
 const target=side==='member'?(row.prospect_member_id||row.intended_member_id):row.sender_member_id;
 if(target===actor||await pairBlocked(sql,actor,target))return result({error:'This invitation is unavailable.'},403);
 const own=(await sql`SELECT id,name,photo,answers,contact,email_verified_at FROM members WHERE id=${actor}`)[0];
 if(!own)return result({error:'Open your member page to invite again.'},401);
 const knownEmail=side==='member'?(row.recipient_email||(!row.channel||row.channel!=='friend')&&row.history_email_shared&&row.prospect_email||null):null;
 const recipient=target?(await sql`SELECT id,name,contact,email_verified_at FROM members WHERE id=${target}`)[0]:null;
 const destinationEmail=target?recipient?.email_verified_at&&recipient.contact:knownEmail;
 const name=target?(side==='member'?row.prospect_name:row.sender_name)||recipient?.name:row.recipient_name;
 if(!validEmail(destinationEmail)||!name)return result({error:'There is no known destination for this invitation. You can keep it in the Freezer or move it to Trash.'},409);
 const email=destinationEmail.trim().toLowerCase();
 if(await deliveryBlocked(sql,actor,email))return result({error:'This invitation is unavailable.'},403);
 const needsAnswers=kind==='vibe'&&!validAnswers(own.answers);
 if(body.action==='prepareReinvite')return result({kind,recipient:{name,email:knownEmail&&knownEmail.toLowerCase()===email?email:null},destination:target?'member':'email',canSend:!needsAnswers,needsAnswers});
 if(!/^[a-f0-9]{64}$/.test(body.requestId||''))return result({error:'Start a fresh invitation before sending.'},400);
 if(!process.env.SENDGRID_API_KEY)return result({error:'Email invitations are unavailable. Try again shortly.'},503);
 if(!reviewRecipientAllowed(email))return result({error:'Review email is limited to approved test recipients.',reviewOnly:true},403);
 if(needsAnswers||!validPhoto(own.photo)||!own.name?.trim())return result({error:needsAnswers?'Complete your first five before sending a Vibe invitation.':'Add your name and picture before inviting again.',needsAnswers},400);
 const token=(req.headers.get('cookie')||'').match(/(?:^|;\s*)chempat_member=([a-f0-9]{64})(?:;|$)/)?.[1];
 const requestHash=hash(`${row.token_hash}:${kind}:${body.requestId}`),freshToken=hash(`reinvite-v1:${token}:${actor}:${requestHash}`),id=hash(freshToken);
 const existing=(await sql`SELECT token_hash,delivery_status FROM invitations WHERE sender_member_id=${actor} AND reinvite_request_hash=${requestHash}`)[0];
 if(existing)return existing.delivery_status==='sent'?result({ok:true,id:existing.token_hash,kind,alreadySent:true}):result({error:existing.delivery_status==='blocked'?'This invitation is unavailable.':'This invitation may already have been sent. Refresh your connections before starting another invitation.',id:existing.token_hash,kind,deliveryStatus:existing.delivery_status},409);
 const reserved=await sql.transaction(tx=>[
  tx`SELECT id FROM members WHERE id=${actor} OR id=${target} OR lower(contact)=${email} ORDER BY id FOR UPDATE`,
  tx`WITH created AS (
   INSERT INTO invitations(token_hash,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,sender_member_id,channel,expires_at,intended_member_id,intended_email,reinvite_from,reinvite_request_hash,delivery_status)
   SELECT ${id},'',sender.name,sender.photo,CASE WHEN ${kind}='friend' THEN '[]'::jsonb ELSE (SELECT jsonb_agg(value ORDER BY ord) FROM jsonb_array_elements(sender.answers) WITH ORDINALITY a(value,ord) WHERE ord<=5) END,${name},${knownEmail&&knownEmail.toLowerCase()===email?email:''},${actor},${kind==='friend'?'friend':'email'},now()+interval '7 days',${target},${target?null:email},source.token_hash,${requestHash},'pending'
   FROM invitations source JOIN connection_state old ON old.invitation_hash=source.token_hash JOIN members sender ON sender.id=${actor}
   WHERE source.token_hash=${row.token_hash} AND (source.sender_member_id=${actor} OR old.prospect_member_id=${actor})
   AND (CASE WHEN source.sender_member_id=${actor} THEN coalesce(old.prospect_member_id,source.intended_member_id) ELSE source.sender_member_id END) IS NOT DISTINCT FROM ${target}::uuid
   AND (${target}::uuid IS NOT NULL OR source.recipient_email=${email} OR source.channel<>'friend' AND old.prospect_email=${email} AND EXISTS(SELECT 1 FROM activity shared WHERE shared.connection_id=source.token_hash AND shared.kind='email_shared'))
   AND (old.status IN ('ended','declined') OR old.prospect_member_id IS NULL AND (source.channel='friend' OR source.channel='qr' AND old.claim_hash IS NULL OR source.reinvite_from IS NOT NULL OR source.intended_member_id IS NOT NULL OR source.intended_email IS NOT NULL) AND coalesce(source.expires_at<=now(),true))
   AND NOT EXISTS(SELECT 1 FROM connection_visibility v WHERE v.member_id=${actor} AND v.invitation_hash=source.token_hash AND v.trashed_at IS NOT NULL)
   AND NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_id=${actor} AND b.blocked_id=${target}) OR (b.blocked_id=${actor} AND b.blocker_id=${target}))
   AND NOT EXISTS(SELECT 1 FROM member_blocks b JOIN members recipient ON recipient.id=CASE WHEN b.blocker_id=${actor} THEN b.blocked_id ELSE b.blocker_id END WHERE (b.blocker_id=${actor} OR b.blocked_id=${actor}) AND lower(recipient.contact)=${email})
   AND sender.email_verified_at IS NOT NULL AND sender.blocked_at IS NULL AND (sender.suspended_until IS NULL OR sender.suspended_until<=now())
   AND (${target}::uuid IS NULL OR EXISTS(SELECT 1 FROM members recipient WHERE recipient.id=${target} AND lower(recipient.contact)=${email} AND recipient.email_verified_at IS NOT NULL))
   AND (${kind}='friend' OR jsonb_array_length(sender.answers) IN (5,10))
   AND NOT EXISTS(SELECT 1 FROM invitations recent WHERE recent.sender_member_id=${actor} AND recent.reinvite_from=source.token_hash AND recent.created_at>now()-interval '1 minute')
   AND (SELECT count(*) FROM invitations recent WHERE recent.sender_member_id=${actor} AND recent.reinvite_from=source.token_hash AND recent.created_at>now()-interval '1 day')<5
   ON CONFLICT(sender_member_id,reinvite_request_hash) WHERE reinvite_request_hash IS NOT NULL DO NOTHING RETURNING token_hash,sender_name,sender_photo
  ), connection AS (INSERT INTO connection_state(invitation_hash) SELECT token_hash FROM created RETURNING invitation_hash)
  SELECT created.* FROM created JOIN connection ON connection.invitation_hash=created.token_hash`
 ],{isolationLevel:'ReadCommitted'});
 if(!reserved[1][0]){
  const latest=(await sql`SELECT token_hash,delivery_status FROM invitations WHERE sender_member_id=${actor} AND reinvite_request_hash=${requestHash}`)[0];
  if(latest?.delivery_status==='sent')return result({ok:true,id:latest.token_hash,kind,alreadySent:true});
  return result({error:latest?'This invitation is already being sent. Refresh your connections before trying again.':'This invitation is unavailable or was just sent. Wait a minute before trying again.',...(latest?{id:latest.token_hash,kind,deliveryStatus:latest.delivery_status}:{})},409);
 }
 // Reservation commits before delivery. A block/cancel that wins before this
 // final check prevents the send. Provider-accepted mail cannot be recalled.
 const current=(await sql`SELECT c.status FROM connection_state c WHERE c.invitation_hash=${id}`)[0];
 if(current?.status!=='invited'||await pairBlocked(sql,actor,target)||await deliveryBlocked(sql,actor,email)){
  await sql`UPDATE invitations SET delivery_status='blocked' WHERE token_hash=${id}`;
  await sql`UPDATE connection_state SET status='ended',ended_at=coalesce(ended_at,now()),ended_by=coalesce(ended_by,'member'),updated_at=now() WHERE invitation_hash=${id} AND status='invited'`;
  return result({error:'This invitation is unavailable.'},403);
 }
 const reservedSender=reserved[1][0],link=new URL(kind==='friend'?`/friend?friend=${freshToken}`:`/?invite=${freshToken}`,req.url).href;
 try{
  if(kind==='friend')await sendFriendMail(email,name,reservedSender.sender_name,reservedSender.sender_photo,link);
  else await sendVibeMail(email,name,reservedSender.sender_name,reservedSender.sender_photo,link);
 }catch(error){
  await sql`UPDATE invitations SET delivery_status='uncertain' WHERE token_hash=${id} AND delivery_status='pending'`;
  return result({error:'Delivery could not be confirmed. This invitation may have been sent; refresh your connections before starting another one.',id,kind,deliveryStatus:'uncertain'},502);
 }
 await sql`UPDATE invitations SET delivery_status='sent' WHERE token_hash=${id}`;
 await ops.log(sql,kind==='friend'?'friend_invited':'invite_emailed',{member:actor,connection:id});
 return result({ok:true,id,kind});
}
