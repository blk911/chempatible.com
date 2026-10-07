import {WILDCARD_CATEGORIES} from './_wildcard-questions.mjs';
import {connectionIdentityJoin,connectionIdentityFields} from './_connection-identity.mjs';
// This feed carries counterpart milestones, never private responses or media.
// All targets are hints for existing authorized controls, not action grants.
export const GAME_PIECE_AUTH=`SELECT m.id FROM members m WHERE m.session_hash=$1 AND m.email_verified_at IS NOT NULL AND m.blocked_at IS NULL AND (m.suspended_until IS NULL OR m.suspended_until<=now())`;
const level=(member,state)=>`greatest(coalesce(${state}.completed_level,0),CASE WHEN jsonb_array_length(${member}.answers)>=10 THEN 2 WHEN jsonb_array_length(${member}.answers)>=5 THEN 1 ELSE 0 END)`;
const ownLevel=level('viewer','vr'),otherLevel=level('author','ar');
// Match reward-directory's current media restriction across all prior pairs;
// an ended/frozen old pair is not bypassed by an otherwise live newer one.
const directoryPrivacy=`NOT EXISTS(SELECT 1 FROM invitations di LEFT JOIN connection_state dc ON dc.invitation_hash=di.token_hash
 WHERE ((di.sender_member_id=viewer.id AND (dc.prospect_member_id=author.id OR di.intended_member_id=author.id OR (dc.prospect_member_id IS NULL AND di.intended_member_id IS NULL AND lower(coalesce(di.intended_email,di.recipient_email))=lower(author.contact))))
 OR (di.sender_member_id=author.id AND (dc.prospect_member_id=viewer.id OR di.intended_member_id=viewer.id OR (dc.prospect_member_id IS NULL AND di.intended_member_id IS NULL AND lower(coalesce(di.intended_email,di.recipient_email))=lower(viewer.contact)))))
 AND (dc.status IN ('ended','declined') OR dc.ended_at IS NOT NULL OR EXISTS(SELECT 1 FROM connection_visibility dv WHERE dv.invitation_hash=di.token_hash AND (dv.frozen_at IS NOT NULL OR dv.trashed_at IS NOT NULL))))`;
