import {createHash,randomBytes} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import * as ops from './_ops.mjs';
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
async function connectionRow(sql,id){const rows=await sql`SELECT i.token_hash,i.created_at,i.sender_name,i.sender_photo,i.sender_answers,i.recipient_name,i.recipient_email,i.sender_member_id,i.sender_email,i.channel,i.expires_at,c.claim_hash,c.prospect_member_id,c.prospect_name,c.prospect_photo,c.prospect_answers,c.prospect_phone,c.prospect_email,c.status,c.messages FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.token_hash=${id}`;return rows[0]||null}
const friend=row=>row.channel==='friend';
const expired=row=>((row.channel==='qr'&&!row.claim_hash)||(friend(row)&&!row.prospect_member_id))&&new Date(row.expires_at).getTime()<=Date.now();
async function ownInvitation(sql,body,req){
 const token=typeof body==='string'?body:body.token,id=validToken(token)?hash(token):body.id;
 if(!validToken(id))return null;
 const row=await connectionRow(sql,id);if(!row||expired(row))return null;
 const member=await senderMember(req,sql);
 // Friend links are previews only. Account binding after explicit acceptance is the sole chat authority.
 if(friend(row))return member&&row.prospect_member_id===member?row:null;
 // A linked account is the recovery authority; neither a forwarded token nor an old claim cookie can take it over.
 if(row.prospect_member_id)return member===row.prospect_member_id?row:null;
 if(!validToken(token))return null;
 if(row.channel==='qr'&&(!row.claim_hash||hash(cookie(req)[claimCookie(row.token_hash)]||'')!==row.claim_hash))return null;
 return row;
}
const closed=row=>['ended','declined'].includes(row.status);
const allRevealed=row=>!closed(row)&&['nextResults','secondResults','chatRequested','chat','email','tests'].includes(row.status)&&(row.prospect_answers||[]).length===10&&(row.sender_answers||[]).length===10;
const shared=row=>!closed(row)&&['email','tests'].includes(row.status);
const canChat=row=>['chat','secondResults','email','tests'].includes(row.status);
// The old secondResults state already enabled chat. New rounds use an internal
// marker so upgrading preserves access to existing conversations.
const publicStatus=row=>row.status==='nextResults'?'secondResults':row.status==='secondResults'?'chat':row.status;
function prospectView(row){if(friend(row))return {id:row.token_hash,kind:'friend',invitedAt:row.created_at||null,side:'prospect',name:row.sender_name,photo:row.sender_photo,answers:[],recipientName:'',prospectName:row.prospect_name,prospectPhoto:row.prospect_photo,prospectAnswers:[],prospectPhone:null,prospectEmail:null,status:publicStatus(row),memberSecondDone:false,prospectSecondDone:false,messages:canChat(row)?row.messages:[]};const answers=closed(row)||row.status==='invited'?[]:allRevealed(row)?row.sender_answers:row.sender_answers.slice(0,5);return {id:row.token_hash,invitedAt:row.created_at||null,side:'prospect',name:row.sender_name,photo:row.sender_photo,answers,recipientName:row.recipient_name,prospectName:row.prospect_name,prospectPhoto:row.prospect_photo,prospectAnswers:closed(row)?[]:row.prospect_answers,prospectPhone:null,prospectEmail:shared(row)?row.prospect_email:null,status:publicStatus(row),memberSecondDone:row.sender_answers.length===10,prospectSecondDone:row.prospect_answers.length===10,messages:canChat(row)?row.messages:[]}}
function inboxView(row,side){if(friend(row)){const view=prospectView(row);return {id:row.id||row.token_hash,kind:'friend',channel:'friend',invitedAt:row.created_at||null,side,recipient_name:'',recipient_email:null,claimed:!!row.prospect_member_id,prospect_name:row.prospect_name,prospect_photo:row.prospect_photo,prospect_answers:[],prospect_phone:null,prospect_email:null,status:publicStatus(row),memberSecondDone:false,prospectSecondDone:false,own_answers:[],messages:view.messages,...(side==='prospect'?{...view,sender_name:row.sender_name,sender_photo:row.sender_photo,sender_answers:[]}: {})}}const view=prospectView(row),full=allRevealed(row);return {id:row.id||row.token_hash,invitedAt:row.created_at||null,side,recipient_name:row.recipient_name,recipient_email:null,channel:row.channel,claimed:!!row.claimed,prospect_name:row.prospect_name,prospect_photo:row.prospect_photo,prospect_answers:closed(row)?[]:(row.prospect_answers||[]).slice(0,full?10:5),prospect_phone:null,prospect_email:shared(row)?row.prospect_email:null,status:publicStatus(row),memberSecondDone:view.memberSecondDone,prospectSecondDone:view.prospectSecondDone,own_answers:closed(row)?[]:side==='prospect'?row.prospect_answers:row.sender_answers,messages:view.messages,...(side==='prospect'?{...view,sender_name:row.sender_name,sender_photo:row.sender_photo,sender_answers:view.answers}: {})}}
async function participant(sql,body,req){
 if(body.token){const row=await ownInvitation(sql,body,req);return row?{row,id:row.token_hash,invitedAt:row.created_at||null,side:'prospect'}:null}
 if(!validToken(body.id))return null;
 const row=await connectionRow(sql,body.id);if(!row||expired(row))return null;
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
    if(friend(row)){const own=await ownInvitation(sql,token,req);return own?reply(prospectView(own)):reply({error:'Open your linked member page to see this friend connection.'},403)}
    if(row.prospect_member_id){const own=await ownInvitation(sql,token,req);return own?reply(prospectView(own)):reply({error:'Sign in to the member page linked to this connection.'},403)}
    if(row.channel!=='qr')return reply(prospectView(row));
    const guest=cookie(req)[claimCookie(id)];
    if(row.claim_hash)return guest&&hash(guest)===row.claim_hash?reply(prospectView(row)):reply({error:'This code is already in play on another phone.'},409);
    if(new Date(row.expires_at).getTime()<=Date.now())return reply({error:'This code expired. Ask for a fresh one.'},410);
    const member=await senderMember(req,sql);
    if(member&&member===row.sender_member_id)return reply({error:'Show this code to the other person on their phone.'},409);
    const claim=randomBytes(32).toString('hex');
    const claimed=await sql`UPDATE connection_state SET claim_hash=${hash(claim)},updated_at=now() WHERE invitation_hash=${id} AND claim_hash IS NULL AND EXISTS (SELECT 1 FROM invitations WHERE token_hash=${id} AND expires_at>now()) RETURNING claim_hash`;
    if(!claimed[0])return reply({error:'This code is already in play or has expired.'},409);
    await ops.log(sql,'qr_scanned',{member:row.sender_member_id,connection:id});
    return Response.json(prospectView(row),{headers:{'cache-control':'no-store','set-cookie':`${claimCookie(id)}=${claim}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=15552000`}});
   }
   if(url.searchParams.has('inbox')){
    const sender=await senderEmail(req,sql),member=await senderMember(req,sql);
    if(cookie(req).chempat_member&&!member)return reply({error:'Your sign-in expired. Sign in again to see your connections.',sessionExpired:true},401);
    if(!sender&&!member)return reply({error:'Open your member page to see connections.'},401);
    const rows=await sql`SELECT i.token_hash AS id,i.token_hash,i.created_at,i.sender_name,i.sender_photo,i.sender_answers,i.sender_email,i.sender_member_id,i.recipient_name,i.recipient_email,i.channel,(c.claim_hash IS NOT NULL) AS claimed,c.prospect_member_id,c.prospect_name,c.prospect_photo,c.prospect_answers,c.prospect_phone,c.prospect_email,c.status,c.messages FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE (i.sender_member_id=${member} OR c.prospect_member_id=${member} OR (i.sender_member_id IS NULL AND i.sender_email=${sender||''})) AND (i.channel<>'qr' OR c.claim_hash IS NOT NULL OR i.expires_at>now()) AND (i.channel<>'friend' OR c.prospect_member_id IS NOT NULL OR i.expires_at>now()) AND (i.channel<>'friend' OR c.status<>'declined' OR c.claim_hash IS NULL) ORDER BY i.created_at DESC LIMIT 50`;
    return reply({connections:rows.map(r=>inboxView(r,member&&r.prospect_member_id===member?'prospect':'member'))});
   }
   return reply({error:'Missing connection.'},400);
  }
  if(req.method!=='POST')return reply({error:'Method not allowed.'},405);
  let body;try{body=await req.json()}catch{return reply({error:'Invalid request.'},400)}
  if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'Invalid request.'},400);
  const actor=await senderMember(req,sql);
  if(!actor&&!['unmatch','report'].includes(body.action))return reply({error:'Open your member page to continue.'},401);
  if(!['unmatch','report'].includes(body.action)){const paused=await ops.standing(sql,actor);if(paused)return reply(paused,403)}
  // Scanners can reveal their first five before confirming their email; everything after needs it.
  if(['request','decision','message','react','second','email','chat'].includes(body.action)){const unproven=await ops.requireVerified(sql,actor);if(unproven)return reply(unproven,403)}
  // Derive connection kind from storage so client fields cannot unlock romantic actions for friends.
  if(['first','request','decision','second','chat','email'].includes(body.action)){
   const target=validToken(body.token)?hash(body.token):body.id;
   const row=validToken(target)?await connectionRow(sql,target):null;
   if(row&&friend(row))return reply({error:'Friends connect through their friend invitation. Romantic sharing is unavailable here.'},409);
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
   const updated=await sql`UPDATE connection_state SET prospect_name=${visitorName},prospect_photo=${body.photo},prospect_answers=${JSON.stringify(body.answers)}::jsonb,prospect_member_id=${prospect},status='firstResults',updated_at=now() WHERE invitation_hash=${row.token_hash} AND status=${row.status} RETURNING status`;
   if(!updated[0])return reply({error:'This connection has moved on.'},409);
   await ops.linkProspect(sql,row.token_hash,memberToken);await ops.log(sql,'first_five',{member:actor,connection:row.token_hash});
   return reply({ok:true,answers:row.sender_answers.slice(0,5)});
  }
  if(body.action==='request'){
   const row=await ownInvitation(sql,body,req),name=String(body.name||'').trim(),contact=String(body.contact||body.phone||'').trim().toLowerCase();
   if(!row)return reply({error:'Invitation not found.'},404);
   const isEmail=validEmail(contact),isCell=ops.CELL_ENABLED&&!isEmail&&contact.length<=30&&contact.replace(/\D/g,'').length>=10;
   if(row.status!=='firstResults'||name.length<1||name.length>50||(!isEmail&&!isCell)||!validPhoto(body.photo))return reply({error:ops.CELL_ENABLED?'Add your name, picture, and an email or ten-digit cell number.':'Add your name, picture, and email.'},400);
   const updated=await sql`UPDATE connection_state SET prospect_name=${name},prospect_phone=${isCell?contact:null},prospect_email=${isEmail?contact:null},prospect_photo=${body.photo},status='request',updated_at=now() WHERE invitation_hash=${row.token_hash} AND status=${row.status} RETURNING status`;
   if(!updated[0])return reply({error:'This connection has moved on.'},409);
   await ops.linkProspect(sql,row.token_hash,cookie(req).chempat_member);await ops.log(sql,'request',{member:actor,connection:row.token_hash});
   return reply({ok:true});
  }
  if(body.action==='decision'){
   const who=await participant(sql,body,req);
   if(!who||who.side!=='member')return reply({error:'Connection not found.'},404);
   if(!['accept','decline'].includes(body.decision))return reply({error:'Invalid decision.'},400);
   if(!['request','chatRequested'].includes(who.row.status))return reply({error:'Request no longer pending.'},409);
   const next=body.decision==='decline'?'declined':who.row.status==='request'?'secondFive':'chat';
   const rows=await sql`UPDATE connection_state SET status=${next},updated_at=now() WHERE invitation_hash=${who.id} AND status=${who.row.status} RETURNING status`;
   if(rows[0])await ops.log(sql,body.decision==='accept'?'accept':'pass',{member:actor,connection:who.id});
   return rows[0]?reply({ok:true,status:rows[0].status}):reply({error:'Request no longer pending.'},409);
  }
  if(body.action==='chat'){
   const row=await ownInvitation(sql,body,req);if(!row)return reply({error:'Connection not found.'},404);
   if(row.status!=='nextResults'||(row.prospect_answers.length!==10||row.sender_answers.length!==10))return reply({error:'Finish both rounds before choosing chat.'},409);
   const rows=await sql`UPDATE connection_state SET status='chatRequested',updated_at=now() WHERE invitation_hash=${row.token_hash} AND status='nextResults' RETURNING status`;
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
    ?await sql`WITH locked AS (SELECT invitation_hash FROM connection_state WHERE invitation_hash=${id} AND status IN ('secondFive','chat') FOR UPDATE) UPDATE invitations i SET sender_answers=${JSON.stringify(body.answers)}::jsonb FROM locked c WHERE i.token_hash=c.invitation_hash AND jsonb_array_length(i.sender_answers)=5 RETURNING i.token_hash`
    :await sql`UPDATE connection_state SET prospect_answers=${JSON.stringify(body.answers)}::jsonb,updated_at=now() WHERE invitation_hash=${id} AND status IN ('secondFive','chat') AND jsonb_array_length(prospect_answers)=5 RETURNING invitation_hash`;
   if(!saved[0])return reply({error:'This connection has moved on.'},409);
   await sql`UPDATE connection_state c SET status=CASE WHEN c.status='chat' THEN 'chat' ELSE 'nextResults' END,updated_at=now() FROM invitations i WHERE c.invitation_hash=i.token_hash AND c.invitation_hash=${id} AND c.status IN ('secondFive','chat') AND jsonb_array_length(i.sender_answers)=10 AND jsonb_array_length(c.prospect_answers)=10 RETURNING c.status`;
   const latest=await connectionRow(sql,id);if(!latest||closed(latest))return reply({error:'This connection has ended.'},409);
   await ops.log(sql,'next_five',{member:actor,connection:id,detail:{side}});
   const other=side==='member'?latest.prospect_answers:latest.sender_answers;
   return reply({ok:true,status:publicStatus(latest),answers:other.slice(0,allRevealed(latest)?10:5),memberSecondDone:latest.sender_answers.length===10,prospectSecondDone:latest.prospect_answers.length===10});
  }
  if(body.action==='email'){
   const row=await ownInvitation(sql,body,req),address=String(body.email||'').trim().toLowerCase();
   if(!row)return reply({error:'Invitation not found.'},404);
   if(!['chat','secondResults','email','tests'].includes(row.status)||row.prospect_answers.length!==10||row.sender_answers.length!==10||!validEmail(address))return reply({error:'Choose chat together before sharing your email.'},400);
   const updated=await sql`UPDATE connection_state SET prospect_email=${address},status='email',updated_at=now() WHERE invitation_hash=${row.token_hash} AND status=${row.status} RETURNING status`;
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
    const rows=await sql`UPDATE connection_state SET messages=jsonb_set(messages,ARRAY[${String(index)}]::text[],(messages->${index}::int) || jsonb_build_object('reactions',coalesce(messages->${index}::int->'reactions','{}'::jsonb) || jsonb_build_object(${by}::text,${reaction}::text)),false),updated_at=now() WHERE invitation_hash=${id} AND status IN ('chat','secondResults','email','tests') AND jsonb_array_length(messages)>${index} RETURNING messages`;
    return rows[0]?reply({messages:rows[0].messages}):reply({error:'Message no longer available.'},409);
   }
   const message=String(body.text||'').trim(),photo=body.photo||null;
   if(message.length>500||photo&&!validPhoto(photo)||!message&&!photo)return reply({error:'Send a message under 500 characters or a photo.'},400);
   const item={by,text:message,at:new Date().toISOString(),...(photo?{photo}:{})};
   const rows=await sql`UPDATE connection_state SET messages=messages || ${JSON.stringify([item])}::jsonb,updated_at=now() WHERE invitation_hash=${id} AND status IN ('chat','secondResults','email','tests') RETURNING messages`;
   if(rows[0])await ops.log(sql,'message',{member:actor,connection:id,detail:{by,length:message.length,photo:!!photo}});
   return rows[0]?reply({messages:rows[0].messages}):reply({error:'Chat is not open yet.'},409);
  }
  if(body.action==='unmatch'||body.action==='report'){
   const who=await participant(sql,body,req);if(!who)return reply({error:'Connection not found.'},404);
   const {id,side}=who;
   const result=await ops.endConnection(sql,{id,side,actorId:actor,report:body.action==='report'?{reason:body.reason,note:body.note}:null});
   return reply(result.body,result.status);
  }
  return reply({error:'Unknown action.'},400);
 }catch(e){console.error('Connection error:',e);return reply({error:'Could not update the connection. Try again.'},500)}
}
export default {fetch:handler};
