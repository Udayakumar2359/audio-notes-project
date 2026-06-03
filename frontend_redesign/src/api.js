// frontend/src/api.js
// ─────────────────────────────────────────────────────────────
// Axios instance — auto-attaches JWT, session management, 401 handler
//
// Session management:
//   • Token lifespan stored alongside JWT in localStorage
//   • Any request checks expiry BEFORE sending → redirects instantly
//   • Session expiry warning shown in <SessionManager /> component
//   • On 401 from server → clear session + redirect to /login
// ─────────────────────────────────────────────────────────────
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 180_000,   // 3 min for long uploads + processing polls
})

// ── Session helpers ───────────────────────────────────────────

/** Save token + compute absolute expiry timestamp in ms */
export function saveSession(tokenData) {
  const { access_token, user, expires_in_seconds } = tokenData
  const expiresAt = Date.now() + (expires_in_seconds ?? 7 * 24 * 3600) * 1000
  localStorage.setItem('token',      access_token)
  localStorage.setItem('user',       JSON.stringify(user))
  localStorage.setItem('expires_at', String(expiresAt))
}

/** Clear all session data */
export function clearSession() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  localStorage.removeItem('expires_at')
}

/** Returns true if session exists AND has not expired */
export function isSessionValid() {
  const token     = localStorage.getItem('token')
  const expiresAt = localStorage.getItem('expires_at')
  if (!token) return false
  if (expiresAt && Date.now() > parseInt(expiresAt, 10)) {
    clearSession()
    return false
  }
  return true
}

/** Returns milliseconds until expiry (negative if already expired) */
export function msUntilExpiry() {
  const expiresAt = localStorage.getItem('expires_at')
  if (!expiresAt) return Infinity
  return parseInt(expiresAt, 10) - Date.now()
}

/** Is session expiring within X ms from now? */
export function isExpiringSoon(thresholdMs = 30 * 60 * 1000) {
  const ms = msUntilExpiry()
  return ms > 0 && ms < thresholdMs
}

// ── Request interceptor ───────────────────────────────────────
// Only attaches the token — does NOT redirect.
// Public endpoints (/auth/register, /auth/login, etc.) work fine without a token.
// Protected endpoint 401s are caught by the response interceptor below.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor ──────────────────────────────────────
// Only redirect to /login on 401 if the user actually had a token
// (i.e., they were authenticating with a protected endpoint and it failed).
// This prevents public endpoint errors from causing spurious redirects.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status    = error.response?.status
    const hadToken  = !!localStorage.getItem('token')
    if (status === 401 && hadToken) {
      clearSession()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
