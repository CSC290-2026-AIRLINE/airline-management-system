import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import type { LoyaltyApi, MemberSummary, TierInfo } from '../api/types'
import { BENEFIT_NAMES, benefitLines, benefitSentence, type BenefitKey } from '../benefits'
import { formatMiles } from '../format'
import { Icon } from './parts'
import { FLIGHT_SEARCH_PATH, TIER_ART } from './labels'
import styles from './loyalty.module.css'

const FEATURES = [
  { icon: 'plane', title: 'Earn on every flight', text: 'Miles = route distance × your fare rate, added after you fly.' },
  { icon: 'users', title: 'Earn for your family', text: 'Book for family or friends and the miles for every seat go to you.' },
  { icon: 'ticket', title: 'Spend on award seats', text: 'Pay the fare with miles on selected flights. Taxes go on your card.' },
  { icon: 'star', title: 'Unlock tier benefits', text: 'Lounge access, extra bags, priority lanes, upgrades and insurance.' },
] as const

// BKK → HKG at each fare rate, as on the design.
const EXAMPLE_KM = 1722
const EXAMPLE_RATES = [
  { label: 'Discount × 0.50', rate: 0.5 },
  { label: 'Full fare × 1.00', rate: 1 },
  { label: 'Business × 1.50', rate: 1.5 },
]

