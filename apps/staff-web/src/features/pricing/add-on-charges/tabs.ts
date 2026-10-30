// Kept out of AddOnChargesPage.tsx so the route file can validate ?tab= without importing a component module's constants.
export const ADD_ON_TABS = ['seat-fees'] as const
export type AddOnTab = (typeof ADD_ON_TABS)[number]

export function isAddOnTab(value: unknown): value is AddOnTab {
  return (ADD_ON_TABS as readonly unknown[]).includes(value)
}
