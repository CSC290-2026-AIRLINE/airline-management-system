import { Link } from '@tanstack/react-router'
import { Button } from '@customer-web/components/ui/button'
import { Separator } from '@customer-web/components/ui/separator'
import logo from '@customer-web/assets/flython-logo-dark.svg'
import footerPhoto from './assets/footer.jpg'

type FooterLink = { label: string; to: string }

const COLUMNS: Array<{ title: string; links: FooterLink[] }> = [
  { title: 'Book', links: [{ label: 'Book a Flight', to: '/search' }] },
  {
    title: 'Travel Information',
    links: [
      { label: 'My Bookings', to: '/bookings' },
      { label: 'Check-In', to: '/check-in' },
      { label: 'Lost & Found', to: '/track-lost-bag' },
    ],
  },
  {
    title: 'Membership',
    links: [
      { label: 'My FlySmiles', to: '/loyalty' },
      { label: 'Miles & Tier', to: '/loyalty/statement' },
      { label: 'Rewards', to: '/loyalty/redemptions' },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'Send a Complaint', to: '/complaints' },
      { label: 'Case Status', to: '/complaints/check' },
      { label: 'Notification Preferences', to: '/complaints/preferences' },
      { label: 'Request Refund', to: '/refunds' },
    ],
  },
]

/** Photo footer from the homepage design. Only the homepage renders it for now. */
export function SiteFooter() {
  return (
    <footer className="relative isolate overflow-hidden bg-[#0a152b] text-white">
      <img src={footerPhoto} alt="" loading="lazy" className="absolute inset-0 -z-20 size-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[rgba(10,21,43,0.94)] via-[rgba(10,21,43,0.88)] via-45% to-[rgba(10,21,43,0.8)]" />
      <div className="mx-auto flex max-w-[79rem] flex-col gap-6 px-4 py-8 md:px-6 xl:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:justify-between">
          <div className="flex max-w-[380px] flex-col gap-3">
            <img src={logo} alt="Flython Airline" width={175} height={44} className="h-11 w-auto self-start" />
            <p>Your journey starts here. Flight booking, check-in and cargo services, all in one place.</p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4">
            {COLUMNS.map((column) => (
              <div key={column.title} className="flex min-w-0 flex-col gap-2 lg:w-[160px]">
                <h2 className="m-0 mb-1 text-sm font-semibold text-white">{column.title}</h2>
                {column.links.map((link) => (
                  <Button
                    key={link.label}
                    asChild
                    variant="link"
                    className="h-auto justify-start rounded-sm p-0 text-sm font-normal whitespace-normal text-white hover:text-white focus-visible:ring-white/60"
                  >
                    <Link to={link.to}>{link.label}</Link>
                  </Button>
                ))}
              </div>
            ))}
          </nav>
        </div>
        <Separator className="bg-white/80" />
        <div className="flex text-xs">
          <p>© 2026 Flython Airlines. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
