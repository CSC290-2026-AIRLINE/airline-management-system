import { togglePreviewModeInUrl } from '../hooks/usePreviewMode'
import './AdminPreviewBanner.css'

/**
 * Sticky amber strip rendered at the top of admin pages when `?preview=1` is active. Reminds the user that nothing is
 * real and gives them a one-click way to flip back to live data.
 */
export function AdminPreviewBanner() {
  return (
    <div className="admin-preview-banner" role="status">
      <span className="badge">PREVIEW</span>
      <p>Design-preview mode — page is showing sample data, not the live backend. None of these rows are persisted.</p>
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
