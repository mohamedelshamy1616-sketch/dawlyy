'use client';
import { useId, useState, type ComponentProps } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { localize, type AnswerValue, type Question } from '@dawlyy/core/types';
import { z } from 'zod';
import { Button } from '@astryxdesign/core/Button';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Field } from '@astryxdesign/core/Field';
import { FileInput } from '@astryxdesign/core/FileInput';
import { HStack } from '@astryxdesign/core/HStack';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TimeInput } from '@astryxdesign/core/TimeInput';
import { ToggleButton, ToggleButtonGroup } from '@astryxdesign/core/ToggleButton';
import { VStack } from '@astryxdesign/core/VStack';
import { formRequest } from './http';

type DateValue = ComponentProps<typeof DateInput>['value'];
type TimeValue = ComponentProps<typeof TimeInput>['value'];

type Props = {
  question: Question;
  value: AnswerValue | undefined;
  onChange(value: AnswerValue): void;
  /** Client that owns uploaded attachments. */
  clientId: string;
  disabled?: boolean;
  /** Preview inside the builder: media pickers are inert. */
  preview?: boolean;
  /** Translated error text for this question, if any. */
  error?: string;
};

/** Task 7: all twelve question controls built on Astryx; media is uploaded through signed instructions over HTTP. */
export function QuestionInput({ question: q, value, onChange, clientId, disabled, preview, error }: Props) {
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const t = useTranslations('forms');
  const id = useId();
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const label = localize(q.label, locale);
  const description = q.help ? localize(q.help, locale) : undefined;
  const status = error ? { type: 'error' as const, message: error } : undefined;
  const required = q.required ? { isRequired: true as const } : {};

  if (q.type === 'long_text') {
    return <TextArea label={label} description={description} value={typeof value === 'string' ? value : ''} isDisabled={disabled} rows={4} status={status} {...required} onChange={next => onChange(next)} />;
  }
  if (q.type === 'text') {
    return <TextInput label={label} description={description} size="lg" value={typeof value === 'string' ? value : ''} isDisabled={disabled} status={status} {...required} onChange={next => onChange(next)} />;
  }
  if (q.type === 'number') {
    return <NumberInput label={label} description={description} size="lg" width="100%" value={typeof value === 'number' ? value : null} min={q.min ?? null} max={q.max ?? null} step={1} units={q.unit ?? null} hasClear isDisabled={disabled} status={status} {...required}
      onChange={next => onChange(typeof next === 'number' && Number.isFinite(next) ? next : null)} />;
  }
  if (q.type === 'date') {
    return <DateInput label={label} description={description} size="lg" width="100%" value={typeof value === 'string' && value ? value as DateValue : undefined} isDisabled={disabled} status={status} hasClear {...required}
      onChange={next => onChange(next ?? null)} />;
  }
  if (q.type === 'time') {
    return <TimeInput label={label} description={description} size="lg" width="100%" value={typeof value === 'string' && value ? value as TimeValue : undefined} isDisabled={disabled} status={status} hasClear {...required}
      onChange={next => onChange(next ?? null)} />;
  }
  if (q.type === 'yes_no') {
    return <Field label={label} inputID={id} isGroupLabel description={description} status={status} {...required}>
      <ToggleButtonGroup label={label} value={value === true ? 'yes' : value === false ? 'no' : null} size="lg" isDisabled={disabled} onChange={next => onChange(next === 'yes' ? true : next === 'no' ? false : null)}>
        <ToggleButton value="yes" label={t('runner.yes')} />
        <ToggleButton value="no" label={t('runner.no')} />
      </ToggleButtonGroup>
    </Field>;
  }
  if (q.type === 'single' || q.type === 'multi') {
    const options = (q.options ?? []).map(option => ({ value: option.value, label: localize(option.label, locale) || option.value }));
    return <Field label={label} inputID={id} isGroupLabel description={description} status={status} {...required}>
      {q.type === 'single'
        ? <ToggleButtonGroup label={label} orientation="vertical" value={typeof value === 'string' ? value : null} size="lg" isDisabled={disabled} onChange={next => onChange(next)}>
          {options.map(option => <ToggleButton key={option.value} value={option.value} label={option.label} />)}
        </ToggleButtonGroup>
        : <ToggleButtonGroup label={label} type="multiple" orientation="vertical" value={Array.isArray(value) ? value : []} size="lg" isDisabled={disabled} onChange={next => onChange(next)}>
          {options.map(option => <ToggleButton key={option.value} value={option.value} label={option.label} />)}
        </ToggleButtonGroup>}
    </Field>;
  }
  if (q.type === 'scale') {
    const scale = q.scale ?? { min: 1, max: 10 };
    const count = Math.max(0, Math.min(101, scale.max - scale.min + 1));
    const format = new Intl.NumberFormat(locale);
    return <Field label={label} inputID={id} isGroupLabel description={description} status={status} {...required}>
      <VStack gap={2}>
        <HStack gap={2} wrap="wrap">
          {Array.from({ length: count }, (_, index) => {
            const step = scale.min + index;
            return <ToggleButton key={step} label={format.format(step)} size="lg" isDisabled={disabled} isPressed={value === step} onPressedChange={pressed => onChange(pressed ? step : null)} />;
          })}
        </HStack>
        {scale.minLabel || scale.maxLabel
          ? <HStack hAlign="between" gap={2}>
            <Text type="supporting">{localize(scale.minLabel, locale)}</Text>
            <Text type="supporting">{localize(scale.maxLabel, locale)}</Text>
          </HStack>
          : null}
      </VStack>
    </Field>;
  }

  // photo, video, file: the value is the list of media ids.
  const attachments = value && typeof value === 'object' && !Array.isArray(value) ? value.mediaIds : [];
  async function upload(file: File) {
    setUploading(true); setUploadFailed(false);
    try {
      // The existing T3b endpoint currently supports payment_proof only. T8 must extend purpose=form_answer
      // and video MIME handling; never mislabel a form attachment as payment proof to bypass that contract.
      const result = await formRequest('/media/uploads', 'POST', { clientId, purpose: 'form_answer', contentType: file.type, sizeBytes: file.size, filename: file.name }, crypto.randomUUID());
      const signed = z.object({ mediaId: z.uuid(), upload: z.object({ url: z.string(), method: z.string(), headers: z.record(z.string(), z.string()) }) }).parse(result);
      const response = await fetch(signed.upload.url, { method: signed.upload.method, headers: signed.upload.headers, body: file });
      if (!response.ok) throw new Error('Upload failed');
      onChange({ mediaIds: [...attachments, signed.mediaId] });
    } catch { setUploadFailed(true); } finally { setUploading(false); }
  }
  const failure = uploadFailed ? { type: 'error' as const, message: t('runner.uploadUnavailable') } : status;
  return <VStack gap={2}>
    <FileInput label={label} description={description} value={null} accept={q.type === 'photo' ? 'image/*' : q.type === 'video' ? 'video/*' : undefined}
      isDisabled={disabled || uploading || preview} status={failure} {...required}
      onChange={files => { const file = Array.isArray(files) ? files[0] : files; if (file) void upload(file); }} />
    {uploading ? <Text type="supporting" as="p">{t('runner.uploading')}</Text> : null}
    {attachments.map((mediaId, index) => <HStack key={mediaId} gap={2} wrap="wrap" vAlign="center">
      <Text>{t('runner.attachmentNumber', { number: format(index + 1, locale) })}</Text>
      <Button label={t('builder.remove')} variant="ghost" isDisabled={disabled} onClick={() => onChange({ mediaIds: attachments.filter(item => item !== mediaId) })} />
    </HStack>)}
  </VStack>;
}

function format(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}
