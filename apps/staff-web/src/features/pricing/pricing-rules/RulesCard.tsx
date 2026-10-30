import { useEffect, useState } from 'react'
import { errorMessage, RULE_GROUPS, usePricingApi, type PricingRule, type RuleGroup } from '../api'
import { Dialog } from '../components/Dialog'
import { useLoad } from '../hooks/useLoad'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { describeCondition, formatAdjustment, groupLabel } from './describe'
import { NewRuleDialog } from './NewRuleDialog'

const NOTICE_MS = 2000
const RULES_PER_PAGE = 4 // phone only; the desktop table shows the whole group

interface RulesCardProps {
  group: RuleGroup
  onGroupChange: (group: RuleGroup) => void
  onChanged: () => void
}

export function RulesCard({ group, onGroupChange, onChanged }: RulesCardProps) {
  const api = usePricingApi()
  const isPhone = useMediaQuery(PHONE_QUERY)
  // All groups in one call: the tabs need every group's count anyway.
  const rules = useLoad(() => api.listPricingRules(), 'pricing-rules')
  // Id of the rule being changed, or 'order' while a move is saving; every control waits for it.
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string } | null>(null)
  // The rule waiting for confirmation in the Remove dialog; its own error shows inside the dialog.
  const [removing, setRemoving] = useState<PricingRule | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // Phone page per group, so switching tabs starts the other group at page 1 and coming back keeps your place.
  const [pages, setPages] = useState<Partial<Record<RuleGroup, number>>>({})

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  const all = rules.data ?? []
  const groupRules = all.filter((rule) => rule.rule_group === group).sort((a, b) => a.priority - b.priority)

  // Clamped so removing the last rule on a page never leaves the phone on an empty page.
  const pageCount = Math.max(1, Math.ceil(groupRules.length / RULES_PER_PAGE))
  const currentPage = Math.min(pages[group] ?? 0, pageCount - 1)
  const pageStart = currentPage * RULES_PER_PAGE
  const pageRules = groupRules.slice(pageStart, pageStart + RULES_PER_PAGE)
  const setPage = (page: number) => setPages((current) => ({ ...current, [group]: page }))

  async function run(key: string, action: () => Promise<unknown>, success?: string) {
    setBusy(key)
    setActionError(null)
    try {
      await action()
      if (success) setNotice({ text: success })
    } catch (e) {
      setActionError(errorMessage(e))
    } finally {
      setBusy(null)
      rules.reload()
      onChanged()
    }
  }

  // Sends the whole group in its new order; the backend rewrites priorities 1, 2, 3… in one transaction.
  function move(index: number, by: -1 | 1) {
    const ids = groupRules.map((rule) => rule.id)
    ;[ids[index], ids[index + by]] = [ids[index + by], ids[index]]
    void run('order', () => api.reorderPricingRules(group, ids))
  }

  function askRemove(rule: PricingRule) {
    setRemoveError(null)
    setRemoving(rule)
  }

  async function confirmRemove(rule: PricingRule) {
    setBusy(rule.id)
    setRemoveError(null)
    try {
      await api.deletePricingRule(rule.id)
      setRemoving(null)
      setNotice({ text: `Rule ${rule.name} removed` })
      rules.reload()
      onChanged()
    } catch (e) {
      setRemoveError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  // Controls shared by the desktop row and the phone card; `index` is the rule's place in the whole group.
  function moveButtons(rule: PricingRule, index: number) {
    return (
      <>
        <button
          type="button"
          className="pr-step-button"
          aria-label={`Move ${rule.name} up`}
          disabled={busy !== null || index === 0}
          onClick={() => move(index, -1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="pr-step-button"
          aria-label={`Move ${rule.name} down`}
          disabled={busy !== null || index === groupRules.length - 1}
          onClick={() => move(index, 1)}
        >
          ↓
        </button>
      </>
    )
  }

  function activeSwitch(rule: PricingRule, labelledBy?: string) {
    return (
      <button
        type="button"
        role="switch"
        className="pr-switch"
        aria-checked={rule.is_active}
        aria-label={labelledBy ? undefined : `${rule.name} active`}
        aria-labelledby={labelledBy}
        disabled={busy !== null}
        onClick={() => void run(rule.id, () => api.setPricingRuleActive(rule.id, !rule.is_active))}
      >
        <span className="pr-switch-thumb" />
      </button>
    )
  }

  function removeButton(rule: PricingRule) {
    return (
      <button type="button" className="pr-link-button is-danger" disabled={busy !== null} onClick={() => askRemove(rule)}>
        Remove
      </button>
    )
  }

  function fareClassPill(rule: PricingRule) {
    return (
      rule.fare_class && (
        <span className="pr-pill" title={rule.fare_class.name}>
          {rule.fare_class.code} only
        </span>
      )
    )
  }

  const body = rules.error ? (
    <div className="pr-callout is-error" role="alert">
      Could not load pricing rules: {rules.error}{' '}
      <button type="button" className="pr-link-button" onClick={rules.reload}>
        Retry
      </button>
    </div>
  ) : !rules.data ? (
    <p className="pr-state">Loading pricing rules…</p>
  ) : groupRules.length === 0 ? (
    <p className="pr-state">No {groupLabel(group).toLowerCase()} rules yet.</p>
  ) : isPhone ? (
    <ol className="pr-rule-cards" start={pageStart + 1}>
      {pageRules.map((rule, offset) => {
        const index = pageStart + offset
        return (
          <li key={rule.id} className={`pr-rule-card${rule.is_active ? '' : ' is-inactive'}`}>
            <span className="pr-rule-number" aria-hidden="true">
              {index + 1}
            </span>
            <div className="pr-rule-card-name">
              <strong>
                {rule.name}
                {fareClassPill(rule)}
              </strong>
              <span>{describeCondition(rule)}</span>
            </div>
            <span className="pr-adjust pr-rule-card-adjust">{formatAdjustment(rule.adjustment_pct)}</span>
            <div className="pr-rule-card-actions">
              <span className="pr-switch-label">
                {activeSwitch(rule, `rule-active-${rule.id}`)}
                <span id={`rule-active-${rule.id}`}>
                  <span className="pr-visually-hidden">{rule.name} </span>
                  Active
                </span>
              </span>
              <span className="pr-rule-card-buttons">
                {moveButtons(rule, index)}
                {removeButton(rule)}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  ) : (
    <div className="pr-table-wrap">
      <table className="pr-table pr-rules-table">
        <thead>
          <tr>
            <th scope="col">Priority</th>
            <th scope="col">Rule</th>
            <th scope="col">Condition</th>
            <th scope="col">Adjust</th>
            <th scope="col">Active</th>
            <th scope="col">
              <span className="pr-visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {groupRules.map((rule, index) => (
            <tr key={rule.id} className={rule.is_active ? undefined : 'is-inactive'}>
              <td>
                <span className="pr-priority">
                  <strong>{index + 1}</strong>
                  {moveButtons(rule, index)}
                </span>
              </td>
              <td>
                {rule.name}
                {fareClassPill(rule)}
              </td>
              <td>{describeCondition(rule)}</td>
              <td className="pr-adjust">{formatAdjustment(rule.adjustment_pct)}</td>
              <td>{activeSwitch(rule)}</td>
              <td className="pr-row-actions">{removeButton(rule)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <div role="status" aria-live="polite" className="pr-banner-slot">
        {notice && <p className="pr-banner is-success">{notice.text}</p>}
      </div>

      <section className="pr-card" aria-labelledby="rules-title">
        <div className="pr-card-head">
          <h2 id="rules-title" className="pr-card-title">
            Rules
          </h2>
          <p className="pr-muted">Priority decides which rule wins inside a group.</p>
        </div>

        <div className="pr-tabs pr-card-tabs" role="tablist" aria-label="Rule groups">
          {RULE_GROUPS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`rule-tab-${id}`}
              aria-selected={group === id}
              aria-controls="rule-panel"
              className={`pr-button ${group === id ? 'is-primary' : 'is-outline'}`}
              onClick={() => onGroupChange(id)}
            >
              {groupLabel(id)}
              {rules.data && ` · ${all.filter((rule) => rule.rule_group === id).length}`}
            </button>
          ))}
        </div>

        <div id="rule-panel" role="tabpanel" aria-labelledby={`rule-tab-${group}`} className="pr-matrix-body">
          {body}
        </div>

        {actionError && (
          <div className="pr-callout is-error" role="alert">
            {actionError}
          </div>
        )}

        <div className="pr-card-footer pr-rules-footer">
          <button type="button" className="pr-button is-outline" disabled={!rules.data || busy !== null} onClick={() => setAdding(true)}>
            + Add {groupLabel(group).toLowerCase()} rule
          </button>
          <p className="pr-muted">Removing a rule is a soft delete. Quotes already made keep their frozen price.</p>
        </div>
      </section>

      {isPhone && rules.data && pageCount > 1 && (
        <nav className="pr-pager" aria-label={`${groupLabel(group)} rule pages`}>
          <p aria-live="polite">
            Page {currentPage + 1} of {pageCount}
          </p>
          <div className="pr-pager-buttons">
            {currentPage > 0 && (
              <button type="button" className="pr-button is-outline" onClick={() => setPage(currentPage - 1)}>
                ‹ Previous
              </button>
            )}
            {currentPage < pageCount - 1 && (
              <button type="button" className="pr-button is-primary" onClick={() => setPage(currentPage + 1)}>
                Next page ›
              </button>
            )}
          </div>
        </nav>
      )}

      {adding && (
        <NewRuleDialog
          key={group}
          group={group}
          nextPriority={Math.max(0, ...groupRules.map((rule) => rule.priority)) + 1}
          onClose={() => setAdding(false)}
          onCreated={(rule) => {
            setAdding(false)
            setNotice({ text: `Rule ${rule.name} added` })
            rules.reload()
            onChanged()
          }}
        />
      )}

      {removing && (
        <Dialog labelledBy="remove-rule-title" className="pr-confirm" onClose={() => busy === null && setRemoving(null)}>
          <div className="pr-confirm-head">
            <h2 id="remove-rule-title">Remove rule {removing.name}?</h2>
            <button type="button" className="pr-icon-button" aria-label="Close" disabled={busy !== null} onClick={() => setRemoving(null)}>
              ×
            </button>
          </div>
          <div className="pr-warning">
            <strong>This rule will stop applying to new quotes.</strong>
            <span>Quotes already issued keep their frozen price.</span>
          </div>
          <div className="pr-confirm-summary">
            <strong>
              {removing.name} · {groupLabel(removing.rule_group)}
            </strong>
            <span>
              {describeCondition(removing)} • {formatAdjustment(removing.adjustment_pct)} adjustment
              {removing.fare_class && ` • ${removing.fare_class.code} only`}
            </span>
          </div>
          {removeError && (
            <div className="pr-callout is-error pr-confirm-error" role="alert">
              {removeError}
            </div>
          )}
          <div className="pr-confirm-actions">
            <button type="button" className="pr-button is-outline" disabled={busy !== null} onClick={() => setRemoving(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="pr-button is-danger-solid"
              disabled={busy !== null}
              onClick={() => void confirmRemove(removing)}
            >
              {busy === removing.id ? 'Removing…' : 'Remove rule'}
            </button>
          </div>
        </Dialog>
      )}
    </>
  )
}
