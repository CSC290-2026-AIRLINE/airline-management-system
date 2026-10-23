import { Callout } from './Callout'

// Says out loud that part of a screen is simulated. Remove the screen's <MockNotice> when its real endpoint is connected.
export function MockNotice({ children }: { children: string }) {
  return (
    <Callout tone="warn">
      <b>Demo data.</b> {children} Nothing here is saved.
    </Callout>
  )
}
