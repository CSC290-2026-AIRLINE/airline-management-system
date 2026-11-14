import { createFileRoute } from '@tanstack/react-router'
import { NotificationPreferencesPage } from '../../../features/customer-service/NotificationPreferencesPage'

export const Route = createFileRoute('/_authenticated/complaints/preferences')({
  component: NotificationPreferencesPage,
})
