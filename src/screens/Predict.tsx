import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../store'
import { usePlans } from '../plans'
import { Conf, LEVEL_COLORS, Level, Loading, PageTitle, Src, Status, ymLabel, useMonth } from '../components/ui'
import { CROPS, CROP_COLOR, CROP_KEYS, SCENARIOS, SC_COLOR, TOLERANCE, score, simulate, type CropKey, type ParcelPlan, type PlanKind, type Prev, type Scenario } from '../agro'

type Metric = 'ndvi' | 'water' | 'erosion' | 'demand'

export default function Predict() {
  const { x, lang, client, field, sel, setSel, scenario, setScenario, go, activePlan, setActivePlan, setVariant, updateClient } = useApp()
  const [editOpen, setEditOpen] = useState(true)
  const [metric, setMetric] = useState<Metric>('ndvi')
  const mon = useMonth()
  const scName = (s: Scenario) => ({ dry: x('Año seco', 'Dry year'), normal: x('Año normal', 'Normal year'), wet: x('Año lluvioso', 'Wet year') }[s])
  const cropName = (k: CropKey) => (lang === 'es' ? CROPS[k].es : CROPS[k].en)

  const { base, edits, plansOf, evalPlan } = usePlans()
  const variants = useMemo(() => (['requested', 'recommended', 'balanced'] as PlanKind[]).map((k) => {
    const ev = evalPlan(plansOf(k))
    const ha = ev.reduce((a, e) => a + e.ha, 0) || 1
    const margin = Object.fromEntries(SCENARIOS.map((s) => [s, Math.round(ev.reduce((a, e) => a + e.sims[s].margin * e.ha, 0))])) as Record<Scenario, number>
    const ero = ev.reduce((a, e) => a + e.sims.normal.erosionYear * e.ha, 0) / ha
    const over = ev.filter((e) => e.sims.normal.erosionYear > TOLERANCE).length
    const robust = Math.round(ev.reduce((a, e) => a + Math.min(...SCENARIOS.map((s) => score(e.sims[s]))) * e.ha, 0) / ha)
    const water = Math.round((ev.reduce((a, e) => a + e.sims.dry.waterCovered * e.ha, 0) / ha) * 100)
    return { k, ev, margin, ero, over, robust, water }
  }), [client, field, base, edits])
  const all = variants.find((v) => v.k === activePlan)?.ev ?? []

  function editPlan(k: number, patch: Partial<ParcelPlan>) {
    if (!client) return
    const cur = plansOf(activePlan).map((p, j) => (j === k ? { ...p, ...patch } : p))
    if (activePlan === 'requested') updateClient({ ...client, parcels: client.parcels.map((p, j) => ({ ...p, plan: cur[j] })) })
    else setVariant(client.id, activePlan, cur)
  }

  if (!client || !field) return <Loading />
  if (!all.length) return <div className="mx-auto max-w-7xl px-4 py-10"><p>{x('Primero marcá al menos una parcela.', 'Draw at least one plot first.')}</p><button className="btn-primary mt-3" onClick={() => go('field')}>{x('Ir a Campo y parcelas', 'Go to Field and plots')}</button></div>

  const i = Math.min(sel, all.length - 1)
  const cur = all[i]
  const crop = CROPS[cur.p.plan.crop]
  const r = cur.sims[scenario]
  const chart = cur.sims.normal.months.map((m, k) => {
    const row: Record<string, number | string | boolean> = { ym: ymLabel(m.ym, lang), growing: m.growing }
    for (const s of SCENARIOS) {
      const mm = cur.sims[s].months[k]
      row[s] = metric === 'ndvi' ? mm.ndvi : metric === 'water' ? mm.soilWaterPct : metric === 'erosion' ? mm.erosionCum : mm.etc
    }
    row.rain = cur.sims[scenario].months[k].rain
    row.etc = cur.sims[scenario].months[k].etc
    return row
  })
  const growEnd = cur.sims.normal.months.findIndex((m) => !m.growing)
  const firstLabel = chart[0].ym as string
  const lastGrowLabel = chart[Math.max(0, (growEnd < 0 ? chart.length : growEnd) - 1)].ym as string
  const horizon12 = cur.sims[scenario].months.slice(0, 12)

  // alternatives sown in a window of +-1 month
  const alts = CROP_KEYS.filter((k) => CROPS[k].sow.some((m) => Math.min(Math.abs(m - cur.p.plan.sow), 12 - Math.abs(m - cur.p.plan.sow)) <= 1) || k === cur.p.plan.crop)
    .map((k) => {
      const plan = { ...cur.p.plan, crop: k, sow: CROPS[k].sow.includes(cur.p.plan.sow) ? cur.p.plan.sow : CROPS[k].sow[0] }
      const sc = Object.fromEntries(SCENARIOS.map((s) => [s, score(simulate(field, plan, cur.t.slopePct, s))])) as Record<Scenario, number>
      return { k, sc, worst: Math.min(...SCENARIOS.map((s) => sc[s])), mine: k === cur.p.plan.crop }
    })
    .sort((a, b) => b.worst - a.worst)

  const metricInfo: Record<Metric, { t: string; unit: string; src: string }> = {
    ndvi: { t: x('Verdor esperado (NDVI)', 'Expected greenness (NDVI)'), unit: '', src: 'HLS · GPM IMERG · NASA POWER' },
    water: { t: x('Agua disponible en el suelo', 'Plant-available soil water'), unit: '%', src: 'GPM IMERG · NASA POWER · SMAP' },
    erosion: { t: x('Suelo perdido acumulado', 'Cumulative soil loss'), unit: 't/ha', src: 'RUSLE · IMERG · SRTM' },
    demand: { t: x('Necesidad de agua del cultivo', 'Crop water demand'), unit: 'mm', src: 'NASA POWER (ET₀) · IMERG' },
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PageTitle step={x('Paso 2', 'Step 2')} title={x('Predicción por escenario', 'Prediction by scenario')} sub={x('Cómo le iría a cada parcela en un año seco, normal o lluvioso, con el clima histórico de NASA para este campo.', 'How each plot would do in a dry, normal or wet year, using NASA historical climate for this field.')} />

      {/* Plan cards */}
      <section className="mb-5">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-title text-xl font-bold">{x('Elegí un plan para el campo', 'Choose a plan for the field')}</h2>
          <span className="text-xs text-mute">{x('Totales del campo, en USD. Tocá una tarjeta para ver y ajustar ese plan.', 'Field totals in USD. Click a card to view and adjust that plan.')}</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {variants.map((v) => {
            const meta = {
              requested: { t: x('Plan solicitado', 'Requested plan'), d: x('Lo que cargaste en el paso 1.', 'What you entered in step 1.'), c: '#5C6B63' },
              recommended: { t: x('Plan recomendado', 'Recommended plan'), d: x('El más robusto: mejor resultado en el peor año. Siembra directa, secano.', 'The most robust: best result in the worst year. No-till, rainfed.'), c: '#2E7D4F' },
              balanced: { t: x('Alternativa balanceada', 'Balanced alternative'), d: x('Equilibra ingreso y cuidado del suelo, dentro de la tolerancia de erosión.', 'Balances income and soil care, within the erosion tolerance.'), c: '#0E5A6B' },
            }[v.k]
            const on = activePlan === v.k
            const edited = v.k !== 'requested' && !!edits[v.k]
            return (
              <button key={v.k} onClick={() => setActivePlan(v.k)} className={`panel flex flex-col gap-2 p-4 text-left transition ${on ? 'ring-2' : 'opacity-90 hover:opacity-100'}`} style={{ borderTop: `5px solid ${meta.c}`, ['--tw-ring-color' as string]: meta.c }}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-title text-lg font-bold" style={{ color: meta.c }}>{meta.t}</h3>
                  {on ? <Status tone="good">{x('Seleccionado', 'Selected')}</Status> : edited ? <span className="tag">{x('editado', 'edited')}</span> : null}
                </div>
                <p className="text-sm text-mute">{meta.d}</p>
                <div className="flex flex-wrap gap-1">
                  {v.ev.map((e, j) => <span key={j} className="chip !py-0.5 text-xs"><span className="h-2 w-2 rounded-full" style={{ background: CROP_COLOR[e.p.plan.crop] }} />{j + 1} · {cropName(e.p.plan.crop)}</span>)}
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                  {SCENARIOS.map((s) => <div key={s} className="rounded-lg bg-tint p-1.5"><p style={{ color: SC_COLOR[s] }} className="font-semibold">{scName(s).split(' ').pop()}</p><p className={`font-title text-sm font-bold num ${v.margin[s] < 0 ? 'text-crit' : ''}`}>{(v.margin[s] / 1000).toFixed(1)}k</p></div>)}
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                  <div className="rounded-lg bg-tint p-1.5"><p className="text-mute">{x('Suelo', 'Soil')}</p><p className="font-bold num" style={{ color: v.ero > TOLERANCE ? '#B23A2E' : '#2E7D4F' }}>{v.ero.toFixed(1)} t/ha</p></div>
                  <div className="rounded-lg bg-tint p-1.5"><p className="text-mute">{x('Agua (seco)', 'Water (dry)')}</p><p className="font-bold num">{v.water}%</p></div>
                  <div className="rounded-lg bg-tint p-1.5"><p className="text-mute">{x('Peor año', 'Worst year')}</p><p className="font-bold num">{v.robust}/100</p></div>
                </div>
                {v.over > 0 && <p className="text-xs font-semibold text-crit">{v.over} {x('parcela(s) sobre el límite de erosión', 'plot(s) above the erosion limit')}</p>}
              </button>
            )
          })}
        </div>

        {/* Editor of the selected plan */}
        <div className="panel mt-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-title text-lg font-bold">{x('Ajustar parámetros', 'Adjust parameters')} · {{ requested: x('plan solicitado', 'requested plan'), recommended: x('plan recomendado', 'recommended plan'), balanced: x('alternativa balanceada', 'balanced alternative') }[activePlan]}</h3>
            <div className="flex gap-2">
              {activePlan !== 'requested' && edits[activePlan] && <button className="btn" onClick={() => setVariant(client.id, activePlan, undefined)}>{x('Restaurar sugerencia', 'Restore suggestion')}</button>}
              <button className="btn" onClick={() => setEditOpen(!editOpen)}>{editOpen ? x('Ocultar', 'Hide') : x('Mostrar', 'Show')}</button>
            </div>
          </div>
          <p className="text-sm text-mute">{activePlan === 'requested' ? x('Los cambios acá también actualizan el paso 1.', 'Changes here also update step 1.') : x('Cambiá cualquier valor y todas las predicciones de abajo se recalculan al instante.', 'Change any value and every prediction below recalculates instantly.')}</p>
          {editOpen && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-mute"><tr><th className="py-1">{x('Parcela', 'Plot')}</th><th>{x('Cultivo', 'Crop')}</th><th>{x('Siembra', 'Sowing')}</th><th>{x('Antecesor', 'Previous')}</th><th>{x('Suelo', 'Tillage')}</th><th>{x('Riego', 'Irrigation')}</th><th className="text-right">{x('Margen normal', 'Normal margin')}</th><th className="text-right">{x('Erosión', 'Erosion')}</th></tr></thead>
                <tbody>
                  {all.map((e, j) => (
                    <tr key={j} className={`border-t border-line ${j === Math.min(sel, all.length - 1) ? 'bg-tint' : ''}`} onClick={() => setSel(j)}>
                      <td className="py-1.5 font-semibold">{j + 1} <span className="text-xs font-normal text-mute">{e.ha.toFixed(0)} ha · {e.t.slopePct}%</span></td>
                      <td><select value={e.p.plan.crop} onChange={(ev) => { const k = ev.target.value as CropKey; editPlan(j, { crop: k, sow: CROPS[k].sow[Math.floor((CROPS[k].sow.length - 1) / 2)] }) }}>{CROP_KEYS.map((k) => <option key={k} value={k}>{cropName(k)}</option>)}</select></td>
                      <td><select value={e.p.plan.sow} onChange={(ev) => editPlan(j, { sow: Number(ev.target.value) })}>{Array.from({ length: 12 }, (_, m) => m + 1).map((m) => <option key={m} value={m}>{mon(m)}{CROPS[e.p.plan.crop].sow.includes(m) ? '' : ' *'}</option>)}</select></td>
                      <td><select value={e.p.plan.prev} onChange={(ev) => editPlan(j, { prev: ev.target.value as Prev })}><option value="stubble">{x('Rastrojo', 'Stubble')}</option>{CROP_KEYS.map((k) => <option key={k} value={k}>{cropName(k)}</option>)}</select></td>
                      <td><select value={e.p.plan.tillage ? '1' : '0'} onChange={(ev) => editPlan(j, { tillage: ev.target.value === '1' })}><option value="0">{x('Directa', 'No-till')}</option><option value="1">{x('Laboreo', 'Tillage')}</option></select></td>
                      <td><select value={e.p.plan.irrigation ? '1' : '0'} onChange={(ev) => editPlan(j, { irrigation: ev.target.value === '1' })}><option value="0">{x('Secano', 'Rainfed')}</option><option value="1">{x('Riego', 'Irrigated')}</option></select></td>
                      <td className={`text-right num ${e.sims.normal.margin < 0 ? 'text-crit' : ''}`}>USD {e.sims.normal.margin}/ha</td>
                      <td className="text-right"><Status tone={e.sims.normal.erosionYear > TOLERANCE * 1.3 ? 'crit' : e.sims.normal.erosionYear > TOLERANCE ? 'warn' : 'good'}>{e.sims.normal.erosionYear.toFixed(1)}</Status></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-mute">{x('* fuera de la época habitual de siembra.', '* outside the usual sowing window.')}</p>
            </div>
          )}
        </div>
      </section>

      {/* Field summary table */}
      <section className="panel mb-5 overflow-x-auto p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-title text-lg font-bold">{x('Resumen del campo', 'Field summary')}</h2>
          <div className="flex gap-1.5"><Conf kind="modeled" /><Conf kind="assumed" /><span className="text-xs text-mute">{x('precios y costos de referencia', 'reference prices and costs')}</span></div>
        </div>
        <table className="w-full min-w-[760px] text-sm num">
          <thead className="text-left text-[11px] uppercase tracking-wider text-mute">
            <tr><th className="py-2">{x('Parcela', 'Plot')}</th><th>{x('Cultivo', 'Crop')}</th><th className="text-right">ha</th><th className="text-right">{x('Pend.', 'Slope')}</th>
              <th className="text-right">{x('Suelo t/ha·año', 'Soil t/ha·yr')}</th>
              {SCENARIOS.map((s) => <th key={s} className="text-right" style={{ color: SC_COLOR[s] }}>{x('Margen', 'Margin')} {scName(s).split(' ').pop()}</th>)}
            </tr>
          </thead>
          <tbody>
            {all.map((a, k) => {
              const ero = a.sims.normal.erosionYear
              return (
                <tr key={a.p.id} onClick={() => setSel(k)} className={`cursor-pointer border-t border-line ${k === i ? 'bg-tint' : 'hover:bg-bg'}`}>
                  <td className="py-2 font-semibold">{k + 1}</td>
                  <td><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: CROP_COLOR[a.p.plan.crop] }} />{cropName(a.p.plan.crop)} · {mon(a.p.plan.sow)}</td>
                  <td className="text-right">{a.ha.toFixed(1)}</td>
                  <td className="text-right">{a.t.slopePct}%</td>
                  <td className="text-right"><Status tone={ero > TOLERANCE * 1.3 ? 'crit' : ero > TOLERANCE ? 'warn' : 'good'}>{ero.toFixed(1)}</Status></td>
                  {SCENARIOS.map((s) => <td key={s} className={`text-right ${a.sims[s].margin < 0 ? 'text-crit' : ''}`}>USD {a.sims[s].margin}</td>)}
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-mute">{x(`Tolerancia de referencia: ${TOLERANCE} t/ha·año (el valor oficial depende de la unidad de suelo CONEAT). Tocá una fila para ver el detalle.`, `Reference tolerance: ${TOLERANCE} t/ha·yr (the official value depends on the CONEAT soil unit). Click a row for details.`)}</p>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {all.map((a, k) => (
          <button key={a.p.id} className={`chip ${k === i ? 'chip-on' : ''}`} onClick={() => setSel(k)}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CROP_COLOR[a.p.plan.crop] }} />{x('Parcela', 'Plot')} {k + 1} · {cropName(a.p.plan.crop)}
          </button>
        ))}
      </div>
      <h2 className="mb-3 font-title text-2xl font-extrabold">{x('Parcela', 'Plot')} {i + 1}: {cropName(cur.p.plan.crop).toLowerCase()} {x('sembrada en', 'sown in')} {mon(cur.p.plan.sow).toLowerCase()} · {cur.ha.toFixed(1)} ha · {x('pendiente', 'slope')} {cur.t.slopePct}%</h2>
      {r.outOfSeason && <p className="mb-3 rounded-lg border-l-4 border-warn bg-tint p-2 text-sm">{x('Siembra fuera de la época habitual: el rinde se castiga 25%.', 'Off-season sowing: yield is penalised 25%.')}</p>}

      {/* Scenario cards */}
      <section className="grid gap-4 md:grid-cols-3">
        {SCENARIOS.map((s) => {
          const q = cur.sims[s]
          const ex = q.erosionYear / TOLERANCE
          return (
            <button key={s} onClick={() => setScenario(s)} className={`panel flex flex-col gap-2 p-4 text-left transition ${scenario === s ? 'ring-2' : ''}`} style={{ borderTop: `5px solid ${SC_COLOR[s]}`, ['--tw-ring-color' as string]: SC_COLOR[s] }}>
              <div className="flex items-center justify-between"><h3 className="font-title text-lg font-bold" style={{ color: SC_COLOR[s] }}>{scName(s)}</h3><span className="text-xs text-mute">{x('lluvia', 'rain')} ×{s === 'dry' ? '0.6' : s === 'wet' ? '1.35' : '1'}</span></div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><p className="text-mute">{x('Rinde', 'Yield')}</p><p className="font-title text-2xl font-bold num">{q.yieldT !== undefined ? `${q.yieldT} t/ha` : `${Math.round(q.yieldPct * 100)}%`}</p><p className="text-xs text-mute">{Math.round(q.yieldPct * 100)}% {x('del potencial', 'of potential')}</p></div>
                <div><p className="text-mute">{x('Margen', 'Margin')}</p><p className={`font-title text-2xl font-bold num ${q.margin < 0 ? 'text-crit' : ''}`}>USD {q.margin}</p><p className="text-xs text-mute">{x('por ha', 'per ha')} · USD {(q.margin * cur.ha).toLocaleString('es-UY', { maximumFractionDigits: 0 })} {x('total', 'total')}</p></div>
                <div><p className="text-mute">{x('Agua cubierta', 'Water covered')}</p><p className="font-title text-xl font-bold num">{Math.round(q.waterCovered * 100)}%</p><p className="text-xs text-mute">{q.waterNeed} mm {x('pide', 'needed')} · {q.waterRain} mm {x('llueve', 'rain')}</p></div>
                <div><p className="text-mute">{x('Suelo perdido', 'Soil loss')}</p><p className="font-title text-xl font-bold num" style={{ color: ex > 1.3 ? '#B23A2E' : ex > 1 ? '#B9770E' : '#2E7D4F' }}>{q.erosionYear} t/ha</p><p className="text-xs text-mute">{ex > 1 ? x(`${ex.toFixed(1)} veces lo tolerable`, `${ex.toFixed(1)}× tolerable`) : x('dentro de lo tolerable', 'within tolerance')}</p></div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs"><span className="text-mute">{x('Plaga principal', 'Main pest')}:</span><b>{q.pests[0]?.name.split('|')[lang === 'es' ? 0 : 1]}</b><Level n={Math.max(0, (q.pests[0]?.peak ?? 1) - 1)} /></div>
            </button>
          )
        })}
      </section>

      {/* Timeline */}
      <section className="panel mt-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-title text-lg font-bold">{x('Línea de tiempo', 'Timeline')} · {metricInfo[metric].t}</h2>
          <div className="seg" role="group">
            {(['ndvi', 'water', 'erosion', 'demand'] as Metric[]).map((m) => <button key={m} aria-pressed={metric === m} onClick={() => setMetric(m)}>{{ ndvi: x('Verdor', 'Greenness'), water: x('Agua del suelo', 'Soil water'), erosion: x('Erosión', 'Erosion'), demand: x('Necesidad vs lluvia', 'Demand vs rain') }[m]}</button>)}
          </div>
        </div>
        <div className="mt-3 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#E3ECEA" vertical={false} />
              <XAxis dataKey="ym" tick={{ fill: '#5C6B63', fontSize: 11 }} interval={1} />
              <YAxis tick={{ fill: '#5C6B63', fontSize: 11 }} width={44} domain={metric === 'ndvi' ? [0, 1] : metric === 'water' ? [0, 100] : ['auto', 'auto']} unit={metricInfo[metric].unit === '%' ? '%' : ''} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #D5DCD3' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceArea x1={firstLabel} x2={lastGrowLabel} fill="#2E7D4F" fillOpacity={0.07} label={{ value: x('ciclo del cultivo', 'crop cycle'), position: 'insideTopLeft', fill: '#2E7D4F', fontSize: 11 }} />
              {metric === 'erosion' && <ReferenceLine y={TOLERANCE} stroke="#B23A2E" strokeDasharray="5 4" label={{ value: x('tolerable / año', 'tolerable / yr'), fill: '#B23A2E', fontSize: 11, position: 'insideTopRight' }} />}
              {metric === 'demand' ? (<>
                <Bar dataKey="rain" name={x(`Lluvia (${scName(scenario).toLowerCase()})`, `Rain (${scName(scenario).toLowerCase()})`)} fill="#0E5A6B" fillOpacity={0.55} radius={[3, 3, 0, 0]} />
                <Bar dataKey="etc" name={x('Necesidad del cultivo (ETc)', 'Crop demand (ETc)')} fill="#B9770E" fillOpacity={0.75} radius={[3, 3, 0, 0]} />
              </>) : SCENARIOS.map((s) => (
                <Line key={s} dataKey={s} name={scName(s)} stroke={SC_COLOR[s]} strokeWidth={s === scenario ? 3.5 : 2} strokeOpacity={s === scenario ? 1 : 0.55} dot={false} type="monotone" />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mute"><Src s={metricInfo[metric].src} /><Conf kind="modeled" /><span>{x('Tocá una tarjeta de escenario para resaltarlo.', 'Click a scenario card to highlight it.')}</span></div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Water needs */}
        <section className="panel p-4">
          <h2 className="font-title text-lg font-bold">{x('Necesidad de agua', 'Water needs')}</h2>
          <p className="text-sm text-mute">{x('Lo que pide el cultivo en todo el ciclo contra lo que llueve y queda en el suelo.', 'What the crop needs over its cycle vs. rain and stored soil water.')}</p>
          <div className="mt-3 flex flex-col gap-3">
            {SCENARIOS.map((s) => {
              const q = cur.sims[s]
              const max = Math.max(...SCENARIOS.map((z) => Math.max(cur.sims[z].waterNeed, cur.sims[z].waterRain))) * 1.05
              return (
                <div key={s}>
                  <div className="flex justify-between text-sm"><b style={{ color: SC_COLOR[s] }}>{scName(s)}</b><span className="num">{Math.round(q.waterCovered * 100)}% {x('cubierto', 'covered')}</span></div>
                  <div className="relative mt-1 h-3 rounded bg-tint"><div className="absolute inset-y-0 left-0 rounded bg-[#B9770E]/80" style={{ width: `${(q.waterNeed / max) * 100}%` }} /></div>
                  <div className="relative mt-1 h-3 rounded bg-tint"><div className="absolute inset-y-0 left-0 rounded" style={{ width: `${(q.waterRain / max) * 100}%`, background: '#0E5A6B' }} /></div>
                  <p className="mt-0.5 text-xs text-mute num">{x('Pide', 'Needs')} {q.waterNeed} mm · {x('llueve', 'rain')} {q.waterRain} mm · {x('faltante', 'shortfall')} {Math.max(0, Math.round((1 - q.waterCovered) * q.waterNeed))} mm</p>
                </div>
              )
            })}
          </div>
          <p className="mt-3 rounded-lg bg-tint p-2 text-sm">
            {cur.sims.dry.waterCovered < 0.7
              ? x(`En un año seco le falta ${Math.round((1 - cur.sims.dry.waterCovered) * 100)}% del agua. Opciones: adelantar la siembra, un cultivo más tolerante (sorgo) o riego suplementario si hay agua disponible.`, `In a dry year it lacks ${Math.round((1 - cur.sims.dry.waterCovered) * 100)}% of its water. Options: sow earlier, a more tolerant crop (sorghum) or supplementary irrigation if water is available.`)
              : x('El agua alcanza razonablemente en los tres escenarios.', 'Water is reasonably sufficient in all three scenarios.')}
          </p>
          <div className="mt-2 flex gap-1.5"><Src s="NASA POWER" /><Src s="GPM IMERG" /><Conf kind="modeled" /><Conf kind="assumed" /></div>
        </section>

        {/* Pests */}
        <section className="panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-title text-lg font-bold">{x('Plagas y enfermedades probables', 'Likely pests and diseases')}</h2>
            <div className="seg">{SCENARIOS.map((s) => <button key={s} aria-pressed={scenario === s} onClick={() => setScenario(s)}>{scName(s).split(' ').pop()}</button>)}</div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead><tr><th className="w-40 text-left font-normal text-mute" />{horizon12.map((m) => <th key={m.ym} className="font-normal text-mute">{mon(m.label).slice(0, 3)}</th>)}</tr></thead>
              <tbody>
                {crop.pests.map((p, j) => (
                  <tr key={p.en}>
                    <td className="py-1 pr-2 text-sm font-medium">{lang === 'es' ? p.es : p.en}<br /><span className="text-[11px] text-mute">{{ heat: x('con calor', 'with heat'), humid: x('con humedad', 'with humidity'), dry: x('con sequía', 'with drought') }[p.cond]}{r.repeatsFamily ? x(' · antecesor de la misma familia', ' · same-family previous crop') : ''}</span></td>
                    {horizon12.map((m) => <td key={m.ym} className="p-[2px]"><div className="h-6 rounded" style={{ background: m.pests[j] ? LEVEL_COLORS[m.pests[j] - 1] : '#E3ECEA', opacity: m.pests[j] ? 0.55 + 0.15 * m.pests[j] : 1 }} title={`${m.pests[j]}`} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-mute">
            {[1, 2, 3].map((n) => <span key={n} className="flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: LEVEL_COLORS[n - 1], opacity: 0.55 + 0.15 * n }} />{[x('Bajo', 'Low'), x('Medio', 'Medium'), x('Alto', 'High'), x('Muy alto', 'Very high')][n - 1]}</span>)}
            <Src s="NASA POWER · IMERG" /><Conf kind="modeled" />
          </div>
          <p className="mt-2 text-xs text-mute">{x('Riesgo según condiciones de clima favorables, no detección de la plaga: confirmar con monitoreo en el campo.', 'Risk from favourable weather conditions, not pest detection: confirm with field scouting.')}</p>
        </section>
      </div>

      {/* Alternatives */}
      <section className="panel mt-5 p-4">
        <h2 className="font-title text-lg font-bold">{x('Qué conviene sembrar en esta parcela', 'What to sow in this plot')}</h2>
        <p className="text-sm text-mute">{x('Ordenado por el peor escenario: la opción más robusta queda primero.', 'Ranked by the worst scenario: the most robust option comes first.')}</p>
        <div className="mt-3 grid gap-2">
          {alts.map((a, k) => (
            <div key={a.k} className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${a.mine ? 'border-leaf bg-tint' : 'border-line'}`}>
              <span className="w-6 font-title text-xl font-bold text-leaf">{k + 1}</span>
              <span className="h-3 w-3 rounded-full" style={{ background: CROP_COLOR[a.k] }} />
              <b className="min-w-[140px]">{cropName(a.k)}{a.mine ? x(' (tu plan)', ' (your plan)') : ''}</b>
              {SCENARIOS.map((s) => <span key={s} className="num text-sm"><span style={{ color: SC_COLOR[s] }}>●</span> {scName(s).split(' ').pop()}: <b>{a.sc[s]}</b></span>)}
              <span className="ml-auto text-sm text-mute num">{x('peor caso', 'worst case')}: <b className="text-ink">{a.worst}/100</b></span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5"><Conf kind="modeled" /><span className="text-xs text-mute">{x('Puntaje: 35% suelo, 25% margen, 20% agua, 20% plagas.', 'Score: 35% soil, 25% margin, 20% water, 20% pests.')}</span></div>
      </section>
    </div>
  )
}
