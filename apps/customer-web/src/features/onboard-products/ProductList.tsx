// Product list for the active category tab. Meals use the table UI
// from page 2 (single-select per passenger, with eyebrow + header row);
// snacks, drinks and duty-free use a table layout with a quantity
// stepper so the same product can be added multiple times. The
// "Default meal" pseudo-product is rendered with the catalogue's
// thumbnailColor (a green tint in the dev mock) to match the Figma.

import type { Product } from './types'
import { formatMoney } from './format'

interface Props {
  products: Product[]
  selectedMealProductId: string | null
  quantities: Map<string, number>
  passengerFirstName: string
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
        passengerFirstName={props.passengerFirstName}
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
  passengerFirstName,
  onSelect,
  disabled,
}: {
  products: Product[]
  selectedId: string | null
  passengerFirstName: string
  onSelect: (id: string) => void
  disabled: boolean
}) {
  return (
    <div className="border-t border-[#e8edf3] flex flex-col">
      <div className="bg-[#f8fafc] text-muted-foreground font-sans text-xs font-semibold tracking-[0.48px] uppercase px-6 py-2.5 border-b border-[#e8edf3]">
        Meal for {passengerFirstName.toUpperCase()}
      </div>
      <div
        className="bg-[#f8fafc] grid items-center gap-3.5 px-6 py-2 text-muted-foreground text-xs font-semibold tracking-[0.48px] uppercase border-b border-[#e8edf3]"
        style={{ gridTemplateColumns: '22px 64px minmax(0, 1fr) 64px 72px' }}
        aria-hidden="true"
      >
        <span />
        <span />
        <span className="whitespace-nowrap text-left">Meal</span>
        <span className="whitespace-nowrap text-left">Type</span>
        <span className="whitespace-nowrap text-right">Price</span>
      </div>
      {products.map((p) => {
        const isSelected = p.id === selectedId
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            data-selected={isSelected}
            className="grid items-center gap-3.5 px-6 py-3 bg-white border-0 border-b border-[#e8edf3] text-left font-sans text-inherit cursor-pointer w-full relative transition-colors hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px] disabled:opacity-60 disabled:cursor-not-allowed data-[selected=true]:bg-[#e8eef7] data-[selected=true]:hover:bg-[#e8eef7] before:content-[''] before:absolute before:left-0 before:top-[-1px] before:bottom-[-1px] before:w-[3px] data-[selected=true]:before:bg-primary"
            style={{ gridTemplateColumns: '22px 64px minmax(0, 1fr) 64px 72px' }}
            onClick={() => onSelect(p.id)}
            disabled={disabled}
          >
            <span
              className="w-[22px] h-[22px] rounded-[11px] border-2 bg-white inline-flex items-center justify-center flex-none data-[selected=true]:border-primary"
              data-selected={isSelected}
              aria-hidden="true"
            >
              {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
            </span>
            <ProductThumb imageUrl={p.imageUrl} color={p.thumbnailColor} />
            <span className="flex flex-col min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="text-foreground text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{p.name}</span>
                {p.isPremium && (
                  <span className="bg-[#fff4db] text-[#8a5300] font-mono text-[11px] font-normal rounded-md px-1.5 py-0.5 whitespace-nowrap">
                    Premium
                  </span>
                )}
              </span>
              <span className="text-muted-foreground text-[13px] leading-[1.4] mt-0.5 line-clamp-1">{p.description}</span>
            </span>
            <span className="font-mono text-xs font-normal text-[#1d4ed8] whitespace-nowrap">{p.typeCode ?? ''}</span>
            <span className="font-mono text-sm font-medium text-primary tabular-nums text-right whitespace-nowrap">
              {p.unitPrice === 0 ? 'Free' : formatMoney(p.unitPrice, 'USD')}
            </span>
          </button>
        )
      })}
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
    <div className="flex flex-col border-y border-[#e8edf3]">
      <div
        className="grid items-center gap-3.5 px-6 py-2 bg-[#f8fafc] text-muted-foreground text-xs font-semibold tracking-[0.48px] uppercase border-b border-[#e8edf3]"
        style={{ gridTemplateColumns: '64px minmax(0, 1fr) 72px 120px' }}
        role="row"
      >
        <span aria-hidden="true" />
        <span className="min-w-0 text-left">Item</span>
        <span className="min-w-0 text-right">Price</span>
        <span className="min-w-0 text-right">Quantity</span>
      </div>
      <ul className="list-none m-0 p-0 flex flex-col">
        {products.map((p) => {
          const qty = quantities.get(p.id) ?? 0
          return (
            <li
              key={p.id}
              className="grid items-center gap-3.5 px-6 py-3 bg-white border-0 border-b border-[#e8edf3]"
              style={{ gridTemplateColumns: '64px minmax(0, 1fr) 72px 120px' }}
            >
              <ProductThumb imageUrl={p.imageUrl} color={p.thumbnailColor} />
              <span className="flex flex-col min-w-0 text-left">
                <span className="text-foreground text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">{p.name}</span>
                <span className="text-muted-foreground text-[13px] leading-[1.4] mt-0.5 line-clamp-1">{p.description}</span>
              </span>
              <span className="text-primary font-mono text-sm font-medium tabular-nums text-right">
                {p.unitPrice === 0 ? 'Free' : formatMoney(p.unitPrice, currency)}
              </span>
              <span className="flex justify-end items-center">
                {qty > 0 ? (
                  <span
                    className="inline-flex items-center gap-1 border border-primary rounded-full p-0.5 bg-[#e8eef7] data-[disabled=true]:opacity-55 data-[disabled=true]:pointer-events-none"
                    data-disabled={disabled || undefined}
                  >
                    <button
                      type="button"
                      className="w-8 h-8 inline-flex items-center justify-center bg-white border-0 rounded-full font-sans text-lg font-medium text-primary cursor-pointer p-0 leading-none hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1"
                      aria-label={`Remove one ${p.name}`}
                      onClick={() => onRemove(p.id)}
                      disabled={disabled}
                    >
                      −
                    </button>
                    <span className="min-w-6 text-center text-primary font-mono text-sm font-medium tabular-nums" aria-live="polite">
                      {qty}
                    </span>
                    <button
                      type="button"
                      className="w-8 h-8 inline-flex items-center justify-center bg-primary border-0 rounded-full font-sans text-lg font-medium text-white cursor-pointer p-0 leading-none hover:bg-[#1c3556] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1"
                      aria-label={`Add one more ${p.name}`}
                      onClick={() => onAdd(p.id)}
                      disabled={disabled}
                    >
                      +
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.5 rounded-full px-[18px] py-2 text-sm font-semibold bg-primary text-primary-foreground border border-primary hover:bg-[#1c3556] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    onClick={() => onAdd(p.id)}
                    aria-label={`Add ${p.name}`}
                    disabled={disabled}
                  >
                    Add
                  </button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// 48×48 product thumbnail. When the product has an illustration URL,
// render it inside a 72×40 frame so the wider artwork extends past the
// rounded clip (matching the Figma's "Illustration" layer). When
// `imageUrl` is null, fall back to the placeholder color.
function ProductThumb({ imageUrl, color }: { imageUrl: string | null; color: string }) {
  return (
    <span className="relative inline-block w-12 h-12 rounded-md flex-none overflow-hidden" style={{ background: color }} aria-hidden="true">
      {imageUrl ? (
        <img
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 block pointer-events-none"
          src={imageUrl}
          alt=""
          width={72}
          height={40}
        />
      ) : null}
    </span>
  )
}
