'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { errorKey, settingsRequest } from './request';

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Task 11: brand colour form. The logo field is left out until image upload for branding exists (see the logo note). */
export function BrandingForm({ initialColor, canEdit }: { initialColor: string | null; canEdit: boolean }) {
  const t = useTranslations('settings.branding');
  const s = useTranslations('settings.shared');
  const [color, setColor] = useState(initialColor ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true } | { ok: false; code: string } | null>(null);
  const trimmed = color.trim();
  const valid = trimmed === '' || HEX.test(trimmed);

  async function save() {
    setBusy(true); setResult(null);
    try {
      await settingsRequest('PUT', '/settings/business', { brandColor: trimmed === '' ? null : trimmed });
      setResult({ ok: true });
    } catch (error) {
      setResult({ ok: false, code: errorKey(error) });
    } finally { setBusy(false); }
  }

  return (
    <VStack gap={4} className="min-w-0 max-w-full">
      {canEdit ? null : <Banner status="info" title={s('readOnly')} collapsible={false} />}
      <TextInput label={t('brandColor')} description={t('brandColorHint')} value={color} onChange={setColor}
        isDisabled={!canEdit || busy} controlClassName="min-h-11" status={valid ? undefined : { type: 'error', message: t('invalidColor') }} />
      <VStack gap={2}>
        <Heading level={2}>{t('preview')}</Heading>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span aria-hidden className="size-11 shrink-0 rounded-xl border" style={{ backgroundColor: valid && trimmed ? trimmed : 'var(--brand)' }} />
          <Text>{t('previewText')}</Text>
        </div>
      </VStack>
      <VStack gap={1}>
        <Heading level={2}>{t('logoTitle')}</Heading>
        <Text>{t('logoPending')}</Text>
      </VStack>
      {result?.ok ? <Text role="status">{s('saved')}</Text> : null}
      {result && !result.ok ? <Banner status="error" title={s(`errors.${result.code}`)} collapsible={false} /> : null}
      {canEdit ? <Button label={busy ? s('saving') : s('save')} variant="primary" className="min-h-11" isDisabled={busy || !valid} onClick={() => void save()} /> : null}
    </VStack>
  );
}
