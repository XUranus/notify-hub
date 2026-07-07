import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTranslation } from '@/lib/i18n'
import { pushApi } from '@/lib/api'
import { osLabels, type PushClient } from '@/lib/push-clients'
import { toDate } from '@/lib/utils'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle, Loader2 } from 'lucide-react'

export interface QrPairingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  qrData: { serverUrl: string; jwt: string; editable?: boolean } | null
  onRegistered: (client: PushClient, allClients: PushClient[]) => void
}

export function QrPairingDialog({ open, onOpenChange, qrData, onRegistered }: QrPairingDialogProps) {
  const { t } = useTranslation()
  const [registeredClient, setRegisteredClient] = useState<PushClient | null>(null)
  const [serverUrl, setServerUrl] = useState(qrData?.serverUrl || '')

  useEffect(() => {
    if (qrData) setServerUrl(qrData.serverUrl)
  }, [qrData])

  // Reset registered client when dialog closes
  useEffect(() => {
    if (!open) setRegisteredClient(null)
  }, [open])

  // Poll for new client registration while dialog is open
  useEffect(() => {
    if (!open || registeredClient) return

    const knownUuidsRef = new Set<string>()
    const openTime = Date.now()

    // Snapshot existing clients
    pushApi.listClients().then((res) => {
      if (res.success && res.data) {
        res.data.forEach((c: PushClient) => knownUuidsRef.add(c.uuid))
      }
    })

    const timer = setInterval(async () => {
      const res = await pushApi.listClients()
      if (!res.success || !res.data) return
      const matchedClient = res.data.find((c: PushClient) =>
        !knownUuidsRef.has(c.uuid) ||
        (c.lastSeenAt && toDate(c.lastSeenAt).getTime() > openTime - 5000)
      )
      if (matchedClient) {
        setRegisteredClient(matchedClient)
        onRegistered(matchedClient, res.data)
        clearInterval(timer)
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [open, registeredClient, onRegistered])

  const handleClose = () => {
    onOpenChange(false)
    setRegisteredClient(null)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('channels.qrTitle')}</DialogTitle>
        </DialogHeader>
        {registeredClient ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle className="h-6 w-6" />
              <span className="text-lg font-semibold">{t('channels.qrRegistered')}</span>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              {t('channels.qrRegisteredHint')}
            </p>
            <div className="w-full rounded-lg border bg-muted/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">UUID</span><span className="font-mono text-xs">{registeredClient.uuid.slice(0, 12)}...</span></div>
              {registeredClient.name && <div className="flex justify-between"><span className="text-muted-foreground">{t('push.colName')}</span><span>{registeredClient.name}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">{t('push.colOs')}</span><span>{osLabels[registeredClient.os] || registeredClient.os}</span></div>
              {registeredClient.arch && <div className="flex justify-between"><span className="text-muted-foreground">{t('push.colArch')}</span><span>{registeredClient.arch}</span></div>}
              {registeredClient.appVersion && <div className="flex justify-between"><span className="text-muted-foreground">{t('push.colVersion')}</span><span>{registeredClient.appVersion}</span></div>}
            </div>
            <Button className="w-full" onClick={handleClose}>
              {t('channels.cancel')}
            </Button>
          </div>
        ) : qrData && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground text-center">
              {t('channels.qrScanHint')}
            </p>
            <div className="w-full space-y-3">
              <div className="space-y-1">
                <Label>{t('channels.qrServerUrl')}</Label>
                <Input
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="font-mono text-xs"
                  placeholder="http://192.168.x.x:9527"
                />
                {qrData.editable && (
                  <p className="text-xs text-amber-600">
                    {t('channels.qrLocalhostHint')}
                  </p>
                )}
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">JWT</span>
                <span className="font-mono text-xs">{qrData.jwt.slice(0, 20)}...</span>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg">
              <QRCodeSVG
                value={JSON.stringify({ serverUrl, jwt: qrData.jwt })}
                size={200}
                level="M"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('channels.qrWaitingScan')}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
