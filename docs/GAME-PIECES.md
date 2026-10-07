# Five-step game pieces

The reward dialogs keep all five steps visible, including completed and locked
steps. Opening a completed step reviews its benefit without replaying answers,
resetting progress, or awarding extra wildcards.

## Private phone profile

After Step 2, the member can enter a number with country code, or review and
confirm a saved number. This is optional, owner-private profile storage.
Confirmation records the member's own confirmation; it is not SMS verification.
Saving never creates a phone offer. Phone exchange remains a separate explicit
choice for the named romantic connection, with both members eligible and opted
in before either number is disclosed. Existing explicit offers remain valid.

The profile has its own revision, so a stale tab cannot overwrite a newer
number. UI drafts are held only in memory. Connection readiness uses booleans;
the other member's private profile number and confirmation timestamp are never
part of readiness summaries.

## Two-sided wildcards

New wildcard asks are tied to an immutable original pair and recipient. The
sender sees Waiting, the recipient can explicitly answer, and both then see the
question and Answered reply. Answering is allowed below Step 3 and spends no
wildcard. Asking still requires Step 3 and an already-open romantic chat, with
three asks per member per connection and no question reuse in that connection.
Ordinary chat messages are never inferred to be a card answer.

An ask, its pending recipient record and chat message commit atomically. A
reply and its chat message also commit atomically and support idempotent retry.
Legacy asks without an original-pair snapshot remain in chat and still count
toward quota; the system does not guess a recipient or backfill private replies.

## Shared counterpart feed

Atomic PostgreSQL transition triggers create recipient-scoped game pieces for
future meaningful changes: first-five completion after a real pair is bound,
later progress, continuing/opening chat, explicit phone offers, optional
directory/video publication, and wildcard questions/replies. Existing pair IDs
are snapshotted at rollout, but no historical events, receipts or prompts are
backfilled.

The event store contains identifiers and milestone metadata, not private phone
numbers, answers, question/reply text, photos or videos. Reads reauthorize the
current account, original pair, lifecycle, level and source visibility. A
published intro remains watchable only under the existing directory/media
rules, including restrictions from older ended or frozen pairs.

After a verified dashboard load, one available game piece can open with its
current action and Hold for later. Other pieces remain in the Game pieces list
and connection indicators. Holding, Escape and backdrop dismissal defer the
piece for the current visit; they do not send a notification or spend a card.
Polling updates state without repeatedly opening dialogs. Existing forms,
modals and unsent chat drafts are not interrupted.

Seen, held and handled are separate. Receipt revisions prevent delayed requests
from overwriting a newer Hold. Opening an actionable answer, phone or required
round does not complete it; failed or cancelled actions retain the pending
state. Completed source obligations resolve rather than creating stale prompts.
Informational pieces can be acknowledged after their authorized view loads.
Feed pagination and bounded authorized connection hydration keep older
connections reachable beyond the main inbox's first page.

## Migration and rollback

Apply in order:

1. `20261006_member_phone_profile.sql`
2. `20261006_wildcard_answers.sql`
3. `20261006_game_pieces.sql`

Test on isolated development and production children first, then migrate stable
development before its `main` deployment. Only after verification, migrate the
separate production database and deploy the approved `live` commit. Request
handlers never run DDL. The trigger functions use normal invoker permissions
and introduce no credentials, grants or security-definer privileges.

Pre-change source: `d53b6de97c696dc9624643a634d0afb5836870d5`.
Retain private phone profiles, wildcard ledgers/messages, original-pair
snapshots and receipt history on application rollback. Never reset user data.
The saved baseline deployment IDs are recorded with the release evidence.
If recovery concerns a trigger defect, an application rollback alone is not
enough: under the authorized recovery plan, pause only the seven new game-piece
emission triggers while retaining their definitions and all stored data. A
reviewed migration can re-enable emission after the defect is corrected.

## Verification boundaries

Automated SQL tests use synthetic PGlite databases, including the actual API
statements and installed triggers. Real PostgreSQL migration and trigger smoke
checks are separate. PGlite serializes transactions; a serialized connector
smoke is not evidence of real multi-session lock contention.

Synthetic browser fixtures use the actual application UI with fake accounts,
phone numbers and media. They establish rendered controls and interactions,
not real deployed account login, email/SMS delivery or physical-phone behavior.
The release report distinguishes these checks from authenticated live testing.
