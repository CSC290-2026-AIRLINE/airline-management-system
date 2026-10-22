import { createFileRoute } from '@tanstack/react-router'
import { BuildPairingsPage } from '@staff-web/features/crew-rostering/build-pairings/build-pairing'

export const Route = createFileRoute('/_authenticated/build-pairings')({
  component: BuildPairingsPage,
})
