import { useEffect, useState } from 'react'
import { errorMessage, RULE_GROUPS, usePricingApi, type PricingRule, type RuleGroup } from '../api'
import { Dialog } from '../components/Dialog'
import { useLoad } from '../hooks/useLoad'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { describeCondition, formatAdjustment, groupLabel } from './describe'
import { NewRuleDialog } from './NewRuleDialog'
import { Button } from '@staff-web/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@staff-web/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Switch } from '@staff-web/components/ui/switch'
import { DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Notice } from '../components/Notice'
import { CARD_BODY, CARD_TITLE, PHONE_SWITCH, SWITCH, TABLE_HEAD, TABLE_HEAD_ROW, TABLE_ROW, TABLE_WRAP } from '../components/card-styles'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { Badge } from '@staff-web/components/ui/badge'

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
        <Button
          variant="outline"
          size="icon-sm"
          type="button"
          aria-label={`Move ${rule.name} up`}
          disabled={busy !== null || index === 0}
          onClick={() => move(index, -1)}
        >
          ↑
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          type="button"
          aria-label={`Move ${rule.name} down`}
          disabled={busy !== null || index === groupRules.length - 1}
          onClick={() => move(index, 1)}
        >
          ↓
        </Button>
      </>
    )
  }

  function activeSwitch(rule: PricingRule, labelledBy?: string) {
    return (
      <Switch
        className={isPhone ? PHONE_SWITCH : SWITCH}
        checked={rule.is_active}
        aria-label={labelledBy ? undefined : `${rule.name} active`}
        aria-labelledby={labelledBy}
        disabled={busy !== null}
        onClick={() => void run(rule.id, () => api.setPricingRuleActive(rule.id, !rule.is_active))}
      />
    )
  }

  function removeButton(rule: PricingRule) {
    return (
      <Button variant="link" className="h-auto p-0 text-destructive" type="button" disabled={busy !== null} onClick={() => askRemove(rule)}>
        Remove
      </Button>
    )
  }

  function fareClassPill(rule: PricingRule) {
    return (
      rule.fare_class && (
        <Badge variant="secondary" title={rule.fare_class.name}>
          {rule.fare_class.code} only
        </Badge>
      )
    )
  }

  const body = rules.error ? (
    <Alert variant="destructive">
      <AlertDescription className="block">
        Could not load pricing rules: {rules.error}{' '}
        <Button variant="link" className="h-auto p-0" type="button" onClick={rules.reload}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  ) : !rules.data ? (
    <p className="py-6 text-center text-sm text-muted-foreground">Loading pricing rules…</p>
  ) : groupRules.length === 0 ? (
    <p className="py-6 text-center text-sm text-muted-foreground">No {groupLabel(group).toLowerCase()} rules yet.</p>
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
    <div className={TABLE_WRAP}>
      <Table className="text-[13px] text-(--pr-primary)">
        <TableHeader className="[&_tr]:border-0">
          <TableRow className={TABLE_HEAD_ROW}>
            <TableHead scope="col" className={`${TABLE_HEAD} pl-4`}>
              Priority
            </TableHead>
            <TableHead scope="col" className={TABLE_HEAD}>
              Rule
            </TableHead>
            <TableHead scope="col" className={TABLE_HEAD}>
              Condition
            </TableHead>
            <TableHead scope="col" className={TABLE_HEAD}>
              Adjust
            </TableHead>
            <TableHead scope="col" className={TABLE_HEAD}>
              Active
            </TableHead>
            <TableHead scope="col" className={TABLE_HEAD}>
              <span className="pr-visually-hidden">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupRules.map((rule, index) => (
            <TableRow key={rule.id} className={`${TABLE_ROW}${rule.is_active ? '' : ' opacity-60'}`}>
              <TableCell className="py-0 pr-3 pl-4">
                <span className="pr-priority">
                  <strong>{index + 1}</strong>
                  {moveButtons(rule, index)}
                </span>
              </TableCell>
              <TableCell className="px-3 py-0">
                {rule.name}
                {fareClassPill(rule)}
              </TableCell>
              <TableCell className="px-3 py-0">{describeCondition(rule)}</TableCell>
              <TableCell className="pr-adjust px-3 py-0">{formatAdjustment(rule.adjustment_pct)}</TableCell>
              <TableCell className="px-3 py-0">{activeSwitch(rule)}</TableCell>
              <TableCell className="pr-row-actions px-3 py-0">{removeButton(rule)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )

  return (
    <>
      <Card aria-labelledby="rules-title">
        <CardHeader>
          <CardTitle id="rules-title" role="heading" aria-level={2} className={CARD_TITLE}>
            Rules
          </CardTitle>
          <CardDescription>Priority decides which rule wins inside a group.</CardDescription>
        </CardHeader>
        <CardContent className={CARD_BODY}>
          <Notice text={notice?.text} />
          <Tabs value={group} onValueChange={(next) => onGroupChange(next as RuleGroup)}>
            <TabsList aria-label="Rule groups">
              {RULE_GROUPS.map((id) => (
                <TabsTrigger key={id} value={id}>
                  {groupLabel(id)}
                  {rules.data && ` · ${all.filter((rule) => rule.rule_group === id).length}`}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value={group} className="pr-matrix-body">
              {body}
            </TabsContent>
          </Tabs>

          {actionError && (
            <Alert variant="destructive">
              <AlertDescription className="block">{actionError}</AlertDescription>
            </Alert>
          )}

          <div className="pr-card-footer pr-rules-footer">
            <Button variant="outline" type="button" disabled={!rules.data || busy !== null} onClick={() => setAdding(true)}>
              + Add {groupLabel(group).toLowerCase()} rule
            </Button>
            <p className="pr-muted">Removing a rule is a soft delete. Quotes already made keep their frozen price.</p>
          </div>
        </CardContent>
      </Card>

      {isPhone && rules.data && pageCount > 1 && (
        <nav className="pr-pager" aria-label={`${groupLabel(group)} rule pages`}>
          <p aria-live="polite">
            Page {currentPage + 1} of {pageCount}
          </p>
          <div className="pr-pager-buttons">
            {currentPage > 0 && (
              <Button variant="outline" type="button" onClick={() => setPage(currentPage - 1)}>
                ‹ Previous
              </Button>
            )}
            {currentPage < pageCount - 1 && (
              <Button type="button" onClick={() => setPage(currentPage + 1)}>
                Next page ›
              </Button>
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
        <Dialog onClose={() => busy === null && setRemoving(null)}>
          <DialogHeader>
            <DialogTitle>Remove rule {removing.name}?</DialogTitle>
          </DialogHeader>
          <Alert>
            <AlertTitle>This rule will stop applying to new quotes.</AlertTitle>
            <AlertDescription>Quotes already issued keep their frozen price.</AlertDescription>
          </Alert>
          <div className="grid gap-1 rounded-md border bg-muted/50 p-3 text-sm [&>span]:text-muted-foreground">
            <strong>
              {removing.name} · {groupLabel(removing.rule_group)}
            </strong>
            <span>
              {describeCondition(removing)} • {formatAdjustment(removing.adjustment_pct)} adjustment
              {removing.fare_class && ` • ${removing.fare_class.code} only`}
            </span>
          </div>
          {removeError && (
            <Alert variant="destructive">
              <AlertDescription className="block">{removeError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" type="button" disabled={busy !== null} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              type="button"

              disabled={busy !== null}
              onClick={() => void confirmRemove(removing)}
            >
              {busy === removing.id ? 'Removing…' : 'Remove rule'}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </>
  )
}
