import math
from pathlib import Path
import json
import numpy as np
import pytest
import spiceypy as sp
from engine import Engine, FRAME, utc, angles, disc_visible
from terrain import Terrain, RADIUS, basis, horizon_at

@pytest.fixture(scope='module')
def engine(): return Engine()

def test_basis_and_cardinal_angles():
    for lat,lon in [(0,0),(-89,120),(42,-105)]:
        b=basis(lat,lon);assert np.allclose(np.array(b)@np.array(b).T,np.eye(3),atol=1e-12)
        assert angles(b[0],b)['azimuthDeg']==pytest.approx(90)
        assert angles(b[1],b)['altitudeDeg']==pytest.approx(0,abs=1e-12)
        assert angles(b[2],b)['altitudeDeg']==pytest.approx(90)

def test_time_bounds_and_unknown_inputs(engine):
    for value in ['2026-01-01T00:00:00','2030-01-01T00:00:00Z','2025-02-30T00:00:00Z']:
        with pytest.raises(ValueError): utc(value)
    with pytest.raises(ValueError): engine.selected('fake')
    with pytest.raises(ValueError): engine.options({'margin':'nan'})
    with pytest.raises(ValueError): engine.candidates({'utc':'2026-10-03T12:00:00Z','latitude':95})
    with pytest.raises(ValueError): engine.candidates({'utc':'2026-10-03T12:00:00Z','requireRadio':'maybe'})

def test_rotations_and_ephemeris_distance(engine):
    for date in ['2024-01-01T00:00:00Z','2025-06-01T12:00:00Z','2026-12-01T00:00:00Z']:
        g=engine.geometry(date)
        assert 350000<g['earthDistanceKm']<410000
        for body in ['moon','earth']:
            r=np.array(g[body]['fixedToJ2000']);assert np.allclose(r.T@r,np.eye(3),atol=1e-12);assert np.linalg.det(r)==pytest.approx(1)

def test_surface_observer_matches_spice_constant_observer(engine):
    for date in ['2024-02-22T23:24:00Z','2025-03-02T08:34:00Z','2026-10-03T12:00:00Z']:
        g=engine.geometry(date)
        for site in engine.catalog['sites'][:2]:
            r=engine.site(site,g)
            for target,name in [('SUN','sun'),('EARTH','earth')]:
                state,_=sp.spkcpo(target,g['et'],FRAME,'OBSERVER','NONE',r['fixedPositionKm'],'MOON',FRAME)
                reference=angles(state[:3],basis(site['latitude'],site['longitude']))
                assert reference['altitudeDeg']==pytest.approx(r[name]['altitudeDeg'],abs=1e-9)
                assert reference['azimuthDeg']==pytest.approx(r[name]['azimuthDeg'],abs=1e-9)

def test_station_locations_and_visibility(engine):
    g=engine.geometry('2026-10-03T12:00:00Z');expected={'DSS-14':(35.43,-116.89),'DSS-43':(-35.40,148.98),'DSS-63':(40.43,-4.25),'DSS-24':(35.34,-116.87),'DSS-34':(-35.40,148.98),'DSS-54':(40.43,-4.25)}
    for station in g['stations']:
        lat,lon=expected[station['id']];assert abs(station['latitude']-lat)<.1;assert abs(station['longitude']-lon)<.1
    s=engine.site(engine.sites['blue-ghost'],g)
    for station in s['stations']:
        if station['visible']:assert station['groundAltitudeDeg']>10 and station['lunarAltitudeDeg']>s['model']['earthMarginDeg']-5

def test_terrain_known_height_and_slope(engine):
    p=engine.terrain.profile(-80.13,1.44)
    # Independent NASA article gives 2.579 km and 12 degrees at the IM-1 site.
    # Coarse grid/source-coordinate rounding means this is a sanity check, not validation of small hazards.
    assert abs(p['elevationKm']-2.579)<.15
    assert abs(p['slopeDeg']-12)<5
    assert p['resolutionM']==20 and len(p['altitudeDeg'])==180
    assert horizon_at(p,0)==pytest.approx(horizon_at(p,360))

def test_eclipse_limiting_cases():
    assert disc_visible(np.array([149e6,0,0]),np.array([-384000,0,0]))==1
    assert disc_visible(np.array([149e6,0,0]),np.array([384000,0,0]))==0

def test_horizon_matches_analytic_smooth_sphere():
    class SmoothSphere(Terrain):
        def __init__(self):
            self.south=True
            self.regional=type('NoRegional',(),{'sample':lambda *args:np.nan})()
        def elevations(self,lat,lon,detailed=True): return np.zeros(np.broadcast_arrays(lat,lon)[0].shape)
    p=SmoothSphere().profile(-80,20)
    depression=-math.degrees(math.acos(RADIUS/(RADIUS+.002)))
    assert np.max(np.abs(np.array(p['altitudeDeg'])-depression))<.002
    assert p['slopeDeg']==0

def test_solar_scaling_and_darkness(engine):
    g=engine.geometry('2026-10-03T12:00:00Z');s=engine.sites['blue-ghost'];a=engine.site(s,g,area=1);b=engine.site(s,g,area=2)
    assert b['powerW']==pytest.approx(2*a['powerW'])
    for site in engine.catalog['sites']:
        r=engine.site(site,g)
        assert 0<=r['solarDiskUnocculted']<=1
        if r['solarDiskVisibleFraction']==0:assert r['powerW']==0

def test_timeline_weighted_bounds(engine):
    r=engine.timeline({'utc':'2026-10-03T12:00:00Z','days':.25,'sites':'im1','stepMinutes':60})
    assert len(r['timesUtc'])==7
    assert 0<=r['summary']['im1']['sunVisible']<=1
    assert r['summary']['im1']['energyWh']>=0

def test_candidate_screen_never_certifies_unknown_hazards(engine):
    r=engine.candidates({'utc':'2026-10-03T12:00:00Z','maxSlope':30,'requireRadio':'false'})
    assert r['tested']==25 and r['qualified']==0
    assert all(not c['qualifiedForLanding'] and c['constraints']['bouldersAndCraters']=='unknown' for c in r['candidates'])

def test_captured_horizons_reference(engine):
    path=Path(__file__).resolve().parents[1]/'data/reference-horizons.json'
    assert path.exists(),'Run science/reference_check.py to capture official reference cases'
    for c in json.loads(path.read_text())['cases']:
        g=engine.geometry(c['utc']);earth=np.array(g['earth']['positionKm']);value=-earth if c['target']=='301' else np.array(g['sun']['positionKm'])-earth
        assert np.linalg.norm(value-c['referencePositionKm'])<1
