import 'server-only';
import { isAllowed } from '@dawlyy/core/authz';
import type { AuthContext } from '../db';
import { requireProgramPermission } from './read';

/** Task 4: page action grants match the API's explicit coach-only module boundary. */
export function programPageGrants(auth: AuthContext) {
  requireProgramPermission(auth, 'view');
  return { edit: isAllowed(auth, 'programs', 'edit'), create: isAllowed(auth, 'programs', 'create'), publish: isAllowed(auth, 'programs', 'publish') };
}
