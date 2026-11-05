// Start (or reuse) the local science API, then Vite. `--production` previews dist/.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API_VERSION = '3.1';
const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];

function shutdown(code = 0) {
  for (const child of children) child.kill();
  process.exit(code);
}
function start(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
  children.push(child);
  child.on('error', (error) => { console.error(error.message); shutdown(1); });
  child.on('exit', (code) => { if (code) shutdown(code); });
  return child;
}
async function health() {
  try {
    const response = await fetch('http://127.0.0.1:8000/api/health', { signal: AbortSignal.timeout(1000) });
    return await response.json();
  } catch {
    return null;
  }
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

const python = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
const assets = ['moon.jpg', 'moon-normal.jpg', 'moon-south-normal.jpg', 'earth.png', 'terrain.json', 'moon-height.f32'];
const missing = assets.filter((file) => !existsSync(new URL(`../web/public/assets/${file}`, import.meta.url)));
if (missing.length) {
  console.error(`Generated browser assets are missing or outdated (${missing.join(', ')}).\nRun: ${python} science/prepare_assets.py   (or scripts/setup.ps1 on Windows)`);
  process.exit(1);
}

const running = await health();
if (running && running.modelVersion !== API_VERSION) {
  console.error(`An older science API (model ${running.modelVersion}) is already running on port 8000.\nStop that process, then start Preview again so the current Python code is used.`);
  process.exit(1);
}
if (running) {
  console.log('Using the science API already running on port 8000. Restart it after Python edits.');
} else {
  console.log('Starting the science API (loading SPICE kernels and LOLA terrain)…');
  const api = start(python, ['science/server.py']);
  let ready = false;
  for (let i = 0; i < 240 && !ready && api.exitCode === null; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    ready = (await health())?.modelVersion === API_VERSION;
  }
  if (!ready) {
    console.error('The science API did not become ready within 2 minutes. Check the messages above, or run setup again.');
    shutdown(1);
  }
}
start(process.execPath, ['node_modules/vite/bin/vite.js', ...(process.argv.includes('--production') ? ['preview'] : [])]);
