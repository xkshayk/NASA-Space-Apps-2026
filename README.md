# Lunar Horizon
Interactive 3D lunar site exploration for NASA Space Apps 2026, powered by NASA/JPL SPICE and LOLA terrain.

[Challenge](https://www.spaceappschallenge.org/2026/challenges/clps-lunar-mission-browser/?tab=details) · [Repository](https://github.com/xkshayk/NASA-Space-Apps-2026) · [Resume instructions](docs/RECOVERY.md)

## Open in VS Code
Open `NASA Space Apps 2026.code-workspace`, choose **Terminal → Run Task → Preview**, and visit **http://127.0.0.1:5173**. F5 opens the Edge debugger. Ctrl+C stops Preview.

The environment and data are already installed here. On a fresh Windows checkout:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```
Setup discovers Node 22.12+ and Python 3.11+ (including this machine's Codex runtimes), installs locked dependencies, downloads approximately 400 MB of official data, verifies hashes, prepares assets, checks source and builds. Node 24 and Python 3.12 were tested. Allow roughly 1.5 GB for dependencies, inputs and outputs. No key, account, paid service or administrator privileges are needed. Normal exploration works offline after installation.

If Python is not found, pass `-Python "C:\path\to\python.exe"`. ExecutionPolicy applies only to that process. Vite refreshes JavaScript edits automatically; restart Preview after Python changes. If Preview reuses an existing API, stop that separately started API before restarting.

macOS/Linux commands (documented, not locally tested):
```sh
npm exec --yes --package=pnpm@11.19.0 -- pnpm install --frozen-lockfile
python3 -m venv .venv
.venv/bin/python -m pip install -r science/requirements.lock
.venv/bin/python science/download_data.py
.venv/bin/python science/prepare_assets.py
node scripts/dev.mjs
```

## Explore
- Drag to orbit and scroll to zoom. Switch among Moon, Earth, Earth + Moon and Sun system.
- Pick a calendar date/UTC time, scrub the slider, choose an increment from one minute to one day, and play/pause.
- Compare IM-1 Odysseus, IM-2 Athena, Blue Ghost Mission 1 and Apollo 11. Each has its own Sun/terrain clearance, ideal panel output, Earth clearance, light time, DSN opportunity and sampled window summary.
- Select Goldstone DSS-14, Canberra DSS-43 or Madrid DSS-63 on Earth or in the station list.
- Click the Moon or open Discover. Screen a 25-point neighborhood by regional slope, then date-specific sunlight and optional DSN visibility.
- Open NASA / JPL data for sources, hashes and limits. Expand site details for assumptions, or export the current comparison as JSON.
- True scale preserves physical positions/radii. Illustrative scale changes only the scene; markers are enlarged in both modes.

## Accuracy and coverage
Real SPICE positions and rotations drive the scene. NASA LOLA elevations drive relief and horizon calculations. Static NASA mosaics provide appearance. Site coordinates retain source/precision notes.

Supported dates: **2024-01-01 through 2026-12-01 UTC**. Earth orientation after 2026-09-16 is predicted. Out-of-coverage input fails explicitly.

A finite model cannot be 100% accurate. Terrain is 240 m per pixel south of 60°S and about 1.9 km at the equator elsewhere; the rendered global mesh uses 0.5° samples. Meter-scale obstacles, approach constraints and vehicle design remain unassessed. Candidates are never labeled safe/approved. The editable 10° slope default is a study assumption, not a universal NASA rule. Power is ideal under selected panel settings; radio geometry excludes link budgets and antenna scheduling.

## Architecture and editing
| File | Purpose |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | System design, state flow and deployment |
| [Components](docs/COMPONENTS.md) | Complete component inventory |
| [Science](docs/SCIENCE.md) | Frames, calculations and boundaries |
| [Data/API](docs/DATA-AND-API.md) | Imports, sources, endpoints and limits |
| [Verification](docs/VERIFICATION.md) | Executed checks and unresolved validation |
| [Implementation](docs/IMPLEMENTATION.md) | Economical continuation tasks |
| [Recovery](docs/RECOVERY.md) | Current state and restart instructions |
| web/scene.js, web/app.js, web/styles.css | 3D rendering, interaction and appearance |
| science/engine.py, science/terrain.py | SPICE and terrain calculations |
| data/catalog.json, data/downloads.json | Curated sites/stations and input provenance |

## Validate and build
```powershell
node scripts/check.mjs
.\.venv\Scripts\python.exe -m pytest science -q
node scripts/build.mjs
```
Check and Build are also VS Code tasks. The optional online reference refresh is `.\.venv\Scripts\python.exe science/reference_check.py`; routine tests use committed reference values offline.

The production browser build is in dist/. It still requires the Python API: GitHub Pages alone is insufficient. `node scripts/dev.mjs --production` previews the build locally with the API proxy on 5173. See architecture for public-hosting requirements; the bundled HTTP server is local development tooling.

## Git and publishing
Origin points to the repository above; existing main-branch history is preserved. No assistant changes have been committed or pushed. The comprehensive .gitignore excludes kernels, raw imagery, generated assets, environments, dependencies, builds, credentials and local state. Source, manifests, locks and reviewed VS Code settings are intended for Git.

After reviewing changes and checks:
```sh
git status
git add README.md .gitignore .gitattributes .editorconfig .github .vscode "NASA Space Apps 2026.code-workspace" AGENTS.md package.json pnpm-lock.yaml vite.config.js web scripts docs science data tests
git diff --cached --stat
git diff --cached
git commit -m "Build SPICE-powered 3D lunar site explorer"
git push origin main
```
CI checks the source, science and build; it does not deploy. Choose a project license with the team before public release and retain data attribution separately. This independent competition project is not NASA-endorsed. Recheck official submission guidance before entering.
