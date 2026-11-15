import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Field, FieldSummary, Lang, View } from './types'
import { bundledIndex, loadField, loadIndex } from './data'
import { defaultParcels, fieldLatLngs, type LatLng, type Parcel, type ParcelPlan, type PlanKind, type Scenario } from './agro'

const VIEWS: View[] = ['home', 'portfolio', 'field', 'predict', 'monitor', 'reports']
function readHash(): View {
  const h = window.location.hash.replace('#', '') as View
  return VIEWS.includes(h) ? h : 'home'
}

export type MonPlan = 'weekly' | 'biweekly' | 'monthly'
export interface Client {
  id: string
  owner: string // client (producer / landowner)
  fieldId: string // demo NASA data set used for this field
  poly: LatLng[]
  parcels: Parcel[]
  monPlan: MonPlan
}

const OWNERS: Record<string, string> = { soriano: 'Estancia La Esperanza S.A.', colonia: 'Familia Rodríguez', paysandu: 'Agro Santa Clara' }
const PLANS: Record<string, MonPlan> = { soriano: 'weekly', colonia: 'monthly', paysandu: 'biweekly' }

interface Ctx {
  view: View
  go: (v: View) => void
  lang: Lang
  setLang: (l: Lang) => void
  x: (es: string, en: string) => string
  index: FieldSummary[]
  fields: Record<string, Field>
  clients: Client[]
  clientId: string
  setClientId: (id: string) => void
  client: Client | null
  field: Field | null
  updateClient: (c: Client) => void
  sel: number
  setSel: (i: number) => void
  scenario: Scenario
  setScenario: (s: Scenario) => void
  reducedMotion: boolean
  activePlan: PlanKind
  setActivePlan: (k: PlanKind) => void
  variantEdits: Record<string, Partial<Record<PlanKind, ParcelPlan[]>>>
  setVariant: (clientId: string, k: PlanKind, plans: ParcelPlan[] | undefined) => void
}

const AppCtx = createContext<Ctx | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>(readHash())
  const [lang, setLangState] = useState<Lang>(() => {
    try { return (localStorage.getItem('cc-lang') as Lang) || 'es' } catch { return 'es' }
  })
  const [index, setIndex] = useState<FieldSummary[]>(bundledIndex)
  const [fields, setFields] = useState<Record<string, Field>>({})
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState('soriano')
  const [sel, setSel] = useState(0)
  const [scenario, setScenario] = useState<Scenario>('normal')
  const [activePlan, setActivePlan] = useState<PlanKind>('requested')
  const [variantEdits, setVariantEdits] = useState<Record<string, Partial<Record<PlanKind, ParcelPlan[]>>>>({})
  const setVariant = (cid: string, k: PlanKind, plans: ParcelPlan[] | undefined) =>
    setVariantEdits((v) => ({ ...v, [cid]: { ...(v[cid] ?? {}), [k]: plans } }))
  const reducedMotion = useMemo(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
  }, [])

  useEffect(() => {
    const on = () => setView(readHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    loadIndex().then(async (idx) => {
      setIndex(idx)
      const loaded = await Promise.all(idx.map((f) => loadField(f.id)))
      const map: Record<string, Field> = {}
      loaded.forEach((f) => { map[f.id] = f })
      setFields(map)
      setClients(loaded.map((f) => ({ id: f.id, owner: OWNERS[f.id] ?? f.name, fieldId: f.id, poly: fieldLatLngs(f), parcels: defaultParcels(f), monPlan: PLANS[f.id] ?? 'monthly' })))
    })
  }, [])
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  useEffect(() => { setSel(0); setActivePlan('requested') }, [clientId])

  const go = (v: View) => {
    if (window.location.hash !== `#${v}`) window.location.hash = v
    setView(v)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }
  const setLang = (l: Lang) => {
    setLangState(l)
    try { localStorage.setItem('cc-lang', l) } catch { /* storage unavailable */ }
  }
  const x = (es: string, en: string) => (lang === 'es' ? es : en)
  const client = clients.find((c) => c.id === clientId) ?? null
  const field = client ? fields[client.fieldId] ?? null : null
  const updateClient = (c: Client) => setClients((cs) => cs.map((o) => (o.id === c.id ? c : o)))

  return (
    <AppCtx.Provider value={{ view, go, lang, setLang, x, index, fields, clients, clientId, setClientId, client, field, updateClient, sel, setSel, scenario, setScenario, reducedMotion, activePlan, setActivePlan, variantEdits, setVariant }}>
      {children}
    </AppCtx.Provider>
  )
}

export function useApp() {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp outside provider')
  return c
}
