import { useState } from 'react'
import { NoAccessScreen } from '@staff-web/features/admin-console/components/NoAccessScreen'
import { useScreenAccess } from '@staff-web/features/admin-console/hooks/useScreenAccess'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { PaymentLookupTable } from '../components/PaymentLookupTable'
import { PageMessage, PAYMENT_CARD, StaffPageShell } from '../components/StaffPageShell'
import { usePaymentExceptions } from '../hooks/usePaymentExceptions'
import { EXCEPTION_TAB_LABELS } from '../payment-copy'
import { PAYMENT_EXCEPTION_TABS, type PaymentExceptionTab } from '../types'

/**
 * The staff payment exception list.
 *
 * The tabs are the frames' own: needs action, queued, resolved and all. "Needs action" is the payments nobody has
 * touched yet — an authorisation past its deadline, or a capture that has stalled. "Queued" is the ones still inside
 * their deadline. "Resolved" keeps the closed ones on the record.
 */
export function PaymentExceptionsPage() {
  const { loading, canOpen } = useScreenAccess()
  const [tab, setTab] = useState<PaymentExceptionTab>('needs_action')
  const list = usePaymentExceptions(tab)

  if (loading) {
    return (
      <StaffPageShell title="Payment exceptions">
        <p className="text-sm text-muted-foreground">Checking your access…</p>
      </StaffPageShell>
    )
  }

  if (!canOpen('f5.payment_exceptions')) {
    return (
      <StaffPageShell title="Payment exceptions">
        <NoAccessScreen screenName="Payment exceptions" homeTo="/dashboard" />
      </StaffPageShell>
    )
  }

  return (
    <StaffPageShell
      title="Payment exceptions"
      subtitle="Payments that need a person: an authorisation that ran out of time, or a capture that kept failing."
    >
      <Card className={PAYMENT_CARD}>
        <CardHeader>
          <CardTitle className="text-lg">Payment exceptions</CardTitle>
          <CardDescription>Select a payment to see the whole record and the actions staff can take.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(value) => setTab(value as PaymentExceptionTab)}>
            <TabsList>
              {PAYMENT_EXCEPTION_TABS.map((item) => (
                <TabsTrigger key={item} value={item}>
                  {EXCEPTION_TAB_LABELS[item]}
                </TabsTrigger>
              ))}
            </TabsList>

            {PAYMENT_EXCEPTION_TABS.map((item) => (
              <TabsContent key={item} value={item} className="mt-4">
                {item === tab && list.error && (
                  <PageMessage
                    tone="danger"
                    title="The exception list could not be loaded"
                    body={list.error}
                    className="mt-2"
                  />
                )}

                {item === tab && !list.error && list.loading && (
                  <p className="py-8 text-center text-sm text-muted-foreground" role="status">
                    Loading the exceptions…
                  </p>
                )}

                {item === tab && !list.error && !list.loading && list.payments.length === 0 && (
                  <PageMessage
                    title={`Nothing under ${EXCEPTION_TAB_LABELS[item].toLowerCase()}`}
                    body="There is no payment in this state right now."
                  />
                )}

                {item === tab && !list.error && !list.loading && list.payments.length > 0 && (
                  <PaymentLookupTable payments={list.payments} />
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </StaffPageShell>
  )
}
