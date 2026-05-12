// frontend/src/pages/SSOCallback.jsx
// Google OAuth flow: Clerk callback → sync user to PostgreSQL → dashboard
//
// Key fix: AuthenticateWithRedirectCallback redirects to "/sso-callback" (itself)
// so Clerk doesn't bypass our sync step by going straight to /dashboard.
import { useEffect, useRef, useState } from 'react'
import { AuthenticateWithRedirectCallback, useUser, useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

// Loading spinner UI
function LoadingScreen({ message, error }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', gap: '1.25rem',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: 'linear-gradient(135deg, #D97706, #F59E0B)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.75rem', boxShadow: '0 4px 16px rgba(217,119,6,0.35)',
      }}>🎙️</div>
      <div style={{ textAlign: 'center' }}>
        {error ? (
          <p style={{ color: '#EF4444', fontSize: '0.9375rem' }}>⚠️ {error}</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', justifyContent: 'center' }}>
            <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', margin: 0 }}>{message}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Step 2: Clerk session is active — sync to our backend
function SyncThenRedirect() {
  const { getToken } = useAuth()
  const navigate     = useNavigate()
  const didSync      = useRef(false)
  const [status, setStatus] = useState('Syncing your Google account…')
  const [error,  setError]  = useState('')

  useEffect(() => {
    if (didSync.current) return
    didSync.current = true

    const run = async () => {
      try {
        setStatus('Getting Google account details…')
        const token = await getToken()   // Clerk session JWT

        if (!token) {
          setError('Could not read Clerk token. Please try again.')
          setTimeout(() => navigate('/login', { replace: true }), 3000)
          return
        }

        setStatus('Saving your account to the database…')
        const res = await api.post('/auth/clerk-sync', {}, {
          headers: { Authorization: `Bearer ${token}` },
        })

        // Store our backend JWT — same as email+password login
        localStorage.setItem('token', res.data.access_token)
        localStorage.setItem('user',  JSON.stringify(res.data.user))

        console.log('[SSO] Sync success:', res.data.user.email)
        setStatus('Welcome! Loading your dashboard…')
        navigate('/dashboard', { replace: true })

      } catch (err) {
        const detail = err.response?.data?.detail || err.message || 'Unknown error'
        console.error('[SSO] Sync failed:', detail)
        setError(`${detail}. Redirecting to login…`)
        setTimeout(() => navigate('/login', { replace: true }), 3000)
      }
    }

    run()
  }, [])  // run once when component mounts (only when isSignedIn=true)

  if (error) return <LoadingScreen message="" error={error} />
  return <LoadingScreen message={status} />
}

// ── Main SSOCallback component ────────────────────────────────
//
// Flow:
//   Browser lands at /sso-callback with Clerk URL params
//     → isSignedIn = false (session not yet set)
//     → render AuthenticateWithRedirectCallback (processes Clerk params)
//     → ARFC sets session → navigates to /sso-callback (same page, no params)
//   Browser re-renders at /sso-callback without Clerk URL params
//     → isSignedIn = true
//     → render SyncThenRedirect
//     → sync with backend → navigate to /dashboard
//
export default function SSOCallback() {
  const { isLoaded, isSignedIn } = useUser()

  // Not yet determined — show loading
  if (!isLoaded) {
    return <LoadingScreen message="Completing Google sign-in…" />
  }

  // Clerk session is now active — sync to backend
  if (isSignedIn) {
    return <SyncThenRedirect />
  }

  // Clerk hasn't processed the OAuth params yet — render ARFC
  // afterSignInUrl="/sso-callback" keeps us on this page after ARFC finishes
  // (instead of jumping to /dashboard where no backend token exists yet)
  return (
    <>
      <AuthenticateWithRedirectCallback
        afterSignInUrl="/sso-callback"
        afterSignUpUrl="/sso-callback"
      />
      <LoadingScreen message="Processing Google sign-in…" />
    </>
  )
}
