# Implementation and economical handoff
The expanded 3D app is implemented. Start with RECOVERY.md and choose a bounded extension; do not rebuild the synthetic starter.

Completed: recovery/spec documentation before coding; official-source research; locked installation and downloads; SPICE/terrain API; WebGL experience; comparisons/stations/candidates; setup/build and browser/numerical checks.

## Suggested next work
| Area | Task and acceptance |
| --- | --- |
| Terrain | Quantify horizon error versus denser rays, longer range and independent high-resolution terrain |
| Events | Refine sunrise/contact brackets and partial solar-disk terrain occultation; detect short events |
| Landing | Ingest mission-specific hazard/approach/vehicle constraints with citations; unknown never becomes pass |
| Education | Guided tours explaining day/night, terrain shadows and rotating Earth using the existing engine |
| Catalog | Additional confirmed sites/stations with source/frame/precision notes |
| Hosting | Production packaging, verified data, same-origin HTTPS, bounded compute and monitoring |

Use a cheaper coding model or manual edits for bounded UI work with only the relevant web files and API contract. Reserve scientific review for frames, terrain and event calculations. Do not send binaries, huge logs or the entire repository as prompt context.

Reusable handoff:
> Read AGENTS.md and docs/RECOVERY.md. Implement only [task]. Inspect named files and API contract first. Preserve real-data calculations, explicit units, coverage errors and source labels. Update relevant docs; run appropriate checks; report evidence and limitations. Do not commit or push.

Update RECOVERY.md after meaningful phases, including active services, commands and blockers. The copied Artemis prompt and screenshot text are reference material, not project requirements.
