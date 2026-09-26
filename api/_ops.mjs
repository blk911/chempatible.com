// Shared moderation and activity helpers. Files starting with "_" are not deployed as their own routes.
import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';

export const ADMIN_EMAIL=(process.env.CHEMPAT_ADMIN_EMAIL||'blk911@gmail.com').trim().toLowerCase();
export const REPORT_REASONS={harassment:'Harassment or threats',fake:'Fake profile or impersonation',inappropriate:'Inappropriate photo or messages',safety:'Made me feel unsafe',underage:'May be under 18',other:'Something else'};
export const SUSPEND_DAYS=30;
// Launching email only: a cell number shows the owner's name on caller ID. Set CHEMPAT_SMS=on once SMS codes exist.
export const CELL_ENABLED=process.env.CHEMPAT_SMS==='on';
const hash=s=>createHash('sha256').update(s).digest('hex');

let ready;
export function ensureOps(sql){
 if(!ready)ready=(async()=>{
  await sql`CREATE TABLE IF NOT EXISTS activity (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), kind text NOT NULL, member_id uuid, connection_id text, detail jsonb NOT NULL DEFAULT '{}'::jsonb)`;
  await sql`CREATE INDEX IF NOT EXISTS activity_at_idx ON activity(at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS activity_member_idx ON activity(member_id, at DESC)`;
  await sql`CREATE TABLE IF NOT EXISTS reports (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), connection_id text NOT NULL, reporter_side text NOT NULL, reporter_member_id uuid, reporter_name text, reported_member_id uuid, reported_name text, reported_contact text, reason text NOT NULL, note text, chat jsonb NOT NULL DEFAULT '[]'::jsonb, status text NOT NULL DEFAULT 'open', reviewed_at timestamptz, UNIQUE(connection_id, reporter_side))`;
  await sql`CREATE INDEX IF NOT EXISTS reports_reported_idx ON reports(reported_member_id)`;
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS suspended_until timestamptz`;
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS blocked_at timestamptz`;
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS admin_notes jsonb NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE connection_state ADD COLUMN IF NOT EXISTS prospect_member_id uuid`;
  await sql`ALTER TABLE connection_state ADD COLUMN IF NOT EXISTS ended_at timestamptz`;
  await sql`ALTER TABLE connection_state ADD COLUMN IF NOT EXISTS ended_by text`;
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS email_verified_at timestamptz`;
 })().catch(error=>{ready=undefined;throw error});
 return ready;
}

// Activity logging never breaks the action being logged.
export async function log(sql,kind,{member=null,connection=null,detail={}}={}){
 try{await ensureOps(sql);await sql`INSERT INTO activity(kind,member_id,connection_id,detail) VALUES(${kind},${member},${connection},${JSON.stringify(detail)}::jsonb)`}
 catch(error){console.error('Activity log error:',kind,error)}
}

const pausedMessage=until=>`Your account is paused until ${new Date(until).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}.`;
const BLOCKED='This account can no longer play Chempatibility.';
function verdict(row){
 if(!row)return null;
 if(row.blocked_at)return {error:BLOCKED};
 if(row.suspended_until&&new Date(row.suspended_until).getTime()>Date.now())return {error:pausedMessage(row.suspended_until)};
 return null;
}
// Returns null when the member may play, otherwise {error}.
export async function standing(sql,memberId){
 if(!memberId)return null;
 await ensureOps(sql);
 const rows=await sql`SELECT suspended_until,blocked_at FROM members WHERE id=${memberId}`;
 return verdict(rows[0]);
}
export async function standingByContact(sql,contact){
 if(!contact)return null;
 await ensureOps(sql);
 const rows=await sql`SELECT suspended_until,blocked_at FROM members WHERE contact=${contact} AND (blocked_at IS NOT NULL OR suspended_until>now()) LIMIT 1`;
 return verdict(rows[0]);
}
// Members prove their email with a code before they can show a code, invite, ask to connect, or message.
export const NEEDS_VERIFY={error:'Confirm your email first. We sent you a code.',needsVerify:true};
export async function requireVerified(sql,memberId){
 if(!memberId)return null;
 await ensureOps(sql);
 const rows=await sql`SELECT email_verified_at FROM members WHERE id=${memberId}`;
 return rows[0]&&!rows[0].email_verified_at?NEEDS_VERIFY:null;
}
export async function markVerified(sql,email){
 try{await ensureOps(sql);await sql`UPDATE members SET email_verified_at=coalesce(email_verified_at,now()) WHERE contact=${email}`}
 catch(error){console.error('Mark verified error:',error)}
}
export async function memberIdFromToken(sql,token){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;
 const rows=await sql`SELECT id FROM members WHERE session_hash=${hash(token)}`;
 return rows[0]?.id||null;
}
// Ties the person who answered an invitation to their member page, so reports add up per person.
export async function linkProspect(sql,connectionId,memberToken){
 try{
  const id=await memberIdFromToken(sql,memberToken);if(!id)return;
  await ensureOps(sql);
  await sql`UPDATE connection_state SET prospect_member_id=${id} WHERE invitation_hash=${connectionId} AND prospect_member_id IS NULL`;
 }catch(error){console.error('Link prospect error:',error)}
}

export function strikeAction(strikes){return strikes>=4?'block':strikes===3?'suspend':'flag'}

