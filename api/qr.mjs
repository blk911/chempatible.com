import {reviewGate} from './_review.mjs';
import {createHash,randomBytes} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import * as ops from './_ops.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const reply=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
export default {async fetch(req){
 const blocked=reviewGate();if(blocked)return blocked;
 if(req.method!=='POST')return reply({error:'Method not allowed.'},405);
 if(!process.env.DATABASE_URL)return reply({error:'Invitation storage is unavailable.'},503);
 const memberToken=(req.headers.get('cookie')||'').match(/(?:^|;\s*)chempat_member=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!memberToken)return reply({error:'Open your member page before showing your code.'},401);
 try{
  const sql=neon(process.env.DATABASE_URL);
  const rows=await sql`SELECT id,name,contact,photo,answers FROM members WHERE session_hash=${hash(memberToken)}`;
  const member=rows[0];
  if(!member||!Array.isArray(member.answers)||member.answers.length!==10)return reply({error:'Finish your ten secrets before showing a code.'},403);
  const paused=await ops.standing(sql,member.id)||await ops.requireVerified(sql,member.id);if(paused)return reply(paused,403);
  const token=randomBytes(32).toString('hex'),id=hash(token),url=new URL(`/?invite=${token}`,req.url).href;
  await sql`INSERT INTO invitations(token_hash,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,sender_member_id,channel,expires_at) VALUES(${id},${member.contact},${member.name},${member.photo},${JSON.stringify(member.answers)},${''},${''},${member.id},${'qr'},now()+interval '15 minutes')`;
  try{await sql`INSERT INTO connection_state(invitation_hash) VALUES(${id})`}catch(error){await sql`DELETE FROM invitations WHERE token_hash=${id}`;throw error}
  await ops.log(sql,'qr_created',{member:member.id,connection:id});
  return reply({id,url,expiresAt:new Date(Date.now()+15*60*1000).toISOString()});
 }catch(error){console.error('QR invitation error:',error);return reply({error:'Could not make your code. Try again.'},500)}
}};
