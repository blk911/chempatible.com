import {createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {expectedRewardMember,bindRewardMember} from './_reward-auth.mjs';
import {deploymentMode} from './_deployment.mjs';
import {REWARDS,REWARD_ROUNDS,getRewardRound,validRewardAnswers} from './_reward-rounds.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const validId=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
const level=`greatest(coalesce(r.completed_level,0),CASE WHEN jsonb_array_length(m.answers)>=10 THEN 2 WHEN jsonb_array_length(m.answers)>=5 THEN 1 ELSE 0 END)`;
const ACTOR=`SELECT m.id,m.name,m.answers AS base_answers,coalesce(r.answers,'{}'::jsonb) AS answers,coalesce(r.revision,0) AS revision,${level} AS level FROM members m LEFT JOIN member_reward_state r ON r.member_id=m.id WHERE m.session_hash=$1 AND m.email_verified_at IS NOT NULL AND m.blocked_at IS NULL AND (m.suspended_until IS NULL OR m.suspended_until<=now())`;
const memberLevel=id=>`(SELECT ${level} FROM members m LEFT JOIN member_reward_state r ON r.member_id=m.id WHERE m.id=${id})`;
const active=`c.status IN ('chat','secondResults','email','tests') AND c.ended_at IS NULL AND i.sender_member_id IS NOT NULL AND c.prospect_member_id IS NOT NULL AND i.sender_member_id<>c.prospect_member_id
 AND NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_id=i.sender_member_id AND b.blocked_id=c.prospect_member_id) OR (b.blocked_id=i.sender_member_id AND b.blocker_id=c.prospect_member_id))
 AND NOT EXISTS(SELECT 1 FROM connection_visibility v WHERE v.invitation_hash=i.token_hash AND (v.frozen_at IS NOT NULL OR v.trashed_at IS NOT NULL))
 AND NOT EXISTS(SELECT 1 FROM members p WHERE p.id IN(i.sender_member_id,c.prospect_member_id) AND (p.blocked_at IS NOT NULL OR p.suspended_until>now() OR p.email_verified_at IS NULL))`;
const PAIR=`SELECT i.token_hash,i.channel,e.id AS actor,CASE WHEN e.id=i.sender_member_id THEN c.prospect_member_id ELSE i.sender_member_id END AS other,e.level AS own_level,${memberLevel('CASE WHEN e.id=i.sender_member_id THEN c.prospect_member_id ELSE i.sender_member_id END')} AS other_level FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash JOIN (${ACTOR}) e ON e.id IN(i.sender_member_id,c.prospect_member_id) WHERE i.token_hash=$2 AND ${active}`;
const activeStatus=active.replace("c.status IN ('chat','secondResults','email','tests')","c.status NOT IN ('ended','declined')");
const STATUS_PAIR=PAIR.replace(active,activeStatus);
const locks=`SELECT id FROM members WHERE session_hash=$1 OR id IN(SELECT i.sender_member_id FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE (SELECT id FROM members WHERE session_hash=$1) IN(i.sender_member_id,c.prospect_member_id) UNION SELECT c.prospect_member_id FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE (SELECT id FROM members WHERE session_hash=$1) IN(i.sender_member_id,c.prospect_member_id)) ORDER BY id FOR UPDATE`;
const connectionLocks=`SELECT c.invitation_hash FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE (SELECT id FROM members WHERE session_hash=$1) IN(i.sender_member_id,c.prospect_member_id) ORDER BY c.invitation_hash FOR UPDATE OF c`;
async function view(sql,session,id){
 const own=(await sql.query(`WITH owner AS (${ACTOR}) SELECT owner.*,coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.token_hash,'upgraded',p.other_level>=3,'ownUpgraded',p.own_level>=3,'otherUpgraded',p.other_level>=3)) FROM (${STATUS_PAIR.replace('WHERE i.token_hash=$2 AND','WHERE')}) p),'[]'::jsonb) AS connections FROM owner`,[session]))[0];if(!own)return null;
 const answers={...own.answers};if(own.base_answers.length>=10)own.base_answers.slice(5,10).forEach((v,i)=>{answers['base-'+(i+6)]=v});
 const result={level:own.level,rounds:REWARD_ROUNDS,answers,draftRevision:own.revision,nextLevel:own.level<5?own.level+1:null,nextReward:REWARDS[own.level]||null};
 result.connections=own.connections;
 if(id){
  const rows=await sql.query(`WITH eligible AS (${PAIR}) SELECT e.*,o.phone AS own_phone,x.phone AS other_phone FROM eligible e LEFT JOIN reward_phone_offers o ON o.invitation_hash=e.token_hash AND o.member_id=e.actor LEFT JOIN reward_phone_offers x ON x.invitation_hash=e.token_hash AND x.member_id=e.other`,[session,id]);
  if(!rows[0])return null;const c=rows[0],eligible=c.channel!=='friend'&&c.own_level>=2&&c.other_level>=2,shared=eligible&&!!c.own_phone&&!!c.other_phone;
  result.connection={id,upgraded:c.other_level>=3,ownUpgraded:c.own_level>=3,otherUpgraded:c.other_level>=3,phone:{eligible,ownEligible:c.channel!=='friend'&&c.own_level>=2,otherEligible:c.channel!=='friend'&&c.other_level>=2,ownOffered:eligible&&!!c.own_phone,otherOffered:eligible&&!!c.other_phone,shared,...(eligible&&c.own_phone?{ownPhone:c.own_phone}:{}),...(shared?{otherPhone:c.other_phone}:{})}};
 }
 return result;
}
const upgradeWrite=saved=>`WITH eligible AS (${ACTOR}),saved AS (${saved}),actor AS (SELECT e.id,e.name FROM eligible e JOIN saved s ON s.member_id=e.id), connections AS (
 SELECT i.token_hash,a.id,a.name FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash JOIN actor a ON a.id IN(i.sender_member_id,c.prospect_member_id) WHERE ${activeStatus}
), emitted AS (
 INSERT INTO reward_connection_events(invitation_hash,member_id,event_key) SELECT token_hash,id,'level-3-upgrade' FROM connections ON CONFLICT DO NOTHING RETURNING invitation_hash,member_id
), notes AS (
 UPDATE connection_state c SET messages=c.messages||jsonb_build_array(jsonb_build_object('by','system','text',(SELECT name FROM actor)||' earned Getting closer status.','gameEvent','level-3-upgrade','id','reward:level-3:'||(SELECT id::text FROM actor),'at',now())),updated_at=now() WHERE c.invitation_hash IN(SELECT invitation_hash FROM emitted) RETURNING invitation_hash
) SELECT member_id FROM saved`;
async function readBody(req){
 const limit=16384,declared=req.headers.get('content-length');
 const tooLarge=()=>Object.assign(Error('Request too large.'),{status:413});
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>limit))throw tooLarge();
 if(!req.body)throw Error('Empty request');
 const reader=req.body.getReader(),chunks=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel().catch(()=>{});throw tooLarge()}chunks.push(Buffer.from(value))}}finally{reader.releaseLock()}
 return JSON.parse(Buffer.concat(chunks,length).toString('utf8'));
}
async function handler(req){
 if(deploymentMode()==='blocked')return reply({error:'The reward game is unavailable until this deployment is configured.',reviewOnly:true},503);
 if(!process.env.DATABASE_URL)return reply({error:'Reward storage is unavailable.'},503);
 if(!['GET','POST'].includes(req.method))return reply({error:'Method not allowed.'},405);
 const token=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('chempat_member='))?.slice(15);
 if(!validId(token))return reply({error:'Sign in to see your progress.',sessionExpired:true},401);
 let sql=neon(process.env.DATABASE_URL);const session=hash(token);
 try{
  const actor=(await sql.query(ACTOR,[session]))[0];if(!actor)return reply({error:'Use your verified, active member account.'},403);
  if(!expectedRewardMember(req,actor.id))return reply({error:'Your signed-in account changed. Refresh your page before continuing.',sessionExpired:true},403);
  sql=bindRewardMember(sql,actor.id);
  if(req.method==='GET'){
   const id=new URL(req.url).searchParams.get('connection');if(id&&!validId(id))return reply({error:'Invalid connection.'},400);
   const data=await view(sql,session,id);return data?reply(data):reply({error:'This connection is unavailable.'},404);
  }
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return reply({error:'Open your member page to make this change.'},403);
  if((req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')return reply({error:'Use the game controls to save your progress.'},415);
  let body;try{body=await readBody(req)}catch(error){return reply({error:error.status===413?'Request too large.':'Invalid request.'},error.status||400)}
  if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'Invalid request.'},400);
  const {action}=body;
  if(['offerPhone','withdrawPhone'].includes(action)){
   const id=body.connectionId;if(!validId(id))return reply({error:'Choose an active connection.'},400);
   const phone=typeof body.phone==='string'?body.phone.replace(/[ ()\-.]/g,''):'';
   if(action==='offerPhone'&&!/^\+[1-9][0-9]{6,14}$/.test(phone))return reply({error:'Enter your phone number with + and country code.'},400);
   const params=[session,id];
   const query=action==='offerPhone'?`WITH eligible AS (${PAIR}) INSERT INTO reward_phone_offers(invitation_hash,member_id,phone) SELECT token_hash,actor,$3 FROM eligible WHERE channel<>'friend' AND own_level>=2 AND other_level>=2 ON CONFLICT(invitation_hash,member_id) DO UPDATE SET phone=excluded.phone,offered_at=now() RETURNING member_id`:`WITH eligible AS (${PAIR}) DELETE FROM reward_phone_offers WHERE invitation_hash=$2 AND member_id IN(SELECT actor FROM eligible) RETURNING member_id`;
   const result=await sql.transaction(tx=>[tx.query(locks,[session]),tx.query(connectionLocks,[session]),tx.query(query,action==='offerPhone'?[...params,phone]:params)],{isolationLevel:'ReadCommitted'});
   if(action==='offerPhone'&&!result[2].length)return reply({error:'Both people need their second five and an active Vibe chat before exchanging phones.'},409);
   const data=await view(sql,session,id);return data?reply(data):reply({error:'This connection changed. Return to your page.'},409);
  }
  if(!['save','complete'].includes(action))return reply({error:'Unknown action.'},400);
  const round=getRewardRound(body.level);
  if(!round||!validRewardAnswers(round,body.answers,action==='complete')||!Number.isInteger(body.draftRevision)||body.draftRevision<0||body.draftRevision>2147483646)return reply({error:'Use the choices in your current five-question round.'},400);
  // A completed round is immutable; replay cannot award or publish anything twice.
  if(action==='complete'&&actor.level>=round.level){const data=await view(sql,session);return data?reply(data):reply({error:'Your sign-in changed.'},409)}
  const saved=`INSERT INTO member_reward_state(member_id,completed_level,answers,revision) SELECT id,CASE WHEN $3='complete' THEN $2::integer ELSE level END,$4::jsonb,1 FROM eligible WHERE level=$2::integer-1 AND ($5::integer=0 OR EXISTS(SELECT 1 FROM member_reward_state WHERE member_id=eligible.id)) ON CONFLICT(member_id) DO UPDATE SET completed_level=excluded.completed_level,answers=member_reward_state.answers||excluded.answers,revision=member_reward_state.revision+1,updated_at=now() WHERE member_reward_state.revision=$5 RETURNING member_id`;
  const params=[session,round.level,action,JSON.stringify(body.answers),body.draftRevision];
  let write=`WITH eligible AS (${ACTOR}) ${saved}`;
  if(action==='complete'&&round.level===2){
   const second=round.questions.map(q=>body.answers[q.id]);
   write=`WITH eligible AS (${ACTOR}),saved AS (${saved}) UPDATE members SET answers=jsonb_build_array(answers->0,answers->1,answers->2,answers->3,answers->4)||$6::jsonb,updated_at=now() WHERE id IN(SELECT member_id FROM saved) RETURNING id AS member_id`;params.push(JSON.stringify(second));
  }
  if(action==='complete'&&round.level===3)write=upgradeWrite(saved);
  const results=await sql.transaction(tx=>[tx.query(locks,[session]),tx.query(connectionLocks,[session]),tx.query(write,params)],{isolationLevel:'ReadCommitted'});
  if(!results[2].length)return reply({error:'Your saved progress changed. Reload this round and try again.',draftConflict:true},409);
  const data=await view(sql,session);return data?reply(data):reply({error:'Your sign-in changed.'},409);
 }catch(error){console.error('Reward request failed.');return reply({error:'Could not load or save your progress. Try again.'},500)}
}
export default {fetch:handler};