export async function sendMail(to,subject,text){
 if(!process.env.SENDGRID_API_KEY)throw Error('Email is not configured.');
 const res=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{authorization:`Bearer ${process.env.SENDGRID_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({personalizations:[{to:[{email:to}]}],from:{email:'hello@chempatible.com',name:'Chempatibility'},subject,content:[{type:'text/plain',value:text}]})});
 if(!res.ok)throw Error(`Email provider returned ${res.status}`);
}

// Ends a connection for both people. With a report, files it against the other person and applies strikes.
export async function endConnection(sql,{id,side,actorId,report}){
 await ensureOps(sql);
 const rows=await sql`SELECT i.token_hash,i.sender_member_id,i.sender_name,i.sender_email,c.status,c.prospect_member_id,c.prospect_name,c.prospect_email,c.prospect_phone,c.messages FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.token_hash=${id}`;
 const row=rows[0];if(!row)return {status:404,body:{error:'Connection not found.'}};
 const reporterName=side==='member'?row.sender_name:row.prospect_name;
 let filed=null;
 if(report){
  const reason=String(report.reason||''),note=String(report.note||'').trim().slice(0,1000);
  if(!REPORT_REASONS[reason])return {status:400,body:{error:'Choose a reason for your report.'}};
  let reportedId=side==='member'?row.prospect_member_id:row.sender_member_id;
  const reportedName=side==='member'?row.prospect_name:row.sender_name;
  const reportedContact=side==='member'?(row.prospect_email||row.prospect_phone):row.sender_email;
  if(!reportedId&&reportedContact){const match=await sql`SELECT id FROM members WHERE contact=${reportedContact} LIMIT 1`;reportedId=match[0]?.id||null}
  const inserted=await sql`INSERT INTO reports(id,connection_id,reporter_side,reporter_member_id,reporter_name,reported_member_id,reported_name,reported_contact,reason,note,chat) VALUES(${randomUUID()},${id},${side},${actorId||null},${reporterName||null},${reportedId},${reportedName||null},${reportedContact||null},${reason},${note||null},${JSON.stringify(row.messages||[])}::jsonb) ON CONFLICT (connection_id,reporter_side) DO NOTHING RETURNING id`;
  if(!inserted[0])return {status:409,body:{error:'You already reported this connection.'}};
  filed={id:inserted[0].id,reason,note,reportedId,reportedName,reportedContact};
 }
 if(!['ended','declined'].includes(row.status))await sql`UPDATE connection_state SET status='ended',ended_at=now(),ended_by=${side},updated_at=now() WHERE invitation_hash=${id}`;
 await log(sql,report?'report':'unmatch',{member:actorId||null,connection:id,detail:{side,previous:row.status,...(filed?{reason:filed.reason,reported:filed.reportedId,report:filed.id}:{})}});
 if(filed)await applyStrikes(sql,filed,reporterName,id);
 return {status:200,body:{ok:true,status:row.status==='declined'?'declined':'ended'}};
}

async function applyStrikes(sql,filed,reporterName,connectionId){
 let strikes=null,action='flag';
 if(filed.reportedId){
  const counted=await sql`SELECT count(*)::int AS n FROM reports WHERE reported_member_id=${filed.reportedId} AND status<>'dismissed'`;
  strikes=counted[0]?.n||1;action=strikeAction(strikes);
  const note={at:new Date().toISOString(),by:'system',text:`Report ${strikes}: ${REPORT_REASONS[filed.reason]} (from ${reporterName||'a member'}).${action==='suspend'?` Auto-suspended ${SUSPEND_DAYS} days.`:action==='block'?' Auto-blocked.':''}`,report:filed.id};
  await sql`UPDATE members SET admin_notes=admin_notes || ${JSON.stringify([note])}::jsonb WHERE id=${filed.reportedId}`;
  if(action==='suspend'){await sql`UPDATE members SET suspended_until=now()+${`${SUSPEND_DAYS} days`}::interval WHERE id=${filed.reportedId} AND blocked_at IS NULL`;await log(sql,'auto_suspend',{member:filed.reportedId,connection:connectionId,detail:{strikes,days:SUSPEND_DAYS}})}
  if(action==='block'){await sql`UPDATE members SET blocked_at=coalesce(blocked_at,now()) WHERE id=${filed.reportedId}`;await log(sql,'auto_block',{member:filed.reportedId,connection:connectionId,detail:{strikes}})}
 }
 try{await sendMail(ADMIN_EMAIL,`Chempatibility report: ${filed.reportedName||'unknown member'}${strikes?` (strike ${strikes})`:''}`,
  `${reporterName||'A member'} reported ${filed.reportedName||'someone'} (${filed.reportedContact||'no contact on file'}).\n\nReason: ${REPORT_REASONS[filed.reason]}\n${filed.note?`Note: ${filed.note}\n`:''}\n${strikes?`Strikes: ${strikes}. Action: ${action==='suspend'?`suspended ${SUSPEND_DAYS} days`:action==='block'?'blocked':'flagged for review'}.`:'Not linked to a member page yet. Review it in admin.'}\n\nhttps://chempatible.com/admin#reports`)}
 catch(error){console.error('Report alert error:',error)}
}

// Admin sessions: a signed, expiring cookie. The key is the database secret unless ADMIN_SESSION_SECRET is set.
export const ADMIN_COOKIE='chempat_admin';
const adminKey=()=>process.env.ADMIN_SESSION_SECRET||process.env.DATABASE_URL||'';
export function signAdmin(email,expires){return `${expires}.${createHmac('sha256',adminKey()).update(`admin|${email}|${expires}`).digest('hex')}`}
export function readAdmin(req){
 const value=(req.headers.get('cookie')||'').match(/(?:^|;\s*)chempat_admin=(\d+)\.([a-f0-9]{64})(?:;|$)/);
 if(!value||!adminKey())return null;
 const expires=Number(value[1]);if(!(expires>Date.now()))return null;
 const expected=Buffer.from(signAdmin(ADMIN_EMAIL,expires).split('.')[1],'hex'),given=Buffer.from(value[2],'hex');
 return expected.length===given.length&&timingSafeEqual(expected,given)?ADMIN_EMAIL:null;
}
