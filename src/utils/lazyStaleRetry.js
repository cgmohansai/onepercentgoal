import { lazy } from 'react'

// Wraps a dynamic import so a stale-deployment chunk failure triggers at most
// ONE hard reload per tab session, then surfaces to the ErrorBoundary.
// Background: Vite emits a new hash per build (e.g. Silk-<hash>.js). A
// long-lived mobile tab / installed PWA can hold deploy-N HTML while the
// server is already at deploy N+1, so the lazy chunk 404s with
// "TypeError: Failed to fetch dynamically imported module".
// A single reload fetches fresh HTML pointing at the current chunks.
// The sessionStorage guard prevents infinite reload loops: if the chunk is
// still missing after the reload, the error is rethrown.
const RETRY_KEY = 'opg-chunk-retry-v1'

function readRetried() {
  try {
    return sessionStorage.getItem(RETRY_KEY) === '1'
  } catch {
    return false
  }
}

function markRetried() {
  try {
    sessionStorage.setItem(RETRY_KEY, '1')
  } catch {
    // storage unavailable — fall through to rethrow below
  }
}

function clearRetried() {
  try {
    sessionStorage.removeItem(RETRY_KEY)
  } catch {
    // ignore
  }
}

export function lazyWithStaleRetry(importer) {
  return lazy(() =>
    importer().then(
      module => {
        clearRetried()
        return module
      },
      error => {
        if (!readRetried()) {
          markRetried()
          window.location.reload()
          return new Promise(() => {})
        }
        throw error
      }
    )
  )
}

export default lazyWithStaleRetry
