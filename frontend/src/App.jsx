// frontend/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isSessionValid }  from './api'
import { ThemeProvider }   from './context/ThemeContext'
import SessionManager      from './components/SessionManager'
import Landing             from './pages/Landing'
import Login               from './pages/Login'
import Register            from './pages/Register'
import ForgotPassword      from './pages/ForgotPassword'
import Dashboard           from './pages/Dashboard'
import Upload              from './pages/Upload'
import NotesViewer         from './pages/NotesViewer'
import Profile             from './pages/Profile'
import Groups              from './pages/Groups'
import GroupDetail         from './pages/GroupDetail'
import SharedNote          from './pages/SharedNote'

/** Redirect unauthenticated users to /login */
const PrivateRoute = ({ children }) =>
  isSessionValid() ? children : <Navigate to="/login" replace />

/** Redirect already-logged-in users away from auth pages */
const PublicAuthRoute = ({ children }) =>
  isSessionValid() ? <Navigate to="/dashboard" replace /> : children

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        {/* Global session expiry monitor — shows banner when < 30 min left */}
        <SessionManager />

        <Routes>
          {/* Public */}
          <Route path="/"                element={<Landing />} />
          <Route path="/login"           element={<PublicAuthRoute><Login          /></PublicAuthRoute>} />
          <Route path="/register"        element={<PublicAuthRoute><Register       /></PublicAuthRoute>} />
          <Route path="/forgot-password" element={<PublicAuthRoute><ForgotPassword /></PublicAuthRoute>} />

          {/* Protected */}
          <Route path="/dashboard"       element={<PrivateRoute><Dashboard   /></PrivateRoute>} />
          <Route path="/upload"          element={<PrivateRoute><Upload      /></PrivateRoute>} />
          <Route path="/notes/:jobId"    element={<PrivateRoute><NotesViewer /></PrivateRoute>} />
          <Route path="/profile"         element={<PrivateRoute><Profile     /></PrivateRoute>} />
          <Route path="/groups"          element={<PrivateRoute><Groups      /></PrivateRoute>} />
          <Route path="/groups/:groupId" element={<PrivateRoute><GroupDetail /></PrivateRoute>} />

          {/* Public shared note */}
          <Route path="/shared/:token"   element={<SharedNote />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
