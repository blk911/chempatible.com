import {createHash,randomUUID} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {reviewGate} from './_review.mjs';
import {readProfileBody} from './_member-profile.mjs';
import {DATE_CARD_TITLES,DATE_CARD_LIMITS,dateCardRequest,validDateCardId,validConnectionId,projectDateCardMessage} from './_datecards.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin','referrer-policy':'no-referrer'};
const reply=(data,status=200)=>Response.json(data,{status,headers});
const sessionChanged=()=>reply({error:'Your sign-in or account standing changed. Refresh your page before continuing.',sessionExpired:true},403);
const standing=alias=>`${alias}.email_verified_at IS NOT NULL AND ${alias}.blocked_at IS NULL AND (${alias}.suspended_until IS NULL OR ${alias}.suspended_until<=now())`;
const LOOKUP=`SELECT m.id FROM members m WHERE m.session_hash=$1 AND ${standing('m')}`;
const AUTH=`${LOOKUP} AND m.id=$2::uuid`;
// A genuine accepted member pair is enough: this intentionally has no reward,
// answer-count or normal-chat gate. Both counterpart rows must still exist.
const PAIR_HASH="encode(sha256(convert_to(i.sender_member_id::text||':'||c.prospect_member_id::text||':'||i.channel,'UTF8')),'hex')";
const PAIR=`SELECT c.invitation_hash,c.messages,${PAIR_HASH} AS pair_hash,CASE WHEN a.id=i.sender_member_id THEN 'member' ELSE 'prospect' END AS side
 FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash
 JOIN (${AUTH}) a ON a.id IN(i.sender_member_id,c.prospect_member_id)
 JOIN members sender ON sender.id=i.sender_member_id JOIN members prospect ON prospect.id=c.prospect_member_id
 WHERE i.token_hash=$3 AND i.sender_member_id<>c.prospect_member_id
 AND ((i.channel<>'friend' AND c.status IN ('firstResults','request','secondFive','nextResults','chatRequested','chat','secondResults','email','tests'))
 OR (i.channel='friend' AND c.status='chat' AND c.claim_hash IS NULL AND EXISTS(SELECT 1 FROM game_piece_pairs p WHERE p.invitation_hash=i.token_hash AND p.connection_kind='friend' AND p.sender_member_id=i.sender_member_id AND p.prospect_member_id=c.prospect_member_id)))
 AND c.ended_at IS NULL
 AND NOT (i.channel='qr' AND c.claim_hash IS NULL AND coalesce(i.expires_at<=now(),true))
 AND (i.intended_member_id IS NULL OR i.intended_member_id=c.prospect_member_id)
 AND (i.intended_member_id IS NOT NULL OR i.intended_email IS NULL OR lower(prospect.contact)=lower(i.intended_email))
 AND NOT EXISTS(SELECT 1 FROM game_piece_pairs p WHERE p.invitation_hash=i.token_hash AND (p.sender_member_id<>i.sender_member_id OR p.prospect_member_id<>c.prospect_member_id OR p.connection_kind<>CASE WHEN i.channel='friend' THEN 'friend' ELSE 'vibe' END))
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.messages) AS bound(item) WHERE item->>'type'='dateCard' AND item->>'_dateCardPair' IS DISTINCT FROM ${PAIR_HASH})
 AND ${standing('sender')} AND ${standing('prospect')}
 AND NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_id=i.sender_member_id AND b.blocked_id=c.prospect_member_id) OR (b.blocked_id=i.sender_member_id AND b.blocker_id=c.prospect_member_id))
 AND NOT EXISTS(SELECT 1 FROM connection_visibility v WHERE v.invitation_hash=i.token_hash AND v.member_id IN(i.sender_member_id,c.prospect_member_id) AND (v.frozen_at IS NOT NULL OR v.trashed_at IS NOT NULL))`;
const VIEW=`WITH eligible AS (${PAIR}) SELECT e.side,coalesce((SELECT jsonb_agg(item ORDER BY position) FROM jsonb_array_elements(e.messages) WITH ORDINALITY AS entry(item,position) WHERE item->>'type'='dateCard' AND item->'card'->>'status' IN ('pending','accepted')),'[]'::jsonb) AS cards FROM eligible e`;
// Use the same ascending member-lock order as block/freeze/delete and existing
// connection writers. A separate connection lock and later statement ensure a
// fresh READ COMMITTED snapshot after every wait, with no read/replace race.
const MEMBER_LOCKS=`SELECT id FROM members WHERE id=$1::uuid OR id IN (
 SELECT i.sender_member_id FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.token_hash=$2 AND $1::uuid IN(i.sender_member_id,c.prospect_member_id)
 UNION SELECT c.prospect_member_id FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.token_hash=$2 AND $1::uuid IN(i.sender_member_id,c.prospect_member_id)
 ) ORDER BY id FOR UPDATE`;
