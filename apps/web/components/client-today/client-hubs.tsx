'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Thread } from '@/components/messaging/thread';
import type { ThreadData } from '@/components/messaging/types';
import { Link, useRouter } from '@/i18n/navigation';
import { formatNumber, numberLocale } from '@/src/lib/numbers';
import { getMeLinks, getPlanLinks, type DestinationLink } from './client-destinations';
import { ClientModuleSeed, useResolvedModules } from './client-module-provider';
import type { ClientBootstrap, CoachIdentity, CoachPromise } from './types';

const row = 'focus-ring flex min-h-14 min-w-0 items-center gap-3 border-b px-3 py-3 text-start hover:bg-muted break-words';
const list = 'm-0 list-none p-0';

/** A hub page that failed to load: translated message and a Retry that asks the server for the page again. */
export function HubError() {
  const t = useTranslations('clientToday');
  const router = useRouter();
  return (
    <VStack gap={3} role="alert" className="min-w-0">
      <Heading level={2}>{t('states.errorTitle')}</Heading>
      <Text as="p">{t('states.errorBody')}</Text>
      <Button label={t('states.retry')} variant="primary" className="min-h-11 self-start" onClick={() => router.refresh()} />
    </VStack>
  );
}

/** The module behind this destination is switched off: nothing of it is shown. */
export function HubUnavailable() {
  const t = useTranslations('clientToday');
  return (
    <EmptyState
      title={t('states.unavailableTitle')}
      description={t('states.unavailableBody')}
      actions={<Button label={t('states.backToToday')} href="/app/today" variant="secondary" className="min-h-11" />}
    />
  );
}

function Rows({ links, group }: { links: readonly DestinationLink[]; group: 'plan' | 'me' }) {
  const t = useTranslations('clientToday');
  return (
    <VStack as="ul" gap={0} className={list}>
      {links.map(({ key, href, Icon }) => (
        <li key={key}>
          <Link href={href} className={row}>
            <Icon aria-hidden className="size-5 shrink-0" />
            <VStack gap={0} className="min-w-0 flex-1">
              <Text as="p" weight="medium">{t(`${group}.links.${key}.title`)}</Text>
              <Text as="p" color="secondary" className="text-base">{t(`${group}.links.${key}.hint`)}</Text>
            </VStack>
          </Link>
        </li>
      ))}
    </VStack>
  );
}

function Hub({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <VStack gap={5} className="min-w-0 max-w-full break-words">
      <VStack gap={1} className="min-w-0">
        <Heading level={1}>{title}</Heading>
        {subtitle ? <Text as="p" color="secondary">{subtitle}</Text> : null}
      </VStack>
      {children}
    </VStack>
  );
}

type Seed = { userId: string; bootstrap: ClientBootstrap };

/** R2a: Plan = the published program and nutrition plan, each hidden on its own when its module is off. */
export function PlanHub({ userId, bootstrap }: Seed) {
  const t = useTranslations('clientToday');
  const { modules } = useResolvedModules(bootstrap);
  const links = getPlanLinks(modules);
  return (
    <>
      <ClientModuleSeed userId={userId} {...bootstrap} />
      <Hub title={t('plan.title')} subtitle={links.length > 0 ? t('plan.subtitle') : undefined}>
        {links.length > 0 ? <Rows links={links} group="plan" /> : <HubUnavailable />}
      </Hub>
    </>
  );
}

/** R2a: Me = progress, history, check-ins, subscription and notifications as rows. Hidden modules have no row. */
export function MeHub({ userId, bootstrap }: Seed) {
  const { theme, setTheme } = useTheme();
  const t = useTranslations('clientToday');
  const { modules } = useResolvedModules(bootstrap);
  return (
    <>
      <ClientModuleSeed userId={userId} {...bootstrap} />
      <Hub title={t('me.title')} subtitle={t('me.subtitle')}>
        {(['account', 'activity'] as const).map(group => {
          const links = getMeLinks(modules).filter(link =>
            ['subscription', 'notifications', 'consent'].includes(link.key) === (group === 'account'));
          return links.length > 0 ? <section key={group} className="grid gap-2">
            <Heading level={2}>{t(`me.${group}`)}</Heading>
            <Rows links={links} group="me" />
          </section> : null;
        })}
        <Button label={t('me.lightTheme')} aria-pressed={theme === 'light'} variant="secondary"
          className="min-h-11 self-start" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} />
      </Hub>
    </>
  );
}

/** Initials avatar for a named coach; without a name the avatar stays generic. There is no portrait source. */
export function CoachAvatar({ name }: { name: string | null }) {
  const t = useTranslations('clientToday');
  return name
    ? <Avatar name={name} alt={t('coach.avatarNamed', { name })} size="lg" />
    : <Avatar alt={t('coach.avatarGeneric')} size="lg" />;
}

type CoachProps = Seed & {
  businessName: string;
  identity: CoachIdentity;
  promise: CoachPromise;
  thread: ThreadData | null;
  canSend: boolean;
  /** The caller's messages permission; a module switch alone does not grant it. */
  canView: boolean;
};

/** R2a: Coach = who they are, what is promised, and the existing conversation. */
export function CoachHub({ userId, bootstrap, businessName, identity, promise, thread, canSend, canView }: CoachProps) {
  const t = useTranslations('clientToday');
  const locale = useLocale();
  const options = { locale: numberLocale(locale), numerals: bootstrap.numerals } as const;
  const { modules } = useResolvedModules(bootstrap);
  if (!modules.messages || !canView) {
    return (
      <>
        <ClientModuleSeed userId={userId} {...bootstrap} />
        <Hub title={t('coach.title')}><HubUnavailable /></Hub>
      </>
    );
  }
  const names = identity.members.map(member => member.displayName).filter((name): name is string => !!name);
  const heading = names.length > 0 ? new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names) : t('coach.unnamed');
  const first = identity.kind === 'coach' ? names[0] ?? null : null;
  return (
    <>
      <ClientModuleSeed userId={userId} {...bootstrap} />
      <VStack gap={5} className="min-w-0 max-w-full break-words">
        <HStack gap={3} align="center" className="min-w-0" data-testid="coach-identity">
          <CoachAvatar name={first} />
          <VStack gap={0} className="min-w-0 flex-1">
            <Text as="p" weight="bold" className="break-words">{heading}</Text>
            <Text as="p" color="secondary" className="break-words">{identity.kind === 'team' ? t('coach.team', { business: businessName }) : t('coach.at', { business: businessName })}</Text>
          </VStack>
        </HStack>
        <VStack as="ul" gap={0} className={list}>
          <li className="border-b py-2">
            <Text as="p" weight="medium">{t('coach.chatLabel')}</Text>
            <Text as="p" color="secondary">
              {promise.chatHours !== null
                ? t('coach.chatPromise', { n: promise.chatHours, shown: formatNumber(promise.chatHours, options) })
                : t('coach.chatPromiseUnset')}
            </Text>
          </li>
          {promise.checkinReviewHours !== null ? (
            <li className="border-b py-2">
              <Text as="p" weight="medium">{t('coach.reviewLabel')}</Text>
              <Text as="p" color="secondary">{t('coach.reviewPromise', { n: promise.checkinReviewHours, shown: formatNumber(promise.checkinReviewHours, options) })}</Text>
            </li>
          ) : null}
        </VStack>
        <Thread initial={thread} viewerRole="client" canSend={canSend} title={t('coach.title')} />
      </VStack>
    </>
  );
}
