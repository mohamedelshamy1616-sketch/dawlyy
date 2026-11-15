'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { History } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { localize } from '@dawlyy/core/types';
import { TimelineFeed } from '@/components/dashboard/timeline-feed';
import type { TimelinePage } from '@/components/dashboard/types';
import { ProgramStatus } from '@/components/program-builder/status';
import { EmptyState } from '@/src/components/shell/empty-state';
import { AssignPlanButton } from './assign-plan-dialog';
import { ClientForm } from './client-form';
import { ClientStatus } from './client-list';
import { ArchiveRowControl } from '@/components/control/archive-controls';

export const HUB_TABS = ['week', 'plan', 'money', 'notes'] as const;
export type HubTab = (typeof HUB_TABS)[number];

/** R1c: the client's current program or nutrition plan, already reduced to what the Plan tab shows. */
export type PlanSummary = { id: string; name: { ar?: string; en?: string }; status: string };

/** What the caller may do on this client page; each flag mirrors the permission the matching API route enforces. */
export type HubAccess = {
  edit: boolean;
  viewTimeline: boolean;
  viewProgram: boolean;
  assignProgram: boolean;
  publishProgram: boolean;
  viewNutrition: boolean;
  assignNutrition: boolean;
  publishNutrition: boolean;
  viewMoney: boolean;
  sell: boolean;
};

type ClientDetailProps = {
  client: NonNullable<Parameters<typeof ClientForm>[0]['initial']> & { status: 'lead' | 'active' | 'inactive' | 'archived'; activePackage: { ar?: string; en?: string } | null };
  access: HubAccess;
  initialTab?: HubTab;
  timeline: TimelinePage | null;
  program: PlanSummary | null;
  nutrition: PlanSummary | null;
  /** Slot for the weekly review card (task R4b). Rendered above the timeline on the Week tab. */
  reviewCard?: React.ReactNode;
  /** Slot for the client activity log (task R3b). Rendered below the profile form on the Notes tab. */
  activityLog?: React.ReactNode;
};

