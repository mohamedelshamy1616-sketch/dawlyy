import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': root('./'),
      // `server-only` throws outside a React Server environment; tests run in plain node.
      'server-only': root('./src/test/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The router tree is large: a cold import of ./api/index and the DB fixtures take several seconds under parallel load.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
