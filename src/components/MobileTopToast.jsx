/**
 * MobileTopToast — mobile-app-only toast popup shown at the top of the
 * screen. Desktop keeps using ToastPopup. Same dynamic API: message text
 * plus an optional tick mark; long content wraps inside the card.
 */
export function MobileTopToast({ message, showTick = true }) {
  if (!message) return null
  return (
    <div className="mobile-top-toast" role="status" aria-live="polite">
      {showTick && (
        <span className="mobile-top-toast-tick" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12" focusable="false">
            <path
              d="M2 6.4 4.8 9.2 10 3.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
      <span className="mobile-top-toast-text">{message}</span>
      <span className="mobile-top-toast-glow" aria-hidden="true" />
    </div>
  )
}

export default MobileTopToast
