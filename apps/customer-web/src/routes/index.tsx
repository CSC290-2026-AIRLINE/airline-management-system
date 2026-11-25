import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '@customer-web/features/home/HomePage'

export const Route = createFileRoute('/')({
  component: HomePage,
})
