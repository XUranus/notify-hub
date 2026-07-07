import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useTranslation } from '@/lib/i18n'
import {
  TestTube, Loader2, CheckCircle, XCircle, AlertTriangle,
} from 'lucide-react'

interface SmtpPreset {
  id: string
  name: string
  host: string
  port: number
  secure: boolean
  description: string
}

interface FormData {
  type: string
  name: string
  host: string
  port: string
  secure: boolean
  username: string
  password: string
  fromAddress: string
  fromName: string
}

interface TestResult {
  connected: boolean
  error?: string
}

export interface ChannelFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingId: string | null
  formData: FormData
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
  errors: Record<string, string>
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>
  apiError: string
  setApiError: React.Dispatch<React.SetStateAction<string>>
  selectedPreset: string
  setSelectedPreset: React.Dispatch<React.SetStateAction<string>>
  testResult: TestResult | null
  setTestResult: React.Dispatch<React.SetStateAction<TestResult | null>>
  testingConfig: boolean
  creating: boolean
  saving: boolean
  smtpPresets: SmtpPreset[]
  canCreateOrSave: boolean
  onTestConfig: () => void
  onCreate: () => void
  onUpdate: () => void
  onClose: () => void
  onPresetChange: (presetId: string) => void
  onResetTest: () => void
}

export function ChannelFormDialog({
  open, onOpenChange, editingId, formData, setFormData,
  errors, setErrors, apiError, selectedPreset,
  testResult, testingConfig, creating, saving,
  smtpPresets, canCreateOrSave,
  onTestConfig, onCreate, onUpdate, onClose, onPresetChange, onResetTest,
}: ChannelFormDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? t('channels.editChannel') : t('channels.new')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {apiError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {apiError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('channels.type')}</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={formData.type}
                onChange={(e) => { setFormData({ ...formData, type: e.target.value }); onResetTest() }}
                disabled={!!editingId}
              >
                <option value="email">{t('channels.typeEmail')}</option>
                <option value="sms">{t('channels.typeSms')}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t('channels.name')}</Label>
              <Input
                maxLength={32}
                className={errors.name ? 'border-destructive' : ''}
                value={formData.name}
                onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setErrors((p) => ({ ...p, name: '' })); onResetTest() }}
                placeholder={t('channels.namePlaceholder')}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
          </div>
          {formData.type === 'email' && (
            <>
              <div className="space-y-2">
                <Label>{t('channels.preset')}</Label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {smtpPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onPresetChange(preset.id)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all text-left ${
                        selectedPreset === preset.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-input bg-background hover:border-primary/50 hover:bg-accent'
                      }`}
                    >
                      <div className="font-semibold text-xs">{preset.name}</div>
                      {preset.id !== 'custom' && (
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{preset.host}</div>
                      )}
                    </button>
                  ))}
                </div>
                {selectedPreset !== 'custom' && (
                  <p className="text-xs text-muted-foreground">
                    {smtpPresets.find((p) => p.id === selectedPreset)?.description}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t('channels.host')}</Label>
                  <Input className={errors.host ? 'border-destructive' : ''} value={formData.host}
                    onChange={(e) => { setFormData({ ...formData, host: e.target.value }); setErrors((p) => ({ ...p, host: '' })); onResetTest() }}
                    placeholder={t('channels.hostPlaceholder')} />
                  {errors.host && <p className="text-xs text-destructive">{errors.host}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{t('channels.port')}</Label>
                  <Input className={errors.port ? 'border-destructive' : ''} value={formData.port}
                    onChange={(e) => { setFormData({ ...formData, port: e.target.value }); setErrors((p) => ({ ...p, port: '' })); onResetTest() }}
                    placeholder={t('channels.portPlaceholder')} />
                  {errors.port && <p className="text-xs text-destructive">{errors.port}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{t('channels.fromAddress')}</Label>
                  <Input className={errors.fromAddress ? 'border-destructive' : ''} value={formData.fromAddress}
                    onChange={(e) => { setFormData({ ...formData, fromAddress: e.target.value }); setErrors((p) => ({ ...p, fromAddress: '' })); onResetTest() }}
                    placeholder={t('channels.fromPlaceholder')} />
                  {errors.fromAddress && <p className="text-xs text-destructive">{errors.fromAddress}</p>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t('channels.username')}</Label>
                  <Input className={errors.username ? 'border-destructive' : ''} value={formData.username}
                    onChange={(e) => { setFormData({ ...formData, username: e.target.value }); setErrors((p) => ({ ...p, username: '' })); onResetTest() }}
                    placeholder={
                      selectedPreset === 'sendgrid' ? 'apikey' :
                      selectedPreset === 'gmail' ? 'your@gmail.com' :
                      selectedPreset === 'outlook' ? 'your@outlook.com' : ''
                    } />
                  {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
                </div>
                <div className="space-y-2">
                  <Label>
                    {t('channels.password')}
                    {editingId && <span className="text-xs text-muted-foreground ml-1">({t('channels.passwordOptional')})</span>}
                  </Label>
                  <Input className={errors.password ? 'border-destructive' : ''} type="password" value={formData.password}
                    onChange={(e) => { setFormData({ ...formData, password: e.target.value }); setErrors((p) => ({ ...p, password: '' })); onResetTest() }}
                    placeholder={
                      editingId ? t('channels.passwordKeep') :
                      selectedPreset === 'gmail' ? t('channels.appPassword') :
                      selectedPreset === 'qq' || selectedPreset === '163' || selectedPreset === '126' ? t('channels.authCode') : ''
                    } />
                  {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{t('channels.secure')}</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={formData.secure ? 'true' : 'false'}
                    onChange={(e) => { setFormData({ ...formData, secure: e.target.value === 'true' }); onResetTest() }}>
                    <option value="true">SSL (465)</option>
                    <option value="false">STARTTLS (587)</option>
                  </select>
                </div>
              </div>
            </>
          )}
          {testResult && (
            <div className={`rounded-md border px-4 py-3 text-sm flex items-center gap-2 ${
              testResult.connected
                ? 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400'
                : 'border-destructive/50 bg-destructive/10 text-destructive'
            }`}>
              {testResult.connected
                ? <><CheckCircle className="h-4 w-4" /> {t('channels.testPassed')}</>
                : <><XCircle className="h-4 w-4" /> {testResult.error || t('channels.testFailed')}</>}
            </div>
          )}
        </div>
        <DialogFooter>
          <div className="flex gap-2 w-full">
            <Button variant="outline" onClick={onTestConfig} disabled={testingConfig}>
              {testingConfig
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />{t('channels.testingConnection')}</>
                : <><TestTube className="h-4 w-4 mr-1" />{t('channels.testConnection')}</>}
            </Button>
            {canCreateOrSave && (
              editingId
                ? <Button onClick={onUpdate} disabled={saving}>{saving ? t('channels.saving') : t('channels.save')}</Button>
                : <Button onClick={onCreate} disabled={creating}>{creating ? t('channels.creating') : t('channels.create')}</Button>
            )}
            <Button variant="ghost" onClick={onClose} className="ml-auto">{t('channels.cancel')}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
