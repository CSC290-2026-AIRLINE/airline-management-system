import {
  certificationTag,
  describeCertification,
  formatCrewRoute,
  formatDate,
  formatHours,
  formatLanguageNames,
  formatProfileMeta,
  fullName,
  licenceState,
  localCrewEligibility,
  optionalDate,
} from '../types/format'
import type { Certification, CrewMember, UpcomingDuty } from '../types/types'
import { Button, IconButton, PencilIcon, PlusIcon, TagPill } from '../../shared/ui'
import { CrewAvatar, DetailRow, ProfileCard } from './profile-card'

/**
 * The profile page: a summary header followed by the six cards the design names.
 *
 * The cards are one column on a phone and two from `xl`, where the licence and
 * certification cards fit side by side without their text wrapping.
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

  return (
    <div className="flex flex-col gap-5">
      <ProfileCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <CrewAvatar crew={crew} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold text-primary-text">{fullName(crew)}</h1>
            <p className="mt-1 text-sm text-primary-text/60">{formatProfileMeta(crew)}</p>
          </div>
          <Button variant="primary" onClick={onEditProfile} className="shrink-0 self-start sm:self-auto">
            <PencilIcon className="h-4 w-4" />
            Edit profile
          </Button>
        </div>
      </ProfileCard>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <PersonalContactCard crew={crew} />
        <BaseFleetCard crew={crew} />
        <LicenceCard crew={crew} state={licence} />
        <CertificationsCard crew={crew} warningDays={expiryWarningDays} onAdd={onAddCertification} onEdit={onEditCertification} />
      </div>

      <UpcomingDutiesCard crew={crew} />
    </div>
  )
}

function PersonalContactCard({ crew }: { crew: CrewMember }) {
  return (
    <ProfileCard title="Personal & contact">
      <dl className="mt-2 divide-y divide-border-desc/20">
        <DetailRow label="Employee number" value={crew.employeeNo} />
        <DetailRow label="Date of birth" value={optionalDate(crew.dateOfBirth)} />
        <DetailRow label="Email" value={crew.email} />
        <DetailRow label="Phone" value={crew.phone} />
        <DetailRow label="Languages" value={formatLanguageNames(crew.languages)} />
        <DetailRow label="Local-crew eligibility" value={localCrewEligibility(crew)} />
      </dl>
    </ProfileCard>
  )
}

function BaseFleetCard({ crew }: { crew: CrewMember }) {
  return (
    <ProfileCard title="Base & fleet">
      <dl className="mt-2 divide-y divide-border-desc/20">
        <DetailRow label="Home base" value={crew.base} />
        <DetailRow label="Fleet" value={crew.fleet} />
        <DetailRow label="Hours (28 days)" value={formatHours(crew)} />
      </dl>
      <p className="mt-3 rounded-lg bg-info-bg px-3.5 py-3 text-sm text-primary">
        Assigned only to {crew.fleet} duties; reassessed if the fleet changes.
      </p>
    </ProfileCard>
  )
}

function LicenceCard({ crew, state }: { crew: CrewMember; state: ReturnType<typeof licenceState> }) {
  return (
    <ProfileCard
      title="Licence"
      action={
        <TagPill tone={state === 'valid' ? 'valid' : state === 'expiring-soon' ? 'warning' : 'invalid'}>
          {state === 'valid' ? 'Valid' : state === 'expiring-soon' ? 'Expiring soon' : 'Expired'}
        </TagPill>
      }
    >
      <dl className="mt-2 divide-y divide-border-desc/20">
        <DetailRow label="Licence number" value={crew.licenceNumber} />
        <DetailRow label="Expiry date" value={formatDate(crew.licenceExpiresOn)} />
      </dl>
      <p className="mt-3 rounded-lg bg-info-bg px-3.5 py-3 text-sm text-primary">An expired licence prevents assignment to a flight.</p>
    </ProfileCard>
  )
}

function CertificationsCard({
  crew,
  warningDays,
  onAdd,
  onEdit,
}: {
  crew: CrewMember
  warningDays: number
  onAdd: () => void
  onEdit: (certification: Certification) => void
}) {
  return (
    <ProfileCard
      title="Type ratings & certifications"
      action={
        <Button variant="outline" onClick={onAdd}>
          <PlusIcon className="h-4 w-4" />
          Add
        </Button>
      }
    >
      {crew.certifications.length === 0 ? (
        <p className="mt-3 rounded-lg bg-page-bg px-3.5 py-4 text-sm text-primary-text/60">
          No type rating or certification on file. Auto-assign checks these before every duty.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {crew.certifications.map((certification) => {
            const tag = certificationTag(certification, warningDays)
            return (
              <li key={certification.id} className="flex items-start gap-3 border-b border-border-desc/20 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-primary-text">
                    {certification.name}
                    {tag && <TagPill tone={tag}>{tag === 'invalid' ? 'Expired' : 'Expiring soon'}</TagPill>}
                  </p>
                  <p className={`mt-0.5 text-sm ${tag === 'invalid' ? 'font-medium text-invalid' : 'text-primary-text/60'}`}>
                    {describeCertification(certification, warningDays)}
                  </p>
                </div>
                <IconButton label={`Edit ${certification.name}`} onClick={() => onEdit(certification)}>
                  <PencilIcon className="h-4 w-4" />
                </IconButton>
              </li>
            )
          })}
        </ul>
      )}
    </ProfileCard>
  )
}

function UpcomingDutiesCard({ crew }: { crew: CrewMember }) {
  return (
    <ProfileCard title="Upcoming duties">
      {crew.upcomingDuties.length === 0 ? (
        <p className="mt-3 rounded-lg bg-page-bg px-3.5 py-4 text-sm text-primary-text/60">Not rostered on any draft run yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {crew.upcomingDuties.map((duty) => (
            <DutyRow key={duty.id} duty={duty} />
          ))}
        </ul>
      )}
    </ProfileCard>
  )
}

function DutyRow({ duty }: { duty: UpcomingDuty }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-desc/20 py-3 last:border-b-0">
      <span className="text-sm font-medium whitespace-nowrap text-primary-text">{formatDate(duty.date)}</span>
      <span className="font-semibold whitespace-nowrap text-primary-text">{duty.flightNumber}</span>
      <span className="text-sm whitespace-nowrap text-primary-text/70">{formatCrewRoute(duty.origin, duty.destination)}</span>
      <span className="text-sm whitespace-nowrap text-primary-text/60">
        {duty.departureLocal}–{duty.arrivalLocal}
      </span>
      <span className="ml-auto flex items-center gap-2">
        <span className="text-xs text-primary-text/50">{duty.pairingId}</span>
        <TagPill tone={duty.rosterStatus === 'Draft' ? 'neutral' : 'valid'}>{duty.rosterStatus}</TagPill>
      </span>
    </li>
  )
}
