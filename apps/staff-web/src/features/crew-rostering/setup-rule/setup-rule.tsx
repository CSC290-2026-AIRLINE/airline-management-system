/**
 * Setup Rule — the limits and language mappings every assignment is checked
 * against.
 *
 * Composition only: state lives in `useSetupRule` (which talks to the backend through
 * `api`), and the validation rules live in `rule-form` and `format`.
 *
 * Edits are staged rather than written through. The unsaved-changes bar counts
 * what differs from the last save, so an edit followed by an undo goes quiet on
 * its own.
 */
import { useState } from 'react'
import { BottomUnsavedBar, TabsNav } from '../shared/app-shell'
import { AlertBanner } from '../shared/ui'
import { CompanyRulesCard } from './components/company-rules-card'
import { CountryLanguagesTable } from './components/country-languages-table'
import { DefaultLimitsCards } from './components/default-limits-cards'
import { AddRuleButton, StricterLimitsTable } from './components/stricter-limits-table'
import { ChangesSavedModal } from './modals/changes-saved-modal'
import { AddCountryLanguageModal, EditCountryLanguageModal } from './modals/country-language-modal'
import { AddCountryRuleModal, EditCountryRuleModal } from './modals/country-rule-modal'
import { EditDefaultLimitsModal } from './modals/default-limits-modal'
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
  const [editingDefaults, setEditingDefaults] = useState(false)
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
    void state.saveRules()
  }

  function discard() {
    setInlineEditingId(null)
    state.discardChanges()
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-w-0 flex-1 flex-col gap-5 px-4 pt-1 pb-8 lg:px-9 lg:py-7 lg:pb-9">
        <header className="max-lg:mt-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-primary-text uppercase lg:text-3xl">Rules</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-primary-text/60 lg:text-base">
            Limits every assignment is checked against. The strictest rule wins.
          </p>
        </header>

        <TabsNav<RuleTab> tabs={TABS} active={tab} onChange={setTab} />

        {isLoading && <p className="text-sm text-primary-text/60">Loading rules…</p>}

        {state.loadState === 'error' && <AlertBanner tone="warning">Could not load the rules. Try again shortly.</AlertBanner>}

        {state.saveError && <AlertBanner tone="warning">Could not save · {state.saveError}</AlertBanner>}

        {state.defaults && tab === 'legality' && (
          <>
            <AddRuleButton onClick={() => setAddingRule(true)} />
            {/* Wide screens read defaults, company rules, then the country table; a phone reads defaults, country rules, then company rules. */}
            <div className="flex flex-col gap-5">
              <div className="order-1">
                <DefaultLimitsCards defaults={state.defaults} />
              </div>
              <div className="max-lg:order-3 lg:order-2">
                <CompanyRulesCard rules={state.companyRules} defaults={state.defaults} />
              </div>
              <div className="max-lg:order-2 lg:order-3">
                <StricterLimitsTable
                  defaults={state.defaults}
                  limits={state.countryLimits}
                  onEditDefaults={() => setEditingDefaults(true)}
                  onAdd={() => setAddingRule(true)}
                  onEdit={setEditingRule}
                  onRemove={setRemovingRule}
                />
              </div>
            </div>
          </>
        )}

        {tab === 'languages' && (
          <CountryLanguagesTable
            mappings={state.countryLanguages}
            languages={state.languages}
            defaults={state.defaults}
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
            title={tab === 'legality' ? 'Rule changes' : undefined}
            summary={
              tab === 'legality'
                ? `${state.limitsChangeCount} unsaved change${state.limitsChangeCount === 1 ? '' : 's'} · Saving rechecks affected pairings and roster assignments.`
                : 'Saving language mappings rechecks local-crew coverage on affected destination legs.'
            }
            saveLabel={
              state.isSaving ? (
                'Saving…'
              ) : tab === 'legality' ? (
                'Save rules'
              ) : (
                <>
                  <span className="sm:hidden">Save languages</span>
                  <span className="max-sm:hidden">Save changes</span>
                </>
              )
            }
            onDiscard={discard}
            onSave={save}
          />
        )}
      </div>

      {editingDefaults && state.defaults && (
        <EditDefaultLimitsModal
          defaults={state.defaults}
          countryLimits={state.countryLimits}
          onCancel={() => setEditingDefaults(false)}
          onSubmit={(input) => {
            state.updateDefaults(input)
            setEditingDefaults(false)
          }}
        />
      )}

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
