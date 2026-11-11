'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Banner } from '@astryxdesign/core/Banner';
import { Heading } from '@astryxdesign/core/Heading';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { usePathname, useRouter } from '@/i18n/navigation';
import { errorKey, settingsRequest } from './request';

const CHANNELS = ['inapp', 'webpush', 'email', 'whatsapp'] as const;
type Channel = (typeof CHANNELS)[number];
type Preferences = { locale?: 'ar' | 'en'; channels?: Partial<Record<Channel, boolean>> };

/** Task 11: own language and notification channels (GET and PUT /settings/preferences). */
export function LanguageForm({ initial }: { initial: Preferences }) {
  const t = useTranslations('settings.language');
  const s = useTranslations('settings.shared');
  const active = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [channels, setChannels] = useState<Partial<Record<Channel, boolean>>>(initial.channels ?? {});
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(patch: Preferences) {
    setBusy(true); setErrorCode(null); setSaved(false);
    try {
      await settingsRequest('PUT', '/settings/preferences', patch);
      setSaved(true);
      return true;
    } catch (error) {
      setErrorCode(errorKey(error));
      return false;
    } finally { setBusy(false); }
  }

  async function chooseLocale(next: string) {
    if (next !== 'ar' && next !== 'en') return;
    if (await save({ locale: next }) && next !== active) router.replace(pathname, { locale: next });
  }

  async function toggle(channel: Channel, value: boolean) {
    const previous = channels;
    setChannels({ ...channels, [channel]: value });
    if (!await save({ channels: { [channel]: value } })) setChannels(previous);
  }

  return (
    <VStack gap={4} className="min-w-0 max-w-full">
      <Selector label={t('interface')} value={initial.locale ?? active} isDisabled={busy} controlClassName="min-h-11" containerClassName="min-w-0 max-w-full"
        options={[{ value: 'ar', label: t('ar') }, { value: 'en', label: t('en') }]} onChange={(value) => void chooseLocale(String(value))} />
      <VStack gap={2}>
        <Heading level={2}>{t('channels')}</Heading>
        <Text>{t('channelsHint')}</Text>
        {CHANNELS.map((channel) => (
          <Switch key={channel} label={t(`channel.${channel}`)} value={channels[channel] ?? channel === 'inapp'} isDisabled={busy}
            onChange={(value) => void toggle(channel, value)} />
        ))}
      </VStack>
      {saved ? <Text role="status">{s('saved')}</Text> : null}
      {errorCode ? <Banner status="error" title={s(`errors.${errorCode}`)} collapsible={false} /> : null}
    </VStack>
  );
}
