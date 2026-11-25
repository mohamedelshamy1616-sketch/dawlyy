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
    <div className="client-shell flex min-h-svh w-full flex-col overflow-x-clip">
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
      <div id="workout-footer" />
      <div className="client-mobile-nav fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden">
        <ClientTabBar layout="tabs" className="mx-auto max-w-xl" />
      </div>
    </div>
  );
}
