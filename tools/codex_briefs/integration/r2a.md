# R2a integration patches (apply serially, after R1b, before testing the integrated tree)

All other R2a files are already in the worktree. Three hot spots need these exact edits.

## 1. `apps/web/i18n/request.ts`: register the `clientToday` namespace

In `loaders.ar`, directly after the line

```ts
    client: () => import('../messages/ar/client.json'),
```

add

```ts
    clientToday: () => import('../messages/ar/clientToday.json'),
```

In `loaders.en`, directly after

```ts
    client: () => import('../messages/en/client.json'),
```

add

```ts
    clientToday: () => import('../messages/en/clientToday.json'),
```

Without this, `useTranslations('clientToday')` throws at runtime in the tab bar and on every R2a page (the unit tests
load the JSON themselves, so they do not catch it).

## 2. `apps/web/src/components/shell/client-shell.tsx`: one client navigation, the new tab bar

Replace the whole file with the following. It is R1b's merged frame unchanged except for the import and the two
mounts: the old `NavLinks area="client"` import is removed and `ClientTabBar` (one component, `layout="top"` in the
header for `md` and up, `layout="tabs"` in the fixed bottom bar for phones) replaces both mounts. The auth gate,
foreground outbox, sync status and `env(safe-area-inset-bottom)` padding live in the layout / runtime mount / this
bottom wrapper and are untouched.

```tsx
import { ClientTabBar } from "@/components/app/client-tab-bar";
import { LocaleSwitch } from "./locale-switch";
import { SignOutButton } from "./sign-out-button";
import { SkipLink } from "./skip-link";
import { Wordmark } from "./wordmark";

/**
 * The client portal frame (the PWA): header with wordmark, links and locale switch on wide screens,
 * a bottom tab bar on phones. It holds no data, so it renders at once while the content streams in.
 * R2a: the links are the single ClientTabBar (Today, Plan, Coach, Me), filtered by the client's modules.
 */
export function ClientShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh w-full flex-col overflow-x-clip">
      <SkipLink />
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-3 py-1.5 md:px-6">
          <Wordmark className="min-w-0" />
          <ClientTabBar layout="top" className="ms-4 hidden md:block" />
          <div className="ms-auto flex items-center gap-1">
            <LocaleSwitch />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full min-w-0 max-w-xl flex-1 px-4 pt-6 pb-28 outline-none md:max-w-5xl md:px-6 md:pb-10"
      >
        {children}
      </main>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <ClientTabBar layout="tabs" className="mx-auto max-w-xl" />
      </div>
    </div>
  );
}
```

Check after applying: `grep -rn 'area="client"' apps/web` returns nothing, and only `client-shell.tsx` imports
`client-tab-bar` (P9: assert one mounted client navigation source, two DOM mounts of the same component, one visible
per breakpoint).

The provider that `ClientTabBar` reads is mounted above the shell in `app/[locale]/app/layout.tsx` (already done).

## 3. `apps/web/src/components/shell/nav-items.ts`: no required change

`CLIENT_NAV` is no longer mounted anywhere after patch 2 (`NavLinks` is still used for `area="coach"`). It stays as
legacy compatibility metadata; do not extend it. The authoritative client destinations are `CLIENT_TABS`,
`PLAN_LINKS` and `ME_LINKS` in `apps/web/components/client-today/client-destinations.ts`. Optional: add this comment
above `export const CLIENT_NAV`:

```ts
/** R2a: legacy metadata only. Mounted client navigation is CLIENT_TABS in components/client-today/client-destinations.ts. */
```

`NavLinks` still hard-codes `grid-cols-5` for the client `tabs` layout; that branch is dead after patch 2 and can be
dropped by whoever next edits `nav-links.tsx`.

## 4. Not needed

- No `api/index.ts`, core barrel or any `package.json` change.
- No new design token: the R2a files use only existing utilities (`bg-brand-soft`, `text-brand`, `focus-ring`,
  `min-h-11`, `min-h-12`, `min-h-14`, `min-h-16`, `break-words`) and Astryx props. Nothing is proposed for R5.
- The old `nav.client.*` messages stay in `nav.json`; they are no longer read by a mounted component.

## 5. For P9 (written, not run)

- `apps/web/e2e/beta/r2a-client-start.spec.ts` carries `@ar` / `@en` tags; register it with e2e-ar / e2e-en
  (playwright.e2e.config.ts already discovers `e2e/beta`). It needs the demo-seeded DB.
- The 375 / 1440 px Astryx render proof and `astryx doctor` check for Today, Plan, Coach and Me.
- `/app/progress` and `/app/tracking` render photos and measurements together and are not module-aware. R2a links
  them only when both `measurements` and `progress_photos` are on. A client with exactly one of the two loses the
  entry point until `TrackingScreen` can hide the disabled half (outside R2a's file list).