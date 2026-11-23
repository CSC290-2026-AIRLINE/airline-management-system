import type { TierCode } from '../api/types'

// Badge and tile colours per tier, shared by the staff pages. Kept out of the .tsx files so fast refresh works.
export const TIER_TONE: Record<TierCode, string> = {
  silver: 'bg-slate-100 text-slate-700',
  gold: 'bg-amber-100 text-amber-800',
  platinum: 'bg-violet-100 text-violet-800',
}
