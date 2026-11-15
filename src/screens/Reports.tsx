import { useMemo, useState } from 'react'
import { Logo } from '../components/Logo'
import { jsPDF } from 'jspdf'
import { useApp } from '../store'
import { Loading, PageTitle, Src } from '../components/ui'
import { CROPS, SCENARIOS, TOLERANCE, areaHa, parcelTerrain, simulate } from '../agro'
import { sendReportEmail } from '../lib/email'
import Sheets from './Sheets'

type Who = 'farmer' | 'owner' | 'plan'

export default function Reports() {
  const { x, client, field } = useApp()
  const [section, setSection] = useState<'reports' | 'sheets'>('reports')
  if (!client || !field) return <Loading />
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PageTitle step={x('Paso 4', 'Step 4')} title={x('Informes y planillas', 'Reports and sheets')} sub={x('Informes listos para cada persona y planillas editables para completar en el campo.', 'Ready reports for each person and editable sheets to fill in on the field.')} />
      <div className="mb-5 seg">
        <button aria-pressed={section === 'reports'} onClick={() => setSection('reports')}>📄 {x('Informes', 'Reports')}</button>
        <button aria-pressed={section === 'sheets'} onClick={() => setSection('sheets')}>📝 {x('Planillas para completar', 'Sheets to fill in')}</button>
      </div>
      {section === 'reports' ? <ReportView /> : <Sheets />}
    </div>
  )
}

