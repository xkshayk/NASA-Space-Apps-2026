import { spawnSync } from 'node:child_process';
import { readdir,readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
async function walk(folder){for(const entry of await readdir(folder,{withFileTypes:true})){if(['public','__pycache__'].includes(entry.name))continue;const url=new URL(entry.name+(entry.isDirectory()?'/':''),folder);if(entry.isDirectory())await walk(url);else if(/\.(m?js)$/.test(entry.name)){const r=spawnSync(process.execPath,['--check',fileURLToPath(url)],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}else if(entry.name.endsWith('.json'))JSON.parse(await readFile(url,'utf8'));}}
for(const dir of ['web/','scripts/','.vscode/'])await walk(new URL(dir,root));
const catalog=JSON.parse(await readFile(new URL('data/catalog.json',root),'utf8'));assert.equal(new Set(catalog.sites.map(s=>s.id)).size,catalog.sites.length);assert.ok(catalog.sites.every(s=>s.source.startsWith('https://')));
const r=spawnSync(process.execPath,['--test','tests/render-math.test.mjs'],{cwd:fileURLToPath(root),stdio:'inherit'});assert.equal(r.status,0,'Render-coordinate tests failed');
console.log('JavaScript, configuration and coordinate checks passed. Run science tests separately.');
