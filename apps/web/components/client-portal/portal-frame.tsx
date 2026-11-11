'use client';
import { useTranslations } from 'next-intl';
import { Dumbbell } from 'lucide-react';
import { VStack } from '@astryxdesign/core/VStack';
import { PageHeader } from '@/src/components/shell/page-header';
import { EmptyState } from '@/src/components/shell/empty-state';

/** Task 5: shared client page frame keeps the shell header and Astryx layout consistent. */
export function PortalFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return <VStack gap={6} className="min-w-0 max-w-full break-words"><PageHeader title={title} />{children}</VStack>;
}

/** Task 5: translated empty states for missing assignments and inaccessible history. */
export function PortalEmpty({ program = false }: { program?: boolean }) {
  const t = useTranslations('workout');
  return <EmptyState Icon={Dumbbell} title={t(program ? 'emptyProgram' : 'emptyHistory')} description={t(program ? 'emptyProgramBody' : 'emptyHistoryBody')} />;
}
