import { createFileRoute } from '@tanstack/react-router'
import { FixPublishPage } from '@staff-web/features/crew-rostering/fix-publish/fix-publish'
import { parseWindowSearch } from '@staff-web/features/crew-rostering/shared/window-search'

// `dateFrom`, `dateTo` and `base` carry the window between the wizard pages.
export const Route = createFileRoute('/_authenticated/fix-publish')({
  validateSearch: parseWindowSearch,
  component: FixPublishPage,
})
