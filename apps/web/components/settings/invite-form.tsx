'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { usePresetOptions } from './preset-options';
import { errorKey, settingsRequest } from './request';

/** Task 11: invite a staff member with a role preset (POST /team/invite). The link is shown once and never stored. */
export function InviteForm({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations('settings.team.invite');
  const s = useTranslations('settings.shared');
  const presets = usePresetOptions();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [preset, setPreset] = useState('assistant');
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function send() {
    setBusy(true); setErrorCode(null);
    try {
      const created = await settingsRequest<{ link: string }>('POST', '/team/invite', { email: email.trim(), displayName: displayName.trim(), preset });
      setLink(created.link); setCopied(false);
      setEmail(''); setDisplayName('');
      onCreated();
    } catch (error) {
      setErrorCode(errorKey(error));
    } finally { setBusy(false); }
  }

  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  }

  if (link) {
    return (
      <Card>
        <VStack gap={3} className="min-w-0 [overflow-wrap:anywhere]">
          <Heading level={2}>{t('created')}</Heading>
          <Text>{t('linkNote')}</Text>
          <Text as="p" className="rounded-lg border p-3 text-sm" dir="ltr">{link}</Text>
          <Button label={copied ? t('copied') : t('copy')} variant="primary" className="min-h-11" onClick={() => void copy()} />
          <Button label={t('another')} variant="ghost" className="min-h-11" onClick={() => { setLink(null); }} />
        </VStack>
      </Card>
    );
  }

  return (
    <Card>
      <VStack gap={3} className="min-w-0 max-w-full">
        <Heading level={2}>{t('title')}</Heading>
        <Text color="secondary">{t('subtitle')}</Text>
        <TextInput label={t('displayName')} value={displayName} onChange={setDisplayName} isDisabled={busy} controlClassName="min-h-11" />
        <TextInput label={t('email')} type="email" value={email} onChange={setEmail} isDisabled={busy} controlClassName="min-h-11" autoComplete="off" />
        <Selector label={t('preset')} value={preset} options={presets} isDisabled={busy} controlClassName="min-h-11" containerClassName="min-w-0 max-w-full"
          onChange={(value) => setPreset(String(value))} />
        {errorCode ? <Banner status="error" title={s(`errors.${errorCode}`)} collapsible={false} /> : null}
        <Button label={t('send')} variant="primary" className="min-h-11" isLoading={busy} isDisabled={busy || !displayName.trim() || !email.includes('@')} onClick={() => void send()} />
      </VStack>
    </Card>
  );
}
