import {createHash,randomBytes} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import * as ops from './_ops.mjs';

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
async function ownInvitation(sql,token,req){if(!validToken(token))return null;const rows=await sql`SELECT i.token_hash,i.sender_name,i.sender_photo,i.sender_answers,i.recipient_name,i.recipient_email,i.sender_member_id,i.channel,i.expires_at,c.claim_hash,c.prospect_name,c.prospect_photo,c.prospect_answers,c.prospect_phone,c.prospect_email,c.status,c.messages FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.token_hash=${hash(token)}`;const row=rows[0];if(!row)return null;if(row.channel==='qr'&&(!row.claim_hash||hash(cookie(req)[claimCookie(row.token_hash)]||'')!==row.claim_hash))return null;return row}
function prospectView(row){const answers=row.status==='invited'?[]:['chat','secondResults','email','tests'].includes(row.status)?row.sender_answers:row.sender_answers.slice(0,5);return {name:row.sender_name,photo:row.sender_photo,answers,recipientName:row.recipient_name,prospectName:row.prospect_name,prospectPhoto:row.prospect_photo,prospectAnswers:row.prospect_answers,prospectPhone:row.prospect_phone,prospectEmail:row.prospect_email,status:row.status,messages:row.status==='ended'?[]:row.messages}}
async function handler(req){
 if(!process.env.DATABASE_URL)return reply({error:'Connection storage is unavailable.'},503);
 const sql=neon(process.env.DATABASE_URL);
 try{
  const url=new URL(req.url);
  if(req.method==='GET'){
   const token=url.searchParams.get('invite');
   if(token){
    if(!validToken(token))return reply({error:'Invitation not found.'},404);
    const id=hash(token);
    const rows=await sql`SELECT i.token_hash,i.sender_name,i.sender_photo,i.sender_answers,i.recipient_name,i.recipient_email,i.sender_member_id,i.channel,i.expires_at,c.claim_hash,c.prospect_name,c.prospect_photo,c.prospect_answers,c.prospect_phone,c.prospect_email,c.status,c.messages FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.token_hash=${id}`;
    let row=rows[0];if(!row)return reply({error:'Invitation not found.'},404);
    if(row.channel!=='qr')return reply(prospectView(row));
    const guest=cookie(req)[claimCookie(id)];
    if(row.claim_hash)return guest&&hash(guest)===row.claim_hash?reply(prospectView(row)):reply({error:'This code is already in play on another phone.'},409);
    if(new Date(row.expires_at).getTime()<=Date.now())return reply({error:'This code expired. Ask for a fresh one.'},410);
    if(await senderMember(req,sql)===row.sender_member_id)return reply({error:'Show this code to the other person on their phone.'},409);
    const claim=randomBytes(32).toString('hex');
    const claimed=await sql`UPDATE connection_state SET claim_hash=${hash(claim)},updated_at=now() WHERE invitation_hash=${id} AND claim_hash IS NULL AND EXISTS (SELECT 1 FROM invitations WHERE token_hash=${id} AND expires_at>now()) RETURNING claim_hash`;
    if(!claimed[0])return reply({error:'This code is already in play or has expired.'},409);
    await ops.log(sql,'qr_scanned',{member:row.sender_member_id,connection:id});
    return Response.json(prospectView(row),{headers:{'cache-control':'no-store','set-cookie':`${claimCookie(id)}=${claim}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=15552000`}});
   }
   if(url.searchParams.has('inbox')){
    const sender=await senderEmail(req,sql),member=await senderMember(req,sql);if(!sender&&!member)return reply({error:'Open your member page to see connections.'},401);
    const rows=member?await sql`SELECT i.token_hash AS id,i.recipient_name,i.recipient_email,i.channel,(c.claim_hash IS NOT NULL) AS claimed,c.prospect_name,c.prospect_photo,c.prospect_answers,c.prospect_phone,c.prospect_email,c.status,c.messages FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE (i.sender_member_id=${member} OR (i.sender_member_id IS NULL AND i.sender_email=${sender||''})) AND (i.channel<>'qr' OR c.claim_hash IS NOT NULL OR i.expires_at>now()) ORDER BY i.created_at DESC LIMIT 50`:await sql`SELECT i.token_hash AS id,i.recipient_name,i.recipient_email,i.channel,(c.claim_hash IS NOT NULL) AS claimed,c.prospect_name,c.prospect_photo,c.prospect_answers,c.prospect_phone,c.prospect_email,c.status,c.messages FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.sender_email=${sender} ORDER BY i.created_at DESC LIMIT 50`;
    return reply({connections:rows.map(r=>r.status==='ended'?{...r,prospect_phone:null,prospect_email:null,messages:[]}:r)});
   }
   return reply({error:'Missing connection.'},400);
  }
  if(req.method!=='POST')return reply({error:'Method not allowed.'},405);
  let body;try{body=await req.json()}catch{return reply({error:'Invalid request.'},400)}
  const actor=await ops.memberIdFromToken(sql,cookie(req).chempat_member);
  if(!['unmatch','report'].includes(body.action)){const paused=await ops.standing(sql,actor);if(paused)return reply(paused,403)}
  if(body.action==='first'){
   const row=await ownInvitation(sql,body.token,req);
   if(!row)return reply({error:'Invitation not found.'},404);
   if(!validAnswers(body.answers,5)||!validPhoto(body.photo))return reply({error:'Complete your five answers and add a picture.'},400);
   if(row.status!=='invited'&&row.status!=='firstResults')return reply({error:'This invitation has moved on.'},409);
   const memberToken=cookie(req).chempat_member;
   const visitor=validToken(memberToken)?await sql`SELECT name FROM members WHERE session_hash=${hash(memberToken)}`:[];
   const visitorName=visitor[0]?.name||row.recipient_name;
   if(!visitorName)return reply({error:'Finish your member page to reveal your five.'},400);
   await sql`UPDATE connection_state SET prospect_name=${visitorName},prospect_photo=${body.photo},prospect_answers=${JSON.stringify(body.answers)}::jsonb,status='firstResults',updated_at=now() WHERE invitation_hash=${row.token_hash}`;
   await ops.linkProspect(sql,row.token_hash,memberToken);await ops.log(sql,'first_five',{member:actor,connection:row.token_hash});
   return reply({ok:true,answers:row.sender_answers.slice(0,5)});
  }
  if(body.action==='request'){
   const row=await ownInvitation(sql,body.token,req),name=String(body.name||'').trim(),contact=String(body.contact||body.phone||'').trim().toLowerCase();
   if(!row)return reply({error:'Invitation not found.'},404);
   const isEmail=validEmail(contact),isCell=ops.CELL_ENABLED&&!isEmail&&contact.length<=30&&contact.replace(/\D/g,'').length>=10;
   if(row.status!=='firstResults'||name.length<1||name.length>50||(!isEmail&&!isCell)||!validPhoto(body.photo))return reply({error:ops.CELL_ENABLED?'Add your name, picture, and an email or ten-digit cell number.':'Add your name, picture, and email.'},400);
   await sql`UPDATE connection_state SET prospect_name=${name},prospect_phone=${isCell?contact:null},prospect_email=${isEmail?contact:null},prospect_photo=${body.photo},status='request',updated_at=now() WHERE invitation_hash=${row.token_hash}`;
   await ops.linkProspect(sql,row.token_hash,cookie(req).chempat_member);await ops.log(sql,'request',{member:actor,connection:row.token_hash});
   return reply({ok:true});
  }
  if(body.action==='decision'){
   const sender=await senderEmail(req,sql),member=await senderMember(req,sql);
   if((!sender&&!member)||!validToken(body.id))return reply({error:'Member verification required.'},401);
   if(!['accept','decline'].includes(body.decision))return reply({error:'Invalid decision.'},400);
   const next=body.decision==='accept'?'chat':'declined';
   const rows=member?await sql`UPDATE connection_state c SET status=${next},updated_at=now() FROM invitations i WHERE c.invitation_hash=i.token_hash AND i.token_hash=${body.id} AND (i.sender_member_id=${member} OR (i.sender_member_id IS NULL AND i.sender_email=${sender||''})) AND c.status='request' RETURNING c.status`:await sql`UPDATE connection_state c SET status=${next},updated_at=now() FROM invitations i WHERE c.invitation_hash=i.token_hash AND i.token_hash=${body.id} AND i.sender_email=${sender} AND c.status='request' RETURNING c.status`;
   if(rows[0])await ops.log(sql,next==='chat'?'accept':'pass',{member,connection:body.id});
   return rows[0]?reply({ok:true,status:rows[0].status}):reply({error:'Request no longer pending.'},409);
  }
  if(body.action==='second'){
   const row=await ownInvitation(sql,body.token,req);
   if(!row)return reply({error:'Invitation not found.'},404);
   if(!['chat','secondResults'].includes(row.status)||!validAnswers(body.answers,10)||body.answers.slice(0,5).some((a,i)=>a!==row.prospect_answers[i]))return reply({error:'Complete the next five in order.'},400);
   await sql`UPDATE connection_state SET prospect_answers=${JSON.stringify(body.answers)}::jsonb,status='secondResults',updated_at=now() WHERE invitation_hash=${row.token_hash}`;
   await ops.log(sql,'next_five',{member:actor,connection:row.token_hash});
   return reply({ok:true});
  }
  if(body.action==='email'){
   const row=await ownInvitation(sql,body.token,req),address=String(body.email||'').trim().toLowerCase();
   if(!row)return reply({error:'Invitation not found.'},404);
   if(!['secondResults','email','tests'].includes(row.status)||!validEmail(address))return reply({error:'Enter a valid email after the next five.'},400);
   await sql`UPDATE connection_state SET prospect_email=${address},status='email',updated_at=now() WHERE invitation_hash=${row.token_hash}`;
   await ops.log(sql,'email_shared',{member:actor,connection:row.token_hash});
   return reply({ok:true});
  }
  if(body.action==='message'){
   const message=String(body.text||'').trim();if(!message||message.length>500)return reply({error:'Enter a message under 500 characters.'},400);
   let id,by;
   if(body.token){const row=await ownInvitation(sql,body.token,req);if(!row)return reply({error:'Invitation not found.'},404);id=row.token_hash;by='prospect'}
   else{const sender=await senderEmail(req,sql),member=await senderMember(req,sql);if((!sender&&!member)||!validToken(body.id))return reply({error:'Member verification required.'},401);const rows=member?await sql`SELECT token_hash FROM invitations WHERE token_hash=${body.id} AND (sender_member_id=${member} OR (sender_member_id IS NULL AND sender_email=${sender||''}))`:await sql`SELECT token_hash FROM invitations WHERE token_hash=${body.id} AND sender_email=${sender}`;if(!rows[0])return reply({error:'Connection not found.'},404);id=body.id;by='member'}
   const item={by,text:message,at:new Date().toISOString()};
   const rows=await sql`UPDATE connection_state SET messages=messages || ${JSON.stringify([item])}::jsonb,updated_at=now() WHERE invitation_hash=${id} AND status IN ('chat','secondResults','email','tests') RETURNING messages`;
   if(rows[0])await ops.log(sql,'message',{member:actor,connection:id,detail:{by,length:message.length}});
   return rows[0]?reply({messages:rows[0].messages}):reply({error:'Chat is not open yet.'},409);
  }
  if(body.action==='unmatch'||body.action==='report'){
   let id,side;
   if(body.token){const row=await ownInvitation(sql,body.token,req);if(!row)return reply({error:'Invitation not found.'},404);id=row.token_hash;side='prospect'}
   else{const sender=await senderEmail(req,sql),member=await senderMember(req,sql);if((!sender&&!member)||!validToken(body.id))return reply({error:'Member verification required.'},401);const rows=member?await sql`SELECT token_hash FROM invitations WHERE token_hash=${body.id} AND (sender_member_id=${member} OR (sender_member_id IS NULL AND sender_email=${sender||''}))`:await sql`SELECT token_hash FROM invitations WHERE token_hash=${body.id} AND sender_email=${sender}`;if(!rows[0])return reply({error:'Connection not found.'},404);id=body.id;side='member'}
   const result=await ops.endConnection(sql,{id,side,actorId:actor,report:body.action==='report'?{reason:body.reason,note:body.note}:null});
   return reply(result.body,result.status);
  }
  return reply({error:'Unknown action.'},400);
 }catch(e){console.error('Connection error:',e);return reply({error:'Could not update the connection. Try again.'},500)}
}
export default {fetch:handler};
