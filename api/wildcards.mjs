import {createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {deploymentMode} from './_deployment.mjs';
import {expectedRewardMember,bindRewardMember} from './_reward-auth.mjs';
import {WILDCARD_LIMIT,WILDCARD_CATEGORIES,getWildcardQuestion} from './_wildcard-questions.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
const validId=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const validRequest=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(s);
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
const level=`greatest(coalesce(r.completed_level,0),CASE WHEN jsonb_array_length(m.answers)>=10 THEN 2 WHEN jsonb_array_length(m.answers)>=5 THEN 1 ELSE 0 END)`;
const AUTH=`SELECT m.id,${level} AS level FROM members m LEFT JOIN member_reward_state r ON r.member_id=m.id WHERE m.session_hash=$1 AND m.email_verified_at IS NOT NULL AND m.blocked_at IS NULL AND (m.suspended_until IS NULL OR m.suspended_until<=now())`;
// Match the established chat gate, including legacy secondResults chats. The new
// pre-consent nextResults/chatRequested states never qualify. Earning a personal
// level cannot open chat or bypass the other person's existing consent.
const PAIR=`SELECT i.token_hash,i.sender_member_id,c.prospect_member_id,e.id AS actor,e.level,
 CASE WHEN e.id=i.sender_member_id THEN 'member' ELSE 'prospect' END AS side
 FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash
 JOIN (${AUTH}) e ON e.id IN(i.sender_member_id,c.prospect_member_id)
 WHERE i.token_hash=$2 AND i.channel<>'friend'
 AND c.status IN ('chat','secondResults','email','tests') AND c.ended_at IS NULL
 AND i.sender_member_id IS NOT NULL AND c.prospect_member_id IS NOT NULL AND i.sender_member_id<>c.prospect_member_id
 AND (e.id=i.sender_member_id OR ((i.intended_member_id IS NULL OR i.intended_member_id=e.id)
 AND (i.intended_member_id IS NOT NULL OR i.intended_email IS NULL OR EXISTS(SELECT 1 FROM members target WHERE target.id=e.id AND lower(target.contact)=lower(i.intended_email)))))
 AND NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_id=i.sender_member_id AND b.blocked_id=c.prospect_member_id) OR (b.blocked_id=i.sender_member_id AND b.blocker_id=c.prospect_member_id))
 AND NOT EXISTS(SELECT 1 FROM connection_visibility v WHERE v.invitation_hash=i.token_hash AND (v.frozen_at IS NOT NULL OR v.trashed_at IS NOT NULL))
 AND (SELECT count(*) FROM members p WHERE p.id IN(i.sender_member_id,c.prospect_member_id) AND p.email_verified_at IS NOT NULL AND p.blocked_at IS NULL AND (p.suspended_until IS NULL OR p.suspended_until<=now()))=2`;
const pairBound=(sender,prospect)=>`${PAIR} AND i.sender_member_id=$${sender}::uuid AND c.prospect_member_id=$${prospect}::uuid`;
const snapshotQuery=(pair=PAIR,withRequest=false)=>`WITH eligible AS (${pair}) SELECT e.level,
 (SELECT count(*)::integer FROM connection_wildcard_asks w WHERE w.invitation_hash=$2 AND w.member_id=e.actor) AS used,
 coalesce((SELECT jsonb_agg(w.question_id ORDER BY w.created_at,w.question_id) FROM connection_wildcard_asks w WHERE w.invitation_hash=$2),'[]'::jsonb) AS used_question_ids
 ${withRequest?`,(SELECT jsonb_build_object('questionId',w.question_id,'message',w.message) FROM connection_wildcard_asks w WHERE w.invitation_hash=$2 AND w.member_id=e.actor AND w.request_id=$3) AS request`:''}
 FROM eligible e`;
function snapshot(row,id){
 const eligible=row.level>=3,usedQuestionIds=row.used_question_ids;
 return {connectionId:id,eligible,limit:WILDCARD_LIMIT,remaining:eligible?Math.max(0,WILDCARD_LIMIT-row.used):0,usedQuestionIds,
  // Keep stable positions so the picker can mask used questions in place. The
  // server ledger remains authoritative even if a client submits a masked ID.
  categories:eligible?WILDCARD_CATEGORIES:[]};
}
async function readBody(req){
 const limit=4096,declared=req.headers.get('content-length');
 const tooLarge=()=>Object.assign(Error('Request too large.'),{status:413});
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>limit))throw tooLarge();
 if(!req.body)throw Error('Empty request');
 const reader=req.body.getReader(),chunks=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel().catch(()=>{});throw tooLarge()}chunks.push(Buffer.from(value))}}finally{reader.releaseLock()}
 return JSON.parse(Buffer.concat(chunks,length).toString('utf8'));
}
async function handler(req){
 if(deploymentMode()==='blocked')return reply({error:'Wildcards are unavailable until this deployment is configured.',reviewOnly:true},503);
 if(!process.env.DATABASE_URL)return reply({error:'Wildcard storage is unavailable.'},503);
 if(!['GET','POST'].includes(req.method))return reply({error:'Method not allowed.'},405);
 const token=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('chempat_member='))?.slice(15);
 if(!validId(token))return reply({error:'Sign in to use your wildcards.',sessionExpired:true},401);
 let sql=neon(process.env.DATABASE_URL);const session=hash(token);
 try{
  const actor=(await sql.query(AUTH,[session]))[0];
  if(!actor)return reply({error:'Use your verified, active member account.'},403);
  if(!expectedRewardMember(req,actor.id))return reply({error:'Your signed-in account changed. Refresh your page before continuing.',sessionExpired:true},403);
  sql=bindRewardMember(sql,actor.id);
  if(req.method==='GET'){
   const id=new URL(req.url).searchParams.get('connection');
   if(!validId(id))return reply({error:'Choose an active connection.'},400);
   const row=(await sql.query(snapshotQuery(),[session,id]))[0];
   return row?reply(snapshot(row,id)):reply({error:'Wildcards are unavailable for this connection.'},404);
  }
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return reply({error:'Open your member page to ask a wildcard.'},403);
  if((req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')return reply({error:'Use the wildcard controls to ask a question.'},415);
  let body;try{body=await readBody(req)}catch(error){return reply({error:error.status===413?'Request too large.':'Invalid request.'},error.status||400)}
  if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'Invalid request.'},400);
  const {connectionId:id,questionId,requestId}=body,question=getWildcardQuestion(questionId);
  if(body.action!=='ask'||!validId(id)||!question||!validRequest(requestId))return reply({error:'Choose a wildcard question and try again.'},400);
  const pair=(await sql.query(PAIR,[session,id]))[0];
  if(!pair)return reply({error:'Wildcards are unavailable for this connection.'},404);
  const args=[session,id,questionId,requestId,question.text,question.categoryId,pair.sender_member_id,pair.prospect_member_id,`wildcard:${hash(`${id}:${actor.id}:${requestId}`)}`];
  // The slot CHECK and unique slot key independently bound every member to three
  // asks. The connection question key applies to both people. Connection locks
  // serialize competing requests before checking counts or allocating a slot.
  const write=`WITH eligible AS (${pairBound(7,8)}),emitted AS (
   INSERT INTO connection_wildcard_asks(invitation_hash,member_id,request_id,question_id,slot,message)
   SELECT $2,e.actor,$4,$3,(SELECT count(*)+1 FROM connection_wildcard_asks w WHERE w.invitation_hash=$2 AND w.member_id=e.actor),
    jsonb_build_object('by',e.side,'text',$5::text,'id',$9::text,'at',now(),'wildcardQuestionId',$3::text,'wildcardCategoryId',$6::text)
   FROM eligible e WHERE e.level>=3
   AND (SELECT count(*) FROM connection_wildcard_asks w WHERE w.invitation_hash=$2 AND w.member_id=e.actor)<3
   AND NOT EXISTS(SELECT 1 FROM connection_wildcard_asks w WHERE w.invitation_hash=$2 AND (w.question_id=$3 OR (w.member_id=e.actor AND w.request_id=$4)))
   ON CONFLICT DO NOTHING RETURNING invitation_hash,message
  ) UPDATE connection_state c SET messages=c.messages||jsonb_build_array(emitted.message),updated_at=now()
  FROM emitted WHERE c.invitation_hash=emitted.invitation_hash RETURNING emitted.message`;
  const results=await sql.transaction(tx=>[
   tx.query(`SELECT id FROM members WHERE id IN($3::uuid,$4::uuid) OR id IN(SELECT sender_member_id FROM invitations WHERE token_hash=$2 UNION SELECT prospect_member_id FROM connection_state WHERE invitation_hash=$2) OR session_hash=$1 ORDER BY id FOR UPDATE`,[session,id,pair.sender_member_id,pair.prospect_member_id]),
   tx.query(`SELECT invitation_hash FROM connection_state WHERE invitation_hash=$1 FOR UPDATE`,[id]),
   tx.query(write,args),
   tx.query(snapshotQuery(pairBound(4,5),true),[session,id,requestId,pair.sender_member_id,pair.prospect_member_id])
  ],{isolationLevel:'ReadCommitted'});
  const row=results[3][0];
  if(!row)return reply({error:'This connection or sign-in changed. Return to your page.'},409);
  const data=snapshot(row,id);
  if(!data.eligible)return reply({...data,error:'Reach Level 3 to unlock your three wildcards.',levelRequired:3},409);
  if(row.request){
   if(row.request.questionId!==questionId)return reply({...data,error:'That request already belongs to another question. Refresh your wildcards.',requestConflict:true},409);
   return reply({...data,message:row.request.message,replayed:results[2].length===0});
  }
  if(data.usedQuestionIds.includes(questionId))return reply({...data,error:'That question has already been asked in this connection. Choose another.',usedQuestion:true},409);
  if(data.remaining===0)return reply({...data,error:'You have used your three wildcards in this connection.',quotaReached:true},409);
  return reply({...data,error:'Your wildcards changed. Refresh and try again.'},409);
 }catch(error){console.error('Wildcard request failed.');return reply({error:'Could not load or send your wildcard. Try again.'},500)}
}
export default {fetch:handler};
