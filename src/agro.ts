// Agronomic engine for the prototype.
// Inputs come from the NASA data contract (Field) plus the agronomist's plan per parcel.
// Values marked "Supuesto" (prices, costs, soil K, bucket size) are reference values to validate.
import type { Field } from './types'
import { polygonBounds } from './data'

export type LatLng = [number, number]
export type Scenario = 'dry' | 'normal' | 'wet'
export const SCENARIOS: Scenario[] = ['dry', 'normal', 'wet']
export const SC_RAIN: Record<Scenario, number> = { dry: 0.6, normal: 1, wet: 1.35 }
export const SC_TEMP: Record<Scenario, number> = { dry: 1.2, normal: 0, wet: -0.4 }
export const SC_COLOR: Record<Scenario, string> = { dry: '#B9770E', normal: '#2E7D4F', wet: '#0E5A6B' }
export const TOLERANCE = 7 // t/ha/year (reference; the official value depends on the CONEAT soil unit)

export type CropKey = 'soybean' | 'maize' | 'sorghum' | 'wheat' | 'barley' | 'cover' | 'pasture'
export type PestCond = 'heat' | 'humid' | 'dry'
export interface Crop {
  en: string; es: string
  sow: number[] // calendar months (1-12)
  len: number // months in the field
  c: number // RUSLE C factor while growing
  family: 'legume' | 'summer-grass' | 'winter-grass' | 'pasture'
  ky: number // FAO yield response to water
  yield?: number; price?: number; cost?: number // t/ha, USD/t, USD/ha (Supuesto)
  fixed?: number // USD/ha for pasture/cover (Supuesto)
  ndviPeak: number
  pests: { en: string; es: string; cond: PestCond }[]
}

export const CROPS: Record<CropKey, Crop> = {
  soybean: { en: 'Soybean', es: 'Soja', sow: [10, 11, 12], len: 5, c: 0.2, family: 'legume', ky: 0.85, yield: 2.8, price: 380, cost: 550, ndviPeak: 0.86,
    pests: [{ en: 'Stink bugs', es: 'Chinches', cond: 'heat' }, { en: 'Caterpillars', es: 'Lagartas', cond: 'heat' }, { en: 'Soybean rust', es: 'Roya de la soja', cond: 'humid' }, { en: 'Spider mites', es: 'Arañuela', cond: 'dry' }] },
  maize: { en: 'Maize', es: 'Maíz', sow: [9, 10, 11, 12], len: 5, c: 0.12, family: 'summer-grass', ky: 1.25, yield: 7, price: 190, cost: 800, ndviPeak: 0.88,
    pests: [{ en: 'Fall armyworm', es: 'Gusano cogollero', cond: 'heat' }, { en: 'Corn earworm', es: 'Isoca de la espiga', cond: 'heat' }, { en: 'Leaf blight', es: 'Tizón de la hoja', cond: 'humid' }] },
  sorghum: { en: 'Sorghum', es: 'Sorgo', sow: [10, 11, 12], len: 5, c: 0.12, family: 'summer-grass', ky: 0.9, yield: 5, price: 170, cost: 520, ndviPeak: 0.8,
    pests: [{ en: 'Sugarcane aphid', es: 'Pulgón amarillo', cond: 'dry' }, { en: 'Sorghum midge', es: 'Mosquita del sorgo', cond: 'heat' }] },
  wheat: { en: 'Wheat', es: 'Trigo', sow: [5, 6, 7], len: 6, c: 0.1, family: 'winter-grass', ky: 1.05, yield: 4, price: 220, cost: 600, ndviPeak: 0.8,
    pests: [{ en: 'Aphids', es: 'Pulgones', cond: 'dry' }, { en: 'Fusarium head blight', es: 'Fusariosis de la espiga', cond: 'humid' }, { en: 'Leaf rust', es: 'Roya de la hoja', cond: 'humid' }] },
  barley: { en: 'Barley', es: 'Cebada', sow: [5, 6, 7], len: 5, c: 0.1, family: 'winter-grass', ky: 1, yield: 4, price: 210, cost: 580, ndviPeak: 0.78,
    pests: [{ en: 'Aphids', es: 'Pulgones', cond: 'dry' }, { en: 'Leaf spots', es: 'Manchas foliares', cond: 'humid' }] },
  cover: { en: 'Oat cover crop', es: 'Avena de cobertura', sow: [3, 4, 5, 6], len: 5, c: 0.05, family: 'winter-grass', ky: 0.5, fixed: -70, ndviPeak: 0.62,
    pests: [{ en: 'Aphids', es: 'Pulgones', cond: 'dry' }] },
  pasture: { en: 'Pasture', es: 'Pradera', sow: [3, 4, 5], len: 18, c: 0.02, family: 'pasture', ky: 0.8, fixed: 180, ndviPeak: 0.7,
    pests: [{ en: 'Armyworms', es: 'Isocas', cond: 'dry' }, { en: 'Alfalfa aphid', es: 'Pulgón de la alfalfa', cond: 'dry' }] },
}
export const CROP_KEYS = Object.keys(CROPS) as CropKey[]
export const CROP_COLOR: Record<CropKey | 'fallow', string> = {
  soybean: '#C9A227', maize: '#E07B39', sorghum: '#A8552F', wheat: '#D8C36A', barley: '#8F9A3A', cover: '#5FA777', pasture: '#2F7D4F', fallow: '#B23A2E',
}
export type Prev = 'stubble' | CropKey
export interface ParcelPlan { crop: CropKey; sow: number; prev: Prev; tillage: boolean; irrigation: boolean }
export interface Parcel { id: string; poly: LatLng[]; plan: ParcelPlan }

