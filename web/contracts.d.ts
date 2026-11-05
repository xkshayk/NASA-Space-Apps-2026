/** Scientific API v2. Coordinates in km, angles in degrees, times ISO UTC. */
export interface Body { positionKm: number[]; radiusKm: number; fixedToJ2000?: number[][] }
export interface Angles { altitudeDeg:number; azimuthDeg:number|null; distanceKm:number; horizonDeg:number; clearanceDeg:number }
export interface Terrain { elevationKm:number; radiusKm:number; slopeDeg:number; azimuthDeg:number[]; altitudeDeg:number[]; resolutionM:number; searchRadiusKm:number; observerHeightM:number; model:string }
export interface Site { id:string; name:string; latitude:number; longitude:number; status:string; source:string; positionKm:number[]; fixedPositionKm:number[]; sun:Angles; earth:Angles; sunVisible:boolean; earthVisible:boolean; anyStationVisible:boolean; irradianceWm2:number; powerW:number; oneWayLightSeconds:number; terrain:Terrain; qualifiedForLanding?:false }
export interface State { utc:string; et:number; frame:'J2000'; lunarFrame:string; corrections:string; earthOrientation:string; moon:Body; earth:Body; sun:Body; sites:Site[]; stations:unknown[] }
