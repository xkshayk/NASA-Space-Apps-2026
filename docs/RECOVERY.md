# Resume here — 2026-11-05
## Current state
The 3D application is implemented, and the September upgrade (guided exploration, refined time windows, expanded candidate analysis, visual cleanup) is now fully wired into the interface. 38 science tests, three renderer tests, source/DOM/catalog checks and the production build pass. Evidence and boundaries are in VERIFICATION.md.

## What changed in the 2026-11-05 pass
- Fixed a crash that disabled the view buttons, site focus, station picks and candidate clicks (the code referenced removed page elements), and the 4-site selection limit, picked-point and stale-candidate flows.
- Integrated the unused experience module: guided tour (web/lessons.js), landing profiles and ellipse/vehicle inputs, pass/fail/unknown evidence, sunrise/contact events, window lanes and horizon sensitivity (web/panels.js). web/experience.js was removed.
- Smoother interaction: one state request in flight with latest-wins updates, faster playback, persistent markers, eased camera moves, decluttered labels, render-on-demand; the API no longer serializes whole requests and abandons work the browser cancels.
- Visual redesign: readable type, clearer cards with a sky chart, per-site time lanes, Earth view from the Moon, DSN station table, phone layout, and unexaggerated LOLA normal maps including a 240 m south-polar cap that removes the polar texture pinch.
- More detail: mission facts and touchdown times for every site, "touchdown conditions" jumps for the CLPS landings, Moon phase, square candidate grids with rejections shown.
- Setup repairs: NAIF retired the pinned Earth kernel; the current one extends coverage to 2027-01-31. Regional tiles now verify by pixel hash on any platform. CI imports the regional tiles. dev.mjs checks assets and API version.

## Start immediately
Open NASA Space Apps 2026.code-workspace and run the Preview task, or:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev.ps1
```
Visit http://127.0.0.1:5173. **After pulling this pass, run scripts/setup.ps1 once**: it downloads the new Earth kernel, verifies the regional tiles and generates the new normal-map assets. Stop any API process started before the update (dev.mjs reports a model-version mismatch). Python changes require restarting the API; frontend edits refresh automatically.

## Repository and runtime
- Windows root: C:/Users/akshu/Documents/NASA Space Apps 2026. This pass ran in a Linux cloud container from a fresh clone.
- Origin: https://github.com/xkshayk/NASA-Space-Apps-2026.git.
- Node 22.12+ (24 tested on Windows, 22 on Linux) and Python 3.12. Three 0.186.0 / Vite 8.3.0; exact pnpm-lock.yaml and science/requirements.lock.
- 11 official inputs (~400 MB) plus 10 regional windows (~165 MB); raw data, kernels and generated assets are ignored.

## Commands
```powershell
node scripts/check.mjs
.\.venv\Scripts\python.exe -m pytest science -q
node scripts/build.mjs
```
Optional online reference refresh: `.\.venv\Scripts\python.exe science/reference_check.py`.
Complete install/data verification: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup.ps1`.

## Scientific boundaries to preserve
Supported UTC 2024-01-01 to 2027-01-31, the pinned Earth kernel's span; Earth orientation after 2026-11-04 is predicted. Lunar frame is MOON_ME_DE440_ME421 from moon_de440_250416.tf. State is simultaneous geometric J2000, not apparent light-time-corrected viewing.

Terrain is 20 m near IM-1/IM-2, 240 m south of 60° S, ~1.9 km elsewhere; render mesh 0.5° with display-only normal maps. Horizon rays are 2° apart to 150 km from a 2 m observer. Fine hazards, approach/vehicle constraints, thermal/storage effects and radio link budgets remain unassessed. Candidates always keep qualifiedForLanding=false. Do not promise 100% accuracy or NASA approval.

## Next work, if requested
See IMPLEMENTATION.md. There is no blocking task for running the current local app.
