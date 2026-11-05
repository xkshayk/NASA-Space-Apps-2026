"""Capture independent NASA/JPL Horizons vectors; compare the local DE440 engine.
Network access is explicit here, never part of a user simulation request.
"""
import json
import urllib.request
import urllib.parse
from datetime import timedelta
from pathlib import Path
import numpy as np
from engine import Engine, utc, stamp

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'data/reference-horizons.json'
DATES=['2024-02-22T23:24:00Z','2025-03-02T08:34:00Z','2026-10-03T12:00:00Z']

def main():
    engine=Engine(); cases=[]
    for date in DATES:
        for target in ['301','10']:
            p={'format':'json','COMMAND':target,'CENTER':'500@399','MAKE_EPHEM':'YES','EPHEM_TYPE':'VECTORS','START_TIME':date.replace('T',' ').replace('Z',''),'STOP_TIME':stamp(utc(date)+timedelta(minutes=1)).replace('T',' ').replace('Z',''),'STEP_SIZE':'1 m','OUT_UNITS':'KM-S','REF_PLANE':'FRAME','REF_SYSTEM':'ICRF','VEC_CORR':'NONE','VEC_TABLE':'2','CSV_FORMAT':'YES','TIME_TYPE':'UT'}
            url='https://ssd.jpl.nasa.gov/api/horizons.api?'+urllib.parse.urlencode({k:v if k=='format' else "'"+v+"'" for k,v in p.items()})
            response=json.load(urllib.request.urlopen(url,timeout=45))
            raw=response.get('result','')
            if '$$SOE' not in raw: raise ValueError(response)
            row=raw.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()[0].split(',')
            vector=np.array([float(x) for x in row[2:5]])
            g=engine.geometry(date);earth=np.array(g['earth']['positionKm'])
            local=-earth if target=='301' else np.array(g['sun']['positionKm'])-earth
            residual=float(np.linalg.norm(local-vector))
            # Horizons currently uses DE441, distinct from local DE440. Require <1 km, disclose actual residual.
            assert residual < 1, (date,target,residual)
            cases.append({'utc':date,'target':target,'center':'399','frame':'ICRF / J2000 axes','corrections':'NONE','units':'km','referenceEphemeris':'DE441 (Horizons response)','localEphemeris':'DE440','query':url,'referencePositionKm':vector.tolist(),'localPositionKm':local.tolist(),'residualKm':residual})
            print(date,target,'position residual',residual,'km',flush=True)
    OUTPUT.write_text(json.dumps({'source':'NASA/JPL Horizons API','note':'Independent service check, but related JPL ephemeris families. Does not validate terrain or landing safety.','cases':cases},indent=2)+'\n')
    print('Reference cases saved:',OUTPUT)

if __name__=='__main__': main()
