import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {deploymentMode} from './_deployment.mjs';
import {expectedRewardMember,bindRewardMember} from './_reward-auth.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin','referrer-policy':'no-referrer'};
const reply=(body,status=200)=>Response.json(body,{status,headers});
const level=(member,state)=>`greatest(coalesce(${state}.completed_level,0),CASE WHEN jsonb_typeof(${member}.answers)='array' THEN CASE WHEN jsonb_array_length(${member}.answers)>=10 THEN 2 WHEN jsonb_array_length(${member}.answers)>=5 THEN 1 ELSE 0 END ELSE 0 END)`;
const active=member=>`${member}.email_verified_at IS NOT NULL AND ${member}.blocked_at IS NULL AND (${member}.suspended_until IS NULL OR ${member}.suspended_until<=now())`;
const AUTH=`SELECT m.id FROM members m LEFT JOIN member_reward_state ms ON ms.member_id=m.id WHERE m.session_hash=$1 AND ${active('m')} AND ${level('m','ms')}>=4`;
// Same conservative historical-pair exclusion as the directory/media endpoint.
const safePair=`NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_id=s.id AND b.blocked_id=t.id) OR (b.blocker_id=t.id AND b.blocked_id=s.id))
 AND NOT EXISTS(SELECT 1 FROM invitations i LEFT JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE
 ((i.sender_member_id=s.id AND (c.prospect_member_id=t.id OR i.intended_member_id=t.id OR (c.prospect_member_id IS NULL AND i.intended_member_id IS NULL AND lower(coalesce(i.intended_email,i.recipient_email))=lower(t.contact))))
 OR (i.sender_member_id=t.id AND (c.prospect_member_id=s.id OR i.intended_member_id=s.id OR (c.prospect_member_id IS NULL AND i.intended_member_id IS NULL AND lower(coalesce(i.intended_email,i.recipient_email))=lower(s.contact)))))
 AND (c.status IN ('ended','declined') OR c.ended_at IS NOT NULL OR EXISTS(SELECT 1 FROM connection_visibility v WHERE v.invitation_hash=i.token_hash AND (v.frozen_at IS NOT NULL OR v.trashed_at IS NOT NULL))))`;
const eligiblePair=`s.id<>t.id AND ${active('s')} AND ${active('t')} AND ${level('s','ss')}>=4 AND ${level('t','ts')}>=4 AND p.listed AND ${safePair}`;
const pairJoins=`JOIN members s ON s.id=r.sender_id JOIN members t ON t.id=r.target_id LEFT JOIN member_reward_state ss ON ss.member_id=s.id LEFT JOIN member_reward_state ts ON ts.member_id=t.id JOIN reward_directory_profile p ON p.member_id=t.id`;
const firstFive=column=>`(SELECT jsonb_agg(value ORDER BY ordinality) FROM jsonb_array_elements(${column}) WITH ORDINALITY WHERE ordinality<=5)`;
const validFive=column=>`jsonb_typeof(${column})='array' AND jsonb_array_length(${column})>=5 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(${column}) WITH ORDINALITY WHERE ordinality<=5 AND value NOT IN('0'::jsonb,'1'::jsonb,'2'::jsonb))`;
const ELIGIBLE=`SELECT r.*,a.id AS actor,r.sender_first_five AS sender_answers,t.answers AS target_answers FROM reward_discovery_requests r ${pairJoins} JOIN (${AUTH}) a ON a.id IN(r.sender_id,r.target_id) WHERE r.id=$2::uuid AND r.expires_at>now() AND ${eligiblePair}`;
const OWNED=`SELECT r.*,a.id AS actor FROM reward_discovery_requests r JOIN (${AUTH}) a ON a.id IN(r.sender_id,r.target_id) WHERE r.id=$2::uuid`;
const NEW_PAIR=`SELECT s.id AS sender_id,t.id AS target_id,left(split_part(trim(regexp_replace(s.name,'[[:space:]]+',' ','g')),' ',1),50) AS sender_name,s.photo AS sender_photo,p.display_name AS target_name,p.photo AS target_photo,${firstFive('s.answers')} AS sender_first_five
 FROM (${AUTH}) a JOIN members s ON s.id=a.id JOIN members t ON t.id=$2::uuid LEFT JOIN member_reward_state ss ON ss.member_id=s.id LEFT JOIN member_reward_state ts ON ts.member_id=t.id JOIN reward_directory_profile p ON p.member_id=t.id WHERE ${eligiblePair} AND ${validFive('s.answers')}`;
const requestLock=`SELECT id FROM members WHERE id=$3::uuid OR id IN(SELECT sender_id FROM reward_discovery_requests WHERE id=$2::uuid UNION SELECT target_id FROM reward_discovery_requests WHERE id=$2::uuid) OR session_hash=$1 ORDER BY id FOR UPDATE`;

