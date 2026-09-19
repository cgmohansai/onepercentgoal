/**
 * Authentication Service for OnePercentGoal (OPG).
 *
 * Encapsulates:
 * - Current user retrieval via /api/auth/me
 * - Google OAuth credential verification via /api/auth/google
 * - GIS Token Client orchestration
 * - Single-use authorization code generation and exchange
 * - Session restoration from URL parameters or deep links
 * - Logout and session revocation
 * - Profile setup / updates via /api/auth/profile
 */

import {
  apiFetch,
  buildHeaders,
  getStoredToken,
  setStoredToken,
  removeStoredToken,
} from '../../services/apiClient.js'
import {
  GOOGLE_CLIENT_ID,
  parseAuthUrl,
} from './authUtils.js'

/**
 * Fetches the currently authenticated user from the backend.
 * Supports Bearer token and HttpOnly session cookies.
 *
 * @param {string|null} [token=null] - Optional explicit session token
 * @returns {Promise<any>} The authenticated user object
 */
export async function getCurrentUser(token = null) {
  const authToken = token !== null && token !== undefined ? token : getStoredToken()
  if (!authToken) {
    return null
  }
  const headers = { Authorization: `Bearer ${authToken}` }
  const res = await apiFetch('/api/auth/me', { headers })
  if (!res.ok) {
    throw new Error(`Failed to authenticate session (${res.status})`)
  }
  const data = await res.json()
  return data?.user || null
}

/**
 * Verifies a Google OAuth access token or credential payload with the backend.
 *
 * @param {Record<string, any>} payload - Payload containing access_token or credential
 * @returns {Promise<{ token: string, user: any }>}
 */
export async function verifyGoogleCredential(payload) {
  const res = await apiFetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    auth: false,
  })

  const responseBody = await res.text()
  let result = {}
  let responseHost = ''
  try {
    responseHost = new URL(res.url || '', window.location.href).host
  } catch {
    responseHost = ''
  }
  if (responseBody) {
    try {
      result = JSON.parse(responseBody)
    } catch {
      // Non-JSON 200 bodies are almost always an HTML page (SPA fallback,
      // proxy/captive-portal page) — surface a preview so it's diagnosable.
      const preview = responseBody.replace(/\s+/g, ' ').trim().slice(0, 80)
      throw new Error(
        res.ok
          ? `Google sign-in returned an unreadable response (HTTP 200 from ${responseHost || 'unknown host'}): ${preview}`
          : `Google sign-in service is unavailable (${res.status}). Please try again shortly.`
      )
    }
  }

  if (!res.ok) {
    throw new Error(
      result.detail || `Google sign-in verification failed (${res.status})`
    )
  }
  if (!result.token || !result.user) {
    throw new Error('Google sign-in did not return a session. Please try again.')
  }

  return result
}

/**
 * Requests an OAuth access token using Google Identity Services (GIS).
 *
 * @param {object} options
 * @param {string} [options.clientId=GOOGLE_CLIENT_ID]
 * @param {(accessToken: string) => void} options.onToken
 * @param {(error: Error) => void} options.onError
 * @param {() => void} [options.onCancel]
 */
export function requestGoogleAccessToken({
  clientId = GOOGLE_CLIENT_ID,
  onToken,
  onError,
  onCancel,
}) {
  if (typeof window === 'undefined' || !window.google?.accounts?.oauth2) {
    throw new Error('Google sign-in is still loading. Please try again.')
  }

  const client = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'openid email profile',
    callback: response => {
      if (response?.access_token) {
        onToken(response.access_token)
      } else if (response?.error) {
        onError(
          new Error(
            response.error_description ||
              'Google sign-in was cancelled. Please try again.'
          )
        )
      } else if (onCancel) {
        onCancel()
      }
    },
    error_callback: error => {
      let message = 'Google sign-in could not be completed. Please try again.'
      if (error?.type === 'popup_closed') {
        message = 'Google sign-in window was closed. Please try again.'
      } else if (error?.type === 'popup_failed_to_open') {
        message = 'Sign-in popup was blocked. Please allow popups and try again.'
      } else if (error?.message) {
        message = error.message
      }
      onError(new Error(message))
    },
  })

  client.requestAccessToken({ prompt: 'select_account' })
}

/**
 * Exchanges a single-use authorization code for a session token.
 *
 * @param {string} code - The single-use authorization code
 * @returns {Promise<{ token: string, user?: any }>}
 */
export async function exchangeAuthorizationCode(code) {
  const res = await apiFetch('/api/auth/exchange-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
    auth: false,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Exchange code failed (${res.status})`)
  }

  return res.json()
}

/**
 * Creates a single-use authorization exchange code for native handover.
 *
 * @param {string} token - The active session token
 * @returns {Promise<string|null>} The authorization code, or null on failure
 */
export async function createAuthorizationExchangeCode(token) {
  try {
    const res = await apiFetch('/api/auth/create-exchange-code', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.code || null
  } catch {
    return null
  }
}

/**
 * Updates or sets up the authenticated user's profile.
 *
 * @param {object} profileData
 * @param {string|null} [token=null]
 * @returns {Promise<any>}
 */
export async function updateAuthProfile(profileData, token = null) {
  const headers = buildHeaders({ 'Content-Type': 'application/json' }, token)
  const res = await apiFetch('/api/auth/profile', {
    method: 'POST',
    headers,
    body: JSON.stringify(profileData),
  })
  const result = await res.json()
  if (!res.ok) {
    throw new Error(result.detail || 'Unable to save profile')
  }
  return result
}

/**
 * Logs out the current user, revoking server session and removing local tokens.
 *
 * @param {string|null} [sessionToken=null]
 * @returns {Promise<void>}
 */
export async function logout(sessionToken = null) {
  if (typeof window !== 'undefined' && window.google?.accounts?.id) {
    try {
      window.google.accounts.id.disableAutoSelect()
    } catch {}
  }

  const token = sessionToken || getStoredToken()
  if (token) {
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {}
  }

  removeStoredToken()
}

/**
 * Restores session from a deep link or app launch URL.
 * Exchanges authorization code if present, retrieves current user, and persists token.
 *
 * @param {string} url
 * @returns {Promise<{ token: string, user: any }|null>}
 */
export async function restoreNativeSession(url) {
  let { token, code } = parseAuthUrl(url)

  if (code) {
    try {
      const exchangeData = await exchangeAuthorizationCode(code)
      if (exchangeData?.token) {
        token = exchangeData.token
      }
    } catch {}
  }

  if (token) {
    setStoredToken(token)
    const user = await getCurrentUser(token)
    return { token, user }
  }

  return null
}
