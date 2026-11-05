"""Uniform solar disk integration in the local angular tangent plane.

Terrain and Earth occultation are combined as masks, avoiding double-counting
their overlap. This is geometric, with no limb darkening/refraction/atmosphere.
"""
import math
import numpy as np

NODES, WEIGHTS = np.polynomial.legendre.leggauss(96)

def disk_segment(clearance_deg, radius_deg):
    """Analytic uniform disk fraction above a straight horizontal edge."""
    q = float(np.clip(clearance_deg / radius_deg, -1, 1))
    return (math.acos(-q) + q * math.sqrt(max(0, 1-q*q))) / math.pi

def solar_disk(altitude, azimuth, radius_deg, horizon, earth_circle=None):
    """Return visible fraction and horizontal-panel projected fraction.

    horizon receives azimuth degrees; Earth circle is (x,y,r) in angular degrees
    about Sun center. 96 Gauss-Legendre strips integrate the visible disk.
    """
    r = radius_deg
    x = NODES * r
    half = np.sqrt(np.maximum(0, r*r-x*x))
    cos_alt = max(.01, abs(math.cos(math.radians(altitude))))
    obstacles = np.asarray(horizon((azimuth+x/cos_alt) % 360)) - altitude
    lower = np.maximum(-half, obstacles)
    upper = half
    length = np.maximum(0, upper-lower)
    # Analytic vertical integration of sin(elevation) above a level panel.
    panel_lo = np.maximum(lower, -altitude)
    panel_hi = np.maximum(upper, panel_lo)
    to_rad = math.pi / 180
    projected = (np.cos((altitude+panel_lo)*to_rad)-np.cos((altitude+panel_hi)*to_rad))/to_rad
    if earth_circle is not None:
        ex, ey, er = earth_circle
        inside = er*er-(x-ex)**2
        eh = np.sqrt(np.maximum(0, inside))
        cut_lo = np.maximum(lower, ey-eh)
        cut_hi = np.minimum(upper, ey+eh)
        cut_length = np.where(inside > 0, np.maximum(0, cut_hi-cut_lo), 0)
        length -= cut_length
        pl = np.maximum(cut_lo, -altitude)
        ph = np.maximum(cut_hi, pl)
        projected -= np.where(inside > 0, (np.cos((altitude+pl)*to_rad)-np.cos((altitude+ph)*to_rad))/to_rad, 0)
    # Normalize using the same quadrature so an unobstructed disk is exactly 1.
    normalization = float(WEIGHTS @ (2*half))
    return {"visibleFraction": float(np.clip(WEIGHTS @ length / normalization, 0, 1)),
            "horizontalFraction": float(np.clip(WEIGHTS @ projected / normalization, 0, 1)),
            "angularRadiusDeg": r}

def earth_on_solar_plane(sun_vector, earth_vector, local_basis):
    s = sun_vector / np.linalg.norm(sun_vector)
    e = earth_vector / np.linalg.norm(earth_vector)
    separation = math.acos(float(np.clip(s@e,-1,1)))
    er = math.asin(6378.137 / np.linalg.norm(earth_vector))
    sr = math.asin(695700 / np.linalg.norm(sun_vector))
    if separation > er+sr: return None
    east, north, up = local_basis
    az = math.atan2(s@east,s@north)
    horizontal = math.cos(az)*east-math.sin(az)*north
    vertical = np.cross(horizontal, s)
    tangent = e - (e@s)*s
    norm = np.linalg.norm(tangent)
    if norm < 1e-12: return (0.,0.,math.degrees(er))
    offset = tangent / norm * math.degrees(separation)
    return (float(offset@horizontal), float(offset@vertical), math.degrees(er))
