'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { CLIENT_MODULES, type ClientModule, type ClientModules } from '@dawlyy/core/types';
import { Link } from '@/i18n/navigation';
import { formatNumber } from '@/src/lib/numbers';
import {
  appliesOn, countOn, effectiveFromRows, hasComposerRow, otherRows, planClientSave, resolveComposerPreview,
  sameSelection, selectionFromModules, selectionFromRows, selectionToTenantModules, uniformSelection,
  type ComposerOverrideRow, type ComposerSelection, type ModuleChoice,
} from '@/src/lib/client-app-composer/state';
import {
  browserTransport, type ComposerFailure, type ComposerResult, type ComposerTransport,
} from '@/src/lib/client-app-composer/transport';
import { ModuleRow } from './module-row';
import { PhonePreview } from './phone-preview';
import type { ComposerSeed } from './types';

const frame = 'min-w-0 max-w-full';

type Phase =
  | { kind: 'idle' }
  | { kind: 'pending'; action: 'save' | 'reset' | 'check' }
  | { kind: 'done'; action: 'save' | 'reset' }
  | { kind: 'failed'; failure: ComposerFailure; action: 'save' | 'reset' };

/** A transient route fallback; every settled state below is not busy. */
export function ComposerLoading() {
  const t = useTranslations('clientAppComposer');
  return <Text as="p" role="status" aria-live="polite" aria-busy="true">{t('loading')}</Text>;
}

/** A settled load failure with a retry link back to the same route. */
export function ComposerLoadError({ href }: { href: string }) {
  const t = useTranslations('clientAppComposer');
  return (
    <VStack gap={3} className={frame}>
      <Text as="p" role="alert">{t('errors.load')}</Text>
      <Button label={t('load.retry')} href={href} variant="secondary" className="min-h-11 min-w-11 self-start" />
    </VStack>
  );
}

/**
 * R2c: the client app composer. Choices stay local until Save, only an authoritative success marks them saved,
 * and a refusal keeps them. Rendering and toggling never make a request.
 */
