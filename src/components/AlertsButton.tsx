import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store'
import type { Alert, Field } from '../types'

/* Botón "Alertas" de cada campo en "Mis campos".
   - Muestra un punto rojo si hay alertas sin leer.
   - Al tocarlo abre un popup con la lista de alertas del campo.
   - Lo leído se guarda en el navegador (localStorage), por campo. */

type Kind = 'satellite' | 'weather'

const WEATHER_TYPES = new Set(['heavy_rain_bare', 'frost', 'storm', 'heat_wave', 'inumet'])
const kindOf = (a: Alert): Kind => (WEATHER_TYPES.has(a.type) ? 'weather' : 'satellite')

const TITLES: Record<string, [string, string]> = {
  heavy_rain_bare: ['Lluvia fuerte sobre suelo descubierto', 'Heavy rain on bare soil'],
  frost: ['Riesgo de helada', 'Frost risk'],
  bare_soil: ['Parcelas sin cobertura', 'Plots without cover'],
  drought_onset: ['Señal temprana de sequía', 'Early drought signal'],
  crop_stress: ['Estrés hídrico del cultivo', 'Crop water stress'],
  plan_deviation: ['La parcela se aparta del plan', 'Plot differs from the plan'],
  monthly_summary: ['Resumen mensual', 'Monthly summary'],
  cover_window: ['Buena ventana para cultivo de cobertura', 'Good window for a cover crop'],
}

const LEVEL: Record<Alert['level'], { es: string; en: string; cls: string }> = {
  critical: { es: 'Alta', en: 'High', cls: 'bg-[#FBE4E1] text-[#9F2E23]' },
  warning: { es: 'Media', en: 'Medium', cls: 'bg-[#F6EED5] text-[#7A5A06]' },
  info: { es: 'Info', en: 'Info', cls: 'bg-[#E5F1E7] text-[#1F6B40]' },
}

const KIND: Record<Kind, { es: string; en: string; cls: string }> = {
  satellite: { es: 'Satélite', en: 'Satellite', cls: 'bg-[#E3EEF7] text-[#17699A]' },
  weather: { es: 'Clima', en: 'Weather', cls: 'bg-[#F6E9D9] text-[#8A5A12]' },
}

const STORE_KEY = 's2p-alerts-read'
function loadRead(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} }
}
function saveRead(v: Record<string, string[]>) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(v)) } catch { /* sin almacenamiento: queda en memoria */ }
}

const alertId = (a: Alert) => `${a.date}|${a.type}|${a.plotId}`

function BellIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

function KindIcon({ kind }: { kind: Kind }) {
  return kind === 'satellite' ? (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 7 9 3 5 7l4 4" /><path d="m17 11 4 4-4 4-4-4" /><path d="m8 12 4 4 6-6-4-4Z" /><path d="m16 8 3-3" /><path d="M9 21a6 6 0 0 0-6-6" />
    </svg>
  ) : (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 16.6A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.3" /><path d="m13 11-4 6h6l-4 6" />
    </svg>
  )
}

