import { useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { errorMessage } from '../api'
import { EXPENSE_CATEGORIES, useFinanceApi, type ExpenseCategory, type PaymentSchedule } from './finance-api'
import { categoryLabel } from './finance-format'
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

interface AddBillDialogProps {
  open: boolean
  unit: string // base currency code
  onOpenChange: (open: boolean) => void
  onAdded: (bill: PaymentSchedule) => void
}

// A bill still to pay. Not in the design: it follows Record expense, with the payee and due date a bill needs.
export function AddBillDialog({ open, unit, onOpenChange, onAdded }: AddBillDialogProps) {
  const api = useFinanceApi()
  const [payee, setPayee] = useState('')
  const [category, setCategory] = useState<ExpenseCategory | null>(null)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setPayee('')
    setCategory(null)
    setDescription('')
    setAmount('')
    setDueDate('')
    setError(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    // Same rules as the backend's CreatePaymentScheduleDto; it checks again.
    const problem = !payee.trim()
      ? 'Payee is required'
      : !category
        ? 'Choose a category'
        : !(Number(amount) > 0)
          ? 'Amount must be greater than 0'
          : !dueDate
            ? 'Choose the due date'
            : null
    if (problem || !category) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const bill = await api.createPaymentSchedule({
        payee: payee.trim(),
        category,
        ...(description.trim() && { description: description.trim() }),
        amount: Number(amount),
        due_date: dueDate,
      })
      reset()
      onAdded(bill)
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
            <DialogTitle className={dialogTitleClass}>Add bill</DialogTitle>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="bill-payee" className={dialogLabelClass}>
              Payee
            </Label>
            <Input id="bill-payee" className={dialogFieldClass} maxLength={200} value={payee} onChange={(e) => setPayee(e.target.value)} />
          </div>

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
            <Label htmlFor="bill-description" className={dialogLabelClass}>
              Description (optional)
            </Label>
            <Input
              id="bill-description"
              className={dialogFieldClass}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bill-amount" className={dialogLabelClass}>
                Amount ({unit})
              </Label>
              <Input
                id="bill-amount"
                inputMode="decimal"
                className={dialogFieldClass}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bill-due" className={dialogLabelClass}>
                Due date
              </Label>
              <Input id="bill-due" type="date" className={dialogFieldClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
              {busy ? 'Adding…' : 'Add bill'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