const CONNECTION_LOCK=`SELECT c.invitation_hash FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.token_hash=$2 AND $1::uuid IN(i.sender_member_id,c.prospect_member_id) FOR UPDATE OF c`;
// $4 action, $5 request UUID, $6 request fingerprint, $7 card UUID, $8 expected
// version, $9 editable fields, $10 server-owned catalog titles. Receipts never expire or get evicted. The bound
// per-card edit cap therefore cannot turn an old lost-response retry into a new
// mutation. Fingerprints include the bound actor, connection and normalized data.
// Cancellation has one reserved final receipt beyond the edit cap. Its terminal
// tombstone prevents another append, while preserving every prior retry receipt.
const WRITE=`WITH eligible AS (${PAIR}),items AS (
 SELECT e.side,entry.item,entry.position FROM eligible e CROSS JOIN LATERAL jsonb_array_elements(e.messages) WITH ORDINALITY AS entry(item,position)
),cards AS (SELECT * FROM items WHERE item->>'type'='dateCard'),receipts AS (
 SELECT receipt FROM cards CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(item->'_dateCardRequests')='array' THEN item->'_dateCardRequests' ELSE '[]'::jsonb END) AS r(receipt) WHERE receipt->>'id'=$5
),target AS (SELECT * FROM cards WHERE item->>'id'=$7),decision AS (
 SELECT CASE
 WHEN NOT EXISTS(SELECT 1 FROM eligible) THEN 'unavailable'
 WHEN EXISTS(SELECT 1 FROM receipts WHERE receipt->>'digest' IS DISTINCT FROM $6) THEN 'requestConflict'
 WHEN EXISTS(SELECT 1 FROM receipts WHERE receipt->>'digest'=$6) THEN 'retry'
 WHEN $4='send' AND (SELECT count(*) FROM cards)>=${DATE_CARD_LIMITS.cards} THEN 'cardLimit'
 WHEN $4='send' AND (SELECT count(*) FROM cards WHERE item->>'by'=side AND item->>'at'>=to_char((now()-interval '1 hour') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS'))>=${DATE_CARD_LIMITS.hourly} THEN 'rateLimit'
 WHEN $4<>'send' AND NOT EXISTS(SELECT 1 FROM target) THEN 'missing'
 WHEN $4<>'send' AND (SELECT item->'card'->>'status' FROM target) IS NOT DISTINCT FROM 'cancelled' THEN 'cancelled'
 WHEN $4<>'send' AND (SELECT item->'card'->>'version' FROM target) IS DISTINCT FROM $8::text THEN 'versionConflict'
 WHEN $4<>'send' AND (SELECT coalesce(item->'card'->>'status','') FROM target) NOT IN ('pending','accepted') THEN 'versionConflict'
 WHEN $4='accept' AND (SELECT item->'card'->>'status' FROM target) IS DISTINCT FROM 'pending' THEN 'versionConflict'
 WHEN $4='accept' AND (SELECT item->'card'->>'proposer' FROM target) IS NOT DISTINCT FROM (SELECT side FROM eligible) THEN 'ownProposal'
 WHEN $4 NOT IN ('send','cancel') AND (SELECT jsonb_array_length(coalesce(item->'_dateCardRequests','[]'::jsonb)) FROM target)>=${DATE_CARD_LIMITS.receipts} THEN 'editLimit'
 ELSE 'write' END AS result
),proposal AS (
 SELECT e.*,CASE WHEN $4='cancel' THEN (SELECT item->'card' FROM target)||jsonb_build_object('status','cancelled','version',$8::integer+1,'cancelledBy',e.side,'updatedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
 WHEN $4='accept' THEN (SELECT item->'card' FROM target)||jsonb_build_object('status','accepted','version',$8::integer+1,'acceptedBy',e.side,'updatedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
 ELSE $9::jsonb||jsonb_build_object('status','pending','version',CASE WHEN $4='send' THEN 1 ELSE $8::integer+1 END,'proposer',e.side,'updatedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) END AS card
 FROM eligible e
),envelope AS (
 SELECT p.*,concat('Date invitation ',card->>'status',': ',coalesce($10::jsonb->>(card->>'ideaId'),'Date'),
  CASE WHEN coalesce(card->>'date','')<>'' THEN E'\\nWhen: '||(card->>'date') ELSE '' END,
  CASE WHEN coalesce(card->>'place','')<>'' THEN E'\\nWhere: '||(card->>'place') ELSE '' END,
  CASE WHEN coalesce(card->>'note','')<>'' THEN E'\\nNote: '||(card->>'note') ELSE '' END,
  E'\\nProposed by: ',card->>'proposer',CASE WHEN card->>'acceptedBy' IN ('member','prospect') THEN E'\\nAccepted by: '||(card->>'acceptedBy') ELSE '' END,
  CASE WHEN card->>'status'='cancelled' THEN E'\\nCancelled by: '||(card->>'cancelledBy') ELSE '' END) AS summary
 FROM proposal p
),saved AS (
 UPDATE connection_state c SET messages=CASE WHEN $4='send' THEN c.messages||jsonb_build_array(jsonb_build_object(
  'type','dateCard','id',$7::text,'by',e.side,'at',e.card->>'updatedAt','text',e.summary,'card',e.card,'_dateCardPair',e.pair_hash,
  '_dateCardRequests',jsonb_build_array(jsonb_build_object('id',$5::text,'digest',$6::text))))
 ELSE (SELECT jsonb_agg(CASE WHEN entry.item->>'type'='dateCard' AND entry.item->>'id'=$7 THEN entry.item||jsonb_build_object(
  'card',e.card,'text',e.summary,'_dateCardRequests',coalesce(entry.item->'_dateCardRequests','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',$5::text,'digest',$6::text))) ELSE entry.item END ORDER BY entry.position)
  FROM jsonb_array_elements(c.messages) WITH ORDINALITY AS entry(item,position)) END,updated_at=now()
 FROM envelope e,decision d WHERE c.invitation_hash=e.invitation_hash AND d.result='write' RETURNING c.invitation_hash
) SELECT d.result,EXISTS(SELECT 1 FROM saved) AS saved FROM decision d`;
async function view(sql,params){
 const row=(await sql.query(VIEW,params))[0];return row?{cards:row.cards.map(projectDateCardMessage).filter(Boolean),side:row.side}:null;
}
async function handler(req){
 const blocked=reviewGate();if(blocked)return blocked;
 if(!['GET','POST'].includes(req.method))return reply({error:'Method not allowed.'},405);
 if(!process.env.DATABASE_URL)return reply({error:'Shared date cards are unavailable.'},503);
 const token=(req.headers.get('cookie')||'').match(/(?:^|;\s*)chempat_member=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!token)return reply({error:'Sign in to open shared date cards.',sessionExpired:true},401);
 const expected=req.headers.get('x-chempat-member-id');
 if((req.method==='POST'||expected!==null)&&!validDateCardId(expected))return sessionChanged();
 if(req.method==='POST'){
  const origin=req.headers.get('origin');
  if(origin&&origin!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Open your member page to share a date card.'},403);
  if((req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')return reply({error:'Use the date-card controls to make this change.'},415);
 }
 const sql=neon(process.env.DATABASE_URL),session=hash(token);
 try{
  const actor=(await sql.query(LOOKUP,[session]))[0];if(!actor||expected!==null&&expected!==actor.id)return sessionChanged();
  if(req.method==='GET'){
   const id=new URL(req.url).searchParams.get('id');if(!validConnectionId(id))return reply({error:'Choose an active connection.'},400);
   const data=await view(sql,[session,actor.id,id]);return data?reply(data):reply({error:'This connection is unavailable.'},404);
  }
  let raw;try{raw=await readProfileBody(req,16384)}catch(error){return reply({error:error.status===413?'Request too large.':'Invalid request.'},error.status||400)}
  const body=dateCardRequest(raw);if(!body)return reply({error:'Choose a date idea and valid details. Place is limited to 160 characters and note to 500.'},400);
  const params=[session,actor.id,body.id],digest=hash(JSON.stringify({actor:actor.id,...body}));
  const fields=['send','change'].includes(body.action)?{ideaId:body.ideaId,date:body.date,place:body.place,note:body.note}:{};
  const results=await sql.transaction(tx=>[
   tx.query(MEMBER_LOCKS,params.slice(1)),tx.query(CONNECTION_LOCK,params.slice(1)),tx.query(AUTH,params.slice(0,2)),
   tx.query(WRITE,[...params,body.action,body.requestId,digest,body.cardId||randomUUID(),body.version||0,JSON.stringify(fields),JSON.stringify(DATE_CARD_TITLES)])
  ],{isolationLevel:'ReadCommitted'});
  if(!results[2].length)return sessionChanged();
  const decision=results[3][0];
  if(!decision||decision.result==='unavailable')return reply({error:'This connection is unavailable.'},404);
  if(['missing','cancelled'].includes(decision.result)){
   const data=await view(sql,params);
   return data?reply({...data,error:decision.result==='cancelled'?'This date invitation was cancelled.':'This date card is no longer available.',dateCardConflict:true},409):reply({error:'This connection is unavailable.'},404);
  }
  if(decision.result==='requestConflict')return reply({error:'That request was already used for different details. Reload the date card before trying again.',dateCardConflict:true},409);
  if(decision.result==='ownProposal')return reply({error:'The other person needs to accept your proposal.',dateCardConflict:true},409);
  if(decision.result==='versionConflict')return reply({error:'This date card changed. Reload it and review the latest proposal.',dateCardConflict:true},409);
  if(decision.result==='rateLimit')return reply({error:'Please wait before sending more date invitations.'},429);
  if(['cardLimit','editLimit'].includes(decision.result))return reply({error:decision.result==='editLimit'?'This card has reached its edit limit. Send a new invitation.':'This connection has reached its date-card limit.',dateCardLimit:true},409);
  if(decision.result!=='retry'&&!decision.saved)return reply({error:'This date card changed. Reload it before trying again.',dateCardConflict:true},409);
  // Never use the earlier authorized snapshot as a response after committing.
  const data=await view(sql,params);return data?reply(data):reply({error:'This connection is unavailable.'},404);
 }catch(error){console.error('Date card request failed.');return reply({error:'Could not load or save shared date cards. Try again.'},503)}
}
export default {fetch:handler};
