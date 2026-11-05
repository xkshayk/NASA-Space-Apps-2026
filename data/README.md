# Data provenance
catalog.json contains four sourced actual touchdown locations and three DSN antennas. downloads.json records all11 official inputs with URL/hash/size/date/credit. reference-horizons.json stores exact queries and six numerical comparisons. sources.json indexes documentation.

kernels/ and raw/ are ignored reproducible inputs. web/public/assets/ contains ignored derived assets. Use scripts/setup.ps1 for installation, or see [data/API](../docs/DATA-AND-API.md).

Do not change a checksum merely to silence a mismatch: inspect and review upstream changes, then validate the new dataset. Keep source/status/precision notes when expanding the catalog.
