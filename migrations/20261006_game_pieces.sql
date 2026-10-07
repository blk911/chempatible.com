-- Future-only, atomic counterpart game pieces. Apply after the reward, lifecycle,
-- phone and wildcard-answer migrations, before deploying /api/game-pieces.
-- Only existing bound pair IDs are snapshotted at rollout. No historical events,
-- receipts or prompts are inserted, and request handlers never run DDL.
-- These ID-only snapshots deliberately have NO member/source foreign keys:
-- reciprocal actor-only profile writes must not acquire the other member's FK
-- key-share lock after holding their own member lock. Triggers never lock members
-- or connections. Reads always join current source rows and reauthorize access.
-- Keep these tables on code rollback; never reset receipt/handling history.
CREATE TABLE IF NOT EXISTS game_piece_pairs (
 invitation_hash text PRIMARY KEY,
 sender_member_id uuid NOT NULL,
 prospect_member_id uuid NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT now(),
 CHECK(sender_member_id<>prospect_member_id)
);
CREATE TABLE IF NOT EXISTS game_piece_events (
 id bigserial PRIMARY KEY,
 version integer NOT NULL DEFAULT 1 CHECK(version=1),
 receipt_revision integer NOT NULL DEFAULT 0 CHECK(receipt_revision>=0),
 invitation_hash text NOT NULL,
 sender_member_id uuid NOT NULL,
 prospect_member_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 recipient_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('step-complete','continue-request','continue-ready','chat-request','chat-ready','phone-offer','directory-listed','intro-published','wildcard-ask','wildcard-answer')),
 source_key text NOT NULL,
 once_key text,
 level smallint CHECK(level BETWEEN 1 AND 5),
 obligation text CHECK(obligation IS NULL OR obligation IN('first-choice','second-five')),
 created_at timestamptz NOT NULL DEFAULT now(),
 observed_at timestamptz,
 handled_at timestamptz,
 held_visit text CHECK(held_visit IS NULL OR held_visit ~ '^[A-Za-z0-9_-]{8,128}$'),
 CHECK(sender_member_id<>prospect_member_id),
 CHECK(actor_id IN(sender_member_id,prospect_member_id)),
 CHECK(recipient_id IN(sender_member_id,prospect_member_id) AND recipient_id<>actor_id),
 UNIQUE(invitation_hash,actor_id,recipient_id,once_key)
);
-- Safe when reapplying a prepared migration to an isolated test branch.
ALTER TABLE game_piece_events ADD COLUMN IF NOT EXISTS obligation text CHECK(obligation IS NULL OR obligation IN('first-choice','second-five'));
CREATE INDEX IF NOT EXISTS game_piece_events_recipient_idx ON game_piece_events(recipient_id,id) WHERE handled_at IS NULL;
CREATE INDEX IF NOT EXISTS game_piece_events_source_idx ON game_piece_events(invitation_hash,actor_id,recipient_id,kind,source_key,id);

-- Identity-only rollout baseline. This does not infer a recipient from an
-- address, create a milestone, or change any existing application data.
INSERT INTO game_piece_pairs(invitation_hash,sender_member_id,prospect_member_id)
 SELECT i.token_hash,i.sender_member_id,c.prospect_member_id
 FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash
 JOIN members sender ON sender.id=i.sender_member_id JOIN members prospect ON prospect.id=c.prospect_member_id
 WHERE i.channel<>'friend' AND i.token_hash ~ '^[a-f0-9]{64}$' AND i.sender_member_id<>c.prospect_member_id
 ON CONFLICT(invitation_hash) DO NOTHING;

