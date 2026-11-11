'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { localize } from '@dawlyy/core/types';
import { z } from 'zod';
import { useRouter } from '@/i18n/navigation';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack } from '@astryxdesign/core/HStack';
import { Selector } from '@astryxdesign/core/Selector';
import { VStack } from '@astryxdesign/core/VStack';
import { FormRequestError, formRequest } from '../form-runner/http';
import { ClientPicker } from './client-picker';
import { coachFormPath, type FormKind } from './contracts';

/** Task 7: a published template a coach can send or customise. */
export type TemplateChoice = { id: string; name: { ar?: string; en?: string } };
type DateValue = Parameters<NonNullable<React.ComponentProps<typeof DateInput>['onChange']>>[0];

type Props = {
  mode: 'send' | 'customize';
  formKind: FormKind;
  templates: TemplateChoice[];
  isOpen: boolean;
  onOpenChange(open: boolean): void;
};

/** Task 7: coach actions for one client; send creates a manual calendar event, customize makes a private copy. */
export function FormActionDialog({ mode, formKind, templates, isOpen, onOpenChange }: Props) {
  const t = useTranslations('forms');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const router = useRouter();
  const [clientId, setClientId] = useState('');
  const [formId, setFormId] = useState(templates[0]?.id ?? '');
  const [due, setDue] = useState<DateValue>(undefined);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState('');
  const [sent, setSent] = useState(false);
  const chosen = templates.length === 1 ? templates[0]?.id ?? '' : formId;

  async function run() {
    if (!clientId || !chosen) { setErrorKey('pick_required'); return; }
    setBusy(true); setErrorKey(''); setSent(false);
    try {
      if (mode === 'send') {
        const dueAt = due ? new Date(`${due}T09:00:00`).toISOString() : undefined;
        await formRequest('/forms/send', 'POST', { clientId, formId: chosen, formKind, ...(dueAt ? { dueAt } : {}) }, crypto.randomUUID());
        setSent(true);
      } else {
        const copy = z.object({ head: z.object({ id: z.string() }) }).parse(await formRequest(`/forms/${chosen}/customize`, 'POST', { clientId }, crypto.randomUUID()));
        onOpenChange(false);
        router.push(`${coachFormPath(formKind)}/${copy.head.id}`);
      }
    } catch (error) {
      setErrorKey(error instanceof FormRequestError && t.has(`errors.${error.code}`) ? error.code : 'request_failed');
    } finally { setBusy(false); }
  }

  return <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" padding={4}>
    <DialogHeader title={t(mode === 'send' ? 'actions.sendTitle' : 'actions.customizeTitle')} subtitle={t(mode === 'send' ? 'actions.sendHint' : 'actions.customizeHint')} onOpenChange={onOpenChange} />
    <VStack gap={3} paddingBlockStart={3}>
      {templates.length > 1
        ? <Selector label={t('actions.template')} width="100%" size="lg" value={formId} options={templates.map(item => ({ value: item.id, label: localize(item.name, locale) }))} onChange={setFormId} isRequired />
        : null}
      <ClientPicker value={clientId} onChange={setClientId} />
      {mode === 'send' ? <DateInput label={t('actions.dueDate')} description={t('actions.dueHint')} size="lg" width="100%" hasClear value={due} onChange={setDue} /> : null}
      {errorKey ? <Banner status="error" title={t(`errors.${errorKey}`)} collapsible={false} /> : null}
      {sent ? <Banner status="success" title={t('actions.sent')} collapsible={false} /> : null}
      <HStack gap={2} hAlign="end" wrap="wrap">
        <Button label={t('builder.cancel')} variant="secondary" size="lg" onClick={() => onOpenChange(false)} />
        <Button label={t(mode === 'send' ? 'actions.send' : 'actions.customize')} variant="primary" size="lg" isLoading={busy} onClick={() => void run()} />
      </HStack>
    </VStack>
  </Dialog>;
}

/** Task 7: button that opens the send dialog from a hub header. */
export function SendFormButton({ formKind, templates, label }: { formKind: FormKind; templates: TemplateChoice[]; label: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button label={label} variant="primary" size="lg" isDisabled={!templates.length} onClick={() => setOpen(true)} />
    <FormActionDialog key={String(open)} mode="send" formKind={formKind} templates={templates} isOpen={open} onOpenChange={setOpen} />
  </>;
}
