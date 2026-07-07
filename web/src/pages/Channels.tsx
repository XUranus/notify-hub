import { useEffect, useState, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { channelsApi, pushApi, tokensApi } from '@/lib/api'
import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from '@/lib/i18n'
import { formatDate, toDate } from '@/lib/utils'
import {
  Plus, TestTube, Trash2, Radio, Mail, Smartphone, Pencil,
  CheckCircle, XCircle, Loader2, Star, Monitor, RefreshCw, QrCode,
} from 'lucide-react'

/* ── Channel types ── */

interface Channel {
  id: string
  type: string
  name: string
  config: Record<string, unknown>
  enabled: boolean
  isDefault: boolean
}

interface SmtpPreset {
  id: string
  name: string
  host: string
  port: number
  secure: boolean
  description: string
}

const smtpPresets: SmtpPreset[] = [
  { id: 'gmail', name: 'Gmail', host: 'smtp.gmail.com', port: 587, secure: false, description: 'Use App Password, not account password' },
  { id: 'outlook', name: 'Outlook', host: 'smtp-mail.outlook.com', port: 587, secure: false, description: 'STARTTLS, use full email as username' },
  { id: 'qq', name: 'QQ 邮箱', host: 'smtp.qq.com', port: 465, secure: true, description: 'Use authorization code, not QQ password' },
  { id: 'foxmail', name: 'Foxmail', host: 'smtp.exmail.qq.com', port: 465, secure: true, description: 'Tencent enterprise email' },
  { id: '163', name: '163 邮箱', host: 'smtp.163.com', port: 465, secure: true, description: 'Use authorization code, not login password' },
  { id: '126', name: '126 邮箱', host: 'smtp.126.com', port: 465, secure: true, description: 'Use authorization code' },
  { id: 'aliyun', name: '阿里企业邮', host: 'smtp.mxhichina.com', port: 465, secure: true, description: 'Alibaba Cloud enterprise email' },
  { id: 'sendgrid', name: 'SendGrid', host: 'smtp.sendgrid.net', port: 587, secure: false, description: 'Username: "apikey", password: API key' },
  { id: 'custom', name: 'Custom', host: '', port: 587, secure: false, description: 'Configure manually' },
]

const emptyFormData = {
  type: 'email',
  name: '',
  host: '',
  port: '587',
  secure: true,
  username: '',
  password: '',
  fromAddress: '',
  fromName: '',
}

/* ── Push Client types ── */

interface PushClient {
  id: string
  uuid: string
  name: string | null
  os: string
  arch: string | null
  desktop: string | null
  appVersion: string | null
  connectionMode: string | null  // 'sse' | 'ws' | 'poll' | null
  lastSeenAt: string | null
  registeredAt: string
}

const osIcons: Record<string, typeof Monitor> = {
  linux: Monitor,
  windows: Monitor,
  macos: Monitor,
  android: Smartphone,
}

const osLabels: Record<string, string> = {
  linux: 'Linux',
  windows: 'Windows',
  macos: 'macOS',
  android: 'Android',
}

function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false
  return Date.now() - toDate(lastSeenAt).getTime() < 5 * 60 * 1000
}

/* ── Main component ── */

