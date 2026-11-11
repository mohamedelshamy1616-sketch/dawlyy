'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Utensils } from 'lucide-react';
import type { LocalizedText, Macros } from '@dawlyy/core/types';
import { targetsDelta } from '@dawlyy/core/nutrition';
import { EmptyState } from '@/src/components/shell/empty-state';
import { Input } from '@/components/ui/input';
import type { ReactNode } from 'react';

/** Task 6: logical, full-width native selector shared by nutrition editors. */
export const selectClass = 'min-h-11 min-w-0 max-w-full rounded-md border bg-background px-3 text-start';
/** Task 6: localized user-authored content with alternate-language fallback. */
export function foodText(value: LocalizedText | null | undefined, locale: string) { return (locale === 'ar' ? value?.ar || value?.en : value?.en || value?.ar) ?? ''; }
/** Task 6: labelled field with a 44px input. */
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid min-w-0 gap-1 text-sm">{label}{children}</label>; }
/** Task 6: empty states always explain why a list is empty. */
export function NutritionEmpty({ action }: { action?: ReactNode }) { const t = useTranslations('nutrition'); return <EmptyState Icon={Utensils} title={t('common.empty')} description={t('common.emptyHint')} action={action} />; }
/** Task 6 / G5: macro display takes only core-computed totals and deltas. */
export function MacroBar({ macros, targets }: { macros: Macros; targets?: Macros }) {
  const t = useTranslations('nutrition'); const locale = useLocale(); const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }); const delta = targets ? targetsDelta(targets, macros) : null;
  return <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-3 sm:grid-cols-4" aria-live="polite">{(['kcal', 'proteinG', 'carbsG', 'fatG'] as const).map(key => <div key={key} className="min-w-0"><span className="block text-xs text-muted-foreground">{t(`macros.${key}`)}</span><strong className="tabular-nums">{n.format(macros[key])}</strong>{targets && <span className="ms-1 text-xs">{t('macros.of', { value: n.format(targets[key]) })}</span>}{delta && <span className="block text-xs">{t('macros.delta', { value: n.format(delta[key]) })}</span>}</div>)}</div>;
}
/** Task 6: bilingual text editing preserves the other locale. */
export function BilingualField({ label, value, onChange, disabled }: { label: string; value?: LocalizedText; onChange: (v: LocalizedText) => void; disabled?: boolean }) {
  const t = useTranslations('nutrition'); return <div className="grid min-w-0 gap-2 sm:grid-cols-2">{(['ar', 'en'] as const).map(lang => <Field key={lang} label={`${label} · ${t(`common.${lang}`)}`}><Input className="min-h-11 min-w-0" dir={lang === 'ar' ? 'rtl' : 'ltr'} disabled={disabled} value={value?.[lang] ?? ''} onChange={e => onChange({ ...value, [lang]: e.target.value })} /></Field>)}</div>;
}
/** Task 6: publishing status reuses the shared status namespace. */
export function NutritionStatus({ status }: { status: string }) {
  const t = useTranslations('status'); return <span className="rounded-full bg-muted px-3 py-1 text-sm">{t(status === 'published' ? 'published' : status === 'draft' ? 'draft' : status === 'archived' ? 'expired' : 'needsReview')}</span>;
}
