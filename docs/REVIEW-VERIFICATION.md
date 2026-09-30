# Review verification

Completed September 30, 2026 against the review changes based on live `984b618b6c31b2a27d8a9db7f07944cc06aa2ed0`.

## Passed locally

- `npm ci --cache /tmp/chempatible-npm-cache` using the existing lockfile
- Aggregate `npm test`: review guard, schema, email, connection, QR, two-browser DOM, moderation/admin, member authentication suites
- `node --check` for every root JS file and API/test MJS file
- `git diff --check`
- Independent read-only review and rerun of the aggregate tests; a wrong-pair outgoing-results bug found during review was repaired and given a regression test

## Specific coverage

No question/answer spoilers in opening DOM; synthetic signup consent/email code and cancellation; reuse of saved first-five answers; no duplicate request details form; both Keep going choices; second-five gating; mutual chat; received connection recovery using authenticated ID after logout/session rotation; both photos; switching between sent/received pairs; no wrong-pair outgoing results; outgoing email invite path; photos/reactions; pending input/polling; QR first-phone claiming/expiry; hidden contacts and unrevealed answers; malformed/unauthenticated/stranger requests; paused/unverified account restrictions; report/unmatch; concurrent closure races; existing legacy chats.

The review guard was invoked for GET and POST on every account/invitation/connection/admin API with fake service configuration. Every call returned 503 and no network operation occurred.

## Hosted preview check

Vercel reported both review builds ready for commit `8ff1e3b7e3329eaa60b24aed4c810fa9a151ce17`. The public preview opened in the cloud browser, showing the review banner, mystery opening, both illustrative portraits, decorative QR and five locks. The Create my Instant Vibe button opened the signup form. No personal information was entered and no registration or invitation was submitted. A portrait-caption overlap and signup-logo return issue found in this visual pass were corrected afterward. Direct navigation to the preview API was blocked by the browser client, so its HTTP response was not independently verified.

## Not established

- Real Postgres execution and production-like database integration
- Real SendGrid delivery or inbox arrival
- Hosted preview database/mail isolation (the API gate remains closed by default)
- Real-device camera, mobile layout and full interactive gameplay in a real browser
- Local browser QA was blocked at port 4173 (`ERR_BLOCKED_BY_CLIENT`). The hosted opening/signup entry were inspected as described above; this is not full browser flow coverage

There is no separate build or lint command configured in this repository. Vercel serves static files and API functions. A hosted build result, if available in the PR, is distinct from the local tests above. This remains a draft proposal, not a production-ready promotion.

## Form/photo/five-secret correction

The later user correction removes the promotional opening and illustrations, changes visible branding to chem-PATIBLE, and uses a form-first flow followed by the member's own photo and five tap-to-advance choices. Tests cover stale repeated taps, Back/last-choice correction, no auto-minted QR, five-answer member/QR/email handling, both next-five completion orders, failed-finalization retry, immutable pair snapshots, legacy ten-answer accounts and both-person UI reveal/chat gating.

Cloud DevTools was unavailable by organization policy; no attempt was made to bypass it. Narrow-window resizing did not change the available viewport, so actual mobile-size visual validation remains a limitation. Responsive CSS includes mobile rules and 48px/50px controls.


## Real development flow verification, September 30

The stable `chempatible-dev.vercel.app` deployment from `main` was enabled only after independently verifying the existing development Neon project and its empty main branch. The user entered the mail key directly into the development project's Production environment. An exact two-recipient allowlist restricts all review mail. No live database data or credentials were copied.

Two clearly labeled synthetic test accounts and images completed the hosted flow against real PostgreSQL and SendGrid: email delivery and verification; photo upload; five tap-through choices; exactly five saved answers; zero invitation rows before the Instant Vibe tap; QR creation on tap; separate emailed invitation delivered with image; recipient first five reused at registration; first-five reveal; both Keep going decisions; sender later-five saved while hidden from the unfinished recipient; recipient later-five completion; both later-five revealed; recipient chat request and sender approval; messages delivered both ways. Sender logout/sign-in restored the sent connection. A fresh recipient tab with no invitation URL restored the received connection and conversation.

The unused in-person QR expired naturally after fifteen minutes and disappeared from the sender's pending-code indicator. The expired row remained unclaimed; the email connection independently reached chat with ten real answers per participant. Tests used two verified aliases of the same development deployment to isolate cookie scopes. Physical camera capture and scanning a QR on a second mobile device were not exercised. Real simultaneous PostgreSQL completion races remain covered by code review and synthetic regression tests, not a stress test.

The subsequent display-only correction uses `Chem-patible` with the supplied upright-Chem / italic-patible logo; data identifiers, domains, state logic, and question content remain unchanged.

A later sign-in to the same synthetic recipient account rotated its single-device session and exposed a UI edge: the old member cookie plus a valid email cookie produced an empty inbox. The follow-up fix returns an explicit sign-in-required response and displays a prefilled sign-in form instead; it does not widen ownership or restore revoked sessions. Regression coverage includes valid email plus revoked member cookie, preserved legacy email-only access, and the client sign-in transition. The earlier received connection remained saved throughout.
