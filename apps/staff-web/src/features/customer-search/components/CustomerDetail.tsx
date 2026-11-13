import type { Person } from '../types'
import { EM_DASH, formatDateOfBirth, genderLabel, displayPassport, nationalityLabel, personName } from '../lib/format'
import { ArrowRight, ChevronLeft, Pencil, X } from 'lucide-react'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Avatar, DetailSection, ReadOnlyPill, TypeBadge } from './shared'

/**
 * Read-only profile for a selected person, loaded from `GET /api/staff/passengers/:id`.
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

export function CustomerDetail({ person, variant, onBack, onClose, onSelectPerson, onCorrectIdentity }: CustomerDetailProps) {
  const isMobile = variant === 'mobile'
  const isAccountHolder = person.type === 'accountHolder'

  return (
    <article className="flex flex-col gap-5 p-4 md:p-5" aria-label={`Profile for ${personName(person)}`}>
      {onBack ? (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft />
            Back
          </Button>
        </div>
      ) : null}

      <header className="flex flex-wrap items-center gap-3">
        <Avatar person={person} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="m-0 font-sans flex flex-wrap items-baseline gap-2 text-xl font-semibold text-foreground">
            {person.firstName} {person.lastName}
            {/* Travellers carry their local name in the meta line instead, per the design. */}
            {isAccountHolder && person.thaiName ? (
              <span className="text-base font-normal text-muted-foreground">{person.thaiName}</span>
            ) : null}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <TypeBadge person={person} />
            <span>
              {isAccountHolder
                ? `Customer ID ${person.id}${person.memberSince ? ` · since ${person.memberSince}` : ''}`
                : `${person.id}${person.thaiName ? ` · ${person.thaiName}` : ''} · no account`}
            </span>
          </p>
        </div>
        <ReadOnlyPill />
        {!isMobile && onClose ? (
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={`Close ${personName(person)}`}>
            <X />
          </Button>
        ) : null}
      </header>

      {isAccountHolder ? (
        <DetailSection title="Account information">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" value={person.email ?? EM_DASH} />
            <Field label="Phone" value={person.phone ?? EM_DASH} />
            <Field label="Date of birth" value={formatDateOfBirth(person.dateOfBirth)} />
            <Field label="Nationality" value={nationalityLabel(person.nationality)} />
            <Field label="Gender" value={genderLabel(person.gender)} />
            <Field label="Passport" value={displayPassport(person.passportNumber)} />
          </dl>
        </DetailSection>
      ) : (
        <DetailSection
          title="Traveller profile"
          action={
            onCorrectIdentity ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onCorrectIdentity(person)}>
                <Pencil />
                Correct identity
              </Button>
            ) : null
          }
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Date of birth" value={formatDateOfBirth(person.dateOfBirth)} />
            <Field label="Nationality" value={nationalityLabel(person.nationality)} />
            <Field label="Gender" value={genderLabel(person.gender)} />
            <Field label="Passport" value={displayPassport(person.passportNumber)} />
          </dl>
        </DetailSection>
      )}

      {person.savedTravellers && person.savedTravellers.length > 0 ? (
        <DetailSection title="Saved travellers">
          {isMobile ? (
            <ul className="flex flex-col divide-y rounded-md border">
              {person.savedTravellers.map((saved) => (
                <li key={saved.person.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent/50"
                    onClick={() => onSelectPerson(saved.person.id)}
                  >
                    <Avatar person={saved.person} size="sm" />
                    <span className="flex-1 font-medium">{personName(saved.person)}</span>
                    {saved.relationship ? <Badge variant="secondary">{saved.relationship}</Badge> : null}
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-md border">
              <Table>
                <caption className="sr-only">Travellers saved on this account</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Name</TableHead>
                    <TableHead scope="col">Relationship</TableHead>
                    <TableHead scope="col">Date of birth</TableHead>
                    <TableHead scope="col">Nationality</TableHead>
                    <TableHead scope="col">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {person.savedTravellers.map((saved) => (
                    <TableRow key={saved.person.id} className="cursor-pointer" onClick={() => onSelectPerson(saved.person.id)}>
                      <TableCell className="font-medium">{personName(saved.person)}</TableCell>
                      <TableCell>{saved.relationship ? <Badge variant="secondary">{saved.relationship}</Badge> : null}</TableCell>
                      <TableCell>{formatDateOfBirth(saved.person.dateOfBirth)}</TableCell>
                      <TableCell>{nationalityLabel(saved.person.nationality)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            onSelectPerson(saved.person.id)
                          }}
                        >
                          View
                          <ArrowRight />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DetailSection>
      ) : null}

      {person.linkedAccounts && person.linkedAccounts.length > 0 ? (
        <DetailSection title="Linked accounts">
          <ul className="flex flex-col divide-y rounded-md border">
            {person.linkedAccounts.map((link) => (
              <li key={link.person.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent/50"
                  onClick={() => onSelectPerson(link.person.id)}
                >
                  <Avatar person={link.person} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">
                      {personName(link.person)} · {link.person.id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {link.relationship ? `Saved as ${link.relationship} · ` : ''}
                      {link.lastBooked ? `last booked ${link.lastBooked}` : 'never booked'}
                    </span>
                  </span>
                  {!isMobile ? (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Open
                      <ArrowRight className="size-4" />
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </DetailSection>
      ) : null}
    </article>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  )
}
