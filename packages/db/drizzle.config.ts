import { defineConfig } from 'drizzle-kit';

// drizzle-kit uses the privileged connection: migrations create roles, policies and helper functions.
const url = process.env.DATABASE_URL_SERVICE ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL_SERVICE (or DATABASE_URL) must be set for drizzle-kit. See .env.example.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: { url },
  // Every table in the public schema belongs to DAWLYY; Supabase-managed schemas are left alone.
  schemaFilter: ['public', 'app'],
  strict: true,
  verbose: true,
});
