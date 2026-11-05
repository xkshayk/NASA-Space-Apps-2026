# Scientific model
Real source data do not remove finite resolution, uncertainty or mission-specific constraints. Distinguish numerical agreement, terrain quality and rendering accuracy.

## Reference tools
[JPL WebGeocalc](https://naif.jpl.nasa.gov/naif/webgeocalc.html) exposes SPICE interactively; this app uses that toolkit locally through SpiceyPy. [Horizons](https://ssd.jpl.nasa.gov/horizons/) supplies recorded reference states. [NASA LOLA illumination methods](https://pgda.gsfc.nasa.gov/products/69) guide horizon interpretation: long-term average products are not date-specific instantaneous illumination. [QuickMap](https://quickmap.im-ldi.com/) is a surface-inspection reference, not a runtime dependency.

## Frames and time
UTC timestamps end in Z, bounded to 2024-01-01–2027-01-31, the span of the pinned Earth orientation kernel (verified against its SPICE coverage at startup and in tests). naif0012.tls converts UTC to ephemeris time. DE440s positions use J2000, observer Moon, correction NONE: simultaneous geometry, not apparent telescope positions.

Lunar coordinates are planetocentric, east-positive, in MOON_ME_DE440_ME421, defined by moon_de440_250416.tf and DE440 lunar orientation. This retains the ME421 alignment of the terrain. Earth rotation/stations use ITRF93 kernels; the visible Earth ellipsoid uses WGS84 radii. The pinned kernel is earth_000101_270131_261104.bpc; orientation after its last datum (2026-11-04) is predicted. NAIF replaces this file without archiving the old one, so download_data.py names the current replacement when a pinned kernel disappears; pinning a new one requires reviewing coverage and rerunning the tests.

Python geometry is float64; tessellation/GPU calculations have display approximations. Lighting, atmosphere and decorative stars are not radiometric/navigation products.

Display relief: the mesh uses 0.5° LOLA cell means, and a normal map built from the finer residual adds crater shading without exaggeration. South of ~75° S the equirectangular maps pinch, so shading switches to normals from the 240 m polar DEM on a polar-stereographic grid and colour fades to the mean polar albedo near both poles. These are display products; science calculations never read them.

## Terrain and surface observer
Global LOLA has 16 pixels/degree, elevations in km above 1737.4 km. South of 60°S an adjusted 240 m polar-stereographic DEM is used. Projection, pixel scale and reference radius are checked. Colors never supply scientific elevations.

Construct east/north/up at the site. The observer is local DEM radius plus 2 m. Subtract the observer from body vectors, rotate to lunar coordinates, then calculate altitude=atan2(up,horizontal) and azimuth=atan2(east,north), wrapped 0–360°.

The obstruction horizon samples 180 azimuth rays, nearby terrain at source-cell spacing and farther samples out to 150 km, including spherical curvature. Maximum elevation angle on each ray defines the horizon; adjacent rays interpolate arbitrary azimuths. Finite range, 2° rays, polar nearest-pixel sampling and unresolved topography can miss obstructions. No convergence/error bound has been established.

Regional slope is a central gradient across two cells: ~480 m southern baseline or ~3.8 km global equatorial baseline. It is not lander-footprint slope. The 3D mesh uses coarser 0.5° samples with no relief exaggeration.

## Power
Flux = 1361 W/m² × (1 AU / Sun distance)².
Horizontal panel projection = max(0, sin solar altitude); ideal tracking projection = 1.
Power = flux × projection × unocculted solar fraction × area × efficiency, when the Sun center clears the selected horizon.

Earth eclipse fraction uses uniform circular Sun and spherical Earth disks. Terrain uses a Sun-center threshold, so partial-disk sunrise is unresolved. No atmosphere, dust, panel temperature/degradation, slope-mounted panel, battery, demand or thermal survival is modeled. Ideal watts are not historical lander output.

## Communication
Earth-center clearance is altitude minus horizon. Default lunar margin is 5° (editable). Each DSN antenna independently requires lunar-side clearance above that margin and >10° elevation at the Earth station. Earth-center visibility alone is not a scheduled radio link.

Light time is distance / 299792.458 km/s; displayed site light time is to Earth's center. Simultaneous geometry omits retarded station motion. Local Earth terrain, antenna compatibility, frequency/gain, link budget, atmosphere, scheduling and relays are not modeled.

## Time windows
Uniform samples (maximum 30 days/745 timestamps) integrate with actual interval durations and trapezoidal estimates. Cadence appears in the UI. Brief events can be missed; transitions are uncertain at the sample cadence. These are not operational contact windows.

## Candidate criteria
[NASA's Apollo account](https://www.nasa.gov/history/50-years-ago-lunar-landing-sites-selected/) describes mission-specific terrain, approach and lighting requirements; it is not a universal slope rule. [NASA precision landing](https://www.nasa.gov/centers-and-facilities/johnson/nasa-technology-enables-precision-landing-without-a-pilot/) identifies hazards beyond coarse slope.

Stage 1 screens a 5×5 neighborhood by editable regional slope. Grid points are great-circle offsets along local north and east (spacing in degrees of arc, ~30.3 km per degree), so the neighborhood stays square near the poles instead of collapsing in longitude. Default 10° is a study assumption. Roughness, boulders/craters, approach/propellant, landing ellipse and vehicle design remain unknown. Stage 2 screens sunlight/eclipses and optionally DSN geometry at the requested date. Every result retains qualifiedForLanding=false. Past touchdown does not establish future safety.

## Evidence
Six captured Horizons comparisons at three dates differ approximately 0.6–2.5 m for Earth-relative Moon/Sun positions (DE441 reference vs DE440). This supports those states, not all dates or meter-accurate terrain. Direct SPICE constant-observer comparisons verify surface-vector transforms. NASA's IM-1 height/slope provide a coarse sanity check. See VERIFICATION.md.
