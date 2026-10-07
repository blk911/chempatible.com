# Category-first wildcards

Each verified member who has earned personal reward Level 3 can ask three
wildcard questions per connection. Eligible connections are mutually opened
Vibe chats and accepted, active Friends chats. Pending friend invitations do
not qualify. Playing a card does not open chat, change the five reward levels,
or share contact details. Each person has their own allowance in each connection.

## Member experience

1. On the completed Step 3 card, choose **Play a card**, then choose an eligible
   connection. The allowance is three per member in each connection. An existing
   eligible chat also provides **Play a wildcard** beside its remaining balance.
2. **Pick a category** shows category titles only.
3. Pick an unused question. Questions already asked by either person remain in
   place, masked and disabled as **Already played**.
4. Review the question and choose **Ask this**. It posts to that private chat and
   uses one wildcard only when the server successfully commits the message.

Back, Cancel, category browsing, and question selection do not spend a card.
Failed or uncertain requests retain their idempotency key for retry. The server
owns the balance and shared used-question history; refreshed tabs recover them.
Every member has their own three-card allowance, while question reuse is blocked
for the entire connection. The other person does not need Level 3 to see or
answer an incoming question. All questions are original, unscored conversation
starters, not copied psychological instruments.

## Persistence and authorization

`api/wildcards.mjs` uses the existing deployment gate and verified member
session/account binding. It rechecks both members, original pair identity,
reward eligibility, invitation targeting, accepted-friend or mutual Vibe chat state, blocks, and
freeze/trash/end restrictions after obtaining ordered member and connection
locks. The ledger insert and existing chat-message append share one transaction.

`connection_wildcard_asks` has one unique request key per member/connection,
one unique question per connection, and one unique slot from 1–3 per member.
Request replay returns its original message without another spend. The question
text and chat message are server selected; clients cannot supply arbitrary
wildcard text, sender identity, balance, or quota.

## Deployment and rollback

Apply `migrations/20261006_connection_wildcards.sql` first on an isolated child
branch of the verified development database, then on stable development before
deploying `main`. Test the migration against a child of production and apply the
same additive migration to the verified production database before deploying
`live`. Development and production keep their separate database integrations.
No credentials, environment flags, existing rows, or consent states are changed
by this migration. Runtime handlers do not run DDL.

The application baseline before this change is
`85cbf00d67431aeecf335ff6c03454994bd97361`. Keep the recorded prior development
and public deployment IDs. A code rollback retains the additive ledger and all
posted chat messages; never reset or delete user data to roll back the feature.

For the Step 3 entry and accepted-friend extension, the application baseline is
`181c226a76d8f53ecd19ebd8247fc84a196936f8`. Apply
`migrations/20261007_friend_wildcards.sql` using the same isolated-branch,
development-first workflow. It preserves the original relationship type with
the immutable pair snapshot and emits only wildcard asks/replies for friends.
It does not replay historic events or grant friend access to phone exchange,
reward progress, directory or intro game pieces. See `docs/GAME-PIECES.md` for
its data-preserving rollback.

## Verification scope

`tests/wildcards.test.mjs` covers authorization, lifecycle changes, transaction
rollback, bounded spending, pair-wide reuse prevention, and request idempotency
using synthetic PGlite data. PGlite serializes transactions, so that coverage is
not a real multi-connection PostgreSQL lock-contention stress test.
`tests/wildcards-ui.test.mjs` covers the category-first flow, masked used rows,
no spend on cancellation/failure, retries, and stale UI transitions. Both are in
`npm test`. Browser visual checks and deployed authenticated end-to-end checks
must be identified separately in the release report; DOM assertions alone do
not establish real-device behavior.
