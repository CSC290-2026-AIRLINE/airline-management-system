import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { PricingShell } from '../components/PricingShell'
import { BaseFaresTab } from './BaseFaresTab'
import { FareClassesTab } from './FareClassesTab'
import { FARE_SETUP_TABS, type FareSetupTab } from './tabs'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'

const TAB_LABELS: Record<FareSetupTab, string> = { 'fare-classes': 'Fare classes', 'base-fares': 'Base fares' }

interface FareSetupPageProps {
  tab: FareSetupTab
  onTabChange: (tab: FareSetupTab) => void
}

export function FareSetupPage({ tab, onTabChange }: FareSetupPageProps) {
  // Wait for the session exchange so the first API calls carry a token instead of racing the refresh.
  const { isLoading, accessToken } = useAppAuth()

  return (
    <PricingShell title="Fare setup" description="Define fare classes, their cabin, advance-purchase rule and refund / change fees.">
      <Tabs value={tab} onValueChange={(next) => onTabChange(next as FareSetupTab)}>
        <TabsList aria-label="Fare setup sections">
          {FARE_SETUP_TABS.map((id) => (
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
            <ErrorBoundary key={tab}>{tab === 'fare-classes' ? <FareClassesTab /> : <BaseFaresTab />}</ErrorBoundary>
          )}
        </TabsContent>
      </Tabs>
    </PricingShell>
  )
}
