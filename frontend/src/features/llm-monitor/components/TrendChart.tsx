import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TsPoint } from '../lib/api'

function shortLabel(ts: string): string {
  // hour 桶: "YYYY-MM-DDThh" (len 13) -> "hh:00"；day 桶: "YYYY-MM-DD" -> "MM-DD"
  if (ts.length >= 13) return `${ts.slice(11)}:00`
  return ts.slice(5)
}

export function TrendChart({ points }: { points: TsPoint[] }) {
  const data = points.map((p) => ({ label: shortLabel(p.ts), full: p.ts, value: p.value }))

  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-[var(--color-muted-foreground)]">
        暂无数据
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="llmTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--color-border)' }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={(_, payload) => (payload?.[0]?.payload?.full as string) ?? ''}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--color-primary)"
          strokeWidth={2}
          fill="url(#llmTrendFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
