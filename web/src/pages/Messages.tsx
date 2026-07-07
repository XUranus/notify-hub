import { useEffect, useState, useMemo, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { messagesApi, topicsApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { RefreshCw, RotateCw, Trash2, Download, Paperclip, ExternalLink, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { formatDate, toDate } from '@/lib/utils'

interface Message {
  id: string
  channelType: string
  channelId: string | null
  channelName: string | null
  toAddress: string
  subject: string | null
  body: string | null
  templateId: string | null
  templateVars: string | null
  status: string
  retryCount: number
  maxRetries: number
  errorMessage: string | null
  ipAddress: string | null
  ipLocation: string | null
  app: string | null
  sentAt: string | null
  createdAt: string
  // Extended fields
  tags: string | null
  priority: number
  url: string | null
  attachment: string | null
  format: string
  topicId: string | null
}

interface MessageAttachment {
  name: string
  url?: string
  data?: string
}

function parseTags(tags: string | null): string[] {
  if (!tags) return []
  try { return JSON.parse(tags) } catch { return [] }
}

function parseAttachment(attachment: string | null): MessageAttachment | null {
  if (!attachment) return null
  try { return JSON.parse(attachment) } catch { return null }
}

function priorityColor(p: number): string {
  if (p >= 67) return 'text-red-600 bg-red-50'
  if (p >= 34) return 'text-amber-600 bg-amber-50'
  if (p >= 1) return 'text-blue-600 bg-blue-50'
  return ''
}

const statusVariant: Record<string, 'default' | 'success' | 'destructive' | 'warning' | 'secondary'> = {
  queued: 'warning',
  sending: 'default',
  sent: 'success',
  delivered: 'success',
  failed: 'destructive',
  dead: 'destructive',
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const EXPORT_FIELDS: (keyof Message)[] = ['id', 'channelType', 'channelName', 'toAddress', 'subject', 'body', 'status', 'retryCount', 'errorMessage', 'ipAddress', 'ipLocation', 'app', 'createdAt', 'sentAt', 'tags', 'priority', 'url', 'attachment', 'format', 'topicId']

function getField(m: Message, key: keyof Message): unknown {
  return m[key]
}

function toCsv(messages: Message[]): string {
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = messages.map((m) => EXPORT_FIELDS.map((h) => escape(getField(m, h))).join(','))
  return [EXPORT_FIELDS.join(','), ...rows].join('\n')
}

function toJson(messages: Message[]): string {
  return JSON.stringify(messages, null, 2)
}

function toXml(messages: Message[]): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const items = messages.map((m) => {
    const inner = EXPORT_FIELDS.map((f) => {
      const v = getField(m, f)
      return `    <${f}>${v != null ? escape(String(v)) : ''}</${f}>`
    }).join('\n')
    return `  <message>\n${inner}\n  </message>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<messages>\n${items.join('\n')}\n</messages>`
}

type ColumnKey = 'id' | 'channel' | 'to' | 'subject' | 'summary' | 'topic' | 'tags' | 'priority' | 'format' | 'status' | 'retries' | 'duration' | 'created' | 'actions'

const ALL_COLUMNS: ColumnKey[] = ['id', 'channel', 'to', 'subject', 'summary', 'topic', 'tags', 'priority', 'format', 'status', 'retries', 'duration', 'created', 'actions']

function MetaItem({ label, value, mono, children, className }: { label: string; value?: string | null; mono?: boolean; children?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <span className="text-muted-foreground">{label}</span>
      <p className={`mt-0.5 truncate ${mono ? 'font-mono' : ''}`}>
        {children ?? <span>{value || '—'}</span>}
      </p>
    </div>
  )
}

const COLUMN_I18N: Record<ColumnKey, string> = {
  id: 'messages.colId',
  channel: 'messages.colChannel',
  to: 'messages.colTo',
  subject: 'messages.colSubject',
  summary: 'messages.colSummary',
  topic: 'messages.colTopic',
  tags: 'messages.colTags',
  priority: 'messages.colPriority',
  format: 'messages.colFormat',
  status: 'messages.colStatus',
  retries: 'messages.colRetries',
  duration: 'messages.colDuration',
  created: 'messages.colCreated',
  actions: 'messages.colActions',
}

export default function Messages() {
  const { t } = useTranslation()
  const { confirm, ConfirmDialog } = useConfirm()
  const [messages, setMessages] = useState<Message[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null)
  const [topicName, setTopicName] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(new Set(ALL_COLUMNS.filter((c) => c !== 'tags' && c !== 'priority' && c !== 'format')))
  const [showColPicker, setShowColPicker] = useState(false)
  const colPickerRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(page)
  const statusFilterRef = useRef(statusFilter)

  // Click outside or Escape to close column picker
  useEffect(() => {
    if (!showColPicker) return
    const handleClick = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setShowColPicker(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowColPicker(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [showColPicker])

  const toggleCol = (key: ColumnKey) => {
    setVisibleCols((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Fetch topic name when a message with topicId is selected
  useEffect(() => {
    if (!selectedMsg?.topicId) {
      setTopicName(null)
      return
    }
    let cancelled = false
    topicsApi.get(selectedMsg.topicId).then((res) => {
      if (!cancelled && res.success && res.data) {
        setTopicName(res.data.displayName || res.data.name || null)
      }
    }).catch(() => {
      if (!cancelled) setTopicName(null)
    })
    return () => { cancelled = true }
  }, [selectedMsg?.topicId])

  const channelTypes = useMemo(() => {
    const types = new Set(messages.map((m) => m.channelType))
    return Array.from(types).sort()
  }, [messages])

  const filteredMessages = useMemo(() => {
    if (!channelFilter) return messages
    return messages.filter((m) => m.channelType === channelFilter)
  }, [messages, channelFilter])

  const col = (key: ColumnKey) => visibleCols.has(key)

  // Keep refs in sync with state so load() always reads current values
  useEffect(() => { pageRef.current = page }, [page])
  useEffect(() => { statusFilterRef.current = statusFilter }, [statusFilter])

  const load = () => {
    setLoading(true)
    setError('')
    messagesApi.list({ page: pageRef.current, pageSize: 20, status: statusFilterRef.current || undefined }).then((res) => {
      if (res.success && res.data) {
        setMessages(res.data.items || [])
        setTotal(res.data.total || 0)
      } else {
        setError(res.error || 'Failed to load messages')
      }
    }).catch((err) => {
      setError(err.message || 'Network error')
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [page, statusFilter])

  // Auto-refresh every 30s (load reads from refs, so no stale closure)
  useEffect(() => {
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [])

  const handleRetry = async (id: string) => {
    await messagesApi.retry(id)
    load()
  }

  const handleDelete = async (id: string) => {
    if (await confirm({ description: t('messages.deleteConfirm'), variant: 'destructive', confirmLabel: t('messages.delete') })) {
      await messagesApi.delete(id)
      load()
    }
  }

  const handleClearAll = async () => {
    if (await confirm({ description: t('messages.clearAllConfirm'), variant: 'destructive', confirmLabel: t('messages.clearAll') })) {
      setClearing(true)
      try {
        const res = await messagesApi.deleteAll()
        if (res.success) {
          load()
        }
      } finally {
        setClearing(false)
      }
    }
  }

  const handleExport = async (format: 'json' | 'csv' | 'xml') => {
    setExporting(true)
    try {
      const res = await messagesApi.export({ status: statusFilter || undefined })
      if (res.success && res.data) {
        const data = res.data as Message[]
        const ts = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
        const filename = `messages_${ts}`

        if (format === 'json') {
          downloadFile(toJson(data), `${filename}.json`, 'application/json')
        } else if (format === 'csv') {
          downloadFile(toCsv(data), `${filename}.csv`, 'text/csv')
        } else {
          downloadFile(toXml(data), `${filename}.xml`, 'application/xml')
        }
      }
    } finally {
      setExporting(false)
    }
  }

  const statuses = ['', 'queued', 'sending', 'sent', 'failed', 'dead']

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold tracking-tight">{t('messages.title')}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={exporting} onClick={() => handleExport('json')}>
            <Download className="h-4 w-4 mr-1" />
            JSON
          </Button>
          <Button variant="outline" size="sm" disabled={exporting} onClick={() => handleExport('csv')}>
            <Download className="h-4 w-4 mr-1" />
            CSV
          </Button>
          <Button variant="outline" size="sm" disabled={exporting} onClick={() => handleExport('xml')}>
            <Download className="h-4 w-4 mr-1" />
            XML
          </Button>
          <Button variant="destructive" size="sm" disabled={clearing} onClick={handleClearAll}>
            <Trash2 className="h-4 w-4 mr-1" />
            {t('messages.clearAll')}
          </Button>
          <Button variant="outline" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('messages.refresh')}
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {/* Status filter */}
        {statuses.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? 'default' : 'outline'}
            onClick={() => { setStatusFilter(s); setPage(1) }}
          >
            {s ? t(`status.${s}`) : t('messages.all')}
          </Button>
        ))}

        <div className="w-px h-5 bg-border mx-1" />

        {/* Channel type filter */}
        {channelTypes.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            <Button
              size="sm"
              variant={channelFilter === '' ? 'default' : 'outline'}
              onClick={() => setChannelFilter('')}
            >
              {t('messages.all')}
            </Button>
            {channelTypes.map((ct) => (
              <Button
                key={ct}
                size="sm"
                variant={channelFilter === ct ? 'default' : 'outline'}
                onClick={() => setChannelFilter(ct)}
              >
                {t(`common.${ct}`) || ct}
              </Button>
            ))}
          </div>
        )}

        <div className="flex-1" />

        {/* Column picker */}
        <div className="relative" ref={colPickerRef}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowColPicker(!showColPicker)}
          >
            <SlidersHorizontal className="h-4 w-4 mr-1" />
            {t('messages.columns') || 'Columns'}
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
          {showColPicker && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg p-2 min-w-[180px]">
              {ALL_COLUMNS.map((key) => (
                <label
                  key={key}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={visibleCols.has(key)}
                    onChange={() => toggleCol(key)}
                    className="rounded accent-primary"
                  />
                  {t(COLUMN_I18N[key])}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b">
                {col('id') && <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{t('messages.colId')}</th>}
                {col('channel') && <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap w-[80px]">{t('messages.colChannel')}</th>}
                {col('to') && <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{t('messages.colTo')}</th>}
                {col('subject') && <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{t('messages.colSubject')}</th>}
                {col('summary') && <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{t('messages.colSummary')}</th>}
                {col('topic') && <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{t('messages.colTopic')}</th>}
                {col('tags') && <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{t('messages.colTags')}</th>}
                {col('priority') && <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap w-[50px]">{t('messages.colPriority')}</th>}
                {col('format') && <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap w-[60px]">{t('messages.colFormat')}</th>}
                {col('status') && <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap w-[80px]">{t('messages.colStatus')}</th>}
                {col('retries') && <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap w-[50px]">{t('messages.colRetries')}</th>}
                {col('duration') && <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap w-[60px]">{t('messages.colDuration')}</th>}
                {col('created') && <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap w-[120px]">{t('messages.colCreated')}</th>}
                {col('actions') && <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap w-[60px]">{t('messages.colActions')}</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // Skeleton rows while loading
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="border-b">
                    {col('id') && <td className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>}
                    {col('channel') && <td className="px-3 py-2"><Skeleton className="h-5 w-14" /></td>}
                    {col('to') && <td className="px-3 py-2"><Skeleton className="h-4 w-32" /></td>}
                    {col('subject') && <td className="px-3 py-2"><Skeleton className="h-4 w-48" /></td>}
                    {col('summary') && <td className="px-3 py-2"><Skeleton className="h-4 w-40" /></td>}
                    {col('topic') && <td className="px-3 py-2"><Skeleton className="h-5 w-20" /></td>}
                    {col('tags') && <td className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>}
                    {col('priority') && <td className="px-3 py-2"><Skeleton className="h-4 w-8 mx-auto" /></td>}
                    {col('format') && <td className="px-3 py-2"><Skeleton className="h-5 w-12" /></td>}
                    {col('status') && <td className="px-3 py-2"><Skeleton className="h-5 w-16" /></td>}
                    {col('retries') && <td className="px-3 py-2"><Skeleton className="h-4 w-10 mx-auto" /></td>}
                    {col('duration') && <td className="px-3 py-2"><Skeleton className="h-4 w-12 mx-auto" /></td>}
                    {col('created') && <td className="px-3 py-2"><Skeleton className="h-4 w-28" /></td>}
                    {col('actions') && <td className="px-3 py-2"><Skeleton className="h-6 w-12 ml-auto" /></td>}
                  </tr>
                ))
              ) : (
                <>
                  {filteredMessages.map((msg) => {
                    const tags = parseTags(msg.tags)
                    return (
                    <tr
                      key={msg.id}
                      className="border-b hover:bg-muted/50 cursor-pointer"
                      onClick={() => setSelectedMsg(msg)}
                    >
                      {col('id') && (
                        <td className="px-3 py-1.5 text-xs">
                          <Badge variant="secondary" className="text-[10px] font-mono">{msg.id}</Badge>
                        </td>
                      )}
                      {col('channel') && (
                        <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                          <Badge variant="outline" className="text-xs">
                            {msg.channelName || t(`common.${msg.channelType}`) || msg.channelType}
                          </Badge>
                        </td>
                      )}
                      {col('to') && <td className="px-3 py-1.5 text-xs max-w-[200px] truncate">{msg.toAddress}</td>}
                      {col('subject') && <td className="px-3 py-1.5 text-xs max-w-[360px] truncate">{msg.subject || '—'}</td>}
                      {col('summary') && <td className="px-3 py-1.5 text-xs max-w-[300px] truncate text-muted-foreground">{msg.body || '—'}</td>}
                      {col('topic') && (
                        <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                          {msg.topicId ? (
                            <Badge variant="outline" className="text-[10px]">{msg.topicId}</Badge>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      )}
                      {col('tags') && (
                        <td className="px-3 py-1.5">
                          <div className="flex gap-1 flex-wrap max-w-[140px]">
                            {tags.map((tag, i) => (
                              <Badge key={i} variant="outline" className="text-[10px] px-1 py-0">{tag}</Badge>
                            ))}
                            {tags.length === 0 && <span className="text-muted-foreground text-xs">—</span>}
                          </div>
                        </td>
                      )}
                      {col('priority') && (
                        <td className="px-3 py-1.5 text-xs text-center whitespace-nowrap">
                          {msg.priority > 0 ? (
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${priorityColor(msg.priority)}`}>
                              {msg.priority}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      )}
                      {col('format') && (
                        <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                          <Badge variant="secondary" className="text-[10px]">
                            {msg.format || 'text'}
                          </Badge>
                        </td>
                      )}
                      {col('status') && (
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <Badge variant={statusVariant[msg.status] || 'default'} className="text-xs">
                            {t(`status.${msg.status}`) || msg.status}
                          </Badge>
                          {msg.errorMessage && (
                            <p className="text-[11px] text-destructive mt-0.5 max-w-[200px] truncate">
                              {msg.errorMessage}
                            </p>
                          )}
                        </td>
                      )}
                      {col('retries') && <td className="px-3 py-1.5 text-xs text-center whitespace-nowrap">{msg.retryCount > 0 ? `${msg.retryCount}/${msg.maxRetries}` : '—'}</td>}
                      {col('duration') && (
                        <td className="px-3 py-1.5 text-xs text-muted-foreground text-center whitespace-nowrap">
                          {msg.sentAt ? `${((toDate(msg.sentAt).getTime() - toDate(msg.createdAt).getTime()) / 1000).toFixed(1)}s` : '—'}
                        </td>
                      )}
                      {col('created') && <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(msg.createdAt)}</td>}
                      {col('actions') && (
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-1">
                            {(msg.status === 'failed' || msg.status === 'dead') && (
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); handleRetry(msg.id) }} aria-label="Retry">
                                <RotateCw className="h-3 w-3" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(msg.id) }} aria-label="Delete">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )})}
                  {filteredMessages.length === 0 && (
                    <tr>
                      <td colSpan={visibleCols.size}>
                        <EmptyState title={t('messages.empty')} />
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mt-4">
        <span className="text-sm text-muted-foreground">
          {t('messages.pageInfo', { page, total: Math.ceil(total / 20) })}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t('messages.prev')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= Math.ceil(total / 20)}
            onClick={() => setPage(page + 1)}
          >
            {t('messages.next')}
          </Button>
        </div>
      </div>

      {/* Message Detail Dialog */}
      <Dialog open={!!selectedMsg} onOpenChange={(v) => { if (!v) setSelectedMsg(null) }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('messages.detail')}</DialogTitle>
          </DialogHeader>
          {selectedMsg && (
            <div className="space-y-3">
              {/* Compact metadata grid */}
              <div className="grid grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
                <MetaItem label={t('messages.colId')} children={<Badge variant="secondary" className="text-[10px] font-mono">{selectedMsg.id}</Badge>} />
                <MetaItem label={t('messages.colStatus')} children={
                  <Badge variant={statusVariant[selectedMsg.status] || 'default'} className="text-[10px]">
                    {t(`status.${selectedMsg.status}`) || selectedMsg.status}
                  </Badge>
                } />
                <MetaItem label={t('messages.colChannel')} children={
                  <Badge variant="outline" className="text-[10px]">
                    {selectedMsg.channelName || t(`common.${selectedMsg.channelType}`) || selectedMsg.channelType}
                  </Badge>
                } />
                <MetaItem label={t('messages.colFormat')} children={
                  <Badge variant="secondary" className="text-[10px]">{selectedMsg.format || 'text'}</Badge>
                } />
                <MetaItem label={t('messages.colTo')} value={selectedMsg.toAddress} className="col-span-2" />
                <MetaItem label={t('messages.colPriority')} value={selectedMsg.priority > 0 ? String(selectedMsg.priority) : '0'} />
                <MetaItem label={t('messages.colRetries')} value={`${selectedMsg.retryCount}/${selectedMsg.maxRetries}`} />
                <MetaItem label={t('messages.colCreated')} value={formatDate(selectedMsg.createdAt)} />
                <MetaItem label={t('messages.colSentAt')} value={selectedMsg.sentAt ? formatDate(selectedMsg.sentAt) : '—'} />
                <MetaItem label={t('messages.colDuration')} value={
                  selectedMsg.sentAt ? `${((toDate(selectedMsg.sentAt).getTime() - toDate(selectedMsg.createdAt).getTime()) / 1000).toFixed(1)}s` : '—'
                } />
                {selectedMsg.topicId && (
                  <MetaItem label={t('messages.colTopic')} children={
                    <span className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">{topicName || selectedMsg.topicId}</Badge>
                      {topicName && <span className="text-muted-foreground font-mono text-[10px]">({selectedMsg.topicId})</span>}
                    </span>
                  } />
                )}
                {selectedMsg.channelId && <MetaItem label="Channel ID" mono value={selectedMsg.channelId} />}
                {selectedMsg.ipAddress && <MetaItem label={t('messages.ipAddress')} mono value={selectedMsg.ipAddress} />}
                {selectedMsg.ipLocation && <MetaItem label={t('messages.ipLocation')} value={selectedMsg.ipLocation} />}
                {selectedMsg.app && (
                  <MetaItem label={t('messages.app')} children={<Badge variant="outline" className="text-[10px]">{selectedMsg.app}</Badge>} />
                )}
                <MetaItem label="Template ID" mono value={selectedMsg.templateId} />
              </div>

              {/* Tags inline */}
              {parseTags(selectedMsg.tags).length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">{t('messages.colTags')}:</span>
                  {parseTags(selectedMsg.tags).map((tag, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">{tag}</Badge>
                  ))}
                </div>
              )}

              {/* URL inline */}
              {selectedMsg.url && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">URL:</span>
                  <a href={selectedMsg.url} target="_blank" rel="noopener noreferrer"
                     className="text-primary underline text-xs inline-flex items-center gap-1 hover:text-primary/80 truncate">
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    {selectedMsg.url}
                  </a>
                </div>
              )}

              {/* Attachment inline */}
              {selectedMsg.attachment && (() => {
                const att = parseAttachment(selectedMsg.attachment)
                return att ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Attachment:</span>
                    <Paperclip className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{att.name}</span>
                    {att.url && (
                      <a href={att.url} target="_blank" rel="noopener noreferrer"
                         className="text-primary underline hover:text-primary/80">Download</a>
                    )}
                    {att.data && <span className="text-muted-foreground">Base64 ({Math.ceil(att.data.length / 1024)} KB)</span>}
                  </div>
                ) : null
              })()}

              {/* Subject */}
              {selectedMsg.subject && (
                <div>
                  <span className="text-xs text-muted-foreground">{t('messages.colSubject')}</span>
                  <p className="text-sm mt-0.5">{selectedMsg.subject}</p>
                </div>
              )}

              {/* Template vars */}
              {selectedMsg.templateVars && (
                <div>
                  <span className="text-xs text-muted-foreground">{t('messages.templateVars')}</span>
                  <pre className="text-xs mt-0.5 p-2 bg-muted rounded-md overflow-x-auto">{selectedMsg.templateVars}</pre>
                </div>
              )}

              {/* Error */}
              {selectedMsg.errorMessage && (
                <div>
                  <span className="text-xs text-muted-foreground">{t('messages.errorMessage')}</span>
                  <pre className="text-xs mt-0.5 p-2 bg-destructive/10 text-destructive rounded-md whitespace-pre-wrap">{selectedMsg.errorMessage}</pre>
                </div>
              )}

              {/* Body - takes remaining space */}
              {selectedMsg.body && (
                <div>
                  <span className="text-xs text-muted-foreground">{t('messages.colBody')}</span>
                  <pre className="text-sm mt-0.5 p-3 bg-muted rounded-md whitespace-pre-wrap break-all max-h-[400px] overflow-y-auto">{selectedMsg.body}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </div>
  )
}
