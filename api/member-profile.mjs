import {createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {deploymentMode} from './_deployment.mjs';
import {readProfileBody,validProfilePhoto} from './_member-profile.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin','referrer-policy':'no-referrer'};
const reply=(data,status=200)=>Response.json(data,{status,headers});
const sessionChanged=()=>reply({error:'Your sign-in or account standing changed. Refresh your page before continuing.',sessionExpired:true},403);
// Hash only editable identity. Answer, phone and reward writes do not make an
// otherwise current name/photo edit stale. No schema or extension is required.
const REVISION="encode(sha256(convert_to(jsonb_build_array(m.name,m.photo)::text,'UTF8')),'hex')";
const LEVEL=`greatest(coalesce(r.completed_level,0),CASE WHEN jsonb_typeof(m.answers)='array' THEN CASE WHEN jsonb_array_length(m.answers)>=10 THEN 2 WHEN jsonb_array_length(m.answers)>=5 THEN 1 ELSE 0 END ELSE 0 END)`;
const AUTH=`SELECT m.id,m.name,m.contact,m.photo,${REVISION} AS revision,${LEVEL} AS completed_level,coalesce(p.listed,false) AS listed
 FROM members m LEFT JOIN member_reward_state r ON r.member_id=m.id LEFT JOIN reward_directory_profile p ON p.member_id=m.id
 WHERE m.session_hash=$1 AND m.id=$2::uuid AND m.email_verified_at IS NOT NULL AND m.blocked_at IS NULL AND (m.suspended_until IS NULL OR m.suspended_until<=now())`;
const view=row=>({profile:{id:row.id,name:row.name,contact:row.contact,photo:row.photo,revision:row.revision},discovery:{listed:row.listed===true,eligible:row.completed_level>=4}});
// Directory rows are copied only after explicit consent and only while an
// existing listing is still active. Listing/video flags and bytes never change.
const SAVE=`WITH actor AS (${AUTH}),saved AS (
 UPDATE members m SET name=$3,photo=$4,updated_at=now() FROM actor a
 WHERE m.id=a.id AND a.revision=$5 AND (NOT $6::boolean OR (a.listed AND a.completed_level>=4)) RETURNING m.id
),published AS (
 UPDATE reward_directory_profile p SET display_name=left(split_part(trim(regexp_replace($3,'[[:space:]]+',' ','g')),' ',1),50),photo=$4,updated_at=now()
 FROM saved s WHERE p.member_id=s.id AND p.listed AND $6::boolean RETURNING p.member_id
) SELECT s.id,(SELECT count(*)::integer FROM published) AS published FROM saved s`;

async function handler(req){
 if(deploymentMode()==='blocked')return reply({error:'Your profile is unavailable until this deployment is configured.',reviewOnly:true},503);
 if(!['GET','POST'].includes(req.method))return reply({error:'Method not allowed.'},405);
 if(!process.env.DATABASE_URL)return reply({error:'Your profile is unavailable.'},503);
 const token=(req.headers.get('cookie')||'').match(/(?:^|;\s*)chempat_member=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!token)return reply({error:'Sign in to open your profile.',sessionExpired:true},401);
 const memberId=req.headers.get('x-chempat-member-id');
 if(!UUID.test(memberId||''))return sessionChanged();
 const session=createHash('sha256').update(token).digest('hex'),params=[session,memberId],sql=neon(process.env.DATABASE_URL);
 try{
  if(req.method==='GET'){
   const row=(await sql.query(AUTH,params))[0];return row?reply(view(row)):sessionChanged();
  }
  const origin=req.headers.get('origin');
  if((origin&&origin!==new URL(req.url).origin)||req.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Open your profile to make this change.'},403);
  if((req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')return reply({error:'Use your profile controls to make this change.'},415);
  const body=await readProfileBody(req);
  if(!body||typeof body!=='object'||Array.isArray(body)||body.action!=='save'||Object.keys(body).some(key=>!['action','name','photo','profileRevision','updateDiscovery'].includes(key)))return reply({error:'Choose a supported profile action.'},400);
  const name=typeof body.name==='string'?body.name.trim():'';
  if(name.length<1||name.length>50||/[\u0000-\u001f\u007f]/.test(name)||!validProfilePhoto(body.photo))return reply({error:'Add your first name and a valid JPEG photo.'},400);
  if(typeof body.profileRevision!=='string'||! /^[a-f0-9]{64}$/.test(body.profileRevision)||typeof body.updateDiscovery!=='boolean')return reply({error:'Reload your profile and review your changes before saving.'},400);
  if(!(await sql.query(AUTH,params))[0])return sessionChanged();
  // Every writer to the discovery profile takes the same owner lock first.
  // Separate statements get a fresh snapshot after any lock wait, and SAVE
  // repeats identity, standing, revision and publication eligibility itself.
  const results=await sql.transaction(tx=>[
   tx.query('SELECT id FROM members WHERE id=$1::uuid ORDER BY id FOR UPDATE',[memberId]),
   tx.query('SELECT member_id FROM reward_directory_profile WHERE member_id=$1::uuid FOR UPDATE',[memberId]),
   tx.query(AUTH,params),
   tx.query(SAVE,[...params,name,body.photo,body.profileRevision,body.updateDiscovery])
  ],{isolationLevel:'ReadCommitted'});
  const current=results[2][0];if(!current)return sessionChanged();
  if(!results[3].length){
   if(current.revision!==body.profileRevision)return reply({error:'Your saved profile changed. Reload it and review your changes before saving again.',profileConflict:true},409);
   if(body.updateDiscovery&&(!current.listed||current.completed_level<4))return reply({error:'Your discovery listing changed. Reload your profile and choose whether to update discovery again.',discoveryConflict:true},409);
   return reply({error:'Your profile or sign-in changed. Reload your profile before saving again.',profileConflict:true},409);
  }
  const row=(await sql.query(AUTH,params))[0];return row?reply(view(row)):sessionChanged();
 }catch(error){
  if(error.status)return reply({error:error.message},error.status);
  // Names, contacts, photos and session material must never enter logs.
  console.error('Member profile request failed.');return reply({error:'Could not load or save your profile. Try again.'},503);
 }
}
export default {fetch:handler};
