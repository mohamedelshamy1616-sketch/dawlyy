'use client';

import { useEffect, useRef, useState } from 'react';
import { PosePhoto } from './pose-photo';
import { useLocale, useTranslations } from 'next-intl';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { FileInput } from '@astryxdesign/core/FileInput';
import { EntryActions } from '@/components/client-corrections/entry-actions';
import { MeasurementEditor } from '@/components/client-corrections/measurement-editor';
import { useClientModules } from '@/components/client-today/client-module-provider';
import { formatNumber, numberLocale } from '@/src/lib/numbers';
import { trackingRequest, type MeasurementRow, type PhotoRow } from './contracts';
import type { TrackingCadence } from '@/src/server/tracking/cadence';

const defaultPoses = ['front', 'left', 'back'] as const;
/** Task 8: measurement logging, private uploads, timeline and responsive two-date photo comparison. */
export function ProgressPanel({ clientId, date, measurements, photos, cadence, onSaved, staffMode = false }: { clientId: string; date: string; measurements: MeasurementRow[]; photos: PhotoRow[]; cadence: TrackingCadence | null; onSaved(): void; staffMode?: boolean }) {
  const t = useTranslations('tracking'); const corrections = useTranslations('clientCorrections'); const locale = useLocale();
  const { modules, numerals } = useClientModules();
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const showMeasurements = staffMode || !!modules?.measurements; const showPhotos = staffMode || !!modules?.progress_photos;
  const [editing, setEditing] = useState<MeasurementRow | null>(null); const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const pending = (id: string, active: boolean) => setPendingIds(current => { const next = new Set(current); if (active) next.add(id); else next.delete(id); return next; });
  const poses = cadence?.progressPhotos?.rule.enabled ? cadence.progressPhotos.poses : defaultPoses;
  const [name, setName] = useState(cadence?.measurements?.fields[0]?.type ?? 'waist'); const [customName, setCustomName] = useState(''); const [side, setSide] = useState('none');
  const [value, setValue] = useState<number | null>(null); const [unit, setUnit] = useState<string>(cadence?.measurements?.fields[0]?.unit ?? 'cm');
  const [values, setValues] = useState<{ type: string; value: number; unit: string; side?: string }[]>([]);
  const [files, setFiles] = useState<Partial<Record<'front' | 'left' | 'right' | 'back', File>>>({});
  const [fromId, setFromId] = useState(photos[1]?.id ?? photos[0]?.id ?? ''); const [toId, setToId] = useState(photos[0]?.id ?? '');
  const [comparison, setComparison] = useState<{ before: PhotoRow; after: PhotoRow } | null>(null);
  const [error, setError] = useState('');
  const number = { format: (value: number) => formatNumber(value, { locale: numberLocale(locale), numerals, maximumFractionDigits: 2 }) };
  const percent = new Intl.NumberFormat(locale, { style: 'percent', numberingSystem: numerals, maximumFractionDigits: 2 });
  const day = (dateValue: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC', numberingSystem: numerals }).format(new Date(`${dateValue}T12:00:00Z`));
  function fail(cause: unknown) { if (mounted.current) setError(cause instanceof Error && cause.message === 'consent_required' ? 'consent_required' : 'request_failed'); }
  return <VStack gap={6} className="min-w-0 max-w-full">
    {showMeasurements ? <><Heading level={2}>{t('measurements.title')}</Heading>
    <Text>{t('cadenceEvidence')}</Text>
    <HStack gap={3} wrap="wrap">
      <Selector label={t('measurements.name')} value={name} options={[...new Set([...(cadence?.measurements?.fields.map(field => field.type) ?? []), 'waist', 'hip', 'chest', 'arm', 'thigh', 'calf', 'neck', 'custom'])].map(key => ({ value: key, label: t.has(`measurements.names.${key}`) ? t(`measurements.names.${key}`) : key }))} onChange={value => { setName(value); const configured = cadence?.measurements?.fields.find(field => field.type === value); if (configured) setUnit(configured.unit); }} controlClassName="min-h-11" />
      {name === 'custom' ? <TextInput label={t('measurements.customName')} value={customName} onChange={setCustomName} controlClassName="min-h-11" /> : null}
      <Selector label={t('measurements.side')} value={side} options={['none', 'left', 'right'].map(key => ({ value: key, label: t(`measurements.sides.${key}`) }))} onChange={setSide} controlClassName="min-h-11" />
      <NumberInput label={t('value')} value={value} onChange={setValue} hasClear min={0.1} max={10000} step={0.1} controlClassName="min-h-11" />
      <Selector label={t('unit')} value={unit} options={['cm', 'in'].map(key => ({ value: key, label: t(`units.${key}`) }))} onChange={setUnit} controlClassName="min-h-11" />
      <Button label={t('actions.addMeasurement')} className="min-h-11" variant="secondary" isDisabled={value === null || (name === 'custom' && !customName.trim())} onClick={() => {
        if (value === null) return;
        const type = name === 'custom' ? customName.trim() : name;
        setValues([...values.filter(item => item.type !== type || (item.side ?? 'none') !== side), { type, value, unit, ...(side === 'none' ? {} : { side }) }]); setValue(null);
      }} />
    </HStack>
    {values.map(item => <HStack key={`${item.type}:${item.side ?? ''}`} gap={2} wrap="wrap"><Text>{t.has(`measurements.names.${item.type}`) ? t(`measurements.names.${item.type}`) : item.type} {number.format(item.value)} {t(`units.${item.unit}`)}</Text><Button label={t('actions.remove')} className="min-h-11" variant="secondary" onClick={() => setValues(values.filter(entry => entry !== item))} /></HStack>)}
    <Button label={t('actions.saveMeasurements')} className="min-h-11" isDisabled={!values.length} clickAction={async () => { setError(''); try { await trackingRequest('measurements', 'POST', { clientId, localDate: date, values, clientUuid: crypto.randomUUID(), clientUpdatedAt: new Date().toISOString() }); if (mounted.current) { setValues([]); onSaved(); } } catch (cause) { fail(cause); } }} />
    {measurements.length === 0 ? <Text>{t('measurements.empty')}</Text> : measurements.map(set => <VStack key={set.id} id={`measurement-${set.id}`} data-entry-id={set.id} gap={2} className="min-w-0 border-b border-border pb-4">
      <Heading level={3}>{day(set.localDate)}</Heading>
      {set.voidedAt ? <Text>{corrections('voided')}</Text> : pendingIds.has(set.id) ? <Text>{corrections('pending')}</Text> : null}
      {measurements.find(row => row.replacesId === set.id) ? <a className="inline-flex min-h-11 items-center underline break-words" href={`#measurement-${measurements.find(row => row.replacesId === set.id)!.id}`}>{corrections('replacementLink')}</a> : null}
      {set.replacesId ? <Text>{corrections('replaced')}</Text> : null}
      {(set.deltas.length ? set.deltas : (set.values ?? []).map(item => ({ ...item, absolute: null, percent: null }))).map(item => <Text key={`${item.type}:${item.side ?? ''}`} className="grid min-w-0 gap-1 break-words rounded-lg bg-muted p-3"><span>{t.has(`measurements.names.${item.type}`) ? t(`measurements.names.${item.type}`) : item.type}{item.side ? ` · ${t(`measurements.sides.${item.side}`)}` : ''}</span><strong className="font-sans text-2xl font-extrabold tabular-nums"><bdi>{number.format(item.value)} {t(`units.${item.unit}`)}</bdi></strong> {!set.voidedAt && !pendingIds.has(set.id) ? t('delta', { absolute: item.absolute === null ? t('noBaseline') : number.format(item.absolute), percent: item.percent === null ? t('noBaseline') : percent.format(item.percent / 100) }) : ''}</Text>)}
    <EntryActions kind="measurement" id={set.id} createdAt={set.createdAt} voidedAt={set.voidedAt} onEdit={set.values?.length ? () => setEditing(set) : undefined} onChanged={onSaved} onPendingChange={active => pending(set.id, active)} />
    </VStack>)}
    {editing?.values ? <MeasurementEditor row={{ ...editing, values: editing.values, createdAt: editing.createdAt ?? null, voidedAt: editing.voidedAt ?? null, replacesId: editing.replacesId ?? null }} onClose={() => setEditing(null)} onChanged={onSaved} onPendingChange={active => pending(editing.id, active)} /> : null}
    </> : null}
    {showPhotos ? <><Heading level={2}>{t('photos.title')}</Heading>
    <Text>{t('photos.private')}</Text>
    <VStack gap={3} className="min-w-0 max-w-full">{poses.map(pose => <VStack key={pose} className="min-w-0 max-w-full"><FileInput label={t(`photos.poses.${pose}`)} value={files[pose] ?? null} accept="image/jpeg,image/png,image/webp" onChange={file => setFiles({ ...files, [pose]: file instanceof File ? file : undefined })} /></VStack>)}</VStack>
    <Button label={t('actions.savePhotos')} className="min-h-11" isDisabled={cadence?.progressPhotos?.rule.enabled ? poses.some(pose => !files[pose]) : !poses.some(pose => files[pose])} clickAction={async () => {
      setError('');
      try {
        const saved = [];
        for (const pose of poses) {
          const file = files[pose]; if (!file) continue;
          const instruction = await trackingRequest<{ mediaId: string; upload: { url: string; method: string; headers?: Record<string, string> } }>('media/uploads', 'POST', { clientId, purpose: 'progress_photo', contentType: file.type, sizeBytes: file.size, filename: file.name });
          const response = await fetch(instruction.upload.url, { method: instruction.upload.method, headers: instruction.upload.headers, body: file });
          if (!response.ok) throw new Error('request_failed');
          saved.push({ pose, mediaId: instruction.mediaId });
        }
        await trackingRequest('photos', 'POST', { clientId, localDate: date, poses: saved, clientUuid: crypto.randomUUID(), clientUpdatedAt: new Date().toISOString() }); if (mounted.current) { setFiles({}); onSaved(); }
      } catch (cause) { fail(cause); }
    }} />
    {photos.length ? <>
      <Heading level={3}>{t('photos.compare')}</Heading>
      <HStack gap={3} wrap="wrap">
        <Selector label={t('photos.before')} value={fromId} options={photos.map(photo => ({ value: photo.id, label: day(photo.localDate) }))} onChange={setFromId} controlClassName="min-h-11" />
        <Selector label={t('photos.after')} value={toId} options={photos.map(photo => ({ value: photo.id, label: day(photo.localDate) }))} onChange={setToId} controlClassName="min-h-11" />
        <Button label={t('photos.compare')} className="min-h-11" isDisabled={!fromId || !toId} clickAction={async () => { setError(''); try { const next = await trackingRequest<{ before: PhotoRow; after: PhotoRow }>(`photos/compare?clientId=${clientId}&fromId=${fromId}&toId=${toId}`); if (mounted.current) setComparison(next); } catch (cause) { fail(cause); } }} />
      </HStack>
      {comparison ? <HStack gap={4} className="!grid grid-cols-1 md:grid-cols-2 min-w-0 max-w-full">{[comparison.before, comparison.after].map((set, index) => <VStack key={`${set.id}:${index}`} gap={3} className="min-w-0 max-w-full"><Heading level={3}>{day(set.localDate)}</Heading>{set.poses.map(pose => <VStack key={pose.mediaId} gap={2}><Text>{t(`photos.poses.${pose.pose}`)}</Text><PosePhoto url={pose.url} alt={t('photos.alt', { date: day(set.localDate), pose: t(`photos.poses.${pose.pose}`) })} width={640} height={800} className="h-auto w-full max-w-full rounded-lg object-contain" /></VStack>)}</VStack>)}</HStack> : null}
      <Heading level={3}>{t('photos.timeline')}</Heading>
      {photos.map(set => <VStack key={set.id} gap={3} className="min-w-0 max-w-full border-b border-border pb-4"><Heading level={3}>{day(set.localDate)}</Heading><HStack gap={3} wrap="wrap">{set.poses.map(pose => <VStack key={pose.mediaId} gap={2} className="w-32 min-w-0 max-w-full"><PosePhoto url={pose.url} alt={t('photos.alt', { date: day(set.localDate), pose: t(`photos.poses.${pose.pose}`) })} width={160} height={200} className="h-auto w-full max-w-full rounded-lg" /><Text>{t(`photos.poses.${pose.pose}`)}</Text></VStack>)}</HStack><Button label={t('actions.deletePhotos')} className="min-h-11" variant="secondary" clickAction={async () => { setError(''); try { await trackingRequest(`photos/${set.id}`, 'DELETE'); if (mounted.current) { setComparison(null); onSaved(); } } catch (cause) { fail(cause); } }} /></VStack>)}
    </> : <Text>{t('photos.empty')}</Text>}
    </> : null}
    {error ? <Text role="alert">{t(`errors.${error}`)}</Text> : null}
  </VStack>;
}
