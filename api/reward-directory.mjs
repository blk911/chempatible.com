import {createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {expectedRewardMember,bindRewardMember} from './_reward-auth.mjs';
import {deploymentMode} from './_deployment.mjs';
import {validateIntroVideo} from './_intro-video.mjs';

const VIDEO_BYTES=2*1024*1024, JSON_BYTES=1024, PAGE_SIZE=20;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin','referrer-policy':'no-referrer'};
const reply=(data,status=200)=>Response.json(data,{status,headers});
const failure=(message,status)=>{const error=Error(message);error.status=status;return error};
const route=(kind,id)=>`/api/reward-directory?${kind}=${id}`;
const firstName=name=>String(name||'').trim().split(/\s+/u)[0].slice(0,50);
const level=(member='m',state='s')=>`greatest(coalesce(${state}.completed_level,0),CASE WHEN jsonb_typeof(${member}.answers)='array' THEN CASE WHEN jsonb_array_length(${member}.answers)>=10 THEN 2 WHEN jsonb_array_length(${member}.answers)>=5 THEN 1 ELSE 0 END ELSE 0 END)`;
const active=alias=>`${alias}.email_verified_at IS NOT NULL AND ${alias}.blocked_at IS NULL AND (${alias}.suspended_until IS NULL OR ${alias}.suspended_until<=now())`;
const AUTH=`SELECT m.id,m.name,m.photo,${level()} AS completed_level FROM members m LEFT JOIN member_reward_state s ON s.member_id=m.id WHERE m.session_hash=$1 AND ${active('m')}`;
// Eligibility is repeated in the statement that selects the actual bytes/rows.
// An old ended/declined/frozen/trashed pair cannot be bypassed by a newer pair.
const privatePair=`NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_id=a.id AND b.blocked_id=m.id) OR (b.blocker_id=m.id AND b.blocked_id=a.id))
 AND NOT EXISTS(SELECT 1 FROM invitations i LEFT JOIN connection_state c ON c.invitation_hash=i.token_hash
 WHERE ((i.sender_member_id=a.id AND (c.prospect_member_id=m.id OR i.intended_member_id=m.id OR (c.prospect_member_id IS NULL AND i.intended_member_id IS NULL AND lower(coalesce(i.intended_email,i.recipient_email))=lower(m.contact))))
 OR (i.sender_member_id=m.id AND (c.prospect_member_id=a.id OR i.intended_member_id=a.id OR (c.prospect_member_id IS NULL AND i.intended_member_id IS NULL AND lower(coalesce(i.intended_email,i.recipient_email))=(SELECT lower(contact) FROM members WHERE id=a.id)))))
 AND (c.status IN ('ended','declined') OR c.ended_at IS NOT NULL OR EXISTS(SELECT 1 FROM connection_visibility v WHERE v.invitation_hash=i.token_hash AND (v.frozen_at IS NOT NULL OR v.trashed_at IS NOT NULL))))`;
const PUBLIC=`a.completed_level>=4 AND p.listed AND ${active('m')} AND ${level()}>=4 AND ${privatePair}`;
const LOCK=`SELECT id FROM members WHERE id=$2::uuid OR session_hash=$1 ORDER BY id FOR UPDATE`;

function photoBytes(photo){
 if(typeof photo!=='string'||photo.length>=250000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo))return null;
 const payload=photo.slice('data:image/jpeg;base64,'.length),bytes=Buffer.from(payload,'base64');
 if(bytes.toString('base64')!==payload||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)return null;
 return bytes;
}
async function boundedBody(req,max){
 const length=req.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>max))throw failure('The upload is too large.',413);
 if(!req.body)return Buffer.alloc(0);
 const reader=req.body.getReader(),chunks=[];let count=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>max){await reader.cancel().catch(()=>{});throw failure('The upload is too large.',413)}chunks.push(Buffer.from(value))}
 }finally{reader.releaseLock()}
 return Buffer.concat(chunks,count);
}
function cursorAfter(value){
 if(value===null)return null;
 if(value.length>96||!/^[A-Za-z0-9_-]+$/.test(value))throw failure('Reload the directory to continue.',400);
 const decoded=Buffer.from(value,'base64url').toString('utf8');
 if(!decoded.startsWith('v1:')||!UUID.test(decoded.slice(3))||Buffer.from(decoded).toString('base64url')!==value)throw failure('Reload the directory to continue.',400);
 return decoded.slice(3);
}
async function profile(sql,session){
 const rows=await sql.query(`WITH actor AS (${AUTH}) SELECT a.id,a.name,a.photo AS private_photo,a.completed_level,p.listed,p.display_name,p.photo,p.video IS NOT NULL AS has_video,p.video_published,p.duration_seconds FROM actor a LEFT JOIN reward_directory_profile p ON p.member_id=a.id`,[session]);
 const row=rows[0];if(!row)return null;
 return {profile:{listed:row.listed===true,name:row.display_name||firstName(row.name),photo:photoBytes(row.photo||row.private_photo)?route('photo',row.id):null,video:row.has_video?route('video',row.id):null,videoPublished:row.video_published===true,durationSeconds:row.duration_seconds??null},eligibility:{completedLevel:row.completed_level,directory:row.completed_level>=4,video:row.completed_level>=5},limits:{videoBytes:VIDEO_BYTES,videoSeconds:15}};
}
async function directory(sql,session,url){
 const after=cursorAfter(url.searchParams.get('cursor')),rawLimit=url.searchParams.get('limit');
 if(rawLimit!==null&&(!/^\d{1,3}$/.test(rawLimit)||Number(rawLimit)<1))throw failure('Choose a valid page size.',400);
 const limit=Math.min(rawLimit===null?PAGE_SIZE:Number(rawLimit),PAGE_SIZE);
 // The outer actor row distinguishes lost eligibility from an empty directory.
 const rows=await sql.query(`WITH actor AS (${AUTH}) SELECT a.completed_level,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',q.member_id,'name',q.display_name,'videoAvailable',q.video_available) ORDER BY q.member_id) FROM
 (SELECT p.member_id,p.display_name,p.video IS NOT NULL AND p.video_published AND ${level()}>=5 AS video_available
 FROM reward_directory_profile p JOIN members m ON m.id=p.member_id LEFT JOIN member_reward_state s ON s.member_id=m.id
 WHERE m.id<>a.id AND ${PUBLIC} AND ($2::uuid IS NULL OR p.member_id>$2::uuid) ORDER BY p.member_id LIMIT $3) q),'[]'::jsonb) AS profiles
 FROM actor a WHERE a.completed_level>=4`,[session,after,limit+1]);
 if(!rows[0])return reply({error:'Complete Level 4 to browse the member directory.'},403);
 const page=rows[0].profiles,hasMore=page.length>limit,visible=page.slice(0,limit);
 return reply({profiles:visible.map(item=>({id:item.id,name:item.name,photo:route('photo',item.id),videoAvailable:item.videoAvailable})),nextCursor:hasMore?Buffer.from('v1:'+visible.at(-1).id).toString('base64url'):null});
}
async function media(sql,session,id,kind,method){
 if(!UUID.test(id||''))return reply({error:'Media not found.'},404);
 const video=kind==='video';
 const rows=await sql.query(`WITH actor AS (${AUTH}) SELECT ${video?'p.video,p.video_mime':"CASE WHEN a.id=m.id THEN coalesce(p.photo,m.photo) ELSE p.photo END AS photo"}
 FROM actor a JOIN members m ON m.id=$2::uuid LEFT JOIN member_reward_state s ON s.member_id=m.id LEFT JOIN reward_directory_profile p ON p.member_id=m.id
 WHERE a.id=m.id OR (${PUBLIC}${video?' AND p.video_published AND p.video IS NOT NULL AND '+level()+'>=5':''})`,[session,id]);
 const row=rows[0],bytes=video?(row?.video?Buffer.from(row.video):null):photoBytes(row?.photo);
 if(!bytes||!bytes.length||(video&&(row.video_mime!=='video/mp4'||bytes.length>VIDEO_BYTES)))return reply({error:'Media not found.'},404);
 return new Response(method==='HEAD'?null:bytes,{headers:{...headers,'content-type':video?'video/mp4':'image/jpeg','content-length':String(bytes.length),'accept-ranges':'none','content-disposition':`inline; filename="${video?'intro.mp4':'profile.jpg'}"`}});
}
async function handler(req){
 // Only verified isolated review or the explicitly configured trusted live
 // deployment can reach member authorization. Request metadata grants no access.
 if(deploymentMode()==='blocked')return reply({error:'The member directory is unavailable until this deployment is configured.',reviewOnly:true},503);
 if(!['GET','HEAD','POST'].includes(req.method))return reply({error:'Method not allowed.'},405);
 if(!process.env.DATABASE_URL)return reply({error:'The member directory is unavailable.'},503);
 const token=(req.headers.get('cookie')||'').match(/(?:^|;\s*)chempat_member=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!token)return reply({error:'Sign in to open your member directory.',sessionExpired:true},401);
 const session=createHash('sha256').update(token).digest('hex'),url=new URL(req.url);let sql=neon(process.env.DATABASE_URL);
 try{
  const actor=(await sql.query(AUTH,[session]))[0];
  if(!actor)return reply({error:'Sign in with a verified, active member account.'},403);
  if(!expectedRewardMember(req,actor.id))return reply({error:'Your signed-in account changed. Refresh your page before continuing.',sessionExpired:true},403);
  sql=bindRewardMember(sql,actor.id);
  if(req.method!=='POST'){
   const kinds=['photo','video'].filter(key=>url.searchParams.has(key));
   if(kinds.length===1)return await media(sql,session,url.searchParams.get(kinds[0]),kinds[0],req.method);
   if(kinds.length||req.method==='HEAD')return reply({error:'Media not found.'},404);
   if(url.searchParams.get('profile')==='1'){const result=await profile(sql,session);return result?reply(result):reply({error:'Your session changed. Sign in again.'},403)}
   if(url.searchParams.get('directory')==='1')return await directory(sql,session,url);
   return reply({error:'Choose your profile or the member directory.'},400);
  }
  const origin=req.headers.get('origin');
  if(origin&&origin!==url.origin)return reply({error:'Open your member page to make this change.'},403);
  let query,params;
  if(url.searchParams.get('upload')==='1'){
   if(actor.completed_level<5)return reply({error:'Complete Level 5 before adding your intro video.'},403);
   if((req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='video/mp4')return reply({error:'Choose a short MP4 video.'},415);
   const bytes=await boundedBody(req,VIDEO_BYTES);
   let video;try{video=await validateIntroVideo(bytes)}catch{return reply({error:'Choose a valid MP4 intro, no longer than 15 seconds and no larger than 2 MiB.'},400)}
   const mime=video.mimeType,duration=video.durationMs/1000;
   if(mime!=='video/mp4'||!(duration>0&&duration<=15))return reply({error:'Choose a valid MP4 intro, no longer than 15 seconds.'},400);
   query=`WITH actor AS (${AUTH}) INSERT INTO reward_directory_profile(member_id,video,video_mime,duration_seconds,video_published) SELECT id,$2::bytea,'video/mp4',$3::double precision,false FROM actor WHERE completed_level>=5 ON CONFLICT(member_id) DO UPDATE SET video=excluded.video,video_mime=excluded.video_mime,duration_seconds=excluded.duration_seconds,video_published=false,updated_at=now() RETURNING member_id`;
   params=[session,video.bytes,duration];
  }else{
   if((req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/json')return reply({error:'Use the profile controls to make this change.'},415);
   let body;try{body=JSON.parse((await boundedBody(req,JSON_BYTES)).toString('utf8'))}catch(error){if(error.status)throw error;return reply({error:'Invalid request.'},400)}
   if(!body||typeof body!=='object'||Array.isArray(body)||!['list','unlist','publishVideo','hideVideo'].includes(body.action)||Object.keys(body).some(key=>key!=='action'))return reply({error:'Choose a supported profile action.'},400);
   if(body.action==='list'){
    if(actor.completed_level<4)return reply({error:'Complete Level 4 before listing your profile.'},403);
    if(!firstName(actor.name)||!photoBytes(actor.photo))return reply({error:'Add a valid first name and JPEG profile photo before listing.'},400);
    // Copy only on explicit opt-in, and copy the current row after locking. A
    // profile edit before the lock cannot publish a stale private snapshot.
    query=`WITH actor AS (${AUTH}) INSERT INTO reward_directory_profile(member_id,listed,photo,display_name) SELECT id,true,photo,left(split_part(trim(regexp_replace(name,'[[:space:]]+',' ','g')),' ',1),50) FROM actor WHERE completed_level>=4 AND length(photo)<250000 AND photo ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' AND length(trim(name))>0 ON CONFLICT(member_id) DO UPDATE SET listed=true,photo=excluded.photo,display_name=excluded.display_name,updated_at=now() RETURNING member_id`;
   }else if(body.action==='unlist'){
    query=`WITH actor AS (${AUTH}) INSERT INTO reward_directory_profile(member_id,listed,video_published) SELECT id,false,false FROM actor ON CONFLICT(member_id) DO UPDATE SET listed=false,video_published=false,updated_at=now() RETURNING member_id`;
   }else if(body.action==='publishVideo'){
    if(actor.completed_level<5)return reply({error:'Complete Level 5 before publishing an intro video.'},403);
    query=`WITH actor AS (${AUTH}) UPDATE reward_directory_profile SET video_published=true,updated_at=now() WHERE member_id IN(SELECT id FROM actor WHERE completed_level>=5) AND listed AND video IS NOT NULL RETURNING member_id`;
   }else{
    query=`WITH actor AS (${AUTH}) UPDATE reward_directory_profile SET video_published=false,updated_at=now() WHERE member_id IN(SELECT id FROM actor) RETURNING member_id`;
   }
   params=[session];
  }
  const results=await sql.transaction(tx=>[tx.query(LOCK,[session,actor.id]),tx.query(query,params)],{isolationLevel:'ReadCommitted'});
  if(!results[1]?.length)return reply({error:'Your profile or session changed. Refresh your page; list your profile before publishing a video.'},409);
  const result=await profile(sql,session);return result?reply(result):reply({error:'Your session changed. Sign in again.'},403);
 }catch(error){
  if(error.status)return reply({error:error.message},error.status);
  // Never put names, photos, uploaded bytes, answers, or session material in logs.
  console.error('Reward directory request failed.');return reply({error:'Could not load or save your directory profile. Try again.'},503);
 }
}
export default {fetch:handler};
