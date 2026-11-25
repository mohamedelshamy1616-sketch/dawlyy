import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// R5: reads only the two authored stylesheets and the Astryx theme source. The generated theme/built/* output is not
// compared here: Claude rebuilds it with `pnpm theme:build` after merge and checks source/generated parity then.
const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const tokens = read('../../styles/tokens.css');
const globals = read('../../../app/globals.css');
const theme = read('../../../theme/dawlyy.theme.ts');

/** The body of every top-level block whose header is exactly `header` (for example ":root" or "@theme inline"). */
function blocks(css: string, header: string): string[] {
  const found: string[] = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(`${header} {`, from);
    if (at === -1) return found;
    // Only a header at the start of a line counts: `.dark {` must not match inside `html .dark {`.
    if (at > 0 && css[at - 1] !== '\n') { from = at + header.length; continue; }
    const open = css.indexOf('{', at);
    let depth = 0;
    let end = open;
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++;
      if (css[end] === '}' && --depth === 0) break;
    }
    found.push(css.slice(open + 1, end));
    from = end;
  }
}
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const declarations = (css: string, name: string) => withoutComments(css).match(new RegExp(`(^|[\\s;{])${name}\\s*:`, 'g')) ?? [];
const declared = (css: string) => new Set([...withoutComments(css).matchAll(/(?:^|[\s;{])(--[a-z0-9-]+)\s*:/g)].map(match => match[1]));

describe('R5 token consolidation: globals.css only imports and uses tokens', () => {
  it('imports tokens.css in the import block, after the built Astryx theme and before any rule', () => {
    const lines = withoutComments(globals).split('\n').map(line => line.trim()).filter(Boolean);
    const imports = lines.filter(line => line.startsWith('@import'));
    expect(imports).toContain('@import "../src/styles/tokens.css";');
    expect(imports.indexOf('@import "../src/styles/tokens.css";')).toBeGreaterThan(imports.indexOf('@import "../theme/built/dawlyy.css";'));
    const firstRule = lines.findIndex(line => !line.startsWith('@import'));
    expect(lines.slice(0, firstRule).filter(line => line.startsWith('@import'))).toEqual(imports);
    // A plain import: wrapping it in a layer would change how the tokens cascade against the Astryx layers.
    expect(imports.find(line => line.includes('tokens.css'))).not.toMatch(/layer\(/);
  });

  it('keeps the third-party imports, the dark variant and layers.css wiring in globals', () => {
    expect(globals).toContain('@import "tailwindcss";');
    expect(globals).toContain('@import "@astryxdesign/core/reset.css";');
    expect(globals).toContain('@import "@astryxdesign/core/astryx.css";');
    expect(globals).toContain('@custom-variant dark (&:is(.dark *));');
    expect(globals).toContain('@layer base');
  });

  it('declares no app token itself: no theme block, no :root or .dark block, no raw color, no stack of its own', () => {
    expect(blocks(globals, '@theme inline')).toEqual([]);
    expect(blocks(globals, ':root')).toEqual([]);
    expect(blocks(globals, '.dark')).toEqual([]);
    expect(withoutComments(globals)).not.toMatch(/oklch\(|#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    expect(withoutComments(globals)).not.toMatch(/--(brand|radius|background|foreground|font-sans|font-arabic)[a-z-]*\s*:/);
    expect(withoutComments(globals)).not.toContain('ui-sans-serif');
  });

  it('references the focus ring measurements and the centralized fonts instead of literals', () => {
    const focus = globals.slice(globals.indexOf('@utility focus-ring'));
    expect(focus).toContain('outline: var(--dawlyy-focus-ring-width) solid var(--brand);');
    expect(focus).toContain('outline-offset: var(--dawlyy-focus-ring-offset);');
    expect(focus.slice(0, focus.indexOf('}\n}'))).not.toMatch(/\b\d+px\b/);
    const [latin, rtl] = [blocks(globals, '[data-astryx-theme]')[0] ?? '', blocks(globals, 'html[dir="rtl"] [data-astryx-theme]')[0] ?? ''];
    expect(latin).toContain('--font-family-body: var(--dawlyy-font-latin);');
    expect(latin).toContain('--font-family-heading: var(--dawlyy-font-latin);');
    expect(rtl).toContain('--font-family-body: var(--dawlyy-font-arabic);');
    expect(rtl).toContain('--font-family-heading: var(--dawlyy-font-arabic);');
    expect(globals).toContain('font-family: var(--dawlyy-font-arabic);');
  });

  it('does not import the Astryx Tailwind bridge', () => {
    expect(withoutComments(globals)).not.toContain('tailwind-theme');
    expect(withoutComments(tokens)).not.toContain('tailwind-theme');
  });
});

describe('R5 token consolidation: tokens.css is the one source', () => {
  const theme0 = blocks(tokens, '@theme inline').join('\n');
  const root = blocks(tokens, ':root').join('\n');
  const dark = blocks(tokens, '.dark').join('\n');

  it('keeps every Tailwind alias the shadcn screens rely on, with unchanged meaning', () => {
    const aliases = ['background', 'foreground', 'success', 'warning', 'ring', 'input', 'border', 'destructive', 'accent', 'accent-foreground',
      'muted', 'muted-foreground', 'secondary', 'secondary-foreground', 'primary', 'primary-foreground', 'popover', 'popover-foreground',
      'card', 'card-foreground', 'sidebar', 'sidebar-primary', 'chart-1', 'chart-5', 'brand', 'brand-foreground', 'brand-soft', 'brand-soft-foreground'];
    for (const name of aliases) expect(theme0, `--color-${name}`).toContain(`--color-${name}: var(--${name});`);
    expect(theme0).toContain('--radius-lg: var(--radius);');
    expect(theme0).toContain('--radius-sm: calc(var(--radius) * 0.6);');
    expect(theme0).toContain('--radius-4xl: calc(var(--radius) * 2.6);');
    expect(theme0).toContain('--font-heading: var(--font-sans);');
  });

  it('defines the brand lime once, as one light and one dark value, and aliases --brand* to them', () => {
    for (const name of ['accent', 'on-accent', 'accent-soft', 'accent-soft-text']) {
      for (const scheme of ['light', 'dark']) {
        expect(declarations(tokens, `--dawlyy-${name}-${scheme}`), `--dawlyy-${name}-${scheme}`).toHaveLength(1);
        expect(root).toContain(`--dawlyy-${name}-${scheme}: oklch(`);
      }
    }
    expect(root).toContain('--dawlyy-accent-light: oklch(0.445 0.098 119);');
    // .dark only re-points the --brand aliases; it never declares a second palette of its own.
    expect([...declared(dark)].filter(name => name.startsWith('--dawlyy-'))).toEqual([]);
    for (const [brand, pair] of [['brand', 'accent'], ['brand-foreground', 'on-accent'], ['brand-soft', 'accent-soft'], ['brand-soft-foreground', 'accent-soft-text']] as const) {
      expect(declarations(tokens, `--${brand}`), `--${brand} declared in :root and .dark only`).toHaveLength(2);
      expect(root).toContain(`--${brand}: var(--dawlyy-${pair}-light);`);
      expect(dark).toContain(`--${brand}: var(--dawlyy-${pair}-dark);`);
    }
  });

  it('has one radius and one definition per font stack, with Latin and Arabic ordered as before', () => {
    expect(declarations(tokens, '--radius')).toHaveLength(1);
    expect(root).toContain('--radius: 0.625rem;');
    for (const name of ['--dawlyy-font-latin', '--dawlyy-font-arabic', '--dawlyy-font-mono']) expect(declarations(tokens, name), name).toHaveLength(1);
    expect(root).toContain('--dawlyy-font-latin: var(--font-inter), var(--font-plex-arabic), ui-sans-serif, system-ui, sans-serif;');
    expect(root).toContain('--dawlyy-font-arabic: var(--font-plex-arabic), var(--font-inter), ui-sans-serif, system-ui, sans-serif;');
    expect(theme0).toContain('--font-sans: var(--dawlyy-font-latin);');
    expect(theme0).toContain('--font-arabic: var(--dawlyy-font-arabic);');
  });

  it('preserves the neutral light and dark values and the dark mappings', () => {
    expect(root).toContain('--background: oklch(1 0 0);');
    expect(root).toContain('--primary: oklch(0.205 0 0);');
    expect(root).toContain('--destructive: oklch(0.577 0.245 27.325);');
    expect(dark).toContain('--background: var(--stage);');
    expect(dark).toContain('--foreground: oklch(0.985 0 0);');
    expect(dark).toContain('--primary: oklch(0.922 0 0);');
    expect(dark).toContain('--border: oklch(1 0 0 / 10%);');
    expect(dark).toContain('--input: oklch(1 0 0 / 15%);');
    expect(dark).toContain('--sidebar-primary: var(--brand);');
    // Every neutral token that .dark overrides exists in :root first, so no dark-only token appears from nowhere.
    const lightNames = declared(root);
    for (const name of declared(dark)) expect(lightNames.has(name), name).toBe(true);
  });

  it('adds the semantic tokens that no inherited scale expresses, with the touch target at 44 px', () => {
    expect(root).toContain('--dawlyy-touch-target-min: 2.75rem;');
    expect(Number.parseFloat('2.75') * 16).toBe(44);
    expect(root).toContain('--dawlyy-focus-ring-width: 2px;');
    expect(root).toContain('--dawlyy-focus-ring-offset: 2px;');
    for (const name of ['--dawlyy-floating-edge', '--dawlyy-bottom-bar-clearance', '--dawlyy-toast-max-width', '--dawlyy-layer-toast', '--dawlyy-table-select-column', '--dawlyy-selected-inset']) {
      expect(declarations(tokens, name), name).toHaveLength(1);
    }
  });

  it('never sets an Astryx --color-* variable on :root or .dark (only the Tailwind aliases inside @theme)', () => {
    expect(root).not.toMatch(/--color-[a-z-]+\s*:/);
    expect(dark).not.toMatch(/--color-[a-z-]+\s*:/);
    expect(withoutComments(tokens)).not.toContain('data-astryx-theme');
  });
});

describe('R5 token consolidation: the Astryx theme source holds no color of its own', () => {
  const source = theme.replace(/\/\*[\s\S]*?\*\//g, '');
  it('keeps defineTheme extending the neutral theme under the same name', () => {
    expect(source).toContain('name: "dawlyy"');
    expect(source).toContain('extends: neutralTheme');
    expect(source).toContain('export const dawlyyTheme = defineTheme(');
  });

  it('contains no hex or functional color literal', () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\b(?:oklch|rgb|rgba|hsl|color-mix)\(/);
  });

  it('points every accent token at a variable that tokens.css declares', () => {
    const used = [...source.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(match => match[1] ?? '');
    expect(used.length).toBeGreaterThanOrEqual(7);
    const known = declared(tokens);
    for (const name of used) expect(known.has(name), `${name} is declared in tokens.css`).toBe(true);
    expect(source).toContain('"--color-accent": accentPair');
    expect(source).toContain('"--color-accent-muted": accentSoft');
    expect(source).toContain('"--color-on-accent": onAccent');
    expect(source).toContain('"--shadow-inset-selected": "var(--dawlyy-selected-inset)"');
  });

  it('uses distinct --dawlyy-* names, so there is no --color-accent -> --accent -> --color-accent cycle', () => {
    const used = [...source.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(match => match[1] ?? '');
    for (const name of used) expect(name.startsWith('--dawlyy-'), name).toBe(true);
    expect(source).not.toMatch(/var\(--(?:color-accent|accent|brand)/);
  });

  it('keeps the selected-inset ring at the old half-strength alpha (the former #00655c80)', () => {
    const inset = blocks(tokens, ':root').join('\n').match(/--dawlyy-selected-inset:\s*([^;]+);/)?.[1] ?? '';
    expect(inset).toContain('inset 0 0 0 2px');
    expect(inset).toContain('var(--dawlyy-accent-light) 50%');
  });
});
