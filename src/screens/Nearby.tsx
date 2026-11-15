import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { Circle } from 'react-leaflet'
import { useApp } from '../store'
import AgroMap, { CircleMarker, Polygon, Tooltip } from '../components/FieldMap'
import { Conf, Loading, Src, Status, useMonth } from '../components/ui'
import { CROPS, CROP_COLOR, areaHa, centroid, parcelTerrain, type CropKey, type LatLng } from '../agro'
import { mean } from '../data'

const SEASON = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04']
const SOILS = ['10.2', '10.3', '11.3', '11.6', '03.2', '5.02b']
const CURVE: Record<string, number[]> = { // NDVI Nov..Apr in a normal year
  soybean: [0.3, 0.55, 0.78, 0.86, 0.72, 0.38], maize: [0.5, 0.75, 0.86, 0.72, 0.48, 0.3], sorghum: [0.28, 0.5, 0.74, 0.8, 0.66, 0.4], pasture: [0.62, 0.55, 0.5, 0.52, 0.6, 0.66],
}
const DROUGHT = [1, 0.85, 0.68, 0.7, 0.9, 1] // 2025-26 season shape

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }
function km(a: LatLng, b: LatLng) {
  const dy = (a[0] - b[0]) * 111.32, dx = (a[1] - b[1]) * 111.32 * Math.cos((a[0] * Math.PI) / 180)
  return Math.hypot(dx, dy)
}

