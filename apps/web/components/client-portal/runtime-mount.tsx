import { requirePage } from '@/src/server/auth';
import { ClientRuntime } from './client-runtime';

/** Task 5: identity is supplied by the same authenticated Server Component boundary as pages. */
export async function ClientRuntimeMount({ children }: { children: React.ReactNode }) {
  const auth = await requirePage();
  return <ClientRuntime key={auth.userId} userId={auth.userId}>{children}</ClientRuntime>;
}
