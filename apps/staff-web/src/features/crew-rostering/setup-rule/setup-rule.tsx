/**
 * Setup Rule — the limits and language mappings every assignment is checked
 * against.
 *
 * Composition only: state lives in `useSetupRule`, the validation rules in
 * `rule-form` and `format`, and the mock in `mock-data`. Replacing the mock with
 * the backend should not require editing this file beyond the hook's internals.
 *
 * Edits are staged rather than written through. The unsaved-changes bar counts
 * what differs from the last save, so an edit followed by an undo goes quiet on
 * its own.
 */
import { useState } from 'react'
import { MOCK_SIMULATION_CLOCK, MOCK_SIMULATION_CLOCK_SHORT } from '../build-pairings/types/mock-data'
import { BottomUnsavedBar, MobileTopBar, SidebarNav, TabsNav } from '../shared/app-shell'
import { AlertBanner } from '../shared/ui'
import { CompanyRulesCard } from './components/company-rules-card'
import { CountryLanguagesTable } from './components/country-languages-table'
import { DefaultLimitsCards } from './components/default-limits-cards'
import { StricterLimitsTable } from './components/stricter-limits-table'
import { ChangesSavedModal } from './modals/changes-saved-modal'
import { AddCountryLanguageModal, EditCountryLanguageModal } from './modals/country-language-modal'
import { AddCountryRuleModal, EditCountryRuleModal } from './modals/country-rule-modal'
import { RemoveCountryLanguageModal } from './modals/remove-country-language-modal'
import { RemoveCountryRuleModal } from './modals/remove-country-rule-modal'
import { useSetupRule } from './types/use-setup-rule'
import type { CountryLimit, CountryLanguage, RuleTab } from './types/types'

const TABS = [
  { id: 'legality', label: 'Legality limits' },
  { id: 'languages', label: 'Country languages' },
] as const satisfies readonly { id: RuleTab; label: string }[]

