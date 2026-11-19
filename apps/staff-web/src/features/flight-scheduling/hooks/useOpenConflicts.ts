import { useEffect, useRef } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type { ConflictRow } from '../types'
import { useOnChange } from './fsChange'
import { useResource } from './useResource'

// How many conflicts are open, from GET /conflicts (open ones only). `count` is null until the first answer. Pass a value in `refreshOn` to
// ask again whenever it changes, for example the current tab, so the number follows a resolved or dismissed conflict.
export function useOpenConflicts(refreshOn?: unknown) {
  const { fetchWithAuth } = useAppAuth()
  const res = useResource<ConflictRow[]>('/conflicts', fetchWithAuth)
  const reload = useRef(res.reload)
  const first = useRef(true)
  useEffect(() => {
    reload.current = res.reload
  })
  useEffect(() => {
    if (first.current) first.current = false
    else reload.current()
  }, [refreshOn])
  useOnChange('conflicts', () => reload.current())
  return { count: res.data ? res.data.length : null }
}
