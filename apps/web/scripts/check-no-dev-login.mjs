import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../.next/', import.meta.url));
const marker = Buffer.from('dawlyy_dev_session');
const findings = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(path);
    } else if (entry.isFile()) {
      const contents = await readFile(path);
      if (contents.includes(marker)) findings.push(`${relative(root, path)}: development cookie marker`);
      if (/manifest\.(?:json|js|mjs)$/.test(entry.name)
        && contents.toString('utf8').replaceAll('\\/', '/').includes('/api/dev-login')) {
        findings.push(`${relative(root, path)}: /api/dev-login route`);
      }
    } else {
      // Do not silently skip symlinks or special entries when claiming the build is clean.
      throw new Error(`Cannot inspect nonregular build entry: ${relative(root, path)}`);
    }
  }
}

try {
  if (!(await stat(root)).isDirectory()) throw new Error('.next is not a directory');
  await scan(root);
  if (findings.length) {
    console.error(`Development login found in production build:\n${findings.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('No development session marker or /api/dev-login route found in .next/.');
  }
} catch (error) {
  console.error('Could not verify .next/. Run a production next build first.', error);
  process.exitCode = 1;
}
