import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COACH_NAV, COACH_PROFILE_NAV, isActive } from './nav-items';
import { LIBRARY_LINKS, LIBRARY_TOOL_LINKS, MONEY_LINKS } from './hub-links';

describe('R1b coach route reachability', () => {
  it('keeps every existing static coach page reachable', () => {
    const root = fileURLToPath(new URL('../../../app/[locale]/coach/', import.meta.url));
    const paths: string[] = [];
    function walk(directory: string, route: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.includes('[')) walk(join(directory, entry.name), `${route}/${entry.name}`);
        else if (entry.isFile() && entry.name === 'page.tsx') paths.push(route);
      }
    }
    walk(root, '/coach');
    const reachable = new Set([...COACH_NAV, ...COACH_PROFILE_NAV, ...LIBRARY_LINKS, ...LIBRARY_TOOL_LINKS, ...MONEY_LINKS].map(item => item.href.split('?')[0]));
    expect(paths.length).toBeGreaterThan(20);
    expect(paths.filter(path => !reachable.has(path))).toEqual([]);
  });
  it('marks Library and Money active on their child tools and keeps the inbox exact', () => {
    expect(COACH_NAV.filter(item => isActive('/coach/clients/new', item)).map(item => item.href)).toEqual(['/coach/clients']);
    expect(COACH_NAV.filter(item => isActive('/coach/programs/new', item)).map(item => item.href)).toEqual(['/coach/library']);
    expect(COACH_NAV.filter(item => isActive('/coach/billing/payments/123', item)).map(item => item.href)).toEqual(['/coach/money']);
  });
});
