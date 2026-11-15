import { useMemo, useState } from 'react'
import { useApp, type MonPlan } from '../store'
import AgroMap, { ImageOverlay, Polygon, Tooltip, boundsOf, ndviOverlayUrl, useBackdrop } from '../components/FieldMap'
import { Conf, Loading, PageTitle, Src, Status, useMonth } from '../components/ui'
import { CROPS, CROP_COLOR, cellsIn, fieldLatLngs, simulate, parcelTerrain, type CropKey } from '../agro'
import type { Field } from '../types'
import { PRICE, STEP } from '../pricing'
import Nearby from './Nearby'

const SEASON_START = Date.UTC(2025, 10, 1) // 1 Nov 2025
const SEASON_END = Date.UTC(2026, 3, 30) // 30 Apr 2026
const DAY = 86400000

function hash(s: string) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296 }
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10)

/** NDVI per cell on a given day, interpolated between the monthly NASA HLS composites. */
function ndviOn(field: Field, t: number) {
  const ms = field.monthly
  const mid = ms.map((m) => Date.UTC(Number(m.month.slice(0, 4)), Number(m.month.slice(5)) - 1, 15))
  let k = mid.findIndex((x) => x > t)
  if (k <= 0) k = k === 0 ? 1 : ms.length - 1
  const a = ms[k - 1].ndvi, b = ms[k].ndvi
  const f = Math.max(0, Math.min(1, (t - mid[k - 1]) / (mid[k] - mid[k - 1])))
  return a.map((v, i) => v + (b[i] - v) * f)
}

