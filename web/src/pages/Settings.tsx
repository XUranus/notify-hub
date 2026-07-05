import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useTranslation } from '@/lib/i18n'
import { useTheme } from '@/lib/theme'
import { authApi, userSettingsApi, getCurrentUser, clearToken } from '@/lib/api'
import { Globe, Moon, Sun, Shield, CheckCircle, Clock, HardDrive, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// ── General Tab (Language + Theme) ──

function GeneralSettings() {
  const { locale, setLocale, t } = useTranslation()
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-6">
      {/* Language */}
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

      {/* Theme */}
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
    </div>
  )
}

// ── Security Tab ──

function SecuritySettings() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = getCurrentUser()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  // Account deletion state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

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
    <div className="space-y-6">
      {user && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t('settings.security.account')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-16">ID</span>
                <span className="font-mono">{user.id}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-16">Email</span>
                <span className="font-mono">{user.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-16">{t('settings.security.role')}</span>
                <span className="font-mono">{user.role === 'admin' ? t('users.roleAdmin') : t('users.roleUser')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
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

      {/* Danger Zone — Account Deletion (non-admin only) */}
      {user && user.role !== 'admin' && (
        <Card className="border-destructive/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                {t('settings.danger.title')}
                <span className="text-sm font-normal text-muted-foreground ml-1">{t('settings.danger.desc')}</span>
              </CardTitle>
              <Button variant="destructive" size="sm" onClick={() => setShowDeleteModal(true)}>
                {t('settings.danger.deleteAccount')}
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Delete Account Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">{t('settings.danger.confirmTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('settings.danger.confirmDesc')}</p>
            {deleteError && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{deleteError}</div>
            )}
            <div className="space-y-2">
              <Label>{t('settings.danger.confirmEmail')}</Label>
              <Input
                type="email"
                value={deleteEmail}
                onChange={(e) => setDeleteEmail(e.target.value)}
                placeholder={user?.email}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('settings.danger.confirmPassword')}</Label>
              <Input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDeleteModal(false); setDeleteEmail(''); setDeletePassword(''); setDeleteError(null) }}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={deleting || !deleteEmail || !deletePassword}
              onClick={async () => {
                setDeleting(true)
                setDeleteError(null)
                const result = await authApi.deleteAccount(deleteEmail, deletePassword)
                setDeleting(false)
                if (result.success) {
                  clearToken()
                  navigate('/login')
                } else {
                  setDeleteError(result.error || t('common.error'))
                }
              }}
            >
              {deleting ? t('common.loading') : t('settings.danger.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Attachment Settings Tab ──

function AttachmentSettings() {
  const { t } = useTranslation()
  const [attachmentExpiration, setAttachmentExpiration] = useState(0)
  const [messageExpiration, setMessageExpiration] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    userSettingsApi.get().then((res) => {
      if (res.success && res.data) {
        setAttachmentExpiration(res.data.attachmentExpiration)
        setMessageExpiration(res.data.messageExpiration)
      }
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    const res = await userSettingsApi.update({ attachmentExpiration, messageExpiration })
    setSaving(false)
    if (res.success) setSaved(true)
  }

  const attachmentOptions = [
    { value: 0, label: t('settings.attachments.never') },
    { value: 1, label: t('settings.attachments.24h') },
    { value: 3, label: t('settings.attachments.3d') },
    { value: 7, label: t('settings.attachments.1w') },
    { value: 30, label: t('settings.attachments.1m') },
  ]

  const messageOptions = [
    { value: 0, label: t('settings.attachments.never') },
    { value: 1, label: t('settings.attachments.24h') },
    { value: 3, label: t('settings.attachments.3d') },
    { value: 7, label: t('settings.attachments.1w') },
  ]

  return (
    <div className="space-y-6">
      {/* Message Expiration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('settings.messages.title')}
          </CardTitle>
          <CardDescription>{t('settings.messages.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('settings.messages.expiration')}</Label>
            <Select value={String(messageExpiration)} onValueChange={(v) => { setMessageExpiration(Number(v)); setSaved(false) }}>
              <SelectTrigger className="w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {messageOptions.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('settings.messages.expirationHint')}</p>
          </div>
        </CardContent>
      </Card>

      {/* Attachment Expiration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('settings.attachments.title')}
          </CardTitle>
          <CardDescription>{t('settings.attachments.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('settings.attachments.expiration')}</Label>
            <Select value={String(attachmentExpiration)} onValueChange={(v) => { setAttachmentExpiration(Number(v)); setSaved(false) }}>
              <SelectTrigger className="w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {attachmentOptions.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t('common.loading') : t('settings.attachments.save')}
        </Button>
        {saved && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle className="h-4 w-4" /> {t('settings.attachments.saved')}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Settings Page ──

export default function Settings() {
  const { t } = useTranslation()
  const params = new URLSearchParams(window.location.search)
  const defaultTab = params.get('tab') === 'security' ? 'security' : 'general'
  const mustChangePassword = params.get('mustChangePassword') === '1'

  return (
    <div>
      <h2 className="text-3xl font-bold tracking-tight mb-6">{t('settings.title')}</h2>

      {mustChangePassword && (
        <div className="mb-4 p-4 rounded-md bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400 text-sm">
          ⚠️ {t('settings.mustChangePassword')}
        </div>
      )}

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">
            <Globe className="h-4 w-4 mr-2" />
            {t('settings.general')}
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="h-4 w-4 mr-2" />
            {t('settings.security')}
          </TabsTrigger>
          <TabsTrigger value="attachments">
            <HardDrive className="h-4 w-4 mr-2" />
            {t('settings.attachments')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralSettings />
        </TabsContent>

        <TabsContent value="security">
          <SecuritySettings />
        </TabsContent>

        <TabsContent value="attachments">
          <AttachmentSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}
