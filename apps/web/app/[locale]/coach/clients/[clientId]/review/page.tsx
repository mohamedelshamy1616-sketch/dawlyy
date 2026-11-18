import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { z } from 'zod';
import { ReviewWorkspace } from '@/components/review/review-workspace';
import { ApiError, forbidden } from '@/src/api/errors';
import { numeralPolicy } from '@/src/lib/numbers';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getLatestReview } from '@/src/server/review/service';
import { getPreferences } from '@/src/server/settings/client-read';
import { requirePermission } from '@/src/server/require-permission';

/** R4b: a staff-only, RLS-scoped server read; no draft is built on navigation. */
export default async function ReviewPage({ params }: { params: Promise<{ locale: string; clientId: string }> }) {
  await connection();
  const { locale, clientId } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  if (!z.uuid().safeParse(clientId).success) notFound();
  let load: { ok: true; draft: Awaited<ReturnType<typeof getLatestReview>>; numerals: ReturnType<typeof numeralPolicy> } | { ok: false; error: 'forbidden' | 'request' };
  try {
    if (auth.role !== 'owner' && auth.role !== 'staff') throw forbidden();
    requirePermission(auth, 'clients', 'view'); requirePermission(auth, 'checkins', 'review');
    const data = await withAuthTx(auth, async tx => ({ draft: await getLatestReview(tx, auth, clientId), preferences: await getPreferences(tx, auth) }));
    load = { ok: true, draft: data.draft, numerals: numeralPolicy(data.preferences) };
  } catch (failure) {
    if (failure instanceof ApiError && failure.status === 404) notFound();
    load = { ok: false, error: failure instanceof ApiError && failure.status === 403 ? 'forbidden' : 'request' };
  }
  if (!load.ok) return <ReviewWorkspace clientId={clientId} initial={null} initialError={load.error} />;
  return <ReviewWorkspace clientId={clientId} initial={load.draft} numerals={load.numerals} canSend={isAllowed(auth, 'messages', 'create')} canPropose={isAllowed(auth, 'nutrition', 'edit')} canViewNutrition={isAllowed(auth, 'nutrition', 'view')} />;
}
