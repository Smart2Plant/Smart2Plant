import { motion } from 'framer-motion'
import { LogoMark, Wordmark } from '../components/Logo'
import { useApp, type MonPlan } from '../store'
import Field3D from '../components/Field3D'
import { Loading } from '../components/ui'
import { CROP_COLOR, areaHa } from '../agro'
import { PLAN_ORDER, PRICE, STEP } from '../pricing'
import type { View } from '../types'

export default function Home() {
  const { x, go, client, field, reducedMotion } = useApp()
  const steps: { n: string; v: View; t: string; d: string; i: string }[] = [
    { n: '0', v: 'portfolio', i: '📋', t: x('Mis campos', 'My fields'), d: x('Todos los campos que asesorás en una lista, con lo que necesita atención primero.', 'Every field you advise in one list, with what needs attention first.') },
    { n: '1', v: 'field', i: '✏️', t: x('Campo y parcelas', 'Field and plots'), d: x('Dibujá el campo y cada parcela en el mapa. Cargá cultivo, mes de siembra, antecesor, manejo y riego.', 'Draw the field and each plot on the map. Enter crop, sowing month, previous crop, tillage and irrigation.') },
    { n: '2', v: 'predict', i: '📈', t: x('Predicción', 'Prediction'), d: x('Compará el plan solicitado, el recomendado y una alternativa. Mirá cómo le va a cada uno en un año seco, normal o húmedo: rinde, margen, agua, erosión y plagas.', 'Compare the requested plan, the recommended one and an alternative. See how each does in a dry, normal or wet year: yield, margin, water, erosion and pests.') },
    { n: '3', v: 'monitor', i: '🛰', t: x('Seguimiento satelital', 'Satellite monitoring'), d: x('Cada captura compara lo que ve el satélite con lo esperado y avisa los desvíos. Compará con campos similares en un radio de kilómetros.', 'Each capture compares what the satellite sees with what was expected and flags deviations. Compare with similar fields within a radius in km.') },
    { n: '4', v: 'reports', i: '📄', t: x('Informes', 'Reports'), d: x('Informes listos para el productor, el dueño del campo y el borrador del Plan de Uso. Por PDF, WhatsApp o email.', 'Ready reports for the farmer, the landowner and the Soil Use Plan draft. By PDF, WhatsApp or email.') },
  ]
  const data = [
    ['NASA HLS (Landsat + Sentinel-2)', x('Verdor, suelo desnudo y seguimiento de cada parcela', 'Greenness, bare soil and monitoring of each plot')],
    ['GPM IMERG', x('Lluvia, tormentas y erosividad', 'Rain, storms and erosivity')],
    ['SMAP', x('Humedad del suelo', 'Soil moisture')],
    ['NASA POWER', x('Temperatura, heladas y evapotranspiración', 'Temperature, frost and evapotranspiration')],
    ['SRTM', x('Pendiente y zonas bajas', 'Slope and low areas')],
  ]
  const planText: Record<MonPlan, { name: string; items: string[]; tag?: string }> = {
    monthly: { name: x('Mensual', 'Monthly'), items: [x('1 análisis satelital cada 30 días', '1 satellite analysis every 30 days'), x('Campo y parcelas, predicción y los 3 planes', 'Field and plots, prediction and the 3 plans'), x('Informes en PDF', 'PDF reports')] },
    biweekly: { name: x('Quincenal', 'Biweekly'), items: [x('1 análisis satelital cada 14 días', '1 satellite analysis every 14 days'), x('Todo lo del plan mensual', 'Everything in Monthly'), x('Avisos por WhatsApp y email', 'Alerts by WhatsApp and email')] },
    weekly: { name: x('Semanal', 'Weekly'), items: [x('1 análisis satelital cada 7 días', '1 satellite analysis every 7 days'), x('Todo lo del plan quincenal', 'Everything in Biweekly'), x('Detecta los problemas antes (en el campo de ejemplo, 9 días antes que el mensual)', 'Catches problems sooner (9 days earlier than Monthly on the example field)')], tag: x('Más elegido', 'Most popular') },
  }

  return (
    <div>
      <section className="border-b border-line bg-gradient-to-br from-[#E4EFF5] via-[#EEF3EC] to-[#E3ECDF] text-ink">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-12 md:grid-cols-[1fr_1.1fr] lg:px-10">
          <motion.div className="md:pl-4" initial={reducedMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <p className="text-sm font-semibold uppercase tracking-widest text-leaf">{x('Para agrónomos', 'For agronomists')}</p>
            <h1 className="mt-2 font-title text-4xl font-extrabold leading-[1.08] lg:text-[52px]">{x('Planificá rotaciones y seguí cada chacra desde el satélite.', 'Plan rotations and follow every field from space.')}</h1>
            <p className="mt-4 max-w-xl text-lg text-mute">{x('Smart2Plant usa datos de la NASA para predecir cómo le va a cada parcela en un año seco, normal o húmedo, y avisarte cuando algo se aparta del plan. Sin drones ni sensores en el campo.', 'Smart2Plant uses NASA data to predict how each plot does in a dry, normal or wet year, and alerts you when something drifts from the plan. No drones or field sensors.')}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="rounded-[10px] bg-forest px-5 py-3 font-semibold text-white hover:bg-leaf" onClick={() => go('portfolio')}>{x('Empezar', 'Get started')} →</button>
              <button className="rounded-[10px] border border-forest/40 bg-white/60 px-5 py-3 font-semibold text-forest" onClick={() => document.getElementById('planes')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' })}>{x('Ver planes', 'See plans')}</button>
            </div>
          </motion.div>
          <div className="relative">
            <div className="relative z-10 mb-1 flex items-center justify-center gap-3">
              <LogoMark size={64} tone="light" />
              <div>
                <Wordmark tone="light" className="block text-4xl leading-none md:text-[44px]" />
                <p className="mt-1 text-base font-semibold text-mute">{x('Tu campo, conectado al espacio', 'Your field, connected to space')}</p>
              </div>
            </div>
            <div aria-hidden className="pointer-events-none absolute inset-x-6 bottom-6 top-10 rounded-full bg-[radial-gradient(closest-side,rgba(108,196,238,0.28),transparent)]" />
            {client && field ? <Field3D field={field} mode="parcels" parcels={client.parcels.map((p) => ({ poly: p.poly, color: CROP_COLOR[p.plan.crop] }))} clientPoly={client.poly} autoRotate={!reducedMotion} grow={!reducedMotion} transparent height={420} ariaLabel={x('Campo de ejemplo en 3D', 'Example field in 3D')} /> : <Loading />}
            {client && field && <>
              <div className="absolute left-0 top-[104px] rounded-xl border border-line bg-white/90 px-3 py-2 text-sm shadow-sm backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-mute">{x('Imágenes', 'Imagery')}</p>
                <p className="font-semibold text-forest">🛰 Landsat + Sentinel-2</p>
              </div>
              <div className="absolute right-0 top-[168px] rounded-xl border border-line bg-white/90 px-3 py-2 text-sm shadow-sm backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-mute">{field.name}</p>
                <p className="font-semibold text-forest">🌱 {client.parcels.length} {x('parcelas', 'plots')} · {areaHa(client.poly).toFixed(0)} ha</p>
              </div>
              <div className="absolute bottom-6 right-2 rounded-xl border border-line bg-white/90 px-3 py-2 text-sm shadow-sm backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-mute">{x('Escenarios', 'Scenarios')}</p>
                <p className="font-semibold text-forest">☀️ {x('seco', 'dry')} · ⛅ normal · 🌧 {x('húmedo', 'wet')}</p>
              </div>
            </>}
            <p className="px-2 pt-1 text-center text-xs text-mute">{x('Campo de ejemplo con sus parcelas, sobre el relieve NASA SRTM.', 'Example field and its plots, on NASA SRTM relief.')}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10 lg:px-12">
        <p className="label">{x('Cómo se usa', 'How it works')}</p>
        <h2 className="font-title text-3xl font-extrabold">{x('De la chacra al informe, en 4 pasos', 'From the field to the report, in 4 steps')}</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-5">
          {steps.map((s, i) => (
            <motion.button key={s.v} onClick={() => go(s.v)} className="panel flex flex-col gap-2 p-4 text-left hover:ring-2 hover:ring-leaf" initial={reducedMotion ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}>
              <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-leaf font-title font-bold text-white">{s.n}</span><span className="text-xl" aria-hidden>{s.i}</span></div>
              <h3 className="font-title text-lg font-bold">{s.t}</h3>
              <p className="text-sm text-mute">{s.d}</p>
              <span className="mt-auto text-sm font-semibold text-leaf">{x('Ir', 'Go')} →</span>
            </motion.button>
          ))}
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-6 py-10 lg:px-12">
          <p className="label">{x('Datos', 'Data')}</p>
          <h2 className="font-title text-3xl font-extrabold">{x('Lo que antes pedía hardware, ahora lo mide un satélite', 'What used to need hardware is now measured from space')}</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-5">
            {data.map(([n, d]) => <div key={n} className="rounded-[12px] bg-tint p-4"><p className="font-title font-bold">🛰 {n}</p><p className="mt-1 text-sm text-mute">{d}</p></div>)}
          </div>
          <p className="mt-3 text-sm text-mute">{x('Se combinan con datos locales: suelos CONEAT, INIA, INUMET y MGAP. Cada número de la app dice si es Observado, Modelado o Supuesto.', 'Combined with local data: CONEAT soils, INIA, INUMET and MGAP. Every number in the app says whether it is Observed, Modeled or Assumed.')}</p>
        </div>
      </section>

      <section id="planes" className="mx-auto max-w-7xl px-6 py-10 lg:px-12">
        <p className="label">{x('Planes', 'Plans')}</p>
        <h2 className="font-title text-3xl font-extrabold">{x('Elegí cada cuánto mirar tus campos', 'Choose how often to check your fields')}</h2>
        <p className="mt-1 text-mute">{x('Precio por campo y por mes. Podés tener cada campo en un plan distinto.', 'Price per field per month. Each field can be on a different plan.')}</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {PLAN_ORDER.map((p) => {
            const t = planText[p]
            return (
              <div key={p} className={`panel flex flex-col gap-3 p-5 ${t.tag ? 'ring-2 ring-leaf' : ''}`}>
                <div className="flex items-center justify-between"><h3 className="font-title text-2xl font-bold">{t.name}</h3>{t.tag && <span className="pill bg-leaf">{t.tag}</span>}</div>
                <p><span className="font-title text-4xl font-extrabold num">{PRICE[p]}</span> <span className="text-mute">/ {x('campo / mes', 'field / month')}</span></p>
                <p className="text-sm text-mute">{x(`Imagen satelital cada ${STEP[p]} días`, `Satellite image every ${STEP[p]} days`)}</p>
                <ul className="flex-1 space-y-1.5 text-sm">{t.items.map((i) => <li key={i}>✓ {i}</li>)}</ul>
                <button className={p === 'weekly' ? 'btn-primary' : 'btn'} onClick={() => go('portfolio')}>{p === 'monthly' ? x('Empezar gratis', 'Start free') : x('Elegir', 'Choose')}</button>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-mute">{x('Precios tentativos, a validar en un piloto. Prototipo: no se cobra nada.', 'Tentative prices, to be validated in a pilot. Prototype: nothing is charged.')}</p>
      </section>
    </div>
  )
}
