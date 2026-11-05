"""NASA SPICE state and educational lunar site analysis. All units explicit."""
from datetime import datetime, timezone, timedelta
from functools import lru_cache
from pathlib import Path
import json
import math
import threading
import numpy as np
import spiceypy as sp
from terrain import Terrain, basis, horizon_at, RADIUS
from solar import solar_disk, earth_on_solar_plane
from events import refine_windows
from download_data import INPUTS, EARTH_PREDICTED_AFTER

ROOT = Path(__file__).resolve().parents[1]
FRAME = 'MOON_ME_DE440_ME421'
START = '2024-01-01T00:00:00Z'
# Last instant covered by the pinned Earth orientation kernel (verified at startup).
END = '2027-01-31T00:00:00Z'
AU = 149597870.7
# SPICE keeps process-global state, so every toolkit call is serialized. The
# terrain, solar-disk and window calculations are pure NumPy and run outside it,
# which keeps short /api/state requests responsive during long timelines.
LOCK = threading.RLock()
KERNELS = [Path(name).name for name, *_ in INPUTS if name.startswith('kernels/')]

class Cancelled(Exception):
    """The client disconnected; stop a long calculation without a result."""

def number(value, low, high, name):
    try: result = float(value)
    except (ValueError,TypeError): raise ValueError(f'{name} must be numeric')
    if not math.isfinite(result) or not low <= result <= high: raise ValueError(f'{name} must be between {low} and {high}')
    return result

def utc(value):
    if not isinstance(value,str) or not value.endswith('Z'): raise ValueError('Use a UTC ISO timestamp ending in Z')
    try: d = datetime.fromisoformat(value.replace('Z','+00:00'))
    except ValueError: raise ValueError('Invalid UTC timestamp')
    if d < datetime.fromisoformat(START.replace('Z','+00:00')) or d > datetime.fromisoformat(END.replace('Z','+00:00')): raise ValueError(f'Date outside supported range {START} to {END}')
    return d

def stamp(d): return d.isoformat(timespec='seconds').replace('+00:00','Z')

def angles(vector, local_basis):
    east,north,up = local_basis
    e,n,u = (float(vector@v) for v in (east,north,up))
    horizontal = math.hypot(e,n)
    return {'altitudeDeg':math.degrees(math.atan2(u,horizontal)), 'azimuthDeg':math.degrees(math.atan2(e,n))%360 if horizontal > 1e-9 else None, 'distanceKm':float(np.linalg.norm(vector))}

def disc_visible(sun_vec, earth_vec):
    """Fraction of a uniform solar disk unocculted by spherical Earth (no atmosphere)."""
    ds,de = np.linalg.norm(sun_vec),np.linalg.norm(earth_vec)
    a = math.asin(695700/ds); b = math.asin(6378.137/de)
    c = math.acos(float(np.clip(np.dot(sun_vec,earth_vec)/(ds*de),-1,1)))
    if c >= a+b: return 1.
    if c <= abs(b-a): return 0. if b>=a else 1-(b/a)**2
    overlap = a*a*math.acos(np.clip((c*c+a*a-b*b)/(2*c*a),-1,1))+b*b*math.acos(np.clip((c*c+b*b-a*a)/(2*c*b),-1,1))-.5*math.sqrt(max(0,(-c+a+b)*(c+a-b)*(c-a+b)*(c+a+b)))
    return float(np.clip(1-overlap/(math.pi*a*a),0,1))

def offset_point(lat, lon, east_deg, north_deg):
    """Destination after great-circle offsets (degrees of arc) along local east/north."""
    distance=math.radians(math.hypot(east_deg,north_deg))
    if distance==0: return lat,lon
    bearing=math.atan2(east_deg,north_deg); phi=math.radians(lat)
    p=math.asin(max(-1,min(1,math.sin(phi)*math.cos(distance)+math.cos(phi)*math.sin(distance)*math.cos(bearing))))
    l=math.radians(lon)+math.atan2(math.sin(bearing)*math.sin(distance)*math.cos(phi),math.cos(distance)-math.sin(phi)*math.sin(p))
    return max(-89.999,min(89.999,math.degrees(p))),(math.degrees(l)+180)%360-180

