'use client';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';

/** Task 5 / G3: wall-clock rest countdown survives background throttling; vibration is optional. */
export function RestTimer({ deadline, onChange }: { deadline: number | null; onChange: (value: number | null) => void }) {
  const t = useTranslations('workout'); const locale = useLocale(); const [now, setNow] = useState(0);
  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      const time = Date.now(); setNow(time);
      if (time >= deadline) { navigator.vibrate?.([150, 80, 150]); onChange(null); }
    };
    tick(); const timer = setInterval(tick, 250); return () => clearInterval(timer);
  }, [deadline, onChange]);
  const seconds = deadline === null ? 0 : Math.max(0, Math.ceil((deadline - (now || deadline)) / 1000));
  if (deadline === null) return null;
  return <VStack as="aside" className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 shadow-sm" aria-label={t('restTimer')}>
    <Text>{t('restTimer')} <output className="font-mono text-2xl tabular-nums" data-testid="rest-seconds">{new Intl.NumberFormat(locale).format(seconds)}</output></Text>
    <HStack wrap="wrap" gap={2}>
      <Button className="min-h-11" variant="secondary" aria-label={t('lessRest')} label={t('restAdjustment', { value: new Intl.NumberFormat(locale, { signDisplay: 'always' }).format(-15) })} onClick={() => onChange(Math.max(Date.now(), deadline - 15000))} />
      <Button className="min-h-11" variant="secondary" aria-label={t('moreRest')} label={t('restAdjustment', { value: new Intl.NumberFormat(locale, { signDisplay: 'always' }).format(15) })} onClick={() => onChange(deadline + 15000)} />
      <Button className="min-h-11" variant="ghost" onClick={() => onChange(null)} label={t('dismiss')} />
    </HStack>
  </VStack>;
}
