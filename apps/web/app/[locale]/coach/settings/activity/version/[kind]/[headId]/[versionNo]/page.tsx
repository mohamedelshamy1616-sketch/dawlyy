import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { isAllowed } from '@dawlyy/core/authz';
import { ActivityForbidden } from '@/components/activity/activity-log';
import { VersionDetail, type VersionDetailData } from '@/components/activity/version-detail';
import { ApiError, forbidden } from '@/src/api/errors';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getProgramVersion, programHead } from '@/src/server/programs/read';
import { getNutritionVersion, nutritionHead } from '@/src/server/nutrition/read';
import { formHead, formModule, getFormVersion, requireFormPermission } from '@/src/server/forms/read';
import { getBusiness, getPreferences } from '@/src/server/settings/client-read';

const routeSchema = z.object({
  kind: z.enum(['program', 'nutrition', 'form']),
  headId: z.uuid(),
  versionNo: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive().max(2147483647)),
});

/** R3b: reads an exact snapshot. Only the explicit client confirmation may create a draft. */
export default async function ActivityVersionPage({ params }: {
  params: Promise<{ locale: string; kind: string; headId: string; versionNo: string }>;
}) {
  await connection();
  const { locale, ...rawRoute } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  const parsed = routeSchema.safeParse(rawRoute);
  if (!parsed.success) notFound();
  const { kind, headId, versionNo } = parsed.data;
  // Load inside try/catch, render outside it (react-hooks/error-boundaries).
  let result: { data: VersionDetailData; timezone: string; preferences: Awaited<ReturnType<typeof getPreferences>> } | null = null;
  try {
    if (auth.role !== 'owner' && auth.role !== 'staff') throw forbidden();
    result = await withAuthTx(auth, async tx => {
      let data: VersionDetailData;
      if (kind === 'program') {
        const version = await getProgramVersion(tx, auth, headId, versionNo);
        const head = await programHead(tx, auth, headId);
        data = {
          kind, headId: head.id, name: head.name, canRevert: isAllowed(auth, 'programs', 'edit'),
          version: { versionNo: version.versionNo, status: version.status, createdAt: version.createdAt.toISOString(), publishedAt: version.publishedAt?.toISOString() ?? null, document: version.document },
        };
      } else if (kind === 'nutrition') {
        const version = await getNutritionVersion(tx, auth, headId, versionNo);
        const head = await nutritionHead(tx, auth, headId);
        data = {
          kind, headId: head.id, name: head.name, canRevert: isAllowed(auth, 'nutrition', 'edit'),
          version: { versionNo: version.versionNo, status: version.status, createdAt: version.createdAt.toISOString(), publishedAt: version.publishedAt?.toISOString() ?? null, document: version.document },
        };
      } else {
        const version = await getFormVersion(tx, auth, headId, versionNo);
        const head = await formHead(tx, auth, headId);
        requireFormPermission(auth, head.formKind, 'view');
        data = {
          kind, headId: head.id, name: head.name, formKind: head.formKind,
          canRevert: head.formKind !== 'custom' && isAllowed(auth, formModule(head.formKind), 'edit'),
          version: { versionNo: version.versionNo, status: version.status, createdAt: version.createdAt.toISOString(), publishedAt: version.publishedAt?.toISOString() ?? null, document: version.document },
        };
      }
      const business = await getBusiness(tx, auth);
      const preferences = await getPreferences(tx, auth);
      return { data, timezone: business.timezone, preferences };
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (!(error instanceof ApiError && error.status === 403)) throw error;
  }
  if (!result) return <ActivityForbidden />;
  return <VersionDetail {...result} />;
}