function ReportView() {
  const { x, lang, client, field } = useApp()
  const [who, setWho] = useState<Who>('farmer')
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')

  const sims = useMemo(() => (client && field ? client.parcels.map((p) => {
    const t = parcelTerrain(field, client.poly, p.poly)
    return { p, t, ha: areaHa(p.poly), r: Object.fromEntries(SCENARIOS.map((s) => [s, simulate(field, p.plan, t.slopePct, s)])) as Record<string, ReturnType<typeof simulate>> }
  }) : []), [client, field])
  if (!client || !field) return <Loading />

  const crop = (k: keyof typeof CROPS) => (lang === 'es' ? CROPS[k].es : CROPS[k].en)
  const whoLabel = { farmer: x('Productor', 'Farmer'), owner: x('Dueño del campo', 'Landowner'), plan: x('Borrador de Plan de Uso (MGAP)', 'Draft Soil Use Plan (MGAP)') }[who]
  const lines: string[] = [
    `${client.owner} · ${field.name} (${field.department}) · ${areaHa(client.poly).toFixed(1)} ha`,
    `${x('Para', 'For')}: ${whoLabel}`,
    '',
    ...sims.map((s, i) => {
      const n = s.r.normal
      const base = `${x('Parcela', 'Plot')} ${i + 1} · ${crop(s.p.plan.crop)} · ${s.ha.toFixed(1)} ha · ${x('pend.', 'slope')} ${s.t.slopePct}%`
      if (who === 'plan') return `${base}\n   ${x('Erosión estimada', 'Estimated erosion')}: ${n.erosionYear} t/ha·${x('año', 'yr')} (${x('tolerancia', 'tolerance')} ${TOLERANCE}) → ${n.erosionYear > TOLERANCE ? x('NO CUMPLE', 'DOES NOT COMPLY') : x('cumple', 'complies')} · ${s.p.plan.tillage ? x('laboreo', 'tillage') : x('siembra directa', 'no-till')}`
      return `${base}\n   ${x('Seco / normal / húmedo', 'Dry / normal / wet')}: USD ${s.r.dry.margin} / ${n.margin} / ${s.r.wet.margin} ${x('por ha', 'per ha')} · ${x('agua cubierta (normal)', 'water covered (normal)')} ${Math.round(n.waterCovered * 100)}% · ${x('plaga principal', 'main pest')}: ${n.pests[0]?.name.split('|')[lang === 'es' ? 0 : 1]}`
    }),
    '',
    who === 'owner' ? x('Cumplimiento del plan y estado del suelo verificados con NASA HLS.', 'Plan compliance and soil status verified with NASA HLS.') : who === 'plan' ? x('Borrador para revisión y firma del Ing. Agr. acreditado.', 'Draft for review and signature by the accredited agronomist.') : x('Recomendación: priorizar cobertura invernal en parcelas sobre el límite de erosión.', 'Recommendation: prioritise winter cover on plots above the erosion limit.'),
    x('Herramienta informativa. Datos de demostración.', 'Informative tool. Demo data.'),
  ]
  const summary = lines.join('\n')

  function pdf() {
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      doc.setFillColor(31, 77, 54); doc.rect(0, 0, 595, 80, 'F')
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('Smart2Plant', 40, 45)
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text(x('Tu campo, conectado al espacio', 'Your field, connected to space') + '  ·  ' + whoLabel, 40, 64)
      doc.setTextColor(23, 33, 28); doc.setFontSize(10.5)
      doc.text(doc.splitTextToSize(summary, 515), 40, 110)
      doc.setFontSize(8); doc.setTextColor(92, 107, 99)
      doc.text('NASA HLS (Landsat + Sentinel-2) · GPM IMERG · SMAP · NASA POWER · SRTM', 40, 810)
      doc.save(`smart2plant-${client!.id}-${who}.pdf`)
      if (window.self !== window.top) setMsg(x('Las descargas están bloqueadas en esta vista previa; funcionan en la app publicada.', 'Downloads are blocked in this preview; they work in the deployed app.'))
    } catch { setMsg('—') }
  }
  async function copy() { try { await navigator.clipboard.writeText(summary); setMsg(x('Copiado.', 'Copied.')) } catch { setMsg(x('No se pudo copiar desde acá.', 'Could not copy from here.')) } }
  async function mail(e: React.FormEvent) {
    e.preventDefault()
    const r = await sendReportEmail(email, `Smart2Plant · ${field!.name}`, summary)
    setMsg(r === 'sent' ? '✓' : x('El envío por email es un prototipo: falta conectar EmailJS (src/lib/email.ts). No se envió nada.', 'Email sending is a prototype: EmailJS is not connected (src/lib/email.ts). Nothing was sent.'))
  }
  const wa = `https://wa.me/?text=${encodeURIComponent(summary.slice(0, 1500))}`

  return (
    <div>
      <div className="mb-4 seg">
        {(['farmer', 'owner', 'plan'] as Who[]).map((k) => <button key={k} aria-pressed={who === k} onClick={() => setWho(k)}>{{ farmer: x('Productor', 'Farmer'), owner: x('Dueño', 'Landowner'), plan: x('Plan de Uso', 'Soil Use Plan') }[k]}</button>)}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <article className="panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 bg-forest px-5 py-4 text-white"><Logo tone="dark" size={40} slogan x={x} /><p className="text-sm opacity-85">{whoLabel}</p></div>
          <pre className="whitespace-pre-wrap p-5 font-body text-[14.5px] leading-relaxed">{summary}</pre>
          <div className="flex gap-1.5 px-5 pb-4"><Src s="HLS" /><Src s="GPM IMERG" /><Src s="NASA POWER" /><Src s="SRTM" /></div>
        </article>
        <div className="panel flex flex-col gap-3 p-4">
          <button className="btn-primary" onClick={pdf}>⬇ {x('Descargar PDF', 'Download PDF')}</button>
          <a className="btn text-center" href={wa} target="_blank" rel="noreferrer">💬 {x('Enviar por WhatsApp', 'Send by WhatsApp')}</a>
          <form onSubmit={mail} className="flex flex-col gap-2 rounded-lg bg-bg p-3">
            <label htmlFor="em" className="text-sm font-semibold">✉ {x('Enviar por email', 'Send by email')}</label>
            <input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@email.com" />
            <button className="btn" type="submit">{x('Enviar', 'Send')}</button>
          </form>
          <button className="btn" onClick={copy}>⧉ {x('Copiar como texto', 'Copy as text')}</button>
          {msg && <p role="status" className="rounded-lg bg-tint p-2 text-sm">{msg}</p>}
        </div>
      </div>
    </div>
  )
}
