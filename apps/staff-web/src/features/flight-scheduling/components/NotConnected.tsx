import { Callout } from './Callout'

// Says that part of a screen waits for another feature or a table that does not exist yet. Remove it when the real endpoint is connected.
export function NotConnected({ children }: { children: string }) {
  return (
    <Callout tone="info">
      <b>Not connected yet.</b> {children}
    </Callout>
  )
}
