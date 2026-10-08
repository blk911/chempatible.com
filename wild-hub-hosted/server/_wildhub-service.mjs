import {createHash,createHmac,randomBytes,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import {prepareWildHubPhoto,IMAGE_LIMITS} from './_wildhub-images.mjs';
import {createWildHubNotificationDispatcher,queueWildHubNotification,readWildHubNotification,readWildHubNotifications} from './_wildhub-notifications.mjs';
import {invitationEmailDraft,renderInvitationEmail} from './_wildhub-invitation-email.mjs';

export const WILD_HUB_LIMITS=Object.freeze({name:50,about:500,intro:280,caption:500,message:2000,trialDays:7,slugMin:3,slugMax:40,bodyBytes:7*1024*1024,photoBytes:IMAGE_LIMITS.bytes,photoPixels:IMAGE_LIMITS.pixels,pageSize:20,pageMax:50});
const BASE_HEADERS={'cache-control':'private, no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin','referrer-policy':'no-referrer','vary':'Cookie, Origin'};
const READS=new Set(['me','hubs','public_hub','requests','memberships','posts','media','invite_preview','access_status','chat_messages','share_resolve','creator_summary','creator_people','creator_finance']);
const WRITES=new Set(['auth_start','auth_verify','logout','profile_save','hub_save','request_join','request_withdraw','request_decide','membership_remove','leave','invite_email_preview','invite_create','invite_accept','post_create','post_delete','chat_send','share_create','membership_unblock','hub_photo_save']);
const FIELDS={auth_start:['email'],auth_verify:['email','code'],logout:[],profile_save:['name','photoDataUrl','agreed','publicLinks','publicLinksConsent'],hub_save:['name','about','slug','published','publishConsent','preservePhoto','publishPhotoConsent'],hub_photo_save:['hubId','photoDataUrl','publishConsent'],membership_unblock:['hubId','userId','expectedRevision'],request_join:['hubId','intro'],request_withdraw:['hubId'],request_decide:['requestId','decision'],membership_remove:['hubId','userId','block','expectedRevision'],leave:['hubId','expectedRevision'],invite_email_preview:['hubId','email','subject','message'],invite_create:['hubId','email','previewToken'],invite_accept:['token'],post_create:['hubId','caption','photoDataUrl'],post_delete:['postId'],chat_send:['hubId','peerId','text','clientId'],share_create:['hubId']};
const sha=value=>createHash('sha256').update(value).digest('hex');
const rows=async(db,sql,params=[])=>{const result=await db.query(sql,params);return Array.isArray(result)?result:result.rows};
const json=(value,status=200,headers={})=>Response.json({ok:true,...value},{status,headers:{...BASE_HEADERS,...headers}});
const error=(status,code,message,headers={})=>Response.json({ok:false,error:{code,message}},{status,headers:{...BASE_HEADERS,...headers}});
function fail(status,code,message){throw Object.assign(new Error(message),{status,code});}
const notFound=()=>fail(404,'not_found','This item is unavailable.');
const uuid=value=>{if(typeof value!=='string'||!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value))fail(400,'invalid_id','Invalid item.');return value.toLowerCase()};
const email=value=>{if(typeof value!=='string'||value.length>254||!/^[-\w.!#$%&'*+/=?^`{|}~]+@[a-z\d](?:[a-z\d.-]*[a-z\d])?\.[a-z]{2,}$/i.test(value.trim()))fail(400,'invalid_email','Enter a valid email address.');return value.trim().toLowerCase()};
const text=(value,max,label,min=0)=>{if(typeof value!=='string'||value.includes('\0')||value.trim().length<min||value.trim().length>max)fail(400,'invalid_field',`${label} must be ${min}–${max} characters.`);return value.trim()};
const date=value=>new Date(value).toISOString();
const photoUrl=id=>id?`/api/wildhub?action=media&id=${id}`:null;
const profileComplete=user=>Boolean(user.name&&user.photo_id&&user.acknowledged_at);
const userView=user=>({id:user.id,email:user.email,name:user.name,photoUrl:photoUrl(user.photo_id),verified:Boolean(user.verified_at),standing:user.standing,profileComplete:profileComplete(user)});
const hubView=hub=>({id:hub.id,slug:hub.slug,name:hub.name,about:hub.about,published:hub.published,photoUrl:photoUrl(hub.public_photo_id)});
const personView=user=>({id:user.id,name:user.name,photoUrl:photoUrl(user.photo_id)});
const publicHubView=hub=>({...hubView(hub),host:{id:hub.owner_id,name:hub.public_host_name},publicLinks:hub.public_links?publicLinks(hub.public_links):{}});
const tokenValue=value=>{if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))notFound();return value};
const PUBLIC_LINK_KEYS=['instagram','tiktok','youtube','website'];
const PUBLIC_LINK_MAX=2048;
const PUBLIC_LINK_HOSTS={instagram:['instagram.com','www.instagram.com'],tiktok:['tiktok.com','www.tiktok.com'],youtube:['youtube.com','www.youtube.com','m.youtube.com']};
function publicLinks(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>4||Object.keys(value).some(key=>!PUBLIC_LINK_KEYS.includes(key)))fail(400,'invalid_public_links','Use only Instagram, TikTok, YouTube and website links.');
  const result={};
  for(const key of PUBLIC_LINK_KEYS) {
    if(!Object.hasOwn(value,key))continue;
    const raw=value[key];
    if(typeof raw!=='string'||raw.length>PUBLIC_LINK_MAX||/[\u0000-\u001f\u007f-\u009f]/u.test(raw))fail(400,'invalid_public_link',`${key}: enter a link of at most ${PUBLIC_LINK_MAX} characters without control characters.`);
    const trimmed=raw.trim();if(!trimmed)continue;
    let url;try{url=new URL(trimmed);if(/[\u0000-\u001f\u007f-\u009f]/u.test(decodeURIComponent(trimmed)))throw Error('control character')}catch{fail(400,'invalid_public_link',`${key}: enter a complete http:// or https:// link.`)}
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port||trimmed.includes('\\'))fail(400,'invalid_public_link',`${key}: use an http:// or https:// link without credentials, ports or control characters.`);
    const host=url.hostname;
    if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/i.test(host)||/\.(?:localhost|local|internal|lan|home|test|invalid)$/i.test(host))fail(400,'invalid_public_link',`${key}: use a public website address.`);
    if(key!=='website') {
      if(!PUBLIC_LINK_HOSTS[key].includes(host))fail(400,'invalid_public_link',`${key}: use the official ${key} website.`);
      const path=key==='youtube'?decodeURIComponent(url.pathname):url.pathname;
      const channel=key==='youtube'?path.match(/^(\/(?:@[^/\s%?#]{1,100}|channel\/[a-z0-9_-]{1,100}|(?:c|user)\/[a-z0-9._-]{1,100}))(?:\/(featured|videos|shorts|streams|playlists|community|about))?\/?$/iu):null;
      const valid=key==='instagram'?/^\/[a-z0-9._]{1,30}\/?$/i.test(path)&&!/^\/(?:accounts|about|developer|explore|p|reel|reels|stories|direct)\/?$/i.test(path):key==='tiktok'?/^\/@[a-z0-9._]{1,24}\/?$/i.test(path):Boolean(channel);
      if(!valid)fail(400,'invalid_public_link',`${key}: link to your profile or channel.`);
      if(channel?.[2])url.pathname=channel[1];
      // Social links identify profiles; tracking and redirect parameters are not needed.
      url.search='';url.hash='';
    }
    if(url.href.length>PUBLIC_LINK_MAX)fail(400,'invalid_public_link',`${key}: the link is too long.`);
    result[key]=url.href;
  }
  return result;
}
const sessionToken=req=>(req.headers.get('cookie')||'').match(/(?:^|;\s*)wh_session=([a-f0-9]{64})(?:;|$)/)?.[1]||null;

async function boundedJson(req) {
  const contentType=req.headers.get('content-type')||'';
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType))fail(415,'json_required','Use application/json.');
  const stated=Number(req.headers.get('content-length'));
  if(Number.isFinite(stated)&&stated>WILD_HUB_LIMITS.bodyBytes)fail(413,'body_too_large','The upload is too large.');
  const reader=req.body?.getReader();let length=0;const chunks=[];
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>WILD_HUB_LIMITS.bodyBytes){await reader.cancel();fail(413,'body_too_large','The upload is too large.')}chunks.push(value)}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail(400,'invalid_json','Invalid JSON body.')}
  if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'invalid_json','Use a JSON object.');
  return body;
}

/** Pure transport service: no environment reads, fetches, schema creation or real mail.
 * db.query returns {rows} or rows; db.transaction(callback) must use one connection.
 * Transaction callbacks must resolve only after COMMIT and reject after ROLLBACK.
 * mail.send is injected and must throw when a message was not accepted.
 */
