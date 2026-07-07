import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { tokensApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { Plus, Copy, Check, Trash2, Key, Code2, RotateCw, Timer } from 'lucide-react'
import { formatDate, toDate, copyToClipboard } from '@/lib/utils'
import { CodeBlock } from '@/components/ui/code-block'

interface Token {
  id: number
  name: string
  token: string
  scopes: string[]
  rateLimit: number
  enabled: boolean
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

function getBaseUrl() {
  return window.location.protocol + '//' + window.location.host
}

function buildExamples(token: string) {
  const base = getBaseUrl()

  const curlSend = `curl -X POST ${base}/api/v1/send \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "channel": "email",
    "to": "user@example.com",
    "subject": "Hello from NotifyHub",
    "body": "<h1>Welcome!</h1><p>This is a test notification.</p>"
  }'`

  const curlSendResp = `{
  "success": true,
  "data": {
    "messageId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "queued"
  }
}`

  const curlStatus = `# 查询消息状态
curl ${base}/api/v1/messages/550e8400-e29b-41d4-a716-446655440000 \\
  -H "Authorization: Bearer ${token}"`

  const curlStatusResp = `{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "channel": "email",
    "to": "user@example.com",
    "subject": "Hello from NotifyHub",
    "status": "delivered",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}`

  const jsSend = `const response = await fetch("${base}/api/v1/send", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${token}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    channel: "email",
    to: "user@example.com",
    subject: "Hello from NotifyHub",
    body: "<h1>Welcome!</h1>",
  }),
});

const result = await response.json();
console.log(result);
// { success: true, data: { messageId: 1, status: "queued" } }`

  const jsTemplate = `// 使用模板发送
const response = await fetch("${base}/api/v1/send", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${token}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    channel: "email",
    to: "user@example.com",
    template: "order_shipped",
    variables: {
      order_id: "12345",
      name: "John",
    },
  }),
});`

  const pySend = `import requests

url = "${base}/api/v1/send"
headers = {
    "Authorization": "Bearer ${token}",
    "Content-Type": "application/json",
}
data = {
    "channel": "email",
    "to": "user@example.com",
    "subject": "Hello from NotifyHub",
    "body": "<h1>Welcome!</h1>",
}

response = requests.post(url, json=data, headers=headers)
print(response.json())
# {"success": true, "data": {"messageId": 1, "status": "queued"}}`

  const pyTemplate = `import requests

# 使用模板发送
url = "${base}/api/v1/send"
headers = {
    "Authorization": "Bearer ${token}",
    "Content-Type": "application/json",
}
data = {
    "channel": "email",
    "to": "user@example.com",
    "template": "order_shipped",
    "variables": {
        "order_id": "12345",
        "name": "John",
    },
}

response = requests.post(url, json=data, headers=headers)
print(response.json())`

  return { curlSend, curlSendResp, curlStatus, curlStatusResp, jsSend, jsTemplate, pySend, pyTemplate }
}

function ApiExamples({ token }: { token: string }) {
  const { t } = useTranslation()
  const ex = buildExamples(token)

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code2 className="h-5 w-5" />
          {t('tokens.example')}
        </CardTitle>
        <CardDescription>{t('tokens.exampleDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="curl" className="space-y-4">
          <TabsList>
            <TabsTrigger value="curl">{t('tokens.exampleCurl')}</TabsTrigger>
            <TabsTrigger value="js">{t('tokens.exampleJs')}</TabsTrigger>
            <TabsTrigger value="python">{t('tokens.examplePython')}</TabsTrigger>
          </TabsList>

          {/* ── cURL ── */}
          <TabsContent value="curl" className="space-y-6">
            <div>
              <h4 className="text-sm font-medium mb-2">{t('tokens.exampleSend')}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Request</p>
                  <CodeBlock code={ex.curlSend} language="bash" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Response</p>
                  <CodeBlock code={ex.curlSendResp} language="json" />
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">{t('tokens.exampleStatus')}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Request</p>
                  <CodeBlock code={ex.curlStatus} language="bash" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Response</p>
                  <CodeBlock code={ex.curlStatusResp} language="json" />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── JavaScript ── */}
          <TabsContent value="js" className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">{t('tokens.exampleSend')}</h4>
              <CodeBlock code={ex.jsSend} language="javascript" />
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">{t('templates.title')}</h4>
              <CodeBlock code={ex.jsTemplate} language="javascript" />
            </div>
          </TabsContent>

          {/* ── Python ── */}
          <TabsContent value="python" className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">{t('tokens.exampleSend')}</h4>
              <CodeBlock code={ex.pySend} language="python" />
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">{t('templates.title')}</h4>
              <CodeBlock code={ex.pyTemplate} language="python" />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function ExpirationBadge({ expiresAt, t }: { expiresAt: string | null; t: (k: string) => string }) {
  if (!expiresAt) {
    return <span className="text-xs text-muted-foreground">{t('tokens.never')}</span>
  }
  const isExpired = toDate(expiresAt) < new Date()
  if (isExpired) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        {t('tokens.expired')}
      </span>
    )
  }
  return (
    <span className="text-xs text-muted-foreground">
      {toDate(expiresAt).toLocaleDateString()}
    </span>
  )
}

export default function Tokens() {
  const { t } = useTranslation()
  const [tokens, setTokens] = useState<Token[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    scopes: ['email', 'sms', 'push'],
    rateLimit: '100',
    expiresIn: 'never' as string,
  })
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    tokensApi.list().then((res) => {
      if (res.success) setTokens(res.data || [])
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    const result = await tokensApi.create({
      name: formData.name,
      scopes: formData.scopes,
      rateLimit: parseInt(formData.rateLimit),
      expiresIn: formData.expiresIn,
    })

    if (result.success && result.data) {
      setShowForm(false)
      setFormData({ name: '', scopes: ['email', 'sms', 'push'], rateLimit: '100', expiresIn: 'never' })
      load()
    }
  }

  const handleDelete = async (id: number) => {
    if (confirm(t('tokens.revokeConfirm'))) {
      await tokensApi.delete(id)
      load()
    }
  }

  const handleRotate = async (id: number) => {
    if (!confirm(t('tokens.rotateConfirm'))) return
    const result = await tokensApi.rotate(id)
    if (result.success) {
      load()
    }
  }

  const copyToken = async (id: number, token: string) => {
    const ok = await copyToClipboard(token)
    if (ok) {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  // Use the first enabled token for examples
  const exampleToken = tokens.find((t) => t.enabled)?.token || tokens[0]?.token

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold tracking-tight">{t('tokens.title')}</h2>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('tokens.create')}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">{t('tokens.name')}</Label>
                <Input
                  className="h-9 w-40"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('tokens.namePlaceholder')}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('tokens.rateLimit')}</Label>
                <Input
                  className="h-9 w-24"
                  value={formData.rateLimit}
                  onChange={(e) => setFormData({ ...formData, rateLimit: e.target.value })}
                  placeholder={t('tokens.rateLimitPlaceholder')}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('tokens.scopes')}</Label>
                <div className="flex gap-3 h-9 items-center">
                  {['email', 'sms', 'push'].map((ch) => (
                    <label key={ch} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={formData.scopes.includes(ch)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, scopes: [...formData.scopes, ch] })
                          } else {
                            setFormData({
                              ...formData,
                              scopes: formData.scopes.filter((s) => s !== ch),
                            })
                          }
                        }}
                      />
                      {t(`common.${ch}`)}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('tokens.expiresIn')}</Label>
                <Select value={formData.expiresIn} onValueChange={(v) => setFormData({ ...formData, expiresIn: v })}>
                  <SelectTrigger className="h-9 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1d">{t('tokens.expires1d')}</SelectItem>
                    <SelectItem value="7d">{t('tokens.expires7d')}</SelectItem>
                    <SelectItem value="30d">{t('tokens.expires30d')}</SelectItem>
                    <SelectItem value="365d">{t('tokens.expires365d')}</SelectItem>
                    <SelectItem value="never">{t('tokens.never')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="h-9" onClick={handleCreate}>{t('tokens.create')}</Button>
              <Button className="h-9" variant="outline" onClick={() => setShowForm(false)}>{t('tokens.cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b">
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{t('tokens.name')}</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Key</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">{t('messages.colActions')}</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{t('tokens.scopes')}</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{t('tokens.expiresAt')}</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">{t('tokens.lastUsed')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="border-b">
                    <td className="px-3 py-2"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-5 w-48" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-6 w-16 ml-auto" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-5 w-16" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-5 w-24" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-28" /></td>
                  </tr>
                ))
              ) : (
                <>
                  {tokens.map((tok) => (
                    <tr key={tok.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <Key className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium text-sm">{tok.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="font-mono text-[11px] max-w-[280px] truncate">
                            {tok.token}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 shrink-0"
                            onClick={() => copyToken(tok.id, tok.token)}
                            title={t('tokens.copy')}
                          >
                            {copiedId === tok.id ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <div className="flex justify-end gap-0.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                            onClick={() => handleRotate(tok.id)}
                            title={t('tokens.rotate')}
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(tok.id)}
                            title={t('tokens.revokeConfirm')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <ExpirationBadge expiresAt={tok.expiresAt} t={t} />
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex gap-1">
                          {tok.scopes.map((s) => (
                            <Badge key={s} variant="outline" className="text-[11px]">{t(`common.${s}`) || s}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {tok.expiresAt ? formatDate(tok.expiresAt) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {tok.lastUsedAt ? formatDate(tok.lastUsedAt) : '—'}
                      </td>
                    </tr>
                  ))}
                  {tokens.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState title={t('tokens.empty')} />
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* API Examples */}
      {exampleToken && <ApiExamples token={exampleToken} />}
    </div>
  )
}
