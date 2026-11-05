"""Download bounded native-resolution COG windows, never whole multi-GB rasters.

NASA/GSFC Barker et al. 2023, doi:10.3847/PSJ/acf3e1.
Windows retain original pixels/CRS, NaNs, scaling, and explicit source provenance.

Integrity is checked on the decoded pixel values, not on the re-compressed
GeoTIFF bytes: deflate output differs between GDAL/zlib builds (Windows vs
Linux), while identical NASA pixels always produce the same valuesSha256.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window
from range_reader import remote_opener

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/"
REGIONS = [("im1", -80.13, 1.44), ("im2", -84.7906, 29.1957)]
PRODUCTS = {
    "elevation": ("LDEM_80S_20MPP_ADJ.TIF", "m"),
    "slope": ("LDSM_80S_20MPP_ADJ.TIF", "degrees"),
    "elevationError": ("LDEM_80S_20MPP_ADJ_ERR.TIF", "m"),
    "effectiveResolution": ("LDEM_80S_20MPP_ADJ_EFFRES.TIF", "m"),
    "roughness100m": ("LDRM_80S_50MPP_ADJ_ROUGH_100M.TIF", "m; 100 m baseline"),
}

def values_digest(values):
    """Platform-independent SHA-256 of raster samples, shape and dtype."""
    array = np.ascontiguousarray(values)
    little = array.astype(array.dtype.newbyteorder("<"), copy=False)
    h = hashlib.sha256(f"{array.dtype.str.lstrip('<>|=')}:{array.shape}".encode())
    h.update(little.tobytes())
    return h.hexdigest()

def file_values_digest(path):
    with rasterio.open(path) as d:
        return values_digest(d.read(1))

def main():
    manifest_path = ROOT / "data/regions.json"
    old = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"inputs": []}
    known = {p["path"]: p for p in old["inputs"]}
    def acquire(job):
        (region, lat, lon), (kind, (filename, unit)) = job
        path = ROOT / f"data/raw/regions/{region}-{kind}.tif"
        relative = path.relative_to(ROOT).as_posix()
        previous = known.get(relative)
        expected = previous.get("valuesSha256") if previous else None
        if path.exists() and expected:
            if file_values_digest(path) != expected:
                raise ValueError(f"Regional pixel checksum mismatch: {relative}; inspect before replacing")
            print("Verified region:", path.name, flush=True)
            return previous
        url = BASE + filename
        print("Importing native window:", path.name, flush=True)
        rho = 2 * 1737400 * math.tan(math.radians(90 + lat) / 2)
        x, y = rho * math.sin(math.radians(lon)), rho * math.cos(math.radians(lon))
        # 48 km square around each confirmed site; data outside official coverage stay NaN.
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".TIF", GDAL_HTTP_MULTIRANGE="SERIAL", GDAL_HTTP_MULTIPLEX="NO", GDAL_HTTP_TIMEOUT="90", GDAL_HTTP_MAX_RETRY="3", GDAL_HTTP_RETRY_DELAY="1"):
            name, opener = remote_opener(url)
            with rasterio.open(name, opener=opener) as source:
                row, col = source.index(x, y)
                half = round(24000 / abs(source.transform.a))
                window = Window(max(0, col-half), max(0, row-half), 2*half, 2*half).intersection(Window(0, 0, source.width, source.height))
                values = source.read(1, window=window)
                transform = source.window_transform(window)
                profile = {"driver":"GTiff", "width":values.shape[1], "height":values.shape[0], "count":1, "dtype":values.dtype, "crs":source.crs, "transform":transform, "nodata":source.nodata, "compress":"deflate", "tiled":True}
                path.parent.mkdir(parents=True, exist_ok=True)
                temporary = path.with_suffix(".partial.tif")
                with rasterio.open(temporary, "w", **profile) as target:
                    target.write(values, 1)
                    target.scales = source.scales
                    target.offsets = source.offsets
                entry = {"path":relative, "region":region, "kind":kind, "url":url, "unit":unit, "pixelM":abs(transform.a), "sourceWindow":[int(window.col_off),int(window.row_off),int(window.width),int(window.height)], "transform":list(transform)[:6], "frame":"MOON_ME / DE421", "credit":"NASA/GSFC LOLA; Barker et al. 2023, doi:10.3847/PSJ/acf3e1", "retrievedUtc":datetime.now(timezone.utc).isoformat()}
        checksum = values_digest(values)
        if file_values_digest(temporary) != checksum:
            raise ValueError(f"Written regional window does not round-trip: {relative}")
        if expected and checksum != expected:
            raise ValueError(f"Regional source pixels changed: {relative}; inspect before replacing")
        os.replace(temporary, path)
        entry.update(valuesSha256=checksum, shape=list(values.shape), dtype=str(values.dtype))
        # A per-file checkpoint makes interrupted multi-file imports resumable.
        print("Imported:", path.name, values.shape, flush=True)
        return entry
    jobs = [(region, product) for region in REGIONS for product in PRODUCTS.items()]
    entries = []
    # GDAL /vsicurl configuration and handles are kept serial on Windows.
    with ThreadPoolExecutor(max_workers=1) as pool:
        for entry in pool.map(acquire, jobs):
            entries.append(entry)
            remaining = [v for k,v in known.items() if k not in {e["path"] for e in entries}]
            manifest_path.write_text(json.dumps({"schemaVersion":2, "source":"https://pgda.gsfc.nasa.gov/products/90", "integrity":"valuesSha256 hashes decoded samples, shape and dtype; independent of GeoTIFF compression", "inputs":entries + remaining}, indent=2)+"\n", encoding="utf-8")
    print("Regional inputs ready:", len(entries), flush=True)

if __name__ == "__main__":
    main()
