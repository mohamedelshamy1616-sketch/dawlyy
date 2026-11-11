'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Utensils } from 'lucide-react';
import type { LocalizedText, Macros } from '@dawlyy/core/types';
import { targetsDelta } from '@dawlyy/core/nutrition';
import { EmptyState } from '@/src/components/shell/empty-state';
import { Card } from '@astryxdesign/core/Card';
import { Field as AstryxField } from '@astryxdesign/core/Field';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { TextInput, type TextInputProps } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

/** Task 6: logical, full-width native selector shared by nutrition editors. */
export const selectClass = 'min-h-11 min-w-0 max-w-full rounded-md border bg-background px-3 text-start';
/** Task 6: localized user-authored content with alternate-language fallback. */
export function foodText(value: LocalizedText | null | undefined, locale: string) { return (locale === 'ar' ? value?.ar || value?.en : value?.en || value?.ar) ?? ''; }
/** Task 6: labelled field with a 44px input. */
export function Field({ label, children }: { label: string; children: ReactNode }) { return <VStack as="label" gap={1} className="min-w-0"><Text type="label">{label}</Text>{children}</VStack>; }
/** P5 nutrition: Astryx text input retaining native disabled, required and maxlength semantics. */
export function NutritionTextInput({ isDisabled, isRequired, maxLength, ...props }: Omit<TextInputProps, 'ref'> & { maxLength?: number }) {
  return <TextInput {...props} isDisabled={isDisabled} isRequired={isRequired} ref={input => {
    if (!input) return;
    input.disabled = isDisabled ?? false;
    input.required = isRequired ?? false;
    if (maxLength !== undefined) input.maxLength = maxLength;
  }} />;
}
/** P5 nutrition: Astryx field with native live numeric editing and HTML constraint validation. */
export function NutritionNumberInput({ label, id: inputId, className = '', disabled, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  const generatedId = useId(); const id = inputId ?? generatedId;
  // Astryx NumberInput commits on blur; nutrition drafts need every native change for debounced saves.
  return <AstryxField label={label} inputID={id} isDisabled={disabled} className="min-w-0"><input {...props} id={id} type="number" disabled={disabled} className={`min-h-11 min-w-0 max-w-full w-full rounded-md border bg-background px-3 text-start text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${className}`} /></AstryxField>;
}
/** Task 6: empty states always explain why a list is empty. */
export function NutritionEmpty({ action }: { action?: ReactNode }) { const t = useTranslations('nutrition'); return <EmptyState Icon={Utensils} title={t('common.empty')} description={t('common.emptyHint')} action={action} />; }
/** Task 6 / G5: macro display takes only core-computed totals and deltas. */
export function MacroBar({ macros, targets }: { macros: Macros; targets?: Macros }) {
  const t = useTranslations('nutrition'); const locale = useLocale(); const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }); const delta = targets ? targetsDelta(targets, macros) : null;
  return <Card variant="muted" padding={3}><Grid columns={2} gap={2} className="sm:grid-cols-4!" aria-live="polite">{(['kcal', 'proteinG', 'carbsG', 'fatG'] as const).map(key => <VStack key={key} gap={0} className="min-w-0"><Text type="supporting">{t(`macros.${key}`)}</Text><Text><strong className="tabular-nums">{n.format(macros[key])}</strong>{targets && <Text className="ms-1" type="supporting">{t('macros.of', { value: n.format(targets[key]) })}</Text>}</Text>{delta && <Text type="supporting">{t('macros.delta', { value: n.format(delta[key]) })}</Text>}</VStack>)}</Grid></Card>;
}
/** Task 6: bilingual text editing preserves the other locale. */
export function BilingualField({ label, value, onChange, disabled }: { label: string; value?: LocalizedText; onChange: (v: LocalizedText) => void; disabled?: boolean }) {
  const t = useTranslations('nutrition'); return <Grid gap={2} className="min-w-0 sm:grid-cols-2!">{(['ar', 'en'] as const).map(lang => <NutritionTextInput key={lang} label={`${label} · ${t(`common.${lang}`)}`} containerClassName="min-w-0" controlClassName="min-h-11 min-w-0" dir={lang === 'ar' ? 'rtl' : 'ltr'} isDisabled={disabled} value={value?.[lang] ?? ''} onChange={text => onChange({ ...value, [lang]: text })} />)}</Grid>;
}
/** Task 6: publishing status reuses the shared status namespace. */
export function NutritionStatus({ status }: { status: string }) {
  const t = useTranslations('status'); return <Text type="supporting" className="rounded-full bg-muted px-3 py-1">{t(status === 'published' ? 'published' : status === 'draft' ? 'draft' : status === 'archived' ? 'expired' : 'needsReview')}</Text>;
}
