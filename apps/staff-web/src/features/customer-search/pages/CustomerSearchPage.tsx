import { useCallback, useEffect, useState } from 'react'
import '../customer-search.css'
import { AppShell } from '../components/AppShell'
import { CorrectIdentityDialog } from '../components/CorrectIdentityDialog'
import { CustomerDetail } from '../components/CustomerDetail'
import { EmptyState } from '../components/EmptyState'
import { SearchIcon } from '../components/Icons'
import { PaginationBar, SegmentedControl } from '../components/ListControls'
import { PeopleCardList } from '../components/PeopleCardList'
import { PeopleTable } from '../components/PeopleTable'
import { useCustomerSearchApi, type SearchPassengersResponse } from '../lib/api'
import { toPage } from '../lib/search'
import { DEFAULT_PAGE_SIZE, MOBILE_PAGE_SIZE, withCustomerSearch, type ResolvedCustomerSearch } from '../lib/searchParams'
import { MOBILE_QUERY, useMediaQuery } from '../lib/useMediaQuery'
import { toPerson, toProfilePerson } from '../lib/person'
import { personName } from '../lib/format'
import type { IdentityCorrection, Person, PersonFilter } from '../types'

/**
 * Customer Search — staff-web.
 *
 * Composes every screen in the Figma section from four pieces of state, all of
 * which live in the URL (see `lib/searchParams.ts`):
 *   search term | type tab | page | selected person
 *
 * Desktop shows a full-width table when nothing is selected and switches to a
 * list + profile split when a person is opened. Mobile hides the list entirely
 * while a profile is open and adds a `← Back` control.
 *
 * DATA SOURCE: the real backend. `lib/api.ts` wraps the three Customer Search
 * endpoints and `lib/person.ts` maps their responses onto `Person`. Filtering,
 * sorting and pagination happen server-side, so this page holds one page of
 * results plus whichever profile is open.
 */

interface CustomerSearchPageProps {
  search: ResolvedCustomerSearch
  onSearchChange: (next: ResolvedCustomerSearch) => void
}

/** A request result tagged with the query it belongs to, so stale data is ignored during render. */
interface KeyedResult<T> {
  key: string
  data: T | null
  error: string | null
}

const UNIT_LABEL: Record<PersonFilter, string> = {
  all: 'people',
  'account-holder': 'account holders',
  traveller: 'travellers',
}

const TITLE_LABEL: Record<PersonFilter, string> = {
  all: 'All people',
  'account-holder': 'Account holders',
  traveller: 'Travellers',
}

const SEARCH_PLACEHOLDER = 'Search name (Thai or passport spelling), email, ID, DOB or passport'
/** The mobile field is narrower, so the design uses a shorter placeholder. */
const SEARCH_PLACEHOLDER_MOBILE = 'Name, email, ID, DOB or passport'
const SUBTITLE = 'Search account holders and linked travellers. Open a person to view details. Read-only by default.'
const SUBTITLE_MOBILE = 'Search account holders and linked travellers. Tap a person for details. Read-only by default.'

/**
 * How long typing pauses before the URL is rewritten and the server is asked
 * again. Long enough that a normal query is one request rather than one per
 * keystroke, short enough that the list still feels attached to the keyboard.
 * The Search button skips the wait entirely.
 */
