import type { Person } from '../types'
import { EM_DASH, formatDateOfBirth, genderLabel, maskPassport, nationalityLabel, personName } from '../lib/format'
import { ArrowRightIcon, ChevronLeftIcon, CloseIcon, PencilIcon } from './Icons'
import { Avatar, DetailSection, InfoNote, ReadOnlyPill, TypeBadge } from './shared'

/**
 * Read-only profile for a selected person, loaded from `GET /api/passengers/:id`.
 *
 * Account holders get an "Account information" block plus their saved travellers;
 * travellers get a "Traveller profile" block, the "Correct identity" action, and
 * the accounts they are saved on. Both render a compact mobile variant.
 *
 * The API returns each linked person as a nested object, so this panel no longer
 * needs the whole list to resolve links.
 */

interface CustomerDetailProps {
  person: Person
  variant: 'desktop' | 'mobile'
  /** Optional `← Back` control; mobile always shows it because the list is hidden. */
  onBack?: () => void
  onClose?: () => void
  onSelectPerson: (personId: string) => void
  onCorrectIdentity?: (person: Person) => void
}

/** `cs-badge is-relationship is-spouse` — the stylesheet keys off the relationship text. */
function relationshipClass(relationship: string | null): string {
  return `cs-badge is-relationship${relationship ? ` is-${relationship.toLowerCase().replace(/\s+/g, '-')}` : ''}`
}

