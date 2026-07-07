import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { pushApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Trash2, Monitor, Smartphone, RefreshCw } from 'lucide-react'
import { formatDate, toDate } from '@/lib/utils'

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
  const diff = Date.now() - toDate(lastSeenAt).getTime()
  return diff < 5 * 60 * 1000 // 5 minutes
}

export default function PushClients() {
  const { t } = useTranslation()
  const [clients, setClients] = useState<PushClient[]>([])

  const load = () => pushApi.listClients().then((res) => {
    if (res.success) setClients(res.data || [])
  })

  useEffect(() => { load() }, [])

  // Auto-refresh every 30s
  useEffect(() => {
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [])

  const handleDelete = async (uuid: string) => {
    if (confirm(t('push.deleteConfirm'))) {
      await pushApi.deleteClient(uuid)
      load()
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold tracking-tight">{t('push.title')}</h2>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('messages.refresh')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[900px]">
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
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(client.uuid)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <EmptyState title={t('push.empty')} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
