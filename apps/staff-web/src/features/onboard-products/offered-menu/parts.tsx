// Shared building blocks of the Route detail and Network default pages: the cabin tiles, the rules form and the menu panel.

import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { Toggle } from '@staff-web/components/ui/toggle'
import { cn } from '@staff-web/lib/utils'
import type { Product, ProductOffering } from '../api/types'
import { SegmentedControl } from './SegmentedControl'
import { ToggleSwitch } from './ToggleSwitch'

export interface RulesDraft {
  mealService: 'complimentary' | 'paid' | 'none'
  mealSelection: 'choose' | 'fixed'
  includedPerPassenger: number
  preorderEnabled: boolean
  orderWindowHours: number
  premiumMealsAllowed: boolean
  snacksEnabled: boolean
  dutyFreeEnabled: boolean
  onboardBufferPercent: number
}

/** One cabin as a selectable tile: name, a status badge and a two-line summary. */
export function CabinTile({
  name,
  badge,
  badgeTone = 'outline',
  headline,
  subline,
  active,
  onClick,
}: {
  name: string
  badge: string
  badgeTone?: 'outline' | 'secondary'
  headline: string
  subline: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active && 'border-primary ring-1 ring-primary',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold">{name}</span>
        <Badge variant={badgeTone}>{badge}</Badge>
      </span>
      <span className="text-sm">{headline}</span>
      <span className="text-xs text-muted-foreground">{subline}</span>
    </button>
  )
}

function SettingRow({ label, description, error, children }: { label: string; description: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5 sm:max-w-[40%]">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">{description}</span>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
      <div className="sm:w-[58%]">{children}</div>
    </div>
  )
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <p className="m-0 border-b bg-muted px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      {children}
    </div>
  )
}

