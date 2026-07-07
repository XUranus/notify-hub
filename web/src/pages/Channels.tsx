import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { channelsApi, pushApi, tokensApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { formatDate } from '@/lib/utils'
import { type PushClient, osLabels, osIcons, isOnline } from '@/lib/push-clients'
import { ChannelFormDialog } from '@/components/channels/ChannelFormDialog'
import { QrPairingDialog } from '@/components/channels/QrPairingDialog'
import {
  Plus, Trash2, Radio, Mail, Smartphone, Pencil,
  TestTube, Loader2, Star, Monitor, RefreshCw, QrCode, AlertTriangle,
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

/* ── Main component ── */

export default function Channels() {
  const { t } = useTranslation()
  const { confirm, alert, ConfirmDialog } = useConfirm()

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
  const [clientPage, setClientPage] = useState(1)
  const CLIENT_PAGE_SIZE = 5
  const totalClientPages = Math.max(1, Math.ceil(clients.length / CLIENT_PAGE_SIZE))
  const paginatedClients = clients.slice((clientPage - 1) * CLIENT_PAGE_SIZE, clientPage * CLIENT_PAGE_SIZE)

  // QR code modal state
  const [qrOpen, setQrOpen] = useState(false)
  const [qrData, setQrData] = useState<{ serverUrl: string; jwt: string; editable?: boolean } | null>(null)

  /* ── Data loading ── */

  const [loadError, setLoadError] = useState('')

  const loadChannels = useCallback(() => channelsApi.list().then((res) => {
    if (res.success) setChannels(res.data || [])
    else setLoadError(res.error || 'Failed to load channels')
  }).catch((err) => {
    setLoadError(err.message || 'Network error')
  }), [])

  const loadClients = useCallback(() => pushApi.listClients().then((res) => {
    if (res.success) { setClients(res.data || []); setClientPage(1) }
  }).catch(() => {}), [])

  useEffect(() => {
    loadChannels()
    loadClients()
    const timer = setInterval(() => {
      loadChannels()
      loadClients()
    }, 15000)
    return () => clearInterval(timer)
  }, [loadChannels, loadClients])

  const handleQrRegistered = useCallback((_client: PushClient, allClients: PushClient[]) => {
    setClients(allClients)
  }, [])

  const handleShowQr = async () => {
    const res = await tokensApi.generateClientToken()
    if (!res.success || !res.data?.token) {
      await alert({ description: t('channels.qrNoToken') })
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
      await alert({ description: result.data.success ? t('channels.testPassed') : t('channels.testFailed') })
    } else {
      await alert({ description: result.error || t('channels.testFailed') })
    }
  }

  const handleDeleteChannel = async (id: string) => {
    if (await confirm({ description: t('channels.deleteConfirm'), variant: 'destructive', confirmLabel: t('channels.delete') })) { await channelsApi.delete(id); loadChannels() }
  }

  const handleDeleteClient = async (uuid: string) => {
    if (await confirm({ description: t('push.deleteConfirm'), variant: 'destructive', confirmLabel: t('push.delete') })) { await pushApi.deleteClient(uuid); loadClients() }
  }

  const canCreateOrSave = testResult?.connected === true

  /* ── Render ── */

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">{t('channels.title')}</h2>

      {/* ── Create / Edit Dialog ── */}
      <ChannelFormDialog
        open={open}
        onOpenChange={(v) => { if (!v) closeForm() }}
        editingId={editingId}
        formData={formData}
        setFormData={setFormData}
        errors={errors}
        setErrors={setErrors}
        apiError={apiError}
        setApiError={setApiError}
        selectedPreset={selectedPreset}
        setSelectedPreset={setSelectedPreset}
        testResult={testResult}
        setTestResult={setTestResult}
        testingConfig={testingConfig}
        creating={creating}
        saving={saving}
        smtpPresets={smtpPresets}
        canCreateOrSave={canCreateOrSave}
        onTestConfig={handleTestConfig}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onClose={closeForm}
        onPresetChange={handlePresetChange}
        onResetTest={resetTest}
      />

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
                        onClick={() => handleTest(ch.id)} disabled={testing === ch.id} title={t('channels.test')} aria-label={t('channels.test')}>
                        {testing === ch.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                        onClick={() => handleEdit(ch)} title={t('channels.edit')} aria-label={t('channels.edit')}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteChannel(ch.id)} title={t('channels.deleteConfirm')} aria-label={t('channels.delete')}>
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
                        onClick={() => handleTest(ch.id)} disabled={testing === ch.id} title={t('channels.test')} aria-label={t('channels.test')}>
                        {testing === ch.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                        onClick={() => handleEdit(ch)} title={t('channels.edit')} aria-label={t('channels.edit')}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteChannel(ch.id)} title={t('channels.deleteConfirm')} aria-label={t('channels.delete')}>
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
            <Button size="sm" variant="outline" onClick={handleShowQr} title={t('channels.qrTitle')} aria-label={t('channels.qrTitle')}>
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
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap min-w-[280px]">{t('push.colUuid')}</th>
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
              {paginatedClients.map((client) => {
                const online = isOnline(client.lastSeenAt)
                const Icon = osIcons[client.os] || Monitor
                return (
                  <tr key={client.uuid} className="border-b hover:bg-muted/50">
                    <td className="px-4 py-1.5 text-xs whitespace-nowrap"><Badge variant="secondary" className="text-[10px] font-mono">{client.uuid}</Badge></td>
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
                        onClick={() => handleDeleteClient(client.uuid)} aria-label="Delete">
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
          {clients.length > CLIENT_PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-2 border-t">
              <span className="text-xs text-muted-foreground">
                {clientPage} / {totalClientPages}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={clientPage <= 1} onClick={() => setClientPage(clientPage - 1)} className="h-7 text-xs">
                  {t('messages.prev')}
                </Button>
                <Button variant="outline" size="sm" disabled={clientPage >= totalClientPages} onClick={() => setClientPage(clientPage + 1)} className="h-7 text-xs">
                  {t('messages.next')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── QR Code Modal ── */}
      <QrPairingDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        qrData={qrData}
        onRegistered={handleQrRegistered}
      />

      {/* Error banner */}
      {loadError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {ConfirmDialog}
    </div>
  )
}
