// Product list for the active category tab. Meals use the table UI
// from page 2 (single-select per passenger, with eyebrow + header row);
// snacks, drinks and duty-free use a table layout with a quantity
// stepper so the same product can be added multiple times. The
// "Default meal" pseudo-product is rendered with the catalogue's
// thumbnailColor (a green tint in the dev mock) to match the Figma.

import { Minus, Plus } from 'lucide-react'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@customer-web/components/ui/radio-group'
import { cn } from '@customer-web/lib/utils'
import type { Product } from './types'
import { formatMoney } from './format'

interface Props {
  products: Product[]
  selectedMealProductId: string | null
  quantities: Map<string, number>
  currency: string
  onSelectMeal: (productId: string) => void
  onAddOne: (productId: string) => void
  onRemoveOne: (productId: string) => void
  disabled?: boolean
}

export function ProductList(props: Props) {
  if (props.products.length === 0) return null
  const mode = props.products[0].category === 'meal' ? 'meal' : 'addon'
  if (mode === 'meal') {
    return (
      <MealRadioList
        products={props.products}
        selectedId={props.selectedMealProductId}
        onSelect={props.onSelectMeal}
        disabled={!!props.disabled}
      />
    )
  }
  return (
    <AddonTableList
      products={props.products}
      quantities={props.quantities}
      currency={props.currency}
      onAdd={props.onAddOne}
      onRemove={props.onRemoveOne}
      disabled={!!props.disabled}
    />
  )
}

function MealRadioList({
  products,
  selectedId,
  onSelect,
  disabled,
}: {
  products: Product[]
  selectedId: string | null
  onSelect: (id: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-col border-t">
      <RadioGroup value={selectedId ?? ''} onValueChange={(value) => onSelect(String(value))} disabled={disabled} className="gap-0">
        {products.map((p) => {
          const isSelected = p.id === selectedId
          return (
            <label
              key={p.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-muted sm:px-6',
                isSelected && 'bg-secondary hover:bg-secondary',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <RadioGroupItem value={p.id} />
              <ProductThumb imageUrl={p.imageUrl} color={p.thumbnailColor} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold">{p.name}</span>
                  {p.isPremium ? <Badge variant="warning">Premium</Badge> : null}
                  {p.typeCode ? <Badge variant="outline">{p.typeCode}</Badge> : null}
                </span>
                {p.description ? <span className="text-sm text-muted-foreground">{p.description}</span> : null}
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {p.unitPrice === 0 ? 'Free' : formatMoney(p.unitPrice, 'USD')}
              </span>
            </label>
          )
        })}
      </RadioGroup>
    </div>
  )
}

function AddonTableList({
  products,
  quantities,
  currency,
  onAdd,
  onRemove,
  disabled,
}: {
  products: Product[]
  quantities: Map<string, number>
  currency: string
  onAdd: (id: string) => void
  onRemove: (id: string) => void
  disabled: boolean
}) {
  return (
    <ul className="m-0 flex list-none flex-col border-t p-0">
      {products.map((p) => {
        const qty = quantities.get(p.id) ?? 0
        return (
          <li key={p.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-6">
            <ProductThumb imageUrl={p.imageUrl} color={p.thumbnailColor} />
            <span className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
              <span className="text-sm font-medium">{p.name}</span>
              {p.description ? <span className="text-sm text-muted-foreground">{p.description}</span> : null}
            </span>
            <span className="shrink-0 text-sm font-medium tabular-nums">
              {p.unitPrice === 0 ? 'Free' : formatMoney(p.unitPrice, currency)}
            </span>
            <span className="flex w-28 shrink-0 justify-end">
              {qty > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border bg-secondary p-0.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="rounded-full"
                    aria-label={`Remove one ${p.name}`}
                    onClick={() => onRemove(p.id)}
                    disabled={disabled}
                  >
                    <Minus />
                  </Button>
                  <span className="min-w-6 text-center text-sm font-medium tabular-nums" aria-live="polite">
                    {qty}
                  </span>
                  <Button
                    type="button"
                    size="icon-sm"
                    className="rounded-full"
                    aria-label={`Add one more ${p.name}`}
                    onClick={() => onAdd(p.id)}
                    disabled={disabled}
                  >
                    <Plus />
                  </Button>
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full px-4"
                  aria-label={`Add ${p.name}`}
                  onClick={() => onAdd(p.id)}
                  disabled={disabled}
                >
                  Add
                </Button>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// Product thumbnail, shown only when the product has a photo.
function ProductThumb({ imageUrl, color }: { imageUrl: string | null; color: string }) {
  // No photo yet: show nothing rather than an empty colour block.
  if (!imageUrl) return null
  return (
    <span
      className="relative hidden size-12 flex-none overflow-hidden rounded-md sm:inline-block"
      style={{ background: color }}
      aria-hidden="true"
    >
      {imageUrl ? (
        <img
          className="pointer-events-none absolute top-1/2 left-1/2 block -translate-x-1/2 -translate-y-1/2"
          src={imageUrl}
          alt=""
          width={72}
          height={40}
        />
      ) : null}
    </span>
  )
}