// ---------------- geometry (lat/lng, local metres) ----------------
const M_LAT = 111320
export function toXY(p: LatLng, ref: LatLng): [number, number] {
  return [(p[1] - ref[1]) * M_LAT * Math.cos((ref[0] * Math.PI) / 180), (p[0] - ref[0]) * M_LAT]
}
export function areaHa(poly: LatLng[]) {
  if (poly.length < 3) return 0
  const ref = poly[0]
  const xy = poly.map((p) => toXY(p, ref))
  let a = 0
  xy.forEach((q, i) => { const r = xy[(i + 1) % xy.length]; a += q[0] * r[1] - r[0] * q[1] })
  return Math.abs(a) / 2 / 10000
}
export function centroid(poly: LatLng[]): LatLng {
  return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length]
}
export function inside(pt: LatLng, poly: LatLng[]) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if (a[0] > pt[0] !== b[0] > pt[0] && pt[1] < ((b[1] - a[1]) * (pt[0] - a[0])) / (b[0] - a[0]) + a[1]) c = !c
  }
  return c
}
function clipEdge(P: LatLng[], ax: 0 | 1, v: number, gt: boolean): LatLng[] {
  const o: LatLng[] = []
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length]
    const ia = gt ? a[ax] >= v : a[ax] <= v, ib = gt ? b[ax] >= v : b[ax] <= v
    if (ia) o.push(a)
    if (ia !== ib) { const t = (v - a[ax]) / (b[ax] - a[ax]); o.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]) }
  }
  return o
}
export function clipRect(P: LatLng[], s: number, w: number, n: number, e: number) {
  let o = clipEdge(P, 1, w, true)
  if (o.length) o = clipEdge(o, 1, e, false)
  if (o.length) o = clipEdge(o, 0, s, true)
  if (o.length) o = clipEdge(o, 0, n, false)
  return o
}
export function splitEqual(field: LatLng[], rows: number, cols: number): LatLng[][] {
  const lats = field.map((p) => p[0]), lngs = field.map((p) => p[1])
  const s = Math.min(...lats), n = Math.max(...lats), w = Math.min(...lngs), e = Math.max(...lngs)
  const out: LatLng[][] = []
  for (let r = rows - 1; r >= 0; r--)
    for (let c = 0; c < cols; c++) {
      const pg = clipRect(field, s + ((n - s) * r) / rows, w + ((e - w) * c) / cols, s + ((n - s) * (r + 1)) / rows, w + ((e - w) * (c + 1)) / cols)
      if (pg.length >= 3 && areaHa(pg) > 0.5) out.push(pg)
    }
  return out
}
/** Snap a click to a nearby vertex, or to the field edge if it is outside or close to it. */
export function snap(pt: LatLng, field: LatLng[], others: LatLng[][], tolM = 25): LatLng {
  const ref = pt
  for (const v of [...field, ...others.flat()]) {
    const [x, y] = toXY(v, ref)
    if (Math.hypot(x, y) < tolM) return v
  }
  if (field.length < 3) return pt
  let best: LatLng = pt, bd = Infinity
  for (let i = 0; i < field.length; i++) {
    const a = toXY(field[i], ref), b = toXY(field[(i + 1) % field.length], ref)
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const t = Math.max(0, Math.min(1, (-a[0] * dx - a[1] * dy) / (dx * dx + dy * dy || 1)))
    const q = [a[0] + t * dx, a[1] + t * dy]
    const d = Math.hypot(q[0], q[1])
    if (d < bd) { bd = d; best = [ref[0] + q[1] / M_LAT, ref[1] + q[0] / (M_LAT * Math.cos((ref[0] * Math.PI) / 180))] }
  }
  return !inside(pt, field) || bd < tolM * 0.6 ? best : pt
}

