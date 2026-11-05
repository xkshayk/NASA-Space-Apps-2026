# Science service
Python 3.11+ (3.12 tested on Windows and Linux); exact dependencies in requirements.lock. Full Windows installation is ../scripts/setup.ps1.

```sh
.venv/bin/python science/download_data.py     # official kernels, DEMs and mosaics (hash-verified)
.venv/bin/python science/import_regions.py    # 20 m / 50 m LOLA windows around IM-1 and IM-2
.venv/bin/python science/prepare_assets.py    # browser textures, mesh heights and normal maps
.venv/bin/python -m pytest science -q
.venv/bin/python science/server.py
```
On Windows use `.\.venv\Scripts\python.exe`. Run from the repository root. The API listens on port 8000; scripts/dev.mjs starts or reuses it (same model version only) together with Vite. Restart it after Python edits. SPICE calls are serialized; other work runs concurrently and long requests stop when the browser abandons them.

Read [science](../docs/SCIENCE.md), [data/API](../docs/DATA-AND-API.md) and [verification](../docs/VERIFICATION.md). reference_check.py explicitly refreshes online Horizons comparisons; normal tests use saved values. Missing inputs never trigger synthetic fallback.
