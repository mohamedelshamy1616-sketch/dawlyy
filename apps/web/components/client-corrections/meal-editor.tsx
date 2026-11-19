'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { localize } from '@dawlyy/core/types';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack } from '@astryxdesign/core/HStack';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { VStack } from '@astryxdesign/core/VStack';
import type { ClientNutrition } from '@/components/nutrition/types';
import { useClientModules } from '@/components/client-today/client-module-provider';
import type { MealHistoryRow, MealWrite } from '@/src/lib/client-corrections/types';
import { CorrectionError, mealCorrection } from '@/src/lib/client-corrections/transport';
import { formatNumber } from '@/src/lib/numbers';
import { correctionEligibility } from '@/src/lib/client-corrections/eligibility';
import { useDeferredEntryMutation } from './entry-actions';

/** Historic planned IDs stay explicit; converting a removed plan entry requires a client choice. */
export function MealEditor({ row, plan, onClose, onChanged, onPendingChange }: {
  row: MealHistoryRow; plan: ClientNutrition | null; onClose: () => void; onChanged: () => void; onPendingChange?: (pending: boolean) => void;
}) {
  const t = useTranslations('clientCorrections'); const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const { modules, numerals } = useClientModules();
  const [status, setStatus] = useState(row.status === 'partial' || row.status === 'skipped' ? row.status : 'eaten');
  const [mealId, setMealId] = useState(row.mealId ?? ''); const [optionId, setOptionId] = useState(row.optionId ?? '');
  const [free, setFree] = useState(!!row.freeEntry); const [text, setText] = useState(row.freeEntry?.text ?? ''); const [note, setNote] = useState(row.note ?? '');
  const [invalid, setInvalid] = useState(false); const [now, setNow] = useState(() => Date.now());
  const operation = useRef<ReturnType<typeof mealCorrection> | null>(null);
  const action = useDeferredEntryMutation(onChanged, onPendingChange);
  const meals = plan?.version?.document.meals ?? [];
  const meal = meals.find(item => item.id === mealId);
  const plannedExists = !!meal && (!optionId || meal.options.some(item => item.id === optionId));
  const valid = (action.retryable || correctionEligibility(row.createdAt, now, row.voidedAt).eligible) && !row.voidedAt && !!row.id && note.length <= 4000 && (free ? text.trim().length > 0 && text.trim().length <= 4000 : plannedExists);
  function save() {
    const observedNow = Date.now(); setNow(observedNow);
    if (!action.retryable && !correctionEligibility(row.createdAt, observedNow, row.voidedAt).eligible) { setInvalid(true); return; }
    if (!valid) { setInvalid(true); return; }
    if (!operation.current) {
      const body: MealWrite = { clientUuid: crypto.randomUUID(), localDate: row.localDate, status: status as MealWrite['status'], clientUpdatedAt: new Date().toISOString(), ...(note ? { note } : {}),
        ...(free ? { freeEntry: { text: text.trim(), ...(text.trim() === row.freeEntry?.text?.trim() && row.freeEntry.macros ? { macros: row.freeEntry.macros } : {}) } } : { mealId, ...(optionId ? { optionId } : {}) }) };
      operation.current = mealCorrection(row.id, body, crypto.randomUUID());
    }
    void action.start(operation.current, t('editedToast'), onClose).then(result => {
      if (result?.status === 'failed' && result.error instanceof CorrectionError && !result.error.retryable) operation.current = null;
    });
  }
  const locked = action.pending || action.retryable;
  if (!modules?.nutrition) return null;
  return <Dialog isOpen={!action.pending} onOpenChange={open => { if (!open && !action.pending) onClose(); }} aria-label={t('meal.title')} data-testid="meal-editor">
    <VStack gap={4} className="min-w-0 max-w-full">
      <DialogHeader title={t('meal.title')} subtitle={t('editHint')} />
      {!free && !plannedExists ? <><Text role="status">{t('meal.removedPlan')}</Text><Button label={t('meal.useFreeEntry')} className="min-h-11" variant="secondary" onClick={() => { setFree(true); setText(''); }} /></> : null}
      {free ? <TextArea label={t('meal.text')} value={text} onChange={value => { if (!locked) setText(value); }} maxLength={4000} controlClassName="min-h-11" /> : plannedExists ? <>
        <Selector label={t('meal.name')} value={mealId} options={meals.map(item => ({ value: item.id, label: localize(item.name, locale) }))} onChange={value => { if (!locked) { setMealId(value); setOptionId(''); } }} controlClassName="min-h-11" />
        {meal ? <Selector label={t('meal.option')} value={optionId} options={[{ value: '', label: t('meal.defaultOption') }, ...meal.options.map((item, index) => ({ value: item.id, label: localize(item.name, locale) || t('meal.optionNumber', { count: formatNumber(index + 1, { locale, numerals }) }) }))]} onChange={value => { if (!locked) setOptionId(value); }} controlClassName="min-h-11" /> : null}
      </> : null}
      <Selector label={t('meal.status')} value={status} options={['eaten', 'skipped', 'partial'].map(value => ({ value, label: t(`meal.${value}`) }))} onChange={value => { if (!locked) setStatus(value); }} controlClassName="min-h-11" />
      <TextArea label={t('meal.note')} value={note} onChange={value => { if (!locked) setNote(value); }} maxLength={4000} controlClassName="min-h-11" />
      {!action.retryable && !correctionEligibility(row.createdAt, now, row.voidedAt).eligible ? <Text role="status">{t('unavailable')}</Text> : null}
      {invalid ? <Text role="alert">{t('validation')}</Text> : null}
      {action.error ? <Text role="alert">{t(action.error)}</Text> : null}
      {action.pending ? <Text role="status">{t('pending')}</Text> : null}
      <HStack gap={2} wrap="wrap"><Button label={t(action.error ? 'retry' : 'save')} className="min-h-11" isDisabled={action.pending || !valid} onClick={save} /><Button label={t('cancel')} variant="secondary" className="min-h-11" isDisabled={action.pending} onClick={onClose} /></HStack>
    </VStack>
  </Dialog>;
}

