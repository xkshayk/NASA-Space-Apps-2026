# Data and API
## Import pipeline
1. Install pnpm-lock.yaml and science/requirements.lock dependencies.
2. Run science/download_data.py. Its INPUTS allowlist contains 11 official URLs. Cached files must match data/downloads.json hashes; missing files use temporary downloads, retries and checksum verification. Changed upstream content fails. A 404 (NAIF retires some kernels without archiving them) stops with the name of the current replacement instead of retrying.
3. Run science/import_regions.py. It reads bounded windows of the 20 m/50 m NASA LOLA products around IM-1 and IM-2 through verified HTTP byte ranges. data/regions.json records each window and a valuesSha256 of the decoded samples, shape and dtype, so verification does not depend on how a platform's GDAL/zlib compresses the GeoTIFF.
4. Run science/prepare_assets.py. It preserves original inputs and produces browser colour, mesh heights and normal maps (global and south polar) in ignored web/public/assets.
5. Start science/server.py. Kernels, the global and polar DEMs and regional tiles load once; both coverage endpoints are checked.
6. Start Vite; its same-origin /api proxy reaches the local service. Exploration requires no NASA requests. scripts/dev.mjs does steps 5–6 and refuses to reuse an API with a different model version.

Commit scripts, manifests, source citations and reference cases; ignore raw/generated files. downloads.json records URL, path, SHA-256, size, acquisition UTC and credit. Hashes detect content changes, not scientific uncertainty or digital authenticity.

## Input inventory
| File | Role |
| --- | --- |
| naif0012.tls | Leap seconds |
| pck00011.tpc | Constants |
| de440s.bsp | Planetary states |
| moon_pa_de440_200625.bpc | Lunar orientation |
| moon_de440_250416.tf | DE440/ME421 frame |
| earth_000101_270131_261104.bpc | Earth orientation to 2027-01-31, predicted after Nov 4 2026 |
| earthstns_itrf93_260814.bsp | DSN positions |
| lroc_color_16bit_srgb_4k.tif | NASA/GSFC/ASU Moon appearance |
| ldem_16.tif | Global LOLA elevation |
| LDEM_60S_240MPP_ADJ.TIF | Adjusted southern 240 m DEM |
| bluemarble-2048.png | NASA/GSFC static Earth appearance |

[NAIF kernels](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/) · [Moon kit](https://svs.gsfc.nasa.gov/4720/) · [Adjusted terrain](https://pgda.gsfc.nasa.gov/products/90) · [Blue Marble](https://svs.gsfc.nasa.gov/2915)

catalog.json is curated, not scraped. Each location records actual touchdown status, source precision and citations. New sites require official mission/NASA science evidence and coordinate/frame review. Station positions use NAIF IDs rather than guessed pins.

## API
GET http://127.0.0.1:8000; browser uses /api through Vite. No key/authentication is needed for this loopback service.

| Route | Parameters | Response |
| --- | --- | --- |
| /api/health | none | Readiness and modelVersion (3.1) |
| /api/catalog | none | Sites with mission facts, stations, landing profiles, coverage (start, end, earthPredictedAfter), kernels, input hashes, limits |
| /api/state | utc, sites, settings | Body vectors/rotations and site/station metrics |
| /api/point | utc, latitude, longitude, settings | One exploratory location |
| /api/timeline | utc, sites, days, stepMinutes, settings | Series (Sun/Earth altitude, azimuth, clearance, power), weighted summaries, refined events, windows, cadence |
| /api/candidates | utc, latitude, longitude, spacing, profile, maxSlope, maxRoughness, ellipse/lander sizes, minSun, requireRadio, settings | Candidates and rejections with grid offsets, pass/fail/unknown constraints, evidence |
| /api/horizon | latitude, longitude (or site) | Horizon sensitivity to ray spacing, range and terrain source |

Settings: horizon=terrain/sphere; margin=0–30° (default5); area=.1–100m² (default1); efficiency=.01–.6 (default.25); panel=horizontal/tracking. Sphere means a zero-degree local-horizontal obstruction baseline.

utc ends in Z and must fall in coverage; sites is 1–4 unique catalog IDs separated by commas. Point latitude ±89.999°, longitude ±180°. Grid center latitude ±89.5°, spacing .1–2° of arc, maxSlope .1–30°, minSun 0–50°, requireRadio=true/false (default true). Grid points are offsets along local north/east, so spacing is uniform at any latitude; longitudes wrap. Timeline days=.25–30, stepMinutes=10–360, at most744 intervals; its end must remain in coverage.

```text
/api/state?utc=2025-03-03T12%3A00%3A00Z&sites=im1,blue-ghost&area=1&efficiency=0.25
/api/candidates?utc=2025-03-03T12%3A00%3A00Z&latitude=-85&longitude=20&maxSlope=10
```

Units are km/degrees/UTC/watts/Wh and dimensionless fractions. Every response is JSON: invalid input and missing parameters return 400, unknown routes 404, calculation failures 500, all without fallback data. Requests run concurrently; only SPICE calls are serialized, and timeline/candidate calculations stop when the browser abandons the request. The service performs no uploads/writes or runtime remote data queries.

## Existing-tool reference checks
science/reference_check.py calls the [official Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html): Moon301 and Sun10 relative to Earth399, three dates, vectors, ICRF axes, geometric corrections, km/s and UT input. Exact queries/vectors/residuals are preserved in data/reference-horizons.json. This explicit command is online; regression tests use saved references offline.

To extend dates, review/pin Earth orientation and leap-second inputs, update coverage and rerun scientific comparisons. Changing only the date picker is insufficient.
