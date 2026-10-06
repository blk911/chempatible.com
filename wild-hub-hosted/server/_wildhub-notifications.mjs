import {randomUUID} from 'node:crypto';

const rows=async(db,sql,params=[])=>{const result=await db.query(sql,params);return Array.isArray(result)?result:result.rows};
const iso=value=>new Date(value).toISOString();
const statusMap={pending:'queued',processing:'queued',retry:'retrying',accepted:'accepted',suppressed:'suppressed',uncertain:'uncertain',failed:'failed'};
const modeOf=mail=>['simulated','provider'].includes(mail.deliveryMode)?mail.deliveryMode:'unknown';
export const notificationView=job=>job?{kind:job.kind,status:statusMap[job.status],deliveryMode:job.delivery_mode}:null;

export async function readWildHubNotification(tx,requestId,kind) {
  const list=await rows(tx,`SELECT kind,status,delivery_mode FROM wh_notifications WHERE request_id=$1 AND ($2::text IS NULL OR kind=$2) ORDER BY CASE WHEN kind='approval' THEN 0 ELSE 1 END,created_at DESC,id DESC LIMIT 1`,[requestId,kind||null]);
  return notificationView(list[0]);
}

export async function readWildHubNotifications(tx,requestIds) {
  if(!requestIds.length)return new Map();
  const list=await rows(tx,`SELECT DISTINCT ON (request_id) request_id,kind,status,delivery_mode FROM wh_notifications WHERE request_id=ANY($1::uuid[]) ORDER BY request_id,CASE WHEN kind='approval' THEN 0 ELSE 1 END,created_at DESC,id DESC`,[requestIds]);
  return new Map(list.map(job=>[job.request_id,notificationView(job)]));
}

// Called only inside the same transaction as the request or first approval.
export async function queueWildHubNotification(tx,{kind,hubId,requestId,recipientId,membershipRevision=null,now,mail}) {
  const dedupeKey=kind==='request'?`request:${requestId}`:`approval:${requestId}:${membershipRevision}`;
  const id=randomUUID();
  const inserted=await rows(tx,`INSERT INTO wh_notifications(id,dedupe_key,kind,hub_id,request_id,recipient_id,membership_revision,delivery_mode,next_attempt_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$9) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id`,[id,dedupeKey,kind,hubId,requestId,recipientId,membershipRevision,modeOf(mail),iso(now)]);
  if(inserted[0])return inserted[0].id;
  return (await rows(tx,'SELECT id FROM wh_notifications WHERE dedupe_key=$1',[dedupeKey]))[0].id;
}

/** Trusted worker, never an unauthenticated resend endpoint.
 * Each logical message has one durable idempotency key. If the provider cannot
 * deduplicate, ambiguous delivery is parked for reconciliation, not resent.
 * No database transaction is held across provider I/O.
 */