const questionIds=WILDCARD_CATEGORIES.flatMap(category=>category.questions).map(question=>"'"+question.id+"'").join(',');
const chat=`c.status IN ('chat','secondResults','email','tests')`;
const GAME_PIECE_BOUND=`SELECT e.*,CASE WHEN e.actor_id=i.sender_member_id THEN coalesce(nullif(current_identity.sender_name,''),i.sender_name) ELSE coalesce(nullif(current_identity.prospect_name,''),c.prospect_name) END AS actor_name,
 c.status AS connection_status,${ownLevel} AS own_level,${otherLevel} AS other_level,
 EXISTS(SELECT 1 FROM reward_phone_offers own_offer WHERE own_offer.invitation_hash=e.invitation_hash AND own_offer.member_id=e.recipient_id) AS own_phone_offered,
 jsonb_array_length(CASE WHEN e.recipient_id=i.sender_member_id THEN i.sender_answers ELSE c.prospect_answers END)>=10 AS own_second_done
 FROM game_piece_events e JOIN (${GAME_PIECE_AUTH}) a ON a.id=e.recipient_id
 JOIN game_piece_pairs p ON p.invitation_hash=e.invitation_hash AND p.sender_member_id=e.sender_member_id AND p.prospect_member_id=e.prospect_member_id
 JOIN invitations i ON i.token_hash=e.invitation_hash AND i.sender_member_id=e.sender_member_id
 JOIN connection_state c ON c.invitation_hash=e.invitation_hash AND c.prospect_member_id=e.prospect_member_id
 JOIN members viewer ON viewer.id=e.recipient_id JOIN members author ON author.id=e.actor_id
 LEFT JOIN member_reward_state vr ON vr.member_id=viewer.id LEFT JOIN member_reward_state ar ON ar.member_id=author.id
 LEFT JOIN reward_directory_profile d ON d.member_id=author.id
 ${connectionIdentityJoin({viewer:'e.recipient_id',session:'$1'})}
 WHERE p.connection_kind=CASE WHEN i.channel='friend' THEN 'friend' ELSE 'vibe' END
 AND (i.channel<>'friend' OR (c.status='chat' AND c.claim_hash IS NULL AND e.kind IN('wildcard-ask','wildcard-answer'))) AND c.ended_at IS NULL AND c.status NOT IN('ended','declined')
 AND NOT (i.channel='qr' AND c.claim_hash IS NULL AND coalesce(i.expires_at<=now(),true))
 AND e.actor_id<>e.recipient_id AND e.actor_id IN(i.sender_member_id,c.prospect_member_id) AND e.recipient_id IN(i.sender_member_id,c.prospect_member_id)
 AND (i.intended_member_id IS NULL OR i.intended_member_id=c.prospect_member_id)
 AND (i.intended_member_id IS NOT NULL OR i.intended_email IS NULL OR EXISTS(SELECT 1 FROM members target WHERE target.id=c.prospect_member_id AND lower(target.contact)=lower(i.intended_email)))
 AND author.email_verified_at IS NOT NULL AND author.blocked_at IS NULL AND (author.suspended_until IS NULL OR author.suspended_until<=now())
 AND NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_id=e.sender_member_id AND b.blocked_id=e.prospect_member_id) OR (b.blocked_id=e.sender_member_id AND b.blocker_id=e.prospect_member_id))
 AND NOT EXISTS(SELECT 1 FROM connection_visibility v WHERE v.invitation_hash=e.invitation_hash AND (v.frozen_at IS NOT NULL OR v.trashed_at IS NOT NULL))
`;
export const GAME_PIECE_ELIGIBLE=`${GAME_PIECE_BOUND}
 AND (e.obligation IS NULL OR (e.obligation='first-choice' AND c.status IN('invited','firstResults')) OR (e.obligation='second-five' AND jsonb_array_length(CASE WHEN e.recipient_id=i.sender_member_id THEN i.sender_answers ELSE c.prospect_answers END)<10))
 AND NOT EXISTS(SELECT 1 FROM game_piece_events newer WHERE newer.invitation_hash=e.invitation_hash AND newer.actor_id=e.actor_id AND newer.recipient_id=e.recipient_id AND newer.kind=e.kind AND newer.source_key=e.source_key AND newer.id>e.id)
 AND CASE e.kind
 WHEN 'step-complete' THEN CASE e.level
  WHEN 1 THEN jsonb_array_length(CASE WHEN e.actor_id=i.sender_member_id THEN i.sender_answers ELSE c.prospect_answers END)>=5 AND c.status<>'invited'
  WHEN 2 THEN (${otherLevel}>=2 OR jsonb_array_length(CASE WHEN e.actor_id=i.sender_member_id THEN i.sender_answers ELSE c.prospect_answers END)>=10)
  ELSE ${otherLevel}>=e.level END
 WHEN 'continue-request' THEN c.status='request' AND e.actor_id=c.prospect_member_id
 WHEN 'continue-ready' THEN c.status='secondFive' AND e.actor_id=i.sender_member_id AND jsonb_array_length(c.prospect_answers)<10
 WHEN 'chat-request' THEN c.status='chatRequested' AND e.actor_id=c.prospect_member_id AND jsonb_array_length(i.sender_answers)>=10 AND jsonb_array_length(c.prospect_answers)>=10
 WHEN 'chat-ready' THEN ${chat} AND e.actor_id=i.sender_member_id
 WHEN 'phone-offer' THEN ${chat} AND ${ownLevel}>=2 AND ${otherLevel}>=2 AND EXISTS(SELECT 1 FROM reward_phone_offers o WHERE o.invitation_hash=e.invitation_hash AND o.member_id=e.actor_id)
 WHEN 'directory-listed' THEN ${ownLevel}>=4 AND ${otherLevel}>=4 AND d.listed AND ${directoryPrivacy}
 WHEN 'intro-published' THEN ${ownLevel}>=4 AND ${otherLevel}>=5 AND d.listed AND d.video_published AND d.video IS NOT NULL AND ${directoryPrivacy}
 WHEN 'wildcard-ask' THEN e.source_key IN (${questionIds}) AND ${chat} AND EXISTS(SELECT 1 FROM connection_wildcard_answers wa JOIN connection_wildcard_asks w USING(invitation_hash,question_id) WHERE wa.invitation_hash=e.invitation_hash AND wa.question_id=e.source_key AND wa.sender_member_id=e.sender_member_id AND wa.prospect_member_id=e.prospect_member_id AND w.member_id=e.actor_id AND wa.member_id=e.recipient_id AND wa.answered_at IS NULL AND w.message->>'by'=CASE WHEN w.member_id=e.sender_member_id THEN 'member' ELSE 'prospect' END)
 WHEN 'wildcard-answer' THEN e.source_key IN (${questionIds}) AND ${chat} AND EXISTS(SELECT 1 FROM connection_wildcard_answers wa JOIN connection_wildcard_asks w USING(invitation_hash,question_id) WHERE wa.invitation_hash=e.invitation_hash AND wa.question_id=e.source_key AND wa.sender_member_id=e.sender_member_id AND wa.prospect_member_id=e.prospect_member_id AND w.member_id=e.recipient_id AND wa.member_id=e.actor_id AND wa.answered_at IS NOT NULL AND wa.message IS NOT NULL AND w.message->>'by'=CASE WHEN w.member_id=e.sender_member_id THEN 'member' ELSE 'prospect' END)
 ELSE false END
 AND (e.kind NOT IN('wildcard-ask','wildcard-answer') OR NOT EXISTS(SELECT 1 FROM connection_wildcard_answers changed WHERE changed.invitation_hash=e.invitation_hash AND (changed.sender_member_id<>e.sender_member_id OR changed.prospect_member_id<>e.prospect_member_id)))`;

