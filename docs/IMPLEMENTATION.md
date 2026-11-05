# Implementation and economical handoff
The 3D app, its guided tour and its analysis panels are implemented. Start with RECOVERY.md and choose a bounded extension; do not rebuild from scratch.

## Suggested next work
| Area | Task and acceptance |
| --- | --- |
| Catalog | Add CLPS landings as they happen (Griffin-1 is planned for late 2026; IM-3 and Blue Moon MK1 for 2027) once NASA/LROC publish touchdown coordinates; keep status, precision and sources |
| Kernels | When NASA's next Earth orientation kernel appears, pin it, update coverage and rerun the tests to keep dates ahead of today |
| Terrain | Quantify horizon error versus denser rays, longer range and independent high-resolution terrain |
| Events | Detect events shorter than the search step; report terrain-driven timing uncertainty |
| Landing | Ingest mission-specific hazard/approach/vehicle constraints with citations; unknown never becomes pass |
| Performance | Vectorize timeline sampling across times to shorten 30-day, four-site windows (currently ~10 s) |
| Visuals | A north-polar DEM cap like the southern one; higher-resolution colour near the CLPS sites |
| Hosting | Production packaging, verified data, same-origin HTTPS, bounded compute and monitoring |

Use a cheaper coding model or manual edits for bounded UI work with only the relevant web files and API contract (web/contracts.d.ts). Reserve scientific review for frames, terrain and event calculations. Do not send binaries, huge logs or the entire repository as prompt context.

Reusable handoff:
> Read AGENTS.md and docs/RECOVERY.md. Implement only [task]. Inspect named files and the API contract first. Preserve real-data calculations, explicit units, coverage errors and source labels. Update relevant docs; run node scripts/check.mjs, the science tests and the build; report evidence and limitations. Do not commit or push unless asked.

Update RECOVERY.md after meaningful phases, including active services, commands and blockers.
