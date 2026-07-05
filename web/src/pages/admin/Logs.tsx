import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/i18n'
import { appLogsApi } from '@/lib/api'
import { FileText, Download, Radio, ChevronLeft, ChevronRight, Settings, Play, Square } from 'lucide-react'

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
type LogLevel = (typeof LOG_LEVELS)[number]

export default function AdminLogs() {
  const { t } = useTranslation()

  // ── Settings state ──
  const [logLevel, setLogLevel] = useState<LogLevel>('info')
  const [retentionDays, setRetentionDays] = useState(0)
  const [savingSettings, setSavingSettings] = useState(false)
  const [savedSettings, setSavedSettings] = useState(false)

  // ── Log list state ──
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filterLevel, setFilterLevel] = useState<string>('')
  const pageSize = 50

  // ── Live stream state ──
  const [streaming, setStreaming] = useState(false)
  const [liveLogs, setLiveLogs] = useState<any[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const liveEndRef = useRef<HTMLDivElement>(null)
  const maxLiveLogs = 500

  // ── Load settings ──
  useEffect(() => {
    appLogsApi.getSettings().then(res => {
      if (res.success && res.data) {
        setLogLevel(res.data.logLevel as LogLevel)
        setRetentionDays(res.data.logRetentionDays)
      }
    })
  }, [])

  // ── Load log list ──
  const loadLogs = useCallback(async () => {
    const res = await appLogsApi.list(page, pageSize, filterLevel || undefined)
    if (res.success && res.data) {
      setLogs(res.data.items)
      setTotal(res.data.total)
    }
  }, [page, filterLevel])

  useEffect(() => { loadLogs() }, [loadLogs])

  // ── Save settings ──
  const handleSaveSettings = async () => {
    setSavingSettings(true)
    setSavedSettings(false)
    const res = await appLogsApi.updateSettings({ logLevel, logRetentionDays: retentionDays })
    setSavingSettings(false)
    if (res.success) setSavedSettings(true)
  }

  // ── Export ──
  const handleExport = () => {
    const url = appLogsApi.exportUrl(filterLevel || undefined)
    const token = localStorage.getItem('notifyhub_token')
    // Use fetch with auth header since direct link won't have the token
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(res => res.blob())
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `notifyhub-logs-${new Date().toISOString().slice(0, 10)}.txt`
        a.click()
        URL.revokeObjectURL(a.href)
      })
  }

  // ── SSE stream ──
  const startStream = useCallback(() => {
    if (abortRef.current) return

    const token = localStorage.getItem('notifyhub_token')
    const controller = new AbortController()
    abortRef.current = controller

    fetch(appLogsApi.streamUrl(), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok || !response.body) {
        setStreaming(false)
        abortRef.current = null
        return
      }

      setStreaming(true)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const entry = JSON.parse(line.slice(6))
              setLiveLogs(prev => {
                const next = [...prev, entry]
                return next.length > maxLiveLogs ? next.slice(-maxLiveLogs) : next
              })
            } catch { /* ignore parse errors */ }
          }
        }
      }
    }).catch(() => {
      // aborted or network error
    }).finally(() => {
      setStreaming(false)
      abortRef.current = null
    })
  }, [])

  const stopStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setStreaming(false)
  }, [])

  // Auto-scroll live logs
  useEffect(() => {
    if (streaming) {
      liveEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [liveLogs.length, streaming])

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopStream() }
  }, [stopStream])

  const totalPages = Math.ceil(total / pageSize)

  const levelBadge = (level: string) => {
    const styles: Record<string, string> = {
      debug: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      warn: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    }
    return (
      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${styles[level] || ''}`}>
        {level}
      </span>
    )
  }

  const retentionOptions = [
    { value: 0, label: t('admin.logs.retentionForever') },
    { value: 3, label: t('admin.logs.retention3d') },
    { value: 7, label: t('admin.logs.retention1w') },
    { value: 30, label: t('admin.logs.retention1m') },
    { value: 365, label: t('admin.logs.retention1y') },
  ]

  return (
    <div className="space-y-6">
      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t('admin.logs.settings')}
          </CardTitle>
          <CardDescription>{t('admin.logs.settingsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-6">
            <div className="space-y-2">
              <Label>{t('admin.logs.logLevel')}</Label>
              <Select value={logLevel} onValueChange={(v) => { setLogLevel(v as LogLevel); setSavedSettings(false) }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOG_LEVELS.map(l => (
                    <SelectItem key={l} value={l}>{t(`admin.logs.level.${l}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('admin.logs.retention')}</Label>
              <Select value={String(retentionDays)} onValueChange={(v) => { setRetentionDays(Number(v)); setSavedSettings(false) }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {retentionOptions.map(opt => (
                    <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? t('common.loading') : t('common.save')}
            </Button>
            {savedSettings && (
              <span className="text-sm text-green-600">{t('common.success')}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Live Stream */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-5 w-5" />
                {t('admin.logs.liveStream')}
              </CardTitle>
              <CardDescription>{t('admin.logs.liveStreamDesc')}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {streaming && (
                <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-1.5" />
                  {t('admin.logs.connected')}
                </Badge>
              )}
              <Button
                variant={streaming ? 'destructive' : 'default'}
                size="sm"
                onClick={streaming ? stopStream : startStream}
              >
                {streaming ? (
                  <><Square className="h-4 w-4 mr-1.5" />{t('admin.logs.stop')}</>
                ) : (
                  <><Play className="h-4 w-4 mr-1.5" />{t('admin.logs.start')}</>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-black/95 text-green-400 font-mono text-xs rounded-lg p-4 h-[300px] overflow-y-auto">
            {liveLogs.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                {streaming ? t('admin.logs.waitingForLogs') : t('admin.logs.clickToStart')}
              </div>
            ) : (
              liveLogs.map((entry, i) => (
                <div key={i} className="py-0.5 flex gap-2 leading-relaxed">
                  <span className="text-gray-500 shrink-0">
                    {new Date(entry.createdAt).toLocaleTimeString()}
                  </span>
                  <span className={`shrink-0 font-bold uppercase w-12 ${
                    entry.level === 'error' ? 'text-red-400' :
                    entry.level === 'warn' ? 'text-yellow-400' :
                    entry.level === 'debug' ? 'text-gray-500' : 'text-green-400'
                  }`}>
                    {entry.level}
                  </span>
                  {entry.source && (
                    <span className="text-cyan-400 shrink-0">[{entry.source}]</span>
                  )}
                  <span className="text-gray-200 break-all whitespace-pre-wrap">{entry.message}</span>
                </div>
              ))
            )}
            <div ref={liveEndRef} />
          </div>
        </CardContent>
      </Card>

      {/* Log History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t('admin.logs.history')}
              </CardTitle>
              <CardDescription>{t('admin.logs.historyDesc')}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filterLevel} onValueChange={(v) => { setFilterLevel(v === '__all__' ? '' : v); setPage(1) }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={t('admin.logs.allLevels')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('admin.logs.allLevels')}</SelectItem>
                  {LOG_LEVELS.map(l => (
                    <SelectItem key={l} value={l}>{l.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadLogs}>
                {t('messages.refresh')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-1.5" />
                {t('admin.logs.export')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t('admin.logs.empty')}</div>
          ) : (
            <>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium w-[160px]">{t('admin.logs.colTime')}</th>
                        <th className="text-left px-3 py-2 font-medium w-[70px]">{t('admin.logs.colLevel')}</th>
                        <th className="text-left px-3 py-2 font-medium w-[100px]">{t('admin.logs.colSource')}</th>
                        <th className="text-left px-3 py-2 font-medium">{t('admin.logs.colMessage')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-1.5 text-muted-foreground text-xs whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="px-3 py-1.5">{levelBadge(log.level)}</td>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground">
                            {log.source || '-'}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-xs max-w-[500px] truncate" title={log.message}>
                            {log.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">
                    {t('messages.pageInfo', { page, total: totalPages })}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