// -------------- sampling the NASA grids under a parcel --------------
/** Grid cell indices of `field` (demo data) that fall inside `poly`, mapping the client's field bbox onto the data grid. */
export function cellsIn(field: Field, clientField: LatLng[], poly: LatLng[]) {
  const { rows, cols } = field.elevationGrid
  const lats = clientField.map((p) => p[0]), lngs = clientField.map((p) => p[1])
  const s = Math.min(...lats), n = Math.max(...lats), w = Math.min(...lngs), e = Math.max(...lngs)
  const idx: number[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const lat = s + ((r + 0.5) / rows) * (n - s), lng = w + ((c + 0.5) / cols) * (e - w)
      if (inside([lat, lng], poly)) idx.push(r * cols + c)
    }
  return idx
}

export function parcelTerrain(field: Field, clientField: LatLng[], poly: LatLng[]) {
  const { rows, cols, values, cellSizeM } = field.elevationGrid
  const cells = cellsIn(field, clientField, poly)
  if (!cells.length) return { slopePct: 2, wetPct: 0, cells }
  let sum = 0, wet = 0
  for (const i of cells) {
    const r = Math.floor(i / cols), c = i % cols
    const zx = (values[r * cols + Math.min(cols - 1, c + 1)] - values[r * cols + Math.max(0, c - 1)]) / (2 * cellSizeM)
    const zy = (values[Math.min(rows - 1, r + 1) * cols + c] - values[Math.max(0, r - 1) * cols + c]) / (2 * cellSizeM)
    sum += Math.hypot(zx, zy) * 100
  }
  const min = Math.min(...values), max = Math.max(...values)
  for (const i of cells) if ((values[i] - min) / (max - min || 1) < 0.1) wet++
  return { slopePct: Math.round((sum / cells.length) * 10) / 10, wetPct: Math.round((wet / cells.length) * 100), cells }
}

