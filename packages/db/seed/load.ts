import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SEED_DIR = dirname(fileURLToPath(import.meta.url));

/** Reads every *.json file in a directory; each file must hold a JSON array. Sorted by file name. */
export function loadJsonDir(dir: string): { file: string; rows: unknown[] }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const parsed: unknown = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (!Array.isArray(parsed)) throw new Error(`${join(dir, f)} must contain a JSON array`);
      return { file: f, rows: parsed as unknown[] };
    });
}
