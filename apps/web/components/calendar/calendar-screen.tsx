'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarDays } from 'lucide-react';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { DateInput } from '@astryxdesign/core/DateInput';
import { DateTimeInput } from '@astryxdesign/core/DateTimeInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { SCHEDULE_EVENT_TYPES, CALENDAR_EVENT_STATES } from '@dawlyy/core/types';
import { addDays, localDateOf, zonedDueAt } from '@dawlyy/core/schedule';
import { PageHeader } from '@/src/components/shell/page-header';
import { EmptyState } from '@/src/components/shell/empty-state';
import { dateValue, dateTimeValue, trackingRequest, type ListPage } from '../tracking/contracts';
import { CancelEventControl, useReloadOnUndoSettle } from '@/components/control/archive-controls';

/** Task 8: safe, serialized calendar event fields rendered by the coach calendar. */
export type CalendarRow = { id: string; clientId: string; type: string; state: string; dueAt: string; localDate: string; timezone: string; windowDays: number; title: { ar?: string; en?: string } | null };
type View = 'day' | 'week' | 'month';
function dateRange(date: string, view: View) {
  if (view === 'day') return { from: date, to: date };
  if (view === 'week') { const from = addDays(date, -new Date(`${date}T12:00:00Z`).getUTCDay()); return { from, to: addDays(from, 6) }; }
  const from = `${date.slice(0, 7)}-01`;
  const next = new Date(`${from}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  return { from, to: addDays(next.toISOString().slice(0, 10), -1) };
}
/** Task 8: mobile agenda and desktop day/week/month calendar with scoped filters and occurrence actions. */
/** canEdit is the caller's calendar edit grant (cancel and restore need it; the server enforces it again). It defaults to true so the screen behaves as before until the page passes the exact grant. */
export function CalendarScreen({ initial, today, timezone, clients, canEdit = true }: { initial: ListPage<CalendarRow>; today: string; timezone: string; clients: { id: string; name: string }[]; canEdit?: boolean }) {
  const t = useTranslations('calendar'); const status = useTranslations('status'); const locale = useLocale();
  const [events, setEvents] = useState(initial); const [view, setView] = useState<View>('month'); const [date, setDate] = useState(today);
  const [clientId, setClientId] = useState('all'); const [type, setType] = useState('all'); const [state, setState] = useState('all');
  const [eventClient, setEventClient] = useState(clients[0]?.id ?? ''); const [eventType, setEventType] = useState('custom'); const [title, setTitle] = useState('');
  const [eventAt, setEventAt] = useState(`${today}T09:00`); const [zone, setZone] = useState(timezone); const [windowDays, setWindowDays] = useState(1);
  const [editing, setEditing] = useState<CalendarRow | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState<CalendarRow | null>(null);
  function openReschedule(event: CalendarRow) {
    setEditing(null); setRescheduling(event); setEventClient(event.clientId); setEventType(event.type); setTitle(event.title?.[locale === 'ar' ? 'ar' : 'en'] ?? ''); setZone(event.timezone);
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: event.timezone }).format(new Date(event.dueAt));
    setEventAt(`${localDateOf(event.dueAt, event.timezone)}T${time}`);
    document.getElementById('calendar-event-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function stateLabel(value: string) { return value === 'completed' ? status('complete') : value === 'due' || value === 'overdue' || value === 'cancelled' ? status(value) : t(`states.${value}`); }
  function query(activeView = view, cursor?: string) {
    const range = dateRange(date, activeView);
    const search = new URLSearchParams({ from: zonedDueAt(range.from, '00:00', timezone), to: new Date(Date.parse(zonedDueAt(addDays(range.to, 1), '00:00', timezone)) - 1).toISOString(), limit: '100' });
    if (clientId !== 'all') search.set('clientId', clientId);
    if (type !== 'all') search.set('type', type);
    if (state !== 'all') search.set('state', state);
    if (cursor) search.set('cursor', cursor);
    return search.toString();
  }
  async function load(activeView = view, cursor?: string) {
    setBusy(true); setError('');
    try { const next = await trackingRequest<ListPage<CalendarRow>>(`calendar?${query(activeView, cursor)}`); setEvents(cursor ? { items: [...events.items, ...next.items], nextCursor: next.nextCursor } : next); setView(activeView); } catch { setError('request_failed'); } finally { setBusy(false); }
  }
  async function act(event: CalendarRow, action: string) {
    setError('');
    try { await trackingRequest(`calendar/${event.id}/${action}`, 'POST', action === 'reschedule' ? { dueAt: zonedDueAt(eventAt.slice(0, 10), eventAt.slice(11, 16), zone), timezone: zone } : undefined); await load(); } catch (cause) { setError(cause instanceof Error && cause.message === 'illegal_transition' ? 'illegal_transition' : 'request_failed'); }
  }
  useReloadOnUndoSettle(() => void load());
  const range = dateRange(date, view); const first = `${date.slice(0, 7)}-01`;
  const gridStart = addDays(first, -new Date(`${first}T12:00:00Z`).getUTCDay());
  const days = Array.from({ length: view === 'month' ? 42 : view === 'week' ? 7 : 1 }, (_, index) => addDays(view === 'month' ? gridStart : range.from, index));
  const dayLabel = (day: string) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
  const label = (event: CalendarRow) => event.title?.[locale === 'ar' ? 'ar' : 'en'] || event.title?.en || event.title?.ar || (t.has(`types.${event.type}`) ? t(`types.${event.type}`) : event.type);
  return <Layout content={<LayoutContent><VStack gap={6} className="min-w-0 max-w-full text-start">
    <PageHeader title={t('title')} subtitle={t('subtitle')} />
    <HStack gap={2} wrap="wrap">{(['day', 'week', 'month'] as const).map(value => <Button key={value} label={t(`views.${value}`)} className="min-h-11" aria-pressed={view === value} variant={view === value ? 'primary' : 'secondary'} onClick={() => { void load(value); }} />)}</HStack>
    <HStack gap={3} wrap="wrap" className="min-w-0 max-w-full">
      <DateInput label={t('date')} value={dateValue(date)} onChange={value => { if (value) setDate(value); }} controlClassName="min-h-11" />
      <Selector label={t('filters.client')} value={clientId} options={[{ value: 'all', label: t('filters.all') }, ...clients.map(client => ({ value: client.id, label: client.name }))]} onChange={setClientId} controlClassName="min-h-11" />
      <Selector label={t('filters.type')} value={type} options={[{ value: 'all', label: t('filters.all') }, ...SCHEDULE_EVENT_TYPES.map(value => ({ value, label: t(`types.${value}`) }))]} onChange={setType} controlClassName="min-h-11" />
      <Selector label={t('filters.state')} value={state} options={[{ value: 'all', label: t('filters.all') }, ...CALENDAR_EVENT_STATES.map(value => ({ value, label: stateLabel(value) }))]} onChange={setState} controlClassName="min-h-11" />
      <Button label={t('actions.apply')} className="min-h-11" isLoading={busy} clickAction={() => load()} />
    </HStack>
    {busy ? <Text role="status">{t('loading')}</Text> : null}
    {events.items.length === 0 ? <EmptyState Icon={CalendarDays} title={t('empty.title')} description={t('empty.description')} /> : null}
    <VStack gap={2} className={`!hidden md:!grid ${view === 'day' ? 'grid-cols-1' : 'grid-cols-7'} min-w-0 max-w-full`} aria-label={t('grid')}>
      {days.map(day => <VStack key={day} gap={2} className="min-w-0 border border-border rounded-lg p-2"><Text>{dayLabel(day)}</Text>{events.items.filter(event => localDateOf(event.dueAt, timezone) === day).map(event => <VStack key={event.id} gap={1} className="min-w-0 rounded border border-border p-2"><Text className="break-words">{label(event)}</Text><Text>{stateLabel(event.state)}</Text></VStack>)}</VStack>)}
    </VStack>
    <Heading level={2}>{t('agenda')}</Heading>
    {events.items.map(event => <VStack key={event.id} gap={3} className="min-w-0 max-w-full border-b border-border pb-4">
      <Heading level={3} className="break-words">{label(event)}</Heading>
      <Text className="break-words">{clients.find(client => client.id === event.clientId)?.name ?? t('client')} · {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(event.dueAt))} · {stateLabel(event.state)}</Text>
      {['scheduled', 'due', 'overdue'].includes(event.state) ? <HStack gap={2} wrap="wrap">{['complete', 'skip', 'reschedule'].map(action => <Button key={action} label={t(`actions.${action}`)} className="min-h-11" variant="secondary" clickAction={() => { if (action === 'reschedule') openReschedule(event); else return act(event, action); }} />)}<Button label={t('actions.edit')} className="min-h-11" variant="secondary" onClick={() => { setRescheduling(null); setEditing(event); setEventClient(event.clientId); setEventType(event.type); setTitle(event.title?.[locale === 'ar' ? 'ar' : 'en'] ?? ''); setWindowDays(event.windowDays); document.getElementById('calendar-event-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />
        <CancelEventControl id={event.id} cancelled={false} canEdit={canEdit} itemLabel={label(event)} onChanged={() => void load()} /></HStack> : null}
      {event.state === 'cancelled' ? <HStack gap={2} wrap="wrap"><CancelEventControl id={event.id} cancelled canEdit={canEdit} itemLabel={label(event)} onChanged={() => void load()} /></HStack> : null}
    </VStack>)}
    {events.nextCursor ? <Button label={t('actions.more')} className="min-h-11" clickAction={() => load(view, events.nextCursor ?? undefined)} /> : null}
    <Heading id="calendar-event-editor" level={2}>{rescheduling ? t('actions.reschedule') : editing ? t('editTitle') : t('addTitle')}</Heading>
    <Text>{t('rescheduleHelp')}</Text>
    <VStack gap={3} className="min-w-0 max-w-full">
      <Selector label={t('client')} value={eventClient} options={clients.map(client => ({ value: client.id, label: client.name }))} onChange={setEventClient} isDisabled={editing !== null || rescheduling !== null} controlClassName="min-h-11" />
      <Selector label={t('filters.type')} value={eventType} options={SCHEDULE_EVENT_TYPES.map(value => ({ value, label: t(`types.${value}`) }))} onChange={setEventType} isDisabled={rescheduling !== null} controlClassName="min-h-11" />
      <TextInput label={t('eventTitle')} value={title} onChange={setTitle} isDisabled={rescheduling !== null} controlClassName="min-h-11" />
      <DateTimeInput label={t('dueAt')} value={dateTimeValue(eventAt)} onChange={value => { if (value) setEventAt(value); }} isDisabled={editing !== null} controlClassName="min-h-11" />
      <TextInput label={t('timezone')} value={zone} onChange={setZone} isDisabled={editing !== null} controlClassName="min-h-11" />
      <NumberInput label={t('windowDays')} value={windowDays} onChange={setWindowDays} isDisabled={rescheduling !== null} min={0} max={365} step={1} controlClassName="min-h-11" />
      <HStack gap={3} wrap="wrap"><Button label={rescheduling ? t('actions.reschedule') : editing ? t('actions.save') : t('actions.add')} className="min-h-11" isDisabled={!eventClient && !editing && !rescheduling} clickAction={async () => {
        setError('');
        try {
          if (rescheduling) {
            await trackingRequest(`calendar/${rescheduling.id}/reschedule`, 'POST', { dueAt: zonedDueAt(eventAt.slice(0, 10), eventAt.slice(11, 16), zone), timezone: zone });
            setRescheduling(null); await load(); return;
          }
          const translated = { ...editing?.title, [locale === 'ar' ? 'ar' : 'en']: title };
          await trackingRequest(editing ? `calendar/${editing.id}` : 'calendar', editing ? 'PATCH' : 'POST', editing ? { type: eventType, title: translated, windowDays } : { clientId: eventClient, type: eventType, title: translated, dueAt: zonedDueAt(eventAt.slice(0, 10), eventAt.slice(11, 16), zone), timezone: zone, windowDays });
          setEditing(null); setTitle(''); await load();
        } catch { setError('request_failed'); }
      }} />{editing || rescheduling ? <Button label={t('actions.closeEdit')} className="min-h-11" variant="secondary" onClick={() => { setEditing(null); setRescheduling(null); }} /> : null}</HStack>
    </VStack>
    {error ? <Text role="alert">{t(`errors.${error}`)}</Text> : null}
  </VStack></LayoutContent>} />;
}
