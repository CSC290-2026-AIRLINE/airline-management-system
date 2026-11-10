import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { PricingShell } from '../components/PricingShell'
import { SeatFeesTab } from './SeatFeesTab'
import { ADD_ON_TABS, type AddOnTab } from './tabs'
import './add-on-charges.css'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'

const TAB_LABELS: Record<AddOnTab, string> = { 'seat-fees': 'Seat fees' }

function tabPanel(tab: AddOnTab) {
  switch (tab) {
    case 'seat-fees':
      return <SeatFeesTab />
    default: {
      const unknown: never = tab
      return unknown
    }
  }
}

interface AddOnChargesPageProps {
  tab: AddOnTab
  onTabChange: (tab: AddOnTab) => void
}

export function AddOnChargesPage({ tab, onTabChange }: AddOnChargesPageProps) {
  // Wait for the session exchange so the first API calls carry a token instead of racing the refresh.
  const { isLoading, accessToken } = useAppAuth()

  return (
    <PricingShell title="Add-on Charges" description="Seat fees for every cabin.">
      <Tabs value={tab} onValueChange={(next) => onTabChange(next as AddOnTab)}>
        <TabsList aria-label="Add-on charge sections">
          {ADD_ON_TABS.map((id) => (
            <TabsTrigger key={id} value={id}>
              {TAB_LABELS[id]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab}>
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Signing in…</p>
          ) : !accessToken ? (
            <Alert variant="destructive">
              <AlertDescription className="block">Your session could not be started. Sign out and sign in again.</AlertDescription>
            </Alert>
          ) : (
            <ErrorBoundary key={tab}>{tabPanel(tab)}</ErrorBoundary>
          )}
        </TabsContent>
      </Tabs>
    </PricingShell>
  )
}
