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
