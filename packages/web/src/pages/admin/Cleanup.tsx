import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import { cleanupLogsApi } from '@/lib/api'
import { Trash, ChevronLeft, ChevronRight } from 'lucide-react'

interface CleanupLog {
  id: number
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  status: 'running' | 'success' | 'error'
  expiredAttachments: number
  expiredMessages: number
  trimmedMessages: number
  error: string | null
}

export default function AdminCleanup() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<CleanupLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 15

  const load = async () => {
    const res = await cleanupLogsApi.list(page, pageSize)
    if (res.success && res.data) {
      setLogs(res.data.items)
      setTotal(res.data.total)
    }
  }

  useEffect(() => { load() }, [page])

  const totalPages = Math.ceil(total / pageSize)

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      running: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    }
    return (
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles[status] || ''}`}>
        {t(`settings.cleanup.status${status.charAt(0).toUpperCase() + status.slice(1)}`) || status}
      </span>
    )
  }

  return (
    <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash className="h-5 w-5" />
            {t('settings.cleanup.title')}
          </CardTitle>
          <CardDescription>{t('settings.cleanup.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('settings.cleanup.empty')}</p>
          ) : (
            <>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">{t('settings.cleanup.colTime')}</th>
                      <th className="text-left px-4 py-2 font-medium">{t('settings.cleanup.colStatus')}</th>
                      <th className="text-right px-4 py-2 font-medium">{t('settings.cleanup.colAttachments')}</th>
                      <th className="text-right px-4 py-2 font-medium">{t('settings.cleanup.colExpiredMsgs')}</th>
                      <th className="text-right px-4 py-2 font-medium">{t('settings.cleanup.colTrimmedMsgs')}</th>
                      <th className="text-right px-4 py-2 font-medium">{t('settings.cleanup.colDuration')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-2 text-muted-foreground">
                          {new Date(log.startedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2">{statusBadge(log.status)}</td>
                        <td className="px-4 py-2 text-right">{log.expiredAttachments || '-'}</td>
                        <td className="px-4 py-2 text-right">{log.expiredMessages || '-'}</td>
                        <td className="px-4 py-2 text-right">{log.trimmedMessages || '-'}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {log.durationMs != null ? `${log.durationMs}ms` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
  )
}
