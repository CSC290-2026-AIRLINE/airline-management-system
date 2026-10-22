import { createFileRoute } from '@tanstack/react-router'
import MyProfilePage from '@customer-web/features/passenger-profiles/pages/MyProfilePage'
export const Route = createFileRoute('/_authenticated/account/my-profile')({ component: MyProfilePage })
