"""Idempotent, allowlisted NASA data acquisition. Never runs at API request time."""
from pathlib import Path
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/'
# NAIF periodically replaces the high-precision Earth orientation kernel and
# does not archive the superseded file. When that happens, pin the new file
# here, review its coverage and prediction date (engine.py reads both from
# this module), then rerun the science tests.
EARTH_KERNEL = 'earth_000101_270131_261104.bpc'
EARTH_PREDICTED_AFTER = '2026-11-04T00:00:00Z'  # "UTC epoch of last datum" in the kernel comments
INPUTS = [
    ('kernels/naif0012.tls', BASE+'lsk/naif0012.tls', 'NAIF leap seconds'),
    ('kernels/pck00011.tpc', BASE+'pck/pck00011.tpc', 'NAIF body radii'),
    ('kernels/de440s.bsp', BASE+'spk/planets/de440s.bsp', 'JPL DE440 short planetary ephemerides'),
    ('kernels/moon_pa_de440_200625.bpc', BASE+'pck/moon_pa_de440_200625.bpc', 'DE440 lunar orientation'),
    ('kernels/moon_de440_250416.tf', BASE+'fk/satellites/moon_de440_250416.tf', 'DE440 lunar frame definitions'),
    (f'kernels/{EARTH_KERNEL}', BASE+f'pck/{EARTH_KERNEL}', f'Earth ITRF93 orientation; predictions after {EARTH_PREDICTED_AFTER[:10]}'),
    ('kernels/earthstns_itrf93_260814.bsp', BASE+'spk/stations/earthstns_itrf93_260814.bsp', 'DSN station positions in ITRF93'),
    ('raw/moon-color.tif', 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_16bit_srgb_4k.tif', 'NASA/GSFC/ASU LROC aesthetic surface mosaic, not science pixels'),
    ('raw/moon-dem.tif', 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16.tif', 'NASA/GSFC LOLA global 16 pixels/degree elevation'),
    ('raw/earth.png', 'https://svs.gsfc.nasa.gov/vis/a000000/a002900/a002915/bluemarble-2048.png', 'NASA/GSFC Blue Marble static mosaic; not live weather'),
    ('raw/south-dem.tif', 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_240MPP_ADJ.TIF', 'NASA GSFC adjusted LOLA south polar DEM, 240 m/pixel'),
]
USER_AGENT = 'LunarHorizonExplorer/0.3 (NASA Space Apps educational project)'

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024*1024), b''): h.update(chunk)
    return h.hexdigest()

def replacement_hint(url):
    """Name the current NAIF files that look like successors of a removed kernel."""
    folder, name = url.rsplit('/', 1)
    prefix = re.match(r'[a-z]+_\d+_', name) or re.match(r'[a-z_]+', name)
    try:
        request = urllib.request.Request(folder+'/', headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(request, timeout=60) as response:
            listing = response.read().decode('utf-8', 'replace')
        found = sorted(set(re.findall(r'href="(' + re.escape(prefix.group(0)) + r'[^"/]*\.' + name.rsplit('.', 1)[1] + ')"', listing)))
    except Exception:
        found = []
    suggestion = f' Current candidates: {", ".join(found)}.' if found else ''
    return (f'{url} is no longer published (HTTP 404). NAIF replaces some kernels without archiving them.{suggestion} '
            'Pin the replacement in science/download_data.py, review its coverage, then rerun setup and the science tests.')

def fetch(url, temporary):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(request, timeout=120) as response, temporary.open('wb') as output:
                if 'text/html' in response.headers.get('Content-Type', ''): raise ValueError('Expected binary/kernel, received HTML')
                while chunk := response.read(1024*1024): output.write(chunk)
            return
        except urllib.error.HTTPError as error:
            # A missing file will not reappear on retry; explain what to do instead.
            if error.code == 404: raise FileNotFoundError(replacement_hint(url)) from None
            if attempt == 2: raise
        except Exception:
            if attempt == 2: raise
        time.sleep(2)

def main():
    manifest_path = ROOT/'data/downloads.json'
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'inputs': []}
    known = {x['path']: x for x in old['inputs']}
    def acquire(item):
        name, url, credit = item
        relative = 'data/'+name
        path = ROOT/relative
        path.parent.mkdir(parents=True, exist_ok=True)
        previous = known.get(relative)
        if path.exists() and previous:
            if digest(path) != previous['sha256']: raise ValueError(f'Checksum mismatch: {relative}; inspect before replacing')
            print('Verified cache:', name, flush=True)
            return previous
        temporary = path.with_suffix(path.suffix+'.partial')
        print('Downloading:', name, flush=True)
        fetch(url, temporary)
        os.replace(temporary, path)
        checksum = digest(path)
        if previous and checksum != previous['sha256']: raise ValueError(f'Upstream file changed: {name}')
        return {'path': relative, 'url': url, 'credit': credit, 'bytes': path.stat().st_size, 'sha256': checksum, 'retrievedUtc': datetime.now(timezone.utc).isoformat()}
    with ThreadPoolExecutor(max_workers=3) as pool:
        entries = list(pool.map(acquire, INPUTS))
    manifest_path.write_text(json.dumps({'schemaVersion': 1, 'inputs': entries}, indent=2)+'\n')
    print('All inputs verified. Manifest: data/downloads.json', flush=True)

if __name__ == '__main__': main()
