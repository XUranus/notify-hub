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
  Paperclip,
  Shield,
  Tags,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { clearToken, getCurrentUser, isAdmin } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'

export default function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const currentUser = getCurrentUser()
  const admin = isAdmin()

  const navItems = [
    { href: '/', label: t('nav.dashboard'), icon: LayoutDashboard },
    { href: '/channels', label: t('nav.channels'), icon: Radio },
    { href: '/messages', label: t('nav.messages'), icon: MessageSquare },
    { href: '/templates', label: t('nav.templates'), icon: FileText },
    { href: '/tokens', label: t('nav.tokens'), icon: Key },
    { href: '/topics', label: t('nav.topics'), icon: Tags },
    { href: '/attachments', label: t('nav.attachments'), icon: Paperclip },
  ]

  const handleLogout = () => {
    clearToken()
    navigate('/login')
  }

  const isActive = (href: string) =>
    href === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(href)

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-56 bg-surface-variant/30 border-r flex flex-col">
        <div className="p-5 border-b">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
              <Bell className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold">{t('nav.brand')}</h1>
              <p className="text-xs text-muted-foreground">{t('nav.subtitle')}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-all',
                  active
                    ? 'bg-primary-container text-on-primary-container'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t space-y-0.5">
          {currentUser && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground">
              <div className="h-8 w-8 rounded-full bg-primary-container flex items-center justify-center">
                <User className="h-4 w-4 text-on-primary-container" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="truncate block text-xs font-medium text-foreground">{currentUser.email}</span>
                {currentUser.role === 'admin' && (
                  <span className="text-[10px] bg-tertiary-container text-on-tertiary-container px-1.5 py-0.5 rounded-full font-medium">
                    Admin
                  </span>
                )}
              </div>
            </div>
          )}
          {admin && (
            <Link
              to="/admin"
              className={cn(
                'flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-all w-full',
                location.pathname.startsWith('/admin')
                  ? 'bg-primary-container text-on-primary-container'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Shield className="h-5 w-5" />
              {t('nav.admin')}
            </Link>
          )}
          <Link
            to="/settings"
            className={cn(
              'flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-all w-full',
              location.pathname.startsWith('/settings')
                ? 'bg-primary-container text-on-primary-container'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Settings className="h-5 w-5" />
            {t('nav.settings')}
          </Link>
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground rounded-full"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5 mr-2" />
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
