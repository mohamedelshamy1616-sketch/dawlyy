'use client';
import { useLocale, useTranslations } from 'next-intl';
import { QUESTION_TYPES, localize, type FormDocument, type LocalizedText, type Question, type VisibilityCondition } from '@dawlyy/core/types';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ToggleButton, ToggleButtonGroup } from '@astryxdesign/core/ToggleButton';
import { VStack } from '@astryxdesign/core/VStack';
import { earlierQuestions } from '@/src/server/forms/doc-ops';
import { operatorsFor, visibilitySummary } from '@/src/server/forms/presentation';

/** Task 7: bilingual text fields preserve both languages during editing. */
export function BilingualField({ label, value, onChange, disabled, required }: { label: string; value?: LocalizedText; onChange(value: LocalizedText): void; disabled?: boolean; required?: boolean }) {
  const t = useTranslations('forms');
  return <VStack gap={2}>
    <Text weight="semibold" as="p">{label}</Text>
    <TextInput label={t('builder.ar')} size="lg" value={value?.ar ?? ''} isDisabled={disabled} isRequired={required} onChange={next => onChange({ ...value, ar: next })} />
    <TextInput label={t('builder.en')} size="lg" value={value?.en ?? ''} isDisabled={disabled} isRequired={required} onChange={next => onChange({ ...value, en: next })} />
  </VStack>;
}

function nextOptionValue(options: NonNullable<Question['options']>): string {
  let n = options.length + 1;
  while (options.some(option => option.value === `o${n}`)) n += 1;
  return `o${n}`;
}

type Props = { question: Question; document: FormDocument; onChange(question: Question): void; disabled: boolean };

