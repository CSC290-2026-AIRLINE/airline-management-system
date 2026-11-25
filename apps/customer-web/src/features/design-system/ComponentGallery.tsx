import { useState, type ReactNode } from 'react'
import { ReceiptText, Search } from 'lucide-react'
import { Badge } from '@customer-web/components/ui/badge'
import { Banner } from '@customer-web/components/ui/banner'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { EmptyState } from '@customer-web/components/ui/empty-state'
import { Field, FieldGroup } from '@customer-web/components/ui/field'
import { Input } from '@customer-web/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@customer-web/components/ui/select'
import { Stepper } from '@customer-web/components/ui/stepper'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@customer-web/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@customer-web/components/ui/tabs'
import { Textarea } from '@customer-web/components/ui/textarea'

/**
 * `/dev/components`: every shared component in every state, on one page. Development only. It is the reference for the
 * redesign (canvas boards 6 and 7) and the place to check a change to a shared component before it reaches a page.
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4">
      <h2 className="m-0 border-b pb-2 text-heading">{title}</h2>
      {children}
    </section>
  )
}

const variants = ['default', 'secondary', 'ghost', 'destructive'] as const

export function ComponentGallery() {
  const [type, setType] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const [tab, setTab] = useState('upcoming')

  return (
    <div className="mx-auto grid max-w-wide gap-12 px-4 py-10 text-left sm:px-8">
      <div>
        <h1 className="m-0 text-title">Components</h1>
        <p className="mt-2 text-copy">Development only. Tab through this page to check focus, and resize it to check the phone layouts.</p>
      </div>

      <Section title="Button">
        <div className="grid gap-4">
          {variants.map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-3">
              <span className="w-24 text-sm text-muted-foreground">{variant}</span>
              <Button variant={variant}>Continue</Button>
              <Button variant={variant} disabled>
                Disabled
              </Button>
              <Button variant={variant} loading>
                Working…
              </Button>
              <Button variant={variant}>
                <Search /> With icon
              </Button>
              <Button variant={variant} size="sm">
                Compact
              </Button>
            </div>
          ))}
          <div className="max-w-sm">
            <Button className="w-full">Review and pay</Button>
          </div>
        </div>
      </Section>

      <Section title="Input, textarea, select and field">
        <FieldGroup className="max-w-xl">
          <Field id="g-name" label="Last name">
            <Input id="g-name" placeholder="As on your passport" />
          </Field>
          <Field id="g-ffn" label="Frequent flyer number" optional hint="Add it to earn FlySmiles miles.">
            <Input id="g-ffn" />
          </Field>
          <Field id="g-email" label="Email" error="Enter an email like name@example.com.">
            <Input id="g-email" defaultValue="name@" aria-invalid aria-describedby="g-email-error" />
          </Field>
          <Field id="g-ref" label="Booking reference">
            <Input id="g-ref" defaultValue="K7M2QD" disabled />
          </Field>
          <Field id="g-type" label="Passenger type">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="g-type">
                <SelectValue>{type ? type : 'Select passenger type'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Select passenger type</SelectItem>
                <SelectItem value="Adult">Adult</SelectItem>
                <SelectItem value="Child">Child, 2 to 11</SelectItem>
                <SelectItem value="Infant">Infant, under 2</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="g-type-err" label="Passenger type" error="Choose a passenger type.">
            <Select value="" onValueChange={() => {}}>
              <SelectTrigger id="g-type-err" aria-invalid>
                <SelectValue>Select passenger type</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Adult">Adult</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="g-note" label="Notes" optional>
            <Textarea id="g-note" placeholder="Anything we should know" />
          </Field>
        </FieldGroup>
      </Section>

      <Section title="Card">
        <div className="grid gap-4 sm:grid-cols-3">
          {(['flat', 'interactive', 'selected'] as const).map((kind) => (
            <Card key={kind} interactive={kind === 'interactive'} selected={kind === 'selected'}>
              <CardHeader>
                <CardTitle className="text-subheading">Bangkok to Singapore</CardTitle>
                <CardDescription>Fri 12 Dec 2026 · {kind}</CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant="success">Confirmed</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Status pills">
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">Paid</Badge>
          <Badge variant="warning">Refund pending</Badge>
          <Badge variant="danger">Failed</Badge>
          <Badge variant="info">In progress</Badge>
          <Badge variant="muted">Refunded</Badge>
        </div>
      </Section>

      <Section title="Table">
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Reference</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono">RC-004172</TableCell>
                <TableCell>Bangkok to Singapore</TableCell>
                <TableCell className="text-right">THB 4,250</TableCell>
                <TableCell>
                  <Badge variant="success">Paid</Badge>
                </TableCell>
              </TableRow>
              <TableRow data-state="selected">
                <TableCell className="font-mono">RC-004168</TableCell>
                <TableCell>Extra baggage, 20 kg</TableCell>
                <TableCell className="text-right">THB 1,100</TableCell>
                <TableCell>
                  <Badge variant="warning">Refund pending</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </Section>

      <Section title="Tabs">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="Bookings">
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            <TabsTrigger value="disabled" disabled>
              Disabled
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs defaultValue="all">
          <TabsList variant="pill" aria-label="Filter">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="flights">Flights</TabsTrigger>
            <TabsTrigger value="cargo">Cargo</TabsTrigger>
          </TabsList>
        </Tabs>
      </Section>

      <Section title="Stepper">
        <Stepper steps={['Find booking', 'Passport', 'Seat', 'Bags', 'Boarding pass']} current={2} aria-label="Check-in progress" />
        <Stepper steps={['Flights', 'Passengers', 'Seats and extras', 'Review and pay']} current={0} aria-label="Booking progress" />
      </Section>

      <Section title="Banner">
        <div className="grid gap-3">
          <Banner kind="info" title="Check-in opens soon">
            You can check in from 24 hours before departure.
          </Banner>
          <Banner
            kind="success"
            title="Payment received"
            action={
              <Button variant="secondary" size="sm">
                Download
              </Button>
            }
          >
            Your boarding pass is ready to download.
          </Banner>
          <Banner kind="warning" title="Your hold expires in 14 minutes" action={<Button size="sm">Review and pay</Button>}>
            Pay now to keep this fare.
          </Banner>
          {dismissed ? null : (
            <Banner kind="error" title="We could not take your payment" onDismiss={() => setDismissed(true)}>
              Your card was declined. Try another card, or contact your bank.
            </Banner>
          )}
        </div>
      </Section>

      <Section title="Empty state">
        <div className="grid gap-4 sm:grid-cols-2">
          <EmptyState icon={ReceiptText} title="No upcoming trips" action={<Button>Search flights</Button>}>
            When you book a flight it will show up here, with check-in and baggage a tap away.
          </EmptyState>
          <EmptyState icon={Search} title="No receipts match" action={<Button variant="secondary">Clear filters</Button>}>
            Try a wider date range, or clear the filters to see all your receipts.
          </EmptyState>
        </div>
      </Section>
    </div>
  )
}
