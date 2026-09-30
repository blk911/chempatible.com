# Explicit deployment modes

These changes prepare source for a later approved public release. They do not
change Vercel environment variables, branches, deployments, databases, mail
settings, or domains. `main` remains development; `live` remains public release.

## Development and previews

Keep `CHEMPAT_RELEASE_MODE` unset or set to `review`. Data APIs remain disabled
unless `CHEMPAT_REVIEW_DATA=isolated-confirmed` acknowledges separately verified
database and mail isolation. All mail still requires an exact address in
`CHEMPAT_REVIEW_EMAILS`; no domain wildcards or plus-address expansion is allowed.

The stable development URL uses **chempatible-dev / Production**, sourced from
`main`. Vercel's environment name `production` does not make that project live.
Its separate database and test-recipient list must remain in place. Never copy
live credentials to development to satisfy this guard.

## Public release configuration, only after approval

All these values must match in the server runtime:

| Variable | Required value | Source |
| --- | --- | --- |
| `CHEMPAT_RELEASE_MODE` | `live` | Nonsecret application setting, only in chempatible / Production |
| `VERCEL` | `1` | Vercel system environment |
| `VERCEL_PROJECT_ID` | `prj_gtV01YIqkEfAfvdSbVopIfy2VpnJ` | Vercel system environment |
| `VERCEL_ENV` | `production` | Vercel system environment |
| `VERCEL_GIT_COMMIT_REF` | `live` | Vercel system environment from the Git deployment |

Keep **Enable access to System Environment Variables** enabled on the project.
These four `VERCEL*` variables are documented at both build time and runtime:
https://vercel.com/docs/environment-variables/system-environment-variables
Do not create manual replacements for missing platform identity. A deployment
without the expected Git ref or platform values must stay blocked; fix its
deployment configuration before promoting it.

The public project requires its own existing production `DATABASE_URL`, approved
`SENDGRID_API_KEY` and authenticated sender `hello@chempatible.com`, and explicit
`CHEMPAT_ADMIN_EMAIL` set to the existing authorized administrator. Do not grant a
new admin identity as part of release preparation. Preserve the existing
`ADMIN_SESSION_SECRET` configuration and the database, verification, consent,
moderation, and session behavior. Production does not use review-data or review
recipient flags; they are not substitutes for live mode.

Any missing identity, mismatched project, preview environment, wrong branch, or
unknown release flag blocks data/mail access. A copied `live` flag on development
blocks it even if the isolation flag is set. The public project cannot be enabled
using `isolated-confirmed`, including in a preview or when live mode is absent.

## Presentation and indexing

`api/_deployment.mjs` is the single source of mode decisions for API guards,
public configuration, and middleware. Request hosts, cookies, request headers,
URL parameters, and browser storage cannot enable live mode.

`GET /api/config` returns only `{ "reviewOnly": true }` or
`{ "reviewOnly": false }`, with `Cache-Control: no-store`. It reads no database
and returns no project ID, admin address, recipient list, key, or credential.
`deployment.js` removes the default review banner only after a successful JSON
response with boolean `reviewOnly: false`. Offline, invalid, or failed responses
leave the notice visible. APIs enforce the mode independently of this UI.

Routing middleware runs for all routes, using the supported
`next({ headers })` helper from pinned `@vercel/functions`. Every non-live response
gets `X-Robots-Tag: noindex, nofollow, noarchive`. Admin, API and invitation URLs
remain noindex in live mode. Ordinary live public pages can be indexed. The other
security headers stay in `vercel.json`; no build script rewrites that file.
Middleware helper reference:
https://vercel.com/docs/routing-middleware/api#continuing-the-routing-middleware-chain

## Checks before and after an approved promotion

1. Run `npm test` on the exact release candidate. Tests use synthetic data and
   mocked providers; they do not prove a deployed database or inbox is configured.
2. Record exact dev and live source SHAs and deployment IDs, verify separate
   database targets, sender configuration, admin identity, and platform variable
   availability without printing secrets. Check existing schema compatibility.
3. Obtain approval for the specific live commit/configuration and promotion.
   Configure only the public project's Production application flag, then deploy
   the approved `live` Git ref. Environment changes require a new deployment.
4. Verify that live `/api/config` returns only `reviewOnly: false`; the public
   landing lacks the review notice/noindex header; admin/API/invitation URLs keep
   noindex; signed-out admin redirects; and signed-in admin still works.
5. Independently verify development still returns `reviewOnly: true`, shows the
   banner/noindex, uses isolated data, and rejects mail to unapproved recipients.
   Run the approved end-to-end signup, verification, invitation, reveal and chat
   checks with the approved test accounts. A provider acceptance is not inbox
   delivery evidence.

Do not call the release deployed or operational solely from local tests. The
middleware/CDN response headers and system-variable availability require checks
on the exact approved deployment. Any failed identity check must stay blocked;
do not remove the guard to make a smoke test pass.

## Rollback

Preserve the previous deployed live artifact and original configuration before
promotion. Use an explicitly authorized code/deployment rollback if needed.
Removing `CHEMPAT_RELEASE_MODE` from a new deployment fails closed for data/mail;
it is not a compatible restoration of previous gameplay. It requires redeploying
to take effect. New five-answer accounts and staged sessions may need a compatible
rollback release; see `REVIEW-ROLLBACK.md`. Never reset, erase, or rewrite the
database as a code rollback.
