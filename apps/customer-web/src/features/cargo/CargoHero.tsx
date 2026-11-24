import { useEffect, useState, type ReactNode } from 'react'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { useCustomerCargoApi } from './cargo-api'

interface CargoHeroProps {
  subtitle: string
  title?: string
  titleRight?: ReactNode
  bottom?: ReactNode
  activeTab?: 'ship' | 'mycargo'
  /** The live unread count, from a page that already tracks it (My cargo); the bell then follows "Mark all read" at once. */
  unreadCount?: number
}

export default function CargoHero({ subtitle, title, titleRight, bottom, activeTab, unreadCount }: CargoHeroProps) {
  const matchRoute = useMatchRoute()
  const api = useCustomerCargoApi()
  const [fetchedUnread, setUnread] = useState(0)
  const unread = unreadCount ?? fetchedUnread

  useEffect(() => {
    if (unreadCount !== undefined) return
    api
      .listMyNotices({ page: 1, pageSize: 1 })
      .then((r) => setUnread(r.unreadCount))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isShip = activeTab === 'ship' ? true : activeTab === 'mycargo' ? false : matchRoute({ to: '/cargo/ship' })

  return (
    <div className="bg-[#1e2a5a] text-left">
      <div className="mx-auto w-full max-w-6xl px-6 pb-0 pt-10">
        <div className="flex items-center gap-3">
          <h1 className="m-0 text-4xl font-bold text-white">{title ?? (isShip ? 'Ship cargo' : 'My cargo')}</h1>
          {titleRight}
          {/* Plain anchor: MyCargoPage reads ?tab= from the URL on mount */}
          <Button asChild variant="ghost" size="icon" className="relative ml-auto text-white/80 hover:bg-white/10 hover:text-white">
            <a href="/cargo?tab=notices" aria-label={unread > 0 ? `Notices, ${unread} unread` : 'Notices'}>
              <Bell />
              {unread > 0 && (
                <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
                  {unread > 9 ? '9+' : unread}
                </Badge>
              )}
            </a>
          </Button>
        </div>
        <p className="mt-2 text-sm text-white/80">{subtitle}</p>
        {bottom !== undefined ? (
          <div className="mt-6 pb-4">{bottom}</div>
        ) : (
          <div className="mt-6 flex gap-8 text-sm">
            <Link
              to="/cargo/ship"
              className={`border-b-2 pb-3 transition-colors ${isShip ? 'border-white font-medium text-white' : 'border-transparent text-white/60 hover:text-white/80'}`}
            >
              Ship cargo
            </Link>
            <Link
              to="/cargo"
              className={`border-b-2 pb-3 transition-colors ${!isShip ? 'border-white font-medium text-white' : 'border-transparent text-white/60 hover:text-white/80'}`}
            >
              My cargo
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