export default function AlertsButton({ clientId, owner, field }: { clientId: string; owner: string; field: Field }) {
  const { x, lang, setClientId, go } = useApp()
  const [open, setOpen] = useState(false)
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [read, setRead] = useState<string[]>(() => loadRead()[clientId] ?? [])
  const [pos, setPos] = useState<{ left: number; width: number; maxH: number; top?: number; bottom?: number } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)

  // Ubica el popup en pantalla: debajo del botón si entra, si no arriba; nunca se sale de la ventana
  const place = () => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const m = 16
    const width = Math.min(416, window.innerWidth - m * 2)
    const left = Math.min(Math.max(r.right - width, m), window.innerWidth - width - m)
    const below = window.innerHeight - r.bottom - m
    const above = r.top - m
    if (below >= 420 || below >= above) setPos({ left, width, top: r.bottom + 8, maxH: below - 8 })
    else setPos({ left, width, bottom: window.innerHeight - r.top + 8, maxH: above - 8 })
  }
  const items = useMemo(
    () => [...field.alerts].sort((a, b) => b.date.localeCompare(a.date)).map((a) => ({ a, id: alertId(a), kind: kindOf(a) })),
    [field.alerts],
  )
  const unread = items.filter((i) => !read.includes(i.id))
  const shown = onlyUnread ? unread : items

  const persist = (next: string[]) => {
    setRead(next)
    const all = loadRead()
    all[clientId] = next
    saveRead(all)
  }
  const markRead = (id: string) => { if (!read.includes(id)) persist([...read, id]) }
  const markAll = () => persist(items.map((i) => i.id))

  // Cerrar con clic afuera o con Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true)
    }
  }, [open])

  const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(lang === 'es' ? 'es-UY' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const plotLabel = (p: string) => `${x('Parcela', 'Plot')} ${p.replace(/^P/, '')}`
  const goTo = (id: string, view: 'monitor' | 'field') => { markRead(id); setClientId(clientId); setOpen(false); go(view) }

  return (
    <div ref={wrap} className="relative">
      <button
        ref={btn}
        title={x('Alertas', 'Alerts')}
        className={`btn relative flex h-11 w-11 items-center justify-center !p-0 ${open ? 'border-[#2E7D4F] bg-[#E8F1E9]' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread.length ? x(`Alertas, ${unread.length} sin leer`, `Alerts, ${unread.length} unread`) : x('Alertas, todas leídas', 'Alerts, all read')}
        onClick={() => { place(); setOpen((o) => !o) }}
      >
        <BellIcon />
        {unread.length > 0 && (
          <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#D93025]" />
        )}
      </button>

      {open && pos && (
        <section
          role="dialog"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
          aria-label={x(`Alertas de ${owner}`, `Alerts for ${owner}`)}
          className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-[#E1E6DF] bg-white shadow-[0_24px_60px_rgba(23,33,28,0.22)]"
        >
          <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
            <div>
              <h3 className="font-title text-lg font-extrabold">{x('Alertas', 'Alerts')}</h3>
              <p className="text-sm text-mute">{owner} · {unread.length} {x('sin leer', 'unread')}</p>
            </div>
            <button className="btn h-9 w-9 !p-0 text-lg leading-none" aria-label={x('Cerrar alertas', 'Close alerts')} onClick={() => setOpen(false)}>×</button>
          </header>

          <div className="flex items-center gap-2 px-5 pb-3">
            <button className={`chip ${!onlyUnread ? 'chip-on' : ''}`} onClick={() => setOnlyUnread(false)}>{x('Todas', 'All')} · {items.length}</button>
            <button className={`chip ${onlyUnread ? 'chip-on' : ''}`} onClick={() => setOnlyUnread(true)}>{x('Sin leer', 'Unread')} · {unread.length}</button>
            {unread.length > 0 && (
              <button className="ml-auto text-sm font-semibold text-[#2E7D4F] hover:underline" onClick={markAll}>{x('Marcar todo como leído', 'Mark all as read')}</button>
            )}
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {shown.length === 0 && <li className="border-t border-[#E8ECE6] px-5 py-6 text-sm text-mute">{x('No hay alertas sin leer.', 'No unread alerts.')}</li>}
            {shown.map(({ a, id, kind }) => {
              const isUnread = !read.includes(id)
              const t = TITLES[a.type]
              return (
                <li key={id} className={`flex gap-3 border-t border-[#E8ECE6] px-5 py-4 ${isUnread ? 'bg-[#F4F8F2]' : 'bg-white'}`}>
                  {isUnread ? <span className="mt-2 h-2.5 w-2.5 flex-none rounded-full bg-[#D93025]" aria-label={x('Sin leer', 'Unread')} /> : <span className="h-2.5 w-2.5 flex-none" aria-hidden="true" />}
                  <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${KIND[kind].cls}`}><KindIcon kind={kind} /></div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${KIND[kind].cls}`}>{lang === 'es' ? KIND[kind].es : KIND[kind].en}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LEVEL[a.level].cls}`}>{lang === 'es' ? LEVEL[a.level].es : LEVEL[a.level].en}</span>
                      <span className="ml-auto text-xs text-mute">{fmtDate(a.date)}</span>
                    </div>
                    <p className={`text-sm ${isUnread ? 'font-bold' : 'font-medium'}`}>{t ? (lang === 'es' ? t[0] : t[1]) : a.type} · {plotLabel(a.plotId)}</p>
                    <p className="text-sm text-[#4A5A52]">{a.message}</p>
                    <p className="text-xs text-mute">{x('Fuente', 'Source')}: {a.source}</p>
                    <div className="flex flex-wrap gap-3 pt-1">
                      <button className="text-sm font-semibold text-[#2E7D4F] hover:underline" onClick={() => goTo(id, kind === 'weather' ? 'field' : 'monitor')}>
                        {kind === 'weather' ? x('Ver en el mapa', 'View on map') : x('Ver en Seguimiento', 'View in Monitoring')} →
                      </button>
                      {isUnread && <button className="text-sm text-mute hover:underline" onClick={() => markRead(id)}>{x('Marcar como leída', 'Mark as read')}</button>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          <footer className="flex items-center justify-between border-t border-[#E8ECE6] bg-[#FAFBF8] px-5 py-3 text-sm">
            <span className="text-mute">{x('Notificaciones al celular: próximamente', 'Phone notifications: coming soon')}</span>
          </footer>
        </section>
      )}
    </div>
  )
}
