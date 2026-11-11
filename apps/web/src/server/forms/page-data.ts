import 'server-only';
import { notFound } from 'next/navigation';
import { isAllowed } from '@dawlyy/core/authz';
import type { AuthContext } from '../db';
import { ApiError } from '../../api/errors';
import { formModule, requireFormPermission } from './read';

/** Task 7: coach page action grants; they mirror what each service enforces again on write. */
export function formPageGrants(auth: AuthContext, formKind: 'intake' | 'checkin' | 'assessment') {
  requireFormPermission(auth, formKind, 'view');
  const moduleName = formModule(formKind);
  return {
    create: isAllowed(auth, moduleName, 'create'),
    edit: isAllowed(auth, moduleName, 'edit'),
    // publishForm additionally requires forms:publish for every kind (frozen VERSION config).
    publish: isAllowed(auth, moduleName, 'publish') && isAllowed(auth, 'forms', 'publish'),
    review: isAllowed(auth, moduleName, 'review'),
  };
}

/** Task 7: Server Components hand client components plain JSON (dates become strings). */
export function toJson<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Task 7: a missing or invisible row is a 404 page, never an error page. */
export function missingAsNotFound(error: unknown): never {
  if (error instanceof ApiError && error.status === 404) notFound();
  throw error;
}

/** Task 7: first value of a search parameter. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Task 7: the request time in ms, read once per request after connection() so lists classify due items consistently. */
export function requestTime(): number {
  return Date.now();
}
