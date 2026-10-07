-- Extend accepted-friend connections to wildcard cards only. Apply after
-- 20261006_game_pieces.sql and before enabling friend wildcard controls.
-- Existing pair snapshots, asks, answers, receipts and quotas remain unchanged.
-- No past events are replayed. Other friend milestones, media and phone offers
-- stay excluded by game_piece_emit and game_piece_member_event.
-- Roll back application code first; the previous capture/emit definitions may
-- then be restored from 20261006_game_pieces.sql without deleting stored data.

-- Existing snapshots were captured exclusively for Vibe pairs. Preserve that
-- provenance if a mutable invitation is later changed to another channel.
ALTER TABLE game_piece_pairs ADD COLUMN IF NOT EXISTS connection_kind text NOT NULL DEFAULT 'vibe' CHECK(connection_kind IN('vibe','friend'));

-- Record the canonical accepted friend IDs at rollout, never a pending link or
-- a spent duplicate whose claim_hash contains another connection's ID.
INSERT INTO game_piece_pairs(invitation_hash,sender_member_id,prospect_member_id,connection_kind)
 SELECT i.token_hash,i.sender_member_id,c.prospect_member_id,'friend'
 FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash
 JOIN members sender ON sender.id=i.sender_member_id JOIN members prospect ON prospect.id=c.prospect_member_id
 WHERE i.channel='friend' AND c.status='chat' AND c.claim_hash IS NULL AND c.ended_at IS NULL
 AND i.token_hash ~ '^[a-f0-9]{64}$' AND i.sender_member_id<>c.prospect_member_id
 AND (i.intended_member_id IS NULL OR i.intended_member_id=c.prospect_member_id)
 AND (i.intended_member_id IS NOT NULL OR i.intended_email IS NULL OR lower(prospect.contact)=lower(i.intended_email))
 ON CONFLICT(invitation_hash) DO NOTHING;

CREATE OR REPLACE FUNCTION game_piece_capture(pair_id text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE pair record;
BEGIN
 SELECT i.sender_member_id,c.prospect_member_id,CASE WHEN i.channel='friend' THEN 'friend' ELSE 'vibe' END AS connection_kind INTO pair FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash
 WHERE i.token_hash=pair_id AND i.token_hash ~ '^[a-f0-9]{64}$' AND (i.channel<>'friend' OR (c.status='chat' AND c.claim_hash IS NULL AND c.ended_at IS NULL)) AND i.sender_member_id IS NOT NULL AND c.prospect_member_id IS NOT NULL AND i.sender_member_id<>c.prospect_member_id
 AND (SELECT count(*) FROM members m WHERE m.id IN(i.sender_member_id,c.prospect_member_id))=2;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Unchanged captures do not UPDATE the snapshot or acquire its row lock.
 IF NOT EXISTS(SELECT 1 FROM game_piece_pairs WHERE invitation_hash=pair_id) THEN
  INSERT INTO game_piece_pairs(invitation_hash,sender_member_id,prospect_member_id,connection_kind) VALUES(pair_id,pair.sender_member_id,pair.prospect_member_id,pair.connection_kind) ON CONFLICT DO NOTHING;
 END IF;
 RETURN EXISTS(SELECT 1 FROM game_piece_pairs p WHERE p.invitation_hash=pair_id AND p.sender_member_id=pair.sender_member_id AND p.prospect_member_id=pair.prospect_member_id AND p.connection_kind=pair.connection_kind);
END $$;

CREATE OR REPLACE FUNCTION game_piece_emit(pair_id text,author uuid,event_kind text,event_source text,event_level smallint DEFAULT NULL,emit_once boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF NOT game_piece_capture(pair_id) THEN RETURN; END IF;
 INSERT INTO game_piece_events(invitation_hash,sender_member_id,prospect_member_id,actor_id,recipient_id,kind,source_key,level,once_key,obligation)
 SELECT p.invitation_hash,p.sender_member_id,p.prospect_member_id,author,CASE WHEN author=p.sender_member_id THEN p.prospect_member_id ELSE p.sender_member_id END,event_kind,event_source,event_level,CASE WHEN emit_once THEN event_kind||':'||event_source END,
 CASE WHEN event_kind='step-complete' AND event_level=1 AND author=p.sender_member_id AND c.status IN('invited','firstResults') THEN 'first-choice'
 WHEN event_kind='step-complete' AND event_level=2 AND c.status IN('invited','firstResults','request','secondFive') AND jsonb_array_length(CASE WHEN author=p.sender_member_id THEN c.prospect_answers ELSE i.sender_answers END)<10 THEN 'second-five' END
 FROM game_piece_pairs p JOIN invitations i ON i.token_hash=p.invitation_hash JOIN connection_state c ON c.invitation_hash=p.invitation_hash
 WHERE p.invitation_hash=pair_id AND author IN(p.sender_member_id,p.prospect_member_id)
 AND i.sender_member_id=p.sender_member_id AND c.prospect_member_id=p.prospect_member_id AND (i.channel<>'friend' OR (c.status='chat' AND c.claim_hash IS NULL AND event_kind IN('wildcard-ask','wildcard-answer')))
 AND c.ended_at IS NULL AND c.status NOT IN('ended','declined')
 AND (i.intended_member_id IS NULL OR i.intended_member_id=p.prospect_member_id)
 AND (i.intended_member_id IS NOT NULL OR i.intended_email IS NULL OR EXISTS(SELECT 1 FROM members m WHERE m.id=p.prospect_member_id AND lower(m.contact)=lower(i.intended_email)))
 -- Initial QR binding may precede verification. Keep the ID-only event, but
 -- the feed requires both members to be verified before exposing it.
 AND (SELECT count(*) FROM members m WHERE m.id IN(p.sender_member_id,p.prospect_member_id) AND m.blocked_at IS NULL AND (m.suspended_until IS NULL OR m.suspended_until<=now()))=2
 AND NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_id=p.sender_member_id AND b.blocked_id=p.prospect_member_id) OR (b.blocked_id=p.sender_member_id AND b.blocker_id=p.prospect_member_id))
 AND NOT EXISTS(SELECT 1 FROM connection_visibility v WHERE v.invitation_hash=pair_id AND (v.frozen_at IS NOT NULL OR v.trashed_at IS NOT NULL))
 ON CONFLICT(invitation_hash,actor_id,recipient_id,once_key) DO NOTHING;
END $$;