class Engine:
    def __init__(self):
        for file in KERNELS: sp.furnsh(str(ROOT/'data/kernels'/file))
        self.terrain = Terrain()
        self.catalog = json.loads((ROOT/'data/catalog.json').read_text(encoding='utf-8'))
        self.sites = {x['id']:x for x in self.catalog['sites']}
        self.profiles = json.loads((ROOT/'data/landing-profiles.json').read_text(encoding='utf-8'))['profiles']
        self.radii_earth = sp.bodvrd('EARTH','RADII',3)[1]
        # Validate both coverage endpoints up front, not during a user's first scrub.
        for date in [START,END]: self.geometry(date)

    @lru_cache(maxsize=1024)
    def geometry(self, date):
        """Cached state for interactive dates; timelines use _geometry to avoid evicting it."""
        return self._geometry(date)

    def _geometry(self, date):
        utc(date)
        with LOCK:
            et = sp.str2et(date)
            moon_rotation = sp.pxform(FRAME,'J2000',et)
            earth_rotation = sp.pxform('ITRF93','J2000',et)
            earth = sp.spkpos('EARTH',et,'J2000','NONE','MOON')[0]
            sun = sp.spkpos('SUN',et,'J2000','NONE','MOON')[0]
            station_positions = [sp.spkpos(str(station['naifId']),et,'ITRF93','NONE','EARTH')[0] for station in self.catalog['stations']]
            station_geodetic = [sp.recgeo(pos,6378.137,(6378.137-6356.752314245)/6378.137) for pos in station_positions]
        stations=[]
        for station,pos,(lon,lat,alt) in zip(self.catalog['stations'],station_positions,station_geodetic):
            normal = np.array([math.cos(lat)*math.cos(lon),math.cos(lat)*math.sin(lon),math.sin(lat)])
            stations.append({**station,'latitude':math.degrees(lat),'longitude':math.degrees(lon),'heightKm':alt,'fixedPositionKm':pos.tolist(),'positionKm':(earth+earth_rotation@pos).tolist(),'normalJ2000':(earth_rotation@normal).tolist()})
        return {'utc':date,'et':et,'moon':{'positionKm':[0,0,0],'radiusKm':RADIUS,'fixedToJ2000':moon_rotation.tolist()},'earth':{'positionKm':earth.tolist(),'radiusKm':6378.137,'polarRadiusKm':6356.752314245,'fixedToJ2000':earth_rotation.tolist()},'sun':{'positionKm':sun.tolist(),'radiusKm':695700},'stations':stations,'earthDistanceKm':float(np.linalg.norm(earth)),'sunDistanceKm':float(np.linalg.norm(sun)),'frame':'J2000','lunarFrame':FRAME,'corrections':'NONE; simultaneous geometric state','earthOrientation': 'Predicted' if date > EARTH_PREDICTED_AFTER else 'Historical Earth orientation'}

    def site(self, source, geometry, horizon='terrain', margin=5, area=1, efficiency=.25, panel='horizontal'):
        lat,lon = source['latitude'],source['longitude']
        local_basis = basis(lat,lon)
        profile = self.terrain.profile(lat,lon)
        radius = profile['radiusKm']
        fixed = radius*local_basis[2]
        rotation = np.array(geometry['moon']['fixedToJ2000'])
        position = rotation@fixed
        sun_vector = rotation.T@(np.array(geometry['sun']['positionKm'])-position)
        earth_vector = rotation.T@(np.array(geometry['earth']['positionKm'])-position)
        sun,earth = angles(sun_vector,local_basis),angles(earth_vector,local_basis)
        for body in [sun,earth]:
            body['horizonDeg'] = horizon_at(profile,body['azimuthDeg'] or 0) if horizon=='terrain' else 0.
            body['clearanceDeg'] = body['altitudeDeg']-body['horizonDeg']
        eclipse = disc_visible(sun_vector,earth_vector)
        solar_constant = 1361*(AU/sun['distanceKm'])**2
        angular_radius=math.degrees(math.asin(695700/sun['distanceKm']))
        horizon_function=lambda az: np.interp(az,profile['azimuthDeg']+[360],profile['altitudeDeg']+[profile['altitudeDeg'][0]]) if horizon=='terrain' else np.zeros_like(az)
        disk=solar_disk(sun['altitudeDeg'],sun['azimuthDeg'] or 0,angular_radius,horizon_function,earth_on_solar_plane(sun_vector,earth_vector,local_basis))
        illuminated = disk['visibleFraction'] > .001
        irradiance = solar_constant*(disk['visibleFraction'] if panel=='tracking' else disk['horizontalFraction'])
        station_results=[]
        for station in geometry['stations']:
            toward_station = np.array(station['positionKm'])-position
            local = angles(rotation.T@toward_station,local_basis)
            station_alt = math.degrees(math.asin(float(np.clip(np.dot(-toward_station/np.linalg.norm(toward_station),station['normalJ2000']),-1,1))))
            obstruction = horizon_at(profile,local['azimuthDeg'] or 0) if horizon=='terrain' else 0.
            station_results.append({'id':station['id'],'name':station['name'],'lunarAltitudeDeg':local['altitudeDeg'],'lunarClearanceDeg':local['altitudeDeg']-obstruction,'groundAltitudeDeg':station_alt,'visible':local['altitudeDeg']-obstruction>margin and station_alt>10,'distanceKm':float(np.linalg.norm(toward_station))})
        return {**source,'positionKm':position.tolist(),'fixedPositionKm':fixed.tolist(),'sun':sun,'earth':earth,'sunVisible':illuminated,'earthVisible':earth['clearanceDeg']>margin,'stations':station_results,'anyStationVisible':any(s['visible'] for s in station_results),'irradianceWm2':irradiance,'powerW':irradiance*area*efficiency,'solarFluxWm2':solar_constant,'solarDiskUnocculted':eclipse,'solarDiskVisibleFraction':disk['visibleFraction'],'solarAngularRadiusDeg':angular_radius,'oneWayLightSeconds':earth['distanceKm']/299792.458,'terrain':profile,'model':{'horizon':horizon,'earthMarginDeg':margin,'stationMaskDeg':10,'panel':panel,'areaM2':area,'efficiency':efficiency,'solarDiskAtTerrain':'96-strip uniform disk integration with combined terrain/Earth masks; no limb darkening','sunVisibleThresholdFraction':.001}}

    def selected(self, ids):
        ids = ids.split(',') if isinstance(ids,str) else ids
        if not 1 <= len(ids) <= 4: raise ValueError('Select one to four known sites')
        if len(set(ids)) != len(ids): raise ValueError('Duplicate site selection')
        try: return [self.sites[i] for i in ids]
        except KeyError: raise ValueError('Unknown site')

    def options(self, params):
        horizon=params.get('horizon','terrain'); panel=params.get('panel','horizontal')
        if horizon not in ['terrain','sphere'] or panel not in ['horizontal','tracking']: raise ValueError('Unknown horizon or panel mode')
        return {'horizon':horizon,'margin':number(params.get('margin',5),0,30,'margin'),'area':number(params.get('area',1),.1,100,'panel area'),'efficiency':number(params.get('efficiency',.25),.01,.6,'efficiency'),'panel':panel}

    def state(self, params):
        geometry = self.geometry(params.get('utc','2026-10-03T12:00:00Z'))
        selected = self.selected(params.get('sites','im1,im2'))
        return {**geometry,'sites':[self.site(s,geometry,**self.options(params)) for s in selected]}

    def timeline(self, params, cancelled=None):
        start=utc(params['utc']); days=number(params.get('days',3),.25,30,'days')
        step=number(params.get('stepMinutes',60),10,360,'sample minutes')
        count=math.ceil(days*1440/step)
        if count>744: raise ValueError('Too many samples; increase cadence or reduce range')
        end=start+timedelta(days=days); utc(stamp(end))
        selected=self.selected(params.get('sites','im1,im2')); options=self.options(params)
        duration=days*86400
        display=[min(i*step*60,duration) for i in range(count+1)]
        # A denser search catches events hidden between display samples. It does
        # not guarantee detection of intervals shorter than searchStepSeconds.
        # Display samples are a subset of the scan, so they reuse its evaluations.
        scan_seconds=min(step*60,300 if days<=3 else 900)
        metrics=['sunVisible','earthVisible','anyStationVisible']+[s['id'] for s in self.catalog['stations']]
        fields=['sunVisible','earthVisible','anyStationVisible','irradianceWm2','powerW','sunAltitudeDeg','sunAzimuthDeg','sunClearanceDeg','earthAltitudeDeg','earthAzimuthDeg']
        def timestamp(seconds): return stamp(start+timedelta(seconds=seconds))
        geometries={}; calls=0
        rows={}; summary={}; events={}; windows={}
        for source in selected:
            memo={}
            def evaluate(seconds):
                nonlocal calls
                if seconds not in memo:
                    calls+=1
                    if cancelled and calls%32==0 and cancelled(): raise Cancelled()
                    date=timestamp(seconds)
                    if date not in geometries: geometries[date]=self._geometry(date)
                    value=self.site(source,geometries[date],**options)
                    memo[seconds]={**{k:value[k] for k in metrics[:3]+['powerW','irradianceWm2']},**{x['id']:x['visible'] for x in value['stations']},'sunAltitudeDeg':value['sun']['altitudeDeg'],'sunAzimuthDeg':value['sun']['azimuthDeg'],'sunClearanceDeg':value['sun']['clearanceDeg'],'earthAltitudeDeg':value['earth']['altitudeDeg'],'earthAzimuthDeg':value['earth']['azimuthDeg']}
                return memo[seconds]
            refined=refine_windows(evaluate,duration,metrics,scan_seconds=scan_seconds,tolerance=10)
            key=source['id']
            rows[key]=[{k:evaluate(t)[k] for k in fields} for t in display]
            summary[key]={**{k:refined['fractions'][k] for k in metrics[:3]},'energyWh':refined['energyWh']}
            events[key]=[{**event,'utc':timestamp(event['seconds']),'bracketStartUtc':timestamp(event['bracketStartSeconds']),'bracketEndUtc':timestamp(event['bracketEndSeconds'])} for event in refined['events']]
            windows[key]={metric:[{**w,'startUtc':timestamp(w['startSeconds']),'endUtc':timestamp(w['endSeconds'])} for w in values] for metric,values in refined['windows'].items()}
        return {'timesUtc':[timestamp(t) for t in display],'series':rows,'summary':summary,'events':events,'windows':windows,'stepMinutes':step,'searchStepSeconds':scan_seconds,'numericalBracketSeconds':10,'physicalTimingUncertainty':'Not quantified; terrain resolution and horizon sampling dominate near shadows','method':'Dense search plus bisection of detected transitions; intervals shorter than search spacing may still be missed. Numerical brackets are not physical accuracy.'}

    def candidates(self, params, cancelled=None):
        lat=number(params.get('latitude',-85),-89.5,89.5,'latitude'); lon=number(params.get('longitude',20),-180,180,'longitude')
        spacing=number(params.get('spacing',.5),.1,2,'grid spacing')
        profile_id=params.get('profile','study')
        profile=next((p for p in self.profiles if p['id']==profile_id),None)
        if profile is None: raise ValueError('Unknown landing profile')
        max_slope=number(params.get('maxSlope',profile['maxSlopeDeg']),.1,30,'maximum slope')
        if profile_id=='apollo-early': max_slope=2
        max_roughness=number(params.get('maxRoughness',1),.01,20,'maximum 100 m roughness')
        major=number(params.get('ellipseMajorM',1000),100,10000,'ellipse major diameter')
        minor=number(params.get('ellipseMinorM',500),100,major,'ellipse minor diameter')
        heading=number(params.get('ellipseHeadingDeg',0),0,360,'ellipse heading')
        lander_diameter=number(params.get('landerDiameterM',5),1,100,'lander diameter')
        min_sun=number(params.get('minSun',0),0,50,'minimum Sun clearance')
        radio_option=params.get('requireRadio','true')
        if radio_option not in ['true','false']: raise ValueError('requireRadio must be true or false')
        require_radio=radio_option=='true'
        g=self.geometry(params['utc']); options=self.options(params)
        rows=[]; rejected=0; rejection_details=[]
        for i in range(-2,3):
            for j in range(-2,3):
                if cancelled and cancelled(): raise Cancelled()
                # Offsets are great-circle degrees along local north (i) and east (j),
                # so the 5x5 neighborhood stays square near the poles.
                p,l=offset_point(lat,lon,j*spacing,i*spacing)
                terrain=self.terrain.profile(p,l)
                evidence=self.terrain.regional.evidence(p,l,major/2,minor/2,heading)
                constraints={'regionalSlope':'pass' if terrain['slopeDeg']<max_slope else 'fail',
                    'missionZone':'pass' if abs(p)<=profile['maxAbsLatitudeDeg'] and abs(l)<=profile['maxAbsLongitudeDeg'] else 'fail',
                    'landerScaleRoughness':'unknown','bouldersAndCraters':'unknown','approachAndPropellant':'unknown','landingEllipse':'unknown','vehicleDesign':'unknown','approachSunDirection':'unknown'}
                for field,criterion,limit in [('slope','sampledEllipseSlope',max_slope),('roughness100m','roughness100m',max_roughness if profile_id=='study' else None)]:
                    item=evidence[field]
                    # A measured exceedance fails even with partial coverage;
                    # a pass requires complete sample coverage and a threshold.
                    constraints[criterion]='unknown' if limit is None else 'fail' if item['maximum'] is not None and item['maximum']>=limit else 'pass' if item['coverageFraction']==1 else 'unknown'
                constraints['spatialResolution']='unknown'
                evidence['landerDiameterM']=lander_diameter
                evidence['resolutionNote']='Pixel spacing and effective resolution do not establish obstacle detectability at the lander scale.'
                failed=[k for k,v in constraints.items() if v=='fail']
                if failed:
                    rejected+=1
                    rejection_details.append({'latitude':p,'longitude':l,'gridOffsetKm':{'north':i*spacing*math.radians(1)*RADIUS,'east':j*spacing*math.radians(1)*RADIUS},'slopeDeg':terrain['slopeDeg'],'failedCriteria':failed,'evidence':evidence})
                    continue
                result=self.site({'id':f'candidate-{i+2}-{j+2}','name':f'{abs(p):.2f}° {"S" if p<0 else "N"}, {abs(l):.2f}° {"W" if l<0 else "E"}','latitude':p,'longitude':l,'gridOffsetKm':{'north':i*spacing*math.radians(1)*RADIUS,'east':j*spacing*math.radians(1)*RADIUS},'status':'Exploratory · not mission-approved','source':'https://pgda.gsfc.nasa.gov/products/90' if p<=-60 else 'https://svs.gsfc.nasa.gov/4720/'},g,**options)
                # Stage 2: date-specific light and actual DSN-station geometric opportunity.
                sun_range=profile['sunAltitudeRangeDeg']
                approach_light=not sun_range or sun_range[0]<=result['sun']['altitudeDeg']<=sun_range[1]
                passes=result['sun']['clearanceDeg']>=min_sun and result['sunVisible'] and approach_light and (not require_radio or result['anyStationVisible'])
                constraints['sunlight']='pass' if result['sun']['clearanceDeg']>=min_sun and result['sunVisible'] else 'fail'
                constraints['radio']='pass' if result['anyStationVisible'] else 'fail' if require_radio else 'not-required'
                constraints['approachSunAltitude']='pass' if sun_range and approach_light else 'fail' if sun_range else 'not-required'
                rows.append({**result,'passesDateScreen':bool(passes),'qualifiedForLanding':False,'constraints':constraints,'evidence':evidence,'profileId':profile_id})
        rows.sort(key=lambda r:(r['passesDateScreen'],r['irradianceWm2']),reverse=True)
        return {'candidates':rows,'terrainRejected':rejected,'rejections':rejection_details,'tested':25,'datePassed':sum(r['passesDateScreen'] for r in rows),'qualified':0,'profile':profile,'explanation':'Profile zone, terrain and sampled ellipse evidence precede date-specific sunlight/DSN screening. Unknown fine hazards and engineering constraints remain unknown. No candidate is certified landable.','criteriaSource':profile['source']}

    def point(self, params):
        lat=number(params['latitude'],-89.999,89.999,'latitude'); lon=number(params['longitude'],-180,180,'longitude')
        return self.site({'id':'picked','name':'Picked lunar location','latitude':lat,'longitude':lon,'status':'Exploratory · not mission-approved','source':'https://pgda.gsfc.nasa.gov/products/90' if lat<=-60 else 'https://svs.gsfc.nasa.gov/4720/'},self.geometry(params['utc']),**self.options(params))

    def metadata(self):
        manifest=json.loads((ROOT/'data/downloads.json').read_text(encoding='utf-8'))
        return {**self.catalog,'landingProfiles':self.profiles,'coverage':{'start':START,'end':END,'earthPredictedAfter':EARTH_PREDICTED_AFTER},'kernels':KERNELS,'inputs':manifest['inputs']+self.terrain.regional.inputs,'modelVersion':'3.1','lunarFrame':FRAME,'terrainAvailable':True,'limits':['20 m local terrain near IM-1/IM-2; 240 m southern regional terrain; ~1.9 km global equatorial source','High-resolution pixels do not imply 20 m effective resolution; uncertainty/effective-resolution layers are reported','Global render mesh remains 0.5°; static mosaics, true relief',f'Geometric simultaneous vectors; Earth orientation after {EARTH_PREDICTED_AFTER[:10]} is predicted','Standard horizon 2°/150 km; sensitivity comparison 1°/200 km, not a certified error bound','Partial uniform Sun disk with terrain and spherical-Earth masks; no atmosphere or limb darkening','Detected events bracketed to 10 s; shorter-than-scan events can be missed and physical timing uncertainty is not quantified','Ideal panel power only; radio geometry excludes link budgets, scheduling and local Earth-station terrain'], 'references':[{'name':'JPL WebGeocalc','url':'https://naif.jpl.nasa.gov/naif/webgeocalc.html'},{'name':'JPL Horizons','url':'https://ssd.jpl.nasa.gov/horizons/'},{'name':'LOLA illumination methods','url':'https://pgda.gsfc.nasa.gov/products/69'},{'name':'LOLA adjusted topography · Barker et al. 2023','url':'https://pgda.gsfc.nasa.gov/products/90'},{'name':'Lunar QuickMap','url':'https://quickmap.im-ldi.com/'}]}

    def horizon_check(self,params):
        if 'site' in params:
            if params['site'] not in self.sites: raise ValueError('Unknown site')
            source=self.sites[params['site']]
            lat,lon=source['latitude'],source['longitude']
        else:
            lat=number(params['latitude'],-89.999,89.999,'latitude');lon=number(params['longitude'],-180,180,'longitude')
        return self.terrain.convergence(lat,lon)
