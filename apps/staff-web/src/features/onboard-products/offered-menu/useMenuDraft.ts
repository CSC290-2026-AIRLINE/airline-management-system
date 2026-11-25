import { useState } from 'react'
import type { Product, ProductOffering } from '../api/types'

type MenuItem = Pick<ProductOffering, 'id' | 'productId' | 'isActive' | 'isDefault'>
type StagedItem = MenuItem & { makeDefault: boolean }

export function useMenuDraft(scopeKey: string, savedMenu: ProductOffering[], meals: Product[]) {
  const [drafts, setDrafts] = useState<Record<string, StagedItem[]>>({})
  const draft = drafts[scopeKey] ?? []
  const stagedIds = new Set(draft.map((row) => row.productId))
  const defaultChange = draft.find((row) => row.isDefault)
  const menu = [
    ...savedMenu.filter((row) => !stagedIds.has(row.productId)).map((row) => (defaultChange ? { ...row, isDefault: false } : row)),
    ...draft,
  ]
  const changes = draft
    .map((row) => {
      const saved = savedMenu.find((offering) => offering.productId === row.productId)
      return {
        ...row,
        availabilityChanged: row.isActive !== (saved?.isActive ?? false),
        defaultChanged: row.isDefault && !saved?.isDefault,
      }
    })
    .filter((row) => row.availabilityChanged || row.defaultChanged)

  function stage(productId: string, isActive: boolean, makeDefault = false) {
    const isMeal = meals.some((meal) => meal.id === productId)
    const hasActiveMeal = menu.some((row) => row.isActive && meals.some((meal) => meal.id === row.productId))
    const isDefault =
      isActive &&
      isMeal &&
      (makeDefault ||
        !hasActiveMeal ||
        menu.some((row) => row.productId === productId && row.isDefault) ||
        (!menu.some((row) => row.isDefault) && savedMenu.some((row) => row.productId === productId && row.isDefault)))
    const row: StagedItem = {
      id: `draft-${productId}`,
      productId,
      isActive,
      isDefault,
      makeDefault,
    }
    setDrafts((current) => ({
      ...current,
      [scopeKey]: [
        ...(current[scopeKey] ?? [])
          .filter((item) => item.productId !== productId)
          .map((item) => (isDefault && item.isDefault ? { ...item, isDefault: false, makeDefault: false } : item)),
        row,
      ],
    }))
  }

  return { menu, changes, stage, defaultOfferingId: menu.find((row) => row.isActive && row.isDefault)?.id ?? null }
}
