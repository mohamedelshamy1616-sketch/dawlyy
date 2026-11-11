'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PRESETS } from '@dawlyy/core/authz';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Link, useRouter } from '@/i18n/navigation';
import type { TeamMember } from '@/src/server/team/service';
import { InviteForm } from './invite-form';
import { errorKey, settingsRequest } from './request';

/** A pending staff invitation as the page lists it. */
export type PendingInvitation = { id: string; displayName: string | null; email: string | null; expiresAt: string };

/** Task 11: team list with deactivate and reactivate (owner only), the invite form and pending invitations. */
export function TeamPanel({ members, pending, selfMembershipId, isOwner }: {
  members: TeamMember[]; pending: PendingInvitation[]; selfMembershipId: string; isOwner: boolean;
}) {
  const t = useTranslations('settings.team');
  const s = useTranslations('settings.shared');
  const locale = useLocale();
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  async function change(id: string, action: 'deactivate' | 'reactivate') {
    setBusyId(id); setErrorCode(null);
    try {
      await settingsRequest('POST', `/team/${id}/${action}`);
      setConfirming(null);
      router.refresh();
    } catch (error) {
      setErrorCode(errorKey(error));
    } finally { setBusyId(null); }
  }

  const roleLabel = (member: TeamMember) => {
    if (member.role === 'owner') return t('ownerAccess');
    const preset = member.preset && Object.hasOwn(PRESETS, member.preset) ? PRESETS[member.preset as keyof typeof PRESETS].name[locale === 'en' ? 'en' : 'ar'] : null;
    return preset ?? t('customRole');
  };

  return (
    <VStack gap={6} className="min-w-0 max-w-full">
      {errorCode ? <Banner status="error" title={s(`errors.${errorCode}`)} collapsible={false} /> : null}
      <VStack gap={3} as="section" aria-labelledby="team-members">
        <Heading level={2} id="team-members">{t('members')}</Heading>
        {members.map((member) => {
          const self = member.id === selfMembershipId;
          return (
            <Card key={member.id}>
              <VStack gap={2} className="min-w-0 [overflow-wrap:anywhere]">
                <HStack gap={2} className="min-w-0 flex-wrap items-center">
                  <Text weight="semibold">{member.displayName ?? t('noName')}</Text>
                  {self ? <Badge label={t('you')} variant="info" /> : null}
                  <Badge label={t(`role.${member.role}`)} variant="neutral" />
                  <Badge label={t(`status.${member.status}`)} variant={member.status === 'active' ? 'success' : 'warning'} />
                </HStack>
                {member.email ? <Text color="secondary">{member.email}</Text> : null}
                <Text>{roleLabel(member)}{member.clientScope && member.role === 'staff' ? ` - ${t(`scope.${member.clientScope}`)}` : ''}</Text>
                {isOwner && member.role === 'staff' ? (
                  <HStack gap={2} className="flex-wrap">
                    <Link href={`/coach/settings/team/${member.id}`} className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium">{t('edit')}</Link>
                    {member.status === 'active' ? (
                      <Button label={t('deactivate')} variant="secondary" className="min-h-11" isDisabled={busyId === member.id} onClick={() => setConfirming(member.id)} />
                    ) : member.status === 'disabled' ? (
                      <Button label={t('reactivate')} variant="secondary" className="min-h-11" isDisabled={busyId === member.id} onClick={() => void change(member.id, 'reactivate')} />
                    ) : null}
                  </HStack>
                ) : null}
                {confirming === member.id ? (
                  <Banner status="warning" title={t('deactivateBody')} collapsible={false}>
                    <HStack gap={2} className="flex-wrap">
                      <Button label={t('confirmDeactivate')} variant="destructive" className="min-h-11" isDisabled={busyId === member.id} onClick={() => void change(member.id, 'deactivate')} />
                      <Button label={t('cancel')} variant="ghost" className="min-h-11" onClick={() => setConfirming(null)} />
                    </HStack>
                  </Banner>
                ) : null}
              </VStack>
            </Card>
          );
        })}
      </VStack>

      <VStack gap={3} as="section" aria-labelledby="team-pending">
        <Heading level={2} id="team-pending">{t('pending.title')}</Heading>
        {pending.length === 0 ? <Text color="secondary">{t('pending.empty')}</Text> : pending.map((invitation) => (
          <Card key={invitation.id}>
            <VStack gap={1} className="min-w-0 [overflow-wrap:anywhere]">
              <Text weight="semibold">{invitation.displayName ?? invitation.email ?? t('noName')}</Text>
              {invitation.email ? <Text color="secondary">{invitation.email}</Text> : null}
              <Text color="secondary">{t('pending.expires', { date: date.format(new Date(invitation.expiresAt)) })}</Text>
            </VStack>
          </Card>
        ))}
      </VStack>

      {isOwner ? <InviteForm onCreated={() => router.refresh()} /> : <Text color="secondary">{t('ownerOnly')}</Text>}
    </VStack>
  );
}
