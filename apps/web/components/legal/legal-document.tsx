'use client';
import { useTranslations } from 'next-intl';
import { Banner } from '@astryxdesign/core/Banner';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { LEGAL_VERSION } from '@/src/server/settings/constants';
import { LEGAL_SECTIONS, type LegalDoc } from './sections';

/**
 * Task 11 / spec section 44: one public legal page. The draft banner is on every page; `[PLACEHOLDER: ...]` markers
 * inside the clauses are for counsel to fill (company name, address, retention periods, data protection contact).
 */
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  const t = useTranslations('legal');
  return (
    <VStack gap={5} className="min-w-0 max-w-full [overflow-wrap:anywhere]">
      <Banner status="warning" title={t('draftBanner')} description={t('draftBannerBody')} collapsible={false} />
      <VStack gap={2}>
        <Heading level={1}>{t(`${doc}.title`)}</Heading>
        <Text color="secondary">{t('version', { version: LEGAL_VERSION })}</Text>
        <Text as="p">{t(`${doc}.intro`)}</Text>
      </VStack>
      {LEGAL_SECTIONS[doc].map((key, index) => (
        <VStack key={key} gap={1} as="section" aria-labelledby={`${doc}-${key}`}>
          <Heading level={2} id={`${doc}-${key}`}>{`${index + 1}. ${t(`${doc}.sections.${key}.title`)}`}</Heading>
          <Text as="p">{t(`${doc}.sections.${key}.body`)}</Text>
        </VStack>
      ))}
    </VStack>
  );
}
