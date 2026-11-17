'use client';
import { useTranslations } from 'next-intl';
import { Heading } from '@astryxdesign/core/Heading';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { ClientModule } from '@dawlyy/core/types';
import type { ModuleChoice } from '@/src/lib/client-app-composer/state';

export type ModuleRowProps = {
  module: ClientModule;
  mode: 'tenant' | 'client';
  choice: ModuleChoice;
  onChange: (choice: ModuleChoice) => void;
  disabled: boolean;
  /** The tenant default for this module. */
  tenantDefault: boolean;
  /** Client mode: what the client sees now, and what Save would give. */
  current?: boolean;
  after?: boolean;
  /** Another saved override (not this composer's) also sets this module. */
  otherOverride?: boolean;
};

const state = (on: boolean) => (on ? 'on' : 'off');

/** R2c: one module as a compact labelled row: a switch for defaults, Inherit/Show/Hide for a client. */
export function ModuleRow({ module, mode, choice, onChange, disabled, tenantDefault, current, after, otherOverride }: ModuleRowProps) {
  const t = useTranslations('clientAppComposer');
  const name = t(`modules.${module}.name`);
  return (
    <VStack as="li" gap={2} className="min-w-0 max-w-full list-none border-b py-3" data-testid={`module-${module}`}>
      {mode === 'tenant' ? (
        <Switch
          label={name} description={t(`modules.${module}.help`)} value={choice === 'on'} isDisabled={disabled}
          onChange={checked => onChange(checked ? 'on' : 'off')} className="min-h-11"
        />
      ) : (
        <>
          <Heading level={3}>{name}</Heading>
          <Text as="p" color="secondary">{t(`modules.${module}.help`)}</Text>
          <RadioList
            label={t('choice.groupLabel', { module: name })} isLabelHidden orientation="horizontal"
            value={choice} isDisabled={disabled} onChange={value => onChange(value as ModuleChoice)}
          >
            {(['inherit', 'on', 'off'] as const).map(value => (
              <RadioListItem key={value} value={value} label={t(`choice.${value}`)} className="min-h-11" />
            ))}
          </RadioList>
          <Text as="p" color="secondary" className="text-sm">{t('state.defaultIs', { state: state(tenantDefault) })}</Text>
          {current !== undefined ? <Text as="p" className="text-sm">{t('state.nowIs', { state: state(current) })}</Text> : null}
          {after !== undefined ? <Text as="p" weight="medium" className="text-sm">{t('state.afterIs', { state: state(after) })}</Text> : null}
          {otherOverride ? <Text as="p" color="secondary" className="text-sm">{t('state.otherOverride')}</Text> : null}
        </>
      )}
    </VStack>
  );
}
