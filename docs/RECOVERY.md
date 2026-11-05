# Resume here — 2026-09-24
## Active upgrade request
Implement the first three recommended development tracks: educator-guided exploration, improved scientific time-window analysis, and expanded candidate-site analysis; also clean up visuals and scaling. This section is written before implementation. Preserve existing work and the real-data model.

Phases: (1) inspect/research current model and official high-resolution/constraint inputs; (2) implement partial solar disk, refined transitions and horizon comparison with tests; (3) improve candidate profiles, terrain evidence and catalog where official inputs support them; (4) guided lessons plus responsive scene/scaling cleanup; (5) integrated browser/science checks and updated docs. Do not claim resolved hazards when the required data are missing. No commits, pushes or deployment are requested.

Status: starting phase 1. The completed baseline below describes the September 17 implementation; it is not yet evidence for these upgrades.

## Current state
The requested local 3D application is implemented, installed and verified. All phases below are complete for the educational scope. Read README.md, PRODUCT-3D.md, SCIENCE.md and DATA-AND-API.md before extending it. Twelve scientific tests, three renderer tests, source/configuration checks and the production build pass. Detailed evidence and boundaries are in VERIFICATION.md.

The initial recovery/spec update was written before coding. The supplied images guide appearance; their Artemis text is reference content, not an instruction to implement that mission.

## Start immediately
Open NASA Space Apps 2026.code-workspace. Run the Preview VS Code task, or:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev.ps1
```
Visit http://127.0.0.1:5173. The workspace already contains .venv, node_modules, verified inputs and generated textures. Setup is idempotent; do not redownload or rebuild the project from scratch.

At handoff the Vite dev preview (5173) and science API (8000) are running. A temporary production QA preview used5174 and is stopped at handoff. If a port is occupied, identify its process before replacing it. Python changes require restarting the API, including a separately started API reused by Preview. Frontend edits refresh automatically.

## Repository and runtime
- Root: C:/Users/akshu/Documents/NASA Space Apps 2026.
- Origin: https://github.com/xkshayk/NASA-Space-Apps-2026.git; branch main, original history preserved.
- Changes are uncommitted. No push/deployment/license selection was made.
- Node24.19.0 and Python3.12.14 are available in Codex's bundled runtimes. npm is absent from PATH; setup finds bundled pnpm11.19.0.
- Installed Three0.186.0 / Vite8.3.0; exact pnpm-lock.yaml and science/requirements.lock.
- All11 official inputs (~400MB) downloaded and hash-verified. Raw data, kernels and generated assets are ignored.

## Completed phases
| Phase | Evidence |
| --- | --- |
| Recovery/spec before implementation | This file, PRODUCT-3D.md, AGENTS.md |
| Official sources and catalog | Four confirmed landing locations; three DSN stations; NASA/JPL/LOLA citations |
| Runtime and downloads | setup.ps1 successfully executed, manifest/hash cache, real terrain/textures |
| Science/API | SPICE vectors/rotations, terrain horizons, power/radio, windows/candidates,12 passing tests |
| Interactive3D | WebGL scene, picking, dates/calendar/slider/playback, scales, comparisons, stations, export |
| End-to-end QA and docs | Desktop/phone checks, API failures, compiled preview, rewritten docs and CI |

## Commands
```powershell
node scripts/check.mjs
.\.venv\Scripts\python.exe -m pytest science -q
node scripts/build.mjs
```
Optional online reference refresh: `.\.venv\Scripts\python.exe science/reference_check.py`.
Complete install/data verification: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup.ps1`.

## Scientific boundaries to preserve
Supported UTC2024-01-01–2026-12-01. Earth orientation after2026-09-16 is predicted. Lunar frame is MOON_ME_DE440_ME421 from moon_de440_250416.tf (the older220930 URL was unavailable). State is simultaneous geometric J2000, not apparent light-time-corrected viewing.

Terrain is240m south of60°S, ~1.9km global equatorial; render mesh0.5°. Horizon rays are2° apart to150km, fixed2m observer. Fine hazards, approach/vehicle constraints, thermal/storage effects and radio link budgets remain unassessed. Candidates always retain qualifiedForLanding=false. Do not promise100% accuracy or universal NASA approval.

## Next work, if requested
See IMPLEMENTATION.md for small tasks: terrain convergence/high-resolution tiles, refined events/partial Sun disk, mission-specific eligibility datasets, guided lessons, additional verified sites, or production deployment. There is no blocking implementation task for running the current local app.
