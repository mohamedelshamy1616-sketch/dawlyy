'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { EXERCISE_IMPORT_FIELDS, parseCsv, suggestMapping, missingRequiredMappings, type ColumnMapping } from '@dawlyy/core/csv';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import type { previewImport } from '@/src/server/exercises/import';
import { exerciseRequest, ExerciseRequestError } from './http';

type Preview = ReturnType<typeof previewImport>;
type Summary = { inserted: number; skipped: number; errors: Preview['rows'] };

/** Task 4: upload/paste, mapping, preview and confirmation with a retained commit retry key. */
export function ExerciseImportWizard() {
  const t = useTranslations('exercises');
  const locale = useLocale();
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const [step, setStep] = useState(0);
  const [csv, setCsv] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [onDuplicate, setOnDuplicate] = useState<'skip' | 'import_anyway'>('skip');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef<{ body: string; key: string } | null>(null);
  function report(cause: unknown) {
    setError(cause instanceof ExerciseRequestError && cause.code === 'import_too_large' ? t('errors.importTooLarge') : t('errors.import'));
  }
  function map() {
    setError('');
    try {
      if (new TextEncoder().encode(csv).length > 1_048_576) { setError(t('errors.fileTooLarge')); return; }
      const parsed = parseCsv(csv); setHeaders(parsed.headers); setMapping(suggestMapping(parsed.headers)); setStep(1);
    } catch { setError(t('errors.csv')); }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setError('');
    if (file.size > 1_048_576) { setError(t('errors.fileTooLarge')); return; }
    setBusy(true);
    try { setCsv(await file.text()); } catch { setError(t('errors.csv')); } finally { setBusy(false); }
  }
  async function showPreview() {
    setBusy(true); setError('');
    try {
      const result = await exerciseRequest<Preview>('/import/preview', { method: 'POST', body: { csv, mapping } });
      setPreview(result); setStep(2);
    } catch (cause) { report(cause); } finally { setBusy(false); }
  }
  async function commit() {
    const body = { csv, mapping, onDuplicate };
    const serialized = JSON.stringify(body);
    const previous = key.current;
    const requestKey = previous && previous.body === serialized ? previous.key : crypto.randomUUID();
    key.current = { body: serialized, key: requestKey };
    setBusy(true); setError('');
    try { setSummary(await exerciseRequest<Summary>('/import/commit', { method: 'POST', body, key: requestKey })); }
    catch (cause) { report(cause); } finally { setBusy(false); }
  }
  const steps = ['upload', 'mapping', 'preview', 'confirm'] as const;
  return <div className="flex min-w-0 max-w-full flex-col gap-5">
    <a className="flex min-h-11 items-center underline" href="/api/v1/exercises/import/template" download>{t('wizard.template')}</a>
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">{steps.map((name, index) => <li key={name} aria-current={step === index ? 'step' : undefined} className={`rounded-lg border p-3 ${step === index ? 'bg-brand-soft font-semibold' : ''}`}>{number(index + 1)}. {t(`wizard.${name}`)}</li>)}</ol>
    {error ? <p role="alert">{error}</p> : null}
    {busy ? <p role="status">{t('loading')}</p> : null}
    {summary ? <div className="flex flex-col gap-3 rounded-xl border p-4" role="status"><h2 className="text-xl font-semibold">{t('wizard.result')}</h2><p>{t('wizard.inserted', { count: number(summary.inserted) })}</p><p>{t('wizard.skipped', { count: number(summary.skipped) })}</p><p>{t('wizard.errors', { count: number(summary.errors.length) })}</p><Button asChild className="min-h-11"><Link href="/coach/exercises">{t('back')}</Link></Button></div> : <>
      {step === 0 ? <div className="flex flex-col gap-4"><label>{t('wizard.file')}<Input className="min-h-11" type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => { void upload(event.target.files?.[0]); }} /></label><label>{t('wizard.paste')}<Textarea className="min-h-60 max-w-full" value={csv} onChange={(event) => setCsv(event.target.value)} /></label><Button className="min-h-11" disabled={busy || !csv.trim()} onClick={map}>{t('next')}</Button></div> : null}
      {step === 1 ? <div className="grid min-w-0 gap-3 sm:grid-cols-2">{EXERCISE_IMPORT_FIELDS.map((field) => <label key={field} className="min-w-0">{t(`fields.${field}`)}<select className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3" value={mapping[field] ?? ''} onChange={(event) => { const value = event.target.value; setMapping((previous) => { const next = { ...previous }; if (value === '') delete next[field]; else next[field] = Number(value); return next; }); }}><option value="">{t('wizard.ignore')}</option>{headers.map((header, index) => <option key={index} value={index}>{header}</option>)}</select></label>)}<p className="sm:col-span-2">{missingRequiredMappings(mapping).length ? t('wizard.missingMappings') : t('wizard.mappingReady')}</p><Button className="min-h-11" variant="outline" disabled={busy} onClick={() => setStep(0)}>{t('previous')}</Button><Button className="min-h-11" disabled={busy || missingRequiredMappings(mapping).length > 0} onClick={showPreview}>{t('wizard.preview')}</Button></div> : null}
      {step === 2 && preview ? <div className="flex min-w-0 flex-col gap-4"><p>{t('wizard.counts', { ok: number(preview.counts.ok), duplicate: number(preview.counts.duplicate), error: number(preview.counts.error) })}</p>
        {preview.rows.length === 0 ? <p>{t('wizard.noRows')}</p> : null}
        <ul className="max-h-[55dvh] space-y-2 overflow-y-auto">{preview.rows.map((row) => <li key={row.row} className="min-w-0 break-words rounded-lg border p-3"><p>{t('wizard.row', { row: number(row.row) })} · {t(`wizard.rowStatus.${row.status}`)}</p>{row.normalized ? <p>{locale === 'ar' ? row.normalized.name.ar || row.normalized.name.en : row.normalized.name.en || row.normalized.name.ar}</p> : null}<ul>{row.errors.map((issue, index) => <li key={index}>{t.has(`rowErrors.${issue.code}`) ? t(`rowErrors.${issue.code}`) : t('rowErrors.invalid')}{issue.field && t.has(`fields.${issue.field}`) ? ` · ${t(`fields.${issue.field}`)}` : ''}</li>)}</ul></li>)}</ul>
        <Button className="min-h-11" variant="outline" onClick={() => setStep(1)}>{t('previous')}</Button><Button className="min-h-11" disabled={preview.rows.length === 0 || preview.missingRequiredMappings.length > 0 || preview.counts.ok + preview.counts.duplicate === 0} onClick={() => setStep(3)}>{t('next')}</Button></div> : null}
      {step === 3 && preview ? <div className="flex flex-col gap-4"><p>{t('wizard.confirmHelp')}</p><label>{t('wizard.duplicates')}<select className="min-h-11 w-full rounded-lg border bg-background ps-3 pe-3" disabled={busy} value={onDuplicate} onChange={(event) => setOnDuplicate(event.target.value === 'import_anyway' ? 'import_anyway' : 'skip')}><option value="skip">{t('wizard.skip')}</option><option value="import_anyway">{t('wizard.importAnyway')}</option></select></label><p>{t('wizard.willInsert', { count: number(preview.counts.ok + (onDuplicate === 'import_anyway' ? preview.counts.duplicate : 0)) })}</p><Button className="min-h-11" variant="outline" disabled={busy} onClick={() => setStep(2)}>{t('previous')}</Button><Button className="min-h-11" disabled={busy} onClick={commit}>{t('wizard.commit')}</Button></div> : null}
    </>}
  </div>;
}
