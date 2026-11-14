'use client';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { CoachBottomBar } from './coach-bottom-bar';
import { CommandPalette } from './command-palette';
import { NavLinks } from './nav-links';
import { ProfileMenu } from './profile-menu';
import { SkipLink } from './skip-link';
import { Wordmark } from './wordmark';

/** R1b: four-destination desktop rail and phone bar, with secondary tools under the profile. */
export function CoachShell({ children }: { children: React.ReactNode }) {
  return <HStack gap={0} className="min-h-svh w-full min-w-0 items-stretch overflow-x-clip">
    <SkipLink />
    <aside className="sticky top-0 hidden h-svh w-28 shrink-0 flex-col gap-6 border-e bg-sidebar px-2 py-5 text-sidebar-foreground md:flex">
      <Wordmark className="flex-col justify-center" />
      <NavLinks area="coach" layout="rail" className="min-h-0 overflow-y-auto" />
    </aside>
    <VStack gap={0} className="min-w-0 flex-1">
      <header className="sticky top-0 z-30 flex min-h-14 w-full items-center justify-between gap-2 border-b bg-background px-3 py-1.5">
        <Wordmark className="min-w-0 md:hidden" />
        <HStack gap={2} vAlign="center" className="ms-auto"><section className="hidden md:block"><CommandPalette /></section><ProfileMenu /></HStack>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pt-6 pb-28 outline-none md:px-8 md:py-8">
        {children}
      </main>
    </VStack>
    <CoachBottomBar />
  </HStack>;
}
