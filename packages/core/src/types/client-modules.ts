import { z } from 'zod';

// reinvent R0a: module switches composed by the coach for the client app.
export const CLIENT_MODULES = [
  'workouts', 'nutrition', 'checkins', 'progress_photos', 'measurements', 'messages', 'payments',
] as const;
// reinvent R0a
export type ClientModule = typeof CLIENT_MODULES[number];

// reinvent R0a
export const ClientModules = z.strictObject({
  workouts: z.boolean(),
  nutrition: z.boolean(),
  checkins: z.boolean(),
  progress_photos: z.boolean(),
  measurements: z.boolean(),
  messages: z.boolean(),
  payments: z.boolean(),
});
// reinvent R0a
export type ClientModules = z.infer<typeof ClientModules>;

// reinvent R0a
export const DEFAULT_CLIENT_MODULES: ClientModules = {
  workouts: true,
  nutrition: true,
  checkins: true,
  progress_photos: true,
  measurements: true,
  messages: true,
  payments: true,
};

// reinvent R0a: explicit false overrides win; absent values inherit tenant defaults.
export function resolveClientModules(
  tenant: ClientModules,
  override?: Partial<Record<ClientModule, boolean>>,
): ClientModules {
  const resolved = ClientModules.parse(tenant);
  const partial = ClientModules.partial().parse(override ?? {});
  for (const module of CLIENT_MODULES) {
    const value = partial[module];
    if (value !== undefined) resolved[module] = value;
  }
  return resolved;
}
