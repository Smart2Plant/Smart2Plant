import { Fragment, useMemo, useState } from 'react'
import L from 'leaflet'
import { useApp } from '../store'
import AgroMap, { CircleMarker, Polygon, Tooltip, boundsOf, useBackdrop } from '../components/FieldMap'
import Field3D from '../components/Field3D'
import { Conf, Loading, PageTitle, Src, useMonth } from '../components/ui'
import { CROPS, CROP_COLOR, CROP_KEYS, areaHa, centroid, fieldLatLngs, parcelTerrain, snap, splitEqual, type CropKey, type LatLng, type Parcel, type Prev } from '../agro'

type Mode = 'idle' | 'field' | 'parcel'
const DEFAULTS: Parcel['plan'][] = [
  { crop: 'soybean', sow: 11, prev: 'wheat', tillage: false, irrigation: false },
  { crop: 'maize', sow: 10, prev: 'soybean', tillage: false, irrigation: false },
  { crop: 'wheat', sow: 6, prev: 'soybean', tillage: false, irrigation: false },
  { crop: 'pasture', sow: 4, prev: 'stubble', tillage: false, irrigation: false },
  { crop: 'sorghum', sow: 11, prev: 'wheat', tillage: false, irrigation: false },
  { crop: 'cover', sow: 5, prev: 'soybean', tillage: false, irrigation: false },
]

