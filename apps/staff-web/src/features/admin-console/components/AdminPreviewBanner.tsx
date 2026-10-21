import { togglePreviewModeInUrl } from '../hooks/usePreviewMode'
import './AdminPreviewBanner.css'

/**
 * Compact amber chip pinned to the top-right of admin pages when `?preview=1` is active. Just enough to surface
 * "you're looking at sample data" and offer one-click exit.
 */
export function AdminPreviewBanner() {
  return (
    <div className="admin-preview-banner" role="status">
      <span className="badge">PREVIEW</span>
      <button
        type="button"
        className="btn-link"
        onClick={() => {
          togglePreviewModeInUrl()
          // Force a re-render of the consumer components by reloading — preview-data is module-scope so the hook
          // won't pick up the change otherwise.
          window.location.reload()
        }}
      >
        Switch to live data
      </button>
    </div>
  )
}
