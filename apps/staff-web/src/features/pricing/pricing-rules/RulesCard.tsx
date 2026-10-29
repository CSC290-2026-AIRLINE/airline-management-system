import { useEffect, useState } from 'react'
import { errorMessage, RULE_GROUPS, usePricingApi, type PricingRule, type RuleGroup } from '../api'
import { useLoad } from '../hooks/useLoad'
import { describeCondition, formatAdjustment, groupLabel } from './describe'

const NOTICE_MS = 2000

interface RulesCardProps {
  group: RuleGroup
  onGroupChange: (group: RuleGroup) => void
}

export function RulesCard({ group, onGroupChange }: RulesCardProps) {
  const api = usePricingApi()
  // All groups in one call: the tabs need every group's count anyway.
  const rules = useLoad(() => api.listPricingRules(), 'pricing-rules')
  // Id of the rule being changed, or 'order' while a move is saving; every control waits for it.
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string } | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  const all = rules.data ?? []
  const groupRules = all.filter((rule) => rule.rule_group === group).sort((a, b) => a.priority - b.priority)

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
    }
  }

  // Sends the whole group in its new order; the backend rewrites priorities 1, 2, 3… in one transaction.
  function move(index: number, by: -1 | 1) {
    const ids = groupRules.map((rule) => rule.id)
    ;[ids[index], ids[index + by]] = [ids[index + by], ids[index]]
    void run('order', () => api.reorderPricingRules(group, ids))
  }

  function remove(rule: PricingRule) {
    if (!window.confirm(`Remove the rule "${rule.name}"? Quotes already made keep their price.`)) return
    void run(rule.id, () => api.deletePricingRule(rule.id), `Rule ${rule.name} removed`)
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
                </span>
              </td>
              <td>
                {rule.name}
                {rule.fare_class && (
                  <span className="pr-pill" title={rule.fare_class.name}>
                    {rule.fare_class.code} only
                  </span>
                )}
              </td>
              <td>{describeCondition(rule)}</td>
              <td className="pr-adjust">{formatAdjustment(rule.adjustment_pct)}</td>
              <td>
                <button
                  type="button"
                  role="switch"
                  className="pr-switch"
                  aria-checked={rule.is_active}
                  aria-label={`${rule.name} active`}
                  disabled={busy !== null}
                  onClick={() => void run(rule.id, () => api.setPricingRuleActive(rule.id, !rule.is_active))}
                >
                  <span className="pr-switch-thumb" />
                </button>
              </td>
              <td className="pr-row-actions">
                <button type="button" className="pr-link-button is-danger" disabled={busy !== null} onClick={() => remove(rule)}>
                  Remove
                </button>
              </td>
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
          {/* The add-rule form is not built yet. */}
          <button type="button" className="pr-button is-outline" disabled title="Coming soon">
            + Add {groupLabel(group).toLowerCase()} rule
          </button>
          <p className="pr-muted">Removing a rule is a soft delete. Quotes already made keep their frozen price.</p>
        </div>
      </section>
    </>
  )
}
