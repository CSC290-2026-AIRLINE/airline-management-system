import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Bell, BellOff, CheckCheck, X } from 'lucide-react'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@staff-web/components/ui/sheet'
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
        <Link to="/baggage/match-review" search={{ match: n.targetId }} onClick={onOpen} className={cn(ITEM, !seen && 'bg-[#fffaf0]')}>
          {body}
        </Link>
      )
    case 'new_report':
      return (
        <Link to="/baggage/lost-bag-cases" search={{ case: n.targetId }} onClick={onOpen} className={cn(ITEM, !seen && 'bg-[#fffaf0]')}>
          {body}
        </Link>
      )
    case 'case_lost':
      return (
        <Link
          to="/baggage/lost-bag-cases"
          search={{ case: n.targetId, status: 'lost' }}
          onClick={onOpen}
          className={cn(ITEM, !seen && 'bg-[#fffaf0]')}
        >
          {body}
        </Link>
      )
    case 'delivery_to_send':
      return (
        <Link to="/baggage/deliveries" search={{ case: n.targetId }} onClick={onOpen} className={cn(ITEM, !seen && 'bg-[#fffaf0]')}>
          {body}
        </Link>
      )
    case 'unclaimed_soon':
    case 'bag_unclaimed':
      return (
        <Link to="/baggage/found-bags" search={{ bag: n.targetId }} onClick={onOpen} className={cn(ITEM, !seen && 'bg-[#fffaf0]')}>
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
      {/* Width is inline so the panel keeps its size whatever the shared Sheet classes resolve to. */}
      <SheetContent
        side="right"
        showCloseButton={false}
        style={{ width: 'min(420px, 100vw)', maxWidth: '100vw' }}
        className="gap-0 border-l border-[#d8dce6] bg-white p-0 text-[#14213d]"
      >
        <SheetHeader className="gap-1 border-b border-[#d8dce6] px-6 pt-6 pb-4">
          <div className="flex items-center justify-between gap-4">
            <SheetTitle className="font-sans text-[22px] leading-tight font-semibold text-[#14213d]">Notifications</SheetTitle>
            <SheetClose asChild>
              <button
                type="button"
                aria-label="Close notifications"
                className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-lg text-[#677287] outline-none hover:bg-[#f4f6fa] hover:text-[#14213d] focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <X className="size-5" aria-hidden />
              </button>
            </SheetClose>
          </div>
          <SheetDescription className="sr-only">Baggage desk notifications, newest first</SheetDescription>
          {items.length > 0 && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-[#677287]">{unread > 0 ? `${unread} new` : 'No new notifications'}</span>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={notifications.markAllSeen}
                  className="rounded text-sm font-semibold text-[#14213d] underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Mark all as read
                </button>
              )}
            </div>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {items.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-[#f4f6fa] text-[#677287]">
                {notifications.error ? <BellOff className="size-6" aria-hidden /> : <CheckCheck className="size-6" aria-hidden />}
              </span>
              <p className="text-base font-semibold text-[#14213d]">
                {notifications.error ? 'Notifications could not be loaded' : 'You are all caught up'}
              </p>
              <p className="text-sm text-[#677287]">
                {notifications.error ? 'Try again in a minute.' : 'New matches, reports and deliveries show up here.'}
              </p>
            </div>
          )}
          {items.length > 0 && (
            <ul className="flex flex-col gap-1">
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
