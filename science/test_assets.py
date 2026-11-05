"""Display-asset invariants, checked on synthetic height fields with known answers."""
import math
import numpy as np
import pytest
from prepare_assets import block_mean, upsample_cells, tangent_normals, polar_normals

def test_mesh_cells_and_residual_preserve_relief_without_double_counting():
    rows, cols = np.mgrid[0:64, 0:128]
    smooth = (np.sin(cols/128*2*np.pi) + .3*np.cos(rows/64*np.pi)).astype(float)
    cells = block_mean(smooth, 8)
    assert cells.shape == (8, 16)
    assert cells.mean() == pytest.approx(smooth.mean())
    residual = smooth - upsample_cells(cells, smooth.shape, 8)
    # Low-frequency relief lives in the mesh; the normal map only carries what remains.
    assert np.abs(residual).max() < .1 * np.abs(smooth).max()
    constant = np.full((32, 64), 2.5)
    assert np.allclose(upsample_cells(block_mean(constant, 8), constant.shape, 8), 2.5)

def test_equirectangular_normals_tilt_away_from_rising_ground():
    pixel_deg = 1/16
    rows, cols = 2880, 5760
    east_slope = .1  # km per km at the equator
    spacing = math.radians(pixel_deg)*1737.4
    heights = np.tile(east_slope*spacing*np.arange(cols), (rows, 1))
    normal = tangent_normals(heights, pixel_deg)
    equator = normal[rows//2, 100:-100]
    assert np.allclose(equator[:, 0], -east_slope/math.sqrt(1 + east_slope**2), atol=1e-3)
    assert np.allclose(equator[:, 1], 0, atol=1e-6)

@pytest.mark.parametrize('lon_deg,expect_east,expect_north', [(0, -1, 0), (90, 0, -1), (180, 1, 0), (-90, 0, 1)])
def test_polar_normals_rotate_with_longitude(lon_deg, expect_east, expect_north):
    # A plane rising toward +x (the 90° E meridian) on a south-polar-stereographic grid.
    size, cell, slope = 64, 240.0, .2
    centers = (np.arange(size) + .5 - size/2)*cell
    heights = np.tile(slope*centers, (size, 1))
    normal = polar_normals(heights, cell)
    # Sample a pixel 20 cells from the pole in the requested direction (x = rho sin lon, y = rho cos lon).
    lon = math.radians(lon_deg)
    col = int(size/2 + 20*math.sin(lon) - .5 + .5)
    row = int(size/2 - 20*math.cos(lon) - .5 + .5)
    e, n, u = normal[row, col]
    tilt = slope/math.sqrt(1 + slope**2)
    assert e == pytest.approx(expect_east*tilt, abs=.02)
    assert n == pytest.approx(expect_north*tilt, abs=.02)
    assert u == pytest.approx(1/math.sqrt(1 + slope**2), abs=1e-6)
