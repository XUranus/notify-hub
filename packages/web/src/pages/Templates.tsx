import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { templatesApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Plus, Trash2, FileText, Pencil } from 'lucide-react'

interface Template {
  id: string
  name: string
  channelType: string
  subject: string | null
  body: string
  variables: Record<string, string> | null
}

export default function Templates() {
  const { t } = useTranslation()
  const [templates, setTemplates] = useState<Template[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [apiError, setApiError] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    channelType: 'email',
    subject: '',
    body: '',
  })

  const load = () => templatesApi.list().then((res) => {
    if (res.success) setTemplates(res.data || [])
  })

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditingId(null)
    setFormData({ name: '', channelType: 'email', subject: '', body: '' })
    setApiError('')
    setShowDialog(true)
  }

  const openEdit = (tpl: Template) => {
    setEditingId(tpl.id)
    setFormData({
      name: tpl.name,
      channelType: tpl.channelType,
      subject: tpl.subject || '',
      body: tpl.body,
    })
    setApiError('')
    setShowDialog(true)
  }

  const handleSubmit = async () => {
    setApiError('')
    const data = {
      name: formData.name,
      channelType: formData.channelType,
      subject: formData.subject || undefined,
      body: formData.body,
    }

    const result = editingId
      ? await templatesApi.update(editingId, data)
      : await templatesApi.create(data)

    if (result.success) {
      setShowDialog(false)
      setEditingId(null)
      setFormData({ name: '', channelType: 'email', subject: '', body: '' })
      load()
    } else {
      setApiError(result.error || t('common.error'))
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm(t('templates.deleteConfirm'))) {
      await templatesApi.delete(id)
      load()
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold tracking-tight">{t('templates.title')}</h2>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          {t('templates.add')}
        </Button>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? t('templates.edit') : t('templates.new')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {apiError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                ⚠️ {apiError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('templates.name')}</Label>
                <Input
                  maxLength={32}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('templates.namePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('templates.channelType')}</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={formData.channelType}
                  onChange={(e) => setFormData({ ...formData, channelType: e.target.value })}
                >
                  <option value="email">{t('templates.email')}</option>
                  <option value="sms">{t('templates.sms')}</option>
                </select>
              </div>
            </div>
            {formData.channelType === 'email' && (
              <div className="space-y-2">
                <Label>{t('templates.subject')}</Label>
                <Input
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder={t('templates.subjectPlaceholder')}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>{t('templates.body')}</Label>
              <textarea
                className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                placeholder={t('templates.bodyPlaceholder')}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>{t('templates.cancel')}</Button>
              <Button onClick={handleSubmit}>{editingId ? t('templates.save') : t('templates.create')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((tpl) => (
          <Card key={tpl.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <Badge variant="secondary" className="text-sm font-medium">{tpl.name}</Badge>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline">{t(`common.${tpl.channelType}`) || tpl.channelType}</Badge>
                <Button size="icon" variant="ghost" onClick={() => openEdit(tpl)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(tpl.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {tpl.subject && (
                <p className="text-sm mb-1">
                  <span className="text-muted-foreground">{t('templates.subjectLabel')}</span> {tpl.subject}
                </p>
              )}
              <p className="text-sm text-muted-foreground line-clamp-3">{tpl.body}</p>
            </CardContent>
          </Card>
        ))}

        {templates.length === 0 && (
          <Card className="col-span-full">
            <CardContent>
              <EmptyState title={t('templates.empty')} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
