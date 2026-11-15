import { createFileRoute } from '@tanstack/react-router'
import { NotificationPreferencesPage } from '../../features/customer-service/NotificationPreferencesPage'

export const Route = createFileRoute('/complaints/preferences')({
  component: NotificationPreferencesPage,
})
