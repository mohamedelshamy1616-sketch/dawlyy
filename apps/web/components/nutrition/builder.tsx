'use client';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { addMacros, itemMacros } from '@dawlyy/core/nutrition';
import type { MealItem, NutritionDocument, NutritionTargets } from '@dawlyy/core/types';
import { Button } from '@astryxdesign/core/Button';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Link, useRouter } from '@/i18n/navigation';
import { documentTotals, foodMap, validateDraft, type NutritionFood } from '@/src/server/nutrition/helpers';
import { BilingualField, foodText, MacroBar, NutritionEmpty, NutritionStatus, NutritionNumberInput, NutritionTextInput as TextInput } from './shared';
import { FoodPicker } from './food-picker';
import { MealEditor } from './meal-editor';
import { SupplementList } from './supplement-list';
import { NutritionRequestError, nutritionRequest } from './transport';
import type { NutritionDetail, NutritionGrants } from './types';
import { ArchiveRowControl } from '@/components/control/archive-controls';

/** Task 6: atomic document editing with serial debounced saves and explicit immutable-version drafts. */
export function NutritionBuilder({ initial, grants }: { initial: NutritionDetail; grants: NutritionGrants }) {
  const pickerDescriptionId = useId(); const publishDescriptionId = useId();
  const t = useTranslations('nutrition'); const locale = useLocale(); const router = useRouter(); const [document, setDocument] = useState(initial.currentVersion.document); const latest = useRef(document);
  const [saved, setSaved] = useState(initial); const savedRef = useRef(initial); const [foods, setFoods] = useState(initial.foods);
  const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [stale, setStale] = useState(false);
  const [picker, setPicker] = useState<{ mealId?: string; optionId?: string; swapId?: string } | null>(null); const [rule, setRule] = useState<'protein' | 'carbs' | 'fat' | 'kcal'>('kcal');
  const [publishOpen, setPublishOpen] = useState(false); const [changeNote, setChangeNote] = useState(''); const [name, setName] = useState(initial.head.name); const [tags, setTags] = useState(initial.head.tags.join(', '));
  const flight = useRef<Promise<boolean> | null>(null); const id = initial.head.id; const readOnly = saved.currentVersion.status !== 'draft' || !grants.edit || stale;
  const fail = useCallback((e: unknown) => { setError(t(e instanceof NutritionRequestError && e.code === 'stale_draft' ? 'errors.stale_draft' : e instanceof NutritionRequestError && e.code === 'nothing_to_publish' ? 'errors.nothing_to_publish' : 'errors.request')); if (e instanceof NutritionRequestError && e.status === 409) setStale(true); }, [t]);
  const flush = useCallback(async (): Promise<boolean> => {
    if (flight.current) return flight.current;
    const snapshot = latest.current; if (snapshot === savedRef.current.currentVersion.document) return true;
    if (!validateDraft(snapshot).success) { setError(t('errors.plan_invalid')); return false; }
    const work = (async () => {
      setBusy(true); setError('');
      try {
        const response = await nutritionRequest<NutritionDetail>(`/api/v1/nutrition/${id}/draft`, { method: 'PUT', body: { document: snapshot, baseVersionNo: savedRef.current.currentVersion.versionNo, baseRevision: savedRef.current.revision } });
        savedRef.current = response; setSaved(response);
        if (latest.current === snapshot) { latest.current = response.currentVersion.document; setDocument(response.currentVersion.document); setDirty(false); }
        return true;
      } catch (e) { fail(e); return false; } finally { flight.current = null; setBusy(false); }
    })(); flight.current = work; return work;
  }, [fail, id, t]);
  useEffect(() => { if (!dirty || readOnly || busy) return; const timer = setTimeout(() => { void flush(); }, 850); return () => clearTimeout(timer); }, [document, dirty, busy, readOnly, flush]);
  useEffect(() => { if (!dirty) return; const listener = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', listener); return () => window.removeEventListener('beforeunload', listener); }, [dirty]);
  function edit(fn: (copy: NutritionDocument) => void) { if (readOnly) return; const copy = structuredClone(latest.current); fn(copy); latest.current = copy; setDocument(copy); setDirty(true); }
  let totals: ReturnType<typeof documentTotals> | null = null; try { totals = documentTotals(document, foods); } catch { /* An incomplete edit is shown and cannot publish. */ }
  async function pick(food: NutritionFood) {
    const target = picker; if (!target) return; setFoods(previous => [...previous.filter(f => f.id !== food.id), food]);
    if (target.swapId) {
      const old = document.meals.flatMap(m => m.options.flatMap(o => o.items)).find(i => i.id === target.swapId); const source = old && foodMap(foods).get(old.foodId); if (!old || !source) return;
      try { const grams = itemMacros(source, old).grams; const response = await nutritionRequest<{ grams: number; withinTolerance: boolean }>('/api/v1/nutrition/substitute', { method: 'POST', body: { foodId: old.foodId, toFoodId: food.id, grams, rule } });
        edit(copy => { const item = copy.meals.flatMap(m => m.options.flatMap(o => o.items)).find(i => i.id === old.id); if (item) { item.foodId = food.id; item.quantity = response.grams; item.measure = { kind: 'g' }; item.rawOrCooked = food.rawOrCooked === 'raw' || food.rawOrCooked === 'cooked' ? food.rawOrCooked : undefined; item.approx = false; delete item.grams; } }); if (!response.withinTolerance) setError(t('builder.tolerance'));
      } catch (e) { fail(e); } setPicker(null); return;
    }
    const item: MealItem = { id: crypto.randomUUID(), foodId: food.id, quantity: 100, measure: { kind: 'g' }, approx: false };
    edit(copy => { if (target.optionId) { const option = copy.meals.flatMap(m => m.options).find(o => o.id === target.optionId); option?.items.push(item); } else copy.meals.push({ id: crypto.randomUUID(), name: { [locale === 'ar' ? 'ar' : 'en']: t('builder.newMeal') }, options: [{ id: crypto.randomUUID(), items: [item] }] }); }); setPicker(null);
  }
  async function createDraft() { setBusy(true); try { const response = await nutritionRequest<NutritionDetail>(`/api/v1/nutrition/${id}/draft`, { method: 'PUT', body: { document, baseVersionNo: saved.currentVersion.versionNo, baseRevision: saved.revision } }); savedRef.current = response; setSaved(response); latest.current = response.currentVersion.document; setDocument(response.currentVersion.document); setDirty(false); } catch (e) { fail(e); } finally { setBusy(false); } }
  // Preserve the former DialogContent close control's accessible name in both locales.
  return <VStack gap={5} className="min-w-0 max-w-full pb-28 [overflow-wrap:anywhere]"><HStack gap={3} wrap="wrap"><Link className="inline-flex min-h-11 items-center underline" href={`/coach/nutrition/${id}/history`}>{t('history.title')}</Link><Link className="inline-flex min-h-11 items-center underline" href={`/coach/nutrition/${id}/assign`}>{t('assign.title')}</Link><Button className="min-h-11" variant="secondary" isDisabled={!grants.create || busy || dirty} onClick={async () => { try { const copy = await nutritionRequest<NutritionDetail>(`/api/v1/nutrition/${id}/duplicate`, { method: 'POST' }); router.push(`/coach/nutrition/${copy.head.id}`); } catch (e) { fail(e); } }} label={t('builder.duplicate')} /></HStack>
    {readOnly && <Card padding={4}><VStack gap={0}><Text as="p">{t('builder.readOnly')}</Text>{grants.edit && !stale && <Button variant="primary" className="mt-2 min-h-11" isDisabled={busy} onClick={() => void createDraft()} label={t('builder.newDraft')} />}</VStack></Card>}
    {error && <Text as="p" role="alert" className="rounded-xl border border-destructive p-3">{error}</Text>}
    <details><summary className="min-h-11 cursor-pointer py-3">{t('builder.metadata')}</summary><VStack gap={3}><BilingualField label={t('common.name')} value={name} disabled={!grants.edit} onChange={setName} /><TextInput label={t('builder.tags')} containerClassName="min-w-0" controlClassName="min-h-11" isDisabled={!grants.edit} value={tags} onChange={(_, e) => setTags(e.target.value)} /><Button variant="primary" className="min-h-11" isDisabled={!grants.edit || busy} onClick={async () => { try { await nutritionRequest(`/api/v1/nutrition/${id}`, { method: 'PATCH', body: { name, tags: tags.split(',').map(s => s.trim()).filter(Boolean) } }); } catch (e) { fail(e); } }} label={t('common.save')} /><ArchiveRowControl entity="nutrition" id={id} archived={Boolean(saved.head.archivedAt)} canEdit={grants.edit} itemLabel={foodText(saved.head.name, locale)} onChanged={() => { void nutritionRequest<NutritionDetail>(`/api/v1/nutrition/${id}`).then(response => { setSaved(response); savedRef.current = response; }).catch(fail); }} /></VStack></details>
    <Targets value={document.targets} disabled={readOnly} onChange={targets => edit(copy => { copy.targets = targets; })} />
    <details><summary className="min-h-11 cursor-pointer py-3">{t('builder.dayTargets')}</summary><CheckboxInput ref={input => { if (input) input.disabled = readOnly; }} className="min-h-11" label={t('builder.dayTargets')} isDisabled={readOnly} value={!!document.dayTypes} onChange={checked => edit(copy => { if (checked) copy.dayTypes = { training: { ...copy.targets }, rest: { ...copy.targets } }; else delete copy.dayTypes; })} />{document.dayTypes && (['training', 'rest'] as const).map(kind => <VStack gap={0} key={kind}><Heading level={3}>{t(`client.${kind}`)}</Heading><Targets value={document.dayTypes![kind]} disabled={readOnly} onChange={targets => edit(copy => { if (copy.dayTypes) copy.dayTypes[kind] = targets; })} /></VStack>)}</details>
    {!document.meals.length && <NutritionEmpty action={<Button variant="primary" className="min-h-11" isDisabled={readOnly} onClick={() => setPicker({})} label={t('builder.addMeal')} />} />}
    {document.meals.map((meal, index) => <VStack gap={2} className="min-w-0" key={meal.id}><MealEditor meal={meal} foods={foods} disabled={readOnly} onChange={value => edit(copy => { copy.meals[index] = value; })} onAddFood={optionId => setPicker({ mealId: meal.id, optionId })} onSwap={item => setPicker({ mealId: meal.id, swapId: item.id })} />{totals?.perMeal.find(m => m.mealId === meal.id)?.options.map(o => <VStack gap={0} key={o.optionId}><Text as="p" className="text-sm">{foodText(meal.options.find(x => x.id === o.optionId)?.name, locale) || t('builder.optionTotal')}</Text><MacroBar macros={o.macros} /></VStack>)}<MacroBar macros={totals?.perMeal.find(m => m.mealId === meal.id)?.total ?? addMacros()} /><HStack gap={2} wrap="wrap"><Button className="min-h-11" variant="secondary" isDisabled={readOnly || index === 0} onClick={() => edit(copy => { [copy.meals[index - 1], copy.meals[index]] = [copy.meals[index]!, copy.meals[index - 1]!]; })} label={t('common.up')} /><Button className="min-h-11" variant="secondary" isDisabled={readOnly || index === document.meals.length - 1} onClick={() => edit(copy => { [copy.meals[index + 1], copy.meals[index]] = [copy.meals[index]!, copy.meals[index + 1]!]; })} label={t('common.down')} /><Button className="min-h-11" variant="secondary" isDisabled={readOnly} onClick={() => edit(copy => { copy.meals.splice(index, 1); copy.supplements = copy.supplements.map(s => s.mealId === meal.id ? { ...s, mealId: undefined } : s); })} label={t('common.remove')} /></HStack></VStack>)}
    <Button className="min-h-11" variant="secondary" isDisabled={readOnly} onClick={() => setPicker({})} label={t('builder.addMeal')} />
    <Dialog width="32rem" maxHeight="85dvh" aria-describedby={pickerDescriptionId} isOpen={!!picker} onOpenChange={open => { if (!open) setPicker(null); }}><VStack gap={4}><DialogHeader title={picker?.swapId ? t('builder.swap') : t('builder.addFood')} subtitle={<Text id={pickerDescriptionId}>{t('foods.search')}</Text>} endContent={<Button label="Close" tooltip={t('common.close')} isIconOnly icon={<X aria-hidden="true" />} variant="ghost" className="min-h-11 min-w-11" onClick={() => setPicker(null)} />} />{picker?.swapId && <Selector label="" isLabelHidden containerClassName="min-w-0" controlClassName="min-h-11" value={rule} onChange={value => setRule(value as typeof rule)} options={(['kcal', 'protein', 'carbs', 'fat'] as const).map(value => ({ value, label: t(`swapRules.${value}`) }))} />}<FoodPicker onPick={f => void pick(f)} disabled={readOnly} /></VStack></Dialog>
    <SupplementList items={document.supplements} disabled={readOnly} onChange={items => edit(copy => { copy.supplements = items; })} />
    <NutritionNumberInput label={t('builder.freeMeals')} className="min-h-11" disabled={readOnly} min="0" value={document.freeMealRule?.perWeek ?? 0} onChange={e => edit(copy => { copy.freeMealRule = { ...copy.freeMealRule, perWeek: Math.max(0, Math.floor(Number(e.target.value))) }; })} /><BilingualField label={t('builder.freeNote')} value={document.freeMealRule?.note} disabled={readOnly} onChange={note => edit(copy => { copy.freeMealRule = { perWeek: copy.freeMealRule?.perWeek ?? 0, note }; })} /><BilingualField label={t('builder.instructions')} value={document.instructions} disabled={readOnly} onChange={instructions => edit(copy => { copy.instructions = instructions; })} /><TextInput label={t('builder.allergens')} containerClassName="min-w-0" controlClassName="min-h-11" isDisabled={readOnly} value={document.allergens.join(', ')} onChange={(_, e) => edit(copy => { copy.allergens = e.target.value.split(',').map(v => v.trim()).filter(Boolean); })} />
    <Card padding={3} className="sticky bottom-16 z-10 min-w-0 shadow-sm"><VStack gap={2}><MacroBar macros={totals?.total ?? addMacros()} targets={document.targets} /><HStack gap={2} wrap="wrap" align="center" ><NutritionStatus status={saved.currentVersion.status} /><Text>{t('builder.version', { value: new Intl.NumberFormat(locale).format(saved.currentVersion.versionNo) })}</Text><Text role="status">{busy ? t('common.saving') : dirty ? t('builder.unsaved') : t('common.saved')}</Text><Button variant="primary" className="min-h-11" isDisabled={readOnly || busy || !dirty} onClick={() => void flush()} label={t('common.save')} /><Button variant="primary" className="min-h-11" isDisabled={!grants.publish || busy || stale || readOnly || !document.meals.length} onClick={() => setPublishOpen(true)} label={t('builder.publish')} /></HStack></VStack></Card>
    <Dialog width="32rem" maxHeight="85dvh" aria-describedby={publishDescriptionId} isOpen={publishOpen} onOpenChange={setPublishOpen}><VStack gap={4}><DialogHeader title={t('builder.publish')} subtitle={<Text id={publishDescriptionId}>{t('builder.publishHint')}</Text>} endContent={<Button label="Close" tooltip={t('common.close')} isIconOnly icon={<X aria-hidden="true" />} variant="ghost" className="min-h-11 min-w-11" onClick={() => setPublishOpen(false)} />} /><TextArea ref={input => { if (input) input.maxLength = 4000; }} label={t('common.note')} value={changeNote} onChange={setChangeNote} maxLength={4000} containerClassName="min-w-0" controlClassName="min-h-11" />{saved.issues.map((issue, i) => <Text as="p" key={i}>{t(`issues.${issue.code === 'food_hidden' ? 'food_hidden' : issue.code === 'food_unknown' ? 'food_unknown' : 'targets_or_meals_missing'}`)}</Text>)}<Button variant="primary" className="min-h-11" isDisabled={busy} onClick={async () => { if (!await flush()) return; setBusy(true); try { await nutritionRequest(`/api/v1/nutrition/${id}/publish`, { method: 'POST', body: { changeNote, baseVersionNo: savedRef.current.currentVersion.versionNo, baseRevision: savedRef.current.revision } }); const response = await nutritionRequest<NutritionDetail>(`/api/v1/nutrition/${id}`); savedRef.current = response; setSaved(response); setPublishOpen(false); } catch (e) { fail(e); } finally { setBusy(false); } }} label={t('builder.publish')} /></VStack></Dialog>
  </VStack>;
}

function Targets({ value, disabled, onChange }: { value: NutritionTargets; disabled: boolean; onChange: (v: NutritionTargets) => void }) {
  const t = useTranslations('nutrition'); return <Grid gap={3} className="min-w-0 grid-cols-2! sm:grid-cols-3!">{(['kcal', 'proteinG', 'carbsG', 'fatG', 'waterMl', 'steps'] as const).map(key => <NutritionNumberInput key={key} label={t(`macros.${key}`)} className="min-h-11 min-w-0" min="0" step={key === 'steps' ? '1' : '0.1'} value={value[key] ?? ''} disabled={disabled} onChange={e => onChange({ ...value, [key]: Math.max(0, Number(e.target.value)) })} />)}</Grid>;
}
