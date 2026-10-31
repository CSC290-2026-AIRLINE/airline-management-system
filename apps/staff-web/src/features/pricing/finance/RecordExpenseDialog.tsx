import { useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { errorMessage } from '../api'
import { EXPENSE_CATEGORIES, useFinanceApi, type Expense, type ExpenseCategory } from './finance-api'
import { categoryLabel, todayKey } from './finance-format'
import {
  dialogButtonClass,
  dialogCancelClass,
  dialogContentClass,
  dialogErrorClass,
  dialogFieldClass,
  dialogFooterClass,
  dialogLabelClass,
  dialogSubmitClass,
  dialogTitleClass,
} from './finance-styles'

const CATEGORY_ITEMS = Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category, categoryLabel(category)]))

interface RecordExpenseDialogProps {
  open: boolean
  unit: string // base currency code
  onOpenChange: (open: boolean) => void
  onRecorded: (expense: Expense) => void
}

// A cost that never had a schedule (design: Expenses & Payments → Record expense).
export function RecordExpenseDialog({ open, unit, onOpenChange, onRecorded }: RecordExpenseDialogProps) {
  const api = useFinanceApi()
  const [category, setCategory] = useState<ExpenseCategory | null>(null)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [incurredOn, setIncurredOn] = useState(todayKey)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setCategory(null)
    setDescription('')
    setAmount('')
    setIncurredOn(todayKey())
    setError(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    // Same rules as the backend's CreateExpenseDto; it checks again.
    const problem = !category
      ? 'Choose a category'
      : !description.trim()
        ? 'Description is required'
        : !(Number(amount) > 0)
          ? 'Amount must be greater than 0'
          : !incurredOn
            ? 'Choose the date it was incurred'
            : null
    if (problem || !category) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const expense = await api.createExpense({
        category,
        description: description.trim(),
        amount: Number(amount),
        incurred_on: incurredOn,
      })
      reset()
      onRecorded(expense)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent showCloseButton={false} className={dialogContentClass}>
        <form className="grid gap-3.5" onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle className={dialogTitleClass}>Record expense</DialogTitle>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label className={dialogLabelClass}>Category</Label>
            <Select items={CATEGORY_ITEMS} value={category} onValueChange={(value) => setCategory(value as ExpenseCategory | null)}>
              <SelectTrigger aria-label="Category" className={`${dialogFieldClass} justify-between data-placeholder:text-[#677287]`}>
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {categoryLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="expense-description" className={dialogLabelClass}>
              Description
            </Label>
            <Input
              id="expense-description"
              className={dialogFieldClass}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="expense-amount" className={dialogLabelClass}>
                Amount ({unit})
              </Label>
              <Input
                id="expense-amount"
                inputMode="decimal"
                className={dialogFieldClass}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="expense-date" className={dialogLabelClass}>
                Incurred on
              </Label>
              <Input
                id="expense-date"
                type="date"
                className={dialogFieldClass}
                value={incurredOn}
                onChange={(e) => setIncurredOn(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <p role="alert" className={dialogErrorClass}>
              {error}
            </p>
          )}

          <DialogFooter className={dialogFooterClass}>
            <Button
              type="button"
              variant="outline"
              className={`${dialogButtonClass} ${dialogCancelClass}`}
              disabled={busy}
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
            >
              Cancel
            </Button>
            <Button type="submit" className={`${dialogButtonClass} ${dialogSubmitClass}`} disabled={busy}>
              {busy ? 'Recording…' : 'Record expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