export default function Channels() {
  const { t } = useTranslation()

  // Channel state
  const [channels, setChannels] = useState<Channel[]>([])
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<string>('custom')
  const [formData, setFormData] = useState(emptyFormData)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState('')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testingConfig, setTestingConfig] = useState(false)
  const [testResult, setTestResult] = useState<{ connected: boolean; error?: string } | null>(null)

  // Push clients state
  const [clients, setClients] = useState<PushClient[]>([])

  // QR code modal state
  const [qrOpen, setQrOpen] = useState(false)
  const [qrData, setQrData] = useState<{ serverUrl: string; jwt: string; editable?: boolean } | null>(null)
  const [qrRegisteredClient, setQrRegisteredClient] = useState<PushClient | null>(null)
  const qrClientUuidsRef = useRef<Set<string>>(new Set())

  /* ── Data loading ── */

  const loadChannels = useCallback(() => channelsApi.list().then((res) => {
    if (res.success) setChannels(res.data || [])
  }), [])

  const loadClients = useCallback(() => pushApi.listClients().then((res) => {
    if (res.success) setClients(res.data || [])
  }), [])

  useEffect(() => {
    loadChannels()
    loadClients()
    const timer = setInterval(() => {
      loadChannels()
      loadClients()
    }, 3000)
    return () => clearInterval(timer)
  }, [loadChannels, loadClients])

  // QR modal: poll for new registrations while open
  useEffect(() => {
    if (!qrOpen) {
      setQrRegisteredClient(null)
      return
    }
    // Snapshot current client UUIDs and their lastSeenAt when modal opens
    const knownUuids = new Set(clients.map((c) => c.uuid))
    const openTime = Date.now()
    const timer = setInterval(async () => {
      const res = await pushApi.listClients()
      if (!res.success || !res.data) return
      // Detect: new UUID, OR existing UUID that just registered (lastSeenAt after modal opened)
      const matchedClient = res.data.find((c: PushClient) =>
        !knownUuids.has(c.uuid) ||
        (c.lastSeenAt && toDate(c.lastSeenAt).getTime() > openTime - 5000)
      )
      if (matchedClient) {
        setQrRegisteredClient(matchedClient)
        setClients(res.data)
        clearInterval(timer)
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [qrOpen])

  const handleShowQr = async () => {
    const res = await tokensApi.generateClientToken()
    if (!res.success || !res.data?.token) {
      alert(t('channels.qrNoToken'))
      return
    }
    const detected = window.location.origin
    const isLocalhost = detected.includes('localhost') || detected.includes('127.0.0.1')
    setQrData({
      serverUrl: detected,
      jwt: res.data.token,
      editable: isLocalhost,
    })
    setQrOpen(true)
  }

  /* ── Channel helpers ── */

  const emailChannels = channels.filter((c) => c.type === 'email')
  const smsChannels = channels.filter((c) => c.type === 'sms')

  const resetTest = () => setTestResult(null)

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId)
    const preset = smtpPresets.find((p) => p.id === presetId)
    if (preset && preset.id !== 'custom') {
      setFormData((prev) => {
        const prevPresetNames = smtpPresets.map((p) => p.name)
        const shouldUpdateName = !prev.name || prevPresetNames.includes(prev.name)
        return { ...prev, host: preset.host, port: String(preset.port), secure: preset.secure, name: shouldUpdateName ? preset.name : prev.name }
      })
    }
    setErrors({})
    setApiError('')
    resetTest()
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!formData.name.trim()) newErrors.name = t('channels.errNameRequired')
    if (formData.type === 'email') {
      if (!formData.host.trim()) newErrors.host = t('channels.errHostRequired')
      if (!formData.port.trim()) newErrors.port = t('channels.errPortRequired')
      if (!formData.username.trim()) newErrors.username = t('channels.errUsernameRequired')
      if (!editingId && !formData.password.trim()) newErrors.password = t('channels.errPasswordRequired')
      if (!formData.fromAddress.trim()) {
        newErrors.fromAddress = t('channels.errFromRequired')
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.fromAddress)) {
        newErrors.fromAddress = t('channels.errFromInvalid')
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const buildConfig = (): Record<string, unknown> => {
    const config: Record<string, unknown> = {}
    if (formData.type === 'email') {
      Object.assign(config, {
        host: formData.host,
        port: parseInt(formData.port),
        secure: formData.secure,
        username: formData.username,
        fromAddress: formData.fromAddress,
        fromName: formData.fromName,
      })
      if (formData.password) config.password = formData.password
    }
    return config
  }

  const handleTestConfig = async () => {
    if (!validate()) return
    setTestingConfig(true)
    setApiError('')
    resetTest()
    const config = buildConfig()
    const result = await channelsApi.testConfig(formData.type, config)
    setTestingConfig(false)
    if (result.success && result.data) {
      setTestResult({ connected: result.data.success })
    } else {
      setTestResult({ connected: false, error: result.error || t('channels.testFailed') })
    }
  }

  const handleCreate = async () => {
    if (!testResult?.connected) { setApiError(t('channels.testRequired')); return }
    setApiError('')
    setCreating(true)
    const config = buildConfig()
    const result = await channelsApi.create({
      type: formData.type,
      name: formData.name,
      config,
      enabled: true,
      isDefault: channels.filter((c) => c.type === formData.type).length === 0,
    })
    setCreating(false)
    if (result.success) { closeForm(); loadChannels() }
    else setApiError(result.error || t('channels.createFailed'))
  }

  const handleUpdate = async () => {
    if (!editingId) return
    if (!testResult?.connected) { setApiError(t('channels.testRequired')); return }
    setApiError('')
    setSaving(true)
    const config = buildConfig()
    const result = await channelsApi.update(editingId, { name: formData.name, config })
    setSaving(false)
    if (result.success) { closeForm(); loadChannels() }
    else setApiError(result.error || t('channels.updateFailed'))
  }

  const handleEdit = (ch: Channel) => {
    setEditingId(ch.id)
    setFormData({
      type: ch.type,
      name: ch.name,
      host: String(ch.config.host || ''),
      port: String(ch.config.port || '587'),
      secure: ch.config.secure !== false,
      username: String(ch.config.username || ''),
      password: '',
      fromAddress: String(ch.config.fromAddress || ''),
      fromName: String(ch.config.fromName || ''),
    })
    const matched = smtpPresets.find((p) => p.host === ch.config.host)
    setSelectedPreset(matched?.id || 'custom')
    setErrors({})
    setApiError('')
    setTestResult(null)
    setOpen(true)
  }

  const openCreateForm = (type: string) => {
    setEditingId(null)
    setSelectedPreset('custom')
    setFormData({ ...emptyFormData, type })
    setErrors({})
    setApiError('')
    setTestResult(null)
    setOpen(true)
  }

  const closeForm = () => {
    setOpen(false)
    setEditingId(null)
    setSelectedPreset('custom')
    setFormData(emptyFormData)
    setErrors({})
    setApiError('')
    setTestResult(null)
  }

  const handleTest = async (id: string) => {
    setTesting(id)
    const result = await channelsApi.test(id)
    setTesting(null)
    if (result.success && result.data) {
      alert(result.data.success ? t('channels.testPassed') : t('channels.testFailed'))
    } else {
      alert(result.error || t('channels.testFailed'))
    }
  }

  const handleDeleteChannel = async (id: string) => {
    if (confirm(t('channels.deleteConfirm'))) { await channelsApi.delete(id); loadChannels() }
  }

  const handleDeleteClient = async (uuid: string) => {
    if (confirm(t('push.deleteConfirm'))) { await pushApi.deleteClient(uuid); loadClients() }
  }

  const canCreateOrSave = testResult?.connected === true

  /* ── Render ── */

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">{t('channels.title')}</h2>

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) closeForm() }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? t('channels.editChannel') : t('channels.new')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {apiError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                ⚠️ {apiError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('channels.type')}</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={formData.type}
                  onChange={(e) => { setFormData({ ...formData, type: e.target.value }); resetTest() }}
                  disabled={!!editingId}
                >
                  <option value="email">{t('channels.typeEmail')}</option>
                  <option value="sms">{t('channels.typeSms')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('channels.name')}</Label>
                <Input
                  maxLength={32}
                  className={errors.name ? 'border-destructive' : ''}
                  value={formData.name}
                  onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setErrors((p) => ({ ...p, name: '' })); resetTest() }}
                  placeholder={t('channels.namePlaceholder')}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>
            </div>
            {formData.type === 'email' && (
              <>
                <div className="space-y-2">
                  <Label>{t('channels.preset')}</Label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {smtpPresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handlePresetChange(preset.id)}
                        className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all text-left ${
                          selectedPreset === preset.id
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-input bg-background hover:border-primary/50 hover:bg-accent'
                        }`}
                      >
                        <div className="font-semibold text-xs">{preset.name}</div>
                        {preset.id !== 'custom' && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{preset.host}</div>
                        )}
                      </button>
                    ))}
                  </div>
                  {selectedPreset !== 'custom' && (
                    <p className="text-xs text-muted-foreground">
                      💡 {smtpPresets.find((p) => p.id === selectedPreset)?.description}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t('channels.host')}</Label>
                    <Input className={errors.host ? 'border-destructive' : ''} value={formData.host}
                      onChange={(e) => { setFormData({ ...formData, host: e.target.value }); setErrors((p) => ({ ...p, host: '' })); resetTest() }}
                      placeholder={t('channels.hostPlaceholder')} />
                    {errors.host && <p className="text-xs text-destructive">{errors.host}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>{t('channels.port')}</Label>
                    <Input className={errors.port ? 'border-destructive' : ''} value={formData.port}
                      onChange={(e) => { setFormData({ ...formData, port: e.target.value }); setErrors((p) => ({ ...p, port: '' })); resetTest() }}
                      placeholder={t('channels.portPlaceholder')} />
                    {errors.port && <p className="text-xs text-destructive">{errors.port}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>{t('channels.fromAddress')}</Label>
                    <Input className={errors.fromAddress ? 'border-destructive' : ''} value={formData.fromAddress}
                      onChange={(e) => { setFormData({ ...formData, fromAddress: e.target.value }); setErrors((p) => ({ ...p, fromAddress: '' })); resetTest() }}
                      placeholder={t('channels.fromPlaceholder')} />
                    {errors.fromAddress && <p className="text-xs text-destructive">{errors.fromAddress}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t('channels.username')}</Label>
                    <Input className={errors.username ? 'border-destructive' : ''} value={formData.username}
                      onChange={(e) => { setFormData({ ...formData, username: e.target.value }); setErrors((p) => ({ ...p, username: '' })); resetTest() }}
                      placeholder={
                        selectedPreset === 'sendgrid' ? 'apikey' :
                        selectedPreset === 'gmail' ? 'your@gmail.com' :
                        selectedPreset === 'outlook' ? 'your@outlook.com' : ''
                      } />
                    {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>
                      {t('channels.password')}
                      {editingId && <span className="text-xs text-muted-foreground ml-1">({t('channels.passwordOptional')})</span>}
                    </Label>
                    <Input className={errors.password ? 'border-destructive' : ''} type="password" value={formData.password}
                      onChange={(e) => { setFormData({ ...formData, password: e.target.value }); setErrors((p) => ({ ...p, password: '' })); resetTest() }}
                      placeholder={
                        editingId ? t('channels.passwordKeep') :
                        selectedPreset === 'gmail' ? t('channels.appPassword') :
                        selectedPreset === 'qq' || selectedPreset === '163' || selectedPreset === '126' ? t('channels.authCode') : ''
                      } />
                    {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>{t('channels.secure')}</Label>
                    <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={formData.secure ? 'true' : 'false'}
                      onChange={(e) => { setFormData({ ...formData, secure: e.target.value === 'true' }); resetTest() }}>
                      <option value="true">SSL (465)</option>
                      <option value="false">STARTTLS (587)</option>
                    </select>
                  </div>
                </div>
              </>
            )}
            {testResult && (
              <div className={`rounded-md border px-4 py-3 text-sm flex items-center gap-2 ${
                testResult.connected
                  ? 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'border-destructive/50 bg-destructive/10 text-destructive'
              }`}>
                {testResult.connected
                  ? <><CheckCircle className="h-4 w-4" /> {t('channels.testPassed')}</>
                  : <><XCircle className="h-4 w-4" /> {testResult.error || t('channels.testFailed')}</>}
              </div>
            )}
          </div>
          <DialogFooter>
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={handleTestConfig} disabled={testingConfig}>
                {testingConfig
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />{t('channels.testingConnection')}</>
                  : <><TestTube className="h-4 w-4 mr-1" />{t('channels.testConnection')}</>}
              </Button>
              {canCreateOrSave && (
                editingId
                  ? <Button onClick={handleUpdate} disabled={saving}>{saving ? t('channels.saving') : t('channels.save')}</Button>
                  : <Button onClick={handleCreate} disabled={creating}>{creating ? t('channels.creating') : t('channels.create')}</Button>
              )}
              <Button variant="ghost" onClick={closeForm} className="ml-auto">{t('channels.cancel')}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Email Channels ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">{t('channels.sectionEmail')}</CardTitle>
            <Badge variant="secondary">{emailChannels.length}</Badge>
          </div>
          <Button size="sm" onClick={() => openCreateForm('email')}>
            <Plus className="h-4 w-4 mr-1" />{t('channels.add')}
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('channels.name')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('channels.host')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('channels.fromAddress')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('channels.username')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('channels.status')}</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {emailChannels.map((ch) => (
                <tr key={ch.id} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-2 text-sm font-medium flex items-center gap-1.5">
                    {ch.isDefault && <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />}
                    {ch.name}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono">{String(ch.config.host || '—')}:{String(ch.config.port || '—')}</td>
                  <td className="px-4 py-2 text-xs">{String(ch.config.fromAddress || '—')}</td>
                  <td className="px-4 py-2 text-xs">{String(ch.config.username || '—')}</td>
                  <td className="px-4 py-2">
                    <Badge variant={ch.enabled ? 'success' : 'secondary'} className="text-xs">
                      {ch.enabled ? t('channels.active') : t('channels.disabled')}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                        onClick={() => handleTest(ch.id)} disabled={testing === ch.id} title={t('channels.test')}>
                        {testing === ch.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                        onClick={() => handleEdit(ch)} title={t('channels.edit')}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteChannel(ch.id)} title={t('channels.deleteConfirm')}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {emailChannels.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-sm">{t('channels.emptyEmail')}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ── SMS Channels ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">{t('channels.sectionSms')}</CardTitle>
            <Badge variant="secondary">{smsChannels.length}</Badge>
          </div>
          <Button size="sm" onClick={() => openCreateForm('sms')}>
            <Plus className="h-4 w-4 mr-1" />{t('channels.add')}
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('channels.name')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('channels.type')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('channels.status')}</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {smsChannels.map((ch) => (
                <tr key={ch.id} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-2 text-sm font-medium flex items-center gap-1.5">
                    {ch.isDefault && <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />}
                    {ch.name}
                  </td>
                  <td className="px-4 py-2 text-xs">{t('channels.typeSms')}</td>
                  <td className="px-4 py-2">
                    <Badge variant={ch.enabled ? 'success' : 'secondary'} className="text-xs">
                      {ch.enabled ? t('channels.active') : t('channels.disabled')}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                        onClick={() => handleTest(ch.id)} disabled={testing === ch.id} title={t('channels.test')}>
                        {testing === ch.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                        onClick={() => handleEdit(ch)} title={t('channels.edit')}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteChannel(ch.id)} title={t('channels.deleteConfirm')}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {smsChannels.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-muted-foreground text-sm">{t('channels.emptySms')}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ── Push Clients ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">{t('channels.sectionPush')}</CardTitle>
            <Badge variant="secondary">{clients.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleShowQr} title={t('channels.qrTitle')}>
              <QrCode className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={loadClients}>
              <RefreshCw className="h-4 w-4 mr-1" />{t('messages.refresh')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('push.colUuid')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('push.colName')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('push.colOs')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('push.colArch')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('push.colDesktop')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('push.colVersion')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('push.colStatus')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('push.colMode')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('push.colLastSeen')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('push.colRegistered')}</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const online = isOnline(client.lastSeenAt)
                const Icon = osIcons[client.os] || Monitor
                return (
                  <tr key={client.uuid} className="border-b hover:bg-muted/50">
                    <td className="px-4 py-1.5 text-xs font-mono max-w-[180px] truncate">{client.uuid}</td>
                    <td className="px-4 py-1.5 text-xs">{client.name || '—'}</td>
                    <td className="px-4 py-1.5 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {osLabels[client.os] || client.os}
                      </div>
                    </td>
                    <td className="px-4 py-1.5 text-xs text-muted-foreground">{client.arch || '—'}</td>
                    <td className="px-4 py-1.5 text-xs text-muted-foreground">{client.desktop || '—'}</td>
                    <td className="px-4 py-1.5 text-xs text-muted-foreground">{client.appVersion || '—'}</td>
                    <td className="px-4 py-1.5">
                      <Badge variant={online ? 'success' : 'secondary'} className="text-xs">
                        {online ? t('push.online') : t('push.offline')}
                      </Badge>
                    </td>
                    <td className="px-4 py-1.5 text-xs text-muted-foreground">
                      {online ? (client.connectionMode?.toUpperCase() || '—') : '—'}
                    </td>
                    <td className="px-4 py-1.5 text-xs text-muted-foreground">
                      {client.lastSeenAt ? formatDate(client.lastSeenAt) : '—'}
                    </td>
                    <td className="px-4 py-1.5 text-xs text-muted-foreground">{formatDate(client.registeredAt)}</td>
                    <td className="px-4 py-1.5 text-right">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteClient(client.uuid)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {clients.length === 0 && (
                <tr><td colSpan={11} className="p-6 text-center text-muted-foreground text-sm">{t('push.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ── QR Code Modal ── */}
      <Dialog open={qrOpen} onOpenChange={(v) => { if (!v) { setQrOpen(false); setQrRegisteredClient(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('channels.qrTitle')}</DialogTitle>
          </DialogHeader>
          {qrRegisteredClient ? (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="h-6 w-6" />
                <span className="text-lg font-semibold">{t('channels.qrRegistered')}</span>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                {t('channels.qrRegisteredHint')}
              </p>
              <div className="w-full rounded-lg border bg-muted/50 p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">UUID</span><span className="font-mono text-xs">{qrRegisteredClient.uuid.slice(0, 12)}…</span></div>
                {qrRegisteredClient.name && <div className="flex justify-between"><span className="text-muted-foreground">{t('push.colName')}</span><span>{qrRegisteredClient.name}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">{t('push.colOs')}</span><span>{osLabels[qrRegisteredClient.os] || qrRegisteredClient.os}</span></div>
                {qrRegisteredClient.arch && <div className="flex justify-between"><span className="text-muted-foreground">{t('push.colArch')}</span><span>{qrRegisteredClient.arch}</span></div>}
                {qrRegisteredClient.appVersion && <div className="flex justify-between"><span className="text-muted-foreground">{t('push.colVersion')}</span><span>{qrRegisteredClient.appVersion}</span></div>}
              </div>
              <Button className="w-full" onClick={() => { setQrOpen(false); setQrRegisteredClient(null) }}>
                {t('channels.cancel')}
              </Button>
            </div>
          ) : qrData && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-muted-foreground text-center">
                {t('channels.qrScanHint')}
              </p>
              <div className="w-full space-y-3">
                <div className="space-y-1">
                  <Label>{t('channels.qrServerUrl')}</Label>
                  <Input
                    value={qrData.serverUrl}
                    onChange={(e) => setQrData({ ...qrData, serverUrl: e.target.value })}
                    className="font-mono text-xs"
                    placeholder="http://192.168.x.x:9527"
                  />
                  {qrData.editable && (
                    <p className="text-xs text-amber-600">
                      ⚠️ {t('channels.qrLocalhostHint')}
                    </p>
                  )}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">JWT</span>
                  <span className="font-mono text-xs">{qrData.jwt.slice(0, 20)}…</span>
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg">
                <QRCodeSVG
                  value={JSON.stringify({ serverUrl: qrData.serverUrl, jwt: qrData.jwt })}
                  size={200}
                  level="M"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('channels.qrWaitingScan')}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
