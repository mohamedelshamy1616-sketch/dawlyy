import 'server-only';
import type { AuthContext } from '@dawlyy/db';
import { forbidden } from '@/src/api/errors';
import { toTodayLog } from '@/components/client-today/view-model';
import type { ClientBootstrap, TodayLog } from '@/components/client-today/types';
import type { ClientNutrition } from '@/components/nutrition/types';
import { numeralPolicy } from '@/src/lib/numbers';
import { checkActiveAccess } from '../access';
import { getClientModules } from '../client-modules';
import { withAuthTx, type Tx } from '../db';
import { myNutrition } from '../nutrition/client';
import { listMealLogs } from '../nutrition/logs';
import { logListSchema } from '../nutrition/schemas';
import { getPreferences } from '../settings/client-read';
import { getToday } from '../workout/portal';
import type { PortalToday } from '../workout/contracts';

/** JSON round trip: Dates become ISO strings, exactly what the API would send. */
const plain = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

function ownClientId(auth: AuthContext): string {
  if (auth.role !== 'client' || !auth.clientId) throw forbidden();
  return auth.clientId;
}

/** R2a: the same resolved modules and numeral choice that GET /api/v1/me/app returns, read inside a transaction. */
export async function readClientBootstrap(tx: Tx, auth: AuthContext): Promise<ClientBootstrap> {
  const modules = await getClientModules(tx, auth, ownClientId(auth));
  return { modules, numerals: numeralPolicy(await getPreferences(tx, auth)) };
}

/** R2a: bootstrap for pages that only need the switches (Plan, Me). */
export async function loadClientBootstrap(auth: AuthContext): Promise<ClientBootstrap & { userId: string }> {
  const bootstrap = await withAuthTx(auth, tx => readClientBootstrap(tx, auth));
  return { userId: auth.userId, ...bootstrap };
}

const MAX_LOG_PAGES = 10;

/** Every meal log of the day. limit is capped at 100 by the list contract, so follow nextCursor to the end. */
async function readDayLogs(tx: Tx, auth: AuthContext, date: string): Promise<TodayLog[]> {
  const logs: TodayLog[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_LOG_PAGES; page += 1) {
    const result = await listMealLogs(tx, auth, logListSchema.parse({ date, limit: '100', ...(cursor ? { cursor } : {}) }));
    for (const row of result.items) {
      const log = toTodayLog(row);
      if (log) logs.push(log);
    }
    if (!result.nextCursor) return logs;
    cursor = result.nextCursor;
  }
  throw new Error('meal_logs_too_many_pages');
}

export type TodayPageData = {
  userId: string;
  bootstrap: ClientBootstrap;
  today: PortalToday;
  nutrition: ClientNutrition | null;
  logs: TodayLog[];
};

/** R2a: everything Today needs, through one authenticated transaction and the existing own-client readers. */
export async function loadTodayPageData(auth: AuthContext): Promise<TodayPageData> {
  return withAuthTx(auth, async tx => {
    const bootstrap = await readClientBootstrap(tx, auth);
    const today = await getToday(tx, auth);
    let nutrition: ClientNutrition | null = null;
    let logs: TodayLog[] = [];
    if (bootstrap.modules.nutrition && (await checkActiveAccess(tx, auth)).allowed) {
      const plan = await myNutrition(tx, auth);
      nutrition = plain<ClientNutrition>(plan);
      logs = nutrition.version ? await readDayLogs(tx, auth, today.date) : [];
    }
    return { userId: auth.userId, bootstrap, today: plain<PortalToday>(today), nutrition, logs };
  });
}