// ---------------- climate ----------------
// Extraterrestrial radiation (mm/day equivalent) near 33°S, by month.
const RA = [17.0, 15.4, 12.9, 10.0, 7.6, 6.5, 6.9, 8.8, 11.5, 14.3, 16.4, 17.4]
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
export function climatology(field: Field) {
  const out = Array.from({ length: 12 }, () => ({ rain: 0, tmax: 0, tmin: 0, n: 0 }))
  for (const m of field.monthly) {
    const k = Number(m.month.slice(5)) - 1
    // skip the drought months so the "normal" year is not biased
    if (['2025-12', '2026-01', '2026-02'].includes(m.month)) continue
    out[k].rain += m.rainMm; out[k].tmax += m.tMaxC; out[k].tmin += m.tMinC; out[k].n++
  }
  return out.map((o, k) => {
    const n = o.n || 1
    const tmax = o.tmax / n, tmin = o.tmin / n
    const et0 = 0.0023 * RA[k] * ((tmax + tmin) / 2 + 17.8) * Math.sqrt(Math.max(1, tmax - tmin)) * DAYS[k]
    return { rain: o.rain / n, tmax, tmin, et0 }
  })
}

// ---------------- simulation ----------------
const KC = [0.4, 0.75, 1.1, 1.05, 0.65]
function kcAt(stage: number) { // stage 0..1
  const x = stage * (KC.length - 1), i = Math.floor(x), t = x - i
  return KC[Math.min(i, KC.length - 1)] * (1 - t) + KC[Math.min(i + 1, KC.length - 1)] * t
}
export interface MonthSim {
  ym: string; label: number // calendar month
  growing: boolean; stage: number
  rain: number; etc: number; eta: number; deficitPct: number
  soilWaterPct: number; ndvi: number; erosion: number; erosionCum: number
  tmax: number
  pests: number[] // risk 0-3 per pest of the crop
}
export interface SimResult {
  months: MonthSim[]
  waterNeed: number; waterRain: number; waterCovered: number
  yieldPct: number; yieldT?: number; margin: number
  erosionYear: number
  pests: { name: string; cond: PestCond; peak: number; months: string[] }[]
  outOfSeason: boolean; repeatsFamily: boolean
}

export const BUCKET = 140 // mm plant-available water (Supuesto)
const K_SOIL = 0.3 // RUSLE K (Supuesto, from CONEAT in the real version)
export const START_YEAR = 2026

export function addMonth(y: number, m: number, n: number) {
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }
}

