import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { LocaleSwitch } from '@/src/components/shell/locale-switch';
import { PageHeader } from '@/src/components/shell/page-header';
import { PageSkeleton } from '@/src/components/shell/page-skeleton';
import { Wordmark } from '@/src/components/shell/wordmark';

/** Task 2: shared full-screen auth presentation, matching the existing login layout in both directions. */
export function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main id="main" className="flex min-h-svh w-full max-w-full flex-col overflow-x-clip bg-linear-to-b from-brand-soft to-background px-4 py-6">
      <div className="mx-auto flex w-full min-w-0 max-w-sm flex-1 flex-col justify-center gap-6">
        <div className="flex items-center justify-between gap-2">
          <Wordmark asLink={false} className="min-w-0" />
          <LocaleSwitch />
        </div>
        <PageHeader title={title} subtitle={subtitle} />
        <Card className="w-full min-w-0 max-w-full shadow-sm">
          <CardContent className="min-w-0 break-words [&_button]:min-h-11 [&_input]:h-11 [&_a]:min-h-11">{children}</CardContent>
        </Card>
      </div>
    </main>
  );
}

/** Task 2: meaningful loading shell shared by all four auth routes. */
export function AuthLoading() {
  return <main id="main" className="flex min-h-svh w-full min-w-0 max-w-full flex-col overflow-x-clip bg-linear-to-b from-brand-soft to-background px-4 py-6">
    <div className="mx-auto flex w-full min-w-0 max-w-sm flex-1 flex-col justify-center gap-6">
      <div className="flex items-center justify-between gap-2"><Wordmark asLink={false} className="min-w-0" /><LocaleSwitch /></div>
      <Card className="w-full min-w-0 max-w-full"><CardContent><PageSkeleton /></CardContent></Card>
    </div>
  </main>;
}
