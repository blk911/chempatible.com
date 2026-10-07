CREATE TABLE IF NOT EXISTS email_codes (
  email text PRIMARY KEY,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY,
  session_hash text NOT NULL UNIQUE,
  name text NOT NULL,
  contact text NOT NULL,
  photo text NOT NULL,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS email_sessions (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS invitations (
  token_hash text PRIMARY KEY,
  sender_email text NOT NULL,
  sender_name text NOT NULL,
  sender_photo text NOT NULL,
  sender_answers jsonb NOT NULL,
  recipient_name text NOT NULL,
  recipient_email text NOT NULL,
  sender_member_id uuid,
  channel text NOT NULL DEFAULT 'email',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitations_sender_idx ON invitations(sender_email, created_at DESC);
CREATE TABLE IF NOT EXISTS connection_state (
  invitation_hash text PRIMARY KEY REFERENCES invitations(token_hash) ON DELETE CASCADE,
  prospect_name text,
  prospect_photo text,
  prospect_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  prospect_phone text,
  prospect_email text,
  status text NOT NULL DEFAULT 'invited',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  claim_hash text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Moderation and activity (api/_ops.mjs also creates these on first use).
CREATE TABLE IF NOT EXISTS activity (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), kind text NOT NULL, member_id uuid, connection_id text, detail jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE INDEX IF NOT EXISTS activity_at_idx ON activity(at DESC);
CREATE INDEX IF NOT EXISTS activity_member_idx ON activity(member_id, at DESC);
CREATE TABLE IF NOT EXISTS reports (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), connection_id text NOT NULL, reporter_side text NOT NULL, reporter_member_id uuid, reporter_name text, reported_member_id uuid, reported_name text, reported_contact text, reason text NOT NULL, note text, chat jsonb NOT NULL DEFAULT '[]'::jsonb, status text NOT NULL DEFAULT 'open', reviewed_at timestamptz, UNIQUE(connection_id, reporter_side));
CREATE INDEX IF NOT EXISTS reports_reported_idx ON reports(reported_member_id);
ALTER TABLE members ADD COLUMN IF NOT EXISTS suspended_until timestamptz;
ALTER TABLE members ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
ALTER TABLE members ADD COLUMN IF NOT EXISTS admin_notes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE connection_state ADD COLUMN IF NOT EXISTS prospect_member_id uuid;
ALTER TABLE connection_state ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE connection_state ADD COLUMN IF NOT EXISTS ended_by text;
-- Proposed additive migration. Apply only to an explicitly approved database.
-- No existing invitations, states, profiles, messages, or reports are changed.
CREATE TABLE IF NOT EXISTS connection_visibility (
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  invitation_hash text NOT NULL REFERENCES invitations(token_hash) ON DELETE CASCADE,
  frozen_at timestamptz,
  action text NOT NULL CHECK (action IN ('freeze','unfreeze','cancel','block')),
  action_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, invitation_hash),
  CHECK ((action='unfreeze' AND frozen_at IS NULL) OR (action<>'unfreeze' AND frozen_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS connection_visibility_frozen_idx ON connection_visibility(member_id, frozen_at DESC) WHERE frozen_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS connection_visibility_invitation_idx ON connection_visibility(invitation_hash);
CREATE TABLE IF NOT EXISTS member_blocks (
  blocker_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id<>blocked_id)
);
CREATE INDEX IF NOT EXISTS member_blocks_reverse_idx ON member_blocks(blocked_id, blocker_id);
-- Additive lifecycle migration. Apply only to the explicitly approved database.
-- Plan: apply columns/indexes first, verify them, then deploy the matching API/UI.
-- This does not change existing connection states, visibility, blocks, dates,
-- profiles, answers, messages, reports, or invitations. Legacy personal freezes
-- stay live until their owner explicitly freezes the interaction under new rules.
-- Rollback requires a compatible build that still enforces recipient binding and
-- Trash visibility. Do not redeploy a pre-lifecycle app after new rows are created.
ALTER TABLE connection_visibility ADD COLUMN IF NOT EXISTS trashed_at timestamptz;
ALTER TABLE connection_visibility ADD COLUMN IF NOT EXISTS restored_at timestamptz;
CREATE INDEX IF NOT EXISTS connection_visibility_trash_idx ON connection_visibility(member_id,trashed_at DESC) WHERE trashed_at IS NOT NULL;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS intended_member_id uuid REFERENCES members(id);
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS intended_email text;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS reinvite_from text REFERENCES invitations(token_hash) ON DELETE SET NULL;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS reinvite_request_hash text;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS delivery_status text CHECK(delivery_status IN ('pending','sent','uncertain','blocked'));
CREATE UNIQUE INDEX IF NOT EXISTS invitations_reinvite_request_idx ON invitations(sender_member_id,reinvite_request_hash) WHERE reinvite_request_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS invitations_reinvite_source_idx ON invitations(reinvite_from,created_at DESC) WHERE reinvite_from IS NOT NULL;
-- Additive only. Apply to isolated development first; production requires review.
-- Personal earned pieces survive any one connection. Private answers are never shared.
CREATE TABLE IF NOT EXISTS discovery_drafts (
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 module_id text NOT NULL, version text NOT NULL,
 answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(answers)='object'),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(member_id,module_id,version)
);
CREATE TABLE IF NOT EXISTS discovery_pieces (
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 module_id text NOT NULL, version text NOT NULL,
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 completed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(member_id,module_id,version)
);
CREATE TABLE IF NOT EXISTS discovery_games (
 invitation_hash text NOT NULL REFERENCES invitations(token_hash) ON DELETE CASCADE,
 module_id text NOT NULL, version text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(invitation_hash,module_id,version)
);
CREATE TABLE IF NOT EXISTS discovery_players (
 invitation_hash text NOT NULL, module_id text NOT NULL, version text NOT NULL,
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz, shared_at timestamptz,
 PRIMARY KEY(invitation_hash,module_id,version,member_id),
 FOREIGN KEY(invitation_hash,module_id,version) REFERENCES discovery_games(invitation_hash,module_id,version) ON DELETE CASCADE,
 CHECK(shared_at IS NULL OR completed_at IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS discovery_events (
 invitation_hash text NOT NULL, module_id text NOT NULL, version text NOT NULL,
 event_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(invitation_hash,module_id,version,event_key),
 FOREIGN KEY(invitation_hash,module_id,version) REFERENCES discovery_games(invitation_hash,module_id,version) ON DELETE CASCADE
);

ALTER TABLE discovery_drafts ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0 CHECK(revision>=0);
-- Additive, development-review only. No existing answers or contacts are changed.
CREATE TABLE IF NOT EXISTS member_reward_state (
 member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
 completed_level integer NOT NULL DEFAULT 0 CHECK(completed_level BETWEEN 0 AND 5),
 answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(answers)='object'),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reward_phone_offers (
 invitation_hash text NOT NULL REFERENCES invitations(token_hash) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 phone text NOT NULL CHECK(phone ~ '^\+[1-9][0-9]{6,14}$'),
 offered_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(invitation_hash,member_id)
);
CREATE TABLE IF NOT EXISTS reward_connection_events (
 invitation_hash text NOT NULL REFERENCES invitations(token_hash) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 event_key text NOT NULL CHECK(event_key='level-3-upgrade'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(invitation_hash,member_id,event_key)
);
-- Review-only opt-in directory. Apply explicitly to the isolated development
-- database after the reward-game migration; request handlers never run DDL.
-- No existing account is listed and no private photo is copied by this migration.
CREATE TABLE IF NOT EXISTS reward_directory_profile (
 member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
 listed boolean NOT NULL DEFAULT false,
 photo text CHECK(photo IS NULL OR length(photo)<250000),
 display_name text CHECK(display_name IS NULL OR length(display_name) BETWEEN 1 AND 50),
 video bytea CHECK(video IS NULL OR octet_length(video) BETWEEN 1 AND 2097152),
 video_mime text CHECK(video_mime IS NULL OR video_mime='video/mp4'),
 duration_seconds double precision CHECK(duration_seconds IS NULL OR (duration_seconds>0 AND duration_seconds<=15)),
 video_published boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT listed OR (photo IS NOT NULL AND display_name IS NOT NULL)),
 CHECK((video IS NULL AND video_mime IS NULL AND duration_seconds IS NULL) OR (video IS NOT NULL AND video_mime IS NOT NULL AND duration_seconds IS NOT NULL)),
 CHECK(NOT video_published OR (listed AND video IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS reward_directory_listed_idx ON reward_directory_profile(member_id) WHERE listed;
-- Isolated development only; applied explicitly, never from request handlers.
-- Pending previews expose profile snapshots only. The sender's first five
-- answers are stored privately to preserve exactly what was offered; they are
-- copied to a mutual connection only when the target explicitly accepts.
CREATE TABLE IF NOT EXISTS reward_discovery_requests (
 id uuid PRIMARY KEY,
 sender_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 target_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','passed','cancelled')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 created_at timestamptz NOT NULL DEFAULT now(),
 invitation_hash text REFERENCES invitations(token_hash) ON DELETE SET NULL,
 sender_first_five jsonb NOT NULL CHECK(jsonb_typeof(sender_first_five)='array' AND jsonb_array_length(sender_first_five)=5 AND '[0,1,2]'::jsonb @> sender_first_five),
 sender_name text NOT NULL CHECK(length(sender_name) BETWEEN 1 AND 50),
 sender_photo text NOT NULL CHECK(length(sender_photo)<250000),
 target_name text NOT NULL CHECK(length(target_name) BETWEEN 1 AND 50),
 target_photo text NOT NULL CHECK(length(target_photo)<250000),
 CHECK(sender_id<>target_id),
 CHECK(status='accepted' OR invitation_hash IS NULL),
 UNIQUE(sender_id,target_id)
);
-- A pass, cancellation or expiry is not a license to send repeated requests.
-- Also prevents simultaneous opposite-direction requests creating two pairs.
CREATE UNIQUE INDEX IF NOT EXISTS reward_discovery_requests_pair_idx ON reward_discovery_requests(least(sender_id,target_id),greatest(sender_id,target_id));
CREATE INDEX IF NOT EXISTS reward_discovery_requests_incoming_idx ON reward_discovery_requests(target_id,created_at DESC) WHERE status='pending';
CREATE INDEX IF NOT EXISTS reward_discovery_requests_outgoing_idx ON reward_discovery_requests(sender_id,created_at DESC) WHERE status='pending';
-- Additive only. Apply explicitly to the approved database before deploying the
-- wildcard endpoint. Request handlers never run DDL. Existing messages, answers,
-- contact-sharing consent, connections, and reward levels are not changed.
-- Keep this ledger on code rollback so spending and question deduplication are
-- retained if the feature returns. Do not reset or delete existing user data.
CREATE TABLE IF NOT EXISTS connection_wildcard_asks (
 invitation_hash text NOT NULL REFERENCES connection_state(invitation_hash) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 request_id text NOT NULL CHECK(request_id ~ '^[A-Za-z0-9_-]{8,128}$'),
 question_id text NOT NULL CHECK(question_id ~ '^wc-[a-z]+-[1-9][0-9]*$'),
 slot smallint NOT NULL CHECK(slot BETWEEN 1 AND 3),
 message jsonb NOT NULL CHECK(jsonb_typeof(message)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(invitation_hash,member_id,request_id),
 CONSTRAINT connection_wildcard_question_once UNIQUE(invitation_hash,question_id),
 CONSTRAINT connection_wildcard_member_slot UNIQUE(invitation_hash,member_id,slot)
);
-- Read-only verification (constraints must include both named UNIQUEs, the
-- primary key, the slot CHECK, and two cascading foreign keys):
-- SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid='connection_wildcard_asks'::regclass ORDER BY conname;
-- These three checks must return no rows:
-- SELECT invitation_hash,member_id FROM connection_wildcard_asks
-- GROUP BY invitation_hash,member_id HAVING count(*)>3;
-- SELECT invitation_hash,question_id FROM connection_wildcard_asks
-- GROUP BY invitation_hash,question_id HAVING count(*)>1;
-- SELECT w.invitation_hash,w.question_id FROM connection_wildcard_asks w
-- JOIN connection_state c USING(invitation_hash)
-- WHERE (SELECT count(*) FROM jsonb_array_elements(c.messages) m
--        WHERE m->>'id'=w.message->>'id')<>1;

-- Additive only. Apply explicitly to an approved database before deploying the
-- matching rewards API. Request handlers never run DDL or backfill this table.
-- This is a private member-confirmed phone profile, NOT SMS ownership proof.
-- Saving here never offers/shares a phone, changes a reward, lists a member,
-- opens chat, reveals answers, or changes a connection or its existing consent.
-- Legacy contact numbers are read only for their own member's prefill; they
-- are not copied or marked confirmed until that member explicitly confirms.
-- Keep this table on code rollback. Do not delete or reset member data.
CREATE TABLE IF NOT EXISTS member_phone_profile (
 member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
 phone text NOT NULL CHECK(phone ~ '^\+[1-9][0-9]{6,14}$'),
 confirmed_at timestamptz NOT NULL DEFAULT now(),
 revision integer NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 2147483647),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Read-only verification: one primary key, one cascading member foreign key,
-- and the phone/revision CHECK constraints must be present.
-- SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid='member_phone_profile'::regclass ORDER BY conname;
-- SELECT column_name,data_type,is_nullable,column_default
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='member_phone_profile'
-- ORDER BY ordinal_position;
-- This check must return no rows. Do not select actual phone numbers for logs.
-- SELECT member_id FROM member_phone_profile
-- WHERE phone !~ '^\+[1-9][0-9]{6,14}$' OR confirmed_at IS NULL
-- OR revision NOT BETWEEN 1 AND 2147483647;
-- Additive only. Apply explicitly to the approved database after the wildcard
-- ask ledger, before deploying the two-sided card API. No request-time DDL.
-- Each new ask atomically records its original pair here with a pending reply.
-- The recipient alone may fill the reply once. Existing asks and chat messages
-- are never rewritten or inferred to be answers. Historical asks without an
-- original-pair snapshot remain in chat and still count toward the ask quota;
-- do not backfill recipients from mutable current connection membership.
-- Keep both ledgers on code rollback. Never reset or delete user data.
CREATE TABLE IF NOT EXISTS connection_wildcard_answers (
 invitation_hash text NOT NULL,
 question_id text NOT NULL,
 sender_member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 prospect_member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 request_id text CHECK(request_id IS NULL OR request_id ~ '^[A-Za-z0-9_-]{8,128}$'),
 message jsonb CHECK(message IS NULL OR (jsonb_typeof(message)='object' AND message ? 'text' AND jsonb_typeof(message->'text')='string' AND length(message->>'text') BETWEEN 1 AND 1000)),
 created_at timestamptz NOT NULL DEFAULT now(),
 answered_at timestamptz,
 PRIMARY KEY(invitation_hash,question_id),
 FOREIGN KEY(invitation_hash,question_id) REFERENCES connection_wildcard_asks(invitation_hash,question_id) ON DELETE CASCADE,
 CONSTRAINT connection_wildcard_answer_request_once UNIQUE(invitation_hash,member_id,request_id),
 CHECK(sender_member_id<>prospect_member_id),
 CHECK(member_id IN(sender_member_id,prospect_member_id)),
 CHECK((request_id IS NULL AND message IS NULL AND answered_at IS NULL) OR (request_id IS NOT NULL AND message IS NOT NULL AND answered_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS connection_wildcard_answers_pending_idx ON connection_wildcard_answers(member_id,invitation_hash) WHERE answered_at IS NULL;
-- Read-only checks must return no rows; avoid selecting private message text.
-- SELECT invitation_hash,question_id FROM connection_wildcard_answers a
-- JOIN connection_wildcard_asks w USING(invitation_hash,question_id)
-- WHERE a.member_id=w.member_id OR w.member_id NOT IN(a.sender_member_id,a.prospect_member_id);
-- SELECT a.invitation_hash,a.question_id FROM connection_wildcard_answers a
-- JOIN connection_state c USING(invitation_hash) WHERE a.message IS NOT NULL
-- AND (SELECT count(*) FROM jsonb_array_elements(c.messages) m
--      WHERE m->>'id'=a.message->>'id')<>1;

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