export function ClientAppComposer({ seed, transport }: { seed: ComposerSeed; transport?: ComposerTransport }) {
  const t = useTranslations('clientAppComposer');
  const api = transport ?? browserTransport();
  const client = seed.mode === 'client';
  const today = seed.mode === 'client' ? seed.today : '1970-01-01';
  const [tenant, setTenant] = useState<ClientModules>(seed.tenantModules);
  const [rows, setRows] = useState<ComposerOverrideRow[]>(seed.mode === 'client' ? seed.rows : []);
  const baselineOf = (nextTenant: ClientModules, nextRows: readonly ComposerOverrideRow[]): ComposerSelection =>
    (client ? selectionFromRows(nextRows, today) : selectionFromModules(nextTenant));
  const [selection, setSelection] = useState<ComposerSelection>(() => baselineOf(seed.tenantModules, seed.mode === 'client' ? seed.rows : []));
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const baseline = baselineOf(tenant, rows);
  const dirty = !sameSelection(selection, baseline);
  const pending = phase.kind === 'pending';
  const editable = seed.canSave && !pending;
  const number = { locale: seed.locale, numerals: seed.numerals, maximumFractionDigits: 0 } as const;

  // What the app shows now, and what it would show after Save.
  const current: ClientModules = client ? effectiveFromRows(tenant, rows, today) : tenant;
  const after: ClientModules = client
    ? resolveComposerPreview({ tenant, rows, today, selection, intent: 'save' })
    : selectionToTenantModules(selection);
  const hasOther = (module: ClientModule) => otherRows(rows).some(row => appliesOn(row.override, today) && typeof row.override.modules?.[module] === 'boolean');

  const choose = (module: ClientModule, choice: ModuleChoice) => {
    if (!editable) return;
    setSelection(previous => ({ ...previous, [module]: choice }));
    setPhase({ kind: 'idle' });
  };

  /** Apply an authoritative result; returns whether it was a success. */
  function settle<T>(result: ComposerResult<T>, action: 'save' | 'reset', apply: (data: T) => void): void {
    if (result.ok) { apply(result.data); setPhase({ kind: 'done', action }); } else setPhase({ kind: 'failed', failure: result, action });
  }

  async function save() {
    if (!seed.canSave || pending) return;
    setPhase({ kind: 'pending', action: 'save' });
    if (seed.mode === 'tenant') {
      const result = await api.putTenantModules(selectionToTenantModules(selection));
      settle(result, 'save', saved => { setTenant(saved); setSelection(selectionFromModules(saved)); });
      return;
    }
    const plan = planClientSave(selection);
    const result = plan.action === 'reset' ? await api.deleteClientOverride(seed.clientId) : await api.putClientOverride(seed.clientId, plan.modules);
    settle(result, plan.action === 'reset' ? 'reset' : 'save', next => { setRows(next); setSelection(selectionFromRows(next, today)); });
  }

  async function reset() {
    if (seed.mode !== 'client' || !seed.canSave || pending) return;
    setPhase({ kind: 'pending', action: 'reset' });
    settle(await api.deleteClientOverride(seed.clientId), 'reset', next => { setRows(next); setSelection(uniformSelection('inherit')); });
  }

  /** Refresh the authoritative data before claiming any result after an unknown outcome. */
  async function check() {
    if (pending) return;
    setPhase({ kind: 'pending', action: 'check' });
    if (seed.mode === 'tenant') {
      const result = await api.getTenantModules();
      if (!result.ok) { setPhase({ kind: 'failed', failure: result, action: 'save' }); return; }
      setTenant(result.data);
      setPhase(sameSelection(selection, selectionFromModules(result.data)) ? { kind: 'done', action: 'save' } : { kind: 'idle' });
      return;
    }
    const result = await api.getClientOverrides(seed.clientId);
    if (!result.ok) { setPhase({ kind: 'failed', failure: result, action: 'save' }); return; }
    setRows(result.data);
    setPhase(sameSelection(selection, selectionFromRows(result.data, today)) ? { kind: 'done', action: 'save' } : { kind: 'idle' });
  }

  const failure = phase.kind === 'failed' ? phase.failure : null;
  const failureText = failure ? t(`errors.${failure.kind}`) : null;
  const shown = formatNumber(countOn(after), number);
  const total = formatNumber(CLIENT_MODULES.length, number);

  return (
    <VStack gap={6} className={frame} dir={seed.locale === 'ar' ? 'rtl' : 'ltr'} aria-busy={pending ? true : undefined}>
      <VStack gap={2} className={frame}>
        <Link href={seed.mode === 'client' ? `/coach/clients/${seed.clientId}` : '/coach/settings'} className="focus-ring inline-flex min-h-11 min-w-11 max-w-full items-center self-start break-words rounded-lg">
          {t(seed.mode === 'client' ? 'back.client' : 'back.settings')}
        </Link>
        <Heading level={1} wordBreak="break-word">{t('title')}</Heading>
        <Text as="p" color="secondary" wordBreak="break-word">
          {seed.mode === 'client' ? t('subtitle.client', { name: seed.clientName }) : t('subtitle.tenant')}
        </Text>
        <Text as="p" wordBreak="break-word">{t(seed.mode === 'client' ? 'intro.client' : 'intro.tenant')}</Text>
        <Text as="p" color="secondary" wordBreak="break-word">{t('scope')}</Text>
      </VStack>

      {!seed.canSave ? <Banner status="info" title={t('readOnly.title')} description={t(seed.mode === 'client' ? 'readOnly.client' : 'readOnly.tenant')} role="note" /> : null}

      <HStack gap={6} wrap="wrap" align="start" className={frame}>
        <VStack gap={3} className="min-w-0 max-w-full flex-1 basis-80">
          <Heading level={2}>{t('modules.title')}</Heading>
          <Text as="p" role="status" data-testid="composer-summary">
            {countOn(after) === 0 ? t('summary.allOff') : t('summary.shown', { shown, total })}
          </Text>
          <VStack as="ul" gap={0} className="m-0 min-w-0 max-w-full list-none p-0" aria-label={t('modules.title')}>
            {CLIENT_MODULES.map(module => (
              <ModuleRow
                key={module} module={module} mode={seed.mode} choice={selection[module]} disabled={!editable}
                onChange={choice => choose(module, choice)} tenantDefault={tenant[module]}
                {...(client ? { current: current[module], after: after[module], otherOverride: hasOther(module) } : {})}
              />
            ))}
          </VStack>

          <Text as="p" role="status" data-testid="composer-status" wordBreak="break-word">
            {phase.kind === 'pending' ? t('status.pending')
              : phase.kind === 'done' ? t(phase.action === 'reset' ? 'status.resetDone' : 'status.saved')
                : dirty ? t('status.unsaved') : t('status.clean')}
          </Text>
          {failure ? <Text as="p" role="alert" data-testid="composer-error" wordBreak="break-word">{failureText}</Text> : null}
          {failure?.indeterminate ? <Text as="p" role="status" wordBreak="break-word">{t('status.unknown')}</Text> : null}

          <HStack gap={2} wrap="wrap">
            {seed.canSave ? (
              <Button
                label={t(phase.kind === 'pending' && phase.action === 'save' ? 'actions.saving' : failure?.indeterminate ? 'actions.retry' : 'actions.save')}
                variant="primary" className="min-h-11 min-w-11" isDisabled={pending || (!dirty && !failure?.indeterminate)} onClick={() => { void save(); }}
              />
            ) : null}
            {failure?.indeterminate ? (
              <Button label={t('actions.check')} variant="secondary" className="min-h-11 min-w-11" isDisabled={pending} onClick={() => { void check(); }} />
            ) : null}
            {seed.canSave && dirty && !pending ? (
              <Button label={t('actions.discard')} variant="ghost" className="min-h-11 min-w-11" onClick={() => { setSelection(baseline); setPhase({ kind: 'idle' }); }} />
            ) : null}
            {seed.canSave && seed.mode === 'client' && hasComposerRow(rows) ? (
              <Button
                label={t(phase.kind === 'pending' && phase.action === 'reset' ? 'actions.resetting' : 'actions.reset')}
                variant="secondary" className="min-h-11 min-w-11" isDisabled={pending} onClick={() => { void reset(); }}
              />
            ) : null}
          </HStack>
        </VStack>

        <VStack gap={2} className="min-w-0 max-w-full flex-1 basis-80">
          <PhonePreview modules={after} locale={seed.locale} numerals={seed.numerals} />
        </VStack>
      </HStack>
    </VStack>
  );
}