export default function FieldSetup() {
  const { x, lang, client, field, updateClient, sel, setSel, go, reducedMotion } = useApp()
  const [mode, setMode] = useState<Mode>('idle')
  const [draft, setDraft] = useState<LatLng[]>([])
  const [msg, setMsg] = useState('')
  const mon = useMonth()
  const backdrop = useBackdrop(field, field ? fieldLatLngs(field) : undefined, 7)
  const fit = useMemo(() => (client && client.poly.length >= 3 ? boundsOf(client.poly, 0.15) : field ? boundsOf(fieldLatLngs(field), 0.15) : undefined), [client?.id, mode === 'field'])
  if (!client || !field) return <Loading />

  const parcels = client.parcels
  const fieldHa = areaHa(client.poly)
  const usedHa = parcels.reduce((s, p) => s + areaHa(p.poly), 0)
  const cur = parcels[Math.min(sel, parcels.length - 1)]
  const terr = cur ? parcelTerrain(field, client.poly, cur.poly) : null
  const cropName = (k: CropKey) => (lang === 'es' ? CROPS[k].es : CROPS[k].en)

  function click(p: LatLng) {
    setMsg('')
    if (mode === 'field') setDraft([...draft, p])
    else if (mode === 'parcel') setDraft([...draft, snap(p, client!.poly, parcels.map((q) => q.poly))])
  }
  function setParcels(ps: Parcel[]) { updateClient({ ...client!, parcels: ps }) }
  function closeParcel() {
    if (areaHa(draft) < 0.5) { setMsg(x('La parcela quedó muy chica. Marcá esquinas más separadas.', 'The plot is too small. Place the corners further apart.')); return }
    const i = parcels.length
    setParcels([...parcels, { id: `p${Date.now()}`, poly: draft, plan: { ...DEFAULTS[i % DEFAULTS.length] } }])
    setSel(i); setDraft([]); setMode('idle')
  }
  function finishField() {
    updateClient({ ...client!, poly: draft, parcels: [] })
    setDraft([]); setMode('idle'); setSel(0)
  }
  function split(r: number, c: number) {
    const polys = splitEqual(client!.poly, r, c)
    setParcels(polys.map((poly, i) => ({ id: `p${i}-${Date.now()}`, poly, plan: { ...DEFAULTS[i % DEFAULTS.length] } })))
    setSel(0)
  }
  function setPlan(patch: Partial<Parcel['plan']>) {
    const ps = parcels.map((p, i) => (i === sel ? { ...p, plan: { ...p.plan, ...patch } } : p))
    setParcels(ps)
  }

  const hint = {
    idle: x('Tocá una parcela para editarla, agregá una nueva o dividí el campo en partes iguales.', 'Click a plot to edit it, add a new one or split the field into equal parts.'),
    field: x('Tocá el mapa para marcar cada esquina del campo.', 'Click the map to place each corner of the field.'),
    parcel: x('Tocá cada esquina de la parcela. Cerca de un borde o de otra esquina, el punto se pega solo.', 'Click each corner of the plot. Near an edge or another corner, the point snaps.'),
  }[mode]

  const paint = parcels.map((p) => ({ poly: p.poly, color: CROP_COLOR[p.plan.crop] }))

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PageTitle step={x('Paso 1', 'Step 1')} title={x('Campo y parcelas', 'Field and plots')} sub={`${client.owner} · ${field.department} · ${hint}`} right={<button className="btn-primary" onClick={() => go('predict')} disabled={!parcels.length}>{x('Ver predicción', 'See prediction')} →</button>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {mode === 'idle' && (<>
              <button className="btn-primary" onClick={() => { setMode('parcel'); setDraft([]) }}>+ {x('Agregar parcela', 'Add plot')}</button>
              <span className="text-sm text-mute">{x('o dividir en partes iguales:', 'or split equally:')}</span>
              <div className="seg">{[[1, 2], [2, 2], [2, 3]].map(([r, c]) => <button key={r * c} onClick={() => split(r, c)}>{r * c}</button>)}</div>
              <button className="btn" onClick={() => { setMode('field'); setDraft([]) }}>{x('Redibujar el campo', 'Redraw the field')}</button>
            </>)}
            {mode !== 'idle' && (<>
              {draft.length >= 3 && <button className="btn-primary" onClick={mode === 'field' ? finishField : closeParcel}>{mode === 'field' ? x('Listo, este es el campo', 'Done, this is the field') : x('Cerrar parcela', 'Close plot')}</button>}
              {draft.length > 0 && <button className="btn" onClick={() => setDraft(draft.slice(0, -1))}>{x('Deshacer punto', 'Undo point')}</button>}
              <button className="btn" onClick={() => { setMode('idle'); setDraft([]) }}>{x('Cancelar', 'Cancel')}</button>
              <span className="text-sm font-semibold text-teal">{mode === 'field' ? x('Marcando el borde del campo', 'Drawing the field boundary') : x('Marcando una parcela nueva', 'Drawing a new plot')} · {draft.length} {x('esquinas', 'corners')}</span>
            </>)}
          </div>
          <AgroMap fit={fit} height={540} onClick={click} backdrop={backdrop} cursor={mode === 'idle' ? 'grab' : 'crosshair'}>
            {client.poly.length >= 3 && mode !== 'field' && <Polygon positions={client.poly} pathOptions={{ color: '#fff', weight: 2.5, dashArray: '6 4', fillOpacity: 0.05 }} interactive={false} />}
            {mode !== 'field' && parcels.map((p, i) => (
              <Polygon key={p.id} positions={p.poly} pathOptions={{ color: i === sel ? '#17211C' : '#fff', weight: i === sel ? 4 : 1.5, fillColor: CROP_COLOR[p.plan.crop], fillOpacity: 0.72 }}
                eventHandlers={{ click: (e) => { if (mode === 'idle') { L.DomEvent.stopPropagation(e); setSel(i) } } }}>
                <Tooltip permanent direction="center" className="!bg-white/90">{i + 1}</Tooltip>
              </Polygon>
            ))}
            {draft.length > 0 && <Polygon positions={draft} pathOptions={{ color: '#0E5A6B', weight: 3, fillColor: '#0E5A6B', fillOpacity: 0.3 }} interactive={false} />}
            {draft.map((p, i) => <Fragment key={i}><CircleMarker center={p} radius={6} pathOptions={{ color: '#0E5A6B', weight: 2, fillColor: '#fff', fillOpacity: 1 }} interactive={false} /></Fragment>)}
          </AgroMap>
          {msg && <p className="rounded-lg border-l-4 border-warn bg-tint p-2 text-sm">{msg}</p>}
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-tint px-3 py-1 num">{x('Campo', 'Field')}: {fieldHa.toFixed(1)} ha</span>
            <span className="rounded-full bg-tint px-3 py-1 num">{parcels.length} {x('parcelas', 'plots')}: {usedHa.toFixed(1)} ha</span>
            <span className="rounded-full bg-tint px-3 py-1 num">{x('Sin asignar', 'Unassigned')}: {Math.max(0, fieldHa - usedHa).toFixed(1)} ha</span>
            <span className="rounded-full bg-tint px-3 py-1 num">{x('Centro', 'Center')}: {centroid(client.poly)[0].toFixed(4)}, {centroid(client.poly)[1].toFixed(4)}</span>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="panel p-2">
            <Field3D field={field} mode="parcels" parcels={paint} clientPoly={client.poly} autoRotate={!reducedMotion} grow={!reducedMotion} height={210} ariaLabel={x('Vista 3D pequeña del campo con sus parcelas', 'Small 3D view of the field and its plots')} />
            <p className="px-2 pb-1 pt-2 text-xs text-mute">{x('Relieve NASA SRTM, exagerado para que se note la pendiente.', 'NASA SRTM relief, exaggerated so the slope shows.')}</p>
          </div>

          {cur && (
            <div className="panel flex flex-col gap-3 p-4">
              <div className="flex flex-wrap gap-1.5">
                {parcels.map((p, i) => (
                  <button key={p.id} className={`chip ${i === sel ? 'chip-on' : ''}`} onClick={() => setSel(i)}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: CROP_COLOR[p.plan.crop] }} />{i + 1}
                  </button>
                ))}
              </div>
              <h2 className="font-title text-xl font-bold">{x('Parcela', 'Plot')} {sel + 1} · {areaHa(cur.poly).toFixed(1)} ha</h2>
              {terr && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-tint p-2"><p className="text-mute">{x('Pendiente media', 'Mean slope')}</p><p className="font-title text-xl font-bold num">{terr.slopePct}%</p><Src s="SRTM" /> <Conf kind="observed" /></div>
                  <div className="rounded-lg bg-tint p-2"><p className="text-mute">{x('Zona baja / húmeda', 'Low / wet area')}</p><p className="font-title text-xl font-bold num">{terr.wetPct}%</p><Src s="SRTM" /> <Conf kind="modeled" /></div>
                </div>
              )}
              <label className="flex flex-col gap-1 text-sm font-medium">{x('Cultivo', 'Crop')}
                <select value={cur.plan.crop} onChange={(e) => { const k = e.target.value as CropKey; setPlan({ crop: k, sow: CROPS[k].sow[Math.min(1, CROPS[k].sow.length - 1)] }) }}>
                  {CROP_KEYS.map((k) => <option key={k} value={k}>{cropName(k)}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-sm font-medium">{x('Mes de siembra', 'Sowing month')}
                  <select value={cur.plan.sow} onChange={(e) => setPlan({ sow: Number(e.target.value) })}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{mon(m)}{CROPS[cur.plan.crop].sow.includes(m) ? '' : x(' (fuera de época)', ' (off-season)')}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">{x('Antecesor', 'Previous crop')}
                  <select value={cur.plan.prev} onChange={(e) => setPlan({ prev: e.target.value as Prev })}>
                    <option value="stubble">{x('Rastrojo / campo natural', 'Stubble / native grassland')}</option>
                    {CROP_KEYS.map((k) => <option key={k} value={k}>{cropName(k)}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">{x('Manejo del suelo', 'Tillage')}
                  <select value={cur.plan.tillage ? '1' : '0'} onChange={(e) => setPlan({ tillage: e.target.value === '1' })}>
                    <option value="0">{x('Siembra directa', 'No-till')}</option>
                    <option value="1">{x('Laboreo convencional', 'Conventional tillage')}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">{x('Riego', 'Irrigation')}
                  <select value={cur.plan.irrigation ? '1' : '0'} onChange={(e) => setPlan({ irrigation: e.target.value === '1' })}>
                    <option value="0">{x('Secano', 'Rainfed')}</option>
                    <option value="1">{x('Con riego (requiere PUSA)', 'Irrigated (needs PUSA)')}</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn" onClick={() => setParcels(parcels.map((p) => ({ ...p, plan: { ...cur.plan } })))}>{x('Usar este plan en todas', 'Use this plan on all')}</button>
                <button className="btn btn-danger" onClick={() => { setParcels(parcels.filter((_, i) => i !== sel)); setSel(0) }}>{x('Borrar parcela', 'Delete plot')}</button>
              </div>
            </div>
          )}
          {!cur && mode === 'idle' && <div className="panel p-4 text-sm text-mute">{x('Todavía no hay parcelas. Agregá una o dividí el campo.', 'No plots yet. Add one or split the field.')}</div>}
        </aside>
      </div>
    </div>
  )
}
