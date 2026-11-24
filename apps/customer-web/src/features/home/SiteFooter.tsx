import { Link } from '@tanstack/react-router'
import { Button } from '@customer-web/components/ui/button'
import { Separator } from '@customer-web/components/ui/separator'
import logo from '@customer-web/assets/flython-logo-dark.svg'
import footerPhoto from './assets/footer.jpg'
import facebook from './assets/social-facebook.svg'
import mail from './assets/social-mail.svg'
import x from './assets/social-x.svg'
import youtube from './assets/social-youtube.svg'

type FooterLink = { label: string; to?: string }

// Labels without a `to` have no page yet and render as plain text, like the header's nav.
const COLUMNS: Array<{ title: string; links: FooterLink[] }> = [
  { title: 'Book', links: [{ label: 'Book a Flight', to: '/search' }] },
  {
    title: 'Travel Information',
    links: [
      { label: 'My Bookings', to: '/bookings' },
      { label: 'Check-In', to: '/check-in' },
      { label: 'Lost & Found', to: '/track-lost-bag' },
      { label: 'Special Assistance' },
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

const SOCIAL = [
  { label: 'X', icon: x },
  { label: 'Facebook', icon: facebook },
  { label: 'YouTube', icon: youtube },
  { label: 'Email', icon: mail },
]

/** Photo footer from the homepage design. Only the homepage renders it for now. */
export function SiteFooter() {
  return (
    <footer className="relative isolate overflow-hidden bg-[#0a152b] text-white">
      <img src={footerPhoto} alt="" loading="lazy" className="absolute inset-0 -z-20 size-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[rgba(10,21,43,0.92)] via-[rgba(10,21,43,0.8)] via-45% to-[rgba(10,21,43,0.62)]" />
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-6 pt-16 pb-10 lg:gap-14 lg:pt-20">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="flex max-w-[380px] flex-col gap-5">
            <img src={logo} alt="Flython Airline" width={175} height={44} className="h-11 w-auto self-start" />
            <p>Your journey starts here. Flight booking, check-in and cargo services, all in one place.</p>
            <p className="text-sm font-semibold">Connect with us</p>
            <ul className="flex items-center gap-8">
              {SOCIAL.map(({ label, icon }) => (
                <li key={label}>
                  <img src={icon} alt={label} className="size-5" />
                </li>
              ))}
            </ul>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-4">
            {COLUMNS.map((column) => (
              <div key={column.title} className="flex min-w-0 flex-col gap-3.5 lg:w-[160px]">
                <h2 className="m-0 mb-1.5 text-sm font-semibold text-white">{column.title}</h2>
                {column.links.map((link) =>
                  link.to ? (
                    <Button
                      key={link.label}
                      asChild
                      variant="link"
                      className="h-auto justify-start rounded-sm p-0 text-base font-normal whitespace-normal text-white hover:text-white focus-visible:ring-white/60"
                    >
                      <Link to={link.to}>{link.label}</Link>
                    </Button>
                  ) : (
                    <span key={link.label} className="text-white/70">
                      {link.label}
                    </span>
                  ),
                )}
              </div>
            ))}
          </nav>
        </div>
        <Separator className="bg-white/80" />
        <div className="flex flex-col gap-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Flython Airlines. All rights reserved.</p>
          <ul className="flex gap-8">
            <li>Privacy</li>
            <li>Terms</li>
            <li>Cookies</li>
          </ul>
        </div>
      </div>
    </footer>
  )
}
