import { type ReactNode } from 'react'
import { Link, useMatchRoute } from '@tanstack/react-router'

interface CargoHeroProps {
  subtitle: string
  title?: string
  titleRight?: ReactNode
  bottom?: ReactNode
  activeTab?: 'ship' | 'mycargo'
}

export default function CargoHero({ subtitle, title, titleRight, bottom, activeTab }: CargoHeroProps) {
  const matchRoute = useMatchRoute()
  const isShip = activeTab === 'ship' ? true : activeTab === 'mycargo' ? false : matchRoute({ to: '/cargo/ship' })

  return (
    <div className="bg-[#1e2a5a] text-left">
      <div className="mx-auto w-full max-w-6xl px-6 pb-0 pt-10">
        <div className="flex items-center gap-3">
          <h1 className="m-0 text-4xl font-bold text-white">{title ?? (isShip ? 'Ship cargo' : 'My cargo')}</h1>
          {titleRight}
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
