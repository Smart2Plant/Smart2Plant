import { CircleMarker, ImageOverlay, MapContainer, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Field } from '../types'
import { ndviColor } from '../data'
import type { LatLng } from '../agro'

export const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_ATTR = 'Imagery © Esri, Maxar, Earthstar Geographics'
type Bounds = [[number, number], [number, number]]

export function boundsOf(poly: LatLng[], pad = 0): Bounds {
  const lats = poly.map((p) => p[0]), lngs = poly.map((p) => p[1])
  const s = Math.min(...lats), n = Math.max(...lats), w = Math.min(...lngs), e = Math.max(...lngs)
  const dy = (n - s) * pad, dx = (e - w) * pad
  return [[s - dy, w - dx], [n + dy, e + dx]]
}

function FitTo({ bounds }: { bounds: Bounds }) {
  const map = useMap()
  const key = bounds.flat().map((v) => v.toFixed(5)).join(',')
  useEffect(() => { map.fitBounds(bounds, { padding: [16, 16] }) }, [map, key])
  return null
}
function ClickCatcher({ onClick }: { onClick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onClick([e.latlng.lat, e.latlng.lng]) })
  return null
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/**
 * A stylised "satellite" backdrop around the field, used when the real imagery tiles can't load
 * (for example in the offline preview). The field itself is painted with its NASA HLS NDVI grid.
 */
export function makeBackdrop(field: Field, poly: LatLng[], monthIdx: number) {
  const [[s, w], [n, e]] = boundsOf(poly, 1.2)
  const [[fs, fw], [fn, fe]] = boundsOf(poly, 0)
  const W = 640, H = Math.round((640 * (n - s)) / ((e - w) * Math.cos((s * Math.PI) / 180)))
  const c = document.createElement('canvas')
  c.width = W; c.height = Math.max(200, Math.min(900, H))
  const ctx = c.getContext('2d')!
  const r = rng(field.id.length * 97 + 13)
  const pal = ['#8AA56A', '#B9A56B', '#7C9A63', '#A3924F', '#93B075', '#C2B27A', '#7F9C66', '#9AAE70', '#6F8A5A']
  ctx.fillStyle = '#6F8A5A'; ctx.fillRect(0, 0, c.width, c.height)
  const cols = 7, rows = 7
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const x0 = (j / cols) * c.width + (r() - 0.5) * 18, y0 = (i / rows) * c.height + (r() - 0.5) * 18
      const x1 = ((j + 1) / cols) * c.width + (r() - 0.5) * 18, y1 = ((i + 1) / rows) * c.height + (r() - 0.5) * 18
      ctx.fillStyle = pal[Math.floor(r() * pal.length)]
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0 + (r() - 0.5) * 20); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1 + (r() - 0.5) * 20); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = 'rgba(60,70,40,.35)'; ctx.lineWidth = 1.5; ctx.stroke()
    }
  // creek and road
  ctx.strokeStyle = 'rgba(63,127,147,.9)'; ctx.lineWidth = 6; ctx.beginPath()
  ctx.moveTo(0, c.height * 0.82); ctx.bezierCurveTo(c.width * 0.3, c.height * 0.7, c.width * 0.55, c.height * 0.95, c.width, c.height * 0.78); ctx.stroke()
  ctx.strokeStyle = 'rgba(233,227,208,.9)'; ctx.lineWidth = 4; ctx.beginPath()
  ctx.moveTo(c.width * 0.12, 0); ctx.lineTo(c.width * 0.16, c.height); ctx.stroke()
  // field painted with NDVI grid
  const { rows: gr, cols: gc } = field.elevationGrid
  const m = field.monthly[Math.max(0, Math.min(field.monthly.length - 1, monthIdx))]
  const px = (lng: number) => ((lng - w) / (e - w)) * c.width
  const py = (lat: number) => ((n - lat) / (n - s)) * c.height
  ctx.save()
  ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(px(p[1]), py(p[0])) : ctx.moveTo(px(p[1]), py(p[0])))); ctx.closePath(); ctx.clip()
  for (let a = 0; a < gr; a++)
    for (let b = 0; b < gc; b++) {
      const [R, G, B] = ndviColor(m.ndvi[a * gc + b])
      ctx.fillStyle = `rgb(${R},${G},${B})`
      const la0 = fs + (a / gr) * (fn - fs), la1 = fs + ((a + 1) / gr) * (fn - fs)
      const lo0 = fw + (b / gc) * (fe - fw), lo1 = fw + ((b + 1) / gc) * (fe - fw)
      ctx.fillRect(px(lo0), py(la1), px(lo1) - px(lo0) + 1, py(la0) - py(la1) + 1)
    }
  ctx.restore()
  return { url: c.toDataURL('image/png'), bounds: [[s, w], [n, e]] as Bounds }
}

/** NDVI raster for a given grid (values per cell) clipped to the field polygon, as an image overlay. */
export function ndviOverlayUrl(field: Field, poly: LatLng[], values: number[]) {
  const { rows, cols } = field.elevationGrid
  const c = document.createElement('canvas')
  c.width = cols * 8; c.height = rows * 8
  const ctx = c.getContext('2d')!
  const [[s, w], [n, e]] = boundsOf(poly, 0)
  ctx.save()
  ctx.beginPath()
  poly.forEach((p, i) => {
    const X = ((p[1] - w) / (e - w)) * c.width, Y = ((n - p[0]) / (n - s)) * c.height
    if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y)
  })
  ctx.closePath(); ctx.clip()
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const v = values[r * cols + k]
      if (v < 0) { ctx.fillStyle = 'rgba(255,255,255,.92)' } else { const [R, G, B] = ndviColor(v); ctx.fillStyle = `rgb(${R},${G},${B})` }
      ctx.fillRect(k * 8, (rows - 1 - r) * 8, 8, 8)
    }
  ctx.restore()
  return c.toDataURL('image/png')
}

export default function AgroMap({ fit, children, height = 420, onClick, backdrop, cursor = 'grab' }: {
  fit?: Bounds
  children?: ReactNode
  height?: number
  onClick?: (p: LatLng) => void
  backdrop?: { url: string; bounds: Bounds } | null
  cursor?: string
}) {
  const [tilesOk, setTilesOk] = useState(false)
  return (
    <div style={{ height, cursor }} className="w-full overflow-hidden rounded-[12px] border border-line [&_.leaflet-container]:!cursor-[inherit]">
      <MapContainer center={[-33.4, -57.6]} zoom={7} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer url={ESRI} attribution={ESRI_ATTR} maxZoom={18} eventHandlers={{ tileload: () => setTilesOk(true) }} />
        {backdrop && !tilesOk && <ImageOverlay url={backdrop.url} bounds={backdrop.bounds} />}
        {fit && <FitTo bounds={fit} />}
        {onClick && <ClickCatcher onClick={onClick} />}
        {children}
      </MapContainer>
    </div>
  )
}

export function useBackdrop(field: Field | null, poly: LatLng[] | undefined, monthIdx = 7) {
  return useMemo(() => (field && poly && poly.length >= 3 ? makeBackdrop(field, poly, monthIdx) : null), [field, poly, monthIdx])
}

export { CircleMarker, ImageOverlay, Polygon, Polyline, Tooltip }
