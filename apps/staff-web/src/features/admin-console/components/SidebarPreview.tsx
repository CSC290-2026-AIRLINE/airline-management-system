import type { LucideIcon } from 'lucide-react'
import { cn } from '@staff-web/lib/utils'
import flythonLogo from '../assets/flython-logo.svg'
import sidebarPattern from '../assets/sidebar-pattern.png'
import { ADMIN_ITEMS, CHECKIN_ITEMS, GROUPS, PRICING_ITEMS, REPORTS_ITEM } from '../nav-items'
import type { ScreenDto } from '../types'

interface PreviewItem {
  label: string
  icon: LucideIcon
  visible: boolean
}

function Group({ label, items, indent = true }: { label?: string; items: PreviewItem[]; indent?: boolean }) {
  const shown = items.filter((i) => i.visible)
  if (shown.length === 0) return null
  return (
    <div className="px-2 py-1">
      {label && <p className="px-2 py-1.5 text-sm font-semibold text-sidebar-foreground">{label}</p>}
      <ul className="flex flex-col gap-1">
        {shown.map((item) => (
          <li
            key={item.label}
            className={cn('flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground', indent && 'pl-4')}
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * A non-interactive copy of the live sidebar (same groups, icons, colours and texture) showing only what `screens` lets
 * a role open. A pricing/admin item matches by its registered screen code; the other teams' items have no code yet, so
 * they match a registered screen of the same name.
 */
export function SidebarPreview({ screens, roleName }: { screens: ScreenDto[]; roleName: string }) {
  const codes = new Set(screens.map((s) => s.code))
  const names = new Set(screens.map((s) => s.name.toLowerCase()))
  const byCode = (code: string) => codes.has(code)
  const byName = (label: string) => names.has(label.toLowerCase())

  return (
    <div
      className="relative isolate flex max-h-96 w-64 flex-col self-center overflow-hidden rounded-xl bg-sidebar text-sidebar-foreground"
      role="img"
      aria-label={`Sidebar for ${roleName}: ${screens.map((s) => s.name).join(', ')}`}
    >
      <img
        src={sidebarPattern}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 size-full object-cover mix-blend-luminosity"
      />
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 px-2 py-1">
          <img src={flythonLogo} alt="Flython Airline" className="h-10 w-auto shrink-0" />
        </div>
        <p className="px-2 text-xs text-[#b7c1d1] uppercase">Admin workspace</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" aria-hidden="true">
        <Group label="Administration" items={ADMIN_ITEMS.map((i) => ({ ...i, visible: byCode(i.code) }))} />
        <Group label="Pricing & Fare Rules" items={PRICING_ITEMS.map((i) => ({ ...i, visible: byCode(i.code) }))} />
        <Group label="Check-in & Boarding" items={CHECKIN_ITEMS.map((i) => ({ ...i, visible: byCode(i.code) }))} />
        {GROUPS.map((g) => (
          <Group key={g.label} label={g.label} items={g.items.map((i) => ({ ...i, visible: byName(i.label) }))} />
        ))}
        <Group items={[{ ...REPORTS_ITEM, visible: byName(REPORTS_ITEM.label) }]} indent={false} />
      </div>
      <div className="border-t border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 rounded-md border border-white/14 bg-white/6 px-2.5 py-1.5">
          <span className="size-[7px] shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
          <span className="text-xs text-white/65">Signed in as</span>
          <span className="truncate text-sm font-semibold text-white">{roleName}</span>
        </div>
      </div>
    </div>
  )
}
