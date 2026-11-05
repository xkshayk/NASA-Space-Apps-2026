# Science service
Python3.11+ (3.12 tested); exact dependencies in requirements.lock. Full Windows installation is ../scripts/setup.ps1.

```powershell
.\.venv\Scripts\python.exe science/download_data.py
.\.venv\Scripts\python.exe science/prepare_assets.py
.\.venv\Scripts\python.exe -m pytest science -q
.\.venv\Scripts\python.exe science/server.py
```
Run from the repository root. API port8000; scripts/dev.mjs starts/reuses it with Vite. Restart after Python edits. SPICE calculations are serialized.

Read [science](../docs/SCIENCE.md), [data/API](../docs/DATA-AND-API.md) and [verification](../docs/VERIFICATION.md). reference_check.py explicitly refreshes online Horizons comparisons; normal tests use saved values. Missing inputs never trigger synthetic fallback.
