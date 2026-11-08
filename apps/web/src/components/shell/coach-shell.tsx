import { LocaleSwitch } from "./locale-switch";
import { MobileMenu } from "./mobile-menu";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";
import { SkipLink } from "./skip-link";
import { Wordmark } from "./wordmark";

/**
 * The coach workspace frame: sidebar on wide screens, menu button on small ones, one header with the
 * locale switch and sign-out. It holds no data, so it renders at once while the content streams in.
 */
export function CoachShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh w-full overflow-x-clip">
      <SkipLink />
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-4 border-e bg-sidebar p-4 text-sidebar-foreground md:flex">
        <Wordmark className="px-1" />
        <NavLinks area="coach" layout="sidebar" className="overflow-y-auto" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-background/95 px-3 py-1.5 backdrop-blur supports-backdrop-filter:bg-background/80">
          <div className="flex min-w-0 items-center gap-1 md:hidden">
            <MobileMenu />
            <Wordmark className="min-w-0" />
          </div>
          <div className="ms-auto flex items-center gap-1">
            <LocaleSwitch />
            <SignOutButton />
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 outline-none md:px-8 md:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
