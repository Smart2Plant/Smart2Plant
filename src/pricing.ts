import type { MonPlan } from './store'

// Monitoring plans (tentative prices, to validate in a pilot)
export const STEP: Record<MonPlan, number> = { weekly: 7, biweekly: 14, monthly: 30 }
export const PRICE_USD: Record<MonPlan, number> = { monthly: 0, biweekly: 19, weekly: 29 }
export const PRICE: Record<MonPlan, string> = { monthly: 'USD 0', biweekly: 'USD 19', weekly: 'USD 29' }
export const PLAN_ORDER: MonPlan[] = ['monthly', 'biweekly', 'weekly']
