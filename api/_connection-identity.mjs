// Current profile identity is a projection for an already accepted connection.
// Invitation, message and history snapshots are never rewritten. Every query
// that reads the current profiles must also prove the viewer's live session and
// the exact bound pair; an email address or intended member is never authority.
export const connectionIdentityJoin=({viewer,session,alias='current_identity'})=>`LEFT JOIN LATERAL (
 SELECT sender.name AS sender_name,sender.photo AS sender_photo,
 prospect.name AS prospect_name,prospect.photo AS prospect_photo
 FROM members sender JOIN members prospect ON prospect.id=c.prospect_member_id
 JOIN members identity_viewer ON identity_viewer.id=${viewer}::uuid
 AND identity_viewer.session_hash=${session} AND identity_viewer.id IN(sender.id,prospect.id)
 WHERE sender.id=i.sender_member_id AND sender.id<>prospect.id
 AND sender.email_verified_at IS NOT NULL AND prospect.email_verified_at IS NOT NULL
 AND sender.blocked_at IS NULL AND prospect.blocked_at IS NULL
 AND (sender.suspended_until IS NULL OR sender.suspended_until<=now())
 AND (prospect.suspended_until IS NULL OR prospect.suspended_until<=now())
 AND c.ended_at IS NULL
 AND ((i.channel<>'friend' AND c.status IN('firstResults','request','secondFive','nextResults','chatRequested','chat','secondResults','email','tests'))
 OR (i.channel='friend' AND c.status='chat' AND c.claim_hash IS NULL
 AND EXISTS(SELECT 1 FROM game_piece_pairs identity_pair WHERE identity_pair.invitation_hash=i.token_hash
 AND identity_pair.sender_member_id=sender.id AND identity_pair.prospect_member_id=prospect.id AND identity_pair.connection_kind='friend')))
 AND NOT (i.channel='qr' AND c.claim_hash IS NULL AND coalesce(i.expires_at<=now(),true))
 AND (i.intended_member_id IS NULL OR i.intended_member_id=prospect.id)
 AND (i.intended_member_id IS NOT NULL OR i.intended_email IS NULL OR lower(prospect.contact)=lower(i.intended_email))
 AND NOT EXISTS(SELECT 1 FROM game_piece_pairs identity_pair WHERE identity_pair.invitation_hash=i.token_hash
 AND (identity_pair.sender_member_id<>sender.id OR identity_pair.prospect_member_id<>prospect.id
 OR identity_pair.connection_kind<>CASE WHEN i.channel='friend' THEN 'friend' ELSE 'vibe' END))
 AND NOT EXISTS(SELECT 1 FROM member_blocks identity_block WHERE (identity_block.blocker_id=sender.id AND identity_block.blocked_id=prospect.id)
 OR (identity_block.blocker_id=prospect.id AND identity_block.blocked_id=sender.id))
 AND NOT EXISTS(SELECT 1 FROM connection_visibility identity_visibility WHERE identity_visibility.invitation_hash=i.token_hash
 AND (identity_visibility.frozen_at IS NOT NULL OR identity_visibility.trashed_at IS NOT NULL))
) ${alias} ON true`;

// Explicit, narrow fields keep the existing serializers and reveal gates intact.
export const connectionIdentityFields=(alias='current_identity')=>`coalesce(nullif(${alias}.sender_name,''),i.sender_name) AS sender_name,
 coalesce(nullif(${alias}.sender_photo,''),i.sender_photo) AS sender_photo,
 coalesce(nullif(${alias}.prospect_name,''),c.prospect_name) AS prospect_name,
 coalesce(nullif(${alias}.prospect_photo,''),c.prospect_photo) AS prospect_photo`;

const validMember=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
export async function currentConnectionIdentities(sql,rows,{member,session}){
 if(!validMember(member)||typeof session!=='string'||!/^[a-f0-9]{64}$/.test(session))return rows;
 const bound=rows.filter(row=>validMember(row.sender_member_id)&&validMember(row.prospect_member_id)
 && [row.sender_member_id,row.prospect_member_id].includes(member)
 && !['invited','ended','declined'].includes(row.status));
 if(!bound.length)return rows;
 const expected=bound.map(row=>({id:row.token_hash,sender:row.sender_member_id,prospect:row.prospect_member_id}));
 const identities=await sql.query(`SELECT i.token_hash,${connectionIdentityFields()}
 FROM jsonb_to_recordset($1::jsonb) AS expected(id text,sender uuid,prospect uuid)
 JOIN invitations i ON i.token_hash=expected.id AND i.sender_member_id=expected.sender
 JOIN connection_state c ON c.invitation_hash=i.token_hash AND c.prospect_member_id=expected.prospect
 ${connectionIdentityJoin({viewer:'$3',session:'$2'})}`,[JSON.stringify(expected),session,member]);
 const byId=new Map(identities.map(row=>[row.token_hash,row]));
 return rows.map(row=>byId.has(row.token_hash)?{...row,...byId.get(row.token_hash)}:row);
}
