import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@staff-web/components/ui/sheet'
import { cn } from '@staff-web/lib/utils'
import type { StaffNotification } from '../api/notifications'
import { DELIVERY_TYPE_LABELS, NOTIFICATION_TITLES, bagRef, caseShortNumber, formatEventTime, formatFlightDate } from '../constants'
import type { useStaffNotifications } from '../hooks/useStaffNotifications'

/** The line under the title: which case or bag, and where. */
function detail(n: StaffNotification): string {
  const bag = n.foundBagId ? bagRef(n.foundBagId) : null
  switch (n.kind) {
    case 'strong_match':
      return `Case ${n.caseNumber ? caseShortNumber(n.caseNumber) : '–'} · ${bag ?? '–'} at ${n.airportCode ?? '–'}`
    case 'new_report':
    case 'case_lost':
      return [n.caseNumber, n.passengerName].filter(Boolean).join(' · ')
    case 'delivery_to_send':
      return [n.caseNumber, n.deliveryType ? DELIVERY_TYPE_LABELS[n.deliveryType] : null].filter(Boolean).join(' · ')
    case 'unclaimed_soon':
      return `${bag ?? '–'} at ${n.airportCode ?? '–'}${n.dueAt ? ` · unclaimed on ${formatFlightDate(n.dueAt)}` : ''}`
    case 'bag_unclaimed':
      return `${bag ?? '–'} at ${n.airportCode ?? '–'}`
  }
}

const ITEM =
  'flex w-full flex-col gap-0.5 rounded-lg px-3.5 py-3 text-left outline-none hover:bg-[#f4f6fa] focus-visible:ring-[3px] focus-visible:ring-ring/50'

/** One notification, as a link to the row it is about. */
function NotificationLink({ n, seen, onOpen }: { n: StaffNotification; seen: boolean; onOpen: () => void }) {
  const body = (
    <>
      <span className="flex items-center gap-2">
        {!seen && <span aria-label="New" className="size-2 shrink-0 rounded-full bg-[#fca311]" />}
        <span className={cn('flex-1 text-sm text-[#14213d]', !seen && 'font-semibold')}>{NOTIFICATION_TITLES[n.kind]}</span>
        <span className="shrink-0 text-xs text-[#677287]">{formatEventTime(n.occurredAt)}</span>
      </span>
      <span className="text-sm break-words text-[#677287]">{detail(n)}</span>
    </>
  )

  switch (n.kind) {
    case 'strong_match':
      return (
        <Link to="/baggage/match-review" search={{ match: n.targetId }} onClick={onOpen} className={ITEM}>
          {body}
        </Link>
      )
    case 'new_report':
      return (
        <Link to="/baggage/lost-bag-cases" search={{ case: n.targetId }} onClick={onOpen} className={ITEM}>
          {body}
        </Link>
      )
    case 'case_lost':
      return (
        <Link to="/baggage/lost-bag-cases" search={{ case: n.targetId, status: 'lost' }} onClick={onOpen} className={ITEM}>
          {body}
        </Link>
      )
    case 'delivery_to_send':
      return (
        <Link to="/baggage/deliveries" search={{ case: n.targetId }} onClick={onOpen} className={ITEM}>
          {body}
        </Link>
      )
    case 'unclaimed_soon':
    case 'bag_unclaimed':
      return (
        <Link to="/baggage/found-bags" search={{ bag: n.targetId }} onClick={onOpen} className={ITEM}>
          {body}
        </Link>
      )
  }
}

/**
 * The bell in the baggage sidebar and top bar: unread count, and the list in a side panel. The shell reads the feed
 * once and hands it to both bells.
 */
export function NotificationsButton({
  notifications,
  className,
}: {
  notifications: ReturnType<typeof useStaffNotifications>
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const { unread, items } = notifications

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}
          className={cn(
            'relative flex items-center gap-2.5 rounded-lg text-sm font-medium text-white outline-none hover:bg-white/8 focus-visible:ring-[3px] focus-visible:ring-gold/60',
            className,
          )}
        >
          <Bell className="size-[18px]" aria-hidden />
          <span className="max-md:sr-only">Notifications</span>
          {unread > 0 && (
            <span className="ml-auto min-w-5 rounded-full bg-[#fca311] px-1.5 text-center text-xs leading-5 font-semibold text-[#14213d] max-md:absolute max-md:-top-1.5 max-md:-right-1.5 max-md:ml-0">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] gap-0 bg-white text-[#14213d] max-sm:w-full">
        <SheetHeader className="border-b border-[#d8dce6] px-5 py-4">
          <SheetTitle className="font-sans text-[22px] font-semibold text-[#14213d]">Notifications</SheetTitle>
          <SheetDescription className="sr-only">Baggage desk notifications, newest first</SheetDescription>
          {unread > 0 && (
            <button
              type="button"
              onClick={notifications.markAllSeen}
              className="self-start rounded text-sm font-medium text-[#14213d] underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Mark all as read
            </button>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {notifications.error && items.length === 0 && (
            <p className="px-3.5 py-6 text-center text-sm text-[#677287]">Notifications could not be loaded. Try again later.</p>
          )}
          {!notifications.error && items.length === 0 && (
            <p className="px-3.5 py-6 text-center text-sm text-[#677287]">You are all caught up.</p>
          )}
          {items.length > 0 && (
            <ul className="flex flex-col">
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationLink
                    n={n}
                    seen={notifications.isSeen(n.id)}
                    onOpen={() => {
                      notifications.markSeen([n.id])
                      setOpen(false)
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