export function SetupRulePage() {
  const state = useSetupRule()

  const [tab, setTab] = useState<RuleTab>('legality')
  const [addingRule, setAddingRule] = useState(false)
  const [editingRule, setEditingRule] = useState<CountryLimit | null>(null)
  const [removingRule, setRemovingRule] = useState<CountryLimit | null>(null)
  const [addingMapping, setAddingMapping] = useState(false)
  const [editingMapping, setEditingMapping] = useState<CountryLanguage | null>(null)
  const [removingMapping, setRemovingMapping] = useState<CountryLanguage | null>(null)
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null)

  const isLoading = state.loadState === 'loading'
  const hasChanges = state.limitsChangeCount + state.languagesChangeCount > 0

  /** Destinations with no rule yet, so `Add country rule` cannot offer one twice. */
  const ruleFreeCountries = state.countries.filter((country) => !state.countriesWithLimit().includes(country.name))
  const mappingFreeCountries = state.countries.filter((country) => !state.countriesWithMapping().includes(country.name))

  function save() {
    setInlineEditingId(null)
    state.saveRules()
  }

  function discard() {
    setInlineEditingId(null)
    state.discardChanges()
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-page-bg lg:flex-row">
      <SidebarNav activeItem="rules" simulationClock={MOCK_SIMULATION_CLOCK} userName="Administrator" />
      <MobileTopBar simulationClockShort={MOCK_SIMULATION_CLOCK_SHORT} userName="Administrator" activeItem="rules" />

      <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-7 lg:px-8">
        <header>
          <h1 className="text-xl font-extrabold tracking-tight text-primary-text uppercase sm:text-2xl">Rules</h1>
          <p className="mt-1 text-sm text-primary-text/60">Limits every assignment is checked against. The strictest rule wins.</p>
        </header>

        <TabsNav tabs={TABS} active={tab} onChange={setTab} />

        {isLoading && <p className="text-sm text-primary-text/60">Loading rules…</p>}

        {state.loadState === 'error' && <AlertBanner tone="warning">Could not load the rules. Try again shortly.</AlertBanner>}

        {state.defaults && tab === 'legality' && (
          <>
            <DefaultLimitsCards defaults={state.defaults} />
            <CompanyRulesCard rules={state.companyRules} />
            <StricterLimitsTable
              defaults={state.defaults}
              limits={state.countryLimits}
              onAdd={() => setAddingRule(true)}
              onEdit={setEditingRule}
              onRemove={setRemovingRule}
            />
          </>
        )}

        {tab === 'languages' && (
          <CountryLanguagesTable
            mappings={state.countryLanguages}
            languages={state.languages}
            editingId={inlineEditingId}
            onAdd={() => setAddingMapping(true)}
            onEdit={setEditingMapping}
            onRemove={setRemovingMapping}
            onInlineEdit={(mapping) => setInlineEditingId(mapping.id)}
            onInlineCancel={() => setInlineEditingId(null)}
            onInlineSave={(mapping, codes) => {
              state.updateCountryLanguage(mapping.id, { country: mapping.country, languages: codes })
              setInlineEditingId(null)
            }}
          />
        )}

        {hasChanges && (
          <BottomUnsavedBar
            summary={
              tab === 'legality'
                ? `${state.limitsChangeCount} unsaved change${state.limitsChangeCount === 1 ? '' : 's'} · Saving rechecks affected pairings and roster assignments.`
                : 'Saving language mappings rechecks local-crew coverage on affected destination legs.'
            }
            saveLabel={tab === 'legality' ? 'Save rules' : 'Save changes'}
            onDiscard={discard}
            onSave={save}
          />
        )}
      </main>

      {addingRule && state.defaults && (
        <AddCountryRuleModal
          defaults={state.defaults}
          countries={ruleFreeCountries}
          takenCountries={state.countriesWithLimit()}
          onCancel={() => setAddingRule(false)}
          onSubmit={(input) => {
            state.addCountryLimit(input)
            setAddingRule(false)
          }}
        />
      )}

      {editingRule && state.defaults && (
        <EditCountryRuleModal
          limit={editingRule}
          defaults={state.defaults}
          countries={state.countries}
          takenCountries={state.countriesWithLimit(editingRule.id)}
          onCancel={() => setEditingRule(null)}
          onSubmit={(input) => {
            state.updateCountryLimit(editingRule.id, input)
            setEditingRule(null)
          }}
        />
      )}

      {removingRule && (
        <RemoveCountryRuleModal
          limit={removingRule}
          onCancel={() => setRemovingRule(null)}
          onConfirm={() => {
            state.removeCountryLimit(removingRule.id)
            setRemovingRule(null)
          }}
        />
      )}

      {addingMapping && (
        <AddCountryLanguageModal
          countries={mappingFreeCountries}
          languages={state.languages}
          takenCountries={state.countriesWithMapping()}
          onCancel={() => setAddingMapping(false)}
          onSubmit={(input) => {
            state.addCountryLanguage(input)
            setAddingMapping(false)
          }}
        />
      )}

      {editingMapping && (
        <EditCountryLanguageModal
          mapping={editingMapping}
          countries={state.countries}
          languages={state.languages}
          takenCountries={state.countriesWithMapping(editingMapping.id)}
          onCancel={() => setEditingMapping(null)}
          onSubmit={(input) => {
            state.updateCountryLanguage(editingMapping.id, input)
            setEditingMapping(null)
          }}
        />
      )}

      {removingMapping && (
        <RemoveCountryLanguageModal
          mapping={removingMapping}
          languages={state.languages}
          onCancel={() => setRemovingMapping(null)}
          onConfirm={() => {
            state.removeCountryLanguage(removingMapping.id)
            setRemovingMapping(null)
          }}
        />
      )}

      {state.justSaved && <ChangesSavedModal onDone={state.dismissSavedModal} />}
    </div>
  )
}
