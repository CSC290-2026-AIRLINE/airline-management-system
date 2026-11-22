import { createFileRoute } from '@tanstack/react-router'
import FirstSignInPage from '@customer-web/features/passenger-profiles/pages/FirstSignInPage'

export const Route = createFileRoute('/_authenticated/account/first-sign-in')({ component: FirstSignInPage })
