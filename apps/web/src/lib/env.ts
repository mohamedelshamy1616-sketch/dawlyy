import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_SERVICE: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  CRON_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * Validated environment, read lazily so build and typecheck never need real values.
 * Throws one error that lists every missing or invalid variable.
 */
export function env(): Env {
  if (cached) return cached;
  // Empty strings (e.g. "KEY=" copied from .env.example) count as unset.
  const raw = Object.fromEntries(
    Object.keys(schema.shape).map((name) => [name, process.env[name] || undefined]),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Missing or invalid environment variables: ${names.join(', ')}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
