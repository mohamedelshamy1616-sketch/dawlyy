import 'server-only';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePermission } from '../require-permission';
import { forbidden } from '../../api/errors';
import type { AuthContext } from '../db';
import { nutritionPermission } from './read';

/** Task 6: nutrition page grants mirror the API's explicit coach-only module boundary. */
export function nutritionPageGrants(auth: AuthContext) {
  nutritionPermission(auth, 'view');
  return { view: true, create: isAllowed(auth, 'nutrition', 'create'), edit: isAllowed(auth, 'nutrition', 'edit'), publish: isAllowed(auth, 'nutrition', 'publish') };
}

/** Task 6: food library page grants; clients never open the library. */
export function foodPageGrants(auth: AuthContext) {
  if (auth.role === 'client') throw forbidden();
  requirePermission(auth, 'foods', 'view');
  return { edit: isAllowed(auth, 'foods', 'edit') };
}
