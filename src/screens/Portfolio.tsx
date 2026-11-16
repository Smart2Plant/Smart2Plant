import { useMemo } from 'react'
import { useApp } from '../store'
import { Loading, PageTitle, Status } from '../components/ui'
import { CROPS, CROP_COLOR, TOLERANCE, areaHa, parcelTerrain, simulate } from '../agro'
import AlertsButton from '../components/AlertsButton'

export default function Portfolio() {
  const { x, lang, clients, fields, setClientId, go } = useApp()
  const rows = useMemo(() => clients.map((c) => {
    const f = fields[c.fieldId]
    const sims = c.parcels.map((p) => {
      const t = parcelTerrain(f, c.poly, p.poly)
      return { p, dry: simulate(f, p.plan, t.slopePct, 'dry'), normal: simulate(f, p.plan, t.slopePct, 'normal') }
    })
    return {
      c, f, ha: areaHa(c.poly),
      over: sims.filter((s) => s.normal.erosionYear > TOLERANCE).length,
      dryLoss: sims.filter((s) => s.dry.margin < 0).length,
      alerts: f.alerts.filter((a) => a.level !== 'info').length,
      sims,
    }
  }), [clients, fields])
  if (!clients.length) return <Loading />
  const totalHa = rows.reduce((s, r) => s + r.ha, 0)
  const planName = (p: string) => ({ weekly: x('Semanal', 'Weekly'), biweekly: x('Quincenal', 'Biweekly'), monthly: x('Mensual', 'Monthly') }[p] ?? p)

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PageTitle step={x('Agrónomo', 'Agronomist')} title={x('Mis campos', 'My fields')} sub={x('Todos los campos que asesorás, con lo que necesita atención primero.', 'Every field you advise, with what needs attention first.')} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [x('Campos', 'Fields'), String(rows.length)],
          [x('Hectáreas', 'Hectares'), totalHa.toFixed(0)],
          [x('Parcelas sobre el límite de erosión', 'Plots above erosion limit'), String(rows.reduce((s, r) => s + r.over, 0))],
          [x('Avisos satelitales abiertos', 'Open satellite alerts'), String(rows.reduce((s, r) => s + r.alerts, 0))],
        ].map(([k, v]) => (
          <div key={k} className="panel p-4"><p className="text-sm text-mute">{k}</p><p className="font-title text-3xl font-extrabold num">{v}</p></div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {rows.map((r) => (
          <article key={r.c.id} className="panel flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-title text-xl font-bold">{r.c.owner}</h2>
                <p className="text-sm text-mute">{r.f.name} · {r.f.department} · {r.ha.toFixed(0)} ha</p>
              </div>
              <div className="flex flex-none items-center gap-2">
  {r.over || r.alerts > 2 ? <Status tone="warn">{x('Revisar', 'Review')}</Status> : <Status tone="good">{x('En orden', 'OK')}</Status>}
  <AlertsButton clientId={r.c.id} owner={r.c.owner} field={r.f} />
</div>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full">
              {r.sims.map((s) => <div key={s.p.id} style={{ flex: areaHa(s.p.poly), background: CROP_COLOR[s.p.plan.crop] }} title={lang === 'es' ? CROPS[s.p.plan.crop].es : CROPS[s.p.plan.crop].en} />)}
            </div>
            <ul className="space-y-1 text-sm">
              <li>• {r.c.parcels.length} {x('parcelas', 'plots')} · {x('seguimiento', 'monitoring')} <b>{planName(r.c.monPlan).toLowerCase()}</b></li>
              <li className={r.over ? 'text-crit' : ''}>• {r.over} {x('parcela(s) pierden más suelo del tolerable', 'plot(s) lose more soil than tolerable')}</li>
              <li className={r.dryLoss ? 'text-warn' : ''}>• {r.dryLoss} {x('parcela(s) pierden plata en un año seco', 'plot(s) lose money in a dry year')}</li>
              <li>• {r.alerts} {x('avisos satelitales de la temporada', 'satellite alerts this season')}</li>
            </ul>
            <div className="mt-auto flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => { setClientId(r.c.id); go('field') }}>{x('Abrir campo', 'Open field')}</button>
              <button className="btn" onClick={() => { setClientId(r.c.id); go('predict') }}>{x('Predicción', 'Prediction')}</button>
              <button className="btn" onClick={() => { setClientId(r.c.id); go('monitor') }}>{x('Seguimiento', 'Monitoring')}</button>
              {/* <AlertsButton clientId={r.c.id} owner={r.c.owner} field={r.f} /> */}
            </div>
          </article>
        ))}
      </div>
      <p className="mt-4 text-xs text-mute">{x('Datos de demostración. En la versión real, cada campo viene del pipeline de datos NASA.', 'Demo data. In the real version each field comes from the NASA data pipeline.')}</p>
    </div>
  )
}
