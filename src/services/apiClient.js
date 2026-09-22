/**
 * Dedicated API Client and Networking Service for OnePercentGoal (OPG).
 *
 * Handles:
 * - Base API URL resolution for web (same-origin rewrite) and native mobile shells.
 * - Centralized fetch wrapper with credentials: 'include' (supporting HttpOnly session cookies).
 * - Automatic Authorization header injection for Bearer token auth.
 * - JSON serialization and Content-Type management.
 * - Reusable HTTP convenience methods: api.get, api.post, api.put, api.patch, api.delete.
 * - Centralized token storage access.
 */

export const TOKEN_STORAGE_KEY = 'onepercentgoal.token'
export const FALLBACK_TOKEN_STORAGE_KEY = 'token'

// Website requests stay same-origin through Vercel's /api rewrite. This avoids
// cross-origin login failures; the native shell still uses its configured API.
// NOTE: Capacitor Android serves the app as http://localhost by default, so a
// protocol check alone mistakes the native shell for the website and the app
// ends up calling its own bundled index.html instead of the backend.
export const DEFAULT_PROD_API = 'https://onepercentgoal.onrender.com'

const isNativeShell =
  typeof window !== 'undefined' &&
  Boolean(window.Capacitor?.isNativePlatform?.())

const rawApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '')

export const API_BASE = isNativeShell
  ? (rawApiBase && !rawApiBase.includes('localhost') && !rawApiBase.includes('127.0.0.1')
      ? rawApiBase
      : DEFAULT_PROD_API)
  : (typeof window !== 'undefined' && (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    ? ''
    : (rawApiBase || DEFAULT_PROD_API))

/**
 * Constructs a full API URL for the given endpoint path.
 * @param {string} path - Endpoint path (e.g. '/api/dashboard')
 * @returns {string} Fully-qualified or relative API URL
 */
export const apiUrl = path => `${API_BASE}${path}`

/**
 * Retrieves the stored session token from localStorage.
 * Checks 'onepercentgoal.token' first, with fallback to legacy 'token'.
 * @returns {string} The active token or an empty string
 */
export function getStoredToken() {
  try {
    if (typeof localStorage === 'undefined') return ''
    return localStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(FALLBACK_TOKEN_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

/**
 * Stores the session token in localStorage.
 * @param {string} token
 */
export function setStoredToken(token) {
  try {
    if (typeof localStorage === 'undefined') return
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  } catch {}
}

/**
 * Removes stored tokens from localStorage.
 */
export function removeStoredToken() {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    localStorage.removeItem(FALLBACK_TOKEN_STORAGE_KEY)
  } catch {}
}

/**
 * Builds standard request headers with optional extra headers and Bearer token.
 * If token is not explicitly specified, falls back to the stored token.
 * @param {Record<string, string>} [extra={}]
 * @param {string|null} [token=null]
 * @returns {Record<string, string>}
 */
export function buildHeaders(extra = {}, token = null) {
  const authToken = token && typeof token === 'string' && token.trim() ? token.trim() : getStoredToken()
  const headers = { ...(extra || {}) }
  if (authToken && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${authToken}`
  }
  return headers
}

const inFlightGetRequests = new Map()

/**
 * Universal fetch wrapper for all API requests.
 * Ensures credentials: 'include', base URL resolution,
 * optional automatic Authorization header injection, and JSON serialization.
 *
 * @param {string} path - Request endpoint or full URL
 * @param {RequestInit & { auth?: boolean }} [options={}]
 * @returns {Promise<Response>}
 */
export async function apiFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const isGet = method === 'GET'

  const url = typeof path === 'string' && (path.startsWith('http://') || path.startsWith('https://'))
    ? path
    : apiUrl(path)

  const headers = { ...(options.headers || {}) }

  // Auto-inject Authorization token if not explicitly provided or suppressed
  if (options.auth !== false && !('Authorization' in headers) && !('authorization' in headers)) {
    const token = getStoredToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }

  // Deduplicate identical concurrent in-flight GET requests
  const dedupKey = isGet ? `${url}::${headers.Authorization || ''}` : null
  if (dedupKey && inFlightGetRequests.has(dedupKey)) {
    return inFlightGetRequests.get(dedupKey).then(res => res.clone())
  }

  // Automatically JSON-encode object payloads if body is not already a string/FormData/Blob
  let body = options.body
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json'
    }
    body = JSON.stringify(body)
  }

  const fetchPromise = fetch(url, {
    ...options,
    headers,
    body,
    credentials: 'include',
  })

  if (dedupKey) {
    inFlightGetRequests.set(dedupKey, fetchPromise)
    fetchPromise.finally(() => {
      inFlightGetRequests.delete(dedupKey)
    })
  }

  return fetchPromise
}

/**
 * Helper to unwrap JSON responses or throw a descriptive error on failure.
 * @param {Response} response
 * @returns {Promise<any>}
 */
export async function handleResponse(response) {
  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`
    try {
      const data = await response.json()
      if (data?.detail) errorDetail = data.detail
      else if (data?.message) errorDetail = data.message
    } catch {
      try {
        const text = await response.text()
        if (text) errorDetail = text
      } catch {}
    }
    const error = new Error(errorDetail)
    error.status = response.status
    error.response = response
    throw error
  }
  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    return response.json()
  }
  return response.text()
}

/**
 * Reusable API client object providing HTTP convenience methods.
 */
export const api = {
  base: API_BASE,
  url: apiUrl,
  getStoredToken,
  setStoredToken,
  removeStoredToken,
  buildHeaders,
  fetch: apiFetch,
  request: apiFetch,
  handleResponse,
  get(path, options = {}) {
    return apiFetch(path, { ...options, method: 'GET' })
  },
  post(path, body, options = {}) {
    return apiFetch(path, { ...options, method: 'POST', body })
  },
  put(path, body, options = {}) {
    return apiFetch(path, { ...options, method: 'PUT', body })
  },
  patch(path, body, options = {}) {
    return apiFetch(path, { ...options, method: 'PATCH', body })
  },
  delete(path, options = {}) {
    return apiFetch(path, { ...options, method: 'DELETE' })
  },
  async getJson(path, options = {}) {
    const res = await apiFetch(path, { ...options, method: 'GET' })
    return handleResponse(res)
  },
  async postJson(path, body, options = {}) {
    const res = await apiFetch(path, { ...options, method: 'POST', body })
    return handleResponse(res)
  },
  async patchJson(path, body, options = {}) {
    const res = await apiFetch(path, { ...options, method: 'PATCH', body })
    return handleResponse(res)
  },
  async deleteJson(path, options = {}) {
    const res = await apiFetch(path, { ...options, method: 'DELETE' })
    return handleResponse(res)
  },
}

export default api
