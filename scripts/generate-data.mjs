// Generates DEMO data for 3 fields following the Smart2Plant data contract.
// Replace the files in public/data/fields/ with the output of the real NASA pipeline.
// Run: npm run data
import { writeFileSync, mkdirSync } from 'node:fs'

const OUT = new URL('../public/data/fields/', import.meta.url)
mkdirSync(OUT, { recursive: true })

const N = 32 // grid size (N x N cells)
const MONTHS = []
for (let i = 0; i < 24; i++) {
  const d = new Date(Date.UTC(2024, 10 + i, 1)) // 2024-11 .. 2026-10
  MONTHS.push(d.toISOString().slice(0, 7))
}

function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}
const r2 = (x) => Math.round(x * 100) / 100
const r1 = (x) => Math.round(x * 10) / 10

// ---- crop NDVI curves by calendar month (1..12), southern hemisphere ----
const curves = {
  soybean: { 11: 0.3, 12: 0.55, 1: 0.78, 2: 0.86, 3: 0.75, 4: 0.4 },
  maize: { 10: 0.3, 11: 0.5, 12: 0.75, 1: 0.85, 2: 0.7, 3: 0.45 },
  wheat: { 6: 0.3, 7: 0.45, 8: 0.62, 9: 0.78, 10: 0.7, 11: 0.45 },
  cover: { 5: 0.3, 6: 0.45, 7: 0.55, 8: 0.6, 9: 0.55 },
}
const pastureNdvi = (m) => ({ 12: 0.52, 1: 0.48, 2: 0.5, 3: 0.58 }[m] ?? 0.66)

// observed history per strip (4 vertical strips) -> crop per month key
function observedCrop(strip, ym, cfg) {
  const [y, mm] = ym.split('-').map(Number)
  const m = mm
  // summer season belongs to season year (Nov-Apr)
  const summerYear = m >= 7 ? y : y - 1 // season starting in spring of summerYear
  if (strip === 2) {
    // pasture planned; soybean detected in 2025-26 season (plan deviation)
    if (cfg.deviation && summerYear === 2025 && (m >= 11 || m <= 4)) return 'soybean'
    return 'pasture'
  }
  if (m >= 11 || m <= 4) return strip === 1 && summerYear === 2025 ? 'maize' : 'soybean'
  if (m >= 6 && m <= 10 && cfg.winterStrips.includes(strip) && (y === 2025 || cfg.winterBothYears)) return 'wheat'
  return 'fallow'
}

function cropNdvi(crop, m) {
  if (crop === 'pasture') return pastureNdvi(m)
  if (crop === 'fallow') return 0.16
  return curves[crop]?.[m] ?? 0.18
}

// ---- weather climatology (Uruguay-like) ----
const climate = {
  1: [110, 30.5, 17.8], 2: [115, 29.4, 17.6], 3: [120, 27.0, 15.8], 4: [105, 23.0, 12.4],
  5: [95, 19.4, 9.4], 6: [85, 16.0, 6.6], 7: [80, 15.5, 6.0], 8: [80, 17.2, 6.9],
  9: [90, 19.0, 8.5], 10: [115, 22.3, 11.2], 11: [100, 25.4, 13.6], 12: [100, 28.6, 16.3],
}

