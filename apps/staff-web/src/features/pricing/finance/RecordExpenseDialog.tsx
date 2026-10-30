import { useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { errorMessage } from '../api'
import { EXPENSE_CATEGORIES, useFinanceApi, type Expense, type ExpenseCategory } from './finance-api'
import { categoryLabel, todayKey } from './finance-format'

// Values from the Figma (Modal / Record Expense). The dialog renders in a portal outside PricingShell, so the --pr-* tokens
// don't reach it; the colours are written out (navy #102544, label grey #677287, border #cbd5e1) so Tailwind sees them.
const labelClass = 'text-[11px] font-semibold text-[#677287] uppercase'
// md:text-[13px] too: shadcn's Input switches to text-sm from md up.
const fieldClass = 'h-10 w-full rounded-[10px] border-[#cbd5e1] bg-white px-3.5 text-[13px] text-[#102544] md:text-[13px]'
const buttonClass = 'h-10 rounded-[8px] px-6 text-[13px] font-semibold'
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
      <DialogContent
        showCloseButton={false}
        className="gap-0 rounded-[14px] bg-white p-6 font-[Inter,system-ui,sans-serif] text-[#102544] shadow-[0_12px_20px_rgba(15,36,69,0.3)] ring-0 sm:max-w-[480px]"
      >
        <form className="grid gap-3.5" onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            {/* ! because index.css styles every h2 (grey in dark mode, 24px) outside Tailwind's layers, which beats classes. */}
            <DialogTitle className="m-0! font-[Inter,system-ui,sans-serif]! text-[20px]! leading-normal! font-bold! tracking-normal! text-[#102544]!">
              Record expense
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label className={labelClass}>Category</Label>
            <Select items={CATEGORY_ITEMS} value={category} onValueChange={(value) => setCategory(value as ExpenseCategory | null)}>
              <SelectTrigger aria-label="Category" className={`${fieldClass} justify-between data-placeholder:text-[#677287]`}>
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
            <Label htmlFor="expense-description" className={labelClass}>
              Description
            </Label>
            <Input
              id="expense-description"
              className={fieldClass}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="expense-amount" className={labelClass}>
                Amount ({unit})
              </Label>
              <Input
                id="expense-amount"
                inputMode="decimal"
                className={fieldClass}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="expense-date" className={labelClass}>
                Incurred on
              </Label>
              <Input
                id="expense-date"
                type="date"
                className={fieldClass}
                value={incurredOn}
                onChange={(e) => setIncurredOn(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="m-0 rounded-lg bg-[#fdecec] px-3 py-2 text-sm text-[#b42318]">
              {error}
            </p>
          )}

          <DialogFooter className="mx-0 mb-0 gap-2.5 border-0 bg-transparent p-0">
            <Button
              type="button"
              variant="outline"
              className={`${buttonClass} border-[#102544] bg-white text-[#102544] hover:bg-[#f0f2f7]`}
              disabled={busy}
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
            >
              Cancel
            </Button>
            <Button type="submit" className={`${buttonClass} bg-[#102544] text-white hover:bg-[#22365a]`} disabled={busy}>
              {busy ? 'Recording…' : 'Record expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
