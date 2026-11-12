import { useEffect, useState } from 'react'
import { usePricingApi, type FareClass } from '../api'
import { Dialog } from '../components/Dialog'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { cabinLabel, yesNo } from '../format'
import { useLoad } from '../hooks/useLoad'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { FareClassEditor } from './FareClassEditor'
import { Button } from '@staff-web/components/ui/button'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Label } from '@staff-web/components/ui/label'
import { Checkbox } from '@staff-web/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Notice } from '../components/Notice'
import { CARD_BODY, CARD_TITLE, TABLE_HEAD, TABLE_HEAD_ROW, TABLE_WRAP } from '../components/card-styles'
import { Badge } from '@staff-web/components/ui/badge'

type Selection = { mode: 'edit'; id: string } | { mode: 'new' } | null

// A new object each time, so saving the same class twice restarts the timer.
interface Notice {
  text: string
  highlightId?: string
}

const NOTICE_MS = 2000

function advanceBuy(fc: FareClass): string {
  return fc.min_advance_purchase_days > 0 ? `${fc.min_advance_purchase_days} days` : 'None'
}

export function FareClassesTab() {
  const api = usePricingApi()
  const isPhone = useMediaQuery(PHONE_QUERY)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [selection, setSelection] = useState<Selection>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const list = useLoad(() => api.listFareClasses(includeInactive), `fare-classes:${includeInactive}`)

  const fareClasses = list.data ?? []
  const selected = selection?.mode === 'edit' ? (fareClasses.find((fc) => fc.id === selection.id) ?? null) : null

  // The success banner (and the row highlight that goes with it) clears itself after NOTICE_MS.
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  function open(next: Selection) {
    setSelection(next)
    setNotice(null)
  }

  function handleSaved(fareClass: FareClass) {
    const verb = selection?.mode === 'new' ? 'added' : 'saved'
    setNotice({ text: `Fare class ${fareClass.code} ${verb}`, highlightId: fareClass.id })
    // Saving closes the editor (panel, phone page or dialog) so the list goes back to full width.
    setSelection(null)
    list.reload()
  }

  function handleRemoved() {
    setNotice({ text: selected ? `Fare class ${selected.code} removed` : 'Fare class removed' })
    setSelection(null)
    list.reload()
  }

  function editor() {
    return (
      <ErrorBoundary>
        <FareClassEditor
          key={selection?.mode === 'edit' ? selection.id : 'new'}
          fareClass={selected}
          variant={isPhone ? 'sheet' : 'dialog'}
          onSaved={handleSaved}
          onRemoved={handleRemoved}
          onClose={() => setSelection(null)}
        />
      </ErrorBoundary>
    )
  }

  const body = list.error ? (
    <Alert variant="destructive">
      <AlertDescription className="block">
        Could not load fare classes: {list.error}{' '}
        <Button variant="link" className="h-auto p-0" type="button" onClick={list.reload}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  ) : list.loading && !list.data ? (
    <p className="py-6 text-center text-sm text-muted-foreground">Loading fare classes…</p>
  ) : fareClasses.length === 0 ? (
    <p className="py-6 text-center text-sm text-muted-foreground">No fare classes yet. Add one to start pricing routes.</p>
  ) : isPhone ? (
    <ul className="pr-class-cards">
      {fareClasses.map((fc) => (
        <li key={fc.id}>
          <Button
            variant="outline"
            type="button"
            className={`h-auto w-full flex-col items-stretch gap-2 p-3 text-left whitespace-normal${notice?.highlightId === fc.id ? ' border-ring bg-accent' : ''}${fc.is_active ? '' : ' opacity-60'}`}
            onClick={() => open({ mode: 'edit', id: fc.id })}
          >
            <span className="flex items-center gap-3">
              <Badge variant="outline">{fc.code}</Badge>
              <span className="flex min-w-0 flex-1 flex-col">
                <strong>{fc.name}</strong>
                <span className="text-xs font-normal text-muted-foreground">
                  {cabinLabel(fc.cabin)}
                  {!fc.is_active && (
                    <Badge variant="secondary" className="ml-2">
                      Inactive
                    </Badge>
                  )}
                </span>
              </span>
              <span aria-hidden="true">›</span>
            </span>
            <span className="flex flex-wrap gap-x-3 text-xs font-normal text-muted-foreground">
              <span>Advance buy {advanceBuy(fc)}</span>
              <span>Refund {yesNo(fc.refundable)}</span>
              <span>Change {yesNo(fc.changeable)}</span>
            </span>
          </Button>
        </li>
      ))}
    </ul>
  ) : (
    <div className={TABLE_WRAP}>
      <Table className="text-[13px] text-(--pr-primary)">
        <TableHeader className="[&_tr]:border-0">
          <TableRow className={TABLE_HEAD_ROW}>
            {['Code', 'Name', 'Cabin', 'Advance buy', 'Refund', 'Change'].map((label, index) => (
              <TableHead key={label} className={`${TABLE_HEAD}${index === 0 ? ' pl-4' : ''}`}>
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {fareClasses.map((fc) => (
            <TableRow
              key={fc.id}
              tabIndex={0}
              aria-selected={selected?.id === fc.id}
              className={`is-clickable${selected?.id === fc.id ? ' is-selected' : ''}${notice?.highlightId === fc.id ? ' is-highlighted' : ''}${fc.is_active ? '' : ' is-inactive'}`}
              onClick={() => open({ mode: 'edit', id: fc.id })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  open({ mode: 'edit', id: fc.id })
                }
              }}
            >
              <TableCell className="py-3 pr-3 pl-4 font-bold">{fc.code}</TableCell>
              <TableCell className="px-3 py-3">
                {fc.name}
                {!fc.is_active && (
                  <Badge variant="secondary" className="ml-2">
                    Inactive
                  </Badge>
                )}
              </TableCell>
              <TableCell className="px-3 py-3">{cabinLabel(fc.cabin)}</TableCell>
              <TableCell className="px-3 py-3">{advanceBuy(fc)}</TableCell>
              <TableCell className="px-3 py-3">{yesNo(fc.refundable)}</TableCell>
              <TableCell className="px-3 py-3">{yesNo(fc.changeable)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )

  return (
    <>
      <div className="pr-split">
        <Card aria-labelledby="fc-list-title">
          <CardHeader className="flex items-start justify-between gap-4">
            <div>
              <CardTitle id="fc-list-title" role="heading" aria-level={2} className={CARD_TITLE}>
                Fare classes
              </CardTitle>
              <CardDescription>Select a class to edit it. Quotes keep a frozen copy of these rules.</CardDescription>
            </div>
            <Label>
              <Checkbox
                checked={includeInactive}
                onCheckedChange={(checked) => {
                  // Filtering the list closes any open editor instead of reopening it once the new list loads.
                  setIncludeInactive(checked === true)
                  setSelection(null)
                }}
              />
              Include inactive
            </Label>
          </CardHeader>
          <CardContent className={CARD_BODY}>
            <Notice text={notice?.text} />
            {body}

            <Button variant="outline" className="self-start" type="button" onClick={() => open({ mode: 'new' })}>
              + Add fare class
            </Button>
          </CardContent>
        </Card>

        {/* Adding and editing share one dialog. An id missing from the loaded list opens nothing. */}
        {(selection?.mode === 'new' || selected) && <Dialog onClose={() => setSelection(null)}>{editor()}</Dialog>}
      </div>
    </>
  )
}
