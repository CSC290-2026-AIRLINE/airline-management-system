import { createFileRoute } from '@tanstack/react-router'
import MyProfile from '@customer-web/features/Account & profile/my profile'
export const Route = createFileRoute('/_authenticated/account/my-profile')({ component: MyProfile })
