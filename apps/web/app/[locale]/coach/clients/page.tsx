import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { clientListSchema } from '@/src/server/clients/schemas';
import { clientFormOptions, listClients } from '@/src/server/clients/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { ClientList } from '@/components/clients/client-list';

/** Task 3: coach client directory behind the authenticated transaction boundary. */
export default async function ClientsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('clients');
  const auth = await requirePage();
  const raw = await searchParams;
  const parsed = clientListSchema.parse(Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])));
  // An old ?status=archived link means the archived-only listing; archived clients are filtered by archivedAt, not by status.
  const query = parsed.status === 'archived' ? { ...parsed, status: undefined, archived: 'true' as const } : parsed;
  const data = await withAuthTx(auth, async tx => ({ initial: await listClients(tx, auth, query), options: await clientFormOptions(tx, auth) }));
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('title')} subtitle={t('subtitle')} />
    <ClientList key={JSON.stringify(query)} initial={data.initial} filters={query} packages={data.options.packages} tags={data.options.tags} canCreate={isAllowed(auth, 'clients', 'create')}
      canArchive={isAllowed(auth, 'clients', 'edit')} programGrants={{ edit: isAllowed(auth, 'programs', 'edit'), publish: isAllowed(auth, 'programs', 'publish') }} />
  </div>;
}
