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
