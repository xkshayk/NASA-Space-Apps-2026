"""Analytic/synthetic test fixtures only; production uses downloaded NASA inputs."""
import numpy as np
import pytest
from solar import solar_disk, disk_segment, earth_on_solar_plane
from events import refine_windows
from regional import polar_xy, RegionalData
from terrain import basis

@pytest.mark.parametrize('altitude',[-1,-.2,-.1,0,.1,.2,1])
def test_partial_disk_against_analytic_edge(altitude):
    result=solar_disk(altitude,0,.266,lambda az:np.zeros_like(az))
    assert result['visibleFraction']==pytest.approx(disk_segment(altitude,.266),abs=.0005)
    assert 0<=result['horizontalFraction']<=result['visibleFraction']

def test_combined_masks_do_not_double_count():
    clear=lambda az:np.zeros_like(az)
    half=solar_disk(0,0,.266,clear)
    covered=solar_disk(0,0,.266,clear,(0,0,1))
    overlapping=solar_disk(0,0,.266,clear,(0,-.266,.266))
    assert half['visibleFraction']==pytest.approx(.5)
    assert covered['visibleFraction']==covered['horizontalFraction']==0
    assert overlapping['visibleFraction']==pytest.approx(.5,abs=.001)
    midday=solar_disk(45,0,.266,clear)
    assert midday['horizontalFraction']==pytest.approx(np.sin(np.pi/4),abs=.00001)

def test_occultor_vertical_orientation():
    b=basis(0,0);sun=b[1]*149e6
    earth=(b[1]*np.cos(.001)+b[2]*np.sin(.001))*384000
    x,y,r=earth_on_solar_plane(sun,earth,b)
    assert abs(x)<1e-10 and y>0 and r>.9

def test_event_brackets_windows_and_energy():
    # A pulse between hourly display samples, found by the 5-minute search.
    def evaluate(t):return {'sun':810<=t<1290,'powerW':100}
    result=refine_windows(evaluate,3600,['sun'],300,10)
    assert len(result['events'])==2
    for event,truth in zip(result['events'],[810,1290]):
        assert event['bracketStartSeconds']<=truth<=event['bracketEndSeconds']
        assert event['bracketEndSeconds']-event['bracketStartSeconds']<=10
    assert result['fractions']['sun']==pytest.approx(480/3600,abs=10/3600)
    assert result['energyWh']==100
    assert not result['windows']['sun'][0]['startClipped']

def test_event_boundary_clipping_and_declared_missed_pulse():
    result=refine_windows(lambda t:{'on':True,'off':False,'brief':10<t<20,'powerW':0},3600,['on','off','brief'])
    assert result['fractions']=={'on':1,'off':0,'brief':0}
    assert result['windows']['on'][0]['endClipped']
    assert result['searchStepSeconds']==300

def test_regional_projection_and_missing_coverage():
    assert polar_xy(-90,0)==pytest.approx((0,0))
    r=RegionalData()
    assert np.isfinite(r.sample('elevation',-80.13,1.44))
    assert np.isnan(r.sample('elevation',0,0))
    inside=r.evidence(-84.7906,29.1957)
    assert inside['slope']['coverageFraction']==1
    assert inside['samples']==49
    assert r.evidence(0,0)['slope']['maximum'] is None
