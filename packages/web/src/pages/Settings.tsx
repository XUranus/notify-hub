import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTranslation } from '@/lib/i18n'
import { useTheme } from '@/lib/theme'
import { authApi, usersApi, isAdmin } from '@/lib/api'
import { Globe, Moon, Sun, Shield, FileText, CheckCircle, Users, Plus, Trash2, Pencil } from 'lucide-react'

// ── Language Tab ──

function LanguageSettings() {
  const { locale, setLocale, t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          {t('settings.language.title')}
        </CardTitle>
        <CardDescription>{t('settings.language.desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Select value={locale} onValueChange={(v) => setLocale(v as any)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zh-CN">{t('settings.language.zh')}</SelectItem>
            <SelectItem value="en-US">{t('settings.language.en')}</SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  )
}

// ── Theme Tab ──

function ThemeSettings() {
  const { theme, setTheme } = useTheme()
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          {t('settings.theme.title')}
        </CardTitle>
        <CardDescription>{t('settings.theme.desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4" />
            <span className="text-sm">{t('settings.theme.light')}</span>
          </div>
          <Switch
            checked={theme === 'dark'}
            onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
          />
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4" />
            <span className="text-sm">{t('settings.theme.dark')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Security Tab ──

function SecuritySettings() {
  const { t } = useTranslation()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: t('settings.security.minLength') })
      return
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: t('settings.security.mismatch') })
      return
    }

    setLoading(true)
    const result = await authApi.changePassword(currentPassword, newPassword)
    setLoading(false)

    if (result.success) {
      setMessage({ type: 'success', text: t('settings.security.success') })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } else {
      setMessage({ type: 'error', text: result.error || t('common.error') })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          {t('settings.security.title')}
        </CardTitle>
        <CardDescription>{t('settings.security.desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          {message && (
            <div
              className={`p-3 rounded-md text-sm flex items-center gap-2 ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {message.type === 'success' && <CheckCircle className="h-4 w-4" />}
              {message.text}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="currentPassword">{t('settings.security.current')}</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">{t('settings.security.new')}</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t('settings.security.confirm')}</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? t('common.loading') : t('settings.security.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ── Logs Tab ──

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
type LogLevel = (typeof LOG_LEVELS)[number]

const LOG_STORAGE_KEY = 'notifyhub_log_level'

function LogSettings() {
  const { t } = useTranslation()
  const [level, setLevel] = useState<LogLevel>(
    () => (localStorage.getItem(LOG_STORAGE_KEY) as LogLevel) || 'info'
  )

  const handleChange = (newLevel: LogLevel) => {
    setLevel(newLevel)
    localStorage.setItem(LOG_STORAGE_KEY, newLevel)
  }

  const levelDesc: Record<LogLevel, string> = {
    debug: t('settings.logs.debug'),
    info: t('settings.logs.info'),
    warn: t('settings.logs.warn'),
    error: t('settings.logs.error'),
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t('settings.logs.title')}
        </CardTitle>
        <CardDescription>{t('settings.logs.desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label>{t('settings.logs.level')}</Label>
          <Select value={level} onValueChange={(v) => handleChange(v as LogLevel)}>
            <SelectTrigger className="w-[300px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOG_LEVELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {levelDesc[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Users Tab (admin only) ──

interface UserItem {
  id: number
  email: string
  username: string
  role: 'admin' | 'user'
  createdAt: string
}

function UserManagement() {
  const { t } = useTranslation()
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)
  const [error, setError] = useState('')

  // Create form
  const [newEmail, setNewEmail] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user')

  // Edit form
  const [editEmail, setEditEmail] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user')

  const fetchUsers = async () => {
    setLoading(true)
    const result = await usersApi.list()
    if (result.success && result.data) {
      setUsers(result.data)
    }
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < 6) {
      setError(t('settings.security.minLength'))
      return
    }
    const result = await usersApi.create({
      email: newEmail, username: newUsername, password: newPassword, role: newRole,
    })
    if (result.success) {
      setShowCreate(false)
      setNewEmail('')
      setNewUsername('')
      setNewPassword('')
      setNewRole('user')
      fetchUsers()
    } else {
      setError(result.error || t('common.error'))
    }
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setError('')
    const result = await usersApi.update(editingUser.id, {
      email: editEmail, username: editUsername, role: editRole,
    })
    if (result.success) {
      setEditingUser(null)
      fetchUsers()
    } else {
      setError(result.error || t('common.error'))
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t('users.deleteConfirm'))) return
    setError('')
    const result = await usersApi.delete(id)
    if (result.success) {
      fetchUsers()
    } else {
      setError(result.error || t('common.error'))
    }
  }

  const startEdit = (user: UserItem) => {
    setEditingUser(user)
    setEditEmail(user.email)
    setEditUsername(user.username)
    setEditRole(user.role)
    setShowCreate(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('users.title')}
            </CardTitle>
            <CardDescription>{t('users.title')}</CardDescription>
          </div>
          <Button size="sm" onClick={() => { setShowCreate(true); setEditingUser(null); setError('') }}>
            <Plus className="h-4 w-4 mr-1" />
            {t('users.add')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="mb-6 p-4 border rounded-lg space-y-3">
            <h4 className="font-medium">{t('users.new')}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t('users.email')}</Label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                  placeholder={t('users.emailPlaceholder')} required />
              </div>
              <div className="space-y-1">
                <Label>{t('users.username')}</Label>
                <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
                  placeholder={t('users.usernamePlaceholder')} required />
              </div>
              <div className="space-y-1">
                <Label>{t('users.password')}</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('users.passwordPlaceholder')} required />
              </div>
              <div className="space-y-1">
                <Label>{t('users.role')}</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as 'admin' | 'user')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">{t('users.roleUser')}</SelectItem>
                    <SelectItem value="admin">{t('users.roleAdmin')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm">{t('users.create')}</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowCreate(false)}>
                {t('users.cancel')}
              </Button>
            </div>
          </form>
        )}

        {/* Edit form */}
        {editingUser && (
          <form onSubmit={handleEdit} className="mb-6 p-4 border rounded-lg space-y-3">
            <h4 className="font-medium">{t('users.editUser')}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t('users.email')}</Label>
                <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>{t('users.username')}</Label>
                <Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>{t('users.role')}</Label>
                <Select value={editRole} onValueChange={(v) => setEditRole(v as 'admin' | 'user')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">{t('users.roleUser')}</SelectItem>
                    <SelectItem value="admin">{t('users.roleAdmin')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm">{t('users.save')}</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditingUser(null)}>
                {t('users.cancel')}
              </Button>
            </div>
          </form>
        )}

        {/* Users table */}
        {loading ? (
          <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
        ) : users.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('users.empty')}</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">{t('users.email')}</th>
                  <th className="text-left px-4 py-2 font-medium">{t('users.username')}</th>
                  <th className="text-left px-4 py-2 font-medium">{t('users.role')}</th>
                  <th className="text-left px-4 py-2 font-medium">{t('users.createdAt')}</th>
                  <th className="text-right px-4 py-2 font-medium">{t('users.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2">{user.email}</td>
                    <td className="px-4 py-2">{user.username}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        user.role === 'admin'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {user.role === 'admin' ? t('users.roleAdmin') : t('users.roleUser')}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(user)}
                        className="h-7 px-2 text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(user.id)}
                        className="h-7 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Settings Page ──

export default function Settings() {
  const { t } = useTranslation()
  const admin = isAdmin()

  return (
    <div>
      <h2 className="text-3xl font-bold tracking-tight mb-6">{t('settings.title')}</h2>

      <Tabs defaultValue="language" className="space-y-4">
        <TabsList>
          <TabsTrigger value="language">
            <Globe className="h-4 w-4 mr-2" />
            {t('settings.language')}
          </TabsTrigger>
          <TabsTrigger value="theme">
            <Sun className="h-4 w-4 mr-2" />
            {t('settings.theme')}
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="h-4 w-4 mr-2" />
            {t('settings.security')}
          </TabsTrigger>
          <TabsTrigger value="logs">
            <FileText className="h-4 w-4 mr-2" />
            {t('settings.logs')}
          </TabsTrigger>
          {admin && (
            <TabsTrigger value="users">
              <Users className="h-4 w-4 mr-2" />
              {t('users.title')}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="language">
          <LanguageSettings />
        </TabsContent>

        <TabsContent value="theme">
          <ThemeSettings />
        </TabsContent>

        <TabsContent value="security">
          <SecuritySettings />
        </TabsContent>

        <TabsContent value="logs">
          <LogSettings />
        </TabsContent>

        {admin && (
          <TabsContent value="users">
            <UserManagement />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
