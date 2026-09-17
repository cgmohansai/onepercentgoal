/**
 * Authentication and Google Identity utilities for OnePercentGoal (OPG).
 */

export const GOOGLE_CLIENT_ID =
  import.meta.env?.VITE_GOOGLE_CLIENT_ID ||
  '420117390479-kjelftir7nr413rh3b7c9327ia27c6o2.apps.googleusercontent.com'

export const WEB_APP_URL =
  import.meta.env?.VITE_APP_URL?.replace(/\/$/, '') ||
  (typeof window !== 'undefined' && window.location.protocol.startsWith('http')
    ? window.location.origin
    : '')

export const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'

export const NATIVE_AUTH_RETURN_SCHEME = 'com.onepercentgoal.app://auth'

/**
 * Checks if the current environment is a Capacitor native app shell.
 * @returns {boolean}
 */
export function isNativeShell() {
  return Boolean(
    typeof window !== 'undefined' &&
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  )
}

let gisLoadPromise = null

/**
 * Asynchronously loads the Google Identity Services (GIS) client script if not already loaded.
 * @returns {Promise<void>}
 */
export function loadGoogleIdentityServices() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window is not available'))
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve()
  }
  if (gisLoadPromise) {
    return gisLoadPromise
  }
  gisLoadPromise = new Promise((resolve, reject) => {
    const script =
      document.querySelector(`script[src="${GIS_SCRIPT_URL}"]`) ||
      document.createElement('script')
    script.src = GIS_SCRIPT_URL
    script.async = true
    script.onload = () =>
      window.google?.accounts?.oauth2
        ? resolve()
        : reject(new Error('Google sign-in did not load'))
    script.onerror = () => reject(new Error('Google sign-in could not be loaded'))
    if (!script.parentNode) {
      document.head.appendChild(script)
    }
  })
  return gisLoadPromise
}

/**
 * Parses authentication tokens and authorization codes from URL query/hash parameters.
 * Supports both standard web navigation URLs and Capacitor deep links.
 *
 * @param {string} [urlString] - Full URL, path, or query string
 * @returns {{ token: string, code: string, accessToken: string }}
 */
export function parseAuthUrl(urlString) {
  let token = ''
  let code = ''
  let accessToken = ''

  if (!urlString && typeof window !== 'undefined') {
    urlString = window.location.href
  }
  if (!urlString) {
    return { token, code, accessToken }
  }

  try {
    // Windowless fallback (tests/SSR only): intentionally never a localhost
    // URL — the regex extraction below covers anything this base cannot parse.
    const base =
      typeof window !== 'undefined' ? window.location.origin : WEB_APP_URL || undefined
    const parsed = base ? new URL(urlString, base) : new URL(urlString)
    code = parsed.searchParams.get('code') || ''
    token = parsed.searchParams.get('auth_token') || ''
    accessToken = parsed.searchParams.get('access_token') || ''

    if (!accessToken && parsed.hash) {
      const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''))
      accessToken = hashParams.get('access_token') || ''
    }
  } catch {}

  // Fallback regex parsing for malformed URLs or non-standard deep link schemes
  if (typeof urlString === 'string') {
    if (!code) {
      const matchCode = urlString.match(/[?&]code=([^&#]+)/)
      if (matchCode) code = decodeURIComponent(matchCode[1])
    }
    if (!token) {
      const matchToken = urlString.match(/[?&]auth_token=([^&#]+)/)
      if (matchToken) token = decodeURIComponent(matchToken[1])
    }
    if (!accessToken) {
      const matchAccess = urlString.match(/[?&#]access_token=([^&#]+)/)
      if (matchAccess) accessToken = decodeURIComponent(matchAccess[1])
    }
  }

  return { token, code, accessToken }
}

/**
 * Detects if the current web page was launched as a popup/redirect from native OAuth.
 * @returns {string} The return scheme or empty string
 */
export function getNativeAuthReturn() {
  if (typeof window === 'undefined') return ''
  const returnParam = new URLSearchParams(window.location.search).get('auth_return')
  return returnParam === NATIVE_AUTH_RETURN_SCHEME ? NATIVE_AUTH_RETURN_SCHEME : ''
}

/**
 * Removes auth parameters (auth_token, access_token, code) from the browser address bar.
 */
export function cleanAuthUrlParams() {
  if (typeof window !== 'undefined' && window.history?.replaceState) {
    try {
      window.history.replaceState({}, document.title, window.location.pathname)
    } catch {}
  }
}

/**
 * Constructs the native sign-in URL directing the mobile browser to the web OAuth flow.
 * @param {string} [webAppUrl=WEB_APP_URL]
 * @param {string} [returnScheme=NATIVE_AUTH_RETURN_SCHEME]
 * @returns {string}
 */
export function buildNativeOAuthUrl(
  webAppUrl = WEB_APP_URL,
  returnScheme = NATIVE_AUTH_RETURN_SCHEME
) {
  if (!webAppUrl) return ''
  return `${webAppUrl}/?auth_return=${encodeURIComponent(returnScheme)}`
}

/**
 * Constructs the deep-link URL to transition back from web OAuth into the native mobile app.
 * @param {string} nativeAuthReturn
 * @param {{ code?: string, token?: string }} params
 * @returns {string}
 */
export function buildNativeReturnUrl(nativeAuthReturn, { code, token } = {}) {
  if (!nativeAuthReturn) return ''
  if (code) {
    return `${nativeAuthReturn}?code=${encodeURIComponent(code)}`
  }
  if (token) {
    return `${nativeAuthReturn}?auth_token=${encodeURIComponent(token)}`
  }
  return nativeAuthReturn
}
