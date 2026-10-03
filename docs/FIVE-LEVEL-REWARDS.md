# Five-level reward game

## What advances a level

Progress is personal and server-authoritative, never a browser flag or a count
of repeated connections. Each reward is an available choice, not permission to
share data automatically. Existing invitations, private profile photos and chat
remain available under their existing rules.

1. **First five:** five existing Vibe answers saved on the member account enable
   introductions through the existing invitation flow
2. **Second five:** all ten existing Vibe answers saved on the account enable
   optional mutual phone exchange in an active romantic chat. Finishing these
   on the personal reward screen does not advance pair reveal/consent states
3. **Next five:** five new original reflection choices earn individual
   “Getting closer” status. Each eligible active connection receives one system
   note about that member, and their existing contact card shows the status.
   The other person does not need Level 3. Friends can see the status, while
   phone exchange remains scoped to romantic connections
4. **Next five:** five original choices enable browsing an authenticated member
   directory and a separate opt-in to show the member's current first name and
   profile photo. Nothing is listed merely by completing the round
5. **Next five:** five original choices enable a private video upload and a
   separate choice to show it with an opted-in directory profile

Levels 3–5 are original choices, not shortened validated instruments or scored
psychological classifications. The full optional questionnaires and original
reflection pieces remain available secondarily under More reflections and
inside active connection games. They neither gate nor advance these levels.

## Data and consent

- First/second-five completion reflects actual saved answers
- Later rounds use revision-checked drafts and immutable completed rounds;
  stale saves cannot silently replace newer progress
- Each phone offer identifies one connection. Neither number appears to the
  other party until both are eligible and each explicitly offers a number
- Numbers are member-provided, not SMS-verified. Withdrawal hides the exchange
  in the app; it cannot erase a number someone already saw or copied
- Directory listing copies only the current first name and profile photo on
  explicit opt-in; private answers, scored results, email and phone are excluded
- Directory and its photos/videos are authenticated and Level-4 gated in
  both development and approved production. It is not a public internet search page
- Directory cards offer a targeted in-app Vibe request. A named confirmation
  explains that the sender's name/photo are shown and both first-five sets are
  shared only if the recipient explicitly accepts. Pass/cancel do not connect
  anyone; no external email is sent. Acceptance enters the existing firstResults
  Vibe flow, retaining later reveal/chat consent steps
- Unlisting immediately removes directory visibility and hides the video;
  private owner preview remains available
- An upload is private and clears any earlier video-publication choice.
  Publishing the replacement always needs another explicit action
- Bidirectional blocks and ended/frozen/trashed histories prevent directory
  discovery and media viewing, even if a newer active pair also exists
- Requests bind consent to the member account visible in the tab. Auth failures
  clear private UI caches and invalidate older in-flight responses
- Current session, email verification and account standing are checked by the
  server. Mutation guards recheck after locks

## Video limits and honest scope

The runtime accepts self-contained, non-fragmented MP4 containing H.264 video
and optional AAC audio, at most **2 MiB** and **15 seconds**. Server parsing checks
sample timelines, sample/chunk byte locations, codec configuration and bounded
video dimensions. Browser-reported duration and top-level duration metadata
alone are not trusted. Storage is existing Neon bytea; retrieval requires fresh
authorization with no-store and safe content-type headers.

This is structural validation, not full decoding, transcoding, malware scanning,
or content moderation. Some normal high-resolution phone clips will exceed the
size cap or use an unsupported container. The UI must state these limits and
reject unsupported clips clearly. No in-browser compression or universal mobile
upload success is claimed.

## Deployment and rollback

Additive migrations:
- 20261003_member_rewards.sql
- 20261003_reward_directory.sql
- 20261003_reward_requests.sql

No existing account is automatically listed and no stored phone is automatically
shared. Test migrations on an isolated child of development, then apply to
stable development before publishing code. Production promotion requires explicit
approval, a saved source/deployment baseline, verified production database
identity, and the additive migrations before the matching application release.
Reward, directory and in-app request endpoints use the same fail-closed
`deploymentMode()` identity gate as the existing application: verified isolated
review or the specifically configured trusted live project, Production lane and
`live` Git ref. Member authentication, account binding, standing, level checks,
blocks, lifecycle restrictions and explicit consent are unchanged. See
`RELEASE-MODE.md` for exact configuration and post-deployment verification.

Rollback source baseline: e723c118445f35a2e8d90427ee5eab0e5d3725c9.
Keep additive tables on code rollback. Do not delete reward data, contacts,
media, or member accounts to roll back an application deployment.

Tests use synthetic members and generated media only. Actual logged-in browser
paint, mobile codec behavior, and a real two-account deployed walkthrough must
be distinguished from DOM/PGlite/parser tests in the release report.
