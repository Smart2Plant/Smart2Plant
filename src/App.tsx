import type React from 'react'
import { Logo } from './components/Logo'
import { motion } from 'framer-motion'
import { useApp } from './store'
import type { View } from './types'
import Portfolio from './screens/Portfolio'
import FieldSetup from './screens/FieldSetup'
import Predict from './screens/Predict'
import Monitor from './screens/Monitor'
import Reports from './screens/Reports'
import Home from './screens/Home'

const NAV: View[] = ['home', 'portfolio', 'field', 'predict', 'monitor', 'reports']

function Header() {
  const { x, view, go, lang, setLang, clients, clientId, setClientId } = useApp()
  const label: Record<View, string> = {
    home: x('Inicio', 'Home'), portfolio: x('Mis campos', 'My fields'), field: x('1 · Campo y parcelas', '1 · Field and plots'), predict: x('2 · Predicción', '2 · Prediction'),
    monitor: x('3 · Seguimiento satelital', '3 · Satellite monitoring'), reports: x('4 · Informes', '4 · Reports'),
  }
  return (
    <header className="sticky top-0 z-[900] border-b border-line bg-forest text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5">
        <button onClick={() => go('home')} aria-label="Smart2Plant">
          <Logo tone="dark" size={38} slogan x={x} />
        </button>
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">{x('Para agrónomos', 'For agronomists')}</span>
        <span className="rounded-full border border-white/40 px-2 py-0.5 text-[11px]">{x('Datos de demostración', 'Demo data')}</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="sr-only" htmlFor="cl">{x('Campo', 'Field')}</label>
          {!['home', 'portfolio'].some(v => v == view) && <select id="cl" value={clientId} onChange={(e) => setClientId(e.target.value)} className="!border-white/30 !bg-forest text-sm text-white">
            {clients.map((c) => <option key={c.id} value={c.id}>{c.owner}</option>)}
          </select>
          }
          <div className="flex overflow-hidden rounded-lg border border-white/30 text-sm font-semibold" role="group" aria-label="Language">
            {(['es', 'en'] as const).map((l) => <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={`px-2.5 py-1 ${lang === l ? 'bg-white text-forest' : ''}`}>{l.toUpperCase()}</button>)}
          </div>
        </div>
      </div>
      <nav className="border-t border-white/10 bg-[#1A4330] text-white" aria-label="Main">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
          {NAV.map((v) => (
            <button key={v} onClick={() => go(v)} aria-current={view === v ? 'page' : undefined}
              className={`whitespace-nowrap border-b-[3px] px-3 py-2.5 font-title text-[15px] ${view === v ? 'border-[#6CC4EE] font-bold text-white' : 'border-transparent text-white/70 hover:text-white'}`}>
              {label[v]}
            </button>
          ))}
        </div>
      </nav>
    </header>
  )
}

function Footer() {
  const { x } = useApp()
  return (
    <footer className="mt-10 border-t border-line bg-white">
      <div className="mx-auto max-w-7xl space-y-1 px-4 py-5 text-sm text-mute">
        <p className="font-semibold text-ink">{x('Herramienta informativa: sugiere, el agrónomo y el productor deciden.', 'Informative tool: it suggests, the agronomist and the farmer decide.')}</p>
      </div>
    </footer>
  )
}

export default function App() {
  const { view, reducedMotion } = useApp()
  const screens: Record<View, React.ReactElement> = {
    home: <Home />, portfolio: <Portfolio />, field: <FieldSetup />, predict: <Predict />, monitor: <Monitor />, reports: <Reports />,
  }
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <motion.div key={view} initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          {screens[view]}
        </motion.div>
      </main>
      <Footer />
    </div>
  )
}
