# BsideVibes returning sign-in repair

Normal returning email-code sign-in now opens the saved profile at `#profile`.
Already authenticated visits to the plain sign-in page use the same destination.
An explicit invitation, creator, community, or QR destination takes precedence.
Choosing Home cancels an abandoned entry flow; opening its original contextual
link starts that flow again. New-account registration still requires the original
name, consent, email-code, and photo steps.

On phones, signed-in navigation wraps below the brand. The profile photo retains
its visible “Your profile” label, and the other account links remain available.
Desktop navigation and the public homepage remain reachable.

## Offline regression check

Requires Node.js 24.15 or newer on the 24.x release line and `jsdom` 30.1.1.
Verified with Node.js 24.19.0. Run from the repository root:

```sh
node --test tests/wild-hub-returning-signin.test.mjs
```

The test reads the exact `wild-hub-hosted` files. Its transport is entirely mocked:
no real account, email, database, sign-in code, or payment is used. Coverage includes
normal sign-in; sign-out/sign-in; already-authenticated routes; new-email gates;
creator/invite/QR/community continuation; expired-session reauthentication;
incorrect codes; interrupted verification; canceled intent; and authored navigation
styles at 320, 360, 390, 430, 760, and 1440 pixels.

The implementation was also checked with the complete local Bside integration
suite and independent review. DOM/CSSOM checks do not establish rendered mobile
layout or actual device cookie behavior. Those remain separate browser checks.

## Release boundary

Only the hosted frontend JavaScript/CSS and their source manifest affect runtime.
No API, schema, account, session policy, provider, email, billing, or domain setting
is changed. The preceding Bside deployment is commit
`6f3bf81162aa945ec33d4f7be625f4f525e11dc3` on `feature/wild-hub-base`.
