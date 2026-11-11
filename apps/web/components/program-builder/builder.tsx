'use client';

import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { TextInput, type TextInputProps } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Selector } from '@astryxdesign/core/Selector';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { applyProgramOp, findDay, programStats, validateProgram, type ProgramIssue, type ProgramOp } from '@dawlyy/core/program-edit';
import type { LocalizedText, ProgramDocument } from '@dawlyy/core/types';
import { ClipboardList } from 'lucide-react';
import { z } from 'zod';
import { useRouter } from '@/i18n/navigation';
import { EmptyState } from '@/src/components/shell/empty-state';
import { DayEditor } from './day-editor';
import { ProgramStatus } from './status';
import { programErrorKey, programRequest, ProgramRequestError } from './transport';
import type { ProgramDetail, ProgramGrants } from './types';

type Pending = { op: ProgramOp; ids: string[] };
type Saved = { document: ProgramDocument; versionNo: number; status: string; revision: string; issues?: ProgramIssue[] };
const issueSchema = z.array(z.object({ path: z.string(), code: z.string(), message: z.object({ ar: z.string().optional(), en: z.string().optional() }) }));

/** Task 4: responsive program editor with core-only edits, deterministic operation replay and serial autosave. */
export function ProgramBuilder({ initial, grants }: { initial: ProgramDetail; grants: ProgramGrants }) {
  const t = useTranslations('programs'); const locale = useLocale(); const router = useRouter(); const lang = locale === 'ar' ? 'ar' : 'en'; const id = initial.head.id;
  const [document, setDocument] = useState(initial.currentVersion.document);
  const model = useRef(document); const pending = useRef<Pending[]>([]);
  const saved = useRef<Saved>({ document, versionNo: initial.currentVersion.versionNo, status: initial.currentVersion.status, revision: initial.revision, issues: initial.issues });
  const [version, setVersion] = useState({ number: initial.currentVersion.versionNo, status: initial.currentVersion.status as string });
  const [dayId, setDayId] = useState(document.phases[0]?.weeks[0]?.days[0]?.id ?? '');
  const [names, setNames] = useState<Record<string, LocalizedText>>(initial.exerciseNames);
  const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [stale, setStale] = useState(false);
  const [issues, setIssues] = useState(initial.issues);
  const [publishOpen, setPublishOpen] = useState(false); const [changeNote, setChangeNote] = useState(initial.currentVersion.changeNote ?? '');
  const flight = useRef<Promise<boolean> | null>(null); const blocked = useRef(false); const mounted = useRef(true);
  const [editTick, setEditTick] = useState(0);
  const readOnly = version.status !== 'draft' || !grants.edit || stale;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const flush = useCallback(async (): Promise<boolean> => {
    if (flight.current) return flight.current;
    if (blocked.current) return false;
    if (!pending.current.length) return true;
    const batch = pending.current.slice(0, 100);
    const operation = (async () => {
      setBusy(true); setError('');
      try {
        const response = await programRequest<Saved>(`/api/v1/programs/${id}/ops`, { method: 'POST', body: { baseVersionNo: saved.current.versionNo, baseRevision: saved.current.revision, ops: batch.map(entry => entry.op), editIds: batch.flatMap(entry => entry.ids) } });
        pending.current.splice(0, batch.length);
        saved.current = response;
        let next = response.document;
        for (const entry of pending.current) { let index = 0; next = applyProgramOp(next, entry.op, { newId: () => entry.ids[index++]! }); }
        model.current = next;
        if (mounted.current) {
          setDocument(next); setVersion({ number: response.versionNo, status: response.status });
          setDirty(pending.current.length > 0); setIssues(response.issues ?? validateProgram(next));
          if (pending.current.length) setEditTick(value => value + 1);
        }
        return true;
      } catch (error) {
        blocked.current = true;
        if (mounted.current) { setError(t(`errors.${programErrorKey(error)}`)); if (error instanceof ProgramRequestError && error.code === 'stale_draft') setStale(true); }
        return false;
      } finally { flight.current = null; if (mounted.current) setBusy(false); }
    })();
    flight.current = operation;
    return operation;
  }, [id, t]);

  useEffect(() => {
    if (!dirty || stale || blocked.current) return;
    const timer = setTimeout(() => { void flush(); }, 900);
    return () => clearTimeout(timer);
  }, [dirty, editTick, flush, stale]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function edit(op: ProgramOp) {
    if (readOnly) return;
    try {
      const ids: string[] = [];
      const next = applyProgramOp(model.current, op, { newId: () => { const value = crypto.randomUUID(); ids.push(value); return value; } });
      pending.current.push({ op, ids }); model.current = next;
      setDocument(next); setDirty(true); setIssues(validateProgram(next)); setEditTick(value => value + 1);
    } catch { setError(t('errors.invalidEdit')); }
  }

  async function saveAll(): Promise<boolean> {
    if (stale) return false;
    blocked.current = false;
    while (pending.current.length || flight.current) { if (!(await flush())) return false; }
    return true;
  }
  async function refresh() {
    const fresh = await programRequest<ProgramDetail>(`/api/v1/programs/${id}`);
    saved.current = { document: fresh.currentVersion.document, versionNo: fresh.currentVersion.versionNo, status: fresh.currentVersion.status, revision: fresh.revision, issues: fresh.issues };
    model.current = fresh.currentVersion.document; pending.current = []; blocked.current = false;
    setDocument(model.current); setVersion({ number: saved.current.versionNo, status: saved.current.status }); setDirty(false); setStale(false); setError(''); setIssues(fresh.issues); setNames(fresh.exerciseNames);
  }
  function navigate(event: MouseEvent<HTMLButtonElement | HTMLAnchorElement>, href: string) {
    if (!dirty || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void saveAll().then(ok => { if (ok) router.push(href); });
  }
  async function action(name: 'draft' | 'publish' | 'submit-review' | 'approve') {
    if (!(await saveAll())) return;
    setBusy(true); setError('');
    try {
      if (name === 'draft') await programRequest(`/api/v1/programs/${id}/draft`, { method: 'PUT', body: { document: model.current, baseVersionNo: saved.current.versionNo, baseRevision: saved.current.revision } });
      else await programRequest(`/api/v1/programs/${id}/${name}`, { method: 'POST', body: name === 'publish' ? { ...(version.status === 'draft' ? { changeNote } : {}), baseVersionNo: saved.current.versionNo, baseRevision: saved.current.revision } : undefined });
      await refresh(); setPublishOpen(false);
    } catch (error) {
      setError(t(`errors.${programErrorKey(error)}`));
      if (error instanceof ProgramRequestError) {
        const result = issueSchema.safeParse(error.details);
        if (result.success) setIssues(result.data as ProgramIssue[]);
        if (error.code === 'stale_draft') { setStale(true); blocked.current = true; }
      }
    } finally { setBusy(false); }
  }
  const firstDay = document.phases[0]?.weeks[0]?.days[0];
  const selected = findDay(document, dayId) ?? (firstDay ? findDay(document, firstDay.id) : null);
  const stats = programStats(document);
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const text = (value: LocalizedText) => value[lang] || value[lang === 'ar' ? 'en' : 'ar'] || '';
  const weekday = (value: number) => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 8 + value)));

  return <Grid gap={5} className="min-w-0 max-w-full pb-28 [overflow-wrap:anywhere]">
    <HStack gap={2} wrap="wrap"><Button className="min-h-11 min-w-11" variant="secondary" href={`/coach/programs/${id}/history`} onClick={event => navigate(event, `/coach/programs/${id}/history`)} label={t('history')} />{initial.head.kind === 'template' && (grants.edit || grants.publish) ? <Button className="min-h-11 min-w-11" variant="secondary" href={`/coach/programs/${id}/assign`} onClick={event => navigate(event, `/coach/programs/${id}/assign`)} label={t('assign')} /> : null}</HStack>
    <Text as="p" className="text-sm text-muted-foreground">{t('builderStats', { phases: number(stats.phases), weeks: number(stats.weeks), exercises: number(stats.items) })}</Text>
    {version.status !== 'draft' ? <Grid gap={3} className="rounded-xl border bg-muted p-4"><Text as="p">{version.status === 'published' || version.status === 'superseded' || version.status === 'archived' ? t('readOnlyPublished') : t('readOnlyReview')}</Text>{grants.edit && ['published', 'superseded', 'archived'].includes(version.status) ? <Button className="min-h-11 min-w-11 justify-self-start" isDisabled={busy || stale} onClick={() => void action('draft')} label={t('createDraft')} /> : null}</Grid> : null}
    {error ? <Grid gap={2} role="alert" className="rounded-xl border border-destructive/40 p-3"><Text as="p">{error}</Text>{stale ? <Button className="min-h-11 min-w-11" variant="secondary" onClick={() => { void refresh().catch(() => setError(t('errors.requestFailed'))); }} label={t('reloadDraft')} /> : null}</Grid> : null}
    {issues.length ? <details className="min-w-0 rounded-xl border p-3"><summary className="min-h-11 cursor-pointer font-medium">{t('validationIssues', { count: number(issues.length) })}</summary><ul className="grid min-w-0 gap-2 pt-2 text-sm">{issues.map((issue, index) => <li key={`${issue.path}-${index}`}>{text(issue.message)} <Text className="text-muted-foreground">{issue.path}</Text></li>)}</ul></details> : null}
    <Grid gap={5} className="min-w-0 md:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label={t('programTree')} className="hidden min-w-0 self-start rounded-xl border p-3 md:grid md:gap-3">
        {document.phases.map((phase, pi) => <details key={phase.id} open={selected?.phase.id === phase.id}><summary className="min-h-11 cursor-pointer font-semibold">{text(phase.name) || t('phaseNumber', { number: number(pi + 1) })}</summary><Grid gap={2} className="ps-2">{phase.weeks.map(week => <details key={week.id} open={selected?.week.id === week.id}><summary className="min-h-11 cursor-pointer">{t('weekNumber', { number: number(week.index + 1) })}</summary><Grid gap={1} className="ps-2">{week.days.map(day => <Button key={day.id} type="button" className="min-h-11 min-w-11 justify-start whitespace-normal text-start" variant={selected?.day.id === day.id ? 'primary' : 'ghost'} aria-pressed={selected?.day.id === day.id} onClick={() => setDayId(day.id)} label={`${weekday(day.index)} · ${t(`dayKinds.${day.kind}`)}`} />)}</Grid></details>)}</Grid></details>)}
      </nav>
      <Grid gap={5} className="min-w-0">
        {selected ? <>
          <Grid gap={3} className="min-w-0 md:hidden"><VStack className="grid min-w-0 gap-2"><Selector label={t('selectWeek')} controlClassName="min-h-11" value={selected.week.id} onChange={value => { const week = document.phases.flatMap(phase => phase.weeks).find(week => week.id === value); if (week?.days[0]) setDayId(week.days[0].id); }} options={document.phases.map(phase => ({ type: 'section' as const, title: text(phase.name), options: phase.weeks.map(week => ({ value: week.id, label: t('weekNumber', { number: number(week.index + 1) }) })) }))} /></VStack><HStack gap={1} wrap="wrap" role="group" aria-label={t('selectDay')}>{selected.week.days.map(day => <Button className="min-h-11 min-w-11" type="button" key={day.id} variant={day.id === selected.day.id ? 'primary' : 'secondary'} aria-pressed={day.id === selected.day.id} onClick={() => setDayId(day.id)} label={weekday(day.index)} />)}</HStack></Grid>
          <fieldset disabled={readOnly || busy} className="grid min-w-0 gap-5 disabled:opacity-80">
            <details className="min-w-0 rounded-xl border p-3"><summary className="min-h-11 cursor-pointer font-medium">{t('phaseWeekControls')}</summary><Grid gap={3} className="min-w-0 pt-3">
              <VStack className="grid gap-1"><DraftTextInput label={t('phaseName')} controlClassName="min-h-11" key={`${selected.phase.id}-${text(selected.phase.name)}`} defaultValue={text(selected.phase.name)} onValueBlur={value => { if (value.trim()) edit({ type: 'phase.update', phaseId: selected.phase.id, patch: { name: { ...selected.phase.name, [lang]: value } } }); }} /></VStack>
              <HStack gap={2} wrap="wrap"><Button className="min-h-11 min-w-11" type="button" variant="secondary" onClick={() => edit({ type: 'phase.add', weeks: 1, name: { [lang]: t('phaseNumber', { number: number(document.phases.length + 1) }) } })} label={t('addPhase')} /><Button className="min-h-11 min-w-11" type="button" variant="secondary" onClick={() => edit({ type: 'phase.duplicate', phaseId: selected.phase.id })} label={t('copyPhase')} /><Button className="min-h-11 min-w-11" type="button" variant="secondary" isDisabled={selected.phaseIndex === 0} onClick={() => edit({ type: 'phase.move', phaseId: selected.phase.id, toIndex: selected.phaseIndex - 1 })} label={t('moveUp')} /><Button className="min-h-11 min-w-11" type="button" variant="secondary" isDisabled={selected.phaseIndex === document.phases.length - 1} onClick={() => edit({ type: 'phase.move', phaseId: selected.phase.id, toIndex: selected.phaseIndex + 1 })} label={t('moveDown')} /><Button className="min-h-11 min-w-11" type="button" variant="destructive" isDisabled={document.phases.length === 1} onClick={() => edit({ type: 'phase.remove', phaseId: selected.phase.id })} label={t('removePhase')} /></HStack>
              <HStack gap={2} wrap="wrap"><Button className="min-h-11 min-w-11" type="button" variant="secondary" onClick={() => edit({ type: 'week.add', phaseId: selected.phase.id })} label={t('addWeek')} /><Button className="min-h-11 min-w-11" type="button" variant="secondary" onClick={() => edit({ type: 'week.duplicate', phaseId: selected.phase.id, weekId: selected.week.id })} label={t('copyWeek')} /><Button className="min-h-11 min-w-11" type="button" variant="secondary" isDisabled={selected.weekIndex === 0} onClick={() => edit({ type: 'week.move', phaseId: selected.phase.id, weekId: selected.week.id, toIndex: selected.weekIndex - 1 })} label={t('moveUp')} /><Button className="min-h-11 min-w-11" type="button" variant="secondary" isDisabled={selected.weekIndex === selected.phase.weeks.length - 1} onClick={() => edit({ type: 'week.move', phaseId: selected.phase.id, weekId: selected.week.id, toIndex: selected.weekIndex + 1 })} label={t('moveDown')} /><Button className="min-h-11 min-w-11" type="button" variant="destructive" isDisabled={selected.phase.weeks.length === 1} onClick={() => edit({ type: 'week.remove', phaseId: selected.phase.id, weekId: selected.week.id })} label={t('removeWeek')} /></HStack>
            </Grid></details>
            <Heading level={2} className="text-lg font-semibold">{t('weekDay', { week: number(selected.week.index + 1), day: weekday(selected.day.index) })}</Heading>
            <DayEditor key={selected.day.id} day={selected.day} document={document} names={names} onOp={edit} onName={(id, name) => setNames(old => ({ ...old, [id]: name }))} />
          </fieldset>
        </> : <EmptyState Icon={ClipboardList} title={t('noDays')} />}
      </Grid>
    </Grid>
    <HStack gap={2} wrap="wrap" className="sticky bottom-3 z-20 min-w-0 items-center rounded-xl border bg-background/95 p-3 shadow-md" aria-live="polite">
      <Text>{t('versionNumber', { number: number(version.number) })}</Text><ProgramStatus status={version.status} /><Text className="text-sm">{busy ? t('saving') : dirty ? t('unsaved') : t('saved')}</Text>
      {grants.edit && version.status === 'draft' ? <Button className="min-h-11 min-w-11" variant="secondary" isDisabled={busy || stale || !dirty} onClick={() => void saveAll()} label={t('saveDraft')} /> : null}
      {grants.edit && version.status === 'draft' ? <Button className="min-h-11 min-w-11" variant="secondary" isDisabled={busy || stale} onClick={() => void action('submit-review')} label={t('submitReview')} /> : null}
      {grants.publish && version.status === 'in_review' ? <Button className="min-h-11 min-w-11" isDisabled={busy || stale} onClick={() => void action('approve')} label={t('approve')} /> : null}
      {grants.publish && (version.status === 'draft' || version.status === 'approved') ? <Button className="min-h-11 min-w-11" isDisabled={busy || stale} onClick={() => setPublishOpen(true)} label={t('publish')} /> : null}
    </HStack>
    <Dialog isOpen={publishOpen} onOpenChange={setPublishOpen} width="var(--container-lg)" maxHeight="85dvh" aria-describedby="program-publish-description"><VStack gap={4}><DialogHeader title={t('publishTitle')} /><Text as="p" id="program-publish-description">{t('publishDescription')}</Text>
      <VStack className="grid gap-2"><TextArea label={t('changeNote')} value={changeNote} maxLength={2000} isDisabled={version.status === 'approved'} onChange={value => setChangeNote(value)} controlClassName="min-h-11" /></VStack>
      {issues.length ? <ul className="grid min-w-0 gap-2 text-sm [overflow-wrap:anywhere]">{issues.map((issue, index) => <li key={`${issue.path}-${index}`}>{text(issue.message)} <Text className="text-muted-foreground">{issue.path}</Text></li>)}</ul> : <Text as="p">{t('validationReady')}</Text>}
      {error ? <Text as="p" role="alert">{error}</Text> : null}<Button className="min-h-11 min-w-11" isDisabled={busy || stale} onClick={() => void action('publish')} label={busy ? t('publishing') : t('publish')} /><Button type="button" variant="secondary" className="min-h-11 min-w-11" isDisabled={busy} onClick={() => setPublishOpen(false)} label={t('close')} />
    </VStack></Dialog>
  </Grid>;
}

/** Keep the existing blur-triggered edit boundary while Astryx owns the field. */
function DraftTextInput({ defaultValue = '', onValueBlur, ...props }: Omit<TextInputProps, 'value' | 'onChange' | 'onBlur'> & { defaultValue?: string; onValueBlur?: (value: string) => void }) {
  const [value, setValue] = useState(defaultValue);
  return <TextInput {...props} value={value} onChange={setValue} onBlur={event => onValueBlur?.((event.currentTarget as HTMLInputElement).value)} />;
}
