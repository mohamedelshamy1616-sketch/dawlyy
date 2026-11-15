import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { requirePermission } from '@/src/server/require-permission';
import { listExercises, getCategories } from '@/src/server/exercises/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { ExerciseLibrary } from '@/components/exercises/library';

/** Task 4: authenticated coach library inside the existing shell. */
export default async function ExercisesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  requirePermission(auth, 'exercises', 'view');
  const t = await getTranslations('exercises');
  const raw = await searchParams; const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  // The Library hub links here with ?archived=true; forward the filters the list understands so the first render matches the URL.
  const initialParams = Object.fromEntries((['q', 'category', 'muscle', 'equipment', 'pattern', 'difficulty'] as const).flatMap(key => { const value = first(raw[key]); return value ? [[key, value.slice(0, 200)]] : []; })) as Record<string, string>;
  const source = first(raw.source); if (source === 'system' || source === 'coach') initialParams.source = source;
  if (first(raw.archived) === 'true') initialParams.archived = 'true';
  if (first(raw.includeHidden) === 'true') initialParams.includeHidden = 'true';
  const { initial, categories } = await withAuthTx(auth, async (tx) => ({
    initial: await listExercises(tx, auth, { ...initialParams, archived: initialParams.archived === 'true' ? 'true' : 'false', includeHidden: initialParams.includeHidden === 'true', limit: '20' } as Parameters<typeof listExercises>[2]),
    categories: await getCategories(tx, auth),
  }));
  return <div className="flex min-w-0 max-w-full flex-col gap-6"><PageHeader title={t('title')} subtitle={t('subtitle')} /><ExerciseLibrary initial={initial} categories={categories} canCreate={isAllowed(auth, 'exercises', 'create')} owner={auth.role === 'owner'} canEdit={isAllowed(auth, 'exercises', 'edit')} initialParams={initialParams} /></div>;
}
