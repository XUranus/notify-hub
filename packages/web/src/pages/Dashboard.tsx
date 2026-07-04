import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { statsApi, messagesApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { formatDate } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Mail,
  ArrowRight,
  Smartphone,
  Send,
} from 'lucide-react'

// ── Types ──

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

interface ChannelCount {
  channel: string
  count: number
}

interface RecentMessage {
  id: string
  channelType: string
  toAddress: string
  subject: string | null
  status: string
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

const CHANNEL_COLORS: Record<string, string> = {
  push: 'hsl(var(--primary))',
  email: 'hsl(var(--chart-2, 210 100% 50%))',
  sms: 'hsl(var(--chart-3, 160 60% 45%))',
}

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  push: Smartphone,
  email: Mail,
  sms: Send,
}

// ── Custom Tooltip ──

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover border rounded-md shadow-sm px-3 py-2 text-xs">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium tabular-nums">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Dashboard ──

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [dailyData, setDailyData] = useState<DailyCount[]>([])
  const [channelData, setChannelData] = useState<ChannelCount[]>([])
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([])
  const [failedMessages, setFailedMessages] = useState<RecentMessage[]>([])
  const [failedTotal, setFailedTotal] = useState(0)
  const { t } = useTranslation()
  const navigate = useNavigate()

  useEffect(() => {
    statsApi.overview().then((res) => {
      if (res.success) setStats(res.data)
    })
    statsApi.daily().then((res) => {
      if (res.success && res.data) {
        setDailyData(res.data.map((d: DailyCount) => ({
          ...d,
          date: d.date.slice(5),
        })))
      }
    })
    statsApi.channels().then((res) => {
      if (res.success && res.data) setChannelData(res.data)
    })
    statsApi.recent().then((res) => {
      if (res.success && res.data) setRecentMessages(res.data)
    })
    messagesApi.list({ page: 1, pageSize: 10, status: 'failed' }).then((res) => {
      if (res.success && res.data) {
        setFailedMessages(res.data.items || [])
        setFailedTotal(res.data.total || 0)
      }
    })
  }, [])

  const statItems = [
    { label: t('dashboard.total'), value: stats?.totalMessages, icon: MessageSquare, color: 'text-foreground' },
    { label: t('dashboard.sent'), value: stats?.sentMessages, icon: CheckCircle, color: 'text-emerald-600' },
    { label: t('dashboard.failed'), value: stats?.failedMessages, icon: XCircle, color: 'text-destructive' },
    { label: t('dashboard.queued'), value: stats?.queuedMessages, icon: Clock, color: 'text-amber-600' },
    { label: t('dashboard.successRate'), value: stats ? `${stats.successRate}%` : undefined, icon: TrendingUp, color: 'text-foreground' },
    { label: t('dashboard.last24h'), value: stats?.messagesLast24h, icon: Mail, color: 'text-foreground' },
  ]

  return (
    <div>
      <h2 className="text-3xl font-bold tracking-tight mb-6">{t('dashboard.title')}</h2>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {statItems.map((item) => {
          const Icon = item.icon
          return (
            <Card key={item.label} className="transition-shadow hover:shadow-md">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex items-center justify-center h-9 w-9 rounded-md bg-muted shrink-0">
                  <Icon className={`h-4 w-4 ${item.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{item.label}</p>
                  <p className="text-lg font-semibold tabular-nums">{item.value ?? '—'}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        {/* Daily Trend */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium mb-4">{t('dashboard.dailyTrend')}</h3>
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="sent" stroke="hsl(var(--primary))" strokeWidth={1.5} fill="url(#gradSent)" name={t('dashboard.sent')} />
                  <Area type="monotone" dataKey="failed" stroke="hsl(var(--destructive))" strokeWidth={1.5} fill="url(#gradFailed)" name={t('dashboard.failed')} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title={t('dashboard.noData')} />
            )}
          </CardContent>
        </Card>

        {/* Channel Distribution */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium mb-4">{t('dashboard.channelDistribution')}</h3>
            {channelData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={channelData}
                      dataKey="count"
                      nameKey="channel"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      strokeWidth={2}
                      stroke="hsl(var(--card))"
                    >
                      {channelData.map((entry) => (
                        <Cell key={entry.channel} fill={CHANNEL_COLORS[entry.channel] || 'hsl(var(--muted))'} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-5 mt-2">
                  {channelData.map((entry) => (
                    <div key={entry.channel} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full" style={{ background: CHANNEL_COLORS[entry.channel] || 'hsl(var(--muted))' }} />
                      <span className="text-muted-foreground capitalize">{entry.channel}</span>
                      <span className="font-medium tabular-nums">{entry.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState title={t('dashboard.noData')} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Messages Table */}
      <Card className="mt-6">
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {t('dashboard.recentMessages')}
            </h3>
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => navigate('/messages')}>
              {t('dashboard.viewAll')} <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colChannel')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colTo')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colSubject')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colStatus')}</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colCreated')}</th>
              </tr>
            </thead>
            <tbody>
              {recentMessages.length > 0 ? recentMessages.map((msg) => {
                const Icon = CHANNEL_ICONS[msg.channelType] || MessageSquare
                return (
                  <tr key={msg.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2 text-xs">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0" title={msg.channelType}>
                        <Icon className="h-3 w-3" />
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs max-w-[180px] truncate">{msg.toAddress}</td>
                    <td className="px-4 py-2 text-xs max-w-[200px] truncate text-muted-foreground">{msg.subject || '—'}</td>
                    <td className="px-4 py-2 text-xs">
                      <Badge variant={statusVariant[msg.status] || 'secondary'} className="text-[10px] px-1.5 py-0">
                        {t(`status.${msg.status}`) || msg.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(msg.createdAt)}</td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={5}>
                    <EmptyState title={t('dashboard.noData')} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Failed Messages Table */}
      {failedTotal > 0 && (
        <Card className="mt-4">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                {t('dashboard.failedMessages')}
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{failedTotal}</Badge>
              </h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">ID</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colChannel')}</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colTo')}</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colSubject')}</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">{t('messages.colCreated')}</th>
                </tr>
              </thead>
              <tbody>
                {failedMessages.map((msg) => {
                  const FailIcon = CHANNEL_ICONS[msg.channelType] || MessageSquare
                  return (
                  <tr key={msg.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{msg.id.slice(0, 8)}</td>
                    <td className="px-4 py-2 text-xs">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0" title={msg.channelType}>
                        <FailIcon className="h-3 w-3" />
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs max-w-[180px] truncate">{msg.toAddress}</td>
                    <td className="px-4 py-2 text-xs max-w-[200px] truncate text-muted-foreground">{msg.subject || '—'}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(msg.createdAt)}</td>
                  </tr>
                )})}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
