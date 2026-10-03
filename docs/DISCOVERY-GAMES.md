# Optional connection games

Games are voluntary additions to an active romantic connection with chat open.
They never gate signup, the first five, invitations, existing chat, or friends.
Either person chooses **Add a game**, answers privately, and earns a personal
piece. Completing does not share a result. Both participants must separately
choose to share that module's result before the pair reveal appears.

## Initial modules

- **Feel Loved**: 10 original Duh Wild affection-preference prompts
- **Closeness Reflection**: 10 original Duh Wild prompts about connection habits
- **Big Five Snapshot**: public-domain Mini-IPIP20 personality self-report

The first two are original conversation games, not Love Languages or validated
attachment questionnaires. No MBTI, ECR-RS, or Helen Fisher questionnaire is
included. Results are descriptive self-reports, never clinical diagnoses,
attachment types, predictions of relationship success, or compatibility scores.
Exact module provenance, response scale, dimensions and versions are maintained
in `api/_discovery-modules.mjs`.

## Persistence and privacy

- Draft answers and earned results belong to the signed-in member
- Revision checks reject stale saves/completions across connections or tabs;
  the UI merges untouched newer answers and requires another explicit save
- An earned piece is immutable for its module/version and remains when a
  connection ends; it is not automatically offered to a later connection
- A new connection requires an explicit offer of an existing piece; the UI
  explains that this consents to share this result in that connection
- Raw answers never appear in the other person's API projection
- Pair results require both completed pieces and both affirmative sharing choices
- Personal pieces are owner-only; no public profile/discovery endpoint exists
- Only a current, verified, active member session can use the API; prior sessions
  cease working after login rotates the member session hash
- Friends, strangers, frozen/trashed/ended connections, either-direction member
  blocks and paused/blocked members cannot access pair games
- Server-side lifecycle authorization is repeated after ordered member locks
  and a connection lock, protecting writes racing with freeze or block
- Started, finished and shared-reveal-ready system chat notes are emitted once
  per connection/module/version/milestone. Saves never flood the chat

## Migration and release

`migrations/20261003_discovery_games.sql` adds five isolated tables. It never
rewrites existing members, invitations, answers, chats, or lifecycle records.
Apply on an isolated branch first and compare schemas. Apply to the approved
stable development database before publishing the matching `main` code.
Production schema/data and `live` release require a separate review gate.

There are no test emails, changes to existing personal accounts, billing changes,
or automatic sharing during installation. UI/browser fixtures are local only.

Rollback: redeploy the previous application commit, leaving the additive tables
in place. Do not drop tables to roll back. Old code ignores these tables. Existing
chat renderers safely treat system milestone messages as text; no private answers
or result contents are in milestone notes. Preserve this data for a later forward
fix. Do not edit question meanings or score keys inside an already-used version;
add a new version with independent pieces and consent.

## Checks

`npm test` includes pure scoring/key/validation tests, actual PostgreSQL SQL via
PGlite integration, privacy/race/idempotence tests, and browser-DOM interaction
coverage. Review each run's result; listed coverage is not itself proof of a pass.

## Privacy wording for review before public launch

The current Privacy Policy mentions only Five to Vibe answers. Proposed additions
for the service owner to review before production release:

- What we collect: “Optional discovery games: your saved responses, scored
  self-reflection results, earned pieces, game participation, and each
  connection-specific choice to share a result.”
- Who can see what: “Your optional-game responses stay private to your account.
  A connection can see that you started or completed a game. Results are shown
  to the two connected members only after both complete the game and both
  choose to share their result. Starting or finishing a game does not by itself
  share its result.”
- Retention: “Earned pieces stay with your account when an individual connection
  ends. You choose separately whether to offer a piece in a new connection.
  Optional games are not required to use chat.”

These are product-fact drafts, not a legal-compliance assessment. The development Privacy Policy includes this scope and an October 3, 2026
effective date for review. It must not be promoted publicly until the service
owner approves that policy update and the production release.
