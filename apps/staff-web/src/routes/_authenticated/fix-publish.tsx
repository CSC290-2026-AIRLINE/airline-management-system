import { createFileRoute } from '@tanstack/react-router'
import { FixPublishPage } from '@staff-web/features/crew-rostering/fix-publish/fix-publish'

export const Route = createFileRoute('/_authenticated/fix-publish')({
  component: FixPublishPage,
})
