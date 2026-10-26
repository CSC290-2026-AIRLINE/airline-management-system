// Top navigation bar rendered on every customer-web authenticated page.
// Mirrors the Figma's "Fixed / Customer navigation" frame on page 1.
// The Book / My Trips / Membership / Help links are placeholders — the
// real nav copy and routing come from the F7 / Customer Nav component.
import { useAppAuth } from '../../auth/AuthProvider'

interface NavLink {
  label: string
  href: string
}

const LINKS: NavLink[] = [
  { label: 'Book', href: '#' },
  { label: 'My Trips', href: '#' },
  { label: 'Membership', href: '#' },
  { label: 'Help', href: '#' },
]

function initialsFor(name: string | null | undefined, email: string | null | undefined): string {
  const src = name?.trim() || email || ''
  if (src.length === 0) return '?'
  return src.charAt(0).toUpperCase()
}

export function CustomerNav() {
  const { user } = useAppAuth()
  const displayName = user?.email ? user.email.split('@')[0] : null
  const initials = initialsFor(displayName, user?.email)
  return (
    <nav
      className="flex items-center w-full max-w-[1440px] mx-auto mb-6 h-[67px] bg-muted rounded-xl px-12 font-sans"
      aria-label="Customer"
    >
      <span className="text-foreground text-sm font-semibold flex-none">Logo</span>
      <ul className="list-none m-0 p-0 flex items-center gap-8 ml-auto flex-1 justify-end overflow-hidden">
        {LINKS.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              className="text-foreground text-sm font-medium no-underline whitespace-nowrap hover:underline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 focus-visible:rounded-sm"
            >
              {link.label}
            </a>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="inline-flex items-center gap-2.5 py-1.5 pl-3 pr-3.5 bg-primary text-primary-foreground border-0 rounded-full font-sans text-sm font-bold cursor-pointer whitespace-nowrap hover:bg-[#1c3556] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            aria-label="Profile"
          >
            <span
              className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white text-[#1d4ed8] text-[11px] font-bold flex-none"
              aria-hidden="true"
            >
              {initials}
            </span>
            <span className="leading-none">Profile</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
