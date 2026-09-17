/**
 * ToastPopup — the single unified toast popup for every use case
 * (sign-in, sign-out, share-profile link, reminders, goals, ...).
 *
 * Responsive by design: long content such as profile URLs wraps inside
 * the popup instead of overflowing off-screen.
 */
export function ToastPopup({ message, showTick = true }) {
  if (!message) return null
  return (
    <div className="toast-popup" role="status" aria-live="polite">
      {showTick && (
        <span className="toast-popup-tick" aria-hidden="true">
          <svg width="11" height="11" viewBox="0 0 12 12" focusable="false">
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
      <span className="toast-popup-text">{message}</span>
    </div>
  )
}

export default ToastPopup