function makeField(cfg) {
  const rand = rng(cfg.seed)
  const { lat, lon, wM, hM } = cfg
  const dLat = hM / 111320
  const dLon = wM / (111320 * Math.cos((lat * Math.PI) / 180))
  const west = lon - dLon / 2, east = lon + dLon / 2, south = lat - dLat / 2, north = lat + dLat / 2
  const cellSizeM = Math.round(wM / N)
  const P = (fx, fy) => [r6(west + fx * dLon), r6(south + fy * dLat)]
  function r6(x) { return Math.round(x * 1e6) / 1e6 }
  const rect = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1), P(x0, y0)]] })

  const polygon = { type: 'Polygon', coordinates: [[P(0, 0.03), P(0.97, 0), P(1, 0.96), P(0.04, 1), P(0, 0.03)]] }

  // elevation (m): rows go south(0) -> north(N-1)
  const elev = []
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const fx = c / (N - 1), fy = r / (N - 1)
    let z = cfg.baseElev + cfg.tilt * fy
    z += cfg.hill * Math.exp(-((fx - 0.55) ** 2 + (fy - 0.9) ** 2) / 0.05)
    z -= cfg.channel * Math.exp(-((fx - 0.35) ** 2) / 0.01) * (1 - fy * 0.6)
    z += (rand() - 0.5) * 0.4
    elev.push(r1(z))
  }

  // zones: north slope / center / south lowland
  const zones = [
    { id: 'Z1', label: 'North slope', polygon: rect(0, 0.72, 1, 1), slopePct: cfg.hill > 20 ? 5.2 : cfg.hill > 10 ? 3.9 : 2.4, wetness: 0.25, vigor: 0.55, erosionRisk: cfg.hill > 10 ? 'High' : 'Medium' },
    { id: 'Z2', label: 'Central plateau', polygon: rect(0, 0.3, 1, 0.72), slopePct: 1.9, wetness: 0.45, vigor: 0.82, erosionRisk: 'Low' },
    { id: 'Z3', label: 'South lowland', polygon: rect(0, 0, 1, 0.3), slopePct: 0.8, wetness: cfg.channel > 1 ? 0.85 : 0.6, vigor: cfg.channel > 1 ? 0.6 : 0.74, erosionRisk: 'Low' },
  ]
  const zoneOf = (fy) => (fy >= 0.72 ? 0 : fy >= 0.3 ? 1 : 2)
  const zoneVigorAdj = [-0.12, 0.04, cfg.channel > 1 ? -0.06 : 0]

  const monthly = MONTHS.map((ym) => {
    const m = Number(ym.slice(5))
    const [rain0, tmax0, tmin0] = climate[m]
    let rain = rain0 * (0.75 + rand() * 0.5)
    let drought = 1
    if (['2025-12', '2026-01', '2026-02'].includes(ym)) { rain = rain0 * 0.32; drought = 0.68 }
    if (ym === '2025-05') rain = 186
    if (ym === '2025-04') rain = 158
    const ndvi = [], bare = []
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const fx = c / (N - 1), fy = r / (N - 1)
      const strip = Math.min(3, Math.floor(fx * 4))
      const crop = observedCrop(strip, ym, cfg)
      let v = cropNdvi(crop, m)
      if (crop !== 'fallow') v = v * (crop === 'soybean' || crop === 'maize' ? drought : 1) + zoneVigorAdj[zoneOf(fy)]
      v += (rand() - 0.5) * 0.06
      // waterlogging patch in wet months on lowland channel
      if (cfg.channel > 1 && [4, 5, 6].includes(m) && Math.abs(fx - 0.35) < 0.07 && fy < 0.35) v -= 0.15
      v = Math.max(0.05, Math.min(0.92, v))
      ndvi.push(r2(v))
      bare.push(v < 0.22)
    }
    const sm = Math.max(0.08, Math.min(0.42, 0.12 + rain / 520 + (m >= 5 && m <= 8 ? 0.06 : 0)))
    return {
      month: ym, ndvi, bareSoil: bare,
      rainMm: Math.round(rain), soilMoisture: r2(sm),
      tMaxC: r1(tmax0 + (rand() - 0.5) * 1.6 + (drought < 1 ? 1.8 : 0)),
      tMinC: r1(tmin0 + (rand() - 0.5) * 1.6),
      frostDays: [6, 7, 8].includes(m) ? Math.round(3 + rand() * 5) : m === 5 || m === 9 ? Math.round(rand() * 2) : 0,
    }
  })

  // plots for rotations
  const strips4 = [0, 1, 2, 3].map((i) => ({ plotId: `P${i + 1}`, polygon: rect(i / 4, 0, (i + 1) / 4, 1) }))
  const rec = [
    { plotId: 'A', polygon: rect(0, 0, 0.5, 0.72) },
    { plotId: 'B', polygon: rect(0.5, 0, 1, 0.72) },
    { plotId: 'N', polygon: rect(0, 0.72, 1, 1) },
  ]
  const s = (crop, start, end) => ({ crop, start, end })
  const rotations = [
    {
      id: 'requested', name: 'What you asked for', kind: 'requested',
      plots: strips4.map((p, i) => ({ ...p, sequence: [
        s(i % 2 ? 'maize' : 'soybean', '2026-11', '2027-04'),
        s('fallow', '2027-05', '2027-10'),
        s('soybean', '2027-11', '2028-04'),
        s(i === 3 ? 'wheat' : 'fallow', '2028-05', '2028-10'),
        s(i % 2 ? 'soybean' : 'maize', '2028-11', '2029-04'),
      ] })),
      scores: { soil: 34, water: 58, climateRisk: 38, income: 78 },
      why: '4 plots of summer cash crops, as you requested.',
      evidence: `Estimated soil loss ${cfg.hill > 10 ? '11.2' : '8.4'} t/ha/year on the north slope vs. a tolerance of 7 (RUSLE with IMERG rain and SRTM slope).`,
      benefits: 'Highest short-term income in normal years.',
      gaps: 'Exact tolerance depends on the official soil unit (CONEAT); confirm with your agronomist.',
      risks: 'Bare soil for 6 months every winter; in the 2025-26 drought the same pattern lost about a third of its greenness.',
    },
    {
      id: 'recommended', name: 'Recommended', kind: 'recommended',
      plots: [
        { ...rec[0], sequence: [s('soybean', '2026-11', '2027-04'), s('wheat', '2027-05', '2027-11'), s('soybean', '2027-12', '2028-04'), s('cover', '2028-05', '2028-09'), s('maize', '2028-10', '2029-03'), s('cover', '2029-04', '2029-10')] },
        { ...rec[1], sequence: [s('maize', '2026-10', '2027-03'), s('cover', '2027-04', '2027-10'), s('soybean', '2027-11', '2028-04'), s('wheat', '2028-05', '2028-11'), s('soybean', '2028-12', '2029-04'), s('cover', '2029-05', '2029-10')] },
        { ...rec[2], sequence: [s('pasture', '2026-11', '2029-10')] },
      ],
      scores: { soil: 82, water: 71, climateRisk: 69, income: 66 },
      why: 'The north slope erodes easily: keep it under permanent pasture and farm the flatter 72% in 2 plots that never stay bare in winter.',
      evidence: 'Estimated soil loss 4.1 t/ha/year, below the tolerance. Long-term rotation trials at INIA La Estanzuela show rotations with pasture keep more soil carbon.',
      benefits: 'Soil always covered, a grass-legume-grass sequence that breaks pest cycles, and forage for livestock.',
      gaps: 'Cover crop establishment depends on autumn rain; check soil moisture (SMAP) before sowing.',
      risks: 'About 15% less grain income in normal years; needs grazing or a hay buyer for the pasture.',
    },
    {
      id: 'alternative', name: 'Alternative', kind: 'alternative',
      plots: [
        { ...rec[0], sequence: [s('soybean', '2026-11', '2027-04'), s('wheat', '2027-05', '2027-11'), s('soybean', '2027-12', '2028-04'), s('pasture', '2028-05', '2029-10')] },
        { ...rec[1], sequence: [s('pasture', '2026-11', '2028-04'), s('cover', '2028-05', '2028-09'), s('maize', '2028-10', '2029-03'), s('cover', '2029-04', '2029-10')] },
        { ...rec[2], sequence: [s('pasture', '2026-11', '2029-10')] },
      ],
      scores: { soil: 90, water: 78, climateRisk: 80, income: 52 },
      why: 'Crop-pasture rotation: 3 years of crops, then 3 years of pasture, like the oldest rotation trial in South America.',
      evidence: 'Rotations with pasture had 12-30% more soil carbon than continuous cropping in Uruguayan trials (García Préchac et al., INIA).',
      benefits: 'Best soil protection and drought resilience; strong fit if you keep cattle.',
      gaps: 'Income depends on beef prices and stocking rate, not modeled here.',
      risks: 'Lowest grain income; requires fencing and water for animals.',
    },
  ]

  const alerts = [
    { date: '2025-04-28', level: 'critical', type: 'heavy_rain_bare', message: 'Heavy rain forecast (65 mm in 48 h) and plot 2 has no cover.', plotId: 'P2', source: 'GPM IMERG + HLS' },
    { date: '2025-07-02', level: 'warning', type: 'frost', message: 'Frost risk tonight (-2 °C) for young wheat in plot 4.', plotId: 'P4', source: 'NASA POWER' },
    { date: '2025-10-01', level: 'info', type: 'bare_soil', message: 'Plots 1 and 2 have been bare for 5 months.', plotId: 'P1', source: 'HLS' },
    { date: '2025-12-10', level: 'warning', type: 'drought_onset', message: 'Early drought signal: root-zone soil moisture 35% below normal.', plotId: 'P1', source: 'SMAP' },
    { date: '2026-01-20', level: 'critical', type: 'crop_stress', message: 'Crop water stress detected in plot 2 during flowering.', plotId: 'P2', source: 'ECOSTRESS' },
    { date: '2026-02-05', level: 'warning', type: 'plan_deviation', message: 'Plot 3 differs from the plan: soybean detected where pasture was planned.', plotId: 'P3', source: 'HLS' },
    { date: '2026-03-01', level: 'info', type: 'monthly_summary', message: 'February report: greenness 31% below the 5-year average for this field.', plotId: 'P1', source: 'HLS + MODIS' },
    { date: '2026-09-15', level: 'info', type: 'cover_window', message: 'Good window to sow a cover crop this week: soil moisture is adequate.', plotId: 'P1', source: 'SMAP + NASA POWER' },
  ]

  if (!cfg.deviation) alerts.splice(alerts.findIndex((a) => a.type === 'plan_deviation'), 1)
  if (cfg.extraDeviation) alerts.push({ date: '2025-08-12', level: 'warning', type: 'plan_deviation', message: 'Plot 1 differs from the plan: no winter cover detected where wheat was declared.', plotId: 'P1', source: 'HLS' })
  alerts.sort((a, b) => a.date.localeCompare(b.date))

  const analogs = [
    { region: 'Entre Ríos', country: 'Argentina', lat: -32.0, lon: -59.5, similarity: 0.91, summary: 'Same rolling relief and humid climate; heavy soybean share.', lockedDetails: 'Fields that added winter wheat or covers kept 22% more greenness in the 2022-23 drought.' },
    { region: 'Rio Grande do Sul', country: 'Brazil', lat: -29.7, lon: -53.8, similarity: 0.86, summary: 'Wetter, but similar soils and soybean-wheat systems.', lockedDetails: 'No-till with covers is the norm; erosion hotspots match slopes above 5%.' },
    { region: 'Pergamino, Buenos Aires', country: 'Argentina', lat: -33.9, lon: -60.6, similarity: 0.84, summary: 'Similar temperature and rain pattern; maize-soybean rotations.', lockedDetails: 'Maize-soybean-wheat cut water stress days by about a quarter vs. soybean alone.' },
    { region: 'Kentucky', country: 'USA', lat: 37.6, lon: -85.3, similarity: 0.78, summary: 'Humid subtropical climate mirrored in the north; corn-soy-wheat.', lockedDetails: 'Fields under conservation plans (RUSLE2) with cereal rye covers.' },
    { region: 'Po Valley', country: 'Italy', lat: 45.1, lon: 10.4, similarity: 0.74, summary: 'Comparable heat and rain; mandatory crop rotation rules (EU CAP).', lockedDetails: 'Two crops in four years rule, verified by Sentinel satellites.' },
    { region: 'Northern NSW', country: 'Australia', lat: -29.5, lon: 151.2, similarity: 0.71, summary: 'Summer-rain cropping with drought cycles.', lockedDetails: 'Pasture phases used as drought buffer in dry years.' },
  ]

  return {
    id: cfg.id, name: cfg.name, department: cfg.department, areaHa: Math.round((wM * hM) / 10000),
    polygon,
    elevationGrid: { rows: N, cols: N, cellSizeM, values: elev },
    monthly, zones, alerts, rotations, analogs,
  }
}

