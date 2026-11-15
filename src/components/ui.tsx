import type { ReactNode } from 'react'
import { useApp } from '../store'

export function Src({ s }: { s: string }) {
  return <span className="tag" title="Fuente de datos / Data source">🛰 {s}</span>
}

export function Conf({ kind }: { kind: 'observed' | 'modeled' | 'assumed' }) {
  const { x } = useApp()
  const t = { observed: x('Observado', 'Observed'), modeled: x('Modelado', 'Modeled'), assumed: x('Supuesto', 'Assumed') }[kind]
  const c = { observed: 'border-teal text-teal', modeled: 'border-leaf text-leaf', assumed: 'border-mute text-mute' }[kind]
  return <span className={`tag ${c}`}>{t}</span>
}

export const LEVEL_COLORS = ['#2E7D4F', '#B9770E', '#B23A2E', '#7A1F16']
export function Level({ n }: { n: number }) {
  const { x } = useApp()
  const words = [x('Bajo', 'Low'), x('Medio', 'Medium'), x('Alto', 'High'), x('Muy alto', 'Very high')]
  return <span className="pill" style={{ background: LEVEL_COLORS[Math.max(0, Math.min(3, n))] }}>{words[Math.max(0, Math.min(3, n))]}</span>
}

export function Status({ tone, children }: { tone: 'good' | 'warn' | 'crit'; children: ReactNode }) {
  const bg = { good: '#2E7D4F', warn: '#B9770E', crit: '#B23A2E' }[tone]
  return <span className="pill" style={{ background: bg }}>{children}</span>
}

export function PageTitle({ step, title, sub, right }: { step?: string; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {step && <p className="label">{step}</p>}
        <h1 className="font-title text-3xl font-extrabold leading-tight">{title}</h1>
        {sub && <p className="mt-1 text-mute">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function Loading() {
  const { x } = useApp()
  return <div className="grid h-64 place-items-center text-mute">{x('Cargando datos satelitales…', 'Loading satellite data…')}</div>
}

export const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function useMonth() {
  const { lang } = useApp()
  return (m: number) => (lang === 'es' ? MONTHS_ES : MONTHS_EN)[(m - 1 + 12) % 12]
}
export function ymLabel(ym: string, lang: 'es' | 'en') {
  const [y, m] = ym.split('-').map(Number)
  return `${(lang === 'es' ? MONTHS_ES : MONTHS_EN)[m - 1]} ${String(y).slice(2)}`
}
