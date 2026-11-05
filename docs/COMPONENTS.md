# Component inventory
All runtime components below are implemented and installed.

| Area | Components and scope |
| --- | --- |
| Tools | Node 22.12+/24, pnpm, Python 3.11+ (3.12 tested on Windows and Linux); setup discovers runtimes |
| Dependencies | Three.js, Vite; SpiceyPy, NumPy, Rasterio, Pillow; exact locks |
| Kernels | Planetary SPK, lunar PCK/FK, radii PCK, leap seconds, Earth orientation (earth_000101_270131_261104) and DSN SPK |
| Terrain | Global LOLA (~1.9 km equatorial), adjusted southern LOLA (240 m), 20 m elevation/slope/error/effective-resolution and 50 m roughness tiles around IM-1 and IM-2 |
| Appearance | NASA Moon/Blue Marble mosaics; 0.5° LOLA mesh; unexaggerated normal maps (global residual, 240 m south polar cap); Earth atmosphere rim; Sun glow |
| Acquisition | 11 official downloads with hashes and 404 guidance; 10 regional windows with platform-independent pixel hashes; asset preparation |
| Catalog | Three CLPS landings (IM-1, IM-2, Blue Ghost 1) and three Apollo landings with lander, launch, touchdown UTC, outcome, payloads/crew and NASA sources |
| Stations | Six DSN antennas: 70 m DSS-14/43/63 and 34 m DSS-24/34/54 at Goldstone, Canberra and Madrid; kernel coordinates |
| Geometry | UTC→ET, J2000 vectors, lunar/Earth rotation, local altitude/azimuth, Moon phase seen from Earth |
| Horizon | Curved-body terrain rays, 2° azimuth, 150 km range, 2 m observer; sensitivity check against 1°/200 km and regional-only terrain |
| Power | Solar distance, partial Sun disk behind terrain and Earth, area/efficiency/orientation |
| Radio | Earth clearance, individual station masks, light time; no link budget |
| Windows | Dense search with bisected sunrise/sunset/contact events, per-site lanes, Sun/Earth sky paths, energy totals |
| Candidates | Square 5×5 local grid; study and early-Apollo profiles; ellipse slope/roughness evidence; pass/fail/unknown per criterion; rejections shown |
| API | health, catalog, state, point, timeline, candidates, horizon; concurrent requests with a SPICE lock; cancellation of abandoned work |
| 3D | Moon/Earth/Sun from SPICE, persistent markers, decluttered labels with Sun/link status, eased camera moves, view framed between panels, render-on-demand |
| Controls | Calendar date, 24-hour UTC time, Now, slider with latest-wins updates, steps, playback, 1–30 day windows, keyboard shortcuts |
| Education | Six-step guided tour, sky chart, touchdown conditions, mission facts, sources & method dialog |
| Sharing | UTC/sites/view URL state and local JSON export |
| Accessibility | Semantic forms and tabs, keyboard shortcuts, live status, text/table alternatives to the 3D view, reduced-motion support; no formal WCAG audit |
| Responsive | Desktop panels with the scene framed between them; phone layout with the scene on top and a compact time bar |
| Workspace | VS Code tasks/debugging, Git origin, README, gitignore |
| Checks | Scientific invariants, service/API failure cases, display-asset conventions, DOM-reference check, renderer transforms, JPL reference, build and CI |

## Extensions
Higher-resolution regional terrain; horizon convergence/error estimates; mission-specific hazards/approach/vehicle profiles; radio link budgets; storage/thermal models; additional confirmed sites as future CLPS landings are verified; production hosting.

These are substantive extensions, not hidden implemented capabilities. The available terrain cannot fully determine NASA landing eligibility.
