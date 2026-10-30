import type { TierCode, TransactionType } from '../api/types'
import styles from './loyalty.module.css'

// Constants shared by the Feature 11 customer pages (kept out of parts.tsx so fast refresh works).

// Flight search and My Trips belong to Feature 3; point these at their routes once those pages exist.
export const FLIGHT_SEARCH_PATH = '/'
export const MY_TRIPS_PATH = '/'

export const TYPE_LABEL: Record<TransactionType, string> = {
  earn: 'Earned',
  redeem: 'Spent',
  redeem_reversal: 'Returned',
  expire: 'Expired',
  adjust: 'Adjusted',
}

export const TIER_ART: Record<TierCode, string> = { silver: styles.tierSilver, gold: styles.tierGold, platinum: styles.tierPlatinum }
