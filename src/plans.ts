import { useMemo } from 'react'
import { useApp } from './store'
import { SCENARIOS, areaHa, balancedPlans, parcelTerrain, recommendedPlans, simulate, type ParcelPlan, type PlanKind, type Scenario, type SimResult } from './agro'

/** Shared access to the three plan variants (requested / recommended / balanced) of the current client. */
export function usePlans() {
  const { client, field, variantEdits } = useApp()
  const base = useMemo(() => {
    if (!client || !field || !client.parcels.length) return null
    const rec = recommendedPlans(field, client.poly, client.parcels)
    return { rec, bal: balancedPlans(field, client.poly, client.parcels, rec) }
  }, [client?.parcels.length, client?.poly, field])
  const edits = client ? variantEdits[client.id] ?? {} : {}
  const plansOf = (k: PlanKind): ParcelPlan[] =>
    !client || !base ? [] : k === 'requested' ? client.parcels.map((p) => p.plan) : (edits[k] && edits[k]!.length === client.parcels.length ? edits[k]! : k === 'recommended' ? base.rec : base.bal)
  const evalPlan = (plans: ParcelPlan[]) => !client || !field ? [] : client.parcels.map((p, k) => {
    const pp = { ...p, plan: plans[k] ?? p.plan }
    const t = parcelTerrain(field, client.poly, p.poly)
    const sims = Object.fromEntries(SCENARIOS.map((s) => [s, simulate(field, pp.plan, t.slopePct, s)])) as Record<Scenario, SimResult>
    return { p: pp, t, ha: areaHa(p.poly), sims }
  })
  return { base, edits, plansOf, evalPlan }
}
