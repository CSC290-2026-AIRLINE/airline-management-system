import { createFileRoute } from '@tanstack/react-router'
import { MyPayPage } from '@staff-web/features/payments/crew-pay/MyPayPage'

export const Route = createFileRoute('/_authenticated/payments/my-pay')({
  component: MyPayPage,
})