// C01 Join and C01b with the terms ticked.
export function JoinPage({ api, tiers, onJoined }: { api: LoyaltyApi; tiers: TierInfo[]; onJoined: (m: MemberSummary) => void }) {
  const { user } = useUser()
  const name = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'you'
  const firstName = user?.firstName ?? name
  const email = user?.primaryEmailAddress?.emailAddress
  const [agreed, setAgreed] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const join = async () => {
    setJoining(true)
    setError(null)
    try {
      onJoined(await api.join(name))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join. Please try again.')
      setJoining(false)
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>FLYTHON MILES · FREE TO JOIN</span>
          <h1>Join Flython Miles</h1>
          <p>
            Join free and earn miles on every flight you book, for you and everyone you book for. Spend them on award seats and unlock tier
            benefits.
          </p>
          <a href="#join" className={styles.button} style={{ alignSelf: 'flex-start' }}>
            Join for free
          </a>
        </div>
      </section>

      <section className={styles.features} aria-label="What you get">
        {FEATURES.map((f) => (
          <div key={f.title}>
            <Icon name={f.icon} size={22} color="#1f408c" />
            <h3>{f.title}</h3>
            <p className={styles.small}>{f.text}</p>
          </div>
        ))}
      </section>

      <section className={styles.band} aria-labelledby="reach">
        <div>
          <h2 id="reach">Reach a tier</h2>
          <p className={styles.muted}>
            Qualify on miles or on flights in the last 12 months, whichever comes first. A tier lasts 12 months.
          </p>
        </div>
        <TierComparison tiers={tiers} />
      </section>

      <section className={styles.split} aria-labelledby="earn">
        <div>
          <h2 id="earn">How miles are earned</h2>
          <p className={styles.muted} style={{ marginTop: 12 }}>
            Miles = route distance in km × your fare rate. A cheaper ticket earns less than a full fare on the same route.
          </p>
        </div>
        <div>
          <div className={styles.route}>
            BKK <Icon name="plane" size={18} color="#0e7490" /> HKG
            <span className={styles.small}>· {formatMiles(EXAMPLE_KM)} km</span>
          </div>
          <div className={styles.earnExamples}>
            {EXAMPLE_RATES.map((r) => (
              <div key={r.label}>
                <span className={styles.small}>{r.label}</span>
                <strong>{formatMiles(Math.round(EXAMPLE_KM * r.rate))} miles</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="join" className={styles.joinCta} aria-labelledby="ready">
        <div className={styles.cardFan} aria-hidden="true">
          {(['platinum', 'silver', 'gold'] as const).map((code) => (
            <div key={code} className={`${styles.tierArt} ${TIER_ART[code]}`}>
              <span className={styles.brand}>FLYTHON MILES</span>
              <span className={styles.tierArtName}>{code}</span>
            </div>
          ))}
        </div>
        <div>
          <h2 id="ready">Ready to join, {firstName}?</h2>
          <p style={{ color: 'rgba(255,255,255,0.85)' }}>
            Joining as {name}
            {email && email !== name ? ` · ${email}` : ''}. You get a member number straight away.
          </p>
          <ul>
            <li>Miles go to the member who books, for everyone on the booking.</li>
            <li>Miles expire 36 months after the flight. We remind you 30 days before.</li>
          </ul>
          <label className={styles.terms}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />I agree to the Flython Miles terms.
          </label>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className={agreed ? styles.button : styles.buttonPrimary}
            style={{ alignSelf: 'flex-start' }}
            onClick={() => void join()}
            disabled={!agreed || joining}
          >
            {joining ? 'Joining…' : 'Join Flython Miles'}
          </button>
          {!agreed && <p className={styles.small}>Tick the box to agree to the terms before you join.</p>}
        </div>
      </section>
    </main>
  )
}

const ROWS: BenefitKey[] = ['lounge', 'baggage', 'checkIn', 'boarding', 'upgrade', 'insurance']

function TierComparison({ tiers }: { tiers: TierInfo[] }) {
  const lines = tiers.map((t) => benefitLines(t, tiers))
  return (
    <div className={`${styles.compare} ${styles.tableWrap}`}>
      <table className={styles.table}>
        <thead>
          <tr>
            <td />
            {tiers.map((t) => (
              <th key={t.code} scope="col">
                <div className={`${styles.tierMini} ${TIER_ART[t.code]}`} aria-hidden="true">
                  <span>Flython Miles</span>
                  <span>{t.name}</span>
                </div>
                <div style={{ letterSpacing: '0.12em', fontWeight: 800 }}>{t.name.toUpperCase()}</div>
                <div className={styles.small} style={{ textTransform: 'none', letterSpacing: 'normal', fontWeight: 400 }}>
                  {formatMiles(t.minMiles)} miles or {t.minFlights} flights
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((key, row) => (
            <tr key={key}>
              <th scope="row">{BENEFIT_NAMES[key]}</th>
              {lines.map((tierLines, i) => {
                const line = tierLines[row]
                return (
                  <td key={tiers[i].code}>
                    {line.included ? (
                      <>
                        <span className={styles.check}>
                          <Icon name="check" size={16} />
                        </span>
                        {line.value}
                        {!line.value && <span className={styles.srOnly}>Included</span>}
                      </>
                    ) : (
                      <span className={styles.muted} aria-label="Not included">
                        —
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// C02 Welcome, shown once right after joining.
export function WelcomePage({ member, tiers, onContinue }: { member: MemberSummary; tiers: TierInfo[]; onContinue: () => void }) {
  const firstName = member.name.split(' ')[0]
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.memberBadge}>✓ YOU’RE A MEMBER</span>
          <h1>Welcome aboard, {firstName}.</h1>
          <p>Your member number is ready. You have 0 miles and no tier yet. Miles are added after each flight on a booking you made.</p>
          <div className={styles.actions} style={{ alignItems: 'center' }}>
            <button type="button" className={styles.button} onClick={onContinue}>
              Go to my membership
            </button>
            <Link to={FLIGHT_SEARCH_PATH} className={styles.heroLink}>
              Book a flight
            </Link>
          </div>
        </div>
        <div className={styles.welcomeCard} aria-label={`Member number ${member.memberNumber}`}>
          <span className={styles.brand}>FLYTHON MILES</span>
          <div>
            <strong>{member.name}</strong>
            <strong>{member.memberNumber}</strong>
            <span className={styles.pill} style={{ marginTop: 6, background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
              MEMBER
            </span>
          </div>
        </div>
      </section>

      <section className={styles.band} aria-labelledby="reach">
        <div>
          <h2 id="reach">Reach a tier</h2>
          <p className={styles.muted}>
            Qualify on miles or on flights in the last 12 months, whichever comes first. A tier lasts 12 months.
          </p>
        </div>
        <div className={styles.tierCards}>
          {tiers.map((t) => {
            const lines = benefitLines(t, tiers).sort((a, b) => Number(b.included) - Number(a.included))
            return (
              <div key={t.code}>
                <div className={`${styles.tierHead} ${TIER_ART[t.code]}`}>
                  <span>{t.name}</span>
                  <strong>
                    {formatMiles(t.minMiles)} miles or {t.minFlights} flights
                  </strong>
                </div>
                {lines.map((line) => (
                  <div key={line.key} className={`${styles.tierLine} ${line.included ? '' : styles.tierLineOff}`}>
                    <Icon name={line.included ? 'check' : 'dash'} size={14} color={line.included ? '#087338' : '#9aa3b2'} />
                    {line.included ? benefitSentence(line) : BENEFIT_NAMES[line.key]}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
