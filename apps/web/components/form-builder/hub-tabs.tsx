'use client';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { VStack } from '@astryxdesign/core/VStack';
import type { FormKind } from './contracts';
import { coachFormPath } from './contracts';

/** Task 7: review queue / templates switch on a coach hub; the active tab is the `tab` search parameter. */
export function HubTabs({ formKind, active, count }: { count?: number; formKind: FormKind; active: 'review' | 'templates' }) {
  const t = useTranslations('forms');
  const status = useTranslations('status');
  const router = useRouter();
  const base = coachFormPath(formKind);
  const siblings = (['intake', 'checkin', 'assessment'] as const).filter(kind => kind !== formKind);
  return <VStack gap={3}>
    <TabList value={active} size="lg" hasDivider onChange={value => router.push(`${base}?tab=${value === 'templates' ? 'templates' : 'review'}`)}>
      <Tab value="review" aria-label={t('hub.reviewQueue')} label={formKind === 'checkin'
        ? `${status('needsReview')}${count === undefined ? '' : ` (${count})`}`
        : t('hub.reviewQueue')} />
      <Tab value="templates" label={t('hub.templates')} />
    </TabList>
    <HStack gap={2} wrap="wrap">
      {siblings.map(kind => <Button key={kind} label={t(`hub.goto.${kind}`)} variant="ghost" href={coachFormPath(kind)} />)}
    </HStack>
  </VStack>;
}
