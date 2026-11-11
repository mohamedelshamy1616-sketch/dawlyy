'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { TimeInput, type ISOTimeString } from '@astryxdesign/core/TimeInput';
import { createISOTimeString } from '@astryxdesign/core/utils';
import { VStack } from '@astryxdesign/core/VStack';
import { requestJson } from '@/components/messaging/http';
import type { PreferencesData } from '@/components/messaging/types';

const LANGUAGES = ['default', 'ar', 'en'] as const;

function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const raw = atob(padded); const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Task 9: Web Push opt-in for this device. Needs the VAPID public key and a service worker; otherwise it explains why not. */
function PushControl({ publicKey }: { publicKey: string | null }) {
  const t = useTranslations('messaging.preferences');
  const [state, setState] = useState<'checking' | 'unsupported' | 'denied' | 'off' | 'on'>('checking');
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { if (!cancelled) setState('unsupported'); return; }
      if (Notification.permission === 'denied') { if (!cancelled) setState('denied'); return; }
      const registration = await navigator.serviceWorker.getRegistration();
      const existing = await registration?.pushManager.getSubscription();
      if (!cancelled) setState(existing ? 'on' : 'off');
    }
    void check().catch(() => { if (!cancelled) setState('unsupported'); });
    return () => { cancelled = true; };
  }, []);

  async function turnOn() {
    if (!publicKey) return;
    setBusy(true); setFailed(false);
    try {
      if (await Notification.requestPermission() !== 'granted') { setState('denied'); return; }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(publicKey) });
      const json = subscription.toJSON();
      const created = await requestJson<{ id: string }>('/api/v1/notifications/push-subscriptions', 'POST', { endpoint: subscription.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 500) });
      setSubscriptionId(created.id); setState('on');
    } catch { setFailed(true); } finally { setBusy(false); }
  }
  async function turnOff() {
    setBusy(true); setFailed(false);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
      if (subscriptionId) await requestJson(`/api/v1/notifications/push-subscriptions/${subscriptionId}`, 'DELETE');
      setSubscriptionId(null); setState('off');
    } catch { setFailed(true); } finally { setBusy(false); }
  }

  return (
    <VStack gap={2} className="min-w-0">
      <Heading level={3}>{t('pushHeading')}</Heading>
      {!publicKey ? <Text type="supporting">{t('pushNotConfigured')}</Text>
        : state === 'unsupported' ? <Text type="supporting">{t('pushUnsupported')}</Text>
        : state === 'denied' ? <Text type="supporting">{t('pushDenied')}</Text>
        : state === 'on' ? (
          <HStack gap={2} wrap="wrap" align="center"><Text type="supporting">{t('pushOn')}</Text><Button label={t('pushDisable')} className="min-h-11" isDisabled={busy} onClick={() => void turnOff()} /></HStack>
        ) : <Button label={t('pushOff')} className="min-h-11 self-start" isDisabled={busy || state === 'checking'} onClick={() => void turnOn()} />}
      {failed ? <Text role="alert" type="supporting">{t('pushError')}</Text> : null}
    </VStack>
  );
}

/** Task 9: notification preferences: channels, quiet hours, language, and Web Push for this device. */
export function NotificationPreferences({ initial }: { initial: PreferencesData }) {
  const t = useTranslations('messaging.preferences');
  const stored = initial.preferences;
  const [email, setEmail] = useState(initial.effective.channels.email);
  const [webpush, setWebpush] = useState(initial.effective.channels.webpush);
  const [quiet, setQuiet] = useState(Boolean(stored.quietHours));
  const [start, setStart] = useState<ISOTimeString | undefined>(createISOTimeString(stored.quietHours?.start ?? '22:00') ?? undefined);
  const [end, setEnd] = useState<ISOTimeString | undefined>(createISOTimeString(stored.quietHours?.end ?? '07:00') ?? undefined);
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number]>(stored.locale ?? 'default');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const clocksValid = !quiet || (start !== undefined && end !== undefined);

  async function save() {
    if (!clocksValid) { setStatus('error'); return; }
    setStatus('saving');
    try {
      await requestJson('/api/v1/notifications/preferences', 'PUT', {
        channels: { email, webpush },
        quietHours: quiet && start && end ? { start: start.slice(0, 5), end: end.slice(0, 5) } : null,
        locale: language === 'default' ? null : language,
      });
      setStatus('saved');
    } catch { setStatus('error'); }
  }

  return (
    <VStack as="section" gap={4} className="min-w-0 max-w-full rounded-2xl border p-4">
      <VStack gap={1}>
        <Heading level={2}>{t('title')}</Heading>
        <Text type="supporting">{t('subtitle')}</Text>
      </VStack>
      <VStack gap={2} className="min-w-0">
        <Heading level={3}>{t('channelsHeading')}</Heading>
        <Text type="supporting">{t('inapp')}: {t('inappNote')}</Text>
        <Switch label={t('email')} value={email} onChange={setEmail} />
        <Switch label={t('webpush')} value={webpush} onChange={setWebpush} />
      </VStack>
      <PushControl publicKey={initial.pushPublicKey} />
      <VStack gap={2} className="min-w-0">
        <Heading level={3}>{t('quietHeading')}</Heading>
        <Text type="supporting">{t('quietNote')}</Text>
        <Switch label={t('quietEnabled')} value={quiet} onChange={setQuiet} />
        {quiet ? (
          <HStack gap={3} wrap="wrap" className="min-w-0">
            <TimeInput label={t('quietStart')} value={start} onChange={setStart} />
            <TimeInput label={t('quietEnd')} value={end} onChange={setEnd} />
          </HStack>
        ) : null}
      </VStack>
      <Selector label={t('languageLabel')} value={language} onChange={value => setLanguage(LANGUAGES.find(item => item === value) ?? 'default')}
        options={[{ value: 'default', label: t('languageDefault') }, { value: 'ar', label: t('languageAr') }, { value: 'en', label: t('languageEn') }]} />
      <HStack gap={3} wrap="wrap" align="center">
        <Button label={status === 'saving' ? t('saving') : t('save')} variant="primary" className="min-h-11" isDisabled={status === 'saving'} onClick={() => void save()} />
        {status === 'saved' ? <Text role="status">{t('saved')}</Text> : null}
        {status === 'error' ? <Text role="alert">{t('saveError')}</Text> : null}
      </HStack>
    </VStack>
  );
}
