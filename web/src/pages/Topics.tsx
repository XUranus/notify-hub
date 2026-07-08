import { useEffect, useState, useRef } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { topicsApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Plus, Trash2, Pencil, Tags, Upload, X, GitFork } from 'lucide-react'

interface Topic {
  id: string
  userId: number
  name: string
  displayName: string | null
  icon: string | null
  preset: boolean
  createdAt: number
  updatedAt: number
}

export default function Topics() {
  const { t } = useTranslation()
  const { confirm, ConfirmDialog } = useConfirm()
  const [topics, setTopics] = useState<Topic[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [showForkDialog, setShowForkDialog] = useState(false)
  const [forkingTopic, setForkingTopic] = useState<Topic | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [apiError, setApiError] = useState('')
  const [forkName, setForkName] = useState('')
  const [formData, setFormData] = useState({ name: '', displayName: '' })
  const [iconPreview, setIconPreview] = useState<string | null>(null)
  const [iconBase64, setIconBase64] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = () => {
    setLoading(true)
    setLoadError('')
    topicsApi.list().then((res) => {
      if (res.success) setTopics(res.data || [])
      else setLoadError(res.error || 'Failed to load topics')
    }).catch((err) => {
      setLoadError(err.message || 'Network error')
    }).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditingId(null)
    setFormData({ name: '', displayName: '' })
    setIconPreview(null)
    setIconBase64(null)
    setApiError('')
    setShowDialog(true)
  }

  const openEdit = (topic: Topic) => {
    setEditingId(topic.id)
    setFormData({ name: topic.name, displayName: topic.displayName || '' })
    setIconPreview(topic.icon)
    setIconBase64(topic.icon)
    setApiError('')
    setShowDialog(true)
  }

  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 512 * 1024) {
      setApiError(t('topics.iconTooLarge'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setIconBase64(result)
      setIconPreview(result)
    }
    reader.readAsDataURL(file)
  }

  const removeIcon = () => {
    setIconBase64(null)
    setIconPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async () => {
    setApiError('')
    if (!formData.name.trim()) {
      setApiError(t('topics.nameRequired'))
      return
    }

    const data: Record<string, unknown> = {
      name: formData.name.trim(),
    }
    if (formData.displayName.trim()) {
      data.displayName = formData.displayName.trim()
    }

    if (editingId) {
      // For update: only send icon if changed
      if (iconBase64 !== undefined) {
        data.icon = iconBase64
      }
      const result = await topicsApi.update(editingId, data)
      if (result.success) {
        setShowDialog(false)
        setEditingId(null)
        load()
      } else {
        setApiError(result.error || t('topics.updateFailed'))
      }
    } else {
      data.icon = iconBase64 || undefined
      const result = await topicsApi.create(data)
      if (result.success) {
        setShowDialog(false)
        load()
      } else {
        setApiError(result.error || t('topics.createFailed'))
      }
    }
  }

  const handleDelete = async (id: string) => {
    if (!await confirm({ description: t('topics.deleteConfirm'), variant: 'destructive', confirmLabel: t('topics.delete') })) return
    const result = await topicsApi.delete(id)
    if (result.success) load()
  }

  const openFork = (topic: Topic) => {
    setForkingTopic(topic)
    setForkName('')
    setApiError('')
    setShowForkDialog(true)
  }

  const handleFork = async () => {
    if (!forkingTopic) return
    setApiError('')
    if (!forkName.trim()) {
      setApiError(t('topics.nameRequired'))
      return
    }

    const result = await topicsApi.fork(forkingTopic.id, { name: forkName.trim() })
    if (result.success) {
      setShowForkDialog(false)
      setForkingTopic(null)
      load()
    } else {
      setApiError(result.error || t('topics.forkFailed'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('topics.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t('topics.subtitle')}
          </p>
        </div>
        <Button onClick={openCreate} className="rounded-full">
          <Plus className="h-4 w-4 mr-2" />
          {t('topics.new')}
        </Button>
      </div>

      {/* Error banner */}
      {loadError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={`skeleton-${i}`} className="rounded-xl">
              <CardHeader className="flex flex-row items-center gap-3 pb-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Skeleton className="h-3 w-48" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : topics.length === 0 ? (
        <Card className="rounded-xl">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Tags className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t('topics.empty')}</p>
            <Button
              variant="outline"
              className="mt-4 rounded-full"
              onClick={openCreate}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('topics.create')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic) => (
            <Card key={topic.id} className="rounded-xl">
              <CardHeader className="flex flex-row items-center gap-3 pb-3">
                {topic.icon ? (
                  <img
                    src={topic.icon}
                    alt=""
                    className="h-10 w-10 rounded-xl object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-xl bg-primary-container flex items-center justify-center">
                    <Tags className="h-5 w-5 text-on-primary-container" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate">
                    {topic.displayName || topic.name}
                    {topic.preset && (
                      <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                        {t('topics.preset')}
                      </span>
                    )}
                  </h3>
                  {topic.displayName && (
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {topic.name}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  {topic.preset ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => openFork(topic)}
                      aria-label="Fork"
                      title={t('topics.fork')}
                    >
                      <GitFork className="h-4 w-4" />
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={() => openEdit(topic)}
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full text-destructive"
                        onClick={() => handleDelete(topic.id)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground font-mono truncate">
                  ID: {topic.id}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t('topics.edit') : t('topics.new')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {apiError && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2">
                {apiError}
              </div>
            )}
            <div className="space-y-2">
              <Label>{t('topics.name')}</Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder={t('topics.namePlaceholder')}
                className="rounded-xl"
                disabled={!!editingId}
              />
              <p className="text-xs text-muted-foreground">
                {t('topics.nameHint')}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t('topics.displayName')}</Label>
              <Input
                value={formData.displayName}
                onChange={(e) =>
                  setFormData({ ...formData, displayName: e.target.value })
                }
                placeholder={t('topics.displayNamePlaceholder')}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('topics.icon')}</Label>
              <div className="flex items-center gap-3">
                {iconPreview ? (
                  <div className="relative">
                    <img
                      src={iconPreview}
                      alt="Icon"
                      className="h-14 w-14 rounded-xl object-cover border"
                    />
                    <button
                      onClick={removeIcon}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div
                    className="h-14 w-14 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  <p>{t('topics.iconHint')}</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleIconUpload}
              />
            </div>
            {editingId && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('topics.uuid')}</Label>
                <p className="text-xs font-mono text-muted-foreground bg-muted rounded-lg px-3 py-2">
                  {editingId}
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => setShowDialog(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button className="rounded-full" onClick={handleSubmit}>
                {editingId ? t('common.save') : t('common.confirm')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fork Dialog */}
      <Dialog open={showForkDialog} onOpenChange={setShowForkDialog}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('topics.forkTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {apiError && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2">
                {apiError}
              </div>
            )}
            {forkingTopic && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
                {forkingTopic.icon ? (
                  <img src={forkingTopic.icon} alt="" className="h-10 w-10 rounded-xl object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-xl bg-primary-container flex items-center justify-center">
                    <Tags className="h-5 w-5 text-on-primary-container" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-sm">{forkingTopic.displayName || forkingTopic.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{forkingTopic.name}</p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t('topics.forkName')}</Label>
              <Input
                value={forkName}
                onChange={(e) => setForkName(e.target.value)}
                placeholder={t('topics.forkNamePlaceholder')}
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                {t('topics.forkNameHint')}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => setShowForkDialog(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button className="rounded-full" onClick={handleFork}>
                {t('topics.fork')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </div>
  )
}