function photoBytes(value){
 if(typeof value!=='string'||value.length>=250000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return null;
 const encoded=value.slice(23),bytes=Buffer.from(encoded,'base64');
 return bytes.toString('base64')===encoded&&bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217?bytes:null;
}
async function boundedJson(req){
 const length=req.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>1024)){const error=Error('Request too large.');error.status=413;throw error}
 if(!req.body)return null;
 const reader=req.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel().catch(()=>{});const error=Error('Request too large.');error.status=413;throw error}chunks.push(Buffer.from(value))}}finally{reader.releaseLock()}
 try{return JSON.parse(Buffer.concat(chunks,size).toString('utf8'))}catch{return null}
}
async function inbox(sql,session){
 const rows=await sql.query(`WITH actor AS (${AUTH}) SELECT a.id,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',q.id,'memberId',q.member_id,'name',q.name,'expiresAt',q.expires_at) ORDER BY q.created_at DESC,q.id) FROM
 (SELECT r.id,CASE WHEN r.sender_id=a.id THEN r.target_id ELSE r.sender_id END AS member_id,CASE WHEN r.sender_id=a.id THEN r.target_name ELSE r.sender_name END AS name,r.expires_at,r.created_at
 FROM reward_discovery_requests r ${pairJoins} WHERE r.target_id=a.id AND r.status='pending' AND r.expires_at>now() AND ${eligiblePair} ORDER BY r.created_at DESC,r.id LIMIT 50) q),'[]'::jsonb) AS incoming,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',q.id,'memberId',q.member_id,'name',q.name,'expiresAt',q.expires_at,'canPreview',q.can_preview) ORDER BY q.created_at DESC,q.id) FROM
 (SELECT r.id,r.target_id AS member_id,r.target_name AS name,r.expires_at,r.created_at,(${eligiblePair}) AS can_preview FROM reward_discovery_requests r ${pairJoins} WHERE r.sender_id=a.id AND r.status='pending' AND r.expires_at>now() ORDER BY r.created_at DESC,r.id LIMIT 50) q),'[]'::jsonb) AS outgoing FROM actor a`,[session]);
 if(!rows[0])return reply({error:'Your account changed. Refresh your member page.'},403);
 const map=items=>items.map(({canPreview,...item})=>({...item,photo:canPreview===false?null:'/api/reward-requests?photo='+item.id}));
 return reply({incoming:map(rows[0].incoming),outgoing:map(rows[0].outgoing)});
}
async function requestPhoto(sql,session,id,method){
 if(!UUID.test(id||''))return reply({error:'Photo not found.'},404);
 const rows=await sql.query(`WITH eligible AS (${ELIGIBLE}) SELECT CASE WHEN actor=sender_id THEN target_photo ELSE sender_photo END AS photo FROM eligible WHERE status='pending'`,[session,id]);
 const bytes=photoBytes(rows[0]?.photo);if(!bytes)return reply({error:'Photo not found.'},404);
 return new Response(method==='HEAD'?null:bytes,{headers:{...headers,'content-type':'image/jpeg','content-length':String(bytes.length)}});
}
async function handler(req){
 if(deploymentMode()!=='review')return reply({error:'Discovery requests are available only in isolated review.',reviewOnly:true},503);
 if(!['GET','HEAD','POST'].includes(req.method))return reply({error:'Method not allowed.'},405);
 if(!process.env.DATABASE_URL)return reply({error:'Discovery requests are unavailable.'},503);
 const token=(req.headers.get('cookie')||'').match(/(?:^|;\s*)chempat_member=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!token)return reply({error:'Sign in to open discovery requests.',sessionExpired:true},401);
 const session=createHash('sha256').update(token).digest('hex'),url=new URL(req.url);let sql=neon(process.env.DATABASE_URL);
 try{
  const actor=(await sql.query(AUTH,[session]))[0]?.id;if(!actor)return reply({error:'Use a verified, active Level 4 member account.'},403);
  if(!expectedRewardMember(req,actor))return reply({error:'Your signed-in account changed. Refresh before continuing.',sessionExpired:true},403);
  sql=bindRewardMember(sql,actor);
  if(req.method!=='POST'){
   if(url.searchParams.has('photo'))return await requestPhoto(sql,session,url.searchParams.get('photo'),req.method);
   if(req.method==='HEAD')return reply({error:'Photo not found.'},404);
   return await inbox(sql,session);
  }
  const origin=req.headers.get('origin');if(origin&&origin!==url.origin)return reply({error:'Open your member page to make this change.'},403);
  if((req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')return reply({error:'Use the discovery request controls.'},415);
  const body=await boundedJson(req);
  if(!body||typeof body!=='object'||Array.isArray(body)||!['request','accept','pass','cancel'].includes(body.action))return reply({error:'Choose a supported request action.'},400);
  const action=body.action,key=action==='request'?'targetId':'id';
  if(!UUID.test(body[key]||'')||Object.keys(body).some(item=>!['action',key].includes(item)))return reply({error:'Choose a valid request or member.'},400);
  let statements;
  if(action==='request'){
   const pair=(await sql.query(NEW_PAIR,[session,body.targetId]))[0];
   if(!pair||!photoBytes(pair.sender_photo)||!photoBytes(pair.target_photo)||!pair.sender_name)return reply({error:'This member is unavailable for a discovery request.'},404);
   const id=randomUUID();
   statements=[
    [`SELECT id FROM members WHERE id IN($2::uuid,$3::uuid) OR session_hash=$1 ORDER BY id FOR UPDATE`,[session,actor,body.targetId]],
    [`WITH eligible AS (${NEW_PAIR}) INSERT INTO reward_discovery_requests(id,sender_id,target_id,sender_name,sender_photo,target_name,target_photo,sender_first_five) SELECT $3::uuid,sender_id,target_id,sender_name,sender_photo,target_name,target_photo,sender_first_five FROM eligible ON CONFLICT DO NOTHING RETURNING id`,[session,body.targetId,id]],
    [`WITH eligible AS (${NEW_PAIR}) SELECT r.id,r.status,r.invitation_hash FROM eligible e JOIN reward_discovery_requests r ON r.sender_id=e.sender_id AND r.target_id=e.target_id WHERE r.status IN('pending','accepted') AND r.expires_at>now()`,[session,body.targetId]]
   ];
  }else{
   // A UUID or photo URL grants no authority; only the two bound parties can
   // even reach the pair lock, and all eligibility is rechecked after it.
   const own=(await sql.query(`WITH actor AS (${AUTH}) SELECT r.id FROM reward_discovery_requests r JOIN actor a ON a.id IN(r.sender_id,r.target_id) WHERE r.id=$2::uuid`,[session,body.id]))[0];
   if(!own)return reply({error:'Request not found.'},404);
   statements=[[requestLock,[session,body.id,actor]],[`SELECT id FROM reward_discovery_requests WHERE id=$1::uuid FOR UPDATE`,[body.id]]];
   if(action==='accept'){
    const connectionId=createHash('sha256').update(randomBytes(32)).digest('hex');
    statements.push([`WITH eligible AS (${ELIGIBLE}), ready AS (SELECT * FROM eligible WHERE actor=target_id AND status='pending' AND ${validFive('sender_answers')} AND ${validFive('target_answers')}),
    invited AS (INSERT INTO invitations(token_hash,sender_email,sender_name,sender_photo,sender_answers,recipient_name,recipient_email,sender_member_id,channel,expires_at,intended_member_id)
    SELECT $3,'',sender_name,sender_photo,${firstFive('sender_answers')},target_name,'',sender_id,'email',NULL,target_id FROM ready RETURNING token_hash),
    connected AS (INSERT INTO connection_state(invitation_hash,prospect_member_id,prospect_name,prospect_photo,prospect_answers,status,messages)
    SELECT i.token_hash,r.target_id,r.target_name,r.target_photo,${firstFive('r.target_answers')},'firstResults','[]'::jsonb FROM ready r CROSS JOIN invited i RETURNING invitation_hash),
    accepted AS (UPDATE reward_discovery_requests SET status='accepted',invitation_hash=(SELECT invitation_hash FROM connected) WHERE id=$2::uuid AND EXISTS(SELECT 1 FROM connected) RETURNING id,status,invitation_hash)
    SELECT * FROM accepted UNION ALL SELECT id,status,invitation_hash FROM eligible WHERE actor=target_id AND status='accepted' AND invitation_hash IS NOT NULL`,[session,body.id,connectionId]]);
   }else{
    const next=action==='pass'?'passed':'cancelled',role=action==='pass'?'target_id':'sender_id';
    statements.push([`WITH eligible AS (${OWNED}), changed AS (UPDATE reward_discovery_requests SET status='${next}' WHERE id IN(SELECT id FROM eligible WHERE actor=${role} AND status='pending') RETURNING id,status,invitation_hash)
    SELECT * FROM changed UNION ALL SELECT id,status,invitation_hash FROM eligible WHERE actor=${role} AND status='${next}'`,[session,body.id]]);
   }
  }
  const result=await sql.transaction(tx=>statements.map(([query,params])=>tx.query(query,params)),{isolationLevel:'ReadCommitted'}),row=result.at(-1)?.[0];
  if(!row)return reply({error:'This request is no longer available. Refresh discovery; closed requests cannot be resent.'},409);
  return reply({ok:true,id:row.id,status:row.status,connectionId:row.invitation_hash||null});
 }catch(error){if(error.status)return reply({error:error.message},error.status);console.error('Reward discovery request failed.');return reply({error:'Could not load or save this discovery request. Try again.'},503)}
}
export default {fetch:handler};
