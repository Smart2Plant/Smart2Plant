import { useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import { useApp } from '../store'
import { usePlans } from '../plans'
import { CROPS, TOLERANCE, areaHa, type CropKey, type PlanKind } from '../agro'
import { MONTHS_EN, MONTHS_ES } from '../components/ui'

type SheetKey = 'visit' | 'pumrs' | 'pests' | 'sowing'
type Vars = Record<string, string>
type Col = { h: string; auto: (r: Row) => string }
type Row = ReturnType<ReturnType<typeof usePlans>['evalPlan']>[number]

// Session memory: values typed once are reused by every sheet; edited templates are kept per sheet.
const memory: { vars: Vars; tpl: Record<string, string> } = { vars: {}, tpl: {} }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export default function Sheets() {
  const { x, lang, client, field, activePlan } = useApp()
  const { plansOf, evalPlan } = usePlans()
  const [sheet, setSheet] = useState<SheetKey>('visit')
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [auto, setAuto] = useState(true)
  const [planK, setPlanK] = useState<PlanKind>(activePlan)
  const [, force] = useState(0)
  const [msg, setMsg] = useState('')
  const rows = useMemo(() => (client && field ? evalPlan(plansOf(planK)) : []), [client, field, planK])
  if (!client || !field) return null

  const crop = (k: CropKey) => (lang === 'es' ? CROPS[k].es : CROPS[k].en)
  const month = (m: number) => (lang === 'es' ? MONTHS_ES : MONTHS_EN)[m - 1]
  const blank = '______'

  // ---- shared variables (typed once, used everywhere) ----
  const defaults: Vars = {
    fecha: new Date().toISOString().slice(0, 10), agronomo: '', n_tecnico: '', productor: client.owner, rut: '', padron: '',
    campo: field.name, departamento: field.department, superficie: `${areaHa(client.poly).toFixed(1)} ha`, zafra: '2026-27',
  }
  const vars: Vars = { ...defaults, ...memory.vars }
  const setVar = (k: string, v: string) => { memory.vars = { ...memory.vars, [k]: v }; force((n) => n + 1) }
  const varLabels: [string, string][] = [
    ['fecha', x('Fecha', 'Date')], ['zafra', x('Zafra', 'Season')], ['agronomo', x('Ing. Agr. responsable', 'Responsible agronomist')], ['n_tecnico', x('N° de técnico acreditado', 'Accredited agronomist No.')],
    ['productor', x('Productor / titular', 'Producer / holder')], ['rut', x('RUT o DICOSE', 'RUT or DICOSE')], ['padron', x('Padrón(es)', 'Cadastral number(s)')],
    ['campo', x('Campo', 'Field')], ['departamento', x('Departamento', 'Department')], ['superficie', x('Superficie', 'Area')],
  ]

  // ---- sheet definitions ----
  const sheets: Record<SheetKey, { name: string; tpl: string; cols: Col[] }> = {
    visit: {
      name: x('Planilla de visita técnica', 'Field visit sheet'),
      tpl: x(
        'PLANILLA DE VISITA TÉCNICA\n\nFecha de visita: {{fecha}}    Zafra: {{zafra}}\nProductor: {{productor}}    RUT/DICOSE: {{rut}}\nCampo: {{campo}} ({{departamento}}) · {{superficie}} · Padrón: {{padron}}\n\n{{tabla}}\n\nObservaciones generales:\n______________________________________________\n______________________________________________\n\nPróxima visita: ______    Firma: {{agronomo}} (N° {{n_tecnico}})',
        'FIELD VISIT SHEET\n\nVisit date: {{fecha}}    Season: {{zafra}}\nProducer: {{productor}}    RUT/DICOSE: {{rut}}\nField: {{campo}} ({{departamento}}) · {{superficie}} · Cadastral: {{padron}}\n\n{{tabla}}\n\nGeneral notes:\n______________________________________________\n______________________________________________\n\nNext visit: ______    Signature: {{agronomo}} (No. {{n_tecnico}})'),
      cols: [
        { h: x('Parcela', 'Plot'), auto: (r) => '' + (rows.indexOf(r) + 1) },
        { h: 'ha', auto: (r) => r.ha.toFixed(1) },
        { h: x('Cultivo planificado', 'Planned crop'), auto: (r) => crop(r.p.plan.crop) },
        { h: x('Estado del cultivo', 'Crop status'), auto: () => '' },
        { h: x('Plaga a revisar', 'Pest to check'), auto: (r) => r.sims.normal.pests[0]?.name.split('|')[lang === 'es' ? 0 : 1] ?? '' },
        { h: x('Observaciones', 'Notes'), auto: () => '' },
      ],
    },
    pumrs: {
      name: x('Planilla de Plan de Uso (PUMRS)', 'Soil Use Plan sheet (PUMRS)'),
      tpl: x(
        'PLAN DE USO Y MANEJO RESPONSABLE DE SUELOS — DATOS PARA EL SGPU\n\nTitular: {{productor}}    RUT/DICOSE: {{rut}}\nPadrón(es): {{padron}}    Departamento: {{departamento}}\nCampo: {{campo}} · {{superficie}}    Zafra de inicio: {{zafra}}\nTécnico responsable: {{agronomo}}    N° de técnico: {{n_tecnico}}    Fecha: {{fecha}}\n\n{{tabla}}\n\nTolerancia de referencia: ' + TOLERANCE + ' t/ha·año (confirmar con la unidad CONEAT y EROSION 6.0).\n\nFirma del técnico: ______________',
        'RESPONSIBLE SOIL USE AND MANAGEMENT PLAN — DATA FOR THE SGPU\n\nHolder: {{productor}}    RUT/DICOSE: {{rut}}\nCadastral number(s): {{padron}}    Department: {{departamento}}\nField: {{campo}} · {{superficie}}    Starting season: {{zafra}}\nResponsible agronomist: {{agronomo}}    No.: {{n_tecnico}}    Date: {{fecha}}\n\n{{tabla}}\n\nReference tolerance: ' + TOLERANCE + ' t/ha·yr (confirm with the CONEAT unit and EROSION 6.0).\n\nAgronomist signature: ______________'),
      cols: [
        { h: x('Unidad', 'Unit'), auto: (r) => '' + (rows.indexOf(r) + 1) },
        { h: 'ha', auto: (r) => r.ha.toFixed(1) },
        { h: x('Pendiente', 'Slope'), auto: (r) => `${r.t.slopePct}%` },
        { h: x('Cultivo', 'Crop'), auto: (r) => crop(r.p.plan.crop) },
        { h: x('Manejo', 'Tillage'), auto: (r) => (r.p.plan.tillage ? x('Laboreo', 'Tillage') : x('Siembra directa', 'No-till')) },
        { h: x('Erosión t/ha·año', 'Erosion t/ha·yr'), auto: (r) => `${r.sims.normal.erosionYear}` },
        { h: x('¿Cumple?', 'Complies?'), auto: (r) => (r.sims.normal.erosionYear > TOLERANCE ? x('No', 'No') : x('Sí', 'Yes')) },
      ],
    },
    pests: {
      name: x('Planilla de monitoreo de plagas', 'Pest scouting sheet'),
      tpl: x(
        'MONITOREO DE PLAGAS Y ENFERMEDADES\n\nCampo: {{campo}} ({{departamento}})    Productor: {{productor}}\nFecha de monitoreo: {{fecha}}    Zafra: {{zafra}}    Responsable: {{agronomo}}\n\n{{tabla}}\n\nRiesgo esperado según el clima (Smart2Plant). Confirmar con conteos en el campo antes de decidir una aplicación.',
        'PEST AND DISEASE SCOUTING\n\nField: {{campo}} ({{departamento}})    Producer: {{productor}}\nScouting date: {{fecha}}    Season: {{zafra}}    Responsible: {{agronomo}}\n\n{{tabla}}\n\nExpected risk from weather (Smart2Plant). Confirm with field counts before deciding on a spray.'),
      cols: [
        { h: x('Parcela', 'Plot'), auto: (r) => '' + (rows.indexOf(r) + 1) },
        { h: x('Cultivo', 'Crop'), auto: (r) => crop(r.p.plan.crop) },
        { h: x('Plaga / enfermedad', 'Pest / disease'), auto: (r) => r.sims.normal.pests.slice(0, 2).map((p) => p.name.split('|')[lang === 'es' ? 0 : 1]).join(', ') },
        { h: x('Riesgo esperado', 'Expected risk'), auto: (r) => [x('Bajo', 'Low'), x('Bajo', 'Low'), x('Medio', 'Medium'), x('Alto', 'High')][r.sims.normal.pests[0]?.peak ?? 0] },
        { h: x('Conteo / incidencia', 'Count / incidence'), auto: () => '' },
        { h: x('Umbral', 'Threshold'), auto: () => '' },
        { h: x('Acción', 'Action'), auto: () => '' },
      ],
    },
    sowing: {
      name: x('Registro de siembra', 'Sowing record'),
      tpl: x(
        'REGISTRO DE SIEMBRA — ZAFRA {{zafra}}\n\nCampo: {{campo}} ({{departamento}}) · {{superficie}}\nProductor: {{productor}}    Fecha de registro: {{fecha}}\n\n{{tabla}}\n\nResponsable: {{agronomo}} (N° {{n_tecnico}})',
        'SOWING RECORD — SEASON {{zafra}}\n\nField: {{campo}} ({{departamento}}) · {{superficie}}\nProducer: {{productor}}    Record date: {{fecha}}\n\n{{tabla}}\n\nResponsible: {{agronomo}} (No. {{n_tecnico}})'),
      cols: [
        { h: x('Parcela', 'Plot'), auto: (r) => '' + (rows.indexOf(r) + 1) },
        { h: 'ha', auto: (r) => r.ha.toFixed(1) },
        { h: x('Cultivo', 'Crop'), auto: (r) => crop(r.p.plan.crop) },
        { h: x('Mes previsto', 'Planned month'), auto: (r) => month(r.p.plan.sow) },
        { h: x('Fecha real', 'Actual date'), auto: () => '' },
        { h: x('Variedad', 'Variety'), auto: () => '' },
        { h: x('Densidad', 'Seeding rate'), auto: () => '' },
        { h: x('Antecesor', 'Previous crop'), auto: (r) => (r.p.plan.prev === 'stubble' ? x('Rastrojo', 'Stubble') : crop(r.p.plan.prev as CropKey)) },
        { h: x('Riego', 'Irrigation'), auto: (r) => (r.p.plan.irrigation ? x('Sí', 'Yes') : x('No', 'No')) },
      ],
    },
  }
  const def = sheets[sheet]
  const tplKey = `${sheet}:${lang}`
  const tpl = memory.tpl[tplKey] ?? def.tpl
  const tableRows: string[][] = (auto ? rows : rows.map(() => null)).map((r) => def.cols.map((c) => (r ? c.auto(r) : '')))
  if (!auto) tableRows.forEach((row, i) => { row[0] = '' + (i + 1) })

  const fill = (v: string) => (v && v.trim() ? v : blank)
  const asText = () => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => k === 'tabla'
    ? [def.cols.map((c) => c.h).join(' | '), ...tableRows.map((r) => r.map((c) => c || blank).join(' | '))].join('\n')
    : fill(vars[k] ?? ''))
  const asHtml = (forWord = false) => esc(tpl).replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (k === 'tabla') {
      const th = def.cols.map((c) => `<th style="border:1px solid #9aa;padding:4px 6px;background:#E3ECEA;text-align:left">${esc(c.h)}</th>`).join('')
      const tr = tableRows.map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #9aa;padding:4px 6px;min-width:60px;${c ? '' : 'background:#FFF7D6'}">${c ? esc(c) : '&nbsp;'}</td>`).join('')}</tr>`).join('')
      return `<table style="border-collapse:collapse;width:100%;font-size:${forWord ? 10 : 13}px">${'<tr>' + th + '</tr>'}${tr}</table>`
    }
    const v = vars[k] ?? ''
    return v.trim() ? `<span style="background:#E3ECEA;border-radius:3px;padding:0 2px">${esc(v)}</span>` : `<span style="background:#FFF2B3;border-radius:3px;padding:0 2px">${blank}</span>`
  }).replace(/\n/g, '<br>')

  const missing = varLabels.filter(([k]) => tpl.includes(`{{${k}}}`) && !(vars[k] ?? '').trim())

  function pdf() {
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
      doc.text(doc.splitTextToSize(asText(), 515), 40, 50)
      doc.save(`${sheet}-${client!.id}.pdf`)
      if (window.self !== window.top) setMsg(x('Las descargas están bloqueadas en esta vista previa; funcionan en la app publicada.', 'Downloads are blocked in this preview; they work in the deployed app.'))
    } catch { setMsg('—') }
  }
  function word() {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(def.name)}</title></head><body style="font-family:Calibri,Arial;font-size:11pt">${asHtml(true)}</body></html>`
    try {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob(['﻿', html], { type: 'application/msword' }))
      a.download = `${sheet}-${client!.id}.doc`
      document.body.appendChild(a); a.click(); a.remove()
      if (window.self !== window.top) setMsg(x('Las descargas están bloqueadas en esta vista previa; funcionan en la app publicada.', 'Downloads are blocked in this preview; they work in the deployed app.'))
    } catch { setMsg('—') }
  }
  async function copy() { try { await navigator.clipboard.writeText(asText()); setMsg(x('Copiado.', 'Copied.')) } catch { setMsg(x('No se pudo copiar desde acá.', 'Could not copy from here.')) } }
  const insert = (k: string) => { memory.tpl[tplKey] = tpl + `{{${k}}}`; force((n) => n + 1) }

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <aside className="flex flex-col gap-4">
        <div className="panel flex flex-col gap-1 p-2">
          <p className="label px-2 pt-1">{x('Planillas', 'Sheets')}</p>
          {(Object.keys(sheets) as SheetKey[]).map((k) => (
            <button key={k} onClick={() => { setSheet(k); setMsg('') }} className={`rounded-lg px-3 py-2 text-left text-sm ${sheet === k ? 'bg-ink text-bg' : 'hover:bg-bg'}`}>
              {sheets[k].name}{memory.tpl[`${k}:${lang}`] ? ' ✎' : ''}
            </button>
          ))}
        </div>
        <div className="panel flex flex-col gap-2 p-4">
          <p className="font-title font-bold">{x('Autocompletar', 'Autofill')}</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />{x('Llenar la tabla con el plan elegido', 'Fill the table from the chosen plan')}</label>
          <select value={planK} onChange={(e) => setPlanK(e.target.value as PlanKind)} disabled={!auto}>
            <option value="requested">{x('Plan solicitado', 'Requested plan')}</option>
            <option value="recommended">{x('Plan recomendado', 'Recommended plan')}</option>
            <option value="balanced">{x('Alternativa balanceada', 'Balanced alternative')}</option>
          </select>
          <p className="text-xs text-mute">{auto ? x('Las celdas que el plan no conoce quedan en blanco para completar a mano.', 'Cells the plan does not know stay blank to fill in by hand.') : x('La tabla sale vacía, una fila por parcela.', 'The table comes out empty, one row per plot.')}</p>
        </div>
        <div className="panel flex flex-col gap-2 p-4">
          <p className="font-title font-bold">{x('Datos que se repiten', 'Repeated fields')}</p>
          <p className="text-xs text-mute">{x('Se escriben una vez y aparecen en todas las planillas.', 'Type them once and they appear in every sheet.')}</p>
          {varLabels.map(([k, l]) => (
            <label key={k} className="flex flex-col gap-0.5 text-xs font-semibold text-mute">{l}
              <input type={k === 'fecha' ? 'date' : 'text'} value={vars[k] ?? ''} onChange={(e) => setVar(k, e.target.value)} className="text-sm font-normal text-ink" />
            </label>
          ))}
        </div>
      </aside>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="seg">
            <button aria-pressed={mode === 'view'} onClick={() => setMode('view')}>{x('Documento', 'Document')}</button>
            <button aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>{x('Editar plantilla', 'Edit template')}</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={word}>⬇ {x('Word editable (.doc)', 'Editable Word (.doc)')}</button>
            <button className="btn" onClick={pdf}>⬇ PDF</button>
            <button className="btn" onClick={copy}>⧉ {x('Copiar', 'Copy')}</button>
          </div>
        </div>
        {missing.length > 0 && <p className="rounded-lg border-l-4 border-warn bg-tint p-2 text-sm">{x('Faltan completar', 'Still to fill in')}: {missing.map(([, l]) => l).join(', ')}.</p>}
        {msg && <p role="status" className="rounded-lg bg-tint p-2 text-sm">{msg}</p>}

        {mode === 'view' ? (
          <article className="panel min-h-[560px] p-8 font-body text-[14px] leading-relaxed" dangerouslySetInnerHTML={{ __html: asHtml() }} />
        ) : (
          <div className="panel flex flex-col gap-2 p-4">
            <p className="text-sm text-mute">{x('Editá el texto libremente. Los campos entre {{llaves}} se reemplazan por los datos de la izquierda; {{tabla}} es la tabla de parcelas.', 'Edit the text freely. Fields in {{braces}} are replaced with the data on the left; {{tabla}} is the plot table.')}</p>
            <div className="flex flex-wrap gap-1">
              {[...varLabels.map(([k, l]) => [k, l]), ['tabla', x('Tabla de parcelas', 'Plot table')]].map(([k, l]) => <button key={k} className="chip !py-0.5 text-xs" onClick={() => insert(k)}>+ {l}</button>)}
            </div>
            <textarea aria-label={x('Plantilla', 'Template')} value={tpl} onChange={(e) => { memory.tpl[tplKey] = e.target.value; force((n) => n + 1) }} className="h-[480px] w-full rounded-lg border border-line p-3 font-code text-[13px]" />
            {memory.tpl[tplKey] && <button className="btn self-start" onClick={() => { delete memory.tpl[tplKey]; force((n) => n + 1) }}>{x('Restaurar plantilla original', 'Restore original template')}</button>}
          </div>
        )}
      </section>
    </div>
  )
}