function MonitorMine() {
  const { x, lang, client, field, updateClient } = useApp()
  const mon = useMonth()
  const plan = client?.monPlan ?? 'weekly'
  const [capIdx, setCapIdx] = useState<number | null>(null)
  const backdrop = useBackdrop(field, field ? fieldLatLngs(field) : undefined, 15)

  const model = useMemo(() => {
    if (!client || !field) return null
    const parcels = client.parcels.map((p) => {
      const cells = cellsIn(field, client.poly, p.poly)
      const t = parcelTerrain(field, client.poly, p.poly)
      const sim = simulate(field, p.plan, t.slopePct, 'normal', 18)
      // expected NDVI for a calendar month = plan's normal-year curve
      const expByMonth: Record<number, number> = {}
      sim.months.forEach((m) => { if (expByMonth[m.label] === undefined) expByMonth[m.label] = m.ndvi })
      return { p, cells, expByMonth }
    })
    const obsParcel = (vals: number[], cells: number[]) => cells.length ? cells.reduce((s, i) => s + vals[i], 0) / cells.length : 0
    // Expected = what this plot looked like on the same date of the previous (normal) season
    const expAt = (t: number, cells: number[]) => obsParcel(ndviOn(field, t - 365 * DAY), cells)
    // truth: first day a plot falls well below its plan
    let eventDay: number | null = null, eventPlot = -1
    for (let t = SEASON_START + 20 * DAY; t <= SEASON_END && eventDay === null; t += DAY) {
      const v = ndviOn(field, t)
      parcels.forEach((pp, i) => { if (eventDay === null && obsParcel(v, pp.cells) < expAt(t, pp.cells) - 0.12) { eventDay = t; eventPlot = i } })
    }
    const plans = (['monthly', 'biweekly', 'weekly'] as MonPlan[]).map((pl) => {
      const caps: { t: number; cloudy: boolean }[] = []
      for (let t = SEASON_START + 3 * DAY; t <= SEASON_END; t += STEP[pl] * DAY) caps.push({ t, cloudy: hash(field.id + isoDay(t)) < 0.27 })
      const usable = caps.filter((c) => !c.cloudy)
      let gap = 0, last = SEASON_START
      for (const c of usable) { gap = Math.max(gap, c.t - last); last = c.t }
      gap = Math.max(gap, SEASON_END - last)
      const det = eventDay !== null ? usable.find((c) => c.t >= eventDay!) : undefined
      return { pl, caps, usable: usable.length, maxGapDays: Math.round(gap / DAY), detect: det?.t ?? null, delay: det && eventDay !== null ? Math.round((det.t - eventDay) / DAY) : null }
    })
    return { parcels, obsParcel, expAt, eventDay, eventPlot, plans }
  }, [client, field])

  if (!client || !field || !model) return <Loading />
  const cur = model.plans.find((p) => p.pl === plan)!
  const defIdx = Math.max(0, cur.caps.findIndex((c) => c.t >= (cur.detect ?? Date.UTC(2026, 0, 20))))
  const ci = Math.min(capIdx ?? defIdx, cur.caps.length - 1)
  const cap = cur.caps[ci]
  const vals = cap.cloudy ? new Array(field.elevationGrid.rows * field.elevationGrid.cols).fill(-1) : ndviOn(field, cap.t)
  const overlay = ndviOverlayUrl(field, client.poly, vals)
  const fmt = (t: number) => new Date(t).toLocaleDateString(lang === 'es' ? 'es-UY' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const planName = (p: MonPlan) => ({ weekly: x('Semanal', 'Weekly'), biweekly: x('Quincenal', 'Biweekly'), monthly: x('Mensual', 'Monthly') }[p])
  const cropName = (k: CropKey) => (lang === 'es' ? CROPS[k].es : CROPS[k].en)
  const rows = model.parcels.map((pp, i) => {
    const exp = model.expAt(cap.t, pp.cells)
    const obs = cap.cloudy ? null : model.obsParcel(vals, pp.cells)
    const series = cur.caps.map((c) => ({ e: model.expAt(c.t, pp.cells), plan: pp.expByMonth[new Date(c.t).getUTCMonth() + 1] ?? 0.2, o: c.cloudy ? null : model.obsParcel(ndviOn(field, c.t), pp.cells), cloudy: c.cloudy }))
    const consistent = series.filter((s) => s.o !== null && (s.plan > 0.3) === (s.o! > 0.3)).length / Math.max(1, series.filter((s) => s.o !== null).length)
    return { i, pp, exp, obs, dev: obs !== null && obs < exp - 0.12, series, consistent }
  })
  const alerts = cur.caps.flatMap((c, k) => {
    const out: { t: number; tone: 'warn' | 'crit' | 'good'; txt: string }[] = []
    if (c.cloudy) {
      const prev = cur.caps.slice(0, k).reverse().find((z) => !z.cloudy)
      const gap = prev ? Math.round((c.t - prev.t) / DAY) + STEP[plan] : STEP[plan]
      if (gap >= 20) out.push({ t: c.t, tone: 'warn', txt: x(`Nublado: ${gap} días sin imagen útil del campo.`, `Cloudy: ${gap} days without a usable image.`) })
    }
    return out
  })
  if (cur.detect && model.eventPlot >= 0) alerts.push({ t: cur.detect, tone: 'crit', txt: x(`Parcela ${model.eventPlot + 1}: menos verde que lo normal para esta fecha. Puede ser déficit hídrico, siembra atrasada o una plaga: conviene recorrerla.`, `Plot ${model.eventPlot + 1}: less green than normal for this date. Could be water deficit, late sowing or a pest: scout it.`) })
  alerts.sort((a, b) => (a.tone === 'crit' ? -1 : 0) - (b.tone === 'crit' ? -1 : 0) || b.t - a.t)

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PageTitle step={x('Paso 3', 'Step 3')} title={x('Seguimiento satelital', 'Satellite monitoring')} sub={x('Zafra de verano 2025-26. Cada captura compara lo que ve el satélite con lo que esperaba el plan.', 'Summer season 2025-26. Each capture compares what the satellite sees with what the plan expected.')} />

      {/* Plans */}
      <section className="grid gap-4 md:grid-cols-3">
        {model.plans.map((p) => (
          <button key={p.pl} onClick={() => { updateClient({ ...client, monPlan: p.pl }); setCapIdx(null) }} className={`panel flex flex-col gap-2 p-4 text-left ${plan === p.pl ? 'ring-2 ring-leaf' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div><p className="label">{x('Plan', 'Plan')}</p><h3 className="font-title text-xl font-bold">{planName(p.pl)}</h3></div>
              <div className="text-right"><p className="font-title text-xl font-bold num">{PRICE[p.pl]}</p><p className="text-xs text-mute">{x('por campo / mes', 'per field / month')}</p></div>
            </div>
            <p className="text-sm text-mute">{x(`1 imagen cada ${STEP[p.pl]} días`, `1 image every ${STEP[p.pl]} days`)}</p>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg bg-tint p-2"><p className="font-title text-lg font-bold num">{p.usable}/{p.caps.length}</p><p className="text-[11px] text-mute">{x('imágenes útiles', 'usable images')}</p></div>
              <div className="rounded-lg bg-tint p-2"><p className="font-title text-lg font-bold num">{p.maxGapDays} d</p><p className="text-[11px] text-mute">{x('mayor hueco', 'longest gap')}</p></div>
              <div className="rounded-lg bg-tint p-2"><p className="font-title text-lg font-bold num" style={{ color: p.delay !== null && p.delay > 14 ? '#B23A2E' : '#2E7D4F' }}>{p.delay !== null ? `+${p.delay} d` : '—'}</p><p className="text-[11px] text-mute">{x('detecta el desvío', 'detects the issue')}</p></div>
            </div>
            {plan === p.pl && <Status tone="good">{x('Plan activo', 'Active plan')}</Status>}
          </button>
        ))}
      </section>
      <p className="mt-2 text-xs text-mute">{x('Precios tentativos, a validar. Las imágenes vienen de NASA HLS (Landsat + Sentinel-2), que pasa cada 2-3 días: la frecuencia del plan define cada cuánto se analiza y se avisa.', 'Tentative prices. Images come from NASA HLS (Landsat + Sentinel-2), which revisits every 2-3 days: the plan sets how often the field is analysed and alerts are sent.')}</p>

      {/* Detection comparison */}
      {model.eventDay !== null && (
        <section className="panel mt-5 p-4">
          <h2 className="font-title text-lg font-bold">{x('¿Cuándo te enterás?', 'When do you find out?')}</h2>
          <p className="text-sm text-mute">{x(`La parcela ${model.eventPlot + 1} empezó a quedar por debajo de lo normal el ${fmt(model.eventDay)}.  Cada plan lo detecta en un momento distinto:`, `Plot ${model.eventPlot + 1} started falling below normal on ${fmt(model.eventDay)}.  Each plan detects it at a different time:`)}</p>
          <div className="relative mt-4 h-24">
            <div className="absolute left-0 right-0 top-7 h-1 rounded bg-line" />
            {(() => {
              const span = 70 * DAY, t0 = model.eventDay! - 8 * DAY
              const pos = (t: number) => `${Math.max(0, Math.min(100, ((t - t0) / span) * 100))}%`
              return (<>
                <div className="absolute top-3 -translate-x-1/2 text-center" style={{ left: pos(model.eventDay!) }}><div className="mx-auto h-9 w-1 rounded bg-crit" /><p className="whitespace-nowrap text-[11px] font-semibold text-crit">{x('empieza', 'starts')} {fmt(model.eventDay!)}</p></div>
                {model.plans.map((p, k) => p.detect && (
                  <div key={p.pl} className="absolute -translate-x-1/2 text-center" style={{ left: pos(p.detect), top: 16 + k * 0 }}>
                    <div className="mx-auto h-6 w-6 rounded-full border-2 border-white shadow" style={{ background: plan === p.pl ? '#2E7D4F' : '#5C6B63' }} />
                    <p className="whitespace-nowrap text-[11px] font-semibold" style={{ marginTop: k * 14 }}>{planName(p.pl)} +{p.delay}d</p>
                  </div>
                ))}
              </>)
            })()}
          </div>
        </section>
      )}

      {/* Capture timeline */}
      <section className="panel mt-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-title text-lg font-bold">{x('Capturas del plan', 'Plan captures')} {planName(plan).toLowerCase()} · {cur.caps.length}</h2>
          <span className="text-xs text-mute">{x('Tocá una captura', 'Click a capture')}</span>
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
          {cur.caps.map((c, k) => (
            <button key={c.t} onClick={() => setCapIdx(k)} title={fmt(c.t)} className={`flex min-w-[46px] flex-col items-center rounded-lg border px-1 py-1.5 text-[11px] ${k === ci ? 'border-ink bg-ink text-bg' : 'border-line bg-white'}`}>
              <span className="text-base leading-none">{c.cloudy ? '☁' : '🛰'}</span>
              <span className="num">{fmt(c.t)}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <section className="panel p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="font-title text-lg font-bold">{x('Captura del', 'Capture of')} {fmt(cap.t)}{cap.cloudy ? x(' · nublado', ' · cloudy') : ''}</h2>
            <div className="flex gap-1.5"><Src s="NASA HLS" /><Conf kind="observed" /></div>
          </div>
          <AgroMap fit={boundsOf(client.poly, 0.12)} height={420} backdrop={backdrop}>
            <ImageOverlay url={overlay} bounds={boundsOf(client.poly, 0)} opacity={0.95} />
            {rows.map((r) => (
              <Polygon key={r.pp.p.id} positions={r.pp.p.poly} pathOptions={{ color: r.dev ? '#B23A2E' : '#fff', weight: r.dev ? 4 : 2, fillOpacity: 0 }}>
                <Tooltip permanent direction="center">{r.i + 1}{r.dev ? ' ⚠' : ''}</Tooltip>
              </Polygon>
            ))}
          </AgroMap>
          <div className="mt-2 flex items-center gap-2 px-1 text-xs text-mute">
            <span>{x('Verdor bajo', 'Low greenness')}</span><div className="h-2.5 flex-1 rounded" style={{ background: 'linear-gradient(90deg,#8B5A2B,#E6C84F,#2E8B57)' }} /><span>{x('alto', 'high')}</span>
          </div>
          {cap.cloudy && <p className="mt-2 rounded-lg bg-tint p-2 text-sm">{x('Ese día las nubes taparon el campo. Se usa la siguiente captura útil.', 'Clouds covered the field that day. The next usable capture is used.')}</p>}
        </section>

        <section className="panel p-4">
          <h2 className="font-title text-lg font-bold">{x('Parcela por parcela', 'Plot by plot')}</h2>
          <table className="mt-2 w-full text-sm num">
            <thead className="text-left text-[11px] uppercase tracking-wider text-mute"><tr><th className="py-1">#</th><th>{x('Plan', 'Plan')}</th><th className="text-right">{x('Esperado', 'Expected')}</th><th className="text-right">{x('Visto', 'Seen')}</th><th>{x('Evolución', 'Trend')}</th><th>{x('Estado', 'Status')}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.pp.p.id} className="border-t border-line">
                  <td className="py-2 font-semibold">{r.i + 1}</td>
                  <td><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: CROP_COLOR[r.pp.p.plan.crop] }} />{cropName(r.pp.p.plan.crop)}</td>
                  <td className="text-right">{r.exp.toFixed(2)}</td>
                  <td className="text-right">{r.obs === null ? '☁' : r.obs.toFixed(2)}</td>
                  <td><Spark series={r.series} at={ci} /></td>
                  <td>{r.obs === null ? <span className="text-xs text-mute">{x('sin dato', 'no data')}</span> : r.dev ? <Status tone="warn">{x('Desvío', 'Deviation')}</Status> : <Status tone="good">{x('En plan', 'On plan')}</Status>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-mute">{x('Esperado: verdor de la misma parcela en la misma fecha de la temporada anterior (año normal). Visto: promedio NDVI de NASA HLS dentro de la parcela.', 'Expected: greenness of the same plot on the same date last season (normal year). Seen: mean NASA HLS NDVI inside the plot.')}</p>
          <h3 className="mt-4 font-title font-bold">{x('Coincidencia con el plan declarado (cultivo sí / no, temporada)', 'Match with the declared plan (crop yes / no, season)')}</h3>
          <div className="mt-1 flex flex-wrap gap-2">
            {rows.map((r) => <span key={r.i} className="rounded-full bg-tint px-3 py-1 text-sm num">{x('Parcela', 'Plot')} {r.i + 1}: <b>{Math.round(r.consistent * 100)}%</b></span>)}
          </div>
          <h3 className="mt-4 font-title font-bold">{x('Avisos', 'Alerts')}</h3>
          <ul className="mt-1 flex flex-col gap-2">
            {alerts.length === 0 && <li className="text-sm text-mute">{x('Sin avisos en esta temporada.', 'No alerts this season.')}</li>}
            {alerts.slice(0, 5).map((a, k) => (
              <li key={k} className="rounded-lg border-l-4 bg-bg p-2 text-sm" style={{ borderColor: a.tone === 'crit' ? '#B23A2E' : '#B9770E' }}>
                <span className="text-xs text-mute num">{fmt(a.t)} · {mon(new Date(a.t).getUTCMonth() + 1)}</span><br />{a.txt}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Spark({ series, at }: { series: { e: number; o: number | null }[]; at: number }) {
  const W = 92, H = 28, n = series.length
  const X = (k: number) => 3 + (k / Math.max(1, n - 1)) * (W - 6)
  const Y = (v: number) => H - 3 - v * (H - 6)
  const e = series.map((s, k) => `${X(k)},${Y(s.e)}`).join(' ')
  const o = series.map((s, k) => (s.o === null ? null : `${X(k)},${Y(s.o)}`)).filter(Boolean).join(' ')
  const cur = series[at]
  return (
    <svg width={W} height={H} role="img" aria-label="Expected vs observed greenness">
      <polyline points={e} fill="none" stroke="#5C6B63" strokeWidth="1.4" strokeDasharray="3 2" />
      <polyline points={o} fill="none" stroke="#2E7D4F" strokeWidth="2" />
      {cur?.o !== null && cur && <circle cx={X(at)} cy={Y(cur.o!)} r="3" fill="#2E7D4F" />}
    </svg>
  )
}

export default function Monitor() {
  const { x } = useApp()
  const [tab, setTab] = useState<'mine' | 'near'>('mine')
  return (
    <>
      <div className="mx-auto max-w-7xl px-4 pt-6">
        <div className="seg" role="tablist">
          <button role="tab" aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>🛰 {x('Mi campo', 'My field')}</button>
          <button role="tab" aria-pressed={tab === 'near'} onClick={() => setTab('near')}>📍 {x('Campos similares cercanos', 'Similar fields nearby')}</button>
        </div>
      </div>
      {tab === 'mine' ? <MonitorMine /> : <Nearby />}
    </>
  )
}