const fields = [
  makeField({ id: 'soriano', name: 'La Esperanza', department: 'Soriano', lat: -33.497, lon: -58.153, wM: 1300, hM: 1100, seed: 11, winterStrips: [3], deviation: true, baseElev: 38, tilt: 10, hill: 24, channel: 0.6 }),
  makeField({ id: 'colonia', name: 'El Trébol', department: 'Colonia', lat: -34.262, lon: -57.243, wM: 1150, hM: 950, seed: 23, winterStrips: [0, 1, 3], winterBothYears: true, deviation: false, baseElev: 52, tilt: 6, hill: 8, channel: 2.4 }),
  makeField({ id: 'paysandu', name: 'Santa Clara', department: 'Paysandú', lat: -32.371, lon: -57.214, wM: 1500, hM: 1200, seed: 37, winterStrips: [], deviation: true, extraDeviation: true, baseElev: 95, tilt: 8, hill: 16, channel: 1.2 }),
]

for (const f of fields) writeFileSync(new URL(`${f.id}.json`, OUT), JSON.stringify(f))
writeFileSync(new URL('index.json', OUT), JSON.stringify(fields.map(({ id, name, department, areaHa }) => ({ id, name, department, areaHa }))))
console.log('wrote', fields.map((f) => f.id).join(', '))
