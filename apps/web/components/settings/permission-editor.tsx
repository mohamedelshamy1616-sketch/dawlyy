'use client';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ACTIONS, MODULES, PRESETS, describePermissions, diffPermissions, permissionsFromPreset, type Action, type Module } from '@dawlyy/core/authz';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { VStack } from '@astryxdesign/core/VStack';
import { useRouter } from '@/i18n/navigation';
import { isGranted, isPresetId, normalizeModules, toggleAction, type ModuleGrants } from '@/src/server/team/permission-edit';
import type { PermissionChange, TeamMember } from '@/src/server/team/service';
import { usePresetOptions } from './preset-options';
import { errorKey, settingsRequest } from './request';

const CUSTOM = 'custom';

function sameModules(a: ModuleGrants, b: ModuleGrants): boolean {
  return JSON.stringify(normalizeModules(a)) === JSON.stringify(normalizeModules(b));
}

/**
 * Task 11: preset picker, scope choice and a module by action grid with a plain-language summary and a list of
 * changes before saving. PUT /team/{id}/permissions stores `{ client_scope, modules, preset? }` and returns the diff.
 */
export function PermissionEditor({ member }: { member: TeamMember }) {
  const t = useTranslations('settings.permissions');
  const s = useTranslations('settings.shared');
  const locale = useLocale() === 'en' ? 'en' : 'ar';
  const router = useRouter();
  const presetOptions = usePresetOptions();

  const initialScope = member.clientScope === 'all' ? 'all' : 'assigned';
  const [baseline, setBaseline] = useState<{ scope: string; modules: ModuleGrants; preset: string }>(() => ({
    scope: initialScope, modules: normalizeModules(member.modules), preset: member.preset && isPresetId(member.preset) ? member.preset : CUSTOM,
  }));
  const [scope, setScope] = useState(baseline.scope);
  const [modules, setModules] = useState<ModuleGrants>(baseline.modules);
  const [preset, setPreset] = useState(baseline.preset);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const name = member.displayName ?? t('custom');
  const moduleLabel = (module: string) => t(`modules.${module}`);
  const actionLabel = (action: string) => t(`actions.${action}`);
  const list = (actions: readonly string[]) => (actions.includes('manage') ? t('all') : actions.map(actionLabel).join(', '));

  const changes = useMemo(
    () => diffPermissions({ client_scope: baseline.scope as 'all' | 'assigned', modules: baseline.modules }, { client_scope: scope as 'all' | 'assigned', modules }),
    [baseline, scope, modules],
  );
  const scopeChanged = scope !== baseline.scope;
  const dirty = changes.length > 0 || scopeChanged || preset !== baseline.preset;
  const summary = describePermissions({ role: 'staff', permissions: { client_scope: scope as 'all' | 'assigned', modules } });
  const scopeText = (value: string) => (value === 'all' ? t('scopeAll') : t('scopeAssigned'));

  function choosePreset(value: string) {
    setSaved(null);
    if (value === CUSTOM || !isPresetId(value)) { setPreset(CUSTOM); return; }
    const base = permissionsFromPreset(value);
    setPreset(value); setModules(normalizeModules(base.modules)); setScope(base.client_scope);
  }

  function toggle(module: Module, action: Action) {
    setSaved(null);
    const next = toggleAction(modules, module, action);
    setModules(next);
    if (preset !== CUSTOM && isPresetId(preset) && !sameModules(next, permissionsFromPreset(preset).modules)) setPreset(CUSTOM);
  }

  async function save() {
    setBusy(true); setErrorCode(null); setSaved(null);
    try {
      const body = preset !== CUSTOM && isPresetId(preset) && sameModules(modules, permissionsFromPreset(preset).modules)
        ? { preset, client_scope: scope }
        : { modules, client_scope: scope };
      const result = await settingsRequest<PermissionChange>('PUT', `/team/${member.id}/permissions`, body);
      setBaseline({ scope: result.member.clientScope === 'all' ? 'all' : 'assigned', modules: normalizeModules(result.member.modules),
        preset: result.member.preset && isPresetId(result.member.preset) ? result.member.preset : CUSTOM });
      setSaved(result.changes.length);
      router.refresh();
    } catch (error) {
      setErrorCode(errorKey(error));
    } finally { setBusy(false); }
  }

  function undo() { setScope(baseline.scope); setModules(baseline.modules); setPreset(baseline.preset); setSaved(null); }

  const presetDescription = preset !== CUSTOM && isPresetId(preset) ? PRESETS[preset].description[locale] : null;

  return (
    <VStack gap={5} className="min-w-0 max-w-full">
      <Text color="secondary">{t('subtitle')}</Text>
      <VStack gap={3}>
        <Selector label={t('preset')} value={preset} isDisabled={busy} controlClassName="min-h-11" containerClassName="min-w-0 max-w-full"
          options={[...presetOptions, { value: CUSTOM, label: t('custom') }]} onChange={(value) => choosePreset(String(value))} />
        {presetDescription ? <Text color="secondary">{presetDescription}</Text> : null}
        <Selector label={t('scope')} value={scope} isDisabled={busy} controlClassName="min-h-11" containerClassName="min-w-0 max-w-full"
          options={[{ value: 'all', label: t('scopeAll') }, { value: 'assigned', label: t('scopeAssigned') }]}
          onChange={(value) => { setScope(String(value)); setSaved(null); }} />
      </VStack>

      <VStack gap={3} as="section" aria-labelledby="perm-sections">
        <Heading level={2} id="perm-sections">{t('sections')}</Heading>
        {MODULES.map((module) => (
          <Card key={module}>
            <VStack gap={2} className="min-w-0">
              <Text weight="semibold">{moduleLabel(module)}</Text>
              <HStack gap={2} className="flex-wrap">
                {ACTIONS.map((action) => (
                  <ToggleButton key={action} label={actionLabel(action)} size="lg" isDisabled={busy}
                    isPressed={isGranted(modules, module, action)} onPressedChange={() => toggle(module, action)} />
                ))}
              </HStack>
            </VStack>
          </Card>
        ))}
      </VStack>

      <VStack gap={2} as="section" aria-labelledby="perm-summary">
        <Heading level={2} id="perm-summary">{t('summary')}</Heading>
        {summary.length === 0 ? <Text>{t('summaryNone', { name })}</Text> : (
          <ul className="grid min-w-0 gap-1 ps-5 [overflow-wrap:anywhere]">
            {summary.map((row) => <li key={row.module} className="list-disc"><Text>{t('summaryLine', { module: moduleLabel(row.module), actions: list(row.actions) })}</Text></li>)}
          </ul>
        )}
      </VStack>

      <VStack gap={2} as="section" aria-labelledby="perm-changes">
        <Heading level={2} id="perm-changes">{t('changes')}</Heading>
        {!changes.length && !scopeChanged ? <Text color="secondary">{t('noChanges')}</Text> : (
          <ul className="grid min-w-0 gap-2 ps-5 [overflow-wrap:anywhere]">
            {changes.map((change) => (
              <li key={change.module} className="list-disc">
                <Text weight="semibold">{moduleLabel(change.module)}</Text>
                {change.added.length ? <Text as="p">{t('added', { actions: list(change.added) })}</Text> : null}
                {change.removed.length ? <Text as="p">{t('removed', { actions: list(change.removed) })}</Text> : null}
              </li>
            ))}
            {scopeChanged ? <li className="list-disc"><Text>{t('scopeChanged', { from: scopeText(baseline.scope), to: scopeText(scope) })}</Text></li> : null}
          </ul>
        )}
      </VStack>

      {saved !== null ? <Banner status="success" title={t('savedChanges', { count: saved })} collapsible={false} /> : null}
      {errorCode ? <Banner status="error" title={s(`errors.${errorCode}`)} collapsible={false} /> : null}
      <HStack gap={2} className="flex-wrap">
        <Button label={busy ? s('saving') : t('save')} variant="primary" className="min-h-11" isDisabled={busy || !dirty} onClick={() => void save()} />
        <Button label={t('reset')} variant="ghost" className="min-h-11" isDisabled={busy || !dirty} onClick={undo} />
      </HStack>
    </VStack>
  );
}
