import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { isAuthenticated } from '@/lib/api'
import { I18nProvider } from '@/lib/i18n'
import { ThemeProvider } from '@/lib/theme'
import AdminLayout from '@/layouts/AdminLayout'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Dashboard from '@/pages/Dashboard'
import Channels from '@/pages/Channels'
import Messages from '@/pages/Messages'
import Templates from '@/pages/Templates'
import Tokens from '@/pages/Tokens'
import Settings from '@/pages/Settings'
import Attachments from '@/pages/Attachments'
import Admin from '@/pages/Admin'

const queryClient = new QueryClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="channels" element={<Channels />} />
                <Route path="messages" element={<Messages />} />
                <Route path="templates" element={<Templates />} />
                <Route path="tokens" element={<Tokens />} />
                <Route path="attachments" element={<Attachments />} />
                <Route path="settings" element={<Settings />} />
                <Route path="admin" element={<Admin />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </I18nProvider>
  )
}
