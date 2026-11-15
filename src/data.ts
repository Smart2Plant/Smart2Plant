import type { Field, FieldSummary } from './types'
// Bundled copies of the demo data: used when /data/fields/*.json can't be fetched
// (for example inside the single-file preview). The deployed site fetches the files,
// so the pipeline can replace them without rebuilding the UI.
import soriano from '../public/data/fields/soriano.json'
import colonia from '../public/data/fields/colonia.json'
import paysandu from '../public/data/fields/paysandu.json'

const bundled: Record<string, Field> = {
  soriano: soriano as unknown as Field,
  colonia: colonia as unknown as Field,
  paysandu: paysandu as unknown as Field,
}

export const bundledIndex: FieldSummary[] = Object.values(bundled).map(({ id, name, department, areaHa }) => ({ id, name, department, areaHa }))

export async function loadIndex(): Promise<FieldSummary[]> {
  try {
    const r = await fetch('data/fields/index.json')
    if (!r.ok) throw new Error()
    return await r.json()
  } catch {
    return bundledIndex
  }
}

export async function loadField(id: string): Promise<Field> {
  try {
    const r = await fetch(`data/fields/${id}.json`)
    if (!r.ok) throw new Error()
    return await r.json()
  } catch {
    return bundled[id] ?? bundled.soriano
  }
}

// ---------- helpers ----------
export const CROP_COLORS: Record<string, string> = {
  soybean: '#C9B037',
  maize: '#F2A541',
  wheat: '#E8D9A0',
  cover: '#6DBE7B',
  pasture: '#2E8B57',
  fallow: '#E43700',
}

export function ndviColor(v: number): [number, number, number] {
  // brown -> yellow -> green
  const stops: [number, [number, number, number]][] = [
    [0.1, [139, 90, 43]],
    [0.35, [230, 200, 79]],
    [0.8, [46, 139, 87]],
  ]
  if (v <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [a, ca] = stops[i - 1]
      const [b, cb] = stops[i]
      const t = (v - a) / (b - a)
      return [0, 1, 2].map((k) => Math.round(ca[k] + (cb[k] - ca[k]) * t)) as [number, number, number]
    }
  }
  return stops[stops.length - 1][1]
}

export function polygonBounds(p: { coordinates: number[][][] }) {
  const pts = p.coordinates[0]
  const lons = pts.map((q) => q[0]), lats = pts.map((q) => q[1])
  return { west: Math.min(...lons), east: Math.max(...lons), south: Math.min(...lats), north: Math.max(...lats) }
}

export const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)

export function monthLabel(ym: string, lang: 'en' | 'es') {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  return d.toLocaleDateString(lang === 'es' ? 'es-UY' : 'en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

export function cropAt(seq: { crop: string; start: string; end: string }[], ym: string) {
  for (const s of seq) if (ym >= s.start && ym <= s.end) return s.crop
  return 'fallow'
}

/** Render the NDVI grid of one month to a PNG data URL (used as a map overlay). */
export function ndviDataUrl(field: Field, monthIdx: number, size = 128) {
  const { rows, cols } = field.elevationGrid
  const m = field.monthly[monthIdx]
  const c = document.createElement('canvas')
  c.width = cols
  c.height = rows
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(cols, rows)
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const v = m.ndvi[r * cols + k]
      const [R, G, B] = ndviColor(v)
      const y = rows - 1 - r // grid rows go south -> north
      const o = (y * cols + k) * 4
      img.data[o] = R; img.data[o + 1] = G; img.data[o + 2] = B; img.data[o + 3] = 235
    }
  ctx.putImageData(img, 0, 0)
  const big = document.createElement('canvas')
  big.width = size; big.height = size
  const bctx = big.getContext('2d')!
  bctx.imageSmoothingEnabled = true
  bctx.drawImage(c, 0, 0, size, size)
  return big.toDataURL()
}
