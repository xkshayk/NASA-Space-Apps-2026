"""Finite-resolution LOLA sampling and local horizon masks, with explicit limits."""
from pathlib import Path
from functools import lru_cache
import math
import numpy as np
import rasterio
from regional import RegionalData

ROOT = Path(__file__).resolve().parents[1]
RADIUS = 1737.4  # km; LOLA reference sphere

def basis(lat, lon):
    p, l = np.radians([lat, lon])
    up = np.array([np.cos(p)*np.cos(l), np.cos(p)*np.sin(l), np.sin(p)])
    east = np.array([-np.sin(l), np.cos(l), 0.])
    north = np.cross(up, east)
    return east, north, up

class Terrain:
    def __init__(self):
        self.regional = RegionalData()
        with rasterio.open(ROOT/'data/raw/moon-dem.tif') as d:
            self.global_dem = d.read(1).astype(np.float32)
        self.south = None
        path = ROOT/'data/raw/south-dem.tif'
        if path.exists():
            with rasterio.open(path) as d:
                crs = d.crs.to_dict()
                if crs.get('proj') != 'stere' or crs.get('lat_0') != -90 or crs.get('lat_ts') != -90 or crs.get('lon_0') != 0 or crs.get('R') != RADIUS*1000 or crs.get('units') != 'm' or crs.get('x_0',0) != 0 or crs.get('y_0',0) != 0 or abs(d.transform.a-240)>1e-8 or abs(d.transform.e+240)>1e-8 or d.transform.b != 0 or d.transform.d != 0:
                    raise ValueError('Unsupported polar DEM projection or resolution')
                self.south = d.read(1).astype(np.float32)*d.scales[0]+d.offsets[0]
                self.transform = d.transform
                self.south_crs = d.crs
                self.nodata = d.nodata
                self.south_metadata = {'shape': d.shape, 'crs': str(d.crs), 'units': d.units, 'scales': d.scales, 'offsets': d.offsets}
        if self.south is None:
            raise FileNotFoundError('Required south-polar DEM is missing; run setup. No coarse silent fallback is permitted.')

    def elevations(self, lat, lon, detailed=True):
        lat, lon = np.broadcast_arrays(np.asarray(lat, dtype=float), np.asarray(lon, dtype=float))
        h, w = self.global_dem.shape
        yi = np.clip((90-lat)/180*h-.5, 0, h-1)
        xi = ((lon+180)%360)/360*w-.5
        # Bilinear global sampling; longitude wraps at the seam.
        x0 = np.floor(xi).astype(int); y0 = np.floor(yi).astype(int)
        dx = xi-x0; dy = yi-y0
        result = ((1-dy)*((1-dx)*self.global_dem[y0,x0%w]+dx*self.global_dem[y0,(x0+1)%w]) + dy*((1-dx)*self.global_dem[np.minimum(y0+1,h-1),x0%w]+dx*self.global_dem[np.minimum(y0+1,h-1),(x0+1)%w]))
        if self.south is not None:
            # Polar stereographic, south pole origin, lon_0=0, true scale at pole.
            rho = 2*RADIUS*1000*np.tan(np.radians(90+lat)/2)
            x = rho*np.sin(np.radians(lon)); y = rho*np.cos(np.radians(lon))
            col = np.rint((x-self.transform.c)/self.transform.a-.5).astype(int)
            row = np.rint((y-self.transform.f)/self.transform.e-.5).astype(int)
            inside = (lat <= -60) & (row>=0) & (row<self.south.shape[0]) & (col>=0) & (col<self.south.shape[1])
            values = self.south[np.clip(row,0,self.south.shape[0]-1),np.clip(col,0,self.south.shape[1]-1)]
            valid = inside & np.isfinite(values) & (np.abs(values)<20000)
            if np.any((lat <= -60) & ~valid):
                raise ValueError('Required southern terrain samples are missing; no coarse fallback was substituted')
            result = np.where(valid, values/1000, result)
        if detailed:
            local=self.regional.sample('elevation',lat,lon)/1000
            result=np.where(np.isfinite(local),local,result)
        return result

    def resolution(self, lat):
        return 240 if lat <= -60 and self.south is not None else 1895

    @lru_cache(maxsize=512)
    def profile(self, lat, lon, observer_m=2.0, quality='standard', detailed=True):
        east,north,up = basis(lat,lon)
        ground = float(self.elevations(lat,lon,detailed))
        radius = RADIUS+ground+observer_m/1000
        # Rays use spherical curvature and the same planet-fixed coordinates as SPICE.
        local_available=detailed and bool(np.isfinite(self.regional.sample('elevation',lat,lon)))
        step = .02 if local_available else self.resolution(lat)/1000
        extent=200 if quality=='refined' else 150
        spacing=1 if quality=='refined' else 2
        distances = np.unique(np.concatenate([np.arange(step, 2, step),np.arange(2,15,max(step,.1)),np.linspace(15,extent,360 if quality=='refined' else 180)]))
        az = np.radians(np.arange(0,360,spacing))
        directions = np.cos(az)[:,None]*north + np.sin(az)[:,None]*east
        angle = distances/RADIUS
        points = np.cos(angle)[None,:,None]*up + np.sin(angle)[None,:,None]*directions[:,None,:]
        lats = np.degrees(np.arcsin(points[:,:,2])); lons = np.degrees(np.arctan2(points[:,:,1],points[:,:,0]))
        heights = self.elevations(lats,lons,detailed)
        positions = points*(RADIUS+heights)[:,:,None]
        delta = positions-radius*up
        u = delta@up; e = delta@east; n = delta@north
        angles = np.degrees(np.arctan2(u,np.hypot(e,n)))
        horizon = np.max(angles,axis=1)
        # Central-difference regional slope, not a lander-footprint hazard map.
        dlat = math.degrees(step/RADIUS)
        dlon = dlat/max(.001, math.cos(math.radians(lat)))
        ns = float(self.elevations(min(89.999,lat+dlat),lon,detailed)-self.elevations(max(-89.999,lat-dlat),lon,detailed))/(2*step)
        ew = float(self.elevations(lat,lon+dlon,detailed)-self.elevations(lat,lon-dlon,detailed))/(2*step)
        slope = math.degrees(math.atan(math.hypot(ns,ew)))
        return {'elevationKm': ground, 'radiusKm': radius, 'slopeDeg': slope, 'azimuthDeg': list(range(0,360,spacing)), 'altitudeDeg': horizon.tolist(), 'resolutionM': 20 if local_available else self.resolution(lat), 'regionalResolutionM':self.resolution(lat), 'searchRadiusKm': extent, 'azimuthStepDeg':spacing, 'observerHeightM': observer_m, 'highResolutionAvailable':local_available, 'model': 'LOLA mixed-resolution horizon; 20 m local tiles where available, regional terrain beyond coverage; unresolved fine hazards'}

    def convergence(self,lat,lon):
        standard=self.profile(lat,lon)
        refined=self.profile(lat,lon,quality='refined')
        coarse=self.profile(lat,lon,detailed=False)
        az=np.arange(360)
        a=np.array([horizon_at(standard,x) for x in az]);b=np.array([horizon_at(refined,x) for x in az]);c=np.array([horizon_at(coarse,x) for x in az])
        return {'standard':standard,'refined':refined,'regionalOnly':coarse,
                'angularAndRangeDifferenceDeg':float(np.max(np.abs(a-b))),
                'terrainResolutionDifferenceDeg':float(np.max(np.abs(a-c))),
                'rmsDifferenceDeg':float(np.sqrt(np.mean((a-b)**2))),
                'interpretation':'Sensitivity to sampling and source resolution, not a certified error bound. The DEMs share LOLA measurements.'}

def horizon_at(profile, azimuth):
    return float(np.interp(azimuth, profile['azimuthDeg']+[360], profile['altitudeDeg']+[profile['altitudeDeg'][0]]))
