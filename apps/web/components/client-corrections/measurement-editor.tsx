'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack } from '@astryxdesign/core/HStack';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useClientModules } from '@/components/client-today/client-module-provider';
import { formatNumber, numberLocale } from '@/src/lib/numbers';
import type { MeasurementHistoryRow, MeasurementValue } from '@/src/lib/client-corrections/types';
import { CorrectionError, measurementCorrection } from '@/src/lib/client-corrections/transport';
import { correctionEligibility } from '@/src/lib/client-corrections/eligibility';
import { useDeferredEntryMutation } from './entry-actions';

/** One immutable replacement preserves every original type/side pair that the client leaves alone. */
export function MeasurementEditor({ row, onClose, onChanged, onPendingChange }: {
  row: MeasurementHistoryRow; onClose: () => void; onChanged: () => void; onPendingChange?: (pending: boolean) => void;
}) {
  const t = useTranslations('clientCorrections'); const locale = numberLocale(useLocale());
  const { modules, numerals } = useClientModules();
  const [values, setValues] = useState<Array<Omit<MeasurementValue, 'value'> & { value: number | null }>>(() => row.values.map(item => ({ ...item })));
  const [invalid, setInvalid] = useState(false); const [now, setNow] = useState(() => Date.now());
  const operation = useRef<ReturnType<typeof measurementCorrection> | null>(null);
  const action = useDeferredEntryMutation(onChanged, onPendingChange);
  const valid = (action.retryable || correctionEligibility(row.createdAt, now, row.voidedAt).eligible) && !row.voidedAt && !!row.id && values.length > 0 && values.length <= 50 && values.every(item => item.type.trim().length > 0 && item.type.trim().length <= 80 && item.value !== null && Number.isFinite(item.value) && item.value > 0 && item.value <= 10000)
    && new Set(values.map(item => `${item.type.trim()}:${item.side ?? ''}`)).size === values.length;
  const locked = action.pending || action.retryable;
  function change(index: number, patch: Partial<(typeof values)[number]>) { if (!locked) setValues(current => current.map((item, i) => i === index ? { ...item, ...patch } : item)); }
  function save() {
    const observedNow = Date.now(); setNow(observedNow);
    if (!action.retryable && !correctionEligibility(row.createdAt, observedNow, row.voidedAt).eligible) { setInvalid(true); return; }
    if (!valid) { setInvalid(true); return; }
    if (!operation.current) operation.current = measurementCorrection(row.id, { localDate: row.localDate, clientUuid: crypto.randomUUID(), clientUpdatedAt: new Date().toISOString(), values: values.map(item => ({ ...item, type: item.type.trim(), value: item.value! })) }, crypto.randomUUID());
    void action.start(operation.current, t('editedToast'), onClose).then(result => {
      if (result?.status === 'failed' && result.error instanceof CorrectionError && !result.error.retryable) operation.current = null;
    });
  }
  if (!modules?.measurements) return null;
  return <Dialog isOpen onOpenChange={open => { if (!open && !action.pending) onClose(); }} aria-label={t('measurement.title')} data-testid="measurement-editor">
    <VStack gap={4} className="min-w-0 max-w-full"><DialogHeader title={t('measurement.title')} subtitle={t('editHint')} />
      {!values.length ? <Text>{t('measurement.empty')}</Text> : values.map((item, index) => <VStack gap={2} key={index} className="min-w-0 border-b border-border pb-3">
        <Text>{t('measurement.entry', { count: formatNumber(index + 1, { locale, numerals }) })}</Text>
        <TextInput label={t('measurement.type')} value={item.type} onChange={type => change(index, { type })} controlClassName="min-h-11" />
        <NumberInput label={t('measurement.value')} value={item.value} min={0} max={10000} onChange={value => change(index, { value })} controlClassName="min-h-11" />
        <Selector label={t('measurement.unit')} value={item.unit} options={(['cm', 'in'] as const).map(value => ({ value, label: t(`units.${value}`) }))} onChange={unit => change(index, { unit: unit as MeasurementValue['unit'] })} controlClassName="min-h-11" />
        <Selector label={t('measurement.side')} value={item.side ?? 'none'} options={['none', 'left', 'right'].map(value => ({ value, label: t(`measurement.${value}`) }))} onChange={side => change(index, { side: side === 'none' ? undefined : side as 'left' | 'right' })} controlClassName="min-h-11" />
      </VStack>)}
      {!action.retryable && !correctionEligibility(row.createdAt, now, row.voidedAt).eligible ? <Text role="status">{t('unavailable')}</Text> : null}
      {invalid || !valid ? <Text role="alert">{t('measurement.validation')}</Text> : null}
      {action.error ? <Text role="alert">{t(action.error)}</Text> : null}{action.pending ? <Text role="status">{t('pending')}</Text> : null}
      <HStack gap={2} wrap="wrap"><Button label={t(action.error ? 'retry' : 'save')} className="min-h-11" isDisabled={action.pending || !valid} onClick={save} /><Button label={t('cancel')} className="min-h-11" variant="secondary" isDisabled={action.pending} onClick={onClose} /></HStack>
    </VStack>
  </Dialog>;
}
