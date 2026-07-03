import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Radio,
  Key,
  FileText,
  MessageSquare,
  LogOut,
  Bell,
  Settings,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { clearToken, getCurrentUser } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'

export default function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const currentUser = getCurrentUser()

  const navItems = [
    { href: '/', label: t('nav.dashboard'), icon: LayoutDashboard },
    { href: '/channels', label: t('nav.channels'), icon: Radio },
    { href: '/messages', label: t('nav.messages'), icon: MessageSquare },
    { href: '/templates', label: t('nav.templates'), icon: FileText },
    { href: '/tokens', label: t('nav.tokens'), icon: Key },
  ]

  const handleLogout = () => {
    clearToken()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-52 bg-card border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold">{t('nav.brand')}</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{t('nav.subtitle')}</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              item.href === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t space-y-1">
          {/* Current user info */}
          {currentUser && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span className="truncate">{currentUser.email}</span>
              {currentUser.role === 'admin' && (
                <span className="ml-auto text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  Admin
                </span>
              )}
            </div>
          )}
          <Link
            to="/settings"
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors w-full',
              location.pathname.startsWith('/settings')
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Settings className="h-4 w-4" />
            {t('nav.settings')}
          </Link>
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {t('nav.logout')}
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
