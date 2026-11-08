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
- `common.language`: label of the language switcher (spoken before the other language's name).
- `common.skipToContent`: skip link, first focusable element in the app shells.
- `common.menu`, `common.close`: mobile menu button and its close button (screen-reader labels).
- `common.mainNavigation`: aria-label of the primary navigation landmark.
- `common.tagline`: one line under the wordmark on the landing screen.

## nav.coach (desktop sidebar and mobile menu)
- `nav.coach.dashboard`, `clients`, `programs`, `nutrition`, `checkins`, `calendar`, `messages`, `billing`, `settings`: one link each, in the order the shell shows them. `packages` is kept for later use but is not in the shell.

## nav.client (bottom tab bar on phones, header links on desktop)
- `nav.client.today`, `program`, `nutrition`, `progress`, `messages`: one tab each, in shell order. `tracking`, `checkins` and `profile` are kept for later use but are not in the shell.

## auth
- `auth.login`: sign-in page title (the page h1).
- `auth.loginSubtitle`: one line under the sign-in title.
- `auth.email`, `auth.password`: field labels.
- `auth.magicLink`: button that emails a one-time sign-in link.
- `auth.signIn`: submit button for email and password.
- `auth.signOut`: sign-out button.
- `auth.invalidCredentials`: shown when Supabase rejects the email or password.
- `auth.magicLinkSent`: confirmation after the magic link is requested.
- `auth.emailRequired`: shown when the magic link is requested without an email.
- `auth.genericError`: fallback for any other sign-in failure.

## landing, coach.dashboard, client.today, notFound (P2.5 shell screens)
- `landing.opening`: status line on the full-screen branded state shown while `/[locale]` redirects.
- `coach.dashboard.subtitle`, `emptyTitle`, `emptyBody`: coach dashboard subtitle and its no-clients empty state.
- `client.today.subtitle`, `emptyTitle`, `emptyBody`: client Today subtitle and its nothing-planned empty state.
- `notFound.title`, `body`: shown for any URL with no page yet (navigation links point at screens still to be built) and for real 404s.
- `notFound.backCoach`, `backClient`, `backHome`: the one button on that screen, per area.

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
