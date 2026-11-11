'use client';

import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Selector } from '@astryxdesign/core/Selector';
import { FileInput } from '@astryxdesign/core/FileInput';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { EXERCISE_IMPORT_FIELDS, parseCsv, suggestMapping, missingRequiredMappings, type ColumnMapping } from '@dawlyy/core/csv';
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
  const [file, setFile] = useState<File | null>(null);
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
  return <VStack gap={5} className="min-w-0 max-w-full">
    <a className="flex min-h-11 items-center underline" href="/api/v1/exercises/import/template" download>{t('wizard.template')}</a>
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">{steps.map((name, index) => <li key={name} aria-current={step === index ? 'step' : undefined} className={`rounded-lg border p-3 ${step === index ? 'bg-brand-soft font-semibold' : ''}`}>{number(index + 1)}. {t(`wizard.${name}`)}</li>)}</ol>
    {error ? <Text as="p" role="alert">{error}</Text> : null}
    {busy ? <Text as="p" role="status">{t('loading')}</Text> : null}
    {summary ? <VStack gap={3} className="rounded-xl border p-4" role="status"><Heading level={2} className="text-xl font-semibold">{t('wizard.result')}</Heading><Text as="p">{t('wizard.inserted', { count: number(summary.inserted) })}</Text><Text as="p">{t('wizard.skipped', { count: number(summary.skipped) })}</Text><Text as="p">{t('wizard.errors', { count: number(summary.errors.length) })}</Text><Button className="min-h-11 min-w-11" href="/coach/exercises" label={t('back')} /></VStack> : <>
      {step === 0 ? <VStack gap={4}><VStack><FileInput label={t('wizard.file')} mode="input" controlClassName="min-h-11" value={file} accept=".csv,text/csv" isDisabled={busy} onChange={files => { const selected = Array.isArray(files) ? files[0] ?? null : files; setFile(selected); void upload(selected ?? undefined); }} /></VStack><VStack><TextArea label={t('wizard.paste')} controlClassName="min-h-60 max-w-full" value={csv} onChange={value => setCsv(value)} /></VStack><Button className="min-h-11 min-w-11" isDisabled={busy || !csv.trim()} onClick={map} label={t('next')} /></VStack> : null}
      {step === 1 ? <Grid gap={3} className="min-w-0 sm:grid-cols-2">{EXERCISE_IMPORT_FIELDS.map((field) => <VStack key={field} className="min-w-0"><Selector label={t(`fields.${field}`)} controlClassName="min-h-11" value={String(mapping[field] ?? '')} onChange={value => { setMapping(previous => { const next = { ...previous }; if (value === '') delete next[field]; else next[field] = Number(value); return next; }); }} options={[{ value: '', label: t('wizard.ignore') }, ...headers.map((label, index) => ({ value: String(index), label }))]} /></VStack>)}<Text as="p" className="sm:col-span-2">{missingRequiredMappings(mapping).length ? t('wizard.missingMappings') : t('wizard.mappingReady')}</Text><Button className="min-h-11 min-w-11" variant="secondary" isDisabled={busy} onClick={() => setStep(0)} label={t('previous')} /><Button className="min-h-11 min-w-11" isDisabled={busy || missingRequiredMappings(mapping).length > 0} onClick={showPreview} label={t('wizard.preview')} /></Grid> : null}
      {step === 2 && preview ? <VStack gap={4} className="min-w-0"><Text as="p">{t('wizard.counts', { ok: number(preview.counts.ok), duplicate: number(preview.counts.duplicate), error: number(preview.counts.error) })}</Text>
        {preview.rows.length === 0 ? <Text as="p">{t('wizard.noRows')}</Text> : null}
        <ul className="max-h-[55dvh] space-y-2 overflow-y-auto">{preview.rows.map((row) => <li key={row.row} className="min-w-0 break-words rounded-lg border p-3"><Text as="p">{t('wizard.row', { row: number(row.row) })} · {t(`wizard.rowStatus.${row.status}`)}</Text>{row.normalized ? <Text as="p">{locale === 'ar' ? row.normalized.name.ar || row.normalized.name.en : row.normalized.name.en || row.normalized.name.ar}</Text> : null}<ul>{row.errors.map((issue, index) => <li key={index}>{t.has(`rowErrors.${issue.code}`) ? t(`rowErrors.${issue.code}`) : t('rowErrors.invalid')}{issue.field && t.has(`fields.${issue.field}`) ? ` · ${t(`fields.${issue.field}`)}` : ''}</li>)}</ul></li>)}</ul>
        <Button className="min-h-11 min-w-11" variant="secondary" onClick={() => setStep(1)} label={t('previous')} /><Button className="min-h-11 min-w-11" isDisabled={preview.rows.length === 0 || preview.missingRequiredMappings.length > 0 || preview.counts.ok + preview.counts.duplicate === 0} onClick={() => setStep(3)} label={t('next')} /></VStack> : null}
      {step === 3 && preview ? <VStack gap={4}><Text as="p">{t('wizard.confirmHelp')}</Text><VStack><Selector label={t('wizard.duplicates')} controlClassName="min-h-11" isDisabled={busy} value={onDuplicate} onChange={value => setOnDuplicate(value === 'import_anyway' ? 'import_anyway' : 'skip')} options={[{ value: 'skip', label: t('wizard.skip') }, { value: 'import_anyway', label: t('wizard.importAnyway') }]} /></VStack><Text as="p">{t('wizard.willInsert', { count: number(preview.counts.ok + (onDuplicate === 'import_anyway' ? preview.counts.duplicate : 0)) })}</Text><Button className="min-h-11 min-w-11" variant="secondary" isDisabled={busy} onClick={() => setStep(2)} label={t('previous')} /><Button className="min-h-11 min-w-11" isDisabled={busy} onClick={commit} label={t('wizard.commit')} /></VStack> : null}
    </>}
  </VStack>;
}
