// Fast source checks: syntax, JSON, catalog consistency, DOM references and renderer math.
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const SKIP = new Set(['public', '__pycache__', 'raw', 'kernels', 'node_modules']);

async function walk(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), folder);
    if (entry.isDirectory()) await walk(url);
    else if (/\.m?js$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', fileURLToPath(url)], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    } else if (entry.name.endsWith('.json')) {
      JSON.parse(await readFile(url, 'utf8'));
    }
  }
}
for (const dir of ['web/', 'scripts/', '.vscode/', 'data/']) await walk(new URL(dir, root));

// Curated catalog: unique ids, cited sources, and touchdown times consistent with landing dates.
const catalog = JSON.parse(await read('data/catalog.json'));
assert.equal(new Set(catalog.sites.map((s) => s.id)).size, catalog.sites.length, 'Duplicate site id');
for (const site of catalog.sites) {
  assert.ok(site.source.startsWith('https://') && site.missionSource?.startsWith('https://'), `${site.id}: sources must be https links`);
  assert.ok(site.shortName && site.lander && site.outcome, `${site.id}: shortName, lander and outcome are required`);
  assert.ok(Number.isFinite(Date.parse(site.touchdownUtc)) && site.touchdownUtc.startsWith(site.landed), `${site.id}: touchdownUtc must match the landing date`);
}

// Every static element lookup in the app must exist in the page (a missing id once broke all view buttons).
const html = await read('web/index.html');
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const classes = new Set([...html.matchAll(/\sclass="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
for (const file of ['web/app.js']) {
  const source = await read(file);
  for (const [, id] of source.matchAll(/\$\('#([\w-]+)'\)/g)) assert.ok(ids.has(id), `${file} looks up #${id}, which is missing from index.html`);
  for (const [, name] of source.matchAll(/\$\('\.([\w-]+)'\)/g)) assert.ok(classes.has(name), `${file} looks up .${name}, which is missing from index.html`);
}

const tests = spawnSync(process.execPath, ['--test', 'tests/render-math.test.mjs'], { cwd: fileURLToPath(root), stdio: 'inherit' });
assert.equal(tests.status, 0, 'Render-coordinate tests failed');
console.log('JavaScript, JSON, catalog, DOM-reference and coordinate checks passed. Run science tests separately.');
