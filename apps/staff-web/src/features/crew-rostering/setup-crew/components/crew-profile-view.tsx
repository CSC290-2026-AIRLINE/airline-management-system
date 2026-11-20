import {
  certificationTag,
  describeCertification,
  formatCrewRoute,
  formatDate,
  formatDayMonth,
  formatLanguageNames,
  formatProfileMeta,
  fullName,
  licenceState,
  localCrewEligibility,
  optionalDate,
} from '../types/format'
import { PILOT_ROLES, type Certification, type CrewMember, type UpcomingDuty } from '../types/types'
import { Button, PencilIcon, TagPill } from '../../shared/ui'
import { CrewAvatar, Field, ProfileCard } from './profile-card'

type LicenceView = ReturnType<typeof licenceState>

/**
 * The profile page: a summary header, then the cards the design names.
 *
 * Two layouts from one set of data. From `lg` it is two columns (contact and licence on the left, base and
 * ratings on the right) with the duties underneath. On a phone the same facts regroup into fewer, shorter
 * cards: base, fleet and licence share one, and the ratings become "Qualifications".
 */
export function CrewProfileView({
  crew,
  expiryWarningDays,
  onEditProfile,
  onAddCertification,
  onEditCertification,
}: {
  crew: CrewMember
  /** Days before expiry that a licence or certification shows as expiring soon. */
  expiryWarningDays: number
  onEditProfile: () => void
  onAddCertification: () => void
  onEditCertification: (certification: Certification) => void
}) {
  const licence = licenceState(crew.licenceExpiresOn, expiryWarningDays)
  // Only pilots hold type ratings; cabin crew and Flight Police get a certifications card without the pilot wording.
  const isPilot = PILOT_ROLES.includes(crew.role)
  const certifications = <CertificationList crew={crew} warningDays={expiryWarningDays} onEdit={onEditCertification} />

  return (
    <div className="flex flex-col gap-5">
      <ProfileCard>
        <p className="text-[11px] font-semibold tracking-wider text-label uppercase">Profile</p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <CrewAvatar crew={crew} />
            <div className="min-w-0">
              <h2 className="text-xl font-extrabold tracking-tight text-primary-text lg:text-3xl">{fullName(crew)}</h2>
              <p className="mt-1 hidden text-sm text-primary-text/60 lg:block lg:text-base">{formatProfileMeta(crew)}</p>
              <p className="mt-1 text-xs leading-relaxed text-primary-text/60 lg:hidden">
                {crew.employeeNo} · {crew.role}
                <br />
                Base {crew.base} · Fleet {crew.fleet}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={onEditProfile} className="shrink-0 self-start lg:self-auto">
            <PencilIcon className="h-4 w-4" />
            Edit profile
          </Button>
        </div>
      </ProfileCard>

      {/* From lg: two columns. */}
      <div className="hidden items-start gap-5 lg:grid lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <ProfileCard title="Personal & contact" subtitle="Profile data used for eligibility and staff contact.">
            <dl className="mt-4 grid grid-cols-2 gap-x-6 [&>div]:border-b [&>div]:border-border-desc/30 [&>div]:py-4 [&>div:nth-last-child(-n+2)]:border-b-0">
              <Field label="Employee number" value={crew.employeeNo} />
              <Field label="Date of birth" value={optionalDate(crew.dateOfBirth)} />
              <Field label="Email" value={crew.email} />
              <Field label="Phone" value={crew.phone} />
              <Field label="Languages" value={formatLanguageNames(crew.languages)} />
              <Field label="Local-crew eligibility" value={localCrewEligibility(crew)} />
            </dl>
          </ProfileCard>

          <ProfileCard title="Licence" subtitle="Checked before each roster assignment.">
            <div className="mt-4 rounded-xl bg-page-bg px-4 py-4">
              <dl className="grid grid-cols-2 gap-x-6">
                <Field label="Licence number" value={crew.licenceNumber} />
                <Field label="Expiry date" value={formatDate(crew.licenceExpiresOn)} />
              </dl>
              <div className="mt-2 flex justify-end">
                <LicencePill state={licence} />
              </div>
            </div>
            <p className="mt-3 text-xs text-primary-text/55 lg:text-[13px]">An expired licence prevents assignment to a flight.</p>
          </ProfileCard>
        </div>

        <div className="flex flex-col gap-5">
          <ProfileCard title="Base & fleet" subtitle="Used to match crew to eligible aircraft duties.">
            <dl className="mt-4 grid grid-cols-2 gap-x-6">
              <Field label="Home base" value={crew.base} />
              <Field label="Fleet" value={crew.fleet} />
            </dl>
            <p className="mt-4 rounded-lg bg-info-bg px-3.5 py-3 text-xs text-primary lg:text-[13px]">
              Assigned only to {crew.fleet} duties; reassessed if the fleet changes.
            </p>
          </ProfileCard>

          <ProfileCard
            title={isPilot ? 'Type ratings & certifications' : 'Certifications'}
            subtitle={isPilot ? 'Pilot ratings and mandatory crew certifications.' : 'Mandatory crew certifications.'}
            action={<AddLink onClick={onAddCertification} />}
          >
            {certifications}
          </ProfileCard>
        </div>
      </div>

      {/* Below lg: fewer, shorter cards. */}
      <div className="flex flex-col gap-5 lg:hidden">
        <ProfileCard title="Personal & contact">
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
            <Field label="Employee number" value={crew.employeeNo} />
            <Field label="Date of birth" value={optionalDate(crew.dateOfBirth)} />
            <Field label="Email" value={crew.email} className="col-span-2 border-t border-border-desc/30 pt-4" />
            <Field label="Phone" value={crew.phone} className="col-span-2" />
          </dl>
          <p className="mt-2 text-xs text-primary-text/55">
            Languages: {formatLanguageNames(crew.languages)} · Local crew: {localCrewEligibility(crew)}
          </p>
        </ProfileCard>

        <ProfileCard title="Base, fleet & licence">
          <dl className="mt-3 grid grid-cols-2 gap-x-4">
            <Field label="Home base" value={crew.base} />
            <Field label="Fleet" value={crew.fleet} />
          </dl>
          <div className="mt-4 flex items-end justify-between gap-3 border-t border-border-desc/30 pt-4">
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold tracking-wider text-label uppercase">Licence</dt>
              <dd className="mt-1 text-sm font-bold text-primary-text">{crew.licenceNumber}</dd>
              <dd className="mt-0.5 text-xs text-primary-text/55">Expires {formatDate(crew.licenceExpiresOn)}</dd>
            </div>
            <LicencePill state={licence} />
          </div>
        </ProfileCard>

        <ProfileCard title="Qualifications" action={<AddLink onClick={onAddCertification} />}>
          {certifications}
        </ProfileCard>
      </div>

      <ProfileCard
        title="Upcoming duties"
        subtitle={
          <>
            <span className="lg:hidden">Draft assignments are rechecked before publishing.</span>
            <span className="max-lg:hidden">Assignments update automatically when the roster is rechecked.</span>
          </>
        }
      >
        {crew.upcomingDuties.length === 0 ? (
          <p className="mt-4 rounded-lg bg-page-bg px-3.5 py-4 text-sm text-primary-text/60">Not rostered on any draft run yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2.5">
            {crew.upcomingDuties.map((duty) => (
              <DutyRow key={duty.id} duty={duty} />
            ))}
          </ul>
        )}
      </ProfileCard>
    </div>
  )
}

