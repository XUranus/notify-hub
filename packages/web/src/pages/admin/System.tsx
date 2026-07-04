import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTranslation } from '@/lib/i18n'
import { systemSettingsApi } from '@/lib/api'
import { HardDrive, CheckCircle } from 'lucide-react'

export default function AdminSystem() {
  const { t } = useTranslation()
  const [maxFileSize, setMaxFileSize] = useState(1048576)
  const [maxTotalSize, setMaxTotalSize] = useState(10485760)
  const [maxMessages, setMaxMessages] = useState(1000)
  const [cleanupInterval, setCleanupInterval] = useState(60)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    systemSettingsApi.get().then((res) => {
      if (res.success && res.data) {
        setMaxFileSize(res.data.attachmentMaxFileSize)
        setMaxTotalSize(res.data.attachmentMaxTotalSize)
        setMaxMessages(res.data.maxMessagesPerUser)
        setCleanupInterval(res.data.cleanupIntervalMinutes)
      }
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    const res = await systemSettingsApi.update({
      attachmentMaxFileSize: maxFileSize,
      attachmentMaxTotalSize: maxTotalSize,
      maxMessagesPerUser: maxMessages,
      cleanupIntervalMinutes: cleanupInterval,
    })
    setSaving(false)
    if (res.success) setSaved(true)
  }

  return (
    <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            {t('settings.uploadLimits.title')}
          </CardTitle>
          <CardDescription>{t('settings.uploadLimits.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label>{t('settings.uploadLimits.maxFileSize')}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={Math.round(maxFileSize / 1024)}
                onChange={(e) => setMaxFileSize(Number(e.target.value) * 1024)}
                min={1}
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">KB</span>
            </div>
            <p className="text-xs text-muted-foreground">{t('settings.uploadLimits.maxFileSizeHint')}</p>
          </div>
          <div className="space-y-2">
            <Label>{t('settings.uploadLimits.maxTotalSize')}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={Math.round(maxTotalSize / (1024 * 1024))}
                onChange={(e) => setMaxTotalSize(Number(e.target.value) * 1024 * 1024)}
                min={1}
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">MB</span>
            </div>
            <p className="text-xs text-muted-foreground">{t('settings.uploadLimits.maxTotalSizeHint')}</p>
          </div>
          <div className="space-y-2">
            <Label>{t('settings.uploadLimits.maxMessages')}</Label>
            <Input
              type="number"
              value={maxMessages}
              onChange={(e) => setMaxMessages(Number(e.target.value))}
              min={1}
            />
            <p className="text-xs text-muted-foreground">{t('settings.uploadLimits.maxMessagesHint')}</p>
          </div>
          <div className="space-y-2">
            <Label>{t('settings.uploadLimits.cleanupInterval')}</Label>
            <Select value={String(cleanupInterval)} onValueChange={(v) => { setCleanupInterval(Number(v)); setSaved(false) }}>
              <SelectTrigger className="w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">{t('settings.uploadLimits.interval5min')}</SelectItem>
                <SelectItem value="60">{t('settings.uploadLimits.interval1h')}</SelectItem>
                <SelectItem value="720">{t('settings.uploadLimits.interval12h')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('settings.uploadLimits.cleanupIntervalHint')}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t('common.loading') : t('settings.uploadLimits.save')}
            </Button>
            {saved && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" /> {t('settings.uploadLimits.saved')}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
  )
}
