import { readdirSync, readFileSync } from 'node:fs';

function flat(object, prefix = '') {
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    throw new Error(`Expected a message object at ${prefix || '<root>'}`);
  }
  return Object.entries(object).flatMap(([key, value]) => {
    const path = `${prefix}${key}`;
    if (typeof value === 'string') return [path];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Include intermediate keys, so empty objects and object/string mismatches are checked too.
      return [path, ...flat(value, `${path}.`)];
    }
    throw new Error(`Expected a string or nested messages at ${path}`);
  });
}

function load(locale) {
  const directory = new URL(`../messages/${locale}/`, import.meta.url);
  const namespaces = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name.slice(0, -5)).sort();
  if (!namespaces.length) throw new Error(`No namespaces found for ${locale}`);
  const keys = new Set(namespaces.flatMap((namespace) => [namespace, ...flat(
    JSON.parse(readFileSync(new URL(`${namespace}.json`, directory), 'utf8')), `${namespace}.`,
  )]));
  return { namespaces: new Set(namespaces), keys };
}

try {
  const ar = load('ar');
  const en = load('en');
  const missingInEn = [...ar.keys].filter((key) => !en.keys.has(key));
  const missingInAr = [...en.keys].filter((key) => !ar.keys.has(key));
  const namespacesMissingInEn = [...ar.namespaces].filter((key) => !en.namespaces.has(key));
  const namespacesMissingInAr = [...en.namespaces].filter((key) => !ar.namespaces.has(key));
  console.log(`Namespaces missing in en: [${namespacesMissingInEn}], missing in ar: [${namespacesMissingInAr}]`);
  console.log(`ar keys: ${ar.keys.size}, en keys: ${en.keys.size}, missing in en: [${missingInEn}], missing in ar: [${missingInAr}]`);
  process.exitCode = missingInEn.length || missingInAr.length || namespacesMissingInEn.length || namespacesMissingInAr.length ? 1 : 0;
} catch (error) {
  console.error('Message namespace validation failed:', error);
  process.exitCode = 1;
}
