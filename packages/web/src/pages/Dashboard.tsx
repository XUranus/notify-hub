import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { statsApi, messagesApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { formatDate } from '@/lib/utils'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Mail,
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
} from 'lucide-react'

interface Stats {
  totalMessages: number
  sentMessages: number
  failedMessages: number
  queuedMessages: number
  successRate: number
  messagesLast24h: number
  messagesLast7d: number
}

interface DailyCount {
  date: string
  total: number
  sent: number
  failed: number
}

interface Message {
  id: string
  channelType: string
  channelName: string | null
  toAddress: string
  subject: string | null
  status: string
  errorMessage: string | null
  createdAt: string
}

const statusVariant: Record<string, 'default' | 'success' | 'destructive' | 'warning' | 'secondary'> = {
  queued: 'warning',
  sending: 'default',
  sent: 'success',
  delivered: 'success',
  failed: 'destructive',
  dead: 'destructive',
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [dailyData, setDailyData] = useState<DailyCount[]>([])
  const [failedMessages, setFailedMessages] = useState<Message[]>([])
  const [failedTotal, setFailedTotal] = useState(0)
  const [failedPage, setFailedPage] = useState(1)
  const { t } = useTranslation()

  useEffect(() => {
    statsApi.overview().then((res) => {
      if (res.success) setStats(res.data)
    })
    statsApi.daily().then((res) => {
      if (res.success && res.data) {
        setDailyData(res.data.map((d: DailyCount) => ({
          ...d,
          date: d.date.slice(5), // "MM-DD"
        })))
      }
    })
  }, [])

  useEffect(() => {
    if (stats && stats.failedMessages > 0) {
      loadFailedMessages()
    }
  }, [stats, failedPage])

  const loadFailedMessages = () => {
    messagesApi.list({ page: failedPage, pageSize: 5, status: 'failed' }).then((res) => {
      if (res.success && res.data) {
        setFailedMessages(res.data.items || [])
        setFailedTotal(res.data.total || 0)
      }
    })
  }

  const statItems = [
    { label: t('dashboard.total'), value: stats?.totalMessages, icon: MessageSquare, color: 'text-blue-600' },
    { label: t('dashboard.sent'), value: stats?.sentMessages, icon: CheckCircle, color: 'text-green-600' },
    { label: t('dashboard.failed'), value: stats?.failedMessages, icon: XCircle, color: 'text-red-600' },
    { label: t('dashboard.queued'), value: stats?.queuedMessages, icon: Clock, color: 'text-yellow-600' },
    { label: t('dashboard.successRate'), value: stats ? `${stats.successRate}%` : undefined, icon: TrendingUp, color: 'text-emerald-600' },
    { label: t('dashboard.last24h'), value: stats?.messagesLast24h, icon: Mail, color: 'text-purple-600' },
  ]

  return (
    <div>
      <h2 className="text-3xl font-bold tracking-tight mb-6">{t('dashboard.title')}</h2>

      {/* Stats Row */}
      <div className="grid grid-cols-6 gap-3">
        {statItems.map((item) => {
          const Icon = item.icon
          return (
            <Card key={item.label}>
              <CardContent className="p-3 flex items-center gap-3">
                <Icon className={`h-5 w-5 ${item.color} shrink-0`} />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{item.label}</p>
                  <p className="text-lg font-bold">{item.value ?? '—'}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Daily Chart */}
      <Card className="mt-6">
        <CardContent className="p-4">
          <h3 className="text-sm font-medium mb-4">{t('dashboard.dailyTrend')}</h3>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dailyData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value: number, name: string) => [value, name === 'sent' ? t('dashboard.sent') : name === 'failed' ? t('dashboard.failed') : t('dashboard.total')]}
                />
                <Bar dataKey="sent" fill="#22c55e" radius={[2, 2, 0, 0]} name="sent" />
                <Bar dataKey="failed" fill="#ef4444" radius={[2, 2, 0, 0]} name="failed" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">{t('dashboard.noData')}</p>
          )}
        </CardContent>
      </Card>

      {/* Failed Messages Table */}
      {stats && stats.failedMessages > 0 && (
        <Card className="mt-6">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                {t('dashboard.failedMessages')} ({failedTotal})
              </h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">ID</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colChannel')}</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colTo')}</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colSubject')}</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.errorMessage')}</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colCreated')}</th>
                </tr>
              </thead>
              <tbody>
                {failedMessages.map((msg) => (
                  <tr key={msg.id} className="border-b hover:bg-muted/50">
                    <td className="px-4 py-1.5 text-xs font-mono">{msg.id}</td>
                    <td className="px-4 py-1.5 text-xs">
                      <Badge variant="outline" className="text-xs">
                        {msg.channelName || t(`common.${msg.channelType}`) || msg.channelType}
                      </Badge>
                    </td>
                    <td className="px-4 py-1.5 text-xs max-w-[150px] truncate">{msg.toAddress}</td>
                    <td className="px-4 py-1.5 text-xs max-w-[150px] truncate">{msg.subject || '—'}</td>
                    <td className="px-4 py-1.5 text-xs text-destructive max-w-[200px] truncate">{msg.errorMessage || '—'}</td>
                    <td className="px-4 py-1.5 text-xs text-muted-foreground">{formatDate(msg.createdAt)}</td>
                  </tr>
                ))}
                {failedMessages.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground text-xs">
                      {t('messages.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {failedTotal > 5 && (
              <div className="flex items-center justify-between px-4 py-2 border-t">
                <span className="text-xs text-muted-foreground">
                  {t('messages.pageInfo', { page: failedPage, total: Math.ceil(failedTotal / 5) })}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={failedPage <= 1} onClick={() => setFailedPage(failedPage - 1)}>
                    {t('messages.prev')}
                  </Button>
                  <Button variant="outline" size="sm" disabled={failedPage >= Math.ceil(failedTotal / 5)} onClick={() => setFailedPage(failedPage + 1)}>
                    {t('messages.next')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
