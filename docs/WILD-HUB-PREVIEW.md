# Wild Hub review prototype

Branch-only design concept based on the existing Duh Wild source at 26232b5. Do not merge this branch's static-only deployment profile into main or live.

## Review

Open the deployed preview root, or serve `wild-hub/` locally. The landing page links to a fictional public host, introduction form, host Approve/Pass controls, an invitation-email preview, and the sample member view. Use “Fill with sample details” and acknowledge the demo, then switch to Host view to approve your request. All changes are in memory and reset on refresh. Monthly/annual membership and one-time contributions are visual choices only, with illustrative amounts and no payments.

No live API, database, account, email, upload, analytics or payment integration exists in this prototype. There is no real authentication or membership security. Fictional illustrated portraits are included, with no external images or fonts.

## Deployment boundary

Vercel `builds` explicitly includes eight static assets only; no function or middleware builder is selected. Root rewrites serve these assets. CSP rejects all connections and form submissions. The preview is noindex and robots-disallowed. No environment variables are embedded, read, or required. `.vercelignore` also excludes the original application runtime. Existing source files remain unchanged for future reuse.

Vercel documents that an explicit `builds` list includes only the outputs of those builders: https://vercel.com/docs/project-configuration/vercel-json#builds

## What the existing app supplies

- Email-code authentication and a name/photo profile (email access confirmation, not identity verification)
- Emailed friend invitations and recipient Accept/Pass
- Account-bound one-to-one friend chat with moderation controls

Existing friend acceptance directly opens a one-to-one chat. It is not host approval for a public join request. Do not wire the new request button directly to that accept action. The current reward-request approval code is relationship-game-specific and must not be reused unchanged.

## Before a functional launch

Add explicitly published host profiles, host-specific applications, host-only race-safe approval, membership roles and revocation, and server authorization on every private-content/media read. Define profile-publication consent, application and membership data visibility, retention, moderation and abuse controls. Adapt the existing friend/email/account infrastructure without exposing relationship answers. Choose membership benefits, payment provider, final prices, fees and cancellation terms separately; never imply contributions are tax-deductible.

## Checks

- `node --test tests/wild-hub-ui.test.mjs`: interactive DOM behavior, field validation, simulated transitions, escaping, modal dismissal/focus, membership/support choices, no network/storage
- `node --test tests/wild-hub-deployment.test.mjs`: exact static asset allowlist, routes, CSP, noindex and runtime exclusions
- `npm test`: original suite plus Wild Hub checks. Original deployment and branding tests recognize this explicitly isolated static profile while retaining original assertions when the profile is absent
- No TypeScript or build transpilation is used; `node --check wild-hub/wild-hub.js` and `git diff --check` cover syntax and whitespace

Live behavior, deliverability, real access controls and payments are intentionally unimplemented and untested. Visual browser checks and deployment results should be reported with the delivered review URL.
