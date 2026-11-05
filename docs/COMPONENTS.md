# Component inventory
All runtime components below are implemented and installed.

| Area | Components and scope |
| --- | --- |
| Tools | Node 24, pnpm 11.19, Python 3.12 tested; setup discovers runtimes |
| Dependencies | Three.js, Vite; SpiceyPy, NumPy, Rasterio, Pillow; exact locks |
| Kernels | Planetary SPK, lunar PCK/FK, radii PCK, leap seconds, Earth orientation and DSN SPK |
| Terrain | Global LOLA (~1.9 km equatorial), adjusted southern LOLA (240 m) |
| Appearance | Static NASA Moon/Blue Marble textures; 0.5° lunar relief mesh |
| Acquisition | 11 official downloads, retries, cached hashes, manifests and asset preparation |
| Catalog | Four confirmed touchdown locations; precision/status/source notes |
| Stations | DSS-14 Goldstone, DSS-43 Canberra, DSS-63 Madrid; kernel coordinates |
| Geometry | UTC→ET, J2000 vectors, lunar/Earth rotation, local altitude/azimuth |
| Horizon | Curved-body terrain rays, 2° azimuth, 150 km range, 2 m observer |
| Power | Solar distance/projection, Earth eclipse fraction, area/efficiency/orientation |
| Radio | Earth clearance, individual station masks, light time; no link budget |
| Windows | Duration-weighted sampled visibility/energy; cadence disclosed |
| Candidates | 25-point slope screen then date lighting/DSN; unknown hazards preserved |
| API | health, catalog, state, point, timeline, candidates; validated loopback GET |
| 3D | Moon/Earth/Sun, physical placement/rotation, orbit/zoom/picking, labels/scales |
| Controls | Calendar, UTC time, adjustable-step slider, playback, focus/recenter |
| Education | Individual comparison cards, horizon chart, details, sources and limitations |
| Sharing | UTC/site URL state and local JSON export |
| Accessibility | Semantic forms, keyboard focus, text/list alternatives; no formal WCAG audit |
| Responsive | Desktop and stacked phone layouts inspected |
| Workspace | VS Code tasks/debugging, Git origin, README, gitignore |
| Checks | Scientific invariants, renderer transforms, JPL reference, build and CI |

## Extensions
Higher-resolution regional terrain; horizon convergence/error estimates; partial Sun terrain occultation and refined events; mission-specific hazards/approach/vehicle profiles; radio link budgets; storage/thermal models; additional confirmed sites/stations; narrated lessons; production hosting.

These are substantive extensions, not hidden implemented capabilities. The available coarse terrain cannot fully determine NASA landing eligibility.
