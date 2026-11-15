// Data contract shared with the NASA data pipeline (public/data/fields/<id>.json)
export type GeoPolygon = { type: 'Polygon'; coordinates: number[][][] }

export interface MonthData {
  month: string // "2025-01"
  ndvi: number[] // NASA HLS, one value per grid cell
  bareSoil: boolean[] // NASA HLS
  rainMm: number // GPM IMERG
  soilMoisture: number // SMAP, m3/m3
  tMaxC: number // NASA POWER
  tMinC: number // NASA POWER
  frostDays: number // NASA POWER
}

export interface Zone {
  id: string
  label: string
  polygon: GeoPolygon
  slopePct: number
  wetness: number
  vigor: number
  erosionRisk: 'Low' | 'Medium' | 'High' | string
}

export interface Alert {
  date: string
  level: 'info' | 'warning' | 'critical'
  type: string
  message: string
  plotId: string
  source: string
}

export interface SequenceItem { crop: string; start: string; end: string }
export interface RotationPlot { plotId: string; polygon: GeoPolygon; sequence: SequenceItem[] }

export interface Rotation {
  id: string
  name: string
  kind: 'requested' | 'recommended' | 'alternative'
  plots: RotationPlot[]
  scores: { soil: number; water: number; climateRisk: number; income: number }
  why: string
  evidence: string
  benefits: string
  gaps: string
  risks: string
}

export interface Analog {
  region: string
  country: string
  lat: number
  lon: number
  similarity: number
  summary: string
  lockedDetails: string
}

export interface Field {
  id: string
  name: string
  department: string
  areaHa: number
  polygon: GeoPolygon
  elevationGrid: { rows: number; cols: number; cellSizeM: number; values: number[] }
  monthly: MonthData[]
  zones: Zone[]
  alerts: Alert[]
  rotations: Rotation[]
  analogs: Analog[]
}

export interface FieldSummary { id: string; name: string; department: string; areaHa: number }

export type View = 'home' | 'portfolio' | 'field' | 'predict' | 'monitor' | 'reports'
export type Role = 'farmer' | 'landowner' | 'government'
export type Lang = 'en' | 'es'

export interface WizardAnswers {
  plots: number
  crops: string[]
  priorities: string[]
  irrigation: boolean
  livestock: boolean
  tillage: 'notill' | 'conventional'
  history: 'detect' | 'soybean' | 'maize' | 'wheat' | 'pasture'
}
