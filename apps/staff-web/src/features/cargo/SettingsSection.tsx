import { useEffect, useState } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { cn } from '@staff-web/lib/utils'
import { CargoApiError, useCargoApi, type CargoSettings } from './cargo-api'

/* ── Setting definitions ───────────────────────────────────────────── */

interface SettingDef {
  key: string
  label: string
  description: string
  unit: string
  group: string
}

const SETTING_GROUPS = ['Weight and price', 'Hold space on each flight', 'Booking and payment', 'Terminal and claims'] as const

const SETTINGS: SettingDef[] = [
  {
    key: 'volumetric_kg_per_m3',
    label: 'Volumetric weight',
    description: 'Kilograms counted per cubic metre when the volume is the heavier measure',
    unit: 'kg per m³',
    group: 'Weight and price',
  },
  {
    key: 'baggage_reserve_kg_per_passenger',
    label: 'Baggage reserve per passenger',
    description: "Hold weight kept free for each reserved passenger's bags",
    unit: 'kg',
    group: 'Hold space on each flight',
  },
  {
    key: 'baggage_reserve_floor_percent',
    label: 'Baggage reserve floor',
    description: 'Reserve counts at least this share of the sellable seats, even on an empty flight',
    unit: '% of sellable seats',
    group: 'Hold space on each flight',
  },
  {
    key: 'booking_cutoff_hours',
    label: 'Booking cutoff',
    description: 'Cargo cannot be booked on a flight that leaves sooner than this',
    unit: 'hours before departure',
    group: 'Booking and payment',
  },
  {
    key: 'hold_minutes',
    label: 'Hold before payment',
    description: 'How long the weight is held while the shipper pays',
    unit: 'minutes',
    group: 'Booking and payment',
  },
  {
    key: 'request_window_days',
    label: 'Ship-date window',
    description: 'How many days ahead the ship-date calendar goes',
    unit: 'days ahead',
    group: 'Booking and payment',
  },
  {
    key: 'weight_tolerance_percent',
    label: 'Terminal weight tolerance',
    description: 'Staff may reject cargo measured this far over the quoted chargeable weight',
    unit: '%',
    group: 'Terminal and claims',
  },
  {
    key: 'claim_window_days',
    label: 'Claim window',
    description: 'Days after delivery in which a damage or loss claim can be filed',
    unit: 'days after delivery',
    group: 'Terminal and claims',
  },
]

/* ── Notices ───────────────────────────────────────────────────────── */

interface Notice {
  tone: 'success' | 'error'
  message: string
}

function NoticeBanner({ notice }: { notice: Notice }) {
  return (
    <Alert
      variant={notice.tone === 'error' ? 'destructive' : 'default'}
      className={cn(
        'mb-4',
        notice.tone === 'error' ? 'border-danger-line/40 bg-danger-soft' : 'border-success/30 bg-success-soft text-success-strong',
      )}
    >
      {notice.tone === 'error' ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
      <AlertDescription className="text-current">{notice.message}</AlertDescription>
    </Alert>
  )
}

/* ── Setting row ───────────────────────────────────────────────────── */

function SettingRow({
  def,
  value,
  editingKey,
  editValue,
  saving,
  onStartEdit,
  onChangeEdit,
  onSave,
  onCancel,
}: {
  def: SettingDef
  value: unknown
  editingKey: string | null
  editValue: string
  saving: boolean
  onStartEdit: () => void
  onChangeEdit: (v: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const isEditing = editingKey === def.key

  return (
    <div className="flex items-start justify-between gap-4 py-4 not-first:border-t not-first:border-border">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">{def.label}</span>
        <span className="text-xs text-muted-foreground">{def.description}</span>
        {isEditing && (
          <p className="mt-1 text-xs text-muted-foreground">
            New quotes use {editValue} {def.unit}. Bookings already made keep their current value.
          </p>
        )}
      </div>

      {isEditing ? (
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              step="any"
              value={editValue}
              className="h-8 w-20 tabular-nums"
              autoFocus
              onChange={(e) => onChangeEdit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave()
                if (e.key === 'Escape') onCancel()
              }}
            />
            <span className="whitespace-nowrap text-xs text-muted-foreground">{def.unit}</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-4">
          <span className="whitespace-nowrap text-sm text-foreground">
            <strong className="text-lg font-bold tabular-nums">{String(value ?? '—')}</strong>{' '}
            <span className="text-muted-foreground">{def.unit}</span>
          </span>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-primary"
            onClick={onStartEdit}
            disabled={editingKey !== null || saving}
          >
            Edit
          </Button>
        </div>
      )}
    </div>
  )
}

/* ── Section ───────────────────────────────────────────────────────── */

export function SettingsSection() {
  const api = useCargoApi()
  const [settings, setSettings] = useState<CargoSettings>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.getSettings()
        if (!cancelled) {
          setSettings(data ?? {})
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load settings.')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startEdit(def: SettingDef) {
    setNotice(null)
    setEditingKey(def.key)
    setEditValue(String(settings[def.key] ?? ''))
  }

  function cancelEdit() {
    setEditingKey(null)
    setEditValue('')
  }

  async function saveEdit(def: SettingDef) {
    if (saving) return
    const numValue = Number(editValue)
    if (editValue === '' || Number.isNaN(numValue)) {
      setNotice({ tone: 'error', message: 'Enter a valid number.' })
      return
    }
    setSaving(true)
    setNotice(null)
    try {
      const updated = await api.updateSettings({ [def.key]: String(numValue) })
      setSettings(updated)
      cancelEdit()
      setNotice({ tone: 'success', message: `${def.label} updated.` })
    } catch (err) {
      setNotice({ tone: 'error', message: err instanceof CargoApiError ? err.message : 'Failed to save.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <span className="sr-only">Loading settings…</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-36" />
        <Skeleton className="h-48" />
        <Skeleton className="h-36" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div role="alert">
        <p className="mb-2 font-medium text-foreground">Failed to load settings</p>
        <p className="mb-4 text-sm text-muted-foreground">{loadError}</p>
        <Button type="button" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div>
      {notice && <NoticeBanner notice={notice} />}

      <p className="mb-4 text-sm text-muted-foreground">Limits and timings used when cargo is booked, held, accepted and claimed.</p>

      <div className="flex flex-col gap-4">
        {SETTING_GROUPS.map((group) => {
          const defs = SETTINGS.filter((s) => s.group === group)
          return (
            <Card key={group} className="px-6 py-4">
              <h3 className="mb-1 text-sm font-bold text-foreground">{group}</h3>
              {defs.map((def) => (
                <SettingRow
                  key={def.key}
                  def={def}
                  value={settings[def.key]}
                  editingKey={editingKey}
                  editValue={editValue}
                  saving={saving}
                  onStartEdit={() => startEdit(def)}
                  onChangeEdit={setEditValue}
                  onSave={() => saveEdit(def)}
                  onCancel={cancelEdit}
                />
              ))}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
