'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { applyProgramOp, findDay, programStats, validateProgram, type ProgramIssue, type ProgramOp } from '@dawlyy/core/program-edit';
import type { LocalizedText, ProgramDocument } from '@dawlyy/core/types';
import { ClipboardList } from 'lucide-react';
import { z } from 'zod';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
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

  return <div className="grid min-w-0 max-w-full gap-5 pb-28 [overflow-wrap:anywhere]">
    <div className="flex flex-wrap gap-2"><Button asChild className="min-h-11" variant="outline"><Link href={`/coach/programs/${id}/history`} onClick={event => navigate(event, `/coach/programs/${id}/history`)}>{t('history')}</Link></Button>{initial.head.kind === 'template' && (grants.edit || grants.publish) ? <Button asChild className="min-h-11" variant="outline"><Link href={`/coach/programs/${id}/assign`} onClick={event => navigate(event, `/coach/programs/${id}/assign`)}>{t('assign')}</Link></Button> : null}</div>
    <p className="text-sm text-muted-foreground">{t('builderStats', { phases: number(stats.phases), weeks: number(stats.weeks), exercises: number(stats.items) })}</p>
    {version.status !== 'draft' ? <div className="grid gap-3 rounded-xl border bg-muted p-4"><p>{version.status === 'published' || version.status === 'superseded' || version.status === 'archived' ? t('readOnlyPublished') : t('readOnlyReview')}</p>{grants.edit && ['published', 'superseded', 'archived'].includes(version.status) ? <Button className="min-h-11 justify-self-start" disabled={busy || stale} onClick={() => void action('draft')}>{t('createDraft')}</Button> : null}</div> : null}
    {error ? <div role="alert" className="grid gap-2 rounded-xl border border-destructive/40 p-3"><p>{error}</p>{stale ? <Button className="min-h-11" variant="outline" onClick={() => { void refresh().catch(() => setError(t('errors.requestFailed'))); }}>{t('reloadDraft')}</Button> : null}</div> : null}
    {issues.length ? <details className="min-w-0 rounded-xl border p-3"><summary className="min-h-11 cursor-pointer font-medium">{t('validationIssues', { count: number(issues.length) })}</summary><ul className="grid min-w-0 gap-2 pt-2 text-sm">{issues.map((issue, index) => <li key={`${issue.path}-${index}`}>{text(issue.message)} <span className="text-muted-foreground">{issue.path}</span></li>)}</ul></details> : null}
    <div className="grid min-w-0 gap-5 md:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label={t('programTree')} className="hidden min-w-0 self-start rounded-xl border p-3 md:grid md:gap-3">
        {document.phases.map((phase, pi) => <details key={phase.id} open={selected?.phase.id === phase.id}><summary className="min-h-11 cursor-pointer font-semibold">{text(phase.name) || t('phaseNumber', { number: number(pi + 1) })}</summary><div className="grid gap-2 ps-2">{phase.weeks.map(week => <details key={week.id} open={selected?.week.id === week.id}><summary className="min-h-11 cursor-pointer">{t('weekNumber', { number: number(week.index + 1) })}</summary><div className="grid gap-1 ps-2">{week.days.map(day => <Button key={day.id} type="button" className="min-h-11 justify-start whitespace-normal text-start" variant={selected?.day.id === day.id ? 'default' : 'ghost'} aria-pressed={selected?.day.id === day.id} onClick={() => setDayId(day.id)}>{weekday(day.index)} · {t(`dayKinds.${day.kind}`)}</Button>)}</div></details>)}</div></details>)}
      </nav>
      <div className="grid min-w-0 gap-5">
        {selected ? <>
          <div className="grid min-w-0 gap-3 md:hidden"><label className="grid min-w-0 gap-2">{t('selectWeek')}<select className="min-h-11 max-w-full rounded-lg border bg-background px-2" value={selected.week.id} onChange={e => { const week = document.phases.flatMap(phase => phase.weeks).find(week => week.id === e.target.value); if (week?.days[0]) setDayId(week.days[0].id); }}>{document.phases.map(phase => <optgroup key={phase.id} label={text(phase.name)}>{phase.weeks.map(week => <option key={week.id} value={week.id}>{t('weekNumber', { number: number(week.index + 1) })}</option>)}</optgroup>)}</select></label><div className="flex flex-wrap gap-1" role="group" aria-label={t('selectDay')}>{selected.week.days.map(day => <Button className="min-h-11" type="button" key={day.id} variant={day.id === selected.day.id ? 'default' : 'outline'} aria-pressed={day.id === selected.day.id} onClick={() => setDayId(day.id)}>{weekday(day.index)}</Button>)}</div></div>
          <fieldset disabled={readOnly || busy} className="grid min-w-0 gap-5 disabled:opacity-80">
            <details className="min-w-0 rounded-xl border p-3"><summary className="min-h-11 cursor-pointer font-medium">{t('phaseWeekControls')}</summary><div className="grid min-w-0 gap-3 pt-3">
              <label className="grid gap-1">{t('phaseName')}<Input className="min-h-11" key={`${selected.phase.id}-${text(selected.phase.name)}`} defaultValue={text(selected.phase.name)} onBlur={e => { if (e.target.value.trim()) edit({ type: 'phase.update', phaseId: selected.phase.id, patch: { name: { ...selected.phase.name, [lang]: e.target.value } } }); }} /></label>
              <div className="flex flex-wrap gap-2"><Button className="min-h-11" type="button" variant="outline" onClick={() => edit({ type: 'phase.add', weeks: 1, name: { [lang]: t('phaseNumber', { number: number(document.phases.length + 1) }) } })}>{t('addPhase')}</Button><Button className="min-h-11" type="button" variant="outline" onClick={() => edit({ type: 'phase.duplicate', phaseId: selected.phase.id })}>{t('copyPhase')}</Button><Button className="min-h-11" type="button" variant="outline" disabled={selected.phaseIndex === 0} onClick={() => edit({ type: 'phase.move', phaseId: selected.phase.id, toIndex: selected.phaseIndex - 1 })}>{t('moveUp')}</Button><Button className="min-h-11" type="button" variant="outline" disabled={selected.phaseIndex === document.phases.length - 1} onClick={() => edit({ type: 'phase.move', phaseId: selected.phase.id, toIndex: selected.phaseIndex + 1 })}>{t('moveDown')}</Button><Button className="min-h-11" type="button" variant="destructive" disabled={document.phases.length === 1} onClick={() => edit({ type: 'phase.remove', phaseId: selected.phase.id })}>{t('removePhase')}</Button></div>
              <div className="flex flex-wrap gap-2"><Button className="min-h-11" type="button" variant="outline" onClick={() => edit({ type: 'week.add', phaseId: selected.phase.id })}>{t('addWeek')}</Button><Button className="min-h-11" type="button" variant="outline" onClick={() => edit({ type: 'week.duplicate', phaseId: selected.phase.id, weekId: selected.week.id })}>{t('copyWeek')}</Button><Button className="min-h-11" type="button" variant="outline" disabled={selected.weekIndex === 0} onClick={() => edit({ type: 'week.move', phaseId: selected.phase.id, weekId: selected.week.id, toIndex: selected.weekIndex - 1 })}>{t('moveUp')}</Button><Button className="min-h-11" type="button" variant="outline" disabled={selected.weekIndex === selected.phase.weeks.length - 1} onClick={() => edit({ type: 'week.move', phaseId: selected.phase.id, weekId: selected.week.id, toIndex: selected.weekIndex + 1 })}>{t('moveDown')}</Button><Button className="min-h-11" type="button" variant="destructive" disabled={selected.phase.weeks.length === 1} onClick={() => edit({ type: 'week.remove', phaseId: selected.phase.id, weekId: selected.week.id })}>{t('removeWeek')}</Button></div>
            </div></details>
            <h2 className="text-lg font-semibold">{t('weekDay', { week: number(selected.week.index + 1), day: weekday(selected.day.index) })}</h2>
            <DayEditor key={selected.day.id} day={selected.day} document={document} names={names} onOp={edit} onName={(id, name) => setNames(old => ({ ...old, [id]: name }))} />
          </fieldset>
        </> : <EmptyState Icon={ClipboardList} title={t('noDays')} />}
      </div>
    </div>
    <div className="sticky bottom-3 z-20 flex min-w-0 flex-wrap items-center gap-2 rounded-xl border bg-background/95 p-3 shadow-md" aria-live="polite">
      <span>{t('versionNumber', { number: number(version.number) })}</span><ProgramStatus status={version.status} /><span className="text-sm">{busy ? t('saving') : dirty ? t('unsaved') : t('saved')}</span>
      {grants.edit && version.status === 'draft' ? <Button className="min-h-11" variant="outline" disabled={busy || stale || !dirty} onClick={() => void saveAll()}>{t('saveDraft')}</Button> : null}
      {grants.edit && version.status === 'draft' ? <Button className="min-h-11" variant="outline" disabled={busy || stale} onClick={() => void action('submit-review')}>{t('submitReview')}</Button> : null}
      {grants.publish && version.status === 'in_review' ? <Button className="min-h-11" disabled={busy || stale} onClick={() => void action('approve')}>{t('approve')}</Button> : null}
      {grants.publish && (version.status === 'draft' || version.status === 'approved') ? <Button className="min-h-11" disabled={busy || stale} onClick={() => setPublishOpen(true)}>{t('publish')}</Button> : null}
    </div>
    <Dialog open={publishOpen} onOpenChange={setPublishOpen}><DialogContent showCloseButton={false} className="max-h-[85dvh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{t('publishTitle')}</DialogTitle><DialogDescription>{t('publishDescription')}</DialogDescription></DialogHeader>
      <label className="grid gap-2">{t('changeNote')}<Textarea value={changeNote} maxLength={2000} disabled={version.status === 'approved'} onChange={e => setChangeNote(e.target.value)} /></label>
      {issues.length ? <ul className="grid min-w-0 gap-2 text-sm [overflow-wrap:anywhere]">{issues.map((issue, index) => <li key={`${issue.path}-${index}`}>{text(issue.message)} <span className="text-muted-foreground">{issue.path}</span></li>)}</ul> : <p>{t('validationReady')}</p>}
      {error ? <p role="alert">{error}</p> : null}<Button className="min-h-11" disabled={busy || stale} onClick={() => void action('publish')}>{busy ? t('publishing') : t('publish')}</Button><Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => setPublishOpen(false)}>{t('close')}</Button>
    </DialogContent></Dialog>
  </div>;
}