export function simulate(field: Field, plan: ParcelPlan, slopePct: number, sc: Scenario, horizon = 18): SimResult {
  const clim = climatology(field)
  const crop = CROPS[plan.crop]
  const lambda = 100
  const s = slopePct
  const LS = (0.065 + 0.0456 * s + 0.006541 * s * s) * Math.sqrt(lambda / 22.13)
  const startY = plan.sow >= 7 ? START_YEAR : START_YEAR + 1
  const months: MonthSim[] = []
  let soil = BUCKET * 0.7, cum = 0, need = 0, rainCycle = 0, etaCycle = 0
  const prevFam = plan.prev !== 'stubble' ? CROPS[plan.prev].family : null
  const repeats = prevFam === crop.family
  const pestRisk = crop.pests.map(() => [] as number[])
  for (let i = 0; i < horizon; i++) {
    const { y, m } = addMonth(startY, plan.sow, i)
    const k = m - 1
    const growing = i < crop.len
    const stage = growing ? (i + 0.5) / crop.len : 0
    const rain = clim[k].rain * SC_RAIN[sc]
    const tmax = clim[k].tmax + SC_TEMP[sc]
    const et0 = clim[k].et0 * (1 + SC_TEMP[sc] * 0.03)
    const kc = growing ? (plan.crop === 'pasture' ? 0.85 : kcAt(stage)) : plan.tillage ? 0.3 : 0.18
    const etc = kc * et0
    const runoff = plan.tillage ? 0.18 : 0.08
    let water = soil + rain * (1 - runoff)
    if (plan.irrigation && growing) water = Math.max(water, etc * 1.05)
    const eta = Math.min(etc, water)
    soil = Math.min(BUCKET, water - eta)
    const deficit = etc > 0 ? 1 - eta / etc : 0
    if (growing) { need += etc; rainCycle += rain; etaCycle += eta }
    // NDVI expected
    let ndvi: number
    if (growing) ndvi = 0.22 + (crop.ndviPeak - 0.22) * Math.sin(Math.PI * Math.min(1, stage * 1.05)) * (1 - 0.6 * deficit)
    else ndvi = plan.tillage ? 0.14 : 0.22
    if (plan.crop === 'pasture' && growing) ndvi = crop.ndviPeak * (1 - 0.5 * deficit)
    // erosion (RUSLE, monthly)
    const C = growing ? crop.c * (stage < 0.2 ? 2.5 : 1) : plan.tillage ? 0.6 : 0.25
    const erosion = 0.0121 * Math.pow(rain, 1.6) * K_SOIL * LS * C
    cum += erosion
    // pests: base risk in season + weather conditions + family repetition
    crop.pests.forEach((p, j) => {
      let r = 0
      if (growing) {
        r = 1
        if (p.cond === 'heat' && tmax > 27) r++
        if (p.cond === 'humid' && rain > 120) r++
        if (p.cond === 'dry' && deficit > 0.3) r++
        if (repeats) r++
      }
      pestRisk[j].push(Math.min(3, r))
    })
    months.push({ ym: `${y}-${String(m).padStart(2, '0')}`, label: m, growing, stage, rain: Math.round(rain), etc: Math.round(etc), eta: Math.round(eta), deficitPct: Math.round(deficit * 100), soilWaterPct: Math.round((soil / BUCKET) * 100), ndvi: Math.round(ndvi * 100) / 100, erosion, erosionCum: Math.round(cum * 10) / 10, tmax, pests: pestRisk.map((a) => a[a.length - 1]) })
  }
  const outOfSeason = !crop.sow.includes(plan.sow)
  const waterCovered = need ? etaCycle / need : 1
  const yieldPct = Math.max(0.1, 1 - crop.ky * (1 - waterCovered) - (outOfSeason ? 0.25 : 0) - (repeats ? 0.05 : 0))
  const irrigationCost = plan.irrigation ? 120 : 0
  const margin = crop.yield ? crop.yield * yieldPct * crop.price! - crop.cost! - irrigationCost : (crop.fixed ?? 0) * (crop.fixed! > 0 ? yieldPct : 1) - irrigationCost
  const erosionYear = months.slice(0, 12).reduce((a, m) => a + m.erosion, 0)
  const ymLabels = months.map((m) => m.ym)
  const pests = crop.pests.map((p, j) => ({
    name: p.es + '|' + p.en, cond: p.cond, peak: Math.max(...pestRisk[j]),
    months: ymLabels.filter((_, i) => pestRisk[j][i] >= 2),
  })).sort((a, b) => b.peak - a.peak)
  return {
    months, waterNeed: Math.round(need), waterRain: Math.round(rainCycle), waterCovered,
    yieldPct, yieldT: crop.yield ? Math.round(crop.yield * yieldPct * 10) / 10 : undefined,
    margin: Math.round(margin), erosionYear: Math.round(erosionYear * 10) / 10, pests, outOfSeason, repeatsFamily: repeats,
  }
}

/** Overall score (0-100) of a plan in one scenario. */
export function score(r: SimResult) {
  const soil = Math.max(0, 100 - (r.erosionYear / TOLERANCE) * 50)
  const water = r.waterCovered * 100
  const money = Math.max(0, Math.min(100, r.margin / 6 + 30))
  const pests = 100 - (r.pests.reduce((a, p) => a + p.peak, 0) / Math.max(1, r.pests.length)) * 25
  return Math.round(0.35 * soil + 0.25 * money + 0.2 * water + 0.2 * pests)
}

