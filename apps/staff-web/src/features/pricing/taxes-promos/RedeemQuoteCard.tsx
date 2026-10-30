import { useState, type FormEvent } from 'react'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { errorMessage, usePricingApi, type PromoQuotes } from '../api'

const MONEY = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const DAY = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })
// Same size as the pr-button actions on the rest of the page.
const BUTTON = 'h-auto rounded-lg px-6 py-3 text-[13px] font-semibold'

interface RedeemQuoteCardProps {
  onRedeemed: () => void // the promo table reloads, so its Uses column follows
}

// Normally Feature 3b redeems when a booking is confirmed. Until it exists, staff can do it by hand: they know the promo
// code, not the quote id, so they search by code and pick the quote. A redeem needs a quote to stop a use counting twice.
export function RedeemQuoteCard({ onRedeemed }: RedeemQuoteCardProps) {
  const api = usePricingApi()
  const [code, setCode] = useState('')
  const [result, setResult] = useState<PromoQuotes | null>(null)
  const [searching, setSearching] = useState(false)
  const [redeeming, setRedeeming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function findQuotes(event: FormEvent) {
    event.preventDefault()
    setResult(null)
    setError(null)
    if (!code.trim()) {
      setError('Enter a promo code')
      return
    }
    setSearching(true)
    try {
      setResult(await api.listPromoQuotes(code))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSearching(false)
    }
  }

  async function redeem(quoteId: string, promoCode: string) {
    setRedeeming(quoteId)
    setError(null)
    try {
      await api.redeemFareQuote(quoteId)
      setResult(await api.listPromoQuotes(promoCode))
      onRedeemed()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setRedeeming(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-bold text-primary">Redeem a promo</CardTitle>
        <CardDescription>Search a code, then pick the quote to count one use on. Each quote only counts once.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3.5">
        <form onSubmit={(e) => void findQuotes(e)} noValidate className="flex flex-col gap-3 min-[801px]:flex-row min-[801px]:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="redeem-code" className="text-[11px] font-semibold text-muted-foreground uppercase">
              Promo code
            </Label>
            <Input
              id="redeem-code"
              value={code}
              placeholder="e.g. SPRING15"
              aria-invalid={error ? true : undefined}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>
          <Button type="submit" variant="outline" disabled={searching} className={`${BUTTON} border-primary text-primary`}>
            {searching ? 'Finding…' : 'Find quotes'}
          </Button>
        </form>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {result?.quotes.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No quotes use {result.code} yet.</p>}

        {result && result.quotes.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {result.quotes.map((quote) => (
              <li
                key={quote.id}
                className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 min-[801px]:flex-row min-[801px]:items-center min-[801px]:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-semibold text-primary">
                    {quote.flight_number} · {quote.origin}–{quote.destination} · {quote.fare_class_code}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Departs {DAY.format(new Date(quote.departs_at))} · {MONEY.format(Number(quote.total_amount))} {quote.currency}
                    {quote.seat_type && ` · ${quote.seat_type.replace('_', ' ')}`}
                  </p>
                  <p className="text-xs text-muted-foreground">Quoted {DAY.format(new Date(quote.quoted_at))}</p>
                </div>

                {quote.redeemed_at ? (
                  <Badge variant="secondary">Redeemed {DAY.format(new Date(quote.redeemed_at))}</Badge>
                ) : (
                  <Button disabled={redeeming !== null} className={BUTTON} onClick={() => void redeem(quote.id, result.code)}>
                    {redeeming === quote.id ? 'Redeeming…' : 'Redeem'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
