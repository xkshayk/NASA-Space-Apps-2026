/**
 * Lunar Horizon science API, model 3.1 (documentation only; Python validates requests).
 * Units: kilometres, degrees, W, Wh, W/m². Times are ISO UTC strings ending in Z.
 * Long requests (timeline, candidates) stop early when the browser abandons them.
 */
export interface Body { positionKm: number[]; radiusKm: number; polarRadiusKm?: number; fixedToJ2000?: number[][] }
export interface Angles { altitudeDeg: number; azimuthDeg: number | null; distanceKm: number; horizonDeg: number; clearanceDeg: number }

export interface Terrain {
  elevationKm: number; radiusKm: number; slopeDeg: number;
  azimuthDeg: number[]; altitudeDeg: number[]; azimuthStepDeg: number; searchRadiusKm: number;
  resolutionM: number; regionalResolutionM: number; highResolutionAvailable: boolean;
  observerHeightM: number; model: string;
}

export interface CatalogSite {
  id: string; name: string; shortName: string; region: string; latitude: number; longitude: number;
  status: string; program: 'CLPS' | 'Apollo'; mission: string; lander: string; provider: string;
  launched: string; landed: string; touchdownUtc: string; touchdownPrecision: string;
  crew?: string; outcome: string; nasaPayloads?: string; coordinatePrecision: string; note?: string;
  source: string; missionSource: string;
}

export interface Coverage { start: string; end: string; earthPredictedAfter: string }

export interface StationVisibility {
  id: string; name: string; lunarAltitudeDeg: number; lunarClearanceDeg: number;
  groundAltitudeDeg: number; visible: boolean; distanceKm: number;
}
export interface Station {
  id: string; naifId: number; name: string; country: string; diameterM: number;
  latitude: number; longitude: number; heightKm: number; fixedPositionKm: number[]; positionKm: number[]; normalJ2000: number[];
}

export interface SiteModel {
  horizon: 'terrain' | 'sphere'; earthMarginDeg: number; stationMaskDeg: number;
  panel: 'horizontal' | 'tracking'; areaM2: number; efficiency: number;
}

export interface Site {
  id: string; name: string; latitude: number; longitude: number; status: string; source: string;
  positionKm: number[]; fixedPositionKm: number[]; sun: Angles; earth: Angles;
  sunVisible: boolean; earthVisible: boolean; stations: StationVisibility[]; anyStationVisible: boolean;
  irradianceWm2: number; powerW: number; solarFluxWm2: number; solarDiskUnocculted: number;
  solarDiskVisibleFraction: number; solarAngularRadiusDeg: number; oneWayLightSeconds: number;
  terrain: Terrain; model: SiteModel; gridOffsetKm?: { north: number; east: number };
}

/** GET /api/state?utc&sites&horizon&panel&area&efficiency&margin */
export interface State {
  utc: string; et: number; frame: 'J2000'; lunarFrame: string; corrections: string;
  earthOrientation: 'Predicted' | 'Historical Earth orientation';
  moon: Body; earth: Body; sun: Body; stations: Station[]; earthDistanceKm: number; sunDistanceKm: number; sites: Site[];
}

export interface SeriesRow {
  sunVisible: boolean; earthVisible: boolean; anyStationVisible: boolean; irradianceWm2: number; powerW: number;
  sunAltitudeDeg: number; sunAzimuthDeg: number | null; sunClearanceDeg: number; earthAltitudeDeg: number; earthAzimuthDeg: number | null;
}
export interface Interval { startSeconds: number; endSeconds: number; startUtc: string; endUtc: string; startClipped: boolean; endClipped: boolean }
export interface TransitionEvent {
  metric: string; starts: boolean; seconds: number; utc: string;
  bracketStartSeconds: number; bracketEndSeconds: number; bracketStartUtc: string; bracketEndUtc: string;
}

/** GET /api/timeline?utc&sites&days&stepMinutes&…settings */
export interface Timeline {
  timesUtc: string[]; series: Record<string, SeriesRow[]>;
  summary: Record<string, { sunVisible: number; earthVisible: number; anyStationVisible: number; energyWh: number }>;
  events: Record<string, TransitionEvent[]>; windows: Record<string, Record<string, Interval[]>>;
  stepMinutes: number; searchStepSeconds: number; numericalBracketSeconds: number; physicalTimingUncertainty: string; method: string;
}

export type Constraint = 'pass' | 'fail' | 'unknown' | 'not-required';
export interface Candidate extends Site {
  passesDateScreen: boolean; qualifiedForLanding: false; constraints: Record<string, Constraint>;
  evidence: Record<string, unknown>; profileId: string;
}

/** GET /api/candidates?utc&latitude&longitude&spacing&profile&maxSlope&minSun&requireRadio&…; spacing is great-circle degrees. */
export interface CandidateScreen {
  candidates: Candidate[]; tested: 25; terrainRejected: number; datePassed: number; qualified: 0;
  rejections: { latitude: number; longitude: number; gridOffsetKm: { north: number; east: number }; slopeDeg: number; failedCriteria: string[] }[];
  explanation: string; criteriaSource: string;
}

export interface ApiError { error: string }
