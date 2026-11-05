"""Service-level invariants: coverage limits, polar grids, timeline reuse, cancellation and API errors."""
import json
import math
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import numpy as np
import pytest
import spiceypy as sp

from download_data import EARTH_KERNEL, INPUTS
from engine import END, KERNELS, Cancelled, offset_point, stamp, utc

ROOT = Path(__file__).resolve().parents[1]

def arc_deg(a, b):
    (p1, l1), (p2, l2) = np.radians(a), np.radians(b)
    return math.degrees(math.acos(min(1, math.sin(p1)*math.sin(p2) + math.cos(p1)*math.cos(p2)*math.cos(l1-l2))))

@pytest.fixture(scope='module')
def service():
    import server  # Loads the real engine once for the HTTP checks below.
    httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield server.engine, f'http://127.0.0.1:{httpd.server_address[1]}'
    httpd.shutdown()

def get(base, path):
    try:
        with urllib.request.urlopen(base+path, timeout=60) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        assert error.headers['Content-Type'].startswith('application/json')
        return error.code, json.loads(error.read())

def test_kernel_list_and_coverage_end_follow_the_pinned_earth_kernel():
    assert KERNELS == [Path(name).name for name, *_ in INPUTS if name.startswith('kernels/')]
    assert EARTH_KERNEL in KERNELS
    cover = sp.cell_double(100)
    sp.pckcov(str(ROOT/'data/kernels'/EARTH_KERNEL), 3000, cover)
    last = sp.wnfetd(cover, sp.wncard(cover)-1)[1]
    sp.furnsh(str(ROOT/'data/kernels/naif0012.tls'))
    assert sp.str2et(END) <= last + 1e-6, 'Supported range must not extend past Earth orientation data'
    utc(END)
    with pytest.raises(ValueError):
        from datetime import timedelta
        utc(stamp(utc(END)+timedelta(seconds=1)))

@pytest.mark.parametrize('lat,lon', [(-85, 20), (-89.5, 0), (0, 179.9), (45, -60)])
def test_candidate_grid_offsets_are_square_at_any_latitude(lat, lon):
    center = (lat, lon)
    for east, north in [(.5, 0), (0, .5), (-.5, 0), (0, -.5)]:
        assert arc_deg(center, offset_point(lat, lon, east, north)) == pytest.approx(.5, abs=1e-6)
    # Diagonal neighbours sit sqrt(2) spacings away, so cells are not squashed toward the pole.
    assert arc_deg(center, offset_point(lat, lon, .5, .5)) == pytest.approx(.5*math.sqrt(2), abs=1e-6)
    p, l = offset_point(lat, lon, 1, 1)
    assert -90 < p < 90 and -180 <= l < 180

def test_timeline_series_reuses_scan_samples_without_changing_values(service):
    engine, _ = service
    params = {'utc': '2026-11-14T12:00:00Z', 'days': .25, 'stepMinutes': 60, 'sites': 'im1,blue-ghost'}
    result = engine.timeline(params)
    assert len(result['timesUtc']) == 7
    for site_id in ['im1', 'blue-ghost']:
        for date, row in zip(result['timesUtc'], result['series'][site_id]):
            direct = engine.site(engine.sites[site_id], engine.geometry(date))
            assert row['sunAltitudeDeg'] == pytest.approx(direct['sun']['altitudeDeg'], abs=1e-12)
            assert row['powerW'] == pytest.approx(direct['powerW'], abs=1e-12)
            assert row['anyStationVisible'] == direct['anyStationVisible']

def test_long_calculations_stop_when_the_client_leaves(service):
    engine, _ = service
    with pytest.raises(Cancelled):
        engine.timeline({'utc': '2026-11-14T12:00:00Z', 'days': 30, 'stepMinutes': 60, 'sites': 'im1'}, lambda: True)
    with pytest.raises(Cancelled):
        engine.candidates({'utc': '2026-11-14T12:00:00Z'}, lambda: True)

def test_api_failures_are_explicit_json(service):
    _, base = service
    assert get(base, '/api/health')[0] == 200
    status, body = get(base, '/api/nope')
    assert status == 404 and 'Unknown endpoint' in body['error']
    status, body = get(base, '/api/point?utc=2026-11-14T12:00:00Z')
    assert status == 400 and body['error'] == 'Missing parameter: latitude'
    status, body = get(base, '/api/state?utc=2027-02-01T00:00:00Z&sites=im1')
    assert status == 400 and 'outside supported range' in body['error']
    status, body = get(base, '/api/state?utc=2026-11-14T12:00:00Z&sites=im1,im2,blue-ghost,apollo11,apollo12')
    assert status == 400 and 'one to four' in body['error']
