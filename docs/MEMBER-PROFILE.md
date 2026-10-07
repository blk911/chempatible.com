# Member profile routes and identity

My profile edits the existing signed-in member. It does not create a second
profile, restart signup, reset answers, earn rewards, replace a session, or send
email. Email remains the displayed sign-in address; changing it is outside this
feature.

## Entry and route matrix

| Entry or action | Route / script | Stored data | Visibility and safeguards |
| --- | --- | --- | --- |
| My profile beside the avatar | `game.js`, profile view | No write | Uses the signed-in account, including when viewing a received connection |
| Load profile | `GET /api/member-profile` | Existing `members` row and own discovery status | Cookie plus expected member ID; verified active member; no-store |
| Save name or picture | `POST /api/member-profile`, `action: save` | `members.name`, `members.photo`, `updated_at` | Owner lock, fresh session and member-ID check, opaque profile revision |
| Camera / choose photo | Profile-specific draft in `game.js` | Nothing until Save | Local preview; camera stops on exit; bounded image input and JPEG output |
| Update my discovery listing checkbox | Same profile save request, `updateDiscovery: true` | Existing directory photo and display name only | Explicit choice; still listed and Level 4 at commit; never creates or relists a listing or publishes video |
| Private phone | Existing `/api/rewards`, `confirmProfilePhone` | Existing `member_phone_profile` | Step 2, revision check, confirmation by member; not SMS verification |
| Share a phone number | Existing connection reward controls | Existing per-connection offers | Separate explicit offer; counterpart number only after mutual consent |
| Active connection identity | Existing `/api/connection`, `/api/wildcards`, `/api/game-pieces` | Read current `members` identity | Shared participant-bound projection; accepted active relationships only |
| Signup / recover existing member | Existing `/api/member`, `register` | New member only when none exists | Existing same-address member is returned without overwriting identity or saved answers |
| New invitation | Existing `/api/qr`, `/api/email`, `/api/friend` | New invitation snapshot | Uses the current member identity under existing invitation and consent rules |
| Historical invitation / Freezer photo | Existing snapshot fields and `/api/connection-photo` | No change | Historical identity remains a snapshot; no private-profile lookup by address |
| Discovery / intro visibility | Existing `/api/reward-directory` | Existing directory and video records | Listing, unlisting, upload and publish remain separate choices |

## Identity boundaries

The profile save body accepts only the operation, name, picture, profile revision
and explicit discovery-update choice. Email, account IDs, answers, phone offers,
reward progress, listing flags and video publication flags are not editable
through this request. The expected member header binds the request to the
cookie account; it does not select another account.

Profile revision covers the saved name and picture. Changes to answers, phone
confirmation or game progress do not make the editor conflict. Concurrent
profile edits require reload and review. If an opted-in listing is no longer
listed or eligible, the profile/listing update fails together so the member can
review that choice.

Current name/picture is projected only for authenticated, verified active
participants in the exact accepted connection. Both member identities and the
relationship are rechecked when reading the current fields. Pending or anonymous
invitations, frozen/trashed/ended/declined/blocked connections and historical
photo routes retain their existing snapshot behavior. Historic chat text and
already-sent email attachments are not rewritten.

## Verification and rollout

No database migration or new member/profile/phone table is required. Tests run
against disposable local PostgreSQL (PGlite) and a DOM harness with synthetic
members; they must not use real sessions, send email, or change live records.
The release follows the existing `main` development then `live` public workflow.

Run `npm test` against the final source. It includes profile API, UI, active
identity and route/deployment coverage alongside the existing reward, invitation,
friend, phone, wildcard, history and deployment guards. Browser camera permission,
physical-device photo selection and visual layout still need a permitted browser
session; DOM and SQL tests alone do not establish those results.

Rollback is a code rollback to the prior deployment/commit. Existing member
edits and explicit discovery updates remain saved; do not reset data to roll
back UI or API code.
