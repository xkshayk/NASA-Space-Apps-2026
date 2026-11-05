# Revised product: Lunar Horizon Explorer

This document supersedes the static/synthetic MVP decisions in the original architecture. It was written before implementation in response to the user's expanded request.

## Experience

Full-screen WebGL scene with a realistic Moon, Earth and Sun, restrained glass/dark overlays, clear focus modes, mouse orbit/zoom, selectable official lunar sites and terrestrial radio stations. Date/calendar/UTC time inputs, adjustable step units, range slider and playback drive all views together. Each selected site gets its own comparison card with understandable explanations, not raw technical dashboards. A collapsible “How we know” panel exposes sources, model resolution and assumptions.

Modes: Moon close-up, Earth/stations, Earth–Moon system, and solar-system context. True geometry is the scientific state. A clearly labeled illustrative overview may change scale only in the rendering layer; include true-scale mode. No spacecraft trajectories or unrelated Artemis content.

## Architecture

- **Client:** Vite + Three.js + plain JavaScript modules/CSS, no account or paid API. Texture assets from official NASA products, credited individually. Body meshes rotate with SPICE frame matrices; marker coordinates use those same frames.
- **Science service:** local Python API with SpiceyPy/NumPy, validated inputs, a serialized SPICE kernel context, bounded date coverage and calculation size, JSON endpoints, and cache. Serve no secrets. Vite proxies /api so the browser uses one origin.
- **Inputs:** pinned NAIF SPK, lunar PCK and frame kernels, leap seconds, radii/text PCK, Earth orientation and station data as needed. Versioned source manifest with URL, SHA-256, retrieval UTC, frame, coverage and limitations. Download idempotently to ignored data directories.
- **Reference tools:** research the existing NASA/JPL Sun/Earth geometry/planning tools; use official SPICE documentation and WebGeocalc/Horizons reference cases. Separate a numerical cross-check from independent terrain validation.
- **Derived outputs:** geometric state vectors, body orientations, per-site Sun/Earth angles, selected station visibility, idealized incident solar irradiance, duration-weighted opportunity summaries, candidate screening with pass/fail/unknown for each criterion.
- **Exploration:** candidate grid/point selection → mission-specific landability constraints → solar/radio conditions for requested date/window. Missing terrain/hazard/engineering inputs produce “unassessed,” never an invented NASA approval. Clearly distinguish historical actual landing locations, announced mission targets, and exploratory coordinates.

## Science and UX gates

- Real dates and coordinate frames, coverage rejection, no synthetic fallback.
- Confirmed site labels backed by NASA source links. Sources must distinguish actual landing vs planned target and precision.
- Station positions backed by official NAIF/NASA data. Earth orientation quality and time coverage shown.
- Solar flux/projection is an idealized input-energy proxy, not electrical power unless panel area/efficiency/orientation are specified.
- DTE/station line-of-sight is geometric opportunity, not a scheduled link or link-budget guarantee.
- No global “NASA-safe” threshold. Use published mission examples as editable profiles; unknown slope/roughness/boulders/approach constraints remain visible.
- Educational descriptions explain why conditions change. Main scene stays visually quiet; detail appears on selection.
- Automated scientific invariants, official reference comparison, API tests, production build, desktop/mobile/browser controls tested.

## Completion tracking

Maintain RECOVERY.md as the execution log and update COMPONENTS.md/README at completion so they describe the implemented app. Original documents retain useful theory but their old no-dependency/synthetic-only implementation choice is superseded.
