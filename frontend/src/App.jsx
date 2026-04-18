// frontend/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing        from './pages/Landing';
import Login          from './pages/Login';
import Register       from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard      from './pages/Dashboard';
import Upload         from './pages/Upload';
import NotesViewer    from './pages/NotesViewer';
import Profile        from './pages/Profile';

/** Redirect un-authenticated users to /login */
const PrivateRoute = ({ children }) =>
  localStorage.getItem('token') ? children : <Navigate to="/login" replace />;

/** Redirect already-logged-in users away from auth pages */
const PublicAuthRoute = ({ children }) =>
  localStorage.getItem('token') ? <Navigate to="/dashboard" replace /> : children;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />

        {/* Auth pages — redirect logged-in users to dashboard */}
        <Route path="/login"           element={<PublicAuthRoute><Login          /></PublicAuthRoute>} />
        <Route path="/register"        element={<PublicAuthRoute><Register       /></PublicAuthRoute>} />
        <Route path="/forgot-password" element={<PublicAuthRoute><ForgotPassword /></PublicAuthRoute>} />

        {/* Protected pages */}
        <Route path="/dashboard"    element={<PrivateRoute><Dashboard   /></PrivateRoute>} />
        <Route path="/upload"       element={<PrivateRoute><Upload      /></PrivateRoute>} />
        <Route path="/notes/:jobId" element={<PrivateRoute><NotesViewer /></PrivateRoute>} />
        <Route path="/profile"      element={<PrivateRoute><Profile     /></PrivateRoute>} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
