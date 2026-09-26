import {createHash,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {ensureConnectionSchema} from './connection-schema.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
const email=s=>typeof s==='string'&&s.length<255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const first=s=>String(s).trim().split(/\s+/)[0];
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const cookie=req=>Object.fromEntries((req.headers.get('cookie')||'').split(';').map(x=>x.trim().split('=')));
const photoData=s=>typeof s==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s)&&s.length<250000;
async function sendMail(to,subject,html,text,photo,fromName='Chempatibility'){
 const from=process.env.CHEMPAT_FROM_EMAIL;
 const body={personalizations:[{to:[{email:to}]}],from:{email:from,name:fromName},subject,content:[{type:'text/plain',value:text},{type:'text/html',value:html}]};
 if(photo)body.attachments=[{content:photo.slice('data:image/jpeg;base64,'.length),filename:'invitation.jpg',type:'image/jpeg',disposition:'inline',content_id:'inviter-photo'}];
 const res=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{authorization:`Bearer ${process.env.SENDGRID_API_KEY}`,'content-type':'application/json'},body:JSON.stringify(body)});
 if(!res.ok)throw Error(`Email provider returned ${res.status}`);
}
async function session(req,sql){const token=cookie(req).chempat_session;if(!token||!/^[a-f0-9]{64}$/.test(token))return null;const rows=await sql`SELECT email FROM email_sessions WHERE token_hash=${hash(token)} AND expires_at>now()`;return rows[0]?.email||null}
async function handler(req){
 const missing=['DATABASE_URL','SENDGRID_API_KEY','CHEMPAT_FROM_EMAIL'].filter(key=>!process.env[key]);
 if(missing.length)return json({error:'Email invitations are being set up. Please try again shortly.',missing},503);
 const sql=neon(process.env.DATABASE_URL);
 try{
  const url=new URL(req.url);
  if(req.method==='GET'){
   const token=url.searchParams.get('invite');
   if(token){if(!/^[a-f0-9]{64}$/.test(token))return json({error:'Invalid invitation.'},400);const rows=await sql`SELECT sender_name,sender_photo,sender_answers FROM invitations WHERE token_hash=${hash(token)}`;return rows[0]?json({name:rows[0].sender_name,photo:rows[0].sender_photo,answers:rows[0].sender_answers.slice(0,5)}):json({error:'Invitation not found.'},404)}
   return json({email:await session(req,sql)});
  }
  if(req.method!=='POST')return json({error:'Method not allowed.'},405);
  let body;try{body=await req.json()}catch{return json({error:'Invalid request.'},400)}
  if(body.action==='start'){
   const address=String(body.email||'').trim().toLowerCase();if(!email(address))return json({error:'Enter a valid email address.'},400);
   const recent=await sql`SELECT last_sent_at FROM email_codes WHERE email=${address}`;
   if(recent[0]&&Date.now()-new Date(recent[0].last_sent_at).getTime()<60000)return json({error:'A code was just sent. Wait a minute before trying again.'},429);
   const code=String(randomInt(100000,1000000));
   await sql`INSERT INTO email_codes(email,code_hash,expires_at,last_sent_at,attempts) VALUES(${address},${hash(code)},now()+interval '10 minutes',now(),0) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,last_sent_at=excluded.last_sent_at,attempts=0`;
   await sendMail(address,'Your Chempatibility code',`<p>Your code is <strong>${code}</strong>. It expires in ten minutes.</p>`,`Your Chempatibility code is ${code}. It expires in ten minutes.`);
   return json({ok:true});
  }
  if(body.action==='verify'){
   const address=String(body.email||'').trim().toLowerCase(),code=String(body.code||'');if(!email(address)||!/^\d{6}$/.test(code))return json({error:'Enter the six digit code from your email.'},400);
   const rows=await sql`UPDATE email_codes SET attempts=attempts+1 WHERE email=${address} AND expires_at>now() AND attempts<5 RETURNING code_hash`;
   if(!rows[0]||!timingSafeEqual(Buffer.from(hash(code)),Buffer.from(rows[0].code_hash)))return json({error:'Code expired or incorrect.'},400);
   await sql`DELETE FROM email_codes WHERE email=${address}`;
   const token=randomBytes(32).toString('hex');await sql`INSERT INTO email_sessions(token_hash,email,expires_at) VALUES(${hash(token)},${address},now()+interval '30 days')`;
   return json({ok:true,email:address},200,{'set-cookie':`chempat_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`});
  }
  if(body.action==='send'){
   const sender=await session(req,sql);if(!sender)return json({error:'Verify your email before sending.'},401);
   const {member,recipient}=body,name=String(member?.name||'').trim(),theirName=String(recipient?.name||'').trim(),theirEmail=String(recipient?.email||'').trim().toLowerCase();
   if(name.length<1||name.length>50||theirName.length<1||theirName.length>50||!email(theirEmail)||!photoData(member?.photo)||!Array.isArray(member?.answers)||member.answers.length!==10||!member.answers.every(x=>Number.isInteger(x)&&x>=0&&x<=2))return json({error:'Complete your ten answers and enter a valid recipient name and email.'},400);
   if(sender===theirEmail)return json({error:'Use the other person’s email address.'},400);
   await ensureConnectionSchema(sql);
   const token=randomBytes(32).toString('hex');const link=`https://chempatible.com/?invite=${token}`;
   await sql`INSERT INTO invitations(token_hash,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email) VALUES(${hash(token)},${sender},${name},${member.photo},${JSON.stringify(member.answers)},${theirName},${theirEmail})`;
   try{await sql`INSERT INTO connection_state(invitation_hash) VALUES(${hash(token)})`}catch(e){await sql`DELETE FROM invitations WHERE token_hash=${hash(token)}`;throw e}
   const senderFirst=first(name),recipientFirst=first(theirName),safeName=escape(senderFirst),safeRecipient=escape(recipientFirst);
   const html=`<div style="font-family:Arial,sans-serif;max-width:440px;margin:auto;color:#17262e;text-align:center;padding:22px 12px"><p style="font-size:12px;letter-spacing:2px;color:#c45b46;font-weight:bold">CHEMPATIBILITY · FIVE TO VIBE</p><img src="cid:inviter-photo" width="160" height="160" alt="${safeName}" style="width:160px;height:160px;object-fit:cover;border-radius:18px"><p style="font-size:14px;letter-spacing:1px;font-weight:bold;color:#c45b46;margin:18px 0 5px">HEY ${safeRecipient}</p><h1 style="font-size:31px;line-height:1.12;margin:7px 0 16px">I’ll tell you five secrets about me.<br>Want to see if we vibe?</h1><p style="font-size:17px;line-height:1.5;margin:0 0 22px">Pick your answers to five quick ones. Then we’ll show each other ours.</p><a href="${link}" style="display:inline-block;background:#d76b51;color:#fff;padding:16px 25px;border-radius:9px;text-decoration:none;font-weight:bold;font-size:16px">LET’S GO →</a><p style="font-size:14px;color:#53656e;margin-top:24px">— ${safeName}</p></div>`;
   const text=`Hey ${recipientFirst},\n\nI’ll tell you five secrets about me. Want to see if we vibe?\n\nPick your answers to five quick ones. Then we'll show each other ours.\n\nLet's go: ${link}\n\n— ${senderFirst}`;
   try{await sendMail(theirEmail,`${senderFirst} has five secrets for you`,html,text,member.photo,`${senderFirst} via Chempatibility`)}catch(e){await sql`DELETE FROM invitations WHERE token_hash=${hash(token)}`;throw e}
   return json({ok:true,id:hash(token)});
  }
  return json({error:'Unknown action.'},400);
 }catch(e){console.error('Email invitation error:',e);return json({error:'Could not complete that request. Try again shortly.'},500)}
}
export default {fetch:handler};