// -------------- default parcels for the demo clients --------------
export function fieldLatLngs(field: Field): LatLng[] {
  return field.polygon.coordinates[0].slice(0, -1).map(([lon, lat]) => [lat, lon])
}
export function defaultParcels(field: Field): Parcel[] {
  const poly = fieldLatLngs(field)
  const b = polygonBounds(field.polygon)
  const midLng = (b.west + b.east) / 2, northLat = b.south + (b.north - b.south) * 0.72
  const A = clipRect(poly, b.south, b.west, northLat, midLng)
  const B = clipRect(poly, b.south, midLng, northLat, b.east)
  const N = clipRect(poly, northLat, b.west, b.north, b.east)
  const plans: Record<string, ParcelPlan[]> = {
    colonia: [
      { crop: 'wheat', sow: 6, prev: 'soybean', tillage: false, irrigation: false },
      { crop: 'soybean', sow: 11, prev: 'maize', tillage: false, irrigation: false },
      { crop: 'maize', sow: 10, prev: 'soybean', tillage: true, irrigation: false },
    ],
    paysandu: [
      { crop: 'sorghum', sow: 11, prev: 'wheat', tillage: false, irrigation: false },
      { crop: 'maize', sow: 10, prev: 'maize', tillage: false, irrigation: false },
      { crop: 'soybean', sow: 12, prev: 'soybean', tillage: true, irrigation: false },
    ],
  }
  const pl = plans[field.id] ?? [
    { crop: 'soybean', sow: 11, prev: 'wheat', tillage: false, irrigation: false },
    { crop: 'maize', sow: 10, prev: 'soybean', tillage: false, irrigation: false },
    { crop: 'soybean', sow: 11, prev: 'soybean', tillage: true, irrigation: false },
  ]
  return [A, B, N].map((poly, i) => ({ id: `p${i + 1}`, poly, plan: pl[i] }))
}

// -------------- plan variants --------------
export type PlanKind = 'requested' | 'recommended' | 'balanced'
const mid = (k: CropKey) => CROPS[k].sow[Math.floor((CROPS[k].sow.length - 1) / 2)]

function candidates(field: Field, plan: ParcelPlan, slope: number) {
  return CROP_KEYS.map((k) => {
    const p: ParcelPlan = { ...plan, crop: k, sow: mid(k), tillage: false, irrigation: false }
    const sims = SCENARIOS.map((s) => simulate(field, p, slope, s))
    const scores = sims.map(score)
    return { p, worst: Math.min(...scores), mean: scores.reduce((a, b) => a + b, 0) / 3, marginNormal: sims[1].margin, erosion: sims[1].erosionYear }
  })
}

/** Most robust option per plot: best worst-case score, no-till, rainfed. */
export function recommendedPlans(field: Field, clientPoly: LatLng[], parcels: Parcel[]): ParcelPlan[] {
  return parcels.map((q) => {
    const t = parcelTerrain(field, clientPoly, q.poly)
    // keep flat plots in grain unless pasture is clearly better; steep plots can go to pasture
    const adj = (o: { p: ParcelPlan; worst: number }) => o.worst - (o.p.crop === 'pasture' && t.slopePct < 3 ? 8 : 0) - (o.p.crop === 'cover' ? 10 : 0)
    return candidates(field, q.plan, t.slopePct).sort((a, b) => adj(b) - adj(a))[0].p
  })
}

/** Balanced option per plot: mixes income and soil care, within tolerance, different from the recommended crop when possible. */
export function balancedPlans(field: Field, clientPoly: LatLng[], parcels: Parcel[], rec: ParcelPlan[]): ParcelPlan[] {
  return parcels.map((q, i) => {
    const t = parcelTerrain(field, clientPoly, q.poly)
    const c = candidates(field, q.plan, t.slopePct)
      .filter((o) => o.erosion <= TOLERANCE * 1.1)
      .map((o) => ({ ...o, bal: 0.5 * o.mean + 0.5 * Math.max(0, Math.min(100, o.marginNormal / 6 + 30)) }))
      .sort((a, b) => b.bal - a.bal)
    const pick = c.find((o) => o.p.crop !== rec[i].crop) ?? c[0]
    return pick ? pick.p : { ...rec[i] }
  })
}
