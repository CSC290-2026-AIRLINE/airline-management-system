import { createFileRoute, redirect } from '@tanstack/react-router'
import { ComponentGallery } from '@customer-web/features/design-system/ComponentGallery'

/** `/dev/components`: every shared component in every state. Development builds only. */
export const Route = createFileRoute('/dev/components')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw redirect({ to: '/' })
  },
  component: ComponentGallery,
})