// One bounded source row under the SAME eligible actor/pair/source snapshot.
// The established connection serializer applies first/next-five, contact and
// chat visibility; this selection is never returned as raw JSON.
export const gamePieceConnectionQuery=(refresh=false)=>`WITH eligible AS (${refresh?GAME_PIECE_BOUND+' AND e.observed_at IS NOT NULL':GAME_PIECE_ELIGIBLE})
 SELECT to_jsonb(e)||jsonb_build_object('id',e.id::text) AS hydrated_piece,
 i.token_hash AS id,i.token_hash,i.created_at,i.expires_at,i.sender_member_id,i.recipient_name,i.recipient_email,i.channel,i.intended_member_id,i.intended_email,i.reinvite_from,i.delivery_status,
 c.claim_hash,c.prospect_member_id,c.status,c.ended_at,c.ended_by,
 ${connectionIdentityFields()},i.sender_answers,c.prospect_answers,c.prospect_phone,c.prospect_email,c.messages,(c.claim_hash IS NOT NULL) AS claimed,
 v.frozen_at,v.action,v.action_at,v.trashed_at,v.restored_at,
 false AS blocked_by_me,false AS pair_blocked,NULL::timestamptz AS blocked_at,
 EXISTS(SELECT 1 FROM activity activity_row WHERE activity_row.connection_id=i.token_hash AND ((i.channel='email' AND activity_row.kind='invite_emailed') OR (i.channel='friend' AND activity_row.kind='friend_invited'))) AS invitation_sent
 FROM eligible e JOIN invitations i ON i.token_hash=e.invitation_hash JOIN connection_state c ON c.invitation_hash=e.invitation_hash
 LEFT JOIN connection_visibility v ON v.invitation_hash=e.invitation_hash AND v.member_id=e.recipient_id
 ${connectionIdentityJoin({viewer:'e.recipient_id',session:'$1'})}
 WHERE e.id=$2::bigint AND e.invitation_hash=$3`;

export function gamePiece(row,visit){
 const id=String(row.id),connectionId=row.invitation_hash;
 let status='ready',target={type:'connection',connectionId};
 if(row.kind==='step-complete'){
  target.level=row.level;
  if(row.level===1&&row.connection_status==='firstResults')status=row.recipient_id===row.prospect_member_id?'your-turn':'waiting';
  if(row.level===2&&row.connection_status==='secondFive')status=row.own_second_done?'waiting':'your-turn';
 }else if(['continue-request','continue-ready','chat-request'].includes(row.kind))status='your-turn';
 else if(row.kind==='phone-offer'){status=row.own_phone_offered?'answered':'your-turn';target.type='phone'}
 else if(row.kind==='directory-listed'){target.type='directory';target.memberId=row.actor_id}
 else if(row.kind==='intro-published'){target.type='intro';target.memberId=row.actor_id}
 else if(row.kind==='wildcard-ask'||row.kind==='wildcard-answer'){target.type='wildcard';target.questionId=row.source_key;status=row.kind==='wildcard-ask'?'your-turn':'answered'}
 return {id,version:row.version,receiptRevision:row.receipt_revision,kind:row.kind,connectionId,actorId:row.actor_id,actorName:String(row.actor_name||'Your connection').slice(0,50),
  ...(row.level?{level:row.level}:{}),...(target.questionId?{questionId:target.questionId}:{}),status,target,
  observedAt:row.observed_at??null,held:row.held_visit===visit,
  shouldPrompt:row.held_visit!==visit&&(!row.observed_at||row.held_visit!==null)};
}
