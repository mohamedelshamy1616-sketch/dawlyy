import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { ReviewPreferencesForm } from '@/components/review/review-preferences';
import { ApiError, forbidden } from '@/src/api/errors';
import { numeralPolicy } from '@/src/lib/numbers';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { requirePermission } from '@/src/server/require-permission';
import { getReviewPreferences } from '@/src/server/review/preferences';
import { getPreferences } from '@/src/server/settings/client-read';

/** R4b: staff preference reads use the same caller and transaction as the settings API. */
export default async function ReviewSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params; setRequestLocale(locale);
  const auth = await requirePage();
  let load: { ok: true; review: Awaited<ReturnType<typeof getReviewPreferences>>; numerals: ReturnType<typeof numeralPolicy> } | { ok: false; error: 'forbidden' | 'request' };
  try {
    if (auth.role !== 'owner' && auth.role !== 'staff') throw forbidden();
    requirePermission(auth, 'checkins', 'review');
    const data = await withAuthTx(auth, async tx => ({ review: await getReviewPreferences(tx, auth), preferences: await getPreferences(tx, auth) }));
    load = { ok: true, review: data.review, numerals: numeralPolicy(data.preferences) };
  } catch (failure) {
    load = { ok: false, error: failure instanceof ApiError && failure.status === 403 ? 'forbidden' : 'request' };
  }
  if (!load.ok) return <ReviewPreferencesForm initial={{ dialect: 'egyptian', signaturePhrases: [] }} initialError={load.error} />;
  return <ReviewPreferencesForm initial={load.review} numerals={load.numerals} />;
}