CREATE OR REPLACE FUNCTION game_piece_capture(pair_id text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE pair record;
BEGIN
 SELECT i.sender_member_id,c.prospect_member_id INTO pair FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash
 WHERE i.token_hash=pair_id AND i.token_hash ~ '^[a-f0-9]{64}$' AND i.channel<>'friend' AND i.sender_member_id IS NOT NULL AND c.prospect_member_id IS NOT NULL AND i.sender_member_id<>c.prospect_member_id
 AND (SELECT count(*) FROM members m WHERE m.id IN(i.sender_member_id,c.prospect_member_id))=2;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Unchanged captures do not UPDATE the snapshot or acquire its row lock.
 IF NOT EXISTS(SELECT 1 FROM game_piece_pairs WHERE invitation_hash=pair_id) THEN
  INSERT INTO game_piece_pairs(invitation_hash,sender_member_id,prospect_member_id) VALUES(pair_id,pair.sender_member_id,pair.prospect_member_id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN EXISTS(SELECT 1 FROM game_piece_pairs p WHERE p.invitation_hash=pair_id AND p.sender_member_id=pair.sender_member_id AND p.prospect_member_id=pair.prospect_member_id);
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
 AND i.sender_member_id=p.sender_member_id AND c.prospect_member_id=p.prospect_member_id AND i.channel<>'friend'
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

CREATE OR REPLACE FUNCTION game_piece_member_event(author uuid,event_kind text,event_source text,event_level smallint DEFAULT NULL,emit_once boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $$
DECLARE pair record;
BEGIN
 -- Consistent connection order also bounds concurrent first snapshot inserts.
 FOR pair IN SELECT i.token_hash FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE author IN(i.sender_member_id,c.prospect_member_id) AND i.channel<>'friend' ORDER BY i.token_hash LOOP
  PERFORM game_piece_emit(pair.token_hash,author,event_kind,event_source,event_level,emit_once);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION game_piece_connection_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sender uuid; sender_count integer; old_count integer:=0;
BEGIN
 IF TG_OP='DELETE' THEN
  DELETE FROM game_piece_events WHERE invitation_hash=OLD.invitation_hash;
  DELETE FROM game_piece_pairs WHERE invitation_hash=OLD.invitation_hash;
  RETURN OLD;
 END IF;
 IF NOT game_piece_capture(NEW.invitation_hash) THEN RETURN NEW; END IF;
 SELECT i.sender_member_id,jsonb_array_length(i.sender_answers) INTO sender,sender_count FROM invitations i WHERE i.token_hash=NEW.invitation_hash;
 IF TG_OP='UPDATE' THEN old_count:=jsonb_array_length(OLD.prospect_answers); END IF;
 -- First-five delivery occurs only once an actual two-member connection binds.
 -- A later unrelated update on an old row never retroactively creates it.
 IF (TG_OP='INSERT' OR (OLD.prospect_member_id IS NULL AND NEW.prospect_member_id IS NOT NULL) OR (old_count<5 AND jsonb_array_length(NEW.prospect_answers)>=5)) AND jsonb_array_length(NEW.prospect_answers)>=5 AND sender_count>=5 THEN
  PERFORM game_piece_emit(NEW.invitation_hash,NEW.prospect_member_id,'step-complete','step-1',1::smallint,true);
  PERFORM game_piece_emit(NEW.invitation_hash,sender,'step-complete','step-1',1::smallint,true);
 END IF;
 IF TG_OP='UPDATE' AND old_count<10 AND jsonb_array_length(NEW.prospect_answers)>=10 THEN
  PERFORM game_piece_emit(NEW.invitation_hash,NEW.prospect_member_id,'step-complete','step-2',2::smallint,true);
 END IF;
 IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
  IF NEW.status='request' THEN PERFORM game_piece_emit(NEW.invitation_hash,NEW.prospect_member_id,'continue-request','continue');
  ELSIF OLD.status='request' AND NEW.status='secondFive' THEN PERFORM game_piece_emit(NEW.invitation_hash,sender,'continue-ready','continue');
  ELSIF NEW.status='chatRequested' THEN PERFORM game_piece_emit(NEW.invitation_hash,NEW.prospect_member_id,'chat-request','chat');
  ELSIF OLD.status='chatRequested' AND NEW.status='chat' THEN PERFORM game_piece_emit(NEW.invitation_hash,sender,'chat-ready','chat');
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS game_piece_connection_trigger ON connection_state;
CREATE TRIGGER game_piece_connection_trigger AFTER INSERT OR UPDATE OR DELETE ON connection_state FOR EACH ROW EXECUTE FUNCTION game_piece_connection_transition();

CREATE OR REPLACE FUNCTION game_piece_invitation_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  DELETE FROM game_piece_events WHERE invitation_hash=OLD.token_hash;
  DELETE FROM game_piece_pairs WHERE invitation_hash=OLD.token_hash;
  RETURN OLD;
 END IF;
 IF jsonb_array_length(OLD.sender_answers)<10 AND jsonb_array_length(NEW.sender_answers)>=10 THEN
  PERFORM game_piece_emit(NEW.token_hash,NEW.sender_member_id,'step-complete','step-2',2::smallint,true);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS game_piece_invitation_trigger ON invitations;
CREATE TRIGGER game_piece_invitation_trigger AFTER UPDATE OR DELETE ON invitations FOR EACH ROW EXECUTE FUNCTION game_piece_invitation_transition();

CREATE OR REPLACE FUNCTION game_piece_progress_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_level integer:=0; new_level integer; author uuid;
BEGIN
 IF TG_TABLE_NAME='members' THEN
  old_level:=CASE WHEN jsonb_array_length(OLD.answers)>=10 THEN 2 WHEN jsonb_array_length(OLD.answers)>=5 THEN 1 ELSE 0 END;
  new_level:=CASE WHEN jsonb_array_length(NEW.answers)>=10 THEN 2 WHEN jsonb_array_length(NEW.answers)>=5 THEN 1 ELSE 0 END;author:=NEW.id;
 ELSE
  author:=NEW.member_id;
  SELECT CASE WHEN jsonb_array_length(m.answers)>=10 THEN 2 WHEN jsonb_array_length(m.answers)>=5 THEN 1 ELSE 0 END INTO old_level FROM members m WHERE m.id=author;
  IF TG_OP='UPDATE' THEN old_level:=greatest(old_level,OLD.completed_level); END IF;
  new_level:=NEW.completed_level;
 END IF;
 IF new_level>old_level THEN
  PERFORM game_piece_member_event(author,'step-complete','step-'||new_level,new_level::smallint,true);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS game_piece_member_progress_trigger ON members;
CREATE TRIGGER game_piece_member_progress_trigger AFTER UPDATE OF answers ON members FOR EACH ROW EXECUTE FUNCTION game_piece_progress_transition();
DROP TRIGGER IF EXISTS game_piece_reward_progress_trigger ON member_reward_state;
CREATE TRIGGER game_piece_reward_progress_trigger AFTER INSERT OR UPDATE OF completed_level ON member_reward_state FOR EACH ROW EXECUTE FUNCTION game_piece_progress_transition();

CREATE OR REPLACE FUNCTION game_piece_phone_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR OLD.phone IS DISTINCT FROM NEW.phone THEN
  PERFORM game_piece_emit(NEW.invitation_hash,NEW.member_id,'phone-offer','phone');
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS game_piece_phone_trigger ON reward_phone_offers;
CREATE TRIGGER game_piece_phone_trigger AFTER INSERT OR UPDATE ON reward_phone_offers FOR EACH ROW EXECUTE FUNCTION game_piece_phone_transition();

CREATE OR REPLACE FUNCTION game_piece_directory_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.listed AND (TG_OP='INSERT' OR NOT OLD.listed) THEN
  PERFORM game_piece_member_event(NEW.member_id,'directory-listed','directory');
 END IF;
 IF NEW.listed AND NEW.video_published AND NEW.video IS NOT NULL AND (TG_OP='INSERT' OR NOT OLD.video_published OR NOT OLD.listed) THEN
  PERFORM game_piece_member_event(NEW.member_id,'intro-published','intro');
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS game_piece_directory_trigger ON reward_directory_profile;
CREATE TRIGGER game_piece_directory_trigger AFTER INSERT OR UPDATE ON reward_directory_profile FOR EACH ROW EXECUTE FUNCTION game_piece_directory_transition();

CREATE OR REPLACE FUNCTION game_piece_wildcard_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE asker uuid;
BEGIN
 SELECT w.member_id INTO asker FROM connection_wildcard_asks w WHERE w.invitation_hash=NEW.invitation_hash AND w.question_id=NEW.question_id
 AND w.member_id IN(NEW.sender_member_id,NEW.prospect_member_id) AND w.member_id<>NEW.member_id
 AND w.message->>'by'=CASE WHEN w.member_id=NEW.sender_member_id THEN 'member' ELSE 'prospect' END;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM invitations i JOIN connection_state c ON c.invitation_hash=i.token_hash WHERE i.token_hash=NEW.invitation_hash AND i.sender_member_id=NEW.sender_member_id AND c.prospect_member_id=NEW.prospect_member_id) THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' AND NEW.answered_at IS NULL THEN
  PERFORM game_piece_emit(NEW.invitation_hash,asker,'wildcard-ask',NEW.question_id,NULL,true);
 ELSIF TG_OP='UPDATE' AND OLD.answered_at IS NULL AND NEW.answered_at IS NOT NULL THEN
  PERFORM game_piece_emit(NEW.invitation_hash,NEW.member_id,'wildcard-answer',NEW.question_id,NULL,true);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS game_piece_wildcard_trigger ON connection_wildcard_answers;
CREATE TRIGGER game_piece_wildcard_trigger AFTER INSERT OR UPDATE ON connection_wildcard_answers FOR EACH ROW EXECUTE FUNCTION game_piece_wildcard_transition();
