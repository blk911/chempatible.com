# Instant Vibe review / rollback

## Frozen baseline

- Source repository: https://github.com/blk911/chempatible.com
- Public release branch `live`, reverified September 30, 2026: `984b618b6c31b2a27d8a9db7f07944cc06aa2ed0`
- Commit: https://github.com/blk911/chempatible.com/commit/984b618b6c31b2a27d8a9db7f07944cc06aa2ed0
- Previously verified production deployment: https://vercel.com/jsws-projects-217e294d/chempatible/5qC4pA2K131qKwkvRiypiTkG1PG4
- Vercel authentication currently prevents independently reconfirming deployment configuration. The source baseline was reverified. Do not assume a preview has isolated data.
- Review branch: `review/instant-vibe-20260930`, branched from that exact live commit. `main` was separately at `1404e7f04878d03d9bed2a84188b13ed39e13aff`; no main-only changes are included.

## Safe review first

Production is not changed by this proposal. Review endpoints fail closed before database or mail access. Static visuals can be reviewed; actual account, invitation, and message operations return an explicit review-only notice.

To exercise live-style test flows, first configure a **separate disposable database** and **test-only mail provider/recipients** in a preview environment. Only then set `CHEMPAT_REVIEW_DATA=isolated-confirmed` there. This acknowledgement cannot itself prove isolation. Never set it against production credentials. Never use real member data, real recipient emails or real invitations during QA.

No new schema, migrations, resets, credential changes, or production operations are part of this proposal. Existing baseline initialization remains unchanged. Automated tests use synthetic in-memory data.

## Rollback before promotion

Close/discard this review branch or its draft PR. The live ref and current public deployment stay untouched, so there is no production rollback to execute.

## If this proposal is later approved and promoted

Promotion requires separate approval and a deployment/data-readiness review. Record the then-current deployment and source SHA again. Preserve this baseline as an immutable rollback reference. Trusted live mode controls the review gate and review-only noindex response header without deleting the development safeguards. Its configuration is a deliberate production-readiness change requiring the separate approval and checks in `RELEASE-MODE.md`; it is not enabled automatically here.

If a later approved release needs rollback, use Vercel's deployment rollback/promote flow to restore the saved production deployment above, after confirming its identity and domain. If deployment retention makes that unavailable, redeploy exact source commit `984b618b6c31b2a27d8a9db7f07944cc06aa2ed0` with the original production configuration under explicit deployment authorization. Do not force-push `live` or reset the database as a substitute.

**Code rollback is not data rollback.** This review introduces staged connection states (`secondFive`, `nextResults`, `chatRequested`). Older code may not understand in-flight states created by a later promoted version. New accounts may also contain only five answers; the original baseline required ten to create invitations. Before production approval, decide whether to drain those sessions or provide a compatibility release. Do not erase or rewrite member data to make old code work. Database backups and restoration require a separate plan and authorization.

Returning to the baseline also restores its known pre-review privacy/stage behavior. A production rollback decision should weigh those known defects.


## Established development lane (verified September 30, 2026)

The repository has no `dev` branch. `main` deploys to the `chempatible-dev` project's stable development URL, `https://chempatible-dev.vercel.app`. `live` deploys to the `chempatible` production project. The two base branches have identical source trees but separate promotion history.

Install the tested review tree as one ordinary commit on `main`, parented to `1404e7f04878d03d9bed2a84188b13ed39e13aff`. Preserve `review/instant-vibe-20260930` at `cc6e52f6177a5ca8719afd4eba69b124d9aa402b` as the reviewed source. No force push or live promotion is part of this installation.

Development code rollback is a normal revert of that installation commit on `main`; the previous development deployment is `dpl_3gB1ixKzggTq6mFXwRuUrG62ovR8` (source `1404e7f04878d03d9bed2a84188b13ed39e13aff`). The original live rollback reference above remains unchanged. Never reset a database to perform a code rollback.

Vercel calls the stable development project's environment **Production**. This is distinct from the live project's Production environment. Review enablement and test email settings for the stable development URL must be scoped to **chempatible-dev / Production**. The earlier review-branch Preview settings do not apply there. Verify the stable development database separately before enabling the guard; a verified empty review branch alone does not establish that the database behind `main` is empty. Live promotion still requires explicit approval and a separate compatibility/configuration review.

If later display-only commits follow the installation, revert those commits first, then revert the installation commit, preserving normal forward history. For immediate code-only recovery the saved previous development deployment can also be restored separately. Do not force-push or reset the database.