/** R1c: the client hub. Week (default), Plan, Money and Notes; assign actions stay one tap away on every tab. */
export function ClientDetail({ client, access, initialTab = 'week', timeline, program, nutrition, reviewCard, activityLog }: ClientDetailProps) {
  const t = useTranslations('clients');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const id = useId();
  const tabs = HUB_TABS.filter(value => value !== 'money' || access.viewMoney);
  const [tab, setTab] = useState<HubTab>(tabs.includes(initialTab) ? initialTab : 'week');
  const canAssignProgram = access.assignProgram && client.status !== 'archived';
  const canAssignNutrition = access.assignNutrition && client.status !== 'archived';
  const programAction = <AssignPlanButton kind="program" clientId={client.id} hasCurrent={program !== null} canPublish={access.publishProgram} variant="primary" />;
  const nutritionAction = <AssignPlanButton kind="nutrition" clientId={client.id} hasCurrent={nutrition !== null} canPublish={access.publishNutrition} />;
  const panel = (value: HubTab, children: React.ReactNode) => tab === value
    ? <VStack role="tabpanel" id={`${id}-${value}-panel`} aria-labelledby={`${id}-${value}-tab`} tabIndex={0} gap={4} className="min-w-0 py-4">{children}</VStack>
    : <VStack hidden className="!hidden" role="tabpanel" id={`${id}-${value}-panel`} aria-labelledby={`${id}-${value}-tab`} tabIndex={0} />;
  return <VStack gap={5} className="min-w-0">
    <HStack wrap="wrap" align="center" gap={3} className="min-w-0">
      <ClientStatus value={client.status} />
      {canAssignProgram && !(tab === 'plan' && access.viewProgram) ? programAction : null}
      {canAssignNutrition && !(tab === 'plan' && access.viewNutrition) ? nutritionAction : null}
      <ArchiveRowControl entity="clients" id={client.id} archived={client.status === 'archived'} canEdit={access.edit}
        itemLabel={client.displayName || [client.firstName, client.lastName].filter(Boolean).join(' ')} />
    </HStack>
    <VStack gap={4} className="min-w-0">
      <TabList role="tablist" value={tab} onChange={value => setTab(value as HubTab)} className="min-w-0 max-w-full" hasDivider>
        {tabs.map(value => <Tab key={value} id={`${id}-${value}-tab`} value={value} panelId={`${id}-${value}-panel`} className="min-h-11 whitespace-normal" onFocus={() => setTab(value)} label={t(`tabs.${value}`)} />)}
      </TabList>
      {panel('week', <>
        {reviewCard}
        {timeline === null
          ? <Text as="p" display="block">{t('week.noAccess')}</Text>
          : timeline.items.length === 0
            ? <EmptyState Icon={History} title={t('week.emptyTitle')} description={t('week.emptyBody')} />
            : <TimelineFeed clientId={client.id} initial={timeline} />}
        {timeline !== null ? <HStack wrap="wrap"><Button className="min-h-11" variant="secondary" href={`/coach/clients/${client.id}/timeline`} label={t('history.open')} /></HStack> : null}
      </>)}
      {panel('plan', <>
        {access.viewProgram ? <PlanCard heading={t('plan.programHeading')} empty={t('plan.noProgram')} plan={program} locale={locale} href={program ? `/coach/programs/${program.id}` : ''} openLabel={t('plan.openProgram')} action={canAssignProgram ? programAction : null} /> : null}
        {access.viewNutrition ? <PlanCard heading={t('plan.nutritionHeading')} empty={t('plan.noNutrition')} plan={nutrition} locale={locale} href={nutrition ? `/coach/nutrition/${nutrition.id}` : ''} openLabel={t('plan.openNutrition')} action={canAssignNutrition ? nutritionAction : null} /> : null}
        {!access.viewProgram && !access.viewNutrition ? <Text as="p" display="block">{t('plan.noAccess')}</Text> : null}
      </>)}
      {access.viewMoney ? panel('money', <>
        <Text weight="medium" as="p" display="block" className="break-words">{client.activePackage ? localize(client.activePackage, locale) : t('noPackage')}</Text>
        <HStack wrap="wrap" gap={3}>
          {access.sell ? <Button className="min-h-11" href={`/coach/billing/sell?clientId=${client.id}`} variant="primary" label={t('sellPackage')} /> : null}
          <Button className="min-h-11" href={`/coach/clients/${client.id}/subscription`} variant={access.sell ? 'secondary' : 'primary'} label={t('subscriptionStatus')} />
          <Button className="min-h-11" href="/coach/billing" variant="secondary" label={t('money.payments')} />
          {access.edit ? <Button variant="secondary" className="min-h-11" href={`/coach/clients/${client.id}/overrides`} label={t('overrides.title')} /> : null}
        </HStack>
      </>) : null}
      {panel('notes', <>
        <ClientForm key={client.id} initial={client} editable={access.edit} />
        {activityLog}
      </>)}
    </VStack>
  </VStack>;
}

function PlanCard({ heading, empty, plan, locale, href, openLabel, action }: { heading: string; empty: string; plan: PlanSummary | null; locale: 'ar' | 'en'; href: string; openLabel: string; action: React.ReactNode }) {
  return <VStack gap={2} className="min-w-0 rounded-xl border p-4" as="section">
    <Heading level={3} className="text-base font-semibold">{heading}</Heading>
    {plan
      ? <HStack wrap="wrap" align="center" gap={3} className="min-w-0">
        <Text as="p" display="block" className="min-w-0 break-words">{localize(plan.name, locale)}</Text>
        <ProgramStatus status={plan.status} />
        <Button className="min-h-11" variant="secondary" href={href} label={openLabel} />
      </HStack>
      : <Text as="p" display="block" type="supporting">{empty}</Text>}
    {action ? <HStack wrap="wrap" gap={3}>{action}</HStack> : null}
  </VStack>;
}
