import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { messagesApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { RefreshCw, RotateCw, Trash2, Download, Link, Paperclip, ExternalLink } from 'lucide-react'
import { formatDate } from '@/lib/utils'

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

function toCsv(messages: Message[]): string {
  const headers = ['id', 'channelType', 'channelName', 'toAddress', 'subject', 'body', 'status', 'retryCount', 'errorMessage', 'ipAddress', 'ipLocation', 'app', 'createdAt', 'sentAt', 'tags', 'priority', 'url', 'attachment', 'format']
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = messages.map((m) => headers.map((h) => escape((m as unknown as Record<string, unknown>)[h])).join(','))
  return [headers.join(','), ...rows].join('\n')
}

function toJson(messages: Message[]): string {
  return JSON.stringify(messages, null, 2)
}

function toXml(messages: Message[]): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const fields = ['id', 'channelType', 'channelName', 'toAddress', 'subject', 'body', 'status', 'retryCount', 'errorMessage', 'ipAddress', 'ipLocation', 'app', 'createdAt', 'sentAt', 'tags', 'priority', 'url', 'attachment', 'format']
  const items = messages.map((m) => {
    const inner = fields.map((f) => {
      const v = (m as unknown as Record<string, unknown>)[f]
      return `    <${f}>${v != null ? escape(String(v)) : ''}</${f}>`
    }).join('\n')
    return `  <message>\n${inner}\n  </message>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<messages>\n${items.join('\n')}\n</messages>`
}

export default function Messages() {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<Message[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null)
  const [exporting, setExporting] = useState(false)

  const load = () => {
    messagesApi.list({ page, pageSize: 20, status: statusFilter || undefined }).then((res) => {
      if (res.success && res.data) {
        setMessages(res.data.items || [])
        setTotal(res.data.total || 0)
      }
    })
  }

  useEffect(() => { load() }, [page, statusFilter])

  const handleRetry = async (id: string) => {
    await messagesApi.retry(id)
    load()
  }

  const handleDelete = async (id: string) => {
    if (confirm(t('messages.deleteConfirm'))) {
      await messagesApi.delete(id)
      load()
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
          <Button variant="outline" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('messages.refresh')}
          </Button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
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
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colId')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colChannel')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colTo')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colSubject')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colTags')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colPriority')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colFormat')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colStatus')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colRetries')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colDuration')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colCreated')}</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => (
                <tr
                  key={msg.id}
                  className="border-b hover:bg-muted/50 cursor-pointer"
                  onClick={() => setSelectedMsg(msg)}
                >
                  <td className="px-4 py-1.5 text-xs font-mono">{msg.id}</td>
                  <td className="px-4 py-1.5 text-xs">
                    <Badge variant="outline" className="text-xs">
                      {msg.channelName || t(`common.${msg.channelType}`) || msg.channelType}
                    </Badge>
                  </td>
                  <td className="px-4 py-1.5 text-xs max-w-[200px] truncate">{msg.toAddress}</td>
                  <td className="px-4 py-1.5 text-xs max-w-[200px] truncate">{msg.subject || '—'}</td>
                  <td className="px-4 py-1.5">
                    <div className="flex gap-1 flex-wrap max-w-[140px]">
                      {parseTags(msg.tags).map((tag, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] px-1 py-0">{tag}</Badge>
                      ))}
                      {parseTags(msg.tags).length === 0 && <span className="text-muted-foreground text-xs">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-1.5 text-xs">
                    {msg.priority > 0 ? (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${priorityColor(msg.priority)}`}>
                        {msg.priority}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-1.5 text-xs">
                    {msg.format && msg.format !== 'text' ? (
                      <Badge variant="secondary" className="text-[10px]">{msg.format}</Badge>
                    ) : <span className="text-muted-foreground text-xs">text</span>}
                  </td>
                  <td className="px-4 py-1.5">
                    <Badge variant={statusVariant[msg.status] || 'default'} className="text-xs">
                      {t(`status.${msg.status}`) || msg.status}
                    </Badge>
                    {msg.errorMessage && (
                      <p className="text-[11px] text-destructive mt-0.5 max-w-[200px] truncate">
                        {msg.errorMessage}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-1.5 text-xs">{msg.retryCount > 0 ? `${msg.retryCount}/${msg.maxRetries}` : '—'}</td>
                  <td className="px-4 py-1.5 text-xs text-muted-foreground">
                    {msg.sentAt ? `${((new Date(msg.sentAt).getTime() - new Date(msg.createdAt).getTime()) / 1000).toFixed(1)}s` : '—'}
                  </td>
                  <td className="px-4 py-1.5 text-xs text-muted-foreground">{formatDate(msg.createdAt)}</td>
                  <td className="px-4 py-1.5 text-right">
                    <div className="flex justify-end gap-1">
                      {(msg.status === 'failed' || msg.status === 'dead') && (
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); handleRetry(msg.id) }}>
                          <RotateCw className="h-3 w-3" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(msg.id) }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {messages.length === 0 && (
                <tr>
                  <td colSpan={12}>
                    <EmptyState title={t('messages.empty')} />
                  </td>
                </tr>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('messages.detail')}</DialogTitle>
          </DialogHeader>
          {selectedMsg && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('messages.colId')}</span>
                  <p className="font-mono text-xs mt-0.5">{selectedMsg.id}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('messages.colStatus')}</span>
                  <div className="mt-0.5">
                    <Badge variant={statusVariant[selectedMsg.status] || 'default'} className="text-xs">
                      {t(`status.${selectedMsg.status}`) || selectedMsg.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('messages.colChannel')}</span>
                  <p className="mt-0.5">
                    <Badge variant="outline" className="text-xs">
                      {selectedMsg.channelName || t(`common.${selectedMsg.channelType}`) || selectedMsg.channelType}
                    </Badge>
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('messages.colTo')}</span>
                  <p className="mt-0.5">{selectedMsg.toAddress}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('messages.colCreated')}</span>
                  <p className="mt-0.5">{formatDate(selectedMsg.createdAt)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('messages.colDuration')}</span>
                  <p className="mt-0.5">
                    {selectedMsg.sentAt
                      ? `${((new Date(selectedMsg.sentAt).getTime() - new Date(selectedMsg.createdAt).getTime()) / 1000).toFixed(1)}s`
                      : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('messages.colRetries')}</span>
                  <p className="mt-0.5">{selectedMsg.retryCount}/{selectedMsg.maxRetries}</p>
                </div>
                {selectedMsg.channelId && (
                  <div>
                    <span className="text-muted-foreground">Channel ID</span>
                    <p className="font-mono text-xs mt-0.5">{selectedMsg.channelId}</p>
                  </div>
                )}
                {selectedMsg.ipAddress && (
                  <div>
                    <span className="text-muted-foreground">{t('messages.ipAddress')}</span>
                    <p className="font-mono text-xs mt-0.5">{selectedMsg.ipAddress}</p>
                  </div>
                )}
                {selectedMsg.ipLocation && (
                  <div>
                    <span className="text-muted-foreground">{t('messages.ipLocation')}</span>
                    <p className="mt-0.5">{selectedMsg.ipLocation}</p>
                  </div>
                )}
                {selectedMsg.app && (
                  <div>
                    <span className="text-muted-foreground">{t('messages.app')}</span>
                    <p className="mt-0.5"><Badge variant="outline" className="text-xs">{selectedMsg.app}</Badge></p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">{t('messages.colPriority')}</span>
                  <p className="mt-0.5">
                    {selectedMsg.priority > 0 ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${priorityColor(selectedMsg.priority)}`}>
                        {selectedMsg.priority}
                      </span>
                    ) : <span className="text-muted-foreground text-xs">0 (normal)</span>}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('messages.colFormat')}</span>
                  <p className="mt-0.5">
                    <Badge variant={selectedMsg.format === 'text' ? 'outline' : 'secondary'} className="text-xs">
                      {selectedMsg.format || 'text'}
                    </Badge>
                  </p>
                </div>
              </div>

              {parseTags(selectedMsg.tags).length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground">{t('messages.colTags')}</span>
                  <div className="flex gap-1.5 flex-wrap mt-1">
                    {parseTags(selectedMsg.tags).map((tag, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedMsg.url && (
                <div>
                  <span className="text-sm text-muted-foreground">URL</span>
                  <p className="mt-1">
                    <a href={selectedMsg.url} target="_blank" rel="noopener noreferrer"
                       className="text-primary underline text-sm inline-flex items-center gap-1 hover:text-primary/80">
                      <ExternalLink className="h-3 w-3" />
                      {selectedMsg.url}
                    </a>
                  </p>
                </div>
              )}

              {selectedMsg.attachment && (() => {
                const att = parseAttachment(selectedMsg.attachment)
                return att ? (
                  <div>
                    <span className="text-sm text-muted-foreground">Attachment</span>
                    <div className="mt-1 p-3 bg-muted rounded-md">
                      <div className="flex items-center gap-2">
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{att.name}</span>
                      </div>
                      {att.url && (
                        <a href={att.url} target="_blank" rel="noopener noreferrer"
                           className="text-primary underline text-xs mt-1 inline-flex items-center gap-1 hover:text-primary/80">
                          <ExternalLink className="h-3 w-3" />
                          Download
                        </a>
                      )}
                      {att.data && (
                        <p className="text-xs text-muted-foreground mt-1">Base64 data ({Math.ceil(att.data.length / 1024)} KB)</p>
                      )}
                    </div>
                  </div>
                ) : null
              })()}

              {selectedMsg.subject && (
                <div>
                  <span className="text-sm text-muted-foreground">{t('messages.colSubject')}</span>
                  <p className="text-sm mt-1">{selectedMsg.subject}</p>
                </div>
              )}

              {selectedMsg.body && (
                <div>
                  <span className="text-sm text-muted-foreground">{t('messages.colBody')}</span>
                  <pre className="text-sm mt-1 p-3 bg-muted rounded-md whitespace-pre-wrap break-all">{selectedMsg.body}</pre>
                </div>
              )}

              {selectedMsg.templateId && (
                <div>
                  <span className="text-sm text-muted-foreground">Template ID</span>
                  <p className="font-mono text-xs mt-1">{selectedMsg.templateId}</p>
                </div>
              )}

              {selectedMsg.templateVars && (
                <div>
                  <span className="text-sm text-muted-foreground">{t('messages.templateVars')}</span>
                  <pre className="text-xs mt-1 p-3 bg-muted rounded-md overflow-x-auto">{selectedMsg.templateVars}</pre>
                </div>
              )}

              {selectedMsg.errorMessage && (
                <div>
                  <span className="text-sm text-muted-foreground">{t('messages.errorMessage')}</span>
                  <pre className="text-sm mt-1 p-3 bg-destructive/10 text-destructive rounded-md whitespace-pre-wrap">{selectedMsg.errorMessage}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
