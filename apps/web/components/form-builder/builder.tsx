'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { validateDocument } from '@dawlyy/core/forms';
import { FormDocument, QUESTION_TYPES, localize, type LocalizedText, type Question, type QuestionType } from '@dawlyy/core/types';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { StackItem } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { VStack } from '@astryxdesign/core/VStack';
import { FormRequestError, formRequest } from '../form-runner/http';
import { FormPreview } from '../form-runner/runner';
import { addQuestion, addSection, moveQuestion, moveSection, newQuestion, newSection, removeQuestion, removeSection, updateQuestion, updateSection } from '@/src/server/forms/doc-ops';
import { visibilitySummary } from '@/src/server/forms/presentation';
import { detailSchema, type FormDetail, type FormGrants } from './contracts';
import { BilingualField, QuestionEditor } from './question-editor';
import { FormStatus } from './status';

type Removal = { kind: 'section' | 'question'; id: string } | null;
const shortId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

/** Task 7: sections and questions tree, typed editors, visibility rules, live preview and the version bar. */
export function FormBuilder({ initial, grants }: { initial: FormDetail; grants: FormGrants }) {
  const t = useTranslations('forms');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const router = useRouter();
  const id = initial.head.id;
  const [document, setDocument] = useState(initial.currentVersion.document);
  const docRef = useRef(document);
  const base = useRef({ versionNo: initial.currentVersion.versionNo, revision: initial.revision });
  const [version, setVersion] = useState({ number: initial.currentVersion.versionNo, status: initial.currentVersion.status });
  const [issues, setIssues] = useState(initial.issues);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState('');
  const [stale, setStale] = useState(false);
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [openId, setOpenId] = useState('');
  const [removal, setRemoval] = useState<Removal>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [changeNote, setChangeNote] = useState(initial.currentVersion.changeNote ?? '');
  const [publishIssues, setPublishIssues] = useState<string[]>([]);
  const flight = useRef<Promise<boolean> | null>(null);
  const blocked = useRef(false);
  const mounted = useRef(true);
  const readOnly = version.status !== 'draft' || !grants.edit || stale;
  const canWrite = grants.edit && !stale;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const errorFor = useCallback((error: unknown) => (error instanceof FormRequestError && t.has(`errors.${error.code}`) ? error.code : 'request_failed'), [t]);

  function apply(detail: FormDetail) {
    base.current = { versionNo: detail.currentVersion.versionNo, revision: detail.revision };
    setVersion({ number: detail.currentVersion.versionNo, status: detail.currentVersion.status });
    setIssues(detail.issues);
  }

  /** Serial draft save: one request in flight, the newest local document always wins. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (flight.current) return flight.current;
    if (!dirtyRef.current) return !blocked.current;
    if (blocked.current) return false;
    const sent = docRef.current;
    const parsed = FormDocument.safeParse(sent);
    if (!parsed.success) { setErrorKey('invalid_document'); return false; }
    const operation = (async () => {
      if (mounted.current) { setBusy(true); setErrorKey(''); }
      try {
        const body = { document: parsed.data, baseVersionNo: base.current.versionNo, baseRevision: base.current.revision };
        const detail = detailSchema.parse(await formRequest(`/forms/${id}/draft`, 'PUT', body, crypto.randomUUID()));
        if (!mounted.current) return true;
        apply(detail);
        if (docRef.current === sent) { dirtyRef.current = false; setDirty(false); } else setTick(value => value + 1);
        return true;
      } catch (error) {
        blocked.current = true;
        if (mounted.current) { setErrorKey(errorFor(error)); if (error instanceof FormRequestError && error.code === 'stale_draft') setStale(true); }
        return false;
      } finally { flight.current = null; if (mounted.current) setBusy(false); }
    })();
    flight.current = operation;
    return operation;
  }, [id, errorFor]);

  useEffect(() => {
    if (!dirty || stale || blocked.current) return;
    const timer = setTimeout(() => { void flush(); }, 1200);
    return () => clearTimeout(timer);
  }, [dirty, tick, stale, flush]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function edit(next: typeof document) {
    if (readOnly || next === docRef.current) return;
    docRef.current = next; setDocument(next); dirtyRef.current = true; setDirty(true); setTick(value => value + 1); setErrorKey('');
  }
  async function startDraft() {
    dirtyRef.current = true; setDirty(true);
    await flush();
  }
  async function publish() {
    setPublishIssues([]);
    if (!(await flush())) return;
    try {
      await formRequest(`/forms/${id}/publish`, 'POST', { ...(changeNote.trim() ? { changeNote: changeNote.trim() } : {}) }, crypto.randomUUID());
      apply(detailSchema.parse(await formRequest(`/forms/${id}`)));
      setPublishOpen(false); setErrorKey(''); router.refresh();
    } catch (error) {
      if (error instanceof FormRequestError && error.code === 'form_invalid' && Array.isArray(error.details)) {
        setPublishIssues(error.details.map(item => (item && typeof item === 'object' && 'message' in item ? localize(item.message as LocalizedText, locale) : '')).filter(Boolean));
      }
      setErrorKey(errorFor(error));
    }
  }
  function confirmRemoval() {
    if (!removal) return;
    edit(removal.kind === 'section' ? removeSection(docRef.current, removal.id) : removeQuestion(docRef.current, removal.id));
    setRemoval(null);
  }

  const number = new Intl.NumberFormat(locale);
  const localIssues = validateDocument(document);
  const allIssues = [...issues.map(item => localize(item.message, locale)), ...localIssues.map(item => localize(item.message, locale))];
  const uniqueIssues = [...new Set(allIssues)];
  const words: Record<string, string> = { eq: t('visibility.eq'), neq: t('visibility.neq'), gt: t('visibility.gt'), lt: t('visibility.lt'), in: t('visibility.in'), answered: t('visibility.answered'), yes: t('visibility.yes'), no: t('visibility.no') };
  const saveState = busy ? t('builder.saving') : errorKey === 'invalid_document' ? t('builder.invalidLocal') : dirty ? t('builder.unsaved') : t('builder.saved');
  const defaultLabel = (): LocalizedText => ({ [locale]: t('builder.newQuestion') });

  return <VStack gap={4} maxWidth="100%">
    <VStack gap={2} paddingBlock={2} className="sticky top-0 z-10 bg-background">
      <HStack gap={2} wrap="wrap" vAlign="center">
        <FormStatus status={version.status} />
        <Text weight="semibold">{t('builder.version', { number: number.format(version.number) })}</Text>
        <Text type="supporting" aria-live="polite">{saveState}</Text>
      </HStack>
      <HStack gap={2} wrap="wrap" vAlign="center">
        <StackItem size="fill">
          <SegmentedControl label={t('builder.mode')} value={mode} size="lg" layout="fill" onChange={value => setMode(value === 'preview' ? 'preview' : 'edit')}>
            <SegmentedControlItem value="edit" label={t('builder.edit')} />
            <SegmentedControlItem value="preview" label={t('builder.preview')} />
          </SegmentedControl>
        </StackItem>
        {grants.publish && version.status === 'draft' && !stale
          ? <Button label={t('builder.publish')} variant="primary" size="lg" isDisabled={busy} onClick={() => { setPublishIssues([]); setPublishOpen(true); }} />
          : null}
      </HStack>
    </VStack>

    {version.status !== 'draft' && grants.edit && !stale
      ? <Banner status="info" title={t('builder.readOnlyTitle')} description={t('builder.readOnlyBody')} collapsible={false}
        endContent={<Button label={t('builder.createDraft')} variant="primary" isLoading={busy} onClick={() => void startDraft()} />} />
      : null}
    {stale
      ? <Banner status="error" title={t('errors.stale_draft')} collapsible={false} endContent={<Button label={t('builder.reload')} variant="primary" onClick={() => router.refresh()} />} />
      : null}
    {errorKey && !stale ? <Banner status="error" title={t(`errors.${errorKey}`)} collapsible={false} /> : null}
    {uniqueIssues.length && mode === 'edit'
      ? <Banner status="warning" title={t('builder.issues', { count: number.format(uniqueIssues.length) })} collapsible={{ defaultIsOpen: false }}>
        <VStack gap={1}>{uniqueIssues.map(issue => <Text key={issue} as="p">{issue}</Text>)}</VStack>
      </Banner>
      : null}

    {mode === 'preview'
      ? <Card><VStack gap={3}><Heading level={2}>{t('builder.previewTitle')}</Heading><Text type="supporting" as="p">{t('builder.previewHint')}</Text><FormPreview document={document} /></VStack></Card>
      : <VStack gap={4}>
        <Card>
          <Collapsible defaultIsOpen={false} trigger={<Text weight="semibold">{t('builder.settings')}</Text>}>
            <VStack gap={3} paddingBlockStart={3}>
              <BilingualField label={t('builder.intro')} value={document.intro} disabled={readOnly} onChange={intro => edit({ ...document, intro: intro.ar?.trim() || intro.en?.trim() ? intro : undefined })} />
              <NumberInput label={t('builder.minutes')} size="lg" width="100%" hasClear isIntegerOnly min={1} isDisabled={readOnly} value={document.estimatedMinutes ?? null}
                onChange={(value: number | null) => edit({ ...document, estimatedMinutes: typeof value === 'number' && value > 0 ? Math.round(value) : undefined })} />
            </VStack>
          </Collapsible>
        </Card>

        {document.sections.map((section, sectionIndex) => <Card key={section.id}>
          <VStack gap={4}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <StackItem size="fill"><Heading level={3}>{t('builder.sectionN', { number: number.format(sectionIndex + 1) })}</Heading></StackItem>
              <IconButton label={t('builder.moveUp')} icon={<ArrowUp aria-hidden />} variant="ghost" size="lg" isDisabled={!canWrite || sectionIndex === 0 || readOnly} onClick={() => edit(moveSection(document, section.id, -1))} />
              <IconButton label={t('builder.moveDown')} icon={<ArrowDown aria-hidden />} variant="ghost" size="lg" isDisabled={!canWrite || sectionIndex === document.sections.length - 1 || readOnly} onClick={() => edit(moveSection(document, section.id, 1))} />
              <IconButton label={t('builder.removeSection')} icon={<Trash2 aria-hidden />} variant="ghost" size="lg" isDisabled={!canWrite || readOnly || document.sections.length < 2}
                onClick={() => section.questions.length ? setRemoval({ kind: 'section', id: section.id }) : edit(removeSection(document, section.id))} />
            </HStack>
            <BilingualField label={t('builder.sectionTitle')} value={section.title} disabled={readOnly} required onChange={title => edit(updateSection(document, section.id, { title }))} />
            <BilingualField label={t('builder.sectionDescription')} value={section.description} disabled={readOnly}
              onChange={description => edit(updateSection(document, section.id, { description: description.ar?.trim() || description.en?.trim() ? description : undefined }))} />

            {!section.questions.length ? <Text color="secondary" as="p">{t('builder.noQuestions')}</Text> : null}
            {section.questions.map(question => <Card key={question.id} variant="muted">
              <VStack gap={2}>
                <Collapsible isOpen={openId === question.id} onOpenChange={open => setOpenId(open ? question.id : '')}
                  trigger={<VStack gap={1}>
                    <Text weight="semibold" wordBreak="break-word">{localize(question.label, locale) || t('builder.untitled')}</Text>
                    <HStack gap={1} wrap="wrap">
                      <Badge label={t(`types.${question.type}`)} variant="neutral" />
                      {question.required ? <Badge label={t('runner.required')} variant="info" /> : null}
                    </HStack>
                  </VStack>}>
                  <VStack paddingBlockStart={3}>
                    <QuestionEditor question={question} document={document} disabled={readOnly} onChange={next => edit(updateQuestion(document, next as Question))} />
                  </VStack>
                </Collapsible>
                {question.visibleIf ? <Text type="supporting" as="p">{t('visibility.summary', { rule: visibilitySummary(document, question.visibleIf, locale, words) })}</Text> : null}
                <HStack gap={1} wrap="wrap">
                  <IconButton label={t('builder.moveUp')} icon={<ArrowUp aria-hidden />} variant="ghost" size="lg" isDisabled={readOnly} onClick={() => edit(moveQuestion(document, question.id, -1))} />
                  <IconButton label={t('builder.moveDown')} icon={<ArrowDown aria-hidden />} variant="ghost" size="lg" isDisabled={readOnly} onClick={() => edit(moveQuestion(document, question.id, 1))} />
                  <IconButton label={t('builder.removeQuestion')} icon={<Trash2 aria-hidden />} variant="ghost" size="lg" isDisabled={readOnly} onClick={() => setRemoval({ kind: 'question', id: question.id })} />
                </HStack>
              </VStack>
            </Card>)}

            <Selector label={t('builder.addQuestion')} width="100%" size="lg" isDisabled={readOnly} value="" placeholder={t('builder.addQuestionPlaceholder')}
              options={QUESTION_TYPES.map(type => ({ value: type, label: t(`types.${type}`) }))}
              onChange={value => {
                const questionId = shortId('q');
                edit(addQuestion(document, section.id, newQuestion(value as QuestionType, questionId, defaultLabel())));
                setOpenId(questionId);
              }} />
          </VStack>
        </Card>)}

        <HStack><Button label={t('builder.addSection')} size="lg" isDisabled={readOnly} onClick={() => edit(addSection(document, newSection(shortId('s'), defaultLabel()), document.sections[document.sections.length - 1]?.id))} /></HStack>
      </VStack>}

    <Dialog isOpen={!!removal} onOpenChange={open => { if (!open) setRemoval(null); }} purpose="form" padding={4}>
      <DialogHeader title={t(removal?.kind === 'section' ? 'builder.removeSectionTitle' : 'builder.removeQuestionTitle')} onOpenChange={open => { if (!open) setRemoval(null); }} />
      <VStack gap={3} paddingBlockStart={3}>
        <Text as="p">{t(removal?.kind === 'section' ? 'builder.removeSectionBody' : 'builder.removeQuestionBody')}</Text>
        <HStack gap={2} hAlign="end" wrap="wrap">
          <Button label={t('builder.cancel')} variant="secondary" size="lg" onClick={() => setRemoval(null)} />
          <Button label={t('builder.remove')} variant="destructive" size="lg" onClick={confirmRemoval} />
        </HStack>
      </VStack>
    </Dialog>

    <Dialog isOpen={publishOpen} onOpenChange={setPublishOpen} purpose="form" padding={4}>
      <DialogHeader title={t('builder.publishTitle')} onOpenChange={setPublishOpen} />
      <VStack gap={3} paddingBlockStart={3}>
        <Text as="p">{t('builder.publishBody')}</Text>
        <TextArea label={t('builder.changeNote')} description={t('builder.changeNoteHelp')} value={changeNote} rows={3} isOptional onChange={setChangeNote} />
        {publishIssues.length || uniqueIssues.length
          ? <Banner status="warning" title={t('builder.issues', { count: number.format(publishIssues.length || uniqueIssues.length) })} collapsible={false}>
            <VStack gap={1}>{(publishIssues.length ? publishIssues : uniqueIssues).map(issue => <Text key={issue} as="p">{issue}</Text>)}</VStack>
          </Banner>
          : null}
        {errorKey && publishOpen ? <Banner status="error" title={t(`errors.${errorKey}`)} collapsible={false} /> : null}
        <HStack gap={2} hAlign="end" wrap="wrap">
          <Button label={t('builder.cancel')} variant="secondary" size="lg" onClick={() => setPublishOpen(false)} />
          <Button label={t('builder.publish')} variant="primary" size="lg" isLoading={busy} isDisabled={!!uniqueIssues.length} onClick={() => void publish()} />
        </HStack>
      </VStack>
    </Dialog>
  </VStack>;
}
