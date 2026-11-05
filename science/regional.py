"""Local high-resolution NASA rasters; missing hazard coverage stays unknown."""
import json
from pathlib import Path
import numpy as np
import rasterio

ROOT=Path(__file__).resolve().parents[1]
RADIUS_M=1737400

def polar_xy(lat,lon):
    lat,lon=np.broadcast_arrays(np.asarray(lat,dtype=float),np.asarray(lon,dtype=float))
    rho=2*RADIUS_M*np.tan(np.radians(90+lat)/2)
    return rho*np.sin(np.radians(lon)),rho*np.cos(np.radians(lon))

class RegionalData:
    def __init__(self):
        manifest=ROOT/'data/regions.json'
        if not manifest.exists(): raise FileNotFoundError('Run science/import_regions.py to install the regional terrain inputs')
        self.inputs=json.loads(manifest.read_text(encoding='utf-8'))['inputs']
        if len(self.inputs)!=10: raise ValueError('Regional import is incomplete; resume science/import_regions.py')
        self.rasters=[]
        for entry in self.inputs:
            with rasterio.open(ROOT/entry['path']) as d:
                crs=d.crs.to_dict()
                if crs.get('proj')!='stere' or crs.get('lat_0')!=-90 or crs.get('R')!=RADIUS_M:
                    raise ValueError('Unsupported regional coordinate system')
                data=d.read(1).astype(np.float32)*d.scales[0]+d.offsets[0]
                if d.nodata is not None and np.isfinite(d.nodata): data[data==d.nodata]=np.nan
                self.rasters.append({**entry,'data':data,'affine':d.transform})

    def sample(self,kind,lat,lon):
        x,y=polar_xy(lat,lon)
        output=np.full(x.shape,np.nan)
        for r in self.rasters:
            if r['kind']!=kind: continue
            t,a=r['affine'],r['data']
            col=np.floor((x-t.c)/t.a).astype(int);row=np.floor((y-t.f)/t.e).astype(int)
            valid=(np.asarray(lat)<=-80)&(row>=0)&(col>=0)&(row<a.shape[0])&(col<a.shape[1])
            values=a[np.clip(row,0,a.shape[0]-1),np.clip(col,0,a.shape[1]-1)]
            output=np.where(valid&np.isfinite(values),values,output)
        return output

    def evidence(self,lat,lon,radius_m=500,minor_m=None,heading_deg=0):
        # Sparse 9x9 footprint samples. Not a complete hazard census.
        grid=np.linspace(-1,1,9)
        u,v=np.meshgrid(grid,grid)
        within=u*u+v*v<=1
        major=v[within]*radius_m;minor=u[within]*(minor_m or radius_m)
        angle=np.radians(heading_deg)
        east=major*np.sin(angle)+minor*np.cos(angle);north=major*np.cos(angle)-minor*np.sin(angle)
        distance=np.hypot(east,north)/RADIUS_M
        bearing=np.arctan2(east,north);phi=np.radians(lat)
        p=np.arcsin(np.sin(phi)*np.cos(distance)+np.cos(phi)*np.sin(distance)*np.cos(bearing))
        l=lon+np.degrees(np.arctan2(np.sin(bearing)*np.sin(distance)*np.cos(phi),np.cos(distance)-np.sin(phi)*np.sin(p)))
        p=np.degrees(p)
        output={'ellipseMajorM':2*radius_m,'ellipseMinorM':2*(minor_m or radius_m),'headingDeg':heading_deg,'samples':int(within.sum()),'method':'49-point elliptical footprint screen; not exhaustive','source':'https://pgda.gsfc.nasa.gov/products/90'}
        for kind in ['slope','roughness100m','elevationError','effectiveResolution']:
            values=self.sample(kind,p,l)
            valid=np.isfinite(values)&(values>=0)
            output[kind]={'coverageFraction':float(valid.mean()),'maximum':float(values[valid].max()) if valid.any() else None,
                          'median':float(np.median(values[valid])) if valid.any() else None,
                          'pixelM':50 if kind=='roughness100m' else 20}
        return output