export function createWildHubNotificationDispatcher({db,mail,origin,emailAllowed=()=>false,now=()=>Date.now(),onError=()=>{}}={}) {
  if(!db?.query||!db?.transaction||!mail?.send||typeof emailAllowed!=='function'||typeof now!=='function')throw Error('Explicit notification database, mail, recipient policy and clock are required.');
  const parsedOrigin=new URL(origin);
  if(parsedOrigin.origin!==origin||parsedOrigin.protocol!=='https:'&&!(parsedOrigin.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(parsedOrigin.hostname)))throw Error('Use an exact HTTPS or loopback notification origin.');
  const supportsIdempotency=mail.supportsIdempotency===true;
  async function claim(jobIds) {
    return db.transaction(async tx=>{
      const job=(await rows(tx,`SELECT * FROM wh_notifications WHERE ($1::uuid[] IS NULL OR id=ANY($1::uuid[])) AND ((status IN ('pending','retry') AND next_attempt_at<=$2) OR (status='processing' AND lease_until<=$2)) ORDER BY next_attempt_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`,[jobIds,iso(now())]))[0];
      if(!job)return null;
      if(job.status==='processing'&&!supportsIdempotency) {
        await rows(tx,"UPDATE wh_notifications SET status='uncertain',last_error_code='delivery_unknown',updated_at=$2 WHERE id=$1",[job.id,iso(now())]);
        return {terminal:'uncertain'};
      }
      if(job.attempts>=5) {
        const terminal=job.status==='processing'?'uncertain':'failed';
        await rows(tx,"UPDATE wh_notifications SET status=$2,last_error_code='attempt_limit',updated_at=$3 WHERE id=$1",[job.id,terminal,iso(now())]);
        return {terminal};
      }
      // Lock the circle consistently with membership lifecycle changes. User
      // reads need no key-changing locks and no private profile data is mailed.
      const hub=(await rows(tx,'SELECT * FROM wh_hubs WHERE id=$1 FOR UPDATE',[job.hub_id]))[0];
      const request=(await rows(tx,'SELECT * FROM wh_requests WHERE id=$1 AND hub_id=$2',[job.request_id,job.hub_id]))[0];
      const recipient=(await rows(tx,'SELECT id,email,standing,verified_at FROM wh_users WHERE id=$1',[job.recipient_id]))[0];
      const host=hub?(await rows(tx,'SELECT standing,verified_at FROM wh_users WHERE id=$1',[hub.owner_id]))[0]:null;
      let valid=Boolean(hub&&request&&recipient?.verified_at&&recipient.standing==='active'&&host?.verified_at&&host.standing==='active');
      let trial=null;
      if(valid&&job.kind==='request') {
        const applicant=(await rows(tx,'SELECT standing,verified_at FROM wh_users WHERE id=$1',[request.applicant_id]))[0];
        valid=request.status==='pending'&&recipient.id===hub.owner_id&&applicant?.standing==='active'&&Boolean(applicant?.verified_at);
      }
      if(valid&&job.kind==='approval') {
        const member=(await rows(tx,'SELECT status,access_revision FROM wh_memberships WHERE hub_id=$1 AND user_id=$2',[hub.id,recipient.id]))[0];
        valid=request.status==='approved'&&recipient.id===request.applicant_id&&member?.status==='active'&&member.access_revision===job.membership_revision;
        trial=(await rows(tx,'SELECT trial_started_at,trial_ends_at FROM wh_entitlements WHERE hub_id=$1 AND user_id=$2',[hub.id,recipient.id]))[0];
      }
      const recipientAllowed=valid&&emailAllowed(recipient.email)===true;
      if(!valid||!recipientAllowed) {
        await rows(tx,"UPDATE wh_notifications SET status='suppressed',last_error_code=$2,updated_at=$3 WHERE id=$1",[job.id,valid?'recipient_not_allowed':'state_changed',iso(now())]);
        return {terminal:'suppressed'};
      }
      const circleName=hub.name.replace(/[\r\n\0]/g,' ');
      const link=new URL(`/#${job.kind==='request'?'manage':'membership'}/${encodeURIComponent(hub.slug)}`,origin).href;
      const subject=job.kind==='request'?`New request for ${circleName} on BsideVibes`:`You’re approved for ${circleName} on BsideVibes`;
      const text=job.kind==='request'?`A new request to join ${circleName} on BsideVibes is waiting for your review. Sign in to review the introduction and approve or pass.\n\n${link}`:`Your request to join ${circleName} on BsideVibes was approved.\n\n${trial?`Your original seven-day trial began ${iso(trial.trial_started_at)} and ${new Date(trial.trial_ends_at).getTime()>now()?'ends':'ended'} ${iso(trial.trial_ends_at)}. Rejoining does not restart it.\n\n`:''}Sign in to view membership and optional support choices, then open your private creator feed. Membership access is always checked when you open it.\n\n${link}`;
      const leaseId=randomUUID(),attempts=job.attempts+1;
      await rows(tx,"UPDATE wh_notifications SET status='processing',attempts=$2,lease_id=$3,lease_until=$4,last_error_code=NULL,updated_at=$5 WHERE id=$1",[job.id,attempts,leaseId,iso(now()+30_000),iso(now())]);
      return {id:job.id,leaseId,attempts,message:{to:recipient.email,kind:job.kind,subject,text,url:link,notificationId:job.id,idempotencyKey:`wh-notification-${job.id}`}};
    });
  }
  async function deliver(job) {
    try {
      const accepted=await mail.send(job.message);
      if(accepted?.accepted===false)throw Object.assign(new Error('Mail was not accepted.'),{delivery:'not_accepted'});
    } catch(error) {
      if(error?.code==='mail_budget_exceeded'&&error.delivery==='not_accepted'&&Number.isInteger(error.retryAfter)&&error.retryAfter>=1&&error.retryAfter<=86400){
        // No provider attempt occurred. Keep the notification for the budget
        // reset without burning its bounded provider-retry allowance.
        await rows(db,"UPDATE wh_notifications SET status='retry',attempts=GREATEST(attempts-1,0),next_attempt_at=$3,last_error_code='mail_budget_limited',lease_until=NULL,updated_at=$4 WHERE id=$1 AND lease_id=$2 AND status IN ('processing','uncertain')",[job.id,job.leaseId,iso(now()+error.retryAfter*1000),iso(now())]);
        return 'retrying';
      }
      const knownRejected=error?.delivery==='not_accepted';
      const status=knownRejected?(job.attempts>=5?'failed':'retry'):'uncertain';
      await rows(db,`UPDATE wh_notifications SET status=$3,next_attempt_at=$4,last_error_code=$5,lease_until=NULL,updated_at=$6 WHERE id=$1 AND lease_id=$2 AND status IN ('processing','uncertain')`,[job.id,job.leaseId,status,iso(now()+Math.min(3_600_000,60_000*2**(job.attempts-1))),knownRejected?'provider_not_accepted':'delivery_unknown',iso(now())]);
      return status==='retry'?'retrying':status;
    }
    // A lost confirmation write leaves the processing lease intact. A provider
    // with a real idempotency guarantee may replay the same key after expiry;
    // otherwise a later worker marks this uncertain and never resends blindly.
    await rows(db,"UPDATE wh_notifications SET status='accepted',accepted_at=$3,last_error_code=NULL,lease_until=NULL,updated_at=$3 WHERE id=$1 AND lease_id=$2 AND status IN ('processing','uncertain')",[job.id,job.leaseId,iso(now())]);
    return 'accepted';
  }
  async function dispatch({jobIds=null,limit=10}={}) {
    if(!Number.isInteger(limit)||limit<1||limit>20||jobIds!==null&&(!Array.isArray(jobIds)||jobIds.length>20||jobIds.some(id=>typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))))throw Error('Invalid bounded notification dispatch.');
    const result={accepted:0,retrying:0,suppressed:0,uncertain:0,failed:0,errors:0};
    for(let i=0;i<limit;i++) {
      try {const job=await claim(jobIds);if(!job)break;const status=job.terminal||await deliver(job);result[status]++;}
      catch(error){onError(error);result.errors++;break;}
    }
    return result;
  }
  return Object.freeze({dispatch});
}
