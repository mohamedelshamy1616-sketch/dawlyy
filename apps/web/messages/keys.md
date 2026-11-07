# Message keys

Source of truth for `messages/ar.json` and `messages/en.json`. Both files must have identical key sets. Arabic uses a natural Egyptian coaching register, not literal translation. Status words are fixed across the app (spec section 61).

## common
- `common.appName`: product name in the header and sign-in screen.
- `common.save`, `common.cancel`, `common.back`, `common.next`: generic form and wizard buttons.
- `common.loading`: loading placeholder text.
- `common.search`: search field label and placeholder.
- `common.noResults`: empty list or empty search state.
- `common.syncNow`: manual offline-outbox flush button.
- `common.unsynced`: badge text when local records are not yet on the server.
- `common.language`: label of the language switcher.

## nav.coach (desktop sidebar)
- `nav.coach.dashboard`, `clients`, `programs`, `nutrition`, `checkins`, `calendar`, `messages`, `packages`, `billing`, `settings`: one sidebar link each.

## nav.client (mobile bottom tab bar)
- `nav.client.today`, `program`, `nutrition`, `tracking`, `checkins`, `messages`, `profile`: one tab each.

## auth
- `auth.login`: sign-in page title.
- `auth.email`, `auth.password`: field labels.
- `auth.magicLink`: button that emails a one-time sign-in link.
- `auth.signIn`: submit button for email and password.
- `auth.signOut`: sign-out button.
- `auth.invalidCredentials`: shown when Supabase rejects the email or password.
- `auth.magicLinkSent`: confirmation after the magic link is requested.
- `auth.emailRequired`: shown when the magic link is requested without an email.
- `auth.genericError`: fallback for any other sign-in failure.

## status (fixed words, spec section 61)
- `status.complete`, `due`, `overdue`, `waitingForCoach`, `waitingForClient`, `needsReview`, `expired`: task, check-in and subscription state labels.
- `status.draft`, `published`: versioned document states.
- `status.active`, `paused`, `cancelled`: subscription and client states.

## api (user-facing text for API error codes)
- `api.unauthenticated`: 401.
- `api.forbidden`: 403.
- `api.notFound`: 404.
- `api.validation`: 400.
- `api.conflict`: 409.
