import { createContext, type ReactNode } from 'react'

/** The view tabs, rendered by BiWorkspace and placed under the page title by BiPageHeader. */
export const BiTabsContext = createContext<ReactNode>(null)
