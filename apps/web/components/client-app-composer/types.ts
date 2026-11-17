import type { ClientModules, IsoDate } from '@dawlyy/core/types';
import type { ComposerOverrideRow } from '@/src/lib/client-app-composer/state';

export type { ModuleChoice, ComposerSelection, ComposerOverrideRow } from '@/src/lib/client-app-composer/state';

type SeedBase = {
  locale: 'ar' | 'en';
  numerals: 'latn' | 'arab';
  /** Tenant defaults as saved. */
  tenantModules: ClientModules;
  /** What the client app shows now (tenant mode: the same as the defaults). Authoritative, server computed. */
  effectiveModules: ClientModules;
  canSave: boolean;
};

/** R2c: the server page's seed. Tenant mode edits the defaults; client mode edits `custom:client_app`. */
export type ComposerSeed =
  | (SeedBase & { mode: 'tenant' })
  | (SeedBase & { mode: 'client'; clientId: string; clientName: string; today: IsoDate; rows: ComposerOverrideRow[] });