/** The three groups of cabin rules: meals, ordering and extras. */
export function RulesForm({
  draft,
  errors,
  setField,
}: {
  draft: RulesDraft
  errors: Partial<Record<keyof RulesDraft, string>>
  setField: <K extends keyof RulesDraft>(key: K, value: RulesDraft[K]) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <SettingsGroup title="Meals">
        <SettingRow label="Meal service" description="Whether meals are free, paid or not served." error={errors.mealService}>
          <SegmentedControl
            ariaLabel="Meal service"
            value={draft.mealService}
            onChange={(v) => setField('mealService', v as RulesDraft['mealService'])}
            options={[
              { value: 'complimentary', label: 'Complimentary' },
              { value: 'paid', label: 'Paid' },
              { value: 'none', label: 'None' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Meal selection" description="Whether passengers pick their meal.">
          <SegmentedControl
            ariaLabel="Meal selection"
            value={draft.mealSelection}
            onChange={(v) => setField('mealSelection', v as RulesDraft['mealSelection'])}
            disabled={draft.mealService === 'none'}
            options={[
              { value: 'choose', label: 'Passengers choose' },
              { value: 'fixed', label: 'Fixed meal, no choice' },
            ]}
          />
        </SettingRow>
        <SettingRow
          label="Included meals per passenger"
          description="Meals each passenger gets at no charge."
          error={errors.includedPerPassenger}
        >
          <SegmentedControl
            ariaLabel="Included meals per passenger"
            value={draft.includedPerPassenger}
            onChange={(v) => setField('includedPerPassenger', v)}
            options={[
              { value: 0, label: '0' },
              { value: 1, label: '1' },
              { value: 2, label: '2' },
              { value: 3, label: '3' },
            ]}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Ordering">
        <SettingRow label="Pre-order in the shop" description="Let passengers buy before the flight.">
          <ToggleSwitch
            ariaLabel="Pre-order in the shop"
            checked={draft.preorderEnabled}
            onChange={(v) => setField('preorderEnabled', v)}
          />
        </SettingRow>
        <SettingRow label="Order closes before departure" description="Cutoff for the catering order." error={errors.orderWindowHours}>
          <SegmentedControl
            ariaLabel="Order window"
            value={[24, 48, 72].includes(draft.orderWindowHours) ? draft.orderWindowHours : 48}
            onChange={(v) => setField('orderWindowHours', v)}
            options={[
              { value: 24, label: '24 hours' },
              { value: 48, label: '48 hours' },
              { value: 72, label: '72 hours' },
            ]}
          />
        </SettingRow>
        <SettingRow label="On-board buffer" description="Extra meals loaded to cover no-shows." error={errors.onboardBufferPercent}>
          <SegmentedControl
            ariaLabel="On-board buffer"
            value={[0, 5, 10, 15, 20].includes(draft.onboardBufferPercent) ? draft.onboardBufferPercent : 10}
            onChange={(v) => setField('onboardBufferPercent', v)}
            options={[
              { value: 0, label: '0%' },
              { value: 5, label: '5%' },
              { value: 10, label: '10%' },
              { value: 15, label: '15%' },
              { value: 20, label: '20%' },
            ]}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Extras">
        <SettingRow label="Snacks and drinks" description="Light snacks and beverages between meals.">
          <ToggleSwitch ariaLabel="Snacks" checked={draft.snacksEnabled} onChange={(v) => setField('snacksEnabled', v)} />
        </SettingRow>
        <SettingRow label="Duty-free" description="Allow duty-free sales in this cabin.">
          <ToggleSwitch ariaLabel="Duty-free" checked={draft.dutyFreeEnabled} onChange={(v) => setField('dutyFreeEnabled', v)} />
        </SettingRow>
        <SettingRow label="Premium meals allowed" description="Passengers can pick premium meals.">
          <ToggleSwitch
            ariaLabel="Premium meals allowed"
            checked={draft.premiumMealsAllowed}
            onChange={(v) => setField('premiumMealsAllowed', v)}
          />
        </SettingRow>
      </SettingsGroup>
    </div>
  )
}

/** The menu of one cabin: a toggle per meal, and the meal a passenger gets when they order nothing. */
export function MenuPanel({
  mealProducts,
  menu,
  offeredCount,
  defaultOfferingId,
  warning,
  onToggle,
  onSetDefault,
}: {
  mealProducts: Product[]
  menu: ProductOffering[]
  offeredCount: number
  defaultOfferingId: string | null
  warning: string | null
  onToggle: (productId: string, offered: boolean) => void
  onSetDefault: (offeringId: string) => void
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-base font-semibold">Menu</h3>
        <p className="m-0 text-sm text-muted-foreground">
          {offeredCount === 0
            ? 'No menu for this cabin — turn meals on below to add them.'
            : `${offeredCount} of ${mealProducts.length} meals offered. Tap a meal to offer or withdraw it.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {mealProducts.map((p) => {
          const active = menu.some((o) => o.productId === p.id && o.isActive)
          return (
            <Toggle
              key={p.id}
              variant="outline"
              pressed={active}
              onPressedChange={(next) => onToggle(p.id, next)}
              className="data-[state=on]:border-primary"
            >
              <span aria-hidden="true">{active ? '✓' : '+'}</span>
              {p.name}
              {p.isPremium ? <Badge variant="secondary">Premium</Badge> : null}
            </Toggle>
          )
        })}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="default-meal">Default meal (if a passenger orders nothing)</Label>
        <NativeSelect
          id="default-meal"
          className="w-full"
          value={defaultOfferingId ?? ''}
          onChange={(e) => {
            if (e.target.value) onSetDefault(e.target.value)
          }}
        >
          {menu.length === 0 && <NativeSelectOption value="">No meals offered</NativeSelectOption>}
          {menu.map((o) => (
            <NativeSelectOption key={o.id} value={o.id}>
              {mealProducts.find((mp) => mp.id === o.productId)?.name ?? 'Unknown meal'}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {warning ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
