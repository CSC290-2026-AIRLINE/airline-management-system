import { createFileRoute } from '@tanstack/react-router'
import { SetupCrewPage } from '@staff-web/features/crew-rostering/setup-crew/setup-crew'

/** The crew directory, at `/setup-crew`. */
export const Route = createFileRoute('/_authenticated/setup-crew/')({
  component: () => <SetupCrewPage />,
})
