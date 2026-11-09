import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Mail } from 'lucide-react';
import { AuthFrame } from '@/components/auth/auth-frame';
import { AcceptInvitationForm } from '@/components/auth/accept-invitation-form';
import { EmptyState } from '@/src/components/shell/empty-state';
import { Link } from '@/i18n/navigation';
import { getAuthContext, getSessionUser } from '@/src/server/auth';
import { previewInvitation } from '@/src/server/invitations';
import { ApiError } from '@/src/api/errors';

/** Task 2: public, minimal invitation preview with explicit identity and acceptance states. */
export default async function InvitePage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  await connection();
  const t = await getTranslations('auth');
  const o = await getTranslations('onboarding');
  let preview: Awaited<ReturnType<typeof previewInvitation>> | null = null;
  let unavailable = false;
  if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
    try { preview = await previewInvitation(token); }
    catch (error) { unavailable = !(error instanceof ApiError && error.code === 'invalid_invitation'); }
  }
  if (!preview) return <AuthFrame title={t('invite.title')}>
    <EmptyState Icon={Mail} title={unavailable ? t('genericError') : t('invite.invalidTitle')}
      description={unavailable ? t('invite.tryAgain') : t('invite.invalidDescription')}
      action={<Link href="/login" className="inline-flex min-h-11 items-center underline">{t('backToLogin')}</Link>} />
  </AuthFrame>;
  if (preview.status !== 'pending') return <AuthFrame title={t('invite.title')}>
    <EmptyState Icon={Mail} title={preview.status === 'accepted' ? t('invite.usedTitle') : t('invite.revokedTitle')}
      description={t('invite.unavailableDescription')}
      action={<Link href="/login" className="inline-flex min-h-11 items-center underline">{t('backToLogin')}</Link>} />
  </AuthFrame>;
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const identityAvailable = configured || (process.env.NODE_ENV !== 'production' && process.env.DAWLYY_DEV_LOGIN === '1');
  const user = identityAvailable ? await getSessionUser() : null;
  const auth = user ? await getAuthContext() : null;
  return <AuthFrame title={t('invite.title')} subtitle={t('invite.subtitle', { businessName: preview.businessName, role: t(`invite.roles.${preview.role}`) })}>
    <div className="flex min-w-0 flex-col gap-4">
      {preview.displayName ? <p className="break-words text-sm">{t('invite.for', { displayName: preview.displayName })}</p> : null}
      {auth ? <EmptyState Icon={Mail} title={t('errors.alreadyMember')} description={t('invite.alreadyMemberHelp')}
        action={<Link href={auth.role === 'client' ? '/app/today' : '/coach'} className="inline-flex min-h-11 items-center underline">{t('openWorkspace')}</Link>} />
        : user || configured ? <AcceptInvitationForm token={token} signedIn={Boolean(user)} />
          : <EmptyState Icon={Mail} title={o('signupUnavailableTitle')} description={o('signupUnavailable')} />}
    </div>
  </AuthFrame>;
}
