# Friends release

## Scope

A secondary Share with a friend action creates a one-use link. The sender's explicit invitation and the recipient's explicit acceptance establish a friends chat. Verified membership, adult consent, photo identity, moderation, and server-side pair ownership remain required. Romantic questions are not part of accepting this connection.

The stored invitation channel, not a client flag, determines its kind. Friend records have empty answer snapshots. Friend projections never reveal answers or email/phone fields, and romantic reveal/share actions reject them. The normal Vibe flow is unchanged. Public friend-token pages are excluded from indexing. Shared links use the `/friend` entry page with a neutral friend invitation preview, while the root Vibe preview stays unchanged.

## Data and rollback

No new table, column, credential, or storage service is introduced. Existing invitation and connection rows hold friend records, using channel `friend`. Acceptance binds one verified recipient account. An old or forwarded link cannot replace that account. The sender is retained as the referrer through its existing member ID.

Rollback baseline: dev `7b554ae12a88ab3f13f1567f19ec214be642c51f`; public `6284e19a3373fee7d8705e821c9b726a8b1ce54d`, production deployment `dpl_2WFwApw32R2fJZCqXRSXuxuDsejV`. Preserve history with a reverting commit or restore the previous deployment. A code rollback leaves all friend records and messages intact. Older UI does not distinguish friends and may present them as generic connections, so prefer a forward fix once friends are in use. Never delete accounts or reset a database to roll back this feature.

Private video remains excluded. Real member sessions, accounts, and invitation email recipients are not changed by publication.

## Verification

The regression suite uses synthetic accounts and messages only. Friend API integration runs its actual SQL in PGlite, including first acceptance, same-link retries, competing recipients, reverse-link duplicates, revoked/expired links, cross-pair denial, staged-flow isolation, and redaction even if sensitive columns contain values. UI tests exercise zero-answer signup, existing membership, recovery, separate friend/Vibe selection, and the shared text/photo composer. Hosted smoke checks must verify the exact deployed source, route availability, noindex behavior, and unchanged deployment/admin guards. Physical-phone camera, clipboard sharing, and real distributed database concurrency remain separate device/infrastructure checks; no production account creation or outbound test invitations are part of this release verification.