const SEARCH_DEBOUNCE_MS = 250

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function CustomerSearchPage({ search, onSearchChange }: CustomerSearchPageProps) {
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const api = useCustomerSearchApi()

  // `search.q` is the source of truth; the input holds the in-progress draft.
  // Adjusting it during render (rather than in an effect) keeps the field in step
  // with Back/Forward navigation without a second render pass.
  const [draftQuery, setDraftQuery] = useState(search.q)
  const [syncedQuery, setSyncedQuery] = useState(search.q)
  if (search.q !== syncedQuery) {
    setSyncedQuery(search.q)
    setDraftQuery(search.q)
  }

  const [attempt, setAttempt] = useState(0)
  const [listResult, setListResult] = useState<KeyedResult<SearchPassengersResponse> | null>(null)
  const [profileResult, setProfileResult] = useState<KeyedResult<Person> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const pageSize = search.size ?? (isMobile ? MOBILE_PAGE_SIZE : DEFAULT_PAGE_SIZE)
  const listKey = `${attempt}|${search.q}|${search.type}|${search.page}|${pageSize}`
  const profileKey = `${attempt}|${search.person ?? ''}`

  // Results are tagged with the request they came from, so a response that
  // arrives after the user has typed again is discarded during render rather
  // than needing a reset effect.
  const list = listResult?.key === listKey ? listResult : null
  const profile = profileResult?.key === profileKey ? profileResult : null
  const selected = search.person ? (profile?.data ?? null) : undefined
  const isLoadingList = list === null

  useEffect(() => {
    const controller = new AbortController()

    api
      .searchPeople({ q: search.q, type: search.type, page: search.page, size: pageSize }, controller.signal)
      .then((data) => setListResult({ key: listKey, data, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setListResult({ key: listKey, data: null, error: messageOf(error, 'Could not load customers.') })
      })

    return () => controller.abort()
  }, [api, listKey, pageSize, search.page, search.q, search.type])

  /**
   * Live filtering. The URL is the source of truth, so the draft is pushed into
   * it once typing pauses and the fetch effect above re-runs against the server.
   * Filtering stays server-side — the page never filters the rows it happens to
   * hold, which would only ever cover one page.
   *
   * Trimming here means the URL, the request and the Search button all carry the
   * same value. `withCustomerSearch` resets to page 1 and closes any open profile,
   * because both are wrong the moment the result set underneath them changes.
   */
  useEffect(() => {
    if (draftQuery.trim() === search.q) return

    const timer = setTimeout(() => {
      onSearchChange(withCustomerSearch(search, { q: draftQuery.trim(), page: 1, person: null }))
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [draftQuery, onSearchChange, search])

  useEffect(() => {
    // No person open means no profile to fetch; the keyed result simply goes unread.
    if (!search.person) return

    const controller = new AbortController()
    api
      .fetchPerson(search.person, controller.signal)
      .then((data) => setProfileResult({ key: profileKey, data: toProfilePerson(data), error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setProfileResult({ key: profileKey, data: null, error: messageOf(error, 'Could not load this profile.') })
      })

    return () => controller.abort()
  }, [api, profileKey, search.person])

  // `toPage` only reshapes the server's slice; the rows still need mapping.
  const rows = (list?.data?.items ?? []).map(toPerson)
  const page = toPage(rows, list?.data?.total ?? 0, search.page, pageSize)
  const hasResults = page.total > 0

  // A result set that shrank under a stale `?page=` would otherwise show an
  // empty table on page 99 of 3. Correcting the URL refetches the right page.
  useEffect(() => {
    if (!list?.data) return
    const pageCount = Math.max(1, Math.ceil(list.data.total / pageSize))
    if (list.data.total > 0 && search.page > pageCount) {
      onSearchChange(withCustomerSearch(search, { page: pageCount }))
    }
  }, [list, pageSize, search, onSearchChange])

  const handleRetry = useCallback(() => {
    setSaveError(null)
    setAttempt((value) => value + 1)
  }, [])

  const handleSearchSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      onSearchChange(withCustomerSearch(search, { q: draftQuery.trim(), page: 1, person: null }))
    },
    [draftQuery, onSearchChange, search],
  )

  const handleTypeChange = useCallback(
    (type: PersonFilter) => {
      onSearchChange(withCustomerSearch(search, { type, page: 1, person: null }))
    },
    [onSearchChange, search],
  )

  const handleSelect = useCallback(
    (person: Person) => {
      setSaveError(null)
      onSearchChange(withCustomerSearch(search, { person: person.id }))
    },
    [onSearchChange, search],
  )

  const handleSelectById = useCallback(
    (personId: string) => {
      setSaveError(null)
      onSearchChange(withCustomerSearch(search, { person: personId }))
    },
    [onSearchChange, search],
  )

  const handleClearSearch = useCallback(() => {
    setDraftQuery('')
    onSearchChange(withCustomerSearch(search, { q: '', page: 1, person: null }))
  }, [onSearchChange, search])

  /**
   * `PATCH /api/passengers/:id/identity` restates the whole identity record, so
   * the dialog's edits are merged onto the record already on screen.
   */
  const handleSaveCorrection = useCallback(
    async (correction: IdentityCorrection) => {
      if (!selected) return

      setSaving(true)
      setSaveError(null)
      try {
        const updated = await api.correctIdentity(selected.id, {
          firstName: selected.firstName,
          lastName: selected.lastName,
          localFirstName: selected.localFirstName,
          localLastName: selected.localLastName,
          dateOfBirth: correction.dateOfBirth !== undefined ? correction.dateOfBirth : selected.dateOfBirth,
          gender: correction.gender ?? selected.gender,
          nationality: correction.nationality ?? selected.nationality,
          passportNumber: selected.passportNumber,
          reason: correction.reason,
          confirm: true,
        })

        const person = toPerson(updated)
        // The PATCH response is a summary row; keep the links already loaded.
        setProfileResult({
          key: profileKey,
          data: {
            ...person,
            savedTravellers: selected.savedTravellers,
            linkedAccounts: selected.linkedAccounts,
          },
          error: null,
        })
        setAnnouncement(`Correction saved for ${personName(person)} and logged in the audit log.`)
        onSearchChange(withCustomerSearch(search, { correct: null }))
      } catch (error: unknown) {
        setSaveError(messageOf(error, 'The correction could not be saved.'))
      } finally {
        setSaving(false)
      }
    },
    [api, onSearchChange, profileKey, search, selected],
  )

  const isFiltered = search.q.trim().length > 0

  const panelHead = (
    <header className="cs-panel__head">
      <div className="cs-panel__heading">
        <h2 className="cs-panel__title">{TITLE_LABEL[search.type]}</h2>
        <p className="cs-panel__subtitle">
          {isMobile
            ? `· ${page.total.toLocaleString('en-GB')}`
            : // The API orders by surname; the mock's "most recent activity first" had no data behind it.
              `${page.total.toLocaleString('en-GB')} · ${isFiltered ? 'filtered' : 'surname A–Z'}`}
        </p>
      </div>
      {/* The empty state in the design drops the type filter entirely. */}
      {hasResults ? <SegmentedControl value={search.type} onChange={handleTypeChange} /> : null}
    </header>
  )

  const searchBar = (
    <form className="cs-searchbar" onSubmit={handleSearchSubmit} role="search">
      <div className="cs-searchbar__field">
        <span className="cs-searchbar__icon">
          <SearchIcon />
        </span>
        <input
          type="search"
          className="cs-searchbar__input"
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
          placeholder={isMobile ? SEARCH_PLACEHOLDER_MOBILE : SEARCH_PLACEHOLDER}
          aria-label="Search customers"
        />
      </div>
      <button type="submit" className="cs-btn cs-btn--primary cs-searchbar__submit">
        Search
      </button>
    </form>
  )

  // `Rows` appears above the select only on the full-width desktop table; the
  // mobile and 360px master-detail pagers are compact enough to drop it.
  const pagination = (showRange: boolean) => (
    <PaginationBar
      page={page}
      unit={UNIT_LABEL[search.type]}
      showRange={showRange}
      showRowsLabel={!isMobile && showRange}
      onPageChange={(nextPage) => onSearchChange(withCustomerSearch(search, { page: nextPage }))}
      onPageSizeChange={(size) => onSearchChange(withCustomerSearch(search, { size, page: 1 }))}
    />
  )

  const errorState = (hint: string) => (
    <div className="cs-empty">
      <p className="cs-empty__title">Customers could not be loaded</p>
      <p className="cs-empty__hint">{hint}</p>
      <button type="button" className="cs-btn cs-btn--outline" onClick={handleRetry}>
        Try again
      </button>
    </div>
  )

  const loadingState = (
    <div className="cs-skeleton" aria-busy="true">
      <span className="cs-visually-hidden">Loading customers…</span>
      {Array.from({ length: 5 }, (_, index) => (
        <div className="cs-skeleton__row" key={index} />
      ))}
    </div>
  )

  const listBody = list?.error ? (
    errorState(list.error)
  ) : isLoadingList ? (
    loadingState
  ) : hasResults ? null : (
    <EmptyState query={search.q} onClear={handleClearSearch} variant={isMobile ? 'mobile' : 'desktop'} />
  )

  // The profile panel has its own request, so it carries its own loading and
  // error state rather than blocking the list behind it. A skeleton — never the
  // previously opened person — keeps a fast click from flashing stale detail.
  const profilePanel = search.person && !selected ? (profile?.error ? errorState(profile.error) : loadingState) : null

  const correctingId = search.correct
  const correcting = correctingId
    ? selected?.id === correctingId
      ? selected
      : (rows.find((person) => person.id === correctingId) ?? null)
    : null

  return (
    <AppShell>
      <p className="cs-visually-hidden" role="status">
        {announcement}
      </p>

      <div className={`cs-page ${isMobile ? 'is-mobile' : ''}`}>
        {!search.person || !isMobile ? (
          <header className="cs-page__header">
            <h1 className="cs-page__title">Customer Search</h1>
            <p className="cs-page__subtitle">{isMobile ? SUBTITLE_MOBILE : SUBTITLE}</p>
            {searchBar}
          </header>
        ) : null}

        {isMobile ? (
          search.person ? (
            selected ? (
              <CustomerDetail
                person={selected}
                variant="mobile"
                onBack={() => onSearchChange(withCustomerSearch(search, { person: null }))}
                onSelectPerson={handleSelectById}
                onCorrectIdentity={(person) => onSearchChange(withCustomerSearch(search, { correct: person.id }))}
              />
            ) : (
              <section className="cs-panel" aria-label="Profile">
                {profilePanel}
              </section>
            )
          ) : (
            <section className="cs-panel">
              {panelHead}
              {listBody}
              {hasResults ? (
                <>
                  <PeopleCardList people={page.items} onSelect={handleSelect} variant="mobile" />
                  {pagination(true)}
                </>
              ) : null}
            </section>
          )
        ) : (
          <div className={`cs-layout ${search.person ? 'is-split' : ''}`}>
            {/* Keyed on the URL, not on `selected`, so the split opens immediately and
                the profile fills in beside it rather than replacing the whole view. */}
            {search.person ? (
              <section className="cs-panel cs-panel--list" aria-label="Search results">
                {panelHead}
                {listBody}
                {hasResults ? (
                  <>
                    <PeopleCardList people={page.items} selectedId={selected?.id ?? null} onSelect={handleSelect} variant="desktop" />
                    {pagination(false)}
                  </>
                ) : null}
              </section>
            ) : null}

            <section className="cs-panel cs-panel--main">
              {selected ? (
                <CustomerDetail
                  person={selected}
                  variant="desktop"
                  onBack={() => onSearchChange(withCustomerSearch(search, { person: null }))}
                  onClose={() => onSearchChange(withCustomerSearch(search, { person: null }))}
                  onSelectPerson={handleSelectById}
                  onCorrectIdentity={(person) => onSearchChange(withCustomerSearch(search, { correct: person.id }))}
                />
              ) : (
                (profilePanel ?? (
                  <>
                    {panelHead}
                    {listBody}
                    {hasResults ? (
                      <>
                        <PeopleTable people={page.items} onSelect={handleSelect} />
                        {pagination(true)}
                      </>
                    ) : null}
                  </>
                ))
              )}
            </section>
          </div>
        )}
      </div>

      {correcting ? (
        <CorrectIdentityDialog
          person={correcting}
          variant={isMobile ? 'mobile' : 'desktop'}
          saving={saving}
          saveError={saveError}
          onClose={() => onSearchChange(withCustomerSearch(search, { correct: null }))}
          onSave={(correction) => void handleSaveCorrection(correction)}
        />
      ) : null}
    </AppShell>
  )
}