export function CustomerDetail({ person, variant, onBack, onClose, onSelectPerson, onCorrectIdentity }: CustomerDetailProps) {
  const isMobile = variant === 'mobile'
  const isAccountHolder = person.type === 'accountHolder'

  return (
    <article className={`cs-detail ${isMobile ? 'is-mobile' : ''}`} aria-label={`Profile for ${personName(person)}`}>
      {/* The design puts `← Back` above the person row on both platforms. */}
      {onBack ? (
        <button type="button" className="cs-link cs-detail__back" onClick={onBack}>
          <ChevronLeftIcon />
          Back
        </button>
      ) : null}

      <header className="cs-detail__header">
        <Avatar person={person} size="lg" />
        <div className="cs-detail__heading">
          <h2 className="cs-detail__name">
            {person.firstName} {person.lastName}
            {/* Travellers carry their local name in the meta line instead, per the design. */}
            {isAccountHolder && person.thaiName ? <span className="cs-detail__thai">{person.thaiName}</span> : null}
          </h2>
          <p className="cs-detail__meta">
            <TypeBadge person={person} />
            <span className="cs-detail__meta-text">
              {isAccountHolder
                ? `Customer ID ${person.id}${person.memberSince ? ` · since ${person.memberSince}` : ''}`
                : `${person.id}${person.thaiName ? ` · ${person.thaiName}` : ''} · no account`}
            </span>
          </p>
        </div>
        {/* Both detail types carry the READ ONLY chip in the design. */}
        <ReadOnlyPill />
        {!isMobile && onClose ? (
          <button type="button" className="cs-detail__close" onClick={onClose} aria-label={`Close ${personName(person)}`}>
            <CloseIcon />
          </button>
        ) : null}
      </header>

      {isAccountHolder ? (
        <DetailSection title="Account information">
          <dl className="cs-detail__grid">
            <Field label="Email" value={person.email ?? EM_DASH} />
            <Field label="Phone" value={person.phone ?? EM_DASH} />
            <Field label="Date of birth" value={formatDateOfBirth(person.dateOfBirth)} />
            <Field label="Nationality" value={nationalityLabel(person.nationality)} />
            <Field label="Gender" value={genderLabel(person.gender)} />
            <Field label="Passport" value={maskPassport(person.passportNumber)} />
          </dl>
        </DetailSection>
      ) : (
        <DetailSection
          title="Traveller profile"
          action={
            onCorrectIdentity ? (
              <button type="button" className="cs-btn cs-btn--outline" onClick={() => onCorrectIdentity(person)}>
                <PencilIcon />
                Correct identity
              </button>
            ) : null
          }
        >
          <dl className="cs-detail__grid">
            <Field label="Date of birth" value={formatDateOfBirth(person.dateOfBirth)} />
            <Field label="Nationality" value={nationalityLabel(person.nationality)} />
            <Field label="Gender" value={genderLabel(person.gender)} />
            <Field label="Passport" value={maskPassport(person.passportNumber)} />
          </dl>
        </DetailSection>
      )}

      {person.savedTravellers && person.savedTravellers.length > 0 ? (
        <DetailSection title="Saved travellers">
          {isMobile ? (
            <ul className="cs-relations">
              {person.savedTravellers.map((saved) => (
                <li key={saved.person.id}>
                  <button type="button" className="cs-relations__item" onClick={() => onSelectPerson(saved.person.id)}>
                    <Avatar person={saved.person} size="sm" />
                    <span className="cs-relations__name">{personName(saved.person)}</span>
                    {saved.relationship ? <span className={relationshipClass(saved.relationship)}>{saved.relationship}</span> : null}
                    <ArrowRightIcon className="cs-relations__chevron" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <table className="cs-relations-table">
              <caption className="cs-visually-hidden">Travellers saved on this account</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Relationship</th>
                  <th scope="col">Date of birth</th>
                  <th scope="col">Nationality</th>
                  <th scope="col">
                    <span className="cs-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {person.savedTravellers.map((saved) => (
                  <tr key={saved.person.id} className="cs-relations-table__row" onClick={() => onSelectPerson(saved.person.id)}>
                    <td>
                      <button
                        type="button"
                        className="cs-relations-table__link"
                        onClick={(event) => {
                          event.stopPropagation()
                          onSelectPerson(saved.person.id)
                        }}
                      >
                        {personName(saved.person)}
                      </button>
                    </td>
                    <td>
                      {saved.relationship ? <span className={relationshipClass(saved.relationship)}>{saved.relationship}</span> : null}
                    </td>
                    <td>{formatDateOfBirth(saved.person.dateOfBirth)}</td>
                    <td>{nationalityLabel(saved.person.nationality)}</td>
                    <td className="cs-relations-table__action">
                      <button
                        type="button"
                        className="cs-link"
                        onClick={(event) => {
                          event.stopPropagation()
                          onSelectPerson(saved.person.id)
                        }}
                      >
                        View
                        <ArrowRightIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DetailSection>
      ) : null}

      {person.linkedAccounts && person.linkedAccounts.length > 0 ? (
        <DetailSection title="Linked accounts">
          <ul className="cs-linked">
            {person.linkedAccounts.map((link) => (
              <li key={link.person.id}>
                <button type="button" className="cs-linked__item" onClick={() => onSelectPerson(link.person.id)}>
                  <Avatar person={link.person} />
                  <span className="cs-linked__body">
                    <span className="cs-linked__name">
                      {personName(link.person)} · {link.person.id}
                    </span>
                    <span className="cs-linked__meta">
                      {link.relationship ? `Saved as ${link.relationship} · ` : ''}
                      {link.lastBooked ? `last booked ${link.lastBooked}` : 'never booked'}
                    </span>
                  </span>
                  {!isMobile ? (
                    <span className="cs-link cs-linked__open">
                      Open
                      <ArrowRightIcon />
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </DetailSection>
      ) : null}

      {/* The desktop sentence about the audit log and passport masking has been
          removed. The mobile copy stays: it is the one the design shows, and
          the note is the last child here, so dropping it leaves no gap. */}
      {isMobile ? <InfoNote>Read-only. Opening this profile is recorded in the Feature 15 audit log.</InfoNote> : null}
    </article>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="cs-detail__field">
      <dt className="cs-detail__label">{label}</dt>
      <dd className="cs-detail__value">{value}</dd>
    </div>
  )
}
