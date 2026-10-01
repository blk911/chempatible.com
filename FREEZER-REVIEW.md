# Freezer candidate

Historical notes for the first Freezer release. The current interaction lifecycle
and rollback requirements are described in [TRASH-REVIEW.md](TRASH-REVIEW.md).
In particular, new Freeze actions now end the interaction and there is no direct
Return to active connections; a new invitation requires fresh consent.

This candidate adds personal connection history and member-to-member blocking.
It starts from dev commit `7dabcac44b219d323d92504d042672b61333785b`;
the corresponding live release is `f1b5668cd0c12d5b065012be32111a50fe281c35`.

## Behavior

- Cancel invalidates a pending invitation owned by its sender.
- Block requires an identified member pair and prevents new interactions in
  either direction across Friend and Vibe connections.
- Freezer hides a connection only for the member choosing it. New messages do
  not return it to the active list. Returning a manually frozen connection does
  not unblock anybody or reopen a canceled/ended connection.
- History contains server dates and only contact information that the viewer
  originally supplied or that was explicitly shared with them. An unnamed
  invitation does not identify a person. Missing historical values stay missing.
- History is paginated and excludes photos, answers, and message contents.

## Deployment prerequisite

Review and explicitly approve the target database before applying
`migrations/20261001_connection_freezer.sql`. The migration adds
`connection_visibility` and `member_blocks`, with ownership foreign keys and
indexes. It does not modify or delete existing application records and is not
automatically run by request handlers. Apply it before publishing this code.

Code rollback leaves the additive tables and their records intact. Earlier code
does not enforce member blocks; after Block is used, prefer a forward repair or
retain block enforcement when preparing a rollback. Do not drop these tables
as a routine code rollback.

An invitation send starts when its guarded reservation commits. A block that
commits first prevents new reservations. Already-started or provider-accepted
email cannot be recalled; a final check suppresses delivery when a later block
is observed before the provider call.

No pending private-video code or storage configuration is part of this change.
