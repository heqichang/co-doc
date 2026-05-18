import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import DocumentList from './pages/DocumentList'
import Editor from './pages/Editor'
import { useLocalStorage } from './utils/hooks'

function PrivateRoute({ children }) {
  const [token] = useLocalStorage('token', null)
  return token ? children : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const [token] = useLocalStorage('token', null)
  return !token ? children : <Navigate to="/documents" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/documents" replace />} />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />
      <Route
        path="/documents"
        element={
          <PrivateRoute>
            <DocumentList />
          </PrivateRoute>
        }
      />
      <Route
        path="/editor/:id"
        element={
          <PrivateRoute>
            <Editor />
          </PrivateRoute>
        }
      />
    </Routes>
  )
}
