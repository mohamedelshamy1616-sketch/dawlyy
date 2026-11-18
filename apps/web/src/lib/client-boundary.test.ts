import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// A server module that imports a plain value (array, constant, function) from a 'use client' module gets a client
// reference proxy, not the value: `HUB_TABS.find is not a function` broke the client hub page on 18 Nov 2026 while
// typecheck and unit tests stayed green. Only components may cross the boundary, so ALL_CAPS or camelCase names fail here.
const root = path.resolve(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(root, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const isClient = (file: string) => /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/.*\n\s*)*['"]use client['"]/.test(readFileSync(file, 'utf8'));

describe('server modules only import components from use-client modules', () => {
  it('has no value import across the client boundary', () => {
    const offenders: string[] = [];
    const files = [...walk(path.join(root, 'app')), ...walk(path.join(root, 'components')), ...walk(path.join(root, 'src'))];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (isClient(file)) continue;
      for (const match of source.matchAll(/import\s+(?!type\b)([^;]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
        const target = resolveImport(file, match[2]);
        if (!target || !isClient(target)) continue;
        const named = /\{([^}]*)\}/.exec(match[1])?.[1] ?? '';
        for (const part of named.split(',')) {
          const name = part.trim();
          if (!name || name.startsWith('type ')) continue;
          const local = name.split(/\s+as\s+/)[0].trim();
          if (!/^[A-Z][a-z0-9]/.test(local) || /^[A-Z0-9_]+$/.test(local)) offenders.push(`${path.relative(root, file)} imports ${local} from ${match[2]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
