import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { pushApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { POLL_INTERVAL_MS } from '@/lib/constants'
import { Trash2, Monitor, RefreshCw } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { type PushClient, osLabels, osIcons, isOnline } from '@/lib/push-clients'

export default function PushClients() {
  const { t } = useTranslation()
  const { confirm, ConfirmDialog } = useConfirm()
  const [clients, setClients] = useState<PushClient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    setError('')
    pushApi.listClients().then((res) => {
      if (res.success) setClients(res.data || [])
      else setError(res.error || 'Failed to load push clients')
    }).catch((err) => {
      setError(err.message || 'Network error')
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Auto-refresh every 30s
  useEffect(() => {
    const timer = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  const handleDelete = async (uuid: string) => {
    if (await confirm({ description: t('push.deleteConfirm'), variant: 'destructive', confirmLabel: t('push.delete') })) {
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

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[900px]">
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
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="border-b">
                    <td className="px-4 py-2"><Skeleton className="h-4 w-64" /></td>
                    <td className="px-4 py-2"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-2"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-4 py-2"><Skeleton className="h-4 w-12" /></td>
                    <td className="px-4 py-2"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-4 py-2"><Skeleton className="h-4 w-14" /></td>
                    <td className="px-4 py-2"><Skeleton className="h-5 w-14" /></td>
                    <td className="px-4 py-2"><Skeleton className="h-4 w-10" /></td>
                    <td className="px-4 py-2"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-2"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-2"><Skeleton className="h-6 w-8 ml-auto" /></td>
                  </tr>
                ))
              ) : (
                <>
                  {clients.map((client) => {
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
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(client.uuid)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                  {clients.length === 0 && (
                    <tr>
                      <td colSpan={11}>
                        <EmptyState title={t('push.empty')} />
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {ConfirmDialog}
    </div>
  )
}