export function createWildHubService({db,mail,origin,secret,sharp,now=()=>Date.now(),secureCookies=true,emailAllowed=()=>false,getClientKey=()=> 'shared',onError=()=>{},readPaidEntitlement=async()=>null,readCreatorFinance=async()=>({available:false,reason:'Financial history is unavailable in this runtime.'}),scheduleNotifications=null}={}) {
  if(!db?.query||!db?.transaction||!mail?.send||typeof sharp!=='function'||typeof secret!=='string'||secret.length<32)throw Error('Explicit database, mail, image decoder and independent secret are required.');
  const parsedOrigin=new URL(origin);
  if(parsedOrigin.origin!==origin||(!secureCookies&&!['localhost','127.0.0.1','[::1]'].includes(parsedOrigin.hostname))||(secureCookies&&parsedOrigin.protocol!=='https:'))throw Error('Use HTTPS or an explicitly insecure loopback preview.');
  if(scheduleNotifications!==null&&typeof scheduleNotifications!=='function')throw Error('Notification scheduling must be an explicit trusted function.');
  if(typeof readCreatorFinance!=='function')throw Error('Creator finance reads must use an explicit trusted function.');
  const notifications=createWildHubNotificationDispatcher({db,mail,origin,emailAllowed,now,onError});
  const stamp=()=>new Date(now()).toISOString();
  const hashCode=(address,code)=>createHmac('sha256',secret).update(`${address}\n${code}`).digest('hex');
  const cookie=(token,age=2592000)=>`wh_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secureCookies?'; Secure':''}`;
  const allowedEmail=address=>{if(emailAllowed(address)!==true)fail(403,'email_not_allowed','Use an approved preview email address.');return address};
  const previewSignature=value=>createHmac('sha256',secret).update('invitation-preview:v1:'+value).digest('base64url');
  function signInvitationPreview(draft) {
    const encoded=Buffer.from(JSON.stringify(draft)).toString('base64url');
    return encoded+'.'+previewSignature(encoded);
  }
  const invitationSender=()=>mail.sender||{name:'BsideVibes',email:''};
  const invitationContentHash=rendered=>sha(JSON.stringify({subject:rendered.subject,html:rendered.html,text:rendered.text,from:invitationSender()}));
  function readInvitationPreview(value) {
    if(typeof value!=='string'||value.length>16000||!/^[-_a-zA-Z0-9]+\.[-_a-zA-Z0-9]{43}$/.test(value))fail(400,'preview_required','Preview this invitation before sending.');
    const [encoded,signature]=value.split('.'),expected=previewSignature(encoded);
    if(!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))fail(400,'preview_required','Preview this invitation before sending.');
    let draft;try{draft=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'))}catch{fail(400,'preview_required','Preview this invitation before sending.')}
    if(draft.v!==1||!Number.isSafeInteger(draft.createdAt))fail(400,'preview_required','Preview this invitation before sending.');
    uuid(draft.id);return draft;
  }
  async function rate(key,max,period) {
    const bucket=Math.floor(now()/period);
    const result=await rows(db,`INSERT INTO wh_rate_limits(key,bucket,count) VALUES($1,$2,1) ON CONFLICT(key,bucket) DO UPDATE SET count=wh_rate_limits.count+1 RETURNING count`,[sha(key),bucket]);
    if(result[0].count>max)fail(429,'rate_limited','Too many requests. Please wait and try again.');
  }
  async function actor(tx,req,required=true) {
    const token=sessionToken(req);let user=null;
    // User keys never change here. NO KEY UPDATE still serializes profile and
    // standing changes, while allowing FK checks from host moderation/outbox.
    if(token)user=(await rows(tx,`SELECT u.* FROM wh_sessions s JOIN wh_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2 AND u.verified_at IS NOT NULL FOR UPDATE OF s FOR NO KEY UPDATE OF u`,[sha(token),stamp()]))[0]||null;
    if(user&&user.standing!=='active')fail(403,'account_unavailable','This account cannot use BsideVibes.');
    if(!user&&required)fail(401,'sign_in_required','Sign in to continue.');
    return user;
  }
  function requireProfile(user){if(!profileComplete(user))fail(409,'profile_required','Save your name, photo, and profile acknowledgement first.');}
  async function hub(tx,id) {
    const found=(await rows(tx,'SELECT * FROM wh_hubs WHERE id=$1 FOR UPDATE',[uuid(id)]))[0];if(!found)notFound();
    const host=(await rows(tx,'SELECT standing,verified_at FROM wh_users WHERE id=$1',[found.owner_id]))[0];
    if(!host?.verified_at||host.standing!=='active')notFound();
    return found;
  }
  const requireOwner=(current,user)=>{if(current.owner_id!==user.id)fail(403,'host_required','Only this circle’s host can do that.');};
  async function membership(tx,hubId,userId){return (await rows(tx,'SELECT * FROM wh_memberships WHERE hub_id=$1 AND user_id=$2',[hubId,userId]))[0]||null}
  async function access(tx,current,userId,member=undefined) {
    if(member===undefined)member=await membership(tx,current.id,userId);
    const trial=(await rows(tx,'SELECT trial_started_at,trial_ends_at FROM wh_entitlements WHERE hub_id=$1 AND user_id=$2',[current.id,userId]))[0];
    const result={hubId:current.id,membershipStatus:member?.status||'none',membershipRevision:member?.access_revision||null,allowed:false,source:'none',trialStartedAt:trial?date(trial.trial_started_at):null,trialEndsAt:trial?date(trial.trial_ends_at):null,paidUntil:null};
    if(member?.status!=='active')return result;
    if(current.owner_id===userId&&member.role==='owner')return {...result,allowed:true,source:'owner'};
    // Trusted, read-only server adapter only; browser payloads never supply paid
    // state. Revision binding prevents stale payments surviving access revocation.
    const paid=await readPaidEntitlement({tx,hubId:current.id,userId,membershipRevision:member.access_revision,now:now()});
    if(paid&&typeof paid.paidUntil==='string'&&Number.isFinite(Date.parse(paid.paidUntil)))result.paidUntil=date(paid.paidUntil);
    if(result.paidUntil&&Date.parse(result.paidUntil)>now())return {...result,allowed:true,source:'paid'};
    if(trial&&new Date(trial.trial_ends_at).getTime()>now())return {...result,allowed:true,source:'trial'};
    return {...result,source:trial?'expired':'none'};
  }
  async function requireMember(tx,current,user) {
    const member=await membership(tx,current.id,user.id);
    if(!member||member.status!=='active')fail(403,'membership_required','An active circle membership is required.');
    if(!(await access(tx,current,user.id,member)).allowed)fail(402,'entitlement_required','Your circle access has ended. View membership options to continue.');
    return member;
  }
  async function chatPeer(tx,current,user,peerId) {
    if(peerId===undefined||peerId===null)return null;
    const id=uuid(peerId);if(id===user.id)fail(400,'invalid_peer','Choose another circle member.');
    const peer=(await rows(tx,`SELECT id,name,verified_at,standing FROM wh_users WHERE id=$1`,[id]))[0];
    if(!peer?.verified_at||peer.standing!=='active')notFound();
    const member=await membership(tx,current.id,id);
    if(member?.status!=='active'||!(await access(tx,current,id,member)).allowed)notFound();
    return peer;
  }
  function page(url) {
    const raw=url.searchParams.get('limit')||'20',limit=Number(raw);
    if(!/^\d{1,2}$/.test(raw)||limit<1||limit>50)fail(400,'invalid_limit','Choose a page size from 1 to 50.');
    const cursor=url.searchParams.get('cursor');let boundary=null;
    if(cursor){if(cursor.length>300)fail(400,'invalid_cursor','Invalid page cursor.');try{boundary=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));uuid(boundary.id);if(typeof boundary.at!=='string'||!Number.isFinite(Date.parse(boundary.at)))throw Error()}catch{fail(400,'invalid_cursor','Invalid page cursor.')}}
    return {limit,boundary};
  }
  const creatorCursor=row=>Buffer.from(JSON.stringify({at:date(row.sort_at),id:row.id})).toString('base64url');
  const creatorMembership=row=>row.membership_status?{status:row.membership_status,role:row.role,access_revision:row.access_revision}:null;
  async function creatorPerson(tx,current,row,notices,knownAccess) {
    const status=knownAccess||await access(tx,current,row.id,creatorMembership(row));
    // Only use media routes the host can already read in this circle. Historical
    // rows never restore private media access after expiry, removal or blocking.
    let photo=null,photoAvailability=row.membership_status==='active'&&!status.allowed?'access_expired':'membership_inactive';
    if(row.membership_status==='active'&&status.allowed) {photo=row.photo_id;photoAvailability=photo?'available':'no_photo';}
    else if(row.request_status==='pending'&&row.membership_status!=='blocked') {photo=row.applicant_photo_id;photoAvailability=photo?'available':'no_photo';}
    return {id:row.id,name:row.membership_status==='active'?row.name:(row.applicant_name||row.name),photoUrl:photoUrl(photo),photoAvailability,role:row.role||'applicant',membershipStatus:row.membership_status||'none',membershipRevision:row.access_revision||null,createdAt:date(row.membership_created_at||row.request_created_at),updatedAt:date(row.membership_updated_at||row.request_decided_at||row.request_created_at),access:status,request:row.request_id?{id:row.request_id,intro:row.intro,status:row.request_status,createdAt:date(row.request_created_at),decidedAt:row.request_decided_at?date(row.request_decided_at):null,notification:notices.get(row.request_id)||null}:null};
  }
  async function creatorRows(tx,current,view,boundary,limit) {
    const requestView=view==='requests',sort=requestView?'r.created_at':'m.updated_at';
    return rows(tx,`SELECT u.id,u.name,u.photo_id,m.role,m.status AS membership_status,m.access_revision,m.created_at AS membership_created_at,m.updated_at AS membership_updated_at,r.id AS request_id,r.intro,r.status AS request_status,r.created_at AS request_created_at,r.decided_at AS request_decided_at,r.applicant_name,r.applicant_photo_id,${sort} AS sort_at FROM ${requestView?'wh_requests r JOIN wh_users u ON u.id=r.applicant_id LEFT JOIN wh_memberships m ON m.hub_id=r.hub_id AND m.user_id=u.id':'wh_memberships m JOIN wh_users u ON u.id=m.user_id LEFT JOIN wh_requests r ON r.hub_id=m.hub_id AND r.applicant_id=u.id'} WHERE ${requestView?'r':'m'}.hub_id=$1 AND u.id<>$2 AND u.standing='active' AND u.verified_at IS NOT NULL ${requestView?'':"AND m.status=$6"} AND ($3::timestamptz IS NULL OR (${sort},u.id)<($3::timestamptz,$4::uuid)) ORDER BY ${sort} DESC,u.id DESC LIMIT $5`,[current.id,current.owner_id,boundary?.at||null,boundary?.id||null,limit,...(requestView?[]:[['members','expired'].includes(view)?'active':view])]);
  }
  async function creatorSummary(tx,current) {
    const counts={requests:0,pendingRequests:0,members:0,blocked:0,removed:0,left:0,expired:0,posts:0};
    const requestCounts=(await rows(tx,`SELECT count(*)::int AS total,count(*) FILTER (WHERE r.status='pending')::int AS pending FROM wh_requests r JOIN wh_users u ON u.id=r.applicant_id WHERE r.hub_id=$1 AND u.id<>$2 AND u.standing='active' AND u.verified_at IS NOT NULL`,[current.id,current.owner_id]))[0];
    counts.requests=requestCounts.total;counts.pendingRequests=requestCounts.pending;
    const memberships=await rows(tx,`SELECT m.status,count(*)::int AS count FROM wh_memberships m JOIN wh_users u ON u.id=m.user_id WHERE m.hub_id=$1 AND u.id<>$2 AND u.standing='active' AND u.verified_at IS NOT NULL GROUP BY m.status`,[current.id,current.owner_id]);
    for(const group of memberships)counts[group.status==='active'?'members':group.status]=group.count;
    counts.posts=(await rows(tx,'SELECT count(*)::int AS count FROM wh_posts WHERE hub_id=$1 AND deleted_at IS NULL',[current.id]))[0].count;
    // The trusted paid adapter owns entitlement decisions. Count actual rows in
    // bounded keyset batches instead of inferring totals from the browser page
    // or duplicating paid-access rules in an unrelated SQL query.
    if(counts.members>200)counts.expired=null;
    else {let boundary=null;for(let scanned=0;scanned<200;scanned+=100) {const batch=await creatorRows(tx,current,'members',boundary,100);for(const row of batch)if(!(await access(tx,current,row.id,creatorMembership(row))).allowed)counts.expired++;if(batch.length<100)break;const last=batch.at(-1);boundary={at:date(last.sort_at),id:last.id};}}
    return counts;
  }
  const messageView=row=>({id:row.id,text:row.body,createdAt:date(row.created_at),sender:{id:row.sender_id,name:row.sender_name}});
  async function activate(tx,hubId,userId) {
    const current=await membership(tx,hubId,userId);
    if(current?.status==='blocked')fail(403,'unavailable','This circle is unavailable.');
    if(current?.status!=='active')await rows(tx,`INSERT INTO wh_memberships(hub_id,user_id,role,status,created_at,updated_at,access_revision,trial_eligible) VALUES($1,$2,'member','active',$3,$3,$4,true) ON CONFLICT(hub_id,user_id) DO UPDATE SET status='active',updated_at=$3,access_revision=$4`,[hubId,userId,stamp(),randomUUID()]);
    // Capture one instant so real clock ticks cannot violate the exact duration.
    // Never extend or restart the trial on a repeated approval or rejoin.
    const activatedAt=now();
    if(!current||current.trial_eligible)await rows(tx,`INSERT INTO wh_entitlements(hub_id,user_id,trial_started_at,trial_ends_at) VALUES($1,$2,$3,$4) ON CONFLICT(hub_id,user_id) DO NOTHING`,[hubId,userId,new Date(activatedAt).toISOString(),new Date(activatedAt+604_800_000).toISOString()]);
  }
  async function savePhoto(tx,user,image,kind) {
    const id=randomUUID();await rows(tx,'INSERT INTO wh_media(id,owner_id,kind,bytes,width,height,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,user.id,kind,image.bytes,image.width,image.height,stamp()]);return id;
  }
  async function publicLinksCapability(tx) {
    // Catalog reads distinguish an unapplied migration from unexpected database
    // failures. No undefined-column exception, startup DDL or broad catch fallback.
    const found=(await rows(tx,`SELECT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_constraint c ON c.conrelid=a.attrelid WHERE a.attrelid='wh_users'::regclass AND a.attname='public_links' AND NOT a.attisdropped AND a.atttypid='jsonb'::regtype AND a.attnotnull AND c.conname='wh_users_public_links_valid' AND c.contype='c' AND c.convalidated) AS available`))[0];
    if(typeof found?.available!=='boolean')throw Error('Invalid public links capability result');
    return found.available;
  }
  async function profileLinksView(tx,user) {
    const available=await publicLinksCapability(tx);
    return {...userView(user),...(available?{publicLinks:publicLinks(user.public_links)}:{}),publicLinksSettings:{available,...(available?{}:{reason:'Public link settings are not available on this server yet.'})}};
  }
  async function me(tx,user) {
    if(!user)return {user:null,hub:null,memberships:[],requests:[],inbox:{pendingRequests:0},limits:WILD_HUB_LIMITS};
    const own=(await rows(tx,'SELECT * FROM wh_hubs WHERE owner_id=$1',[user.id]))[0];
    const memberships=await rows(tx,`SELECT h.id AS "hubId",h.owner_id,h.slug,h.name,m.role,m.status,m.access_revision FROM wh_memberships m JOIN wh_hubs h ON h.id=m.hub_id JOIN wh_users host ON host.id=h.owner_id WHERE m.user_id=$1 AND host.standing='active' ORDER BY h.created_at`,[user.id]);
    const projected=[];for(const item of memberships)projected.push({hubId:item.hubId,slug:item.slug,name:item.name,role:item.role,status:item.status,access:await access(tx,{id:item.hubId,owner_id:item.owner_id},user.id,item)});
    const requested=await rows(tx,`SELECT r.id,r.hub_id,h.slug,h.name AS hub_name,r.status,r.created_at,r.decided_at FROM wh_requests r JOIN wh_hubs h ON h.id=r.hub_id JOIN wh_users host ON host.id=h.owner_id WHERE r.applicant_id=$1 AND host.standing='active' ORDER BY r.created_at DESC LIMIT 100`,[user.id]);
    const notices=await readWildHubNotifications(tx,requested.map(r=>r.id));
    const requests=requested.map(r=>({id:r.id,hubId:r.hub_id,slug:r.slug,hubName:r.hub_name,status:r.status,createdAt:date(r.created_at),decidedAt:r.decided_at?date(r.decided_at):null,notification:notices.get(r.id)||null}));
    const pending=(await rows(tx,`SELECT count(*)::int AS count FROM wh_requests r JOIN wh_hubs h ON h.id=r.hub_id JOIN wh_users applicant ON applicant.id=r.applicant_id WHERE h.owner_id=$1 AND r.status='pending' AND applicant.standing='active'`,[user.id]))[0].count;
    return {user:await profileLinksView(tx,user),hub:own?hubView(own):null,memberships:projected,requests,inbox:{pendingRequests:pending},limits:WILD_HUB_LIMITS};
  }
  function postView(row){return {id:row.id,caption:row.caption,photoUrl:photoUrl(row.photo_id),createdAt:date(row.created_at),author:{id:row.author_id,name:row.author_name}};}

  async function startAuth(address) {
    allowedEmail(address);await rate(`otp:${address}`,1,60_000);await rate(`otp-day:${address}`,20,86_400_000);
    const code=String(randomInt(100000,1_000_000)),digest=hashCode(address,code),created=stamp();
    await rows(db,`INSERT INTO wh_codes(email,code_hash,expires_at,attempts,ready,created_at) VALUES($1,$2,$3,0,false,$4) ON CONFLICT(email) DO UPDATE SET code_hash=$2,expires_at=$3,attempts=0,ready=false,created_at=$4`,[address,digest,new Date(now()+600_000).toISOString(),created]);
    try {await mail.send({to:address,subject:`${code} is your BsideVibes code`,text:`Your BsideVibes code is ${code}. It expires in 10 minutes.`,kind:'otp',code});}
    catch(issue) {await rows(db,'DELETE FROM wh_codes WHERE email=$1 AND code_hash=$2',[address,digest]);if(issue?.code==='mail_budget_exceeded')return error(429,'rate_limited','Email sending is temporarily limited. Please try again later.',{'retry-after':String(issue.retryAfter)});return error(503,'mail_unavailable','The code could not be delivered. Wait one minute and try again.');}
    await rows(db,'UPDATE wh_codes SET ready=true WHERE email=$1 AND code_hash=$2',[address,digest]);
    return json({sent:true});
  }
  async function verifyAuth(req,body) {
    const address=allowedEmail(email(body.email));
    if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code))fail(400,'invalid_code','Enter the six-digit code.');
    await rate(`verify:${address}`,20,600_000);
    return db.transaction(async tx=>{
      const challenge=(await rows(tx,'SELECT * FROM wh_codes WHERE email=$1 FOR UPDATE',[address]))[0];
      if(!challenge||!challenge.ready||new Date(challenge.expires_at).getTime()<=now()||challenge.attempts>=5)return error(400,'invalid_code','The code is incorrect or expired.');
      // Returning a response (rather than throwing) commits unsuccessful attempts.
      await rows(tx,'UPDATE wh_codes SET attempts=attempts+1 WHERE email=$1',[address]);
      if(!timingSafeEqual(Buffer.from(challenge.code_hash,'hex'),Buffer.from(hashCode(address,body.code),'hex')))return error(400,'invalid_code','The code is incorrect or expired.');
      let user=(await rows(tx,'SELECT * FROM wh_users WHERE email=$1 FOR NO KEY UPDATE',[address]))[0];
      if(user&&user.standing!=='active')return error(403,'account_unavailable','This account cannot use BsideVibes.');
      if(!user)user=(await rows(tx,'INSERT INTO wh_users(id,email,verified_at,created_at) VALUES($1,$2,$3,$3) RETURNING *',[randomUUID(),address,stamp()]))[0];
      await rows(tx,'DELETE FROM wh_codes WHERE email=$1',[address]);
      const prior=sessionToken(req);if(prior)await rows(tx,'UPDATE wh_sessions SET revoked_at=$2 WHERE token_hash=$1',[sha(prior),stamp()]);
      const token=randomBytes(32).toString('hex');await rows(tx,'INSERT INTO wh_sessions(token_hash,user_id,expires_at,created_at) VALUES($1,$2,$3,$4)',[sha(token),user.id,new Date(now()+2_592_000_000).toISOString(),stamp()]);
      return json(await me(tx,user),200,{'set-cookie':cookie(token)});
    });
  }

  async function dispatch(tx,req,action,url,body,image) {
    if(action==='logout') {
      const token=sessionToken(req);if(token)await rows(tx,'UPDATE wh_sessions SET revoked_at=$2 WHERE token_hash=$1',[sha(token),stamp()]);
      return json({loggedOut:true},200,{'set-cookie':cookie('',0)});
    }
    const user=await actor(tx,req,!['me','hubs','public_hub','media','invite_preview','share_resolve'].includes(action));
    if(action==='me')return json(await me(tx,user));
    if(action==='access_status') {
      const current=await hub(tx,url.searchParams.get('hubId'));
      return json({access:await access(tx,current,user.id)});
    }
    if(action==='share_create') {
      requireProfile(user);const current=await hub(tx,body.hubId);
      if(!current.published)notFound();
      const member=await membership(tx,current.id,user.id);
      if(member&&member.status!=='active')fail(403,'share_unavailable','This sharing route is unavailable.');
      const token=randomBytes(32).toString('hex');
      await rows(tx,'INSERT INTO wh_shares(token_hash,hub_id,user_id,created_at) VALUES($1,$2,$3,$4)',[sha(token),current.id,user.id,stamp()]);
      return json({share:{token,url:new URL(`/#share/${token}`,origin).href}});
    }
    if(action==='share_resolve') {
      const token=tokenValue(url.searchParams.get('token'));
      const share=(await rows(tx,'SELECT hub_id,user_id FROM wh_shares WHERE token_hash=$1 AND revoked_at IS NULL',[sha(token)]))[0];if(!share)notFound();
      const current=await hub(tx,share.hub_id);if(!current.published)notFound();
      const sharer=(await rows(tx,`SELECT photo_id,name,acknowledged_at,verified_at,standing FROM wh_users WHERE id=$1`,[share.user_id]))[0];
      const member=await membership(tx,current.id,share.user_id);
      // Recheck revocation after the hub lock, not only before waiting for it.
      const live=(await rows(tx,'SELECT token_hash FROM wh_shares WHERE token_hash=$1 AND revoked_at IS NULL',[sha(token)]))[0];
      if(!live||!sharer?.verified_at||sharer.standing!=='active'||!profileComplete(sharer)||member&&member.status!=='active')notFound();
      return json({frontDoor:{slug:current.slug,url:new URL(`/#hub/${encodeURIComponent(current.slug)}`,origin).href}});
    }
    if(action==='chat_messages'||action==='chat_send') {
      const current=await hub(tx,action==='chat_send'?body.hubId:url.searchParams.get('hubId'));await requireMember(tx,current,user);requireProfile(user);
      const peer=await chatPeer(tx,current,user,action==='chat_send'?body.peerId:url.searchParams.get('peerId'));
      if(action==='chat_send') {
        const message=text(body.text,2000,'Message',1),clientId=uuid(body.clientId);
        const prior=(await rows(tx,'SELECT * FROM wh_messages WHERE hub_id=$1 AND sender_id=$2 AND client_id=$3',[current.id,user.id,clientId]))[0];
        if(prior){if(prior.recipient_id!==(peer?.id||null)||prior.body!==message)fail(409,'idempotency_conflict','This message key was already used for another message.');return json({message:messageView(prior)})}
        const created=(await rows(tx,'INSERT INTO wh_messages(id,hub_id,sender_id,recipient_id,sender_name,body,client_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[randomUUID(),current.id,user.id,peer?.id||null,user.name,message,clientId,stamp()]))[0];
        return json({message:messageView(created)},201);
      }
      const {limit,boundary}=page(url);
      const list=await rows(tx,`SELECT * FROM wh_messages WHERE hub_id=$1 AND (($2::uuid IS NULL AND recipient_id IS NULL) OR ($2::uuid IS NOT NULL AND ((sender_id=$3 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$3)))) AND ($4::timestamptz IS NULL OR (created_at,id)<($4::timestamptz,$5::uuid)) ORDER BY created_at DESC,id DESC LIMIT $6`,[current.id,peer?.id||null,user.id,boundary?.at||null,boundary?.id||null,limit+1]);
      const more=list.length>limit,visible=list.slice(0,limit),last=visible.at(-1);
      return json({peer:peer?{id:peer.id,name:peer.name}:null,messages:visible.reverse().map(messageView),nextCursor:more?Buffer.from(JSON.stringify({at:date(last.created_at),id:last.id})).toString('base64url'):null});
    }
    if(action==='hubs') {
      const linksAvailable=await publicLinksCapability(tx);
      const list=await rows(tx,`SELECT h.*${linksAvailable?',u.public_links':''} FROM wh_hubs h JOIN wh_users u ON u.id=h.owner_id WHERE h.published=true AND u.standing='active' AND u.verified_at IS NOT NULL ORDER BY h.created_at DESC,h.id DESC LIMIT 50`);
      return json({hubs:list.map(publicHubView)});
    }
    if(action==='public_hub') {
      const slug=text(url.searchParams.get('slug'),40,'Slug',3);
      const linksAvailable=await publicLinksCapability(tx);
      const current=(await rows(tx,`SELECT h.*${linksAvailable?',u.public_links':''} FROM wh_hubs h JOIN wh_users u ON u.id=h.owner_id WHERE h.slug=$1 AND h.published=true AND u.standing='active' AND u.verified_at IS NOT NULL FOR UPDATE OF h`,[slug]))[0];if(!current)notFound();
      let relationship='none';
      if(user){const member=await membership(tx,current.id,user.id);const request=(await rows(tx,'SELECT status FROM wh_requests WHERE hub_id=$1 AND applicant_id=$2',[current.id,user.id]))[0];relationship=current.owner_id===user.id?'owner':member?.status==='active'?'active':member?.status==='blocked'?'blocked':request?.status==='pending'?'pending':member?.status==='removed'?'removed':member?.status==='left'?'left':request?.status==='passed'?'passed':'none'}
      return json({hub:publicHubView(current),relationship});
    }
    if(action==='profile_save') {
      const name=text(body.name,50,'Name',1);
      let links;
      if(body.publicLinks!==undefined||body.publicLinksConsent!==undefined) {
        if(!await publicLinksCapability(tx))fail(503,'public_links_unavailable','Public link settings are not available on this server yet. Save your name and photo without public links.');
        if(body.publicLinksConsent!==undefined&&typeof body.publicLinksConsent!=='boolean')fail(400,'invalid_field','Choose whether to make these links public.');
        if(body.publicLinks===undefined)fail(400,'invalid_public_links','Include the public links to save.');
        links=publicLinks(body.publicLinks);
        const previous=publicLinks(user.public_links);
        if(Object.entries(links).some(([key,value])=>previous[key]!==value)&&body.publicLinksConsent!==true)fail(400,'public_links_consent_required','Confirm these links will be visible on your public creator page.');
      }
      if(body.agreed!==true&&!user.acknowledged_at)fail(400,'acknowledgement_required','Confirm that you are an adult and agree to share your name, photo, and introduction with the circles you choose.');
      const photoId=image?await savePhoto(tx,user,image,'profile'):user.photo_id;
      if(!photoId)fail(400,'photo_required','Add a profile photo.');
      const updated=(await rows(tx,`UPDATE wh_users SET name=$2,photo_id=$3,acknowledged_at=COALESCE(acknowledged_at,$4),acknowledgement_version=COALESCE(acknowledgement_version,'local-v1') WHERE id=$1 RETURNING *`,[user.id,name,photoId,stamp()]))[0];
      if(links!==undefined) {
        const saved=(await rows(tx,'UPDATE wh_users SET public_links=$2::jsonb WHERE id=$1 RETURNING *',[user.id,JSON.stringify(links)]))[0];
        return json({user:await profileLinksView(tx,saved)});
      }
      return json({user:await profileLinksView(tx,updated)});
    }
    if(action==='hub_save') {
      requireProfile(user);const name=text(body.name,50,'Circle name',1),about=text(body.about,500,'About'),slug=text(body.slug,40,'Slug',3);
      if(!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(slug))fail(400,'invalid_slug','Use 3–40 lowercase letters, numbers, or hyphens.');
      if(body.preservePhoto!==undefined&&typeof body.preservePhoto!=='boolean')fail(400,'invalid_field','Choose whether to keep the page image.');
      if(body.publishPhotoConsent!==undefined&&typeof body.publishPhotoConsent!=='boolean')fail(400,'invalid_field','Choose whether to publish your profile photo as the page image.');
      if(typeof body.published!=='boolean')fail(400,'invalid_field','Choose whether this circle is public.');
      if(body.published&&body.publishConsent!==true)fail(400,'publication_consent_required','Explicitly approve publishing this name, photo, and circle description.');
      const existing=(await rows(tx,'SELECT * FROM wh_hubs WHERE owner_id=$1 FOR UPDATE',[user.id]))[0];
      const collision=(await rows(tx,'SELECT id FROM wh_hubs WHERE slug=$1 AND owner_id<>$2',[slug,user.id]))[0];if(collision)fail(409,'slug_taken','Choose another circle address.');
      let publicPhoto=existing?.public_photo_id||null,hostName=existing?.public_host_name||null,consent=existing?.published_consent_at||null;
      if(body.published&&body.preservePhoto&&!publicPhoto&&body.publishPhotoConsent!==true)fail(400,'photo_publication_consent_required','Explicitly approve publishing your profile photo as the first public page image.');
      if(body.published&&(!body.preservePhoto||!publicPhoto)) {const currentPhoto=(await rows(tx,'SELECT * FROM wh_media WHERE id=$1 AND owner_id=$2 AND kind=\'profile\'',[user.photo_id,user.id]))[0];if(!currentPhoto)fail(400,'photo_required','Add a profile photo.');publicPhoto=await savePhoto(tx,user,currentPhoto,'public');hostName=user.name;consent=stamp();}
      if(body.published){hostName=user.name;consent=stamp();}
      const id=existing?.id||randomUUID();
      const current=(await rows(tx,`INSERT INTO wh_hubs(id,owner_id,slug,name,about,published,public_photo_id,public_host_name,published_consent_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) ON CONFLICT(owner_id) DO UPDATE SET slug=$3,name=$4,about=$5,published=$6,public_photo_id=$7,public_host_name=$8,published_consent_at=$9,updated_at=$10 RETURNING *`,[id,user.id,slug,name,about,body.published,publicPhoto,hostName,consent,stamp()]))[0];
      await rows(tx,`INSERT INTO wh_memberships(hub_id,user_id,role,status,created_at,updated_at) VALUES($1,$2,'owner','active',$3,$3) ON CONFLICT(hub_id,user_id) DO UPDATE SET role='owner',status='active',updated_at=$3`,[current.id,user.id,stamp()]);
      return json({hub:hubView(current)});
    }
    if(action==='hub_photo_save') {
      requireProfile(user);const current=await hub(tx,body.hubId);requireOwner(current,user);
      if(!current.published)fail(409,'publication_required','Publish this circle before changing its public page image.');
      if(body.publishConsent!==true)fail(400,'publication_consent_required','Explicitly approve publishing this page image.');
      if(!image)fail(400,'photo_required','Add a page image.');
      const photoId=await savePhoto(tx,user,image,'public');
      const updated=(await rows(tx,'UPDATE wh_hubs SET public_photo_id=$2,published_consent_at=$3,updated_at=$3 WHERE id=$1 RETURNING *',[current.id,photoId,stamp()]))[0];
      return json({hub:hubView(updated)});
    }
    if(action==='creator_finance') {
      const current=await hub(tx,url.searchParams.get('hubId'));requireOwner(current,user);
      return json({finance:await readCreatorFinance({tx,hubId:current.id,userId:user.id})});
    }
    if(action==='creator_summary'||action==='creator_people') {
      const current=await hub(tx,url.searchParams.get('hubId'));requireOwner(current,user);
      if(action==='creator_summary'){const counts=await creatorSummary(tx,current);return json({hub:hubView(current),counts,expiredCountAvailability:counts.expired===null?'unavailable':'available'});}
      const view=url.searchParams.get('view')||'requests';if(!['requests','members','blocked','removed','left','expired'].includes(view))fail(400,'invalid_view','Choose a valid people list.');
      const {limit,boundary}=page(url);let list=[],after=boundary,scanCursor=null;
      if(view==='expired') {
        // Filtering through the entitlement adapter can require several batches,
        // but neither SQL fetches nor the accumulated response are unbounded.
        for(let scanned=0;scanned<200&&list.length<=limit;scanned+=50) {const batch=await creatorRows(tx,current,view,after,50);for(const row of batch){const status=await access(tx,current,row.id,creatorMembership(row));if(!status.allowed)list.push({...row,knownAccess:status});if(list.length>limit)break;}if(list.length>limit||batch.length<50){scanCursor=null;break;}const last=batch.at(-1);after={at:date(last.sort_at),id:last.id};scanCursor=creatorCursor(last);}
      } else list=await creatorRows(tx,current,view,boundary,limit+1);
      const more=list.length>limit,visible=list.slice(0,limit),notices=await readWildHubNotifications(tx,visible.map(row=>row.request_id).filter(Boolean)),people=[];
      for(const row of visible)people.push(await creatorPerson(tx,current,row,notices,row.knownAccess));
      return json({people,nextCursor:more?creatorCursor(visible.at(-1)):scanCursor});
    }
    if(action==='membership_unblock') {
      const current=await hub(tx,body.hubId);requireOwner(current,user);const target=uuid(body.userId);
      if(target===current.owner_id)fail(400,'host_cannot_leave','The host cannot change their own membership.');
      if(!Object.hasOwn(body,'expectedRevision'))fail(400,'revision_required','Refresh this membership before continuing.');
      const expectedRevision=uuid(body.expectedRevision),member=await membership(tx,current.id,target);
      if(!member)notFound();
      if(member.access_revision!==expectedRevision)fail(409,'membership_changed','This membership changed. Review it again before continuing.');
      if(member.status!=='blocked')fail(409,'cannot_unblock','Only a blocked membership can be unblocked.');
      const targetUser=(await rows(tx,'SELECT standing,verified_at FROM wh_users WHERE id=$1',[target]))[0];
      if(!targetUser?.verified_at||targetUser.standing!=='active')fail(403,'account_unavailable','This account cannot use BsideVibes.');
      const revision=randomUUID();
      // Unblocking is not admission. Do not touch trial eligibility/entitlements,
      // old invitations, requests, shares, revocation events, or account standing.
      await rows(tx,"UPDATE wh_memberships SET status='removed',updated_at=$3,access_revision=$4 WHERE hub_id=$1 AND user_id=$2",[current.id,target,stamp(),revision]);
      return json({unblocked:true,membership:{hubId:current.id,userId:target,status:'removed',membershipRevision:revision}});
    }
    if(action==='request_join') {
      requireProfile(user);const current=await hub(tx,body.hubId),intro=text(body.intro,280,'Introduction',1);
      if(!current.published)notFound();if(current.owner_id===user.id)fail(409,'already_host','You host this circle.');
      const member=await membership(tx,current.id,user.id);
      if(member?.status==='blocked')fail(403,'unavailable','This circle is unavailable.');
      if(member?.status==='active')fail(409,'already_member','You are already a member.');
      const previous=(await rows(tx,'SELECT id,status FROM wh_requests WHERE hub_id=$1 AND applicant_id=$2',[current.id,user.id]))[0];
      if(previous) {
        if(previous.status==='withdrawn'||['approved','passed'].includes(previous.status)&&['removed','left'].includes(member?.status)) {
          const request=(await rows(tx,`UPDATE wh_requests SET id=$6,status='pending',intro=$2,applicant_name=$3,applicant_photo_id=$4,decided_at=NULL,created_at=$5 WHERE id=$1 RETURNING id,status`,[previous.id,intro,user.name,user.photo_id,stamp(),randomUUID()]))[0];
          const jobId=await queueWildHubNotification(tx,{kind:'request',hubId:current.id,requestId:request.id,recipientId:current.owner_id,now:now(),mail});
          return {notify:{jobIds:[jobId],requestId:request.id,kind:'request',payload:{request},status:201}};
        }
        return json({request:previous,notification:await readWildHubNotification(tx,previous.id)});
      }
      const request=(await rows(tx,'INSERT INTO wh_requests(id,hub_id,applicant_id,intro,applicant_name,applicant_photo_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status',[randomUUID(),current.id,user.id,intro,user.name,user.photo_id,stamp()]))[0];
      const jobId=await queueWildHubNotification(tx,{kind:'request',hubId:current.id,requestId:request.id,recipientId:current.owner_id,now:now(),mail});
      return {notify:{jobIds:[jobId],requestId:request.id,kind:'request',payload:{request},status:201}};
    }
    if(action==='request_withdraw') {
      const current=await hub(tx,body.hubId);
      const request=(await rows(tx,'SELECT id,status FROM wh_requests WHERE hub_id=$1 AND applicant_id=$2 FOR UPDATE',[current.id,user.id]))[0];
      if(!request)notFound();
      if(!['pending','withdrawn'].includes(request.status))fail(409,'already_decided','This request is no longer pending.');
      if(request.status==='pending')await rows(tx,`UPDATE wh_requests SET status='withdrawn',decided_at=$2 WHERE id=$1`,[request.id,stamp()]);
      return json({withdrawn:true,request:{id:request.id,status:'withdrawn'}});
    }
    if(action==='requests') {
      const current=await hub(tx,url.searchParams.get('hubId'));requireOwner(current,user);
      const list=await creatorRows(tx,current,'requests',null,100),notices=await readWildHubNotifications(tx,list.map(row=>row.request_id)),requests=[];
      for(const row of list){const person=await creatorPerson(tx,current,row,notices);requests.push({...person.request,applicant:{id:person.id,name:person.name,photoUrl:person.photoUrl,photoAvailability:person.photoAvailability}});}
      return json({requests});
    }
    if(action==='request_decide') {
      const id=uuid(body.requestId);if(!['approve','pass'].includes(body.decision))fail(400,'invalid_decision','Choose approve or pass.');
      const initial=(await rows(tx,'SELECT hub_id FROM wh_requests WHERE id=$1',[id]))[0];if(!initial)notFound();
      const current=await hub(tx,initial.hub_id);requireOwner(current,user);
      const request=(await rows(tx,'SELECT * FROM wh_requests WHERE id=$1 FOR UPDATE',[id]))[0];
      // Reapplication rotates the request ID. Recheck after the hub lock so an
      // earlier lookup cannot authorize a replacement generation during a race.
      if(!request)notFound();
      const desired=body.decision==='approve'?'approved':'passed';
      if(request.status!== 'pending') {if(request.status!==desired)fail(409,'already_decided','This request has already been decided.');return json({request:{id,status:request.status},notification:request.status==='approved'?await readWildHubNotification(tx,id,'approval'):null})}
      const applicant=(await rows(tx,'SELECT * FROM wh_users WHERE id=$1',[request.applicant_id]))[0];
      if(!applicant?.verified_at||applicant.standing!=='active'||!profileComplete(applicant))fail(403,'applicant_unavailable','This applicant is unavailable.');
      if(body.decision==='approve')await activate(tx,current.id,request.applicant_id);
      await rows(tx,'UPDATE wh_requests SET status=$2,decided_at=$3 WHERE id=$1',[id,desired,stamp()]);
      if(desired==='approved') {
        const active=await membership(tx,current.id,request.applicant_id);
        const jobId=await queueWildHubNotification(tx,{kind:'approval',hubId:current.id,requestId:id,recipientId:request.applicant_id,membershipRevision:active.access_revision,now:now(),mail});
        return {notify:{jobIds:[jobId],requestId:id,kind:'approval',payload:{request:{id,status:desired}},status:200}};
      }
      return json({request:{id,status:desired},notification:null});
    }
    if(action==='memberships') {
      const current=await hub(tx,url.searchParams.get('hubId'));await requireMember(tx,current,user);
      const scope=url.searchParams.get('scope');if(scope&&scope!=='manage')fail(400,'invalid_scope','Invalid member-list scope.');
      const managing=scope==='manage';if(managing)requireOwner(current,user);
      const list=await rows(tx,`SELECT u.id,u.name,u.photo_id,m.role FROM wh_memberships m JOIN wh_users u ON u.id=m.user_id WHERE m.hub_id=$1 AND m.status='active' AND u.standing='active' AND u.verified_at IS NOT NULL ORDER BY CASE WHEN m.role='owner' THEN 0 ELSE 1 END,u.name,u.id LIMIT 200`,[current.id]);
      const visible=[];for(const person of list){const status=await access(tx,current,person.id);if(status.allowed||managing)visible.push({...personView(person),photoUrl:status.allowed?photoUrl(person.photo_id):null,role:person.role,...(managing?{access:status}:{})});}
      return json({members:visible});
    }
    if(action==='membership_remove'||action==='leave') {
      const current=await hub(tx,body.hubId),target=action==='leave'?user.id:uuid(body.userId);
      if(action!=='leave')requireOwner(current,user);
      if(target===current.owner_id)fail(400,'host_cannot_leave','The host cannot leave or remove themselves.');
      if(action==='membership_remove'&&typeof body.block!=='boolean')fail(400,'invalid_field','Choose remove or block.');
      if(!Object.hasOwn(body,'expectedRevision'))fail(400,'revision_required','Refresh this membership before continuing.');
      const expectedRevision=body.expectedRevision===null?null:uuid(body.expectedRevision);
      const member=await membership(tx,current.id,target);
      if(member?.status==='active'&&expectedRevision!==member.access_revision||!member&&expectedRevision!==null)fail(409,'membership_changed','This membership changed. Review it again before continuing.');
      if(action==='leave'&&member?.status!=='active'&&member?.status!=='left')fail(409,'cannot_leave','Only an active member can leave this circle.');
      const targetUser=(await rows(tx,'SELECT email FROM wh_users WHERE id=$1',[target]))[0];if(!targetUser)notFound();
      const connected=member||(await rows(tx,'SELECT id FROM wh_requests WHERE hub_id=$1 AND applicant_id=$2',[current.id,target]))[0];if(!connected)notFound();
      const status=member?.status==='blocked'?'blocked':action==='leave'?'left':body.block?'blocked':'removed';
      if(member&&member.status!=='active'&&member.status===status)return json(action==='leave'?{left:true}:{removed:true});
      if(member&&member.status!=='active'&&expectedRevision!==member.access_revision)fail(409,'membership_changed','This membership changed. Review it again before continuing.');
      if(member?.status!==status)await rows(tx,`INSERT INTO wh_memberships(hub_id,user_id,role,status,created_at,updated_at,access_revision,trial_eligible) VALUES($1,$2,'member',$3,$4,$4,$5,true) ON CONFLICT(hub_id,user_id) DO UPDATE SET status=$3,updated_at=$4,access_revision=$5`,[current.id,target,status,stamp(),randomUUID()]);
      if(member?.status==='active') {
        // Access revocation and its billing reconciliation event commit together.
        // Retrying a removal cannot target a future membership/subscription.
        await rows(tx,`INSERT INTO wh_membership_events(id,hub_id,user_id,membership_revision,kind,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(hub_id,user_id,membership_revision) DO NOTHING`,[randomUUID(),current.id,target,member.access_revision,status,stamp()]);
      }
      await rows(tx,'UPDATE wh_shares SET revoked_at=$3 WHERE hub_id=$1 AND user_id=$2 AND revoked_at IS NULL',[current.id,target,stamp()]);
      await rows(tx,`UPDATE wh_requests SET status='passed',decided_at=$3 WHERE hub_id=$1 AND applicant_id=$2 AND status='pending'`,[current.id,target,stamp()]);
      await rows(tx,'UPDATE wh_invites SET revoked_at=$3 WHERE hub_id=$1 AND email=$2 AND accepted_at IS NULL AND revoked_at IS NULL',[current.id,targetUser.email,stamp()]);
      return json(action==='leave'?{left:true}:{removed:true});
    }
    if(action==='invite_email_preview'||action==='invite_create') {
      requireProfile(user);const current=await hub(tx,body.hubId);requireOwner(current,user);const address=allowedEmail(email(body.email));
      if(address===user.email)fail(400,'own_email','Invite another person.');
      let draft=null;
      if(action==='invite_create'&&body.previewToken!==undefined) {
        draft=readInvitationPreview(body.previewToken);
        if(draft.actor!==user.id||draft.hubId!==current.id||draft.email!==address)fail(403,'preview_mismatch','This preview belongs to a different invitation.');
        // One signed preview is one send attempt. A lost response or double click
        // can read its outcome, but cannot send another provider message.
        const existing=(await rows(tx,'SELECT * FROM wh_invites WHERE id=$1',[draft.id]))[0];
        if(existing){
          if(existing.hub_id!==current.id||existing.created_by!==user.id||existing.email!==address)fail(409,'preview_mismatch','Preview this invitation again.');
          if(existing.ready)return json({sent:true,inviteId:existing.id,delivery:{status:'accepted',mode:mail.deliveryMode||'unknown'}});
          fail(409,'invitation_uncertain','This invitation is still sending or its send could not be confirmed. Do not send it again; check with your recipient first.');
        }
        if(draft.createdAt>now()||now()-draft.createdAt>1_800_000)fail(409,'preview_expired','This preview has expired. Review it again before sending.');
        const currentNames=invitationEmailDraft({hostName:user.name,hubName:current.name});
        if(draft.hostName!==currentNames.hostName||draft.hubName!==currentNames.hubName)fail(409,'preview_changed','Your page details changed. Review the updated email before sending.');
        const reviewed=renderInvitationEmail({...draft,origin,to:address,link:new URL('/#invitation-preview',origin).href});
        if(draft.contentHash!==invitationContentHash(reviewed))fail(409,'preview_changed','The email template or sender changed. Review the updated email before sending.');
      }
      const target=(await rows(tx,'SELECT * FROM wh_users WHERE email=$1',[address]))[0];
      if(target){const member=await membership(tx,current.id,target.id);if(target.standing!=='active'||member?.status==='blocked')fail(403,'unavailable','This invitation is unavailable.');if(member?.status==='active')fail(409,'already_member','This person is already a member.')}
      if(action==='invite_email_preview') {
        const content=invitationEmailDraft({hostName:user.name,hubName:current.name,subject:body.subject,message:body.message});
        const rendered=renderInvitationEmail({...content,origin,to:address,link:new URL('/#invitation-preview',origin).href});
        const preview={v:1,id:randomUUID(),actor:user.id,hubId:current.id,email:address,...content,contentHash:invitationContentHash(rendered),createdAt:now()};
        return json({preview:{to:address,from:invitationSender(),...rendered,previewToken:signInvitationPreview(preview)}});
      }
      // Existing clients may still use the default invitation. New custom mail
      // always comes from a signed server preview, never browser-provided HTML.
      draft=draft||invitationEmailDraft({hostName:user.name,hubName:current.name});
      const id=draft.id||randomUUID(),token=randomBytes(32).toString('hex');
      await rows(tx,'UPDATE wh_invites SET revoked_at=$3 WHERE hub_id=$1 AND email=$2 AND accepted_at IS NULL AND revoked_at IS NULL',[current.id,address,stamp()]);
      await rows(tx,'INSERT INTO wh_invites(id,hub_id,created_by,email,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,current.id,user.id,address,sha(token),new Date(now()+604_800_000).toISOString(),stamp()]);
      return {sendInvite:{id,token,address,draft}};
    }
    if(action==='invite_preview'||action==='invite_accept') {
      const token=tokenValue(action==='invite_preview'?url.searchParams.get('token'):body.token);
      const initial=(await rows(tx,'SELECT hub_id FROM wh_invites WHERE token_hash=$1',[sha(token)]))[0];if(!initial)notFound();
      const current=await hub(tx,initial.hub_id);
      const invite=(await rows(tx,'SELECT * FROM wh_invites WHERE token_hash=$1 FOR UPDATE',[sha(token)]))[0];
      if(!invite.ready||invite.accepted_at||invite.revoked_at||new Date(invite.expires_at).getTime()<=now())notFound();
      const member=user?await membership(tx,current.id,user.id):null;
      const canAccept=Boolean(user&&user.email===invite.email&&profileComplete(user)&&member?.status!=='blocked'&&user.id!==current.owner_id);
      if(action==='invite_preview')return json({invite:{hubId:current.id,hubName:current.name,hostName:current.public_host_name||'Your host',expiresAt:date(invite.expires_at)},canAccept});
      requireProfile(user);if(!canAccept)fail(403,'invite_recipient_required','Sign in with the invited email to accept this invitation.');
      await activate(tx,current.id,user.id);
      await rows(tx,`UPDATE wh_requests SET status='approved',decided_at=$3 WHERE hub_id=$1 AND applicant_id=$2`,[current.id,user.id,stamp()]);
      await rows(tx,'UPDATE wh_invites SET accepted_at=$2,accepted_by=$3 WHERE id=$1 AND accepted_at IS NULL',[invite.id,stamp(),user.id]);
      return json({membership:{hubId:current.id,status:'active'}});
    }
    if(action==='posts') {
      const current=await hub(tx,url.searchParams.get('hubId'));await requireMember(tx,current,user);
      const limitText=url.searchParams.get('limit')||'20',limit=Number(limitText);if(!/^\d{1,2}$/.test(limitText)||limit<1||limit>50)fail(400,'invalid_limit','Choose a page size from 1 to 50.');
      const cursor=url.searchParams.get('cursor');let boundary=null;
      if(cursor){if(cursor.length>300)fail(400,'invalid_cursor','Invalid page cursor.');try{boundary=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));uuid(boundary.id);if(typeof boundary.at!=='string'||!Number.isFinite(Date.parse(boundary.at)))throw Error()}catch{fail(400,'invalid_cursor','Invalid page cursor.')}}
      const list=await rows(tx,`SELECT p.*,u.name AS author_name FROM wh_posts p JOIN wh_users u ON u.id=p.author_id WHERE p.hub_id=$1 AND p.deleted_at IS NULL AND ($2::timestamptz IS NULL OR (p.created_at,p.id)<($2::timestamptz,$3::uuid)) ORDER BY p.created_at DESC,p.id DESC LIMIT $4`,[current.id,boundary?.at||null,boundary?.id||null,limit+1]);
      const more=list.length>limit,visible=list.slice(0,limit),last=visible.at(-1);
      return json({posts:visible.map(postView),nextCursor:more?Buffer.from(JSON.stringify({at:date(last.created_at),id:last.id})).toString('base64url'):null});
    }
    if(action==='post_create') {
      requireProfile(user);const current=await hub(tx,body.hubId);requireOwner(current,user);await requireMember(tx,current,user);const caption=text(body.caption,500,'Caption');
      if(!image)fail(400,'photo_required','Add a photo.');
      const photoId=await savePhoto(tx,user,image,'post');
      const post=(await rows(tx,'INSERT INTO wh_posts(id,hub_id,author_id,photo_id,caption,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[randomUUID(),current.id,user.id,photoId,caption,stamp()]))[0];
      return json({post:postView({...post,author_name:user.name})},201);
    }
    if(action==='post_delete') {
      const id=uuid(body.postId);const initial=(await rows(tx,'SELECT hub_id FROM wh_posts WHERE id=$1',[id]))[0];if(!initial)notFound();
      const current=await hub(tx,initial.hub_id);requireOwner(current,user);
      await rows(tx,'UPDATE wh_posts SET deleted_at=COALESCE(deleted_at,$2) WHERE id=$1',[id,stamp()]);return json({deleted:true});
    }
    if(action==='media') {
      const id=uuid(url.searchParams.get('id'));const media=(await rows(tx,'SELECT * FROM wh_media WHERE id=$1',[id]))[0];if(!media)notFound();
      let permitted=false;
      if(media.kind==='public') {
        const published=(await rows(tx,`SELECT h.* FROM wh_hubs h JOIN wh_users u ON u.id=h.owner_id WHERE h.public_photo_id=$1 AND h.published=true AND u.standing='active' AND u.verified_at IS NOT NULL FOR UPDATE OF h`,[id]))[0];permitted=Boolean(published);
      } else if(user&&media.kind==='post') {
        const post=(await rows(tx,'SELECT hub_id FROM wh_posts WHERE photo_id=$1 AND deleted_at IS NULL',[id]))[0];
        if(post){const current=await hub(tx,post.hub_id);const member=await membership(tx,current.id,user.id);permitted=member?.status==='active'&&(await access(tx,current,user.id,member)).allowed}
      } else if(user&&media.kind==='profile') {
        const target=(await rows(tx,`SELECT * FROM wh_users WHERE id=$1 AND standing='active' AND verified_at IS NOT NULL`,[media.owner_id]))[0];
        if(target){
          if(user.id===target.id&&target.photo_id===id)permitted=true;
          else {
            // The hub lock serializes member/profile reads with removal/block.
            const circles=await rows(tx,`SELECT DISTINCT h.id FROM wh_hubs h LEFT JOIN wh_memberships mine ON mine.hub_id=h.id AND mine.user_id=$1 LEFT JOIN wh_memberships theirs ON theirs.hub_id=h.id AND theirs.user_id=$2 LEFT JOIN wh_requests r ON r.hub_id=h.id AND r.applicant_id=$2 WHERE (mine.status='active' AND theirs.status='active') OR (h.owner_id=$1 AND r.status='pending' AND r.applicant_photo_id=$3 AND (theirs.status IS NULL OR theirs.status<>'blocked')) ORDER BY h.id`,[user.id,target.id,id]);
            for(const circle of circles){const current=await hub(tx,circle.id);const mine=await membership(tx,current.id,user.id),theirs=await membership(tx,current.id,target.id);const request=(await rows(tx,`SELECT id FROM wh_requests WHERE hub_id=$1 AND applicant_id=$2 AND status='pending' AND applicant_photo_id=$3`,[current.id,target.id,id]))[0];if(mine?.status==='active'&&theirs?.status==='active'&&target.photo_id===id&&(await access(tx,current,user.id,mine)).allowed&&(await access(tx,current,target.id,theirs)).allowed||current.owner_id===user.id&&request&&theirs?.status!=='blocked'){permitted=true;break}}
          }
        }
      }
      if(!permitted)notFound();
      const bytes=new Uint8Array(media.bytes);return new Response(bytes,{headers:{...BASE_HEADERS,'content-type':'image/jpeg','content-length':String(bytes.length),'content-disposition':'inline'}});
    }
    fail(400,'unknown_action','Unknown action.');
  }

  async function handle(req) {
    try {
      const url=new URL(req.url),action=url.searchParams.get('action');
      if(url.origin!==origin)fail(403,'origin_rejected','This request origin is not allowed.');
      const requestOrigin=req.headers.get('origin');
      if(requestOrigin&&requestOrigin!==origin)fail(403,'origin_rejected','This request origin is not allowed.');
      if(!READS.has(action)&&!WRITES.has(action))fail(400,'unknown_action','Unknown action.');
      if(req.method!==(READS.has(action)?'GET':'POST'))fail(405,'method_not_allowed','This method is not allowed.');
      if(['creator_summary','creator_people','creator_finance'].includes(action)) {const allowed=action==='creator_people'?['action','hubId','view','limit','cursor']:['action','hubId'];if([...url.searchParams.keys()].some(key=>!allowed.includes(key)))fail(400,'unexpected_field','The request contains unsupported fields.');}
      if(req.method==='POST'&&requestOrigin!==origin)fail(403,'origin_required','A same-origin request is required.');
      // Client keys come only from a trusted injected adapter, never arbitrary
      // X-Forwarded-For headers. Email and actor quotas remain server-owned.
      if(action!=='invite_email_preview')await rate(`client:${String(getClientKey(req)).slice(0,200)}`,400,60_000);
      let body={};if(req.method==='POST') {body=await boundedJson(req);if(Object.keys(body).some(key=>!FIELDS[action].includes(key)))fail(400,'unexpected_field','The request contains unsupported fields.');}
      if(action==='auth_start')return await startAuth(email(body.email));
      if(action==='auth_verify')return await verifyAuth(req,body);
      if(req.method==='POST'&&action!=='invite_email_preview') {
        const token=sessionToken(req);
        const account=token?(await rows(db,'SELECT user_id FROM wh_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>$2',[sha(token),stamp()]))[0]:null;
        await rate(`write:${account?.user_id||'anonymous'}:${action}`,action==='invite_create'?20:action==='request_join'?10:action==='chat_send'?600:120,3_600_000);
        if(action==='chat_send')await rate(`chat:${account?.user_id||'anonymous'}`,60,60_000);
      }
      let image=null;if(['profile_save','post_create','hub_photo_save'].includes(action)&&body.photoDataUrl!==undefined)image=await prepareWildHubPhoto(body.photoDataUrl,sharp);
      const result=await db.transaction(tx=>dispatch(tx,req,action,url,body,image));
      if(result.notify) {
        const notice=result.notify,task=notifications.dispatch({jobIds:notice.jobIds,limit:notice.jobIds.length});
        if(scheduleNotifications) {try{scheduleNotifications(task)}catch(error){onError(error);await task}} else await task;
        let notification={kind:notice.kind,status:'queued',deliveryMode:['simulated','provider'].includes(mail.deliveryMode)?mail.deliveryMode:'unknown'};
        try{notification=await readWildHubNotification(db,notice.requestId,notice.kind)||notification}catch(error){onError(error)}
        return json({...notice.payload,notification},notice.status);
      }
      if(!result.sendInvite)return result;
      const {id,token,address,draft}=result.sendInvite;
      const link=new URL(`/#invite/${token}`,origin).href;
      const rendered=renderInvitationEmail({...draft,origin,to:address,link});
      try {
        const sent=await mail.send({to:address,subject:rendered.subject,text:rendered.text,html:rendered.html,kind:'invite',token,url:link,idempotencyKey:`wh-invite-${id}`});
        if(sent?.accepted===false)throw Object.assign(Error('Mail was not accepted.'),{delivery:'not_accepted'});
      } catch(issue) {
        if(issue?.delivery==='not_accepted'||issue?.code==='mail_budget_exceeded') {
          await rows(db,'DELETE FROM wh_invites WHERE id=$1 AND ready=false',[id]);
          if(issue?.code==='mail_budget_exceeded')return error(429,'rate_limited','Email sending is temporarily limited. Please try again later.',{'retry-after':String(issue.retryAfter)});
          return error(503,'mail_unavailable','The email provider did not accept this invitation. You can retry the same preview.');
        }
        // SendGrid has no idempotency guarantee. Preserve a pending attempt on
        // an ambiguous result, so retrying cannot duplicate the email.
        return error(409,'invitation_uncertain','The email provider did not confirm this send. Do not send it again; check with your recipient first.');
      }
      await rows(db,'UPDATE wh_invites SET ready=true WHERE id=$1 AND revoked_at IS NULL',[id]);
      return json({sent:true,inviteId:id,delivery:{status:'accepted',mode:mail.deliveryMode||'unknown'}});
    } catch(e) {
      if(e.status&&e.code)return error(e.status,e.code,e.message,e.status===429?{'retry-after':'60'}:{});
      if(e.code==='23505')return error(409,'conflict','That item already exists. Refresh and try again.');
      onError(e);
      return error(503,'service_unavailable','BsideVibes is temporarily unavailable.');
    }
  }
  handle.dispatchNotifications=notifications.dispatch;
  return handle;
}
