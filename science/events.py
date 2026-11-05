"""Bounded temporal scanning and bisection of detected Boolean transitions.

The returned bracket is numerical precision, not terrain/ephemeris uncertainty.
Events shorter than the reported search spacing can still be missed.
"""
import math

def refine_windows(evaluate, duration, metrics, scan_seconds=300, tolerance=10):
    cache = {}
    def at(t):
        if t not in cache: cache[t] = evaluate(t)
        return cache[t]
    count = math.ceil(duration/scan_seconds)
    times = [min(i*scan_seconds,duration) for i in range(count+1)]
    for t in times: at(t)
    windows, events = {}, []
    for metric in metrics:
        opened = 0. if bool(at(0)[metric]) else None
        current_windows = []
        for left,right in zip(times,times[1:]):
            before,after = bool(at(left)[metric]),bool(at(right)[metric])
            if before == after: continue
            lo,hi = left,right
            while hi-lo > tolerance:
                mid=(lo+hi)/2
                if bool(at(mid)[metric]) == before: lo=mid
                else: hi=mid
            transition=(lo+hi)/2
            events.append({"metric":metric,"seconds":transition,"starts":after,
                           "bracketStartSeconds":lo,"bracketEndSeconds":hi})
            if after: opened=transition
            elif opened is not None:
                current_windows.append({"startSeconds":opened,"endSeconds":transition,"startClipped":opened==0,"endClipped":False})
                opened=None
        if opened is not None:
            current_windows.append({"startSeconds":opened,"endSeconds":duration,"startClipped":opened==0,"endClipped":True})
        windows[metric]=current_windows
    fractions={k:sum(w["endSeconds"]-w["startSeconds"] for w in v)/duration for k,v in windows.items()}
    # Refined evaluations also improve energy sampling near detected boundaries.
    sampled=sorted(cache)
    energy=sum((at(a)["powerW"]+at(b)["powerW"])*.5*(b-a)/3600 for a,b in zip(sampled,sampled[1:]))
    return {"windows":windows,"events":sorted(events,key=lambda e:e["seconds"]),
            "fractions":fractions,"energyWh":energy,"evaluations":len(cache),
            "searchStepSeconds":scan_seconds,"refinementBracketSeconds":tolerance}