/** `+ Add`, a text action in the card header. */
function AddLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 text-sm font-semibold text-blue-700 transition-colors hover:text-blue-800 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
    >
      + Add
    </button>
  )
}

function LicencePill({ state }: { state: LicenceView }) {
  return (
    <TagPill tone={state === 'valid' ? 'valid' : state === 'expiring-soon' ? 'warning' : 'invalid'}>
      {state === 'valid' ? 'Valid' : state === 'expiring-soon' ? 'Expiring soon' : 'Expired'}
    </TagPill>
  )
}

function CertificationList({
  crew,
  warningDays,
  onEdit,
}: {
  crew: CrewMember
  warningDays: number
  onEdit: (certification: Certification) => void
}) {
  if (crew.certifications.length === 0) {
    return (
      <p className="mt-4 rounded-lg bg-page-bg px-3.5 py-4 text-sm text-primary-text/60">
        No type rating or certification on file. Auto-assign checks these before every duty.
      </p>
    )
  }
  return (
    <ul className="mt-4 flex flex-col gap-2.5">
      {crew.certifications.map((certification) => {
        const tag = certificationTag(certification, warningDays)
        return (
          <li key={certification.id} className="flex items-center gap-3 rounded-xl bg-page-bg px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-primary-text lg:text-base">
                {certification.aircraftType ? `${certification.name} · ${certification.aircraftType}` : certification.name}
                {tag && <TagPill tone={tag}>{tag === 'invalid' ? 'Expired' : 'Expiring soon'}</TagPill>}
              </p>
              <p
                className={`mt-0.5 text-xs lg:text-sm ${tag === 'invalid' ? 'font-medium text-invalid' : tag ? 'font-medium text-amber-ink' : 'text-primary-text/55'}`}
              >
                {describeCertification(certification, warningDays)}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Edit ${certification.name}`}
              title={`Edit ${certification.name}`}
              onClick={() => onEdit(certification)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-desc/60 bg-white text-primary-text transition-colors hover:border-primary/40 hover:text-primary"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function DutyRow({ duty }: { duty: UpcomingDuty }) {
  const draft = duty.rosterStatus === 'Draft'
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl bg-page-bg px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-primary-text lg:text-base">
          <span className="lg:hidden">{formatDayMonth(duty.date)}</span>
          <span className="max-lg:hidden">{formatDate(duty.date)}</span> · {duty.flightNumber} ·{' '}
          {formatCrewRoute(duty.origin, duty.destination)}
        </p>
        <p className="mt-0.5 text-xs text-primary-text/55">
          {duty.departureLocal}–{duty.arrivalLocal} · {duty.pairingId} · {draft ? 'Draft' : duty.rosterStatus}
          <span className="max-lg:hidden"> roster</span>
        </p>
      </div>
      <span className="shrink-0 max-lg:hidden">
        <TagPill tone={draft ? 'neutral' : 'valid'}>{duty.rosterStatus}</TagPill>
      </span>
    </li>
  )
}
