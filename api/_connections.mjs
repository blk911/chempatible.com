// The Freezer migration is intentionally not run by request handlers.
// Participant locks serialize block, acceptance, gameplay, and mail delivery.
export async function pairBlocked(sql,first,second){
 if(!first||!second||first===second)return false;
 const rows=await sql`SELECT 1 FROM member_blocks WHERE (blocker_id=${first} AND blocked_id=${second}) OR (blocker_id=${second} AND blocked_id=${first}) LIMIT 1`;
 return rows.length>0;
}
export async function lockedWrite(sql,id,actor,build){
 const results=await sql.transaction(tx=>[
  tx`SELECT id FROM members WHERE id=${actor} OR id IN (SELECT i.sender_member_id FROM invitations i WHERE i.token_hash=${id} UNION SELECT c.prospect_member_id FROM connection_state c WHERE c.invitation_hash=${id}) ORDER BY id FOR UPDATE`,
  build((strings,...values)=>{
   // These server-owned statements are UPDATEs ending in RETURNING. Add the
   // authorization predicate to the final UPDATE's WHERE, retaining parameters.
   const parts=[...strings],last=parts.length-1,at=parts[last].lastIndexOf(' RETURNING ');
   if(at<0)throw Error('Protected connection update must end in RETURNING');
   const returning=parts[last].slice(at);
   parts[last]=parts[last].slice(0,at)+` AND NOT EXISTS (SELECT 1 FROM invitations pair_i JOIN connection_state pair_c ON pair_c.invitation_hash=pair_i.token_hash JOIN member_blocks pair_b ON ((pair_b.blocker_id=pair_i.sender_member_id AND pair_b.blocked_id=coalesce(pair_c.prospect_member_id,`;
   parts.push(`::uuid)) OR (pair_b.blocked_id=pair_i.sender_member_id AND pair_b.blocker_id=coalesce(pair_c.prospect_member_id,`);
   parts.push(`::uuid))) WHERE pair_i.token_hash=`);
   parts.push(`) AND NOT EXISTS (SELECT 1 FROM invitations target_i WHERE target_i.token_hash=`);
   parts.push(` AND target_i.sender_member_id IS DISTINCT FROM `);
   parts.push(`::uuid AND ((target_i.intended_member_id IS NOT NULL AND target_i.intended_member_id IS DISTINCT FROM `);
   parts.push(`::uuid) OR (target_i.intended_member_id IS NULL AND target_i.intended_email IS NOT NULL AND NOT EXISTS (SELECT 1 FROM members target_m WHERE target_m.id=`);
   parts.push(`::uuid AND lower(target_m.contact)=target_i.intended_email AND target_m.email_verified_at IS NOT NULL)))) AND EXISTS (SELECT 1 FROM invitations live_i JOIN connection_state live_c ON live_c.invitation_hash=live_i.token_hash WHERE live_i.token_hash=`);
   parts.push(` AND live_c.status NOT IN ('ended','declined') AND ((live_i.reinvite_from IS NULL AND live_i.intended_member_id IS NULL AND live_i.intended_email IS NULL) OR live_c.prospect_member_id IS NOT NULL OR live_i.expires_at>now()))${returning}`);
   Object.defineProperty(parts,'raw',{value:[...parts]});
   return tx(parts,...values,actor,actor,id,id,actor,actor,actor,id);
  })
 ],{isolationLevel:'ReadCommitted'});
 return results[1];
}

// Committing a guarded reservation is the send-start boundary. A block that
// commits first prevents new reservations. Already-started/provider-accepted
// mail cannot be recalled; callers recheck immediately before the provider call.
export async function reserveInvitation(sql,memberId,email,build){
 const results=await sql.transaction(tx=>[
  tx`SELECT id FROM members WHERE id=${memberId} OR lower(contact)=${email} ORDER BY id FOR UPDATE`,
  build(tx)
 ],{isolationLevel:'ReadCommitted'});
 return results[1];
}
export async function deliveryBlocked(sql,memberId,email){
 const rows=await sql`SELECT 1 FROM member_blocks b JOIN members recipient ON recipient.id=CASE WHEN b.blocker_id=${memberId} THEN b.blocked_id ELSE b.blocker_id END WHERE (b.blocker_id=${memberId} OR b.blocked_id=${memberId}) AND lower(recipient.contact)=${email} LIMIT 1`;
 return rows.length>0;
}

// Reinvites may only be opened by the server-selected member or by a verified
// account matching the sender's originally supplied/shared delivery address.
export async function targetAllowed(sql,row,member){
 if(!row.intended_member_id&&!row.intended_email)return true;
 if(!member)return false;
 if(row.intended_member_id)return row.intended_member_id===member;
 const rows=await sql`SELECT id FROM members WHERE id=${member} AND lower(contact)=${row.intended_email} AND email_verified_at IS NOT NULL`;
 return rows.length>0;
}
