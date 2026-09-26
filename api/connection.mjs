import {createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {ensureConnectionSchema} from './connection-schema.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
const validToken=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const validPhoto=s=>typeof s==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s)&&s.length<250000;
const validAnswers=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(x=>Number.isInteger(x)&&x>=0&&x<=2);
const validEmail=s=>typeof s==='string'&&s.length<255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
function cookie(req){return Object.fromEntries((req.headers.get('cookie')||'').split(';').map(x=>x.trim().split('=')))}
async function senderEmail(req,sql){const token=cookie(req).chempat_session;if(!validToken(token))return null;const rows=await sql`SELECT email FROM email_sessions WHERE token_hash=${hash(token)} AND expires_at>now()`;return rows[0]?.email||null}
async function ownInvitation(sql,token){if(!validToken(token))return null;const rows=await sql`SELECT i.token_hash,i.sender_name,i.sender_photo,i.sender_answers,i.recipient_name,i.recipient_email,c.prospect_name,c.prospect_photo,c.prospect_answers,c.prospect_phone,c.prospect_email,c.status,c.messages FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.token_hash=${hash(token)}`;return rows[0]||null}
function prospectView(row){const answers=row.status==='invited'?[]:['chat','secondResults','email','tests'].includes(row.status)?row.sender_answers:row.sender_answers.slice(0,5);return {name:row.sender_name,photo:row.sender_photo,answers,recipientName:row.recipient_name,prospectName:row.prospect_name,prospectPhoto:row.prospect_photo,prospectAnswers:row.prospect_answers,prospectPhone:row.prospect_phone,prospectEmail:row.prospect_email,status:row.status,messages:row.messages}}
async function handler(req){
 if(!process.env.DATABASE_URL)return reply({error:'Connection storage is unavailable.'},503);
 const sql=neon(process.env.DATABASE_URL);
 try{
  await ensureConnectionSchema(sql);
  const url=new URL(req.url);
  if(req.method==='GET'){
   const token=url.searchParams.get('invite');
   if(token){const row=await ownInvitation(sql,token);return row?reply(prospectView(row)):reply({error:'Invitation not found.'},404)}
   if(url.searchParams.has('inbox')){
    const sender=await senderEmail(req,sql);if(!sender)return reply({error:'Verify your email to see connections.'},401);
    const rows=await sql`SELECT i.token_hash AS id,i.recipient_name,i.recipient_email,c.prospect_name,c.prospect_photo,c.prospect_answers,c.prospect_phone,c.prospect_email,c.status,c.messages FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.sender_email=${sender} ORDER BY i.created_at DESC LIMIT 50`;
    return reply({connections:rows});
   }
   return reply({error:'Missing connection.'},400);
  }
  if(req.method!=='POST')return reply({error:'Method not allowed.'},405);
  let body;try{body=await req.json()}catch{return reply({error:'Invalid request.'},400)}
  if(body.action==='first'){
   const row=await ownInvitation(sql,body.token);
   if(!row)return reply({error:'Invitation not found.'},404);
   if(!validAnswers(body.answers,5)||!validPhoto(body.photo))return reply({error:'Complete your five answers and add a picture.'},400);
   if(row.status!=='invited'&&row.status!=='firstResults')return reply({error:'This invitation has moved on.'},409);
   await sql`UPDATE connection_state SET prospect_name=${row.recipient_name},prospect_photo=${body.photo},prospect_answers=${JSON.stringify(body.answers)}::jsonb,status='firstResults',updated_at=now() WHERE invitation_hash=${row.token_hash}`;
   return reply({ok:true,answers:row.sender_answers.slice(0,5)});
  }
  if(body.action==='request'){
   const row=await ownInvitation(sql,body.token),name=String(body.name||'').trim(),phone=String(body.phone||'').trim();
   if(!row)return reply({error:'Invitation not found.'},404);
   if(row.status!=='firstResults'||name.length<1||name.length>50||phone.replace(/\D/g,'').length<10||phone.length>30||!validPhoto(body.photo))return reply({error:'Add your name, picture, and ten-digit cell number.'},400);
   await sql`UPDATE connection_state SET prospect_name=${name},prospect_phone=${phone},prospect_photo=${body.photo},status='request',updated_at=now() WHERE invitation_hash=${row.token_hash}`;
   return reply({ok:true});
  }
  if(body.action==='decision'){
   const sender=await senderEmail(req,sql);
   if(!sender||!validToken(body.id))return reply({error:'Member verification required.'},401);
   if(!['accept','decline'].includes(body.decision))return reply({error:'Invalid decision.'},400);
   const next=body.decision==='accept'?'chat':'declined';
   const rows=await sql`UPDATE connection_state c SET status=${next},updated_at=now() FROM invitations i WHERE c.invitation_hash=i.token_hash AND i.token_hash=${body.id} AND i.sender_email=${sender} AND c.status='request' RETURNING c.status`;
   return rows[0]?reply({ok:true,status:rows[0].status}):reply({error:'Request no longer pending.'},409);
  }
  if(body.action==='second'){
   const row=await ownInvitation(sql,body.token);
   if(!row)return reply({error:'Invitation not found.'},404);
   if(!['chat','secondResults'].includes(row.status)||!validAnswers(body.answers,10)||body.answers.slice(0,5).some((a,i)=>a!==row.prospect_answers[i]))return reply({error:'Complete the next five in order.'},400);
   await sql`UPDATE connection_state SET prospect_answers=${JSON.stringify(body.answers)}::jsonb,status='secondResults',updated_at=now() WHERE invitation_hash=${row.token_hash}`;
   return reply({ok:true});
  }
  if(body.action==='email'){
   const row=await ownInvitation(sql,body.token),address=String(body.email||'').trim().toLowerCase();
   if(!row)return reply({error:'Invitation not found.'},404);
   if(!['secondResults','email','tests'].includes(row.status)||!validEmail(address))return reply({error:'Enter a valid email after the next five.'},400);
   await sql`UPDATE connection_state SET prospect_email=${address},status='email',updated_at=now() WHERE invitation_hash=${row.token_hash}`;
   return reply({ok:true});
  }
  if(body.action==='message'){
   const message=String(body.text||'').trim();if(!message||message.length>500)return reply({error:'Enter a message under 500 characters.'},400);
   let id,by;
   if(body.token){const row=await ownInvitation(sql,body.token);if(!row)return reply({error:'Invitation not found.'},404);id=row.token_hash;by='prospect'}
   else{const sender=await senderEmail(req,sql);if(!sender||!validToken(body.id))return reply({error:'Member verification required.'},401);const rows=await sql`SELECT token_hash FROM invitations WHERE token_hash=${body.id} AND sender_email=${sender}`;if(!rows[0])return reply({error:'Connection not found.'},404);id=body.id;by='member'}
   const item={by,text:message,at:new Date().toISOString()};
   const rows=await sql`UPDATE connection_state SET messages=messages || ${JSON.stringify([item])}::jsonb,updated_at=now() WHERE invitation_hash=${id} AND status IN ('chat','secondResults','email','tests') RETURNING messages`;
   return rows[0]?reply({messages:rows[0].messages}):reply({error:'Chat is not open yet.'},409);
  }
  return reply({error:'Unknown action.'},400);
 }catch(e){console.error('Connection error:',e);return reply({error:'Could not update the connection. Try again.'},500)}
}
export default {fetch:handler};