/** Task 7: question configuration for every type, plus a typed visibility editor restricted to earlier questions. */
export function QuestionEditor({ question: q, document, onChange, disabled }: Props) {
  const t = useTranslations('forms');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const earlier = earlierQuestions(document, q.id);
  const patch = (value: Partial<Question>) => onChange({ ...q, ...value });
  const words: Record<string, string> = { eq: t('visibility.eq'), neq: t('visibility.neq'), gt: t('visibility.gt'), lt: t('visibility.lt'), in: t('visibility.in'), answered: t('visibility.answered'), yes: t('visibility.yes'), no: t('visibility.no') };
  const reference = earlier.find(item => item.id === q.visibleIf?.questionId);
  const rule = q.visibleIf;

  function changeType(type: Question['type']) {
    const next: Question = { ...q, type };
    if (type === 'scale' && !next.scale) next.scale = { min: 1, max: 10 };
    if ((type === 'single' || type === 'multi') && !next.options) next.options = [];
    onChange(next);
  }
  function referenceChanged(questionId: string) {
    if (!questionId) { patch({ visibleIf: undefined }); return; }
    const target = earlier.find(item => item.id === questionId);
    const op = operatorsFor(target?.type)[0] ?? 'answered';
    patch({ visibleIf: { questionId, op, ...(op === 'answered' ? {} : { value: defaultValue(target, op) }) } });
  }
  function operatorChanged(op: VisibilityCondition['op']) {
    if (!rule) return;
    patch({ visibleIf: { questionId: rule.questionId, op, ...(op === 'answered' ? {} : { value: defaultValue(reference, op) }) } });
  }
  const setValue = (value: VisibilityCondition['value']) => { if (rule) patch({ visibleIf: { ...rule, value } }); };

  const optionChoices = (reference?.options ?? []).map(option => ({ value: option.value, label: localize(option.label, locale) || option.value }));
  const yesNo = [{ value: 'true', label: words.yes ?? '' }, { value: 'false', label: words.no ?? '' }];

  return <VStack gap={4}>
    <Selector label={t('builder.type')} width="100%" size="lg" isDisabled={disabled} value={q.type} options={QUESTION_TYPES.map(type => ({ value: type, label: t(`types.${type}`) }))} onChange={value => changeType(value as Question['type'])} />
    <BilingualField label={t('builder.label')} value={q.label} disabled={disabled} required onChange={label => patch({ label })} />
    <BilingualField label={t('builder.help')} value={q.help} disabled={disabled} onChange={help => patch({ help: help.ar?.trim() || help.en?.trim() ? help : undefined })} />
    <Switch label={t('builder.required')} value={q.required} isDisabled={disabled} onChange={required => patch({ required })} />

    {q.type === 'single' || q.type === 'multi'
      ? <VStack gap={3}>
        <Heading level={4}>{t('builder.options')}</Heading>
        {(q.options ?? []).map((option, index) => <Card key={option.value} variant="muted">
          <VStack gap={3}>
            <BilingualField label={t('builder.optionLabel', { number: new Intl.NumberFormat(locale).format(index + 1) })} value={option.label} disabled={disabled} required
              onChange={label => patch({ options: q.options?.map((item, i) => i === index ? { ...item, label } : item) })} />
            <HStack><Button label={t('builder.remove')} variant="ghost" isDisabled={disabled} onClick={() => patch({ options: q.options?.filter((_, i) => i !== index) })} /></HStack>
          </VStack>
        </Card>)}
        <HStack><Button label={t('builder.addOption')} isDisabled={disabled} onClick={() => patch({ options: [...q.options ?? [], { value: nextOptionValue(q.options ?? []), label: { [locale]: t('builder.newOption') } }] })} /></HStack>
      </VStack>
      : null}

    {q.type === 'scale'
      ? <VStack gap={3}>
        <HStack gap={3} wrap="wrap">
          <NumberInput label={t('builder.min')} size="lg" isIntegerOnly isDisabled={disabled} value={q.scale?.min ?? 1} onChange={min => patch({ scale: { ...q.scale, min: Number.isFinite(min) ? min : 1, max: q.scale?.max ?? 10 } })} />
          <NumberInput label={t('builder.max')} size="lg" isIntegerOnly isDisabled={disabled} value={q.scale?.max ?? 10} onChange={max => patch({ scale: { ...q.scale, min: q.scale?.min ?? 1, max: Number.isFinite(max) ? max : 10 } })} />
        </HStack>
        <BilingualField label={t('builder.minLabel')} value={q.scale?.minLabel} disabled={disabled}
          onChange={minLabel => patch({ scale: { min: q.scale?.min ?? 1, max: q.scale?.max ?? 10, ...q.scale, minLabel: minLabel.ar?.trim() || minLabel.en?.trim() ? minLabel : undefined } })} />
        <BilingualField label={t('builder.maxLabel')} value={q.scale?.maxLabel} disabled={disabled}
          onChange={maxLabel => patch({ scale: { min: q.scale?.min ?? 1, max: q.scale?.max ?? 10, ...q.scale, maxLabel: maxLabel.ar?.trim() || maxLabel.en?.trim() ? maxLabel : undefined } })} />
      </VStack>
      : null}

    {q.type === 'number'
      ? <HStack gap={3} wrap="wrap">
        <NumberInput label={t('builder.min')} size="lg" hasClear isDisabled={disabled} value={q.min ?? null} onChange={(min: number | null) => patch({ min: typeof min === 'number' ? min : undefined })} />
        <NumberInput label={t('builder.max')} size="lg" hasClear isDisabled={disabled} value={q.max ?? null} onChange={(max: number | null) => patch({ max: typeof max === 'number' ? max : undefined })} />
      </HStack>
      : null}

    {q.type === 'number' || q.type === 'scale'
      ? <VStack gap={3}>
        <TextInput label={t('builder.metricKey')} description={t('builder.metricKeyHelp')} size="lg" isDisabled={disabled} value={q.metricKey ?? ''} onChange={metricKey => patch({ metricKey: metricKey || undefined })} />
        <TextInput label={t('builder.unit')} size="lg" isDisabled={disabled} value={q.unit ?? ''} onChange={unit => patch({ unit: unit || undefined })} />
      </VStack>
      : null}

    <Card variant="muted">
      <VStack gap={3}>
        <Heading level={4}>{t('builder.visibility')}</Heading>
        <Selector label={t('builder.dependsOn')} width="100%" size="lg" isDisabled={disabled || !earlier.length} value={rule?.questionId ?? ''} placeholder={t('visibility.always')}
          options={[{ value: '', label: t('visibility.always') }, ...earlier.map(item => ({ value: item.id, label: localize(item.label, locale) || item.id }))]} onChange={referenceChanged} />
        {rule
          ? <>
            <Selector label={t('builder.operator')} width="100%" size="lg" isDisabled={disabled} value={rule.op} options={operatorsFor(reference?.type).map(op => ({ value: op, label: words[op] ?? op }))} onChange={op => operatorChanged(op as VisibilityCondition['op'])} />
            {rule.op === 'answered' ? null
              : reference?.type === 'yes_no'
                ? <Selector label={t('builder.conditionValue')} width="100%" size="lg" isDisabled={disabled} value={String(rule.value ?? true)} options={yesNo} onChange={value => setValue(value === 'true')} />
                : (reference?.type === 'single' || reference?.type === 'multi') && rule.op === 'in'
                  ? <ToggleButtonGroup label={t('builder.conditionValue')} type="multiple" orientation="vertical" size="lg" isDisabled={disabled} value={Array.isArray(rule.value) ? rule.value.map(String) : []} onChange={value => setValue(value)}>
                    {optionChoices.map(option => <ToggleButton key={option.value} value={option.value} label={option.label} />)}
                  </ToggleButtonGroup>
                  : reference?.type === 'single'
                    ? <Selector label={t('builder.conditionValue')} width="100%" size="lg" isDisabled={disabled} value={String(rule.value ?? '')} options={optionChoices} onChange={value => setValue(value)} />
                    : reference?.type === 'number' || reference?.type === 'scale'
                      ? <NumberInput label={t('builder.conditionValue')} size="lg" width="100%" isDisabled={disabled} value={typeof rule.value === 'number' ? rule.value : null} onChange={value => setValue(Number.isFinite(value) ? value : 0)} />
                      : <TextInput label={t('builder.conditionValue')} size="lg" isDisabled={disabled} value={String(rule.value ?? '')} onChange={value => setValue(value)} />}
            <Text type="supporting" as="p">{t('visibility.summary', { rule: visibilitySummary(document, rule, locale, words) })}</Text>
          </>
          : <Text type="supporting" as="p">{earlier.length ? t('visibility.alwaysHint') : t('visibility.noEarlier')}</Text>}
      </VStack>
    </Card>
  </VStack>;
}

function defaultValue(target: Question | undefined, op: VisibilityCondition['op']): VisibilityCondition['value'] {
  if (op === 'in') return [];
  if (target?.type === 'yes_no') return true;
  if (target?.type === 'single' || target?.type === 'multi') return target.options?.[0]?.value ?? '';
  if (target?.type === 'number' || target?.type === 'scale') return target.scale?.min ?? 0;
  return '';
}
