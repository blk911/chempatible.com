import {reviewGate,reviewRecipientAllowed} from './_review.mjs';
import {createHash,randomBytes,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import * as ops from './_ops.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const reply=(body,status=200,headers={})=>Response.json(body,{status,headers:{'cache-control':'no-store',...headers}});
const validPhoto=value=>typeof value==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)&&value.length<250000;
const validAnswers=value=>Array.isArray(value)&&[0,5,10].includes(value.length)&&value.every(answer=>Number.isInteger(answer)&&answer>=0&&answer<=2);
const validEmail=value=>value.length<=255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const cookieValue=(req,name)=>{const value=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1);return /^[a-f0-9]{64}$/.test(value||'')?value:null};
function withCookies(body,cookies){const headers=new Headers({'cache-control':'no-store','content-type':'application/json'});for(const c of cookies)headers.append('set-cookie',c);return new Response(JSON.stringify(body),{status:200,headers})}
// Email only: a cell number shows the owner's name on caller ID.
const validContact=value=>value.length<=255&&(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)||(ops.CELL_ENABLED&&value.length<=30&&value.replace(/\D/g,'').length>=10));
let schemaReady;
function ensureSchema(sql){
 if(!schemaReady)schemaReady=sql`CREATE TABLE IF NOT EXISTS members (
   id uuid PRIMARY KEY,
   session_hash text NOT NULL UNIQUE,
   name text NOT NULL,
   contact text NOT NULL,
   photo text NOT NULL,
   answers jsonb NOT NULL DEFAULT '[]'::jsonb,
   created_at timestamptz NOT NULL DEFAULT now(),
   updated_at timestamptz NOT NULL DEFAULT now()
 )`.catch(error=>{schemaReady=undefined;throw error});
 return schemaReady;
}
function tokenFrom(req){
 const match=(req.headers.get('cookie')||'').match(/(?:^|;\s*)chempat_member=([a-f0-9]{64})(?:;|$)/);
 return match?.[1]||null;
}
async function handler(req){
 const blocked=reviewGate();if(blocked)return blocked;
 if(!process.env.DATABASE_URL)return reply({error:'Member storage is unavailable.'},503);
 const sql=neon(process.env.DATABASE_URL);
 try{
  await ensureSchema(sql);
  const token=tokenFrom(req);
  if(req.method==='GET'){
   if(!token)return reply({error:'No member on this device.'},401);
   await ops.ensureOps(sql);
   const rows=await sql`SELECT id,name,contact,photo,answers,email_verified_at IS NOT NULL AS verified FROM members WHERE session_hash=${hash(token)}`;
   return rows[0]?reply({member:rows[0]}):reply({error:'Member not found.'},404);
  }
  if(req.method!=='POST')return reply({error:'Method not allowed.'},405);
  let body;try{body=await req.json()}catch{return reply({error:'Invalid request.'},400)}
  if(body.action==='register'){
   const name=String(body.name||'').trim(),contact=String(body.contact||'').trim().toLowerCase(),photo=body.photo,answers=body.answers||[];
   if(name.length<1||name.length>50||!validContact(contact)||!validPhoto(photo)||!validAnswers(answers))return reply({error:ops.CELL_ENABLED?'Add your first name, contact, and picture.':'Add your first name, email, and picture.'},400);
   if(body.agreed!==true)return reply({error:'Confirm you’re 18 or older and agree to the Terms and Privacy Policy.'},400);
   const paused=await ops.standingByContact(sql,contact);if(paused)return reply(paused,403);
   await ops.ensureOps(sql);
   const session=cookieValue(req,'chempat_session'),proven=session?(await sql`SELECT email FROM email_sessions WHERE token_hash=${hash(session)} AND expires_at>now()`)[0]?.email===contact:false;
   if(token){
    const existing=await sql`SELECT contact FROM members WHERE session_hash=${hash(token)}`;
    if(existing[0]&&existing[0].contact!==contact)return reply({error:'This device already has a different member page. Open this invitation in a private window.'},409);
    const rows=await sql`UPDATE members SET name=${name},contact=${contact},photo=${photo},answers=CASE WHEN jsonb_array_length(answers)>${answers.length} THEN answers ELSE ${JSON.stringify(answers)}::jsonb END,email_verified_at=CASE WHEN ${proven} THEN coalesce(email_verified_at,now()) ELSE email_verified_at END,updated_at=now() WHERE session_hash=${hash(token)} RETURNING id,name,contact,photo,answers,email_verified_at IS NOT NULL AS verified`;
    if(rows[0]){await ops.log(sql,'profile_updated',{member:rows[0].id});return reply({member:rows[0]})}
   }
   // One page per email: an address that already has a page signs in with a code instead.
   const taken=await sql`SELECT id FROM members WHERE contact=${contact} LIMIT 1`;
   if(taken[0])return reply({error:'That email already has a page. Enter the code we send to open it.',exists:true},409);
   const fresh=randomBytes(32).toString('hex');
   const rows=await sql`INSERT INTO members(id,session_hash,name,contact,photo,answers,email_verified_at) VALUES(${randomUUID()},${hash(fresh)},${name},${contact},${photo},${JSON.stringify(answers)}::jsonb,${proven?new Date().toISOString():null}) RETURNING id,name,contact,photo,answers,email_verified_at IS NOT NULL AS verified`;
   await ops.log(sql,'signup',{member:rows[0].id,detail:{channel:answers.length?'invitation':'direct'}});
   return reply({member:rows[0]},200,{'set-cookie':`chempat_member=${fresh}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=15552000`});
  }
  if(body.action==='answers'){
   if(!token)return reply({error:'Join the game first.'},401);
   if(!validAnswers(body.answers)||![5,10].includes(body.answers.length))return reply({error:'Complete your five secrets.'},400);
   const rows=await sql`UPDATE members SET answers=${JSON.stringify(body.answers)}::jsonb,updated_at=now() WHERE session_hash=${hash(token)} RETURNING id,name,contact,photo,answers,email_verified_at IS NOT NULL AS verified`;
   if(rows[0])await ops.log(sql,'ten_answered',{member:rows[0].id});
   return rows[0]?reply({member:rows[0]}):reply({error:'Member not found.'},404);
  }
  if(body.action==='logout'){
   const member=await ops.memberIdFromToken(sql,token);if(member)await ops.log(sql,'logout',{member});
   const session=cookieValue(req,'chempat_session');if(session)await sql`DELETE FROM email_sessions WHERE token_hash=${hash(session)}`;
   const names=new Set(['chempat_member','chempat_session',...((req.headers.get('cookie')||'').match(/chempat_pair_[a-f0-9]{16}/g)||[])]);
   return withCookies({ok:true},[...names].map(n=>`${n}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`));
  }
  // Email codes prove an address for sign-up, sign-in, and a scanner confirming before they connect.
  // Any valid address can get a code, so the reply never says whether a page exists.
  if(body.action==='code_start'||body.action==='signin_start'){
   const email=String(body.email||'').trim().toLowerCase();if(!validEmail(email))return reply({error:'Enter a valid email.'},400);
   if(!reviewRecipientAllowed(email))return reply({error:'Review email is limited to approved test recipients.',reviewOnly:true},403);
   const key=`member:${email}`;
   const recent=await sql`SELECT last_sent_at FROM email_codes WHERE email=${key}`;
   if(recent[0]&&Date.now()-new Date(recent[0].last_sent_at).getTime()<60000)return reply({error:'A code was just sent. Wait a minute before asking for another.'},429);
   const code=String(randomInt(100000,1000000));
   await sql`INSERT INTO email_codes(email,code_hash,expires_at,last_sent_at,attempts) VALUES(${key},${hash(code)},now()+interval '10 minutes',now(),0) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,last_sent_at=excluded.last_sent_at,attempts=0`;
   // The code leads the subject so it shows in the phone's notification.
   await ops.sendMail(email,`${code} is your Duh Wild code`,`Your Duh Wild code is ${code}. It expires in ten minutes.\n\nIf you didn't ask for it, you can ignore this email.`);
   return reply({ok:true});
  }
  if(body.action==='code_verify'||body.action==='signin_verify'){
   const email=String(body.email||'').trim().toLowerCase(),code=String(body.code||''),key=`member:${email}`;
   if(!validEmail(email)||!/^\d{6}$/.test(code))return reply({error:'Code expired or incorrect.'},400);
   const codes=await sql`UPDATE email_codes SET attempts=attempts+1 WHERE email=${key} AND expires_at>now() AND attempts<5 RETURNING code_hash`;
   if(!codes[0]||!timingSafeEqual(Buffer.from(hash(code)),Buffer.from(codes[0].code_hash)))return reply({error:'Code expired or incorrect.'},400);
   await sql`DELETE FROM email_codes WHERE email=${key}`;
   // The proven email also lets emailed invitations go out without another code.
   const session=randomBytes(32).toString('hex');
   await sql`INSERT INTO email_sessions(token_hash,email,expires_at) VALUES(${hash(session)},${email},now()+interval '30 days')`;
   const sessionCookie=`chempat_session=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;
   await ops.ensureOps(sql);
   // An email that already has a page opens it here; a new sign-in replaces the old one, so a page is open on one phone at a time.
   const fresh=randomBytes(32).toString('hex');
   const rows=await sql`UPDATE members SET session_hash=${hash(fresh)},email_verified_at=coalesce(email_verified_at,now()),updated_at=now() WHERE id=(SELECT id FROM members WHERE contact=${email} ORDER BY jsonb_array_length(answers) DESC,created_at ASC LIMIT 1) RETURNING id,name,contact,photo,answers,email_verified_at IS NOT NULL AS verified`;
   if(!rows[0])return withCookies({existing:false,email},[sessionCookie]);
   await ops.log(sql,'signin',{member:rows[0].id});
   return withCookies({existing:true,member:rows[0]},[`chempat_member=${fresh}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=15552000`,sessionCookie]);
  }
  return reply({error:'Unknown action.'},400);
 }catch(error){console.error('Member error:',error);return reply({error:'Could not save your page. Try again.'},500)}
}
export default {fetch:handler};
