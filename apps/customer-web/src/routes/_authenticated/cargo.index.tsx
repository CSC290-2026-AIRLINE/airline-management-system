import { createFileRoute } from '@tanstack/react-router'
import MyCargoPage from '@customer-web/features/cargo/MyCargoPage'

export const Route = createFileRoute('/_authenticated/cargo/')({ component: MyCargoPage })