export default function Nearby() {
  const { x, lang, client, field } = useApp()
  const mon = useMonth()
  const [radius, setRadius] = useState(30)
  const [sameCrop, setSameCrop] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  const data = useMemo(() => {
    if (!client || !field) return null
    const c = centroid(client.poly)
    const ter = client.parcels.map((p) => ({ ha: areaHa(p.poly), t: parcelTerrain(field, client.poly, p.poly), crop: p.plan.crop }))
    const haT = ter.reduce((a, b) => a + b.ha, 0) || 1
    const mySlope = ter.reduce((a, b) => a + b.t.slopePct * b.ha, 0) / haT
    const myCrop = [...ter].sort((a, b) => b.ha - a.ha)[0]?.crop ?? 'soybean'
    const mySoil = SOILS[0]
    const mySeries = SEASON.map((m) => { const r = field.monthly.find((z) => z.month === m); return r ? mean(r.ndvi) : 0.4 })
    const r = rng(client.id.length * 7919 + 17)
    const crops: CropKey[] = ['soybean', 'soybean', 'soybean', 'maize', 'maize', 'sorghum', 'pasture']
    const near = Array.from({ length: 150 }, (_, i) => {
      const ang = r() * Math.PI * 2, dist = Math.sqrt(r()) * 80
      const pos: LatLng = [c[0] + (Math.sin(ang) * dist) / 111.32, c[1] + (Math.cos(ang) * dist) / (111.32 * Math.cos((c[0] * Math.PI) / 180))]
      const crop = crops[Math.floor(r() * crops.length)]
      const slope = Math.round((0.5 + r() * 5.5) * 10) / 10
      const soil = SOILS[Math.floor(r() * SOILS.length)]
      const notill = r() > 0.25
      const cover = r() > 0.55
      // resilience: no-till and winter cover keep more water in the soil
      const resil = (notill ? 0.08 : 0) + (cover ? 0.1 : 0) - slope * 0.012
      const series = (CURVE[crop] ?? CURVE.soybean).map((v, k) => Math.max(0.08, Math.min(0.92, v * Math.min(1, DROUGHT[k] + (1 - DROUGHT[k]) * resil * 3) + (r() - 0.5) * 0.05)))
      const sim = Math.max(0, Math.min(100, Math.round(100 - Math.abs(slope - mySlope) * 9 - (soil === mySoil ? 0 : 14) - (crop === myCrop ? 0 : 8) - dist * 0.25)))
      const drop = Math.round((1 - series[2] / (CURVE[crop] ?? CURVE.soybean)[2]) * 100)
      return { id: i + 1, pos, dist: Math.round(dist * 10) / 10, ha: Math.round(40 + r() * 360), crop, slope, soil, notill, cover, series, sim, drop }
    })
    const myDrop = Math.round((1 - mySeries[2] / ((CURVE[myCrop] ?? CURVE.soybean)[2])) * 100)
    return { c, mySlope: Math.round(mySlope * 10) / 10, myCrop, mySoil, mySeries, near, myDrop }
  }, [client, field])

  if (!client || !field || !data) return <Loading />
  const cropName = (k: CropKey) => (lang === 'es' ? CROPS[k].es : CROPS[k].en)
  const list = data.near.filter((n) => n.dist <= radius && n.sim >= 55 && (!sameCrop || n.crop === data.myCrop)).sort((a, b) => b.sim - a.sim)
  const top = list.slice(0, 12)
  const cur = sel !== null ? list.find((n) => n.id === sel) ?? null : null
  const avg = SEASON.map((_, k) => (list.length ? mean(list.map((n) => n.series[k])) : 0))
  const chart = SEASON.map((m, k) => ({ m: mon(Number(m.slice(5))), mine: Math.round(data.mySeries[k] * 100) / 100, avg: Math.round(avg[k] * 100) / 100, sel: cur ? Math.round(cur.series[k] * 100) / 100 : undefined }))
  const coverShare = list.length ? Math.round((list.filter((n) => n.cover).length / list.length) * 100) : 0
  const notillShare = list.length ? Math.round((list.filter((n) => n.notill).length / list.length) * 100) : 0
  const avgDrop = list.length ? Math.round(mean(list.map((n) => n.drop))) : 0
  const withCover = list.filter((n) => n.cover), without = list.filter((n) => !n.cover)
  const dropCover = withCover.length ? Math.round(mean(withCover.map((n) => n.drop))) : 0
  const dropNo = without.length ? Math.round(mean(without.map((n) => n.drop))) : 0
  const cropMix = (['soybean', 'maize', 'sorghum', 'pasture'] as CropKey[]).map((k) => ({ k, n: list.filter((z) => z.crop === k).length }))
  const dLat = radius / 111.32, dLng = radius / (111.32 * Math.cos((data.c[0] * Math.PI) / 180))
  const fit: [[number, number], [number, number]] = [[data.c[0] - dLat, data.c[1] - dLng], [data.c[0] + dLat, data.c[1] + dLng]]

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-5">
        <p className="label">{x('Paso 3 · Seguimiento', 'Step 3 · Monitoring')}</p>
        <h1 className="font-title text-3xl font-extrabold">{x('Campos similares cercanos', 'Similar fields nearby')}</h1>
        <p className="mt-1 text-mute">{x('Campos de la zona con pendiente, suelo y cultivo parecidos. Cómo vienen esta zafra y qué hicieron los que mejor aguantaron la seca.', 'Fields in the area with similar slope, soil and crop. How they are doing this season and what the ones that coped best with the drought did.')}</p>
      </div>

      <section className="panel flex flex-wrap items-center gap-5 p-4">
        <label className="flex min-w-[280px] flex-1 flex-col gap-1 text-sm font-semibold">
          <span className="flex justify-between">{x('Buscar en un radio de', 'Search within')} <span className="font-title text-lg text-leaf num">{radius} km</span></span>
          <input type="range" min={5} max={80} step={5} value={radius} onChange={(e) => { setRadius(Number(e.target.value)); setSel(null) }} />
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sameCrop} onChange={(e) => setSameCrop(e.target.checked)} />{x(`Solo con ${cropName(data.myCrop).toLowerCase()} (tu cultivo principal)`, `Only ${cropName(data.myCrop).toLowerCase()} (your main crop)`)}</label>
        <div className="flex gap-4 text-sm">
          <div><p className="text-mute">{x('Tu pendiente', 'Your slope')}</p><b className="num">{data.mySlope}%</b></div>
          <div><p className="text-mute">{x('Tu suelo', 'Your soil')}</p><b>CONEAT {data.mySoil}</b></div>
          <div><p className="text-mute">{x('Similares', 'Similar')}</p><b className="num">{list.length}</b></div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <section className="panel p-3">
          <AgroMap fit={fit} height={460}>
            <Circle center={data.c} radius={radius * 1000} pathOptions={{ color: '#0E5A6B', weight: 2, dashArray: '6 6', fillColor: '#0E5A6B', fillOpacity: 0.05 }} />
            <Polygon positions={client.poly} pathOptions={{ color: '#17211C', weight: 3, fillColor: '#6CC4EE', fillOpacity: 0.9 }}>
              <Tooltip permanent direction="top">{x('Tu campo', 'Your field')}</Tooltip>
            </Polygon>
            <CircleMarker center={data.c} radius={7} pathOptions={{ color: '#17211C', weight: 2, fillColor: '#6CC4EE', fillOpacity: 1 }} />
            {list.map((n) => (
              <CircleMarker key={n.id} center={n.pos} radius={4 + (n.sim - 50) / 8} pathOptions={{ color: n.id === sel ? '#17211C' : '#fff', weight: n.id === sel ? 3 : 1.5, fillColor: CROP_COLOR[n.crop], fillOpacity: 0.9 }}
                eventHandlers={{ click: () => setSel(n.id) }}>
                <Tooltip>#{n.id} · {cropName(n.crop)} · {n.sim}% · {n.dist} km</Tooltip>
              </CircleMarker>
            ))}
          </AgroMap>
          <div className="mt-2 flex flex-wrap items-center gap-3 px-1 text-xs text-mute">
            {(['soybean', 'maize', 'sorghum', 'pasture'] as CropKey[]).map((k) => <span key={k} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CROP_COLOR[k] }} />{cropName(k)}</span>)}
            <span>· {x('tamaño = similitud', 'size = similarity')}</span>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="panel p-3"><p className="text-sm text-mute">{x('Caída de verdor en la seca (enero)', 'Greenness drop in the drought (January)')}</p><div className="mt-1 flex gap-4"><div><p className="font-title text-2xl font-bold text-warn num">−{data.myDrop}%</p><p className="text-xs text-mute">{x('tu campo', 'your field')}</p></div><div><p className="font-title text-2xl font-bold text-leaf num">−{avgDrop}%</p><p className="text-xs text-mute">{x('similares de la zona', 'similar fields nearby')}</p></div></div></div>
            <div className="panel p-3"><p className="text-sm text-mute">{x('Con cobertura invernal', 'With winter cover')}</p><p className="font-title text-2xl font-bold num">{coverShare}%</p><p className="text-xs text-mute">{x('siembra directa', 'no-till')}: {notillShare}%</p></div>
          </div>
          <div className="panel p-3">
            <p className="font-title font-bold">{x('Lo que aprendieron los vecinos', 'What neighbours learned')}</p>
            <p className="mt-1 text-sm">{x(`Los campos similares con cobertura invernal perdieron −${dropCover}% de verdor en la seca; los que dejaron el suelo desnudo, −${dropNo}%.`, `Similar fields with winter cover lost ${dropCover}% greenness in the drought; those with bare soil lost ${dropNo}%.`)}</p>
            <div className="mt-2 flex h-3 overflow-hidden rounded-full">
              {cropMix.filter((c) => c.n).map((c) => <div key={c.k} style={{ flex: c.n, background: CROP_COLOR[c.k] }} title={`${cropName(c.k)}: ${c.n}`} />)}
            </div>
            <p className="mt-1 text-xs text-mute">{cropMix.filter((c) => c.n).map((c) => `${cropName(c.k)} ${c.n}`).join(' · ')}</p>
          </div>
          <div className="panel p-3">
            <p className="font-title font-bold">{x('Verdor esta zafra', 'Greenness this season')}{cur ? ` · ${x('campo', 'field')} #${cur.id}` : ''}</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#E3ECEA" vertical={false} />
                  <XAxis dataKey="m" tick={{ fill: '#5C6B63', fontSize: 11 }} />
                  <YAxis domain={[0, 1]} tick={{ fill: '#5C6B63', fontSize: 11 }} />
                  <RTooltip contentStyle={{ borderRadius: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line dataKey="mine" name={x('Tu campo', 'Your field')} stroke="#B9770E" strokeWidth={3} dot={false} />
                  <Line dataKey="avg" name={x('Promedio similares', 'Similar average')} stroke="#2E7D4F" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  {cur && <Line dataKey="sel" name={`#${cur.id}`} stroke="#0E5A6B" strokeWidth={2} dot={false} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-1.5"><Src s="NASA HLS" /><Conf kind="observed" /></div>
          </div>
        </section>
      </div>

      <section className="panel mt-5 overflow-x-auto p-4">
        <h2 className="font-title text-lg font-bold">{x('Los más parecidos', 'Most similar')} ({top.length} {x('de', 'of')} {list.length})</h2>
        <table className="mt-2 w-full min-w-[760px] text-sm num">
          <thead className="text-left text-[11px] uppercase tracking-wider text-mute"><tr><th className="py-1">{x('Campo', 'Field')}</th><th className="text-right">{x('Distancia', 'Distance')}</th><th className="text-right">ha</th><th>{x('Cultivo', 'Crop')}</th><th>{x('Manejo', 'Management')}</th><th className="text-right">{x('Pend.', 'Slope')}</th><th>{x('Suelo', 'Soil')}</th><th className="text-right">{x('Caída en la seca', 'Drought drop')}</th><th className="text-right">{x('Similitud', 'Similarity')}</th></tr></thead>
          <tbody>
            {top.map((n) => (
              <tr key={n.id} onClick={() => setSel(n.id)} className={`cursor-pointer border-t border-line ${n.id === sel ? 'bg-tint' : 'hover:bg-bg'}`}>
                <td className="py-2 font-semibold">#{n.id}</td>
                <td className="text-right">{n.dist} km</td>
                <td className="text-right">{n.ha}</td>
                <td><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: CROP_COLOR[n.crop] }} />{cropName(n.crop)}</td>
                <td>{n.notill ? x('Directa', 'No-till') : x('Laboreo', 'Tillage')}{n.cover ? x(' + cobertura', ' + cover') : ''}</td>
                <td className="text-right">{n.slope}%</td>
                <td>{n.soil}</td>
                <td className="text-right"><Status tone={n.drop > data.myDrop ? 'warn' : 'good'}>−{n.drop}%</Status></td>
                <td className="text-right font-semibold text-leaf">{n.sim}%</td>
              </tr>
            ))}
            {!top.length && <tr><td colSpan={9} className="py-4 text-center text-mute">{x('No hay campos similares en este radio. Ampliá la búsqueda.', 'No similar fields within this radius. Widen the search.')}</td></tr>}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-mute">{x('Campos anónimos: no se muestra el dueño y la ubicación es aproximada. Datos de demostración; en la versión real salen de NASA HLS (verdor), SRTM (pendiente) y la carta CONEAT (suelo).', 'Anonymous fields: the owner is not shown and locations are approximate. Demo data; in the real version they come from NASA HLS (greenness), SRTM (slope) and the CONEAT map (soil).')}</p>
      </section>
    </div>
  )
}
