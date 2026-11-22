import { createFileRoute } from '@tanstack/react-router'
import { PublishedRostersPage } from '@staff-web/features/crew-rostering/published-rosters/published-rosters'

// Reached from the button on Build pairings, not from the sidebar.
export const Route = createFileRoute('/_authenticated/_crew/published-rosters')({
  component: PublishedRostersPage,
})
