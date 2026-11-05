# Verification — 2026-11-05 (interface overhaul, Linux)
Environment: Linux container, Node 22.23, Python 3.12, Rasterio 1.5.1 / GDAL 3.12.4, headless Chromium with software WebGL.

## Setup from a fresh clone
- download_data.py: the ten unchanged inputs matched the committed SHA-256 values byte for byte. The pinned Earth orientation kernel (earth_000101_261213_260916.bpc) now returns 404 because NAIF replaced it without archiving; earth_000101_270131_261104.bpc was pinned, its SPICE coverage confirmed to end at 2027-01-31T00:00:00Z, and naif0012.tls confirmed as NAIF's current leap-second kernel.
- import_regions.py: the original file-level checksums failed on Linux because deflate output differs by platform. All ten windows were re-imported with the same source windows and transforms as the Windows import, and are now verified by valuesSha256 (decoded samples, shape, dtype); a second run verified from cache.
- prepare_assets.py regenerated colour, 0.5° block-mean mesh heights, the global residual normal map and the 240 m south-polar normal map; the obsolete 24 MB moon-height.png is no longer produced.

## Automated checks
- 38 pytest tests passed: the 24 earlier tests plus kernel/coverage consistency, square candidate grids at four latitudes, timeline series reuse matching direct state, cancellation, JSON API errors, and display-asset conventions (mesh/residual split, equirectangular and polar normal orientation).
- scripts/check.mjs passed, including the new check that every static element lookup in web/app.js exists in index.html (it fails when the missing #scene-title reference that broke the view buttons is reintroduced) and catalog touchdown/landing-date consistency. Three renderer tests passed.
- Production build: 640 kB JavaScript (166 kB gzip); dist/ is 13 MB.
- GitHub Actions (ubuntu-latest) passed from a clean runner in about 5.5 minutes: downloads, regional import with pixel-hash verification, asset preparation, checks, 38 tests and the build. Its first run caught a NameError introduced while refactoring prepare_assets.py, since fixed.

## Service behaviour
- State requests took 4–75 ms. A 3-day, 2-site window took 1.5 s and a 30-day, 4-site window 8–12 s. While a 30-day window was calculating, state requests completed in 9–13 ms (previously they queued behind one global lock). An abandoned timeline request stopped at its next checkpoint, leaving the API idle.
- One second past the coverage end, an unknown route, a missing parameter and five sites each returned explicit JSON errors.

## Browser QA (1440×900 and 390×844)
- No console errors across: four views, site focus, Earth/DSN table, touchdown jump (IM-1 at 2024-02-22 23:23 UTC: Sun 9.9° above terrain, 63 W, two DSN antennas), playback (about nine steps per second), Discover near IM-2 (0.1°: 25 tested → 3 pass terrain → 3 pass sunlight and DSN at 2024-02-23 18:23 UTC), candidate evidence, the guided tour, the sources dialog and JSON export.
- Dragging the slider produced 121 input events and 72 state requests with never more than one in flight; the display settled on the final time.
- The south polar region renders without the equirectangular starburst; labels no longer overlap; phone layout has no horizontal overflow.

## Not verified in this pass
Windows setup after these changes, real-GPU frame rates, browsers other than Chromium, a formal accessibility audit and public hosting. Software WebGL is slow, so frame timings above are not representative of user hardware.

# Verification — 2026-09-17 (initial implementation, Windows)
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
