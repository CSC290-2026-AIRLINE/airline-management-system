import { createFileRoute } from '@tanstack/react-router'
import { CargoSettingsPage } from '@staff-web/features/cargo/CargoSettingsPage'

const VALID_TABS = ['commodity-types', 'rates', 'prohibited-items', 'settings'] as const

export type CargoSettingsTab = (typeof VALID_TABS)[number]

export const Route = createFileRoute('/_authenticated/cargo/settings')({
  component: CargoSettingsPage,
  validateSearch: (search: Record<string, unknown>): { tab: CargoSettingsTab } => {
    const raw = search.tab
    const tab = VALID_TABS.includes(raw as CargoSettingsTab) ? (raw as CargoSettingsTab) : 'commodity-types'
    return { tab }
  },
})
