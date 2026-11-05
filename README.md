# Lunar Horizon
Compare sunlight and Earth contact at CLPS and Apollo landing sites in an interactive 3D Moon, computed from NASA/JPL SPICE geometry and NASA LOLA terrain. Built for the NASA Space Apps 2026 **CLPS Lunar Mission Browser** challenge.

[Challenge](https://www.spaceappschallenge.org/2026/challenges/clps-lunar-mission-browser/?tab=details) · [Repository](https://github.com/xkshayk/NASA-Space-Apps-2026) · [Resume instructions](docs/RECOVERY.md)

## Run it
### Windows (VS Code)
Open `NASA Space Apps 2026.code-workspace`, choose **Terminal → Run Task → Preview**, and visit **http://127.0.0.1:5173**. F5 opens the Edge debugger; Ctrl+C stops Preview.

First run on a fresh checkout:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1
```
Setup finds Node 22.12+ and Python 3.11+, installs locked dependencies, downloads about 400 MB of official NASA data plus 20 m terrain tiles near IM-1/IM-2, verifies hashes, prepares browser assets, then checks and builds. Allow about 1.5 GB. No key, account or administrator rights are needed, and exploration works offline afterwards. If Python is not found, pass `-Python "C:\path\to\python.exe"`.

### macOS / Linux
Tested on Linux with Node 22 and Python 3.12:
```sh
npm exec --yes --package=pnpm@11.19.0 -- pnpm install --frozen-lockfile
python3 -m venv .venv
.venv/bin/python -m pip install -r science/requirements.lock
.venv/bin/python science/download_data.py
.venv/bin/python science/import_regions.py
.venv/bin/python science/prepare_assets.py
node scripts/dev.mjs
```

### Updating an existing checkout
Pull, then run setup again (it is idempotent): it fetches the current NASA Earth orientation kernel, verifies the regional tiles and regenerates the browser assets (`moon-normal.jpg` and `moon-south-normal.jpg` are new). Stop any science API that is still running from before the update; `dev.mjs` refuses to reuse an outdated one and says so. Vite reloads JavaScript edits automatically; restart Preview after Python edits.

## Explore
- **Compare sites.** Pick up to four of IM-1 Odysseus, IM-2 Athena, Blue Ghost 1, Apollo 11, 12 and 17. Each card shows Sun clearance over the real terrain horizon, ideal panel power, Earth clearance, signal delay, a sky chart of the local horizon with the Sun’s and Earth’s paths across the window, mission facts and NASA sources.
- **Travel in time.** Set a UTC date and 24-hour time, press **Now**, drag the slider, step with ← →, or play (Space). The time bar shows one lane per site: gold while the Sun is up, teal while a Deep Space Network antenna can hear it. Click a lane or a sunrise/contact event to jump there.
- **Touchdown conditions.** Jump to the minute Odysseus, Athena or Blue Ghost 1 touched down and see the Sun and Earth geometry each lander faced.
- **A line home.** The Earth view looks back from the Moon at six DSN antennas (Goldstone, Canberra, Madrid; 70 m and 34 m), with a station-by-site visibility table.
- **Discover.** Click the Moon or enter a point to screen a square 5 × 5 grid: regional slope, 20 m ellipse slope and roughness near IM-1/IM-2, then date-specific sunlight and DSN contact. Every criterion is pass, fail or unknown; nothing is ever certified landable.
- **Guided tour.** Six short steps teach polar lighting, terrain shadows, DSN geometry, window planning, touchdown conditions and site screening.
- **Sources & method** lists every input with its SHA-256, the frames, limits and NASA/JPL reference tools. **JSON** exports the current state, window summary and sources.
- Keyboard: Space play/pause · ← → step · 1–4 views · L labels · R recenter · Esc back to the comparison.

## Accuracy and coverage
Real SPICE positions and rotations drive the scene; NASA LOLA elevations drive relief, shading and horizon calculations; static NASA mosaics give colour. Site coordinates keep their source and precision notes.

Supported dates: **2024-01-01 through 2027-01-31 UTC**, the span of the pinned NASA Earth orientation kernel. Earth orientation after 2026-11-04 is predicted. Out-of-range times fail explicitly instead of extrapolating.

No finite model is 100% accurate. Terrain is 20 m near IM-1/IM-2, 240 m south of 60° S and about 1.9 km elsewhere; the rendered mesh is 0.5° with unexaggerated LOLA normal maps (240 m near the south pole) for shading. Metre-scale obstacles, approach constraints and vehicle design remain unassessed, and the editable 10° slope default is a study assumption, not a NASA rule. Power is ideal for the chosen panel; radio geometry excludes link budgets and scheduling.

## Architecture and editing
| File | Purpose |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | System design, state flow and deployment |
| [Components](docs/COMPONENTS.md) | Component inventory |
| [Science](docs/SCIENCE.md) | Frames, calculations and boundaries |
| [Data/API](docs/DATA-AND-API.md) | Imports, sources, endpoints and limits |
| [Verification](docs/VERIFICATION.md) | Executed checks and unresolved validation |
| [Implementation](docs/IMPLEMENTATION.md) | Suggested next work |
| [Recovery](docs/RECOVERY.md) | Current state and restart instructions |
| web/app.js | Application state, API calls, time controls, URL state |
| web/panels.js | Site cards, sky chart, window lanes, station table, Discover results, sources |
| web/lessons.js | Guided tour steps |
| web/scene.js | Three.js scene: bodies, markers, labels, camera, polar shading |
| web/styles.css | Layout and visual design (desktop and phone) |
| science/engine.py, science/terrain.py | SPICE and terrain calculations |
| science/server.py | Local JSON API with per-request cancellation |
| data/catalog.json, data/downloads.json, data/regions.json | Curated sites/stations/missions and input provenance |

## Validate and build
```sh
node scripts/check.mjs
.venv/bin/python -m pytest science -q        # Windows: .\.venv\Scripts\python.exe -m pytest science -q
node scripts/build.mjs
```
Check and Build are also VS Code tasks. `science/reference_check.py` optionally refreshes the online JPL Horizons comparison; routine tests use the committed reference values offline.

The production build in dist/ still needs the Python API (GitHub Pages alone is not enough). `node scripts/dev.mjs --production` previews it locally with the API proxy on 5173. See the architecture notes for public hosting; the bundled HTTP server is local development tooling.

## Git and publishing
The .gitignore excludes kernels, raw imagery, generated assets, environments, dependencies, builds, credentials and local state; source, manifests, locks and reviewed VS Code settings belong in Git. CI checks the source, science and build; it does not deploy. Choose a project licence with the team before public release and keep the data attributions. This independent competition project is not NASA-endorsed; recheck the official submission guidance before entering.
