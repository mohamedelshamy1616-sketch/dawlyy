'use client';
import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { ClientModules } from '@dawlyy/core/types';
import { ClientTodayView } from '@/components/client-today/today-view';
import { countOn } from '@/src/lib/client-app-composer/state';
import { makeComposerPreview } from '@/src/lib/client-app-composer/preview';

/**
 * R2c: the live phone-frame preview. It renders R2a's Today with synthetic data and `preview`, so every link and
 * button is inert and nothing is fetched. R2a's Today renders its own h1; the frame is exposed to assistive
 * technology as one labelled image, which keeps the page outline to a single h1.
 */
export function PhonePreview({ modules, locale, numerals }: { modules: ClientModules; locale: 'ar' | 'en'; numerals: 'latn' | 'arab' }) {
  const t = useTranslations('clientAppComposer');
  const model = makeComposerPreview(modules, locale, numerals);
  return (
    <VStack gap={2} className="min-w-0 max-w-full" data-testid="phone-preview">
      <Heading level={2}>{t('preview.title')}</Heading>
      <Text as="p" color="secondary">{t('preview.caption')}</Text>
      {countOn(modules) === 0 ? <Text as="p" role="status">{t('preview.empty')}</Text> : null}
      <Card padding={4} className="mx-auto w-full max-w-sm min-w-0 rounded-3xl border-2" role="img" aria-label={t('preview.frame')} data-preview="true">
        <ClientTodayView model={model} preview headingLevel={3} />
      </Card>
    </VStack>
  );
}
