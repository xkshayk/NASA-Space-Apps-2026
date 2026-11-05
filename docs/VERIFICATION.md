# Verification — 2026-09-17
## Executed locally
- Complete Windows scripts/setup.ps1 passed: Node24.19.0, pnpm11.19.0, Python3.12.14, locked dependencies, all11 cached input SHA-256 checks, generated NASA assets, JS checks and production build.
- Twelve pytest tests passed: local basis/cardinal angles; invalid UTC/coverage/sites/options; rotation orthogonality/distances; 12 surface observer cases against SPICE spkcpo; DSN positions; published IM-1 elevation/slope sanity; analytic smooth-sphere horizon depression; eclipse limiting cases; power/darkness; weighted timeline bounds; candidate unknown-hazard handling; captured Horizons references.
- Three renderer tests passed: distance/handedness, prime-meridian/east-positive coordinates, and matrix basis conversion.
- Official Horizons API was queried for Moon and Sun relative to Earth at 2024-02-22T23:24Z, 2025-03-02T08:34Z and 2026-10-03T12:00Z. The six DE441-vs-DE440 residuals are approximately 0.6–2.5m. Exact requests/results are in data/reference-horizons.json. These related JPL models are a cross-check, not independent terrain validation.
- API health returned200. Out-of-coverage dates, unknown sites, NaN options, invalid latitude, invalid radio boolean and timelines extending beyond coverage returned400. Unknown route returned404.
- Vite build succeeded (~583kB JavaScript, ~148kB gzip). A separate production preview served the compiled module, Moon texture and proxied API with200 responses.
- Desktop browser: Moon/Earth textures, site/DSN markers, rotations and source dialog inspected; calendar date, adjustable increments, stepping/playback, multi-site selection, body focus and scale modes exercised.
- Moon surface picking populated real coordinates/metrics. Screening the picked neighborhood produced25 tested /22 slope-pass /22 date-pass at the inspected date; changing time cleared stale candidates. A separate south-polar example produced zero date-pass results without fabricated alternatives.
- JSON export downloaded and parsed successfully: modelVersion2.0, three selected sites, UTC timestamp and11 source records. The browser automation's download notification timed out, but the actual file was present and validated in Downloads.
- Phone viewport390×844 inspected; no horizontal overflow. A scene-toolbar/site-panel overlap was corrected.
- Git origin matches the requested repository, existing main history is preserved, representative secret/data/build/environment paths are ignored, and whitespace checks passed.

## Expected warning
Rasterio reports NotGeoreferencedWarning for the global CGI-kit elevation TIFF. That product's known equirectangular pixel grid is interpreted explicitly rather than through a GeoTIFF transform. The southern polar GeoTIFF's projection/scale/radius are checked. This warning is not suppressed.

## Limits of verification
No claim of100% accuracy, flight certification, full global terrain validation, adaptive event precision or fine hazard safety. The smooth-sphere test verifies curvature math, not horizon convergence on real terrain. Six ephemeris samples do not establish accuracy at every time. Browser QA is manual/local, not an exhaustive cross-browser or accessibility audit. macOS/Linux setup, remote GitHub Actions and public hosting have not been executed. No commit, push or deployment occurred.
