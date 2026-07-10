import { useEffect, useState, useRef, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { attachmentsApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { COPY_TIMEOUT_MS } from '@/lib/constants'
import { toDate, copyToClipboard, formatBytes } from '@/lib/utils'
import {
  Upload, Trash2, Copy, Check, File, Image as ImageIcon, FileText, FileArchive,
  FileVideo, FileAudio, FileCode, ChevronLeft, ChevronRight,
  HardDrive, Clock, Download, Eye, CheckSquare, Square, X,
} from 'lucide-react'

interface Attachment {
  id: string
  originalName: string
  mimeType: string
  size: number
  url: string
  downloadCount: number
  expiresAt: string | null
  createdAt: string
}

function getFileIcon(mimeType: string, size = 'w-4 h-4') {
  if (mimeType.startsWith('image/')) return <ImageIcon className={size} />
  if (mimeType.startsWith('video/')) return <FileVideo className={size} />
  if (mimeType.startsWith('audio/')) return <FileAudio className={size} />
  if (mimeType.includes('pdf')) return <FileText className={size} />
  if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed') || mimeType.includes('tar') || mimeType.includes('rar') || mimeType.includes('7z'))
    return <FileArchive className={size} />
  if (mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('html') || mimeType.includes('javascript') || mimeType.includes('typescript'))
    return <FileCode className={size} />
  if (mimeType.includes('text') || mimeType.includes('csv') || mimeType.includes('markdown'))
    return <FileText className={size} />
  return <File className={size} />
}

function getFileTypeLabel(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'Image'
  if (mimeType.startsWith('video/')) return 'Video'
  if (mimeType.startsWith('audio/')) return 'Audio'
  if (mimeType.includes('pdf')) return 'PDF'
  if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed'))
    return 'Archive'
  if (mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('html'))
    return 'Code'
  if (mimeType.includes('text')) return 'Text'
  return mimeType.split('/')[1]?.toUpperCase() || 'File'
}

function canPreview(mimeType: string): boolean {
  return mimeType.startsWith('image/') || mimeType.includes('pdf')
}

export default function Attachments() {
  const { t } = useTranslation()
  const { confirm, ConfirmDialog } = useConfirm()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [stats, setStats] = useState<{ usedBytes: number; maxBytes: number | null; fileCount: number }>({ usedBytes: 0, maxBytes: null, fileCount: 0 })
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<Attachment | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [listRes, statsRes] = await Promise.all([
        attachmentsApi.list(page, pageSize),
        attachmentsApi.stats(),
      ])
      if (listRes.success && listRes.data) {
        setAttachments(listRes.data.items)
        setTotal(listRes.data.total)
      } else {
        setError(listRes.error || 'Failed to load attachments')
      }
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    }
  }, [page, pageSize])

  useEffect(() => { load() }, [load])

  // Clear selection when page changes
  useEffect(() => { setSelected(new Set()) }, [page])

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    for (let i = 0; i < files.length; i++) {
      await attachmentsApi.upload(files[i])
    }
    setUploading(false)
    setPage(1)
    await load()
  }

  const handleDelete = async (id: string) => {
    if (!await confirm({ description: t('attachments_delete_confirm'), variant: 'destructive', confirmLabel: t('attachments_delete') })) return
    await attachmentsApi.delete(id)
    setSelected(prev => { const next = new Set(prev); next.delete(id); return next })
    await load()
  }

  const handleBatchDelete = async () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!await confirm({ description: t('attachments_batch_delete_confirm', { count: ids.length }), variant: 'destructive', confirmLabel: t('attachments_delete') })) return
    await attachmentsApi.batchDelete(ids)
    setSelected(new Set())
    await load()
  }

  const handleClearAll = async () => {
    if (!await confirm({ description: t('attachments_clear_confirm'), variant: 'destructive', confirmLabel: t('attachments_clear_all') })) return
    await attachmentsApi.clearAll()
    setSelected(new Set())
    setPage(1)
    await load()
  }

  const handleCopyUrl = async (id: string, url: string) => {
    const full = window.location.origin + url
    const ok = await copyToClipboard(full)
    if (ok) {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), COPY_TIMEOUT_MS)
    }
  }

  const handleDownload = (att: Attachment) => {
    const a = document.createElement('a')
    a.href = att.url
    a.download = att.originalName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredAttachments = search
    ? attachments.filter(a => a.originalName.toLowerCase().includes(search.toLowerCase()))
    : attachments

  const toggleSelectAll = () => {
    const filteredIds = filteredAttachments.map(a => a.id)
    const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id))
    if (allFilteredSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        filteredIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        filteredIds.forEach(id => next.add(id))
        return next
      })
    }
  }

  const totalPages = Math.ceil(total / pageSize)
  const allSelected = filteredAttachments.length > 0 && filteredAttachments.every(a => selected.has(a.id))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">{t('attachments_title')}</h2>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Badge variant="secondary" className="gap-1">
              {t('attachments_selected', { count: selected.size })}
              <X className="w-3 h-3 cursor-pointer" onClick={() => setSelected(new Set())} aria-label="Clear selection" />
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="w-4 h-4 mr-1.5" />
            {uploading ? t('attachments_uploading') : t('attachments_upload')}
          </Button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Stats bar */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t('attachments_storage')}:</span>
              <span className="font-medium tabular-nums">{formatBytes(stats.usedBytes)}</span>
              {stats.maxBytes !== null ? (
                <span className="text-muted-foreground">/ {formatBytes(stats.maxBytes)}</span>
              ) : (
                <Badge variant="secondary">{t('attachments_unlimited')}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <File className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t('attachments_files')}:</span>
              <span className="font-medium tabular-nums">{stats.fileCount}</span>
            </div>
            {stats.maxBytes !== null && (
              <div className="flex-1 max-w-xs">
                <div className="w-full bg-secondary rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (stats.usedBytes / stats.maxBytes) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files) }}
      >
        <Upload className="w-6 h-6 mx-auto mb-1.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{t('attachments_drop_hint')}</p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={toggleSelectAll}>
            {allSelected ? (
              <><CheckSquare className="w-4 h-4 mr-1.5" />{t('attachments_deselect_all')}</>
            ) : (
              <><Square className="w-4 h-4 mr-1.5" />{t('attachments_select_all')}</>
            )}
          </Button>
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBatchDelete}>
              <Trash2 className="w-4 h-4 mr-1.5" />
              {t('attachments_delete_selected')} ({selected.size})
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleClearAll}>
            <Trash2 className="w-4 h-4 mr-1.5" />
            {t('attachments_clear_all')}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 h-8 text-sm"
          />
          {search && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">(page only)</span>
          )}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {attachments.length === 0 ? (
            <EmptyState title={t('attachments_empty')} />
          ) : (
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="w-10 px-3 py-2.5 text-center">
                    <button onClick={toggleSelectAll} className="hover:text-foreground" aria-label={allSelected ? 'Deselect all' : 'Select all'}>
                      {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium">{t('attachments_name')}</th>
                  <th className="px-3 py-2.5 text-left font-medium w-36">{t('attachments_type')}</th>
                  <th className="px-3 py-2.5 text-right font-medium w-28">{t('attachments_size')}</th>
                  <th className="px-3 py-2.5 text-left font-medium w-28">{t('attachments_date')}</th>
                  <th className="px-3 py-2.5 text-right font-medium w-36">{t('attachments_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttachments.map((att) => {
                  const isSelected = selected.has(att.id)
                  return (
                    <tr
                      key={att.id}
                      className={`border-b last:border-0 hover:bg-muted/50 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => toggleSelect(att.id)} className="hover:text-foreground text-muted-foreground" aria-label={isSelected ? 'Deselect' : 'Select'}>
                          {isSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="text-muted-foreground shrink-0">
                            {getFileIcon(att.mimeType)}
                          </div>
                          <span
                            className={`text-sm truncate ${canPreview(att.mimeType) ? 'cursor-pointer hover:text-primary hover:underline' : ''}`}
                            onClick={() => canPreview(att.mimeType) && setPreview(att)}
                            title={att.originalName}
                          >
                            {att.originalName}
                          </span>
                          {att.expiresAt && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                              {t('attachments_expires')}: {toDate(att.expiresAt).toLocaleDateString()}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {getFileTypeLabel(att.mimeType)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                        {formatBytes(att.size)}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {toDate(att.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          {canPreview(att.mimeType) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => setPreview(att)}
                              title={t('attachments_preview')}
                              aria-label={t('attachments_preview')}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleDownload(att)}
                            title={t('attachments_download')}
                            aria-label={t('attachments_download')}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleCopyUrl(att.id, att.url)}
                            title={t('attachments_copy_url')}
                            aria-label={t('attachments_copy_url')}
                          >
                            {copiedId === att.id ? (
                              <Check className="w-3.5 h-3.5 text-green-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleDelete(att.id)}
                            title={t('delete')}
                            aria-label={t('delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t('attachments_total', { count: total })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Preview Modal — portal-based, no focus trap so iframe works */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={preview.originalName}
          onKeyDown={(e) => { if (e.key === 'Escape') setPreview(null) }}
          tabIndex={-1}
        >
          <div className="fixed inset-0 bg-black/80" onClick={() => setPreview(null)} />
          <div className="relative z-50 w-full max-w-4xl max-h-[90vh] mx-4 bg-background border rounded-lg shadow-xl overflow-hidden flex flex-col animate-in fade-in-0 zoom-in-95">
            <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {getFileIcon(preview.mimeType, 'w-5 h-5')}
                <span className="text-sm font-semibold truncate">{preview.originalName}</span>
                <span className="text-xs text-muted-foreground shrink-0">{formatBytes(preview.size)}</span>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => setPreview(null)} aria-label="Close">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {preview.mimeType.startsWith('image/') ? (
                <img
                  src={preview.url.startsWith('http') ? preview.url : window.location.origin + preview.url}
                  alt={preview.originalName}
                  className="max-w-full max-h-[70vh] object-contain mx-auto rounded-md"
                />
              ) : preview.mimeType.includes('pdf') ? (
                <iframe
                  src={preview.url.startsWith('http') ? preview.url : window.location.origin + preview.url}
                  title={preview.originalName}
                  className="w-full h-[75vh] rounded-md border-0"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {ConfirmDialog}
    </div>
  )
}
