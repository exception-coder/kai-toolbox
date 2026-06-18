import { useEffect, useState } from 'react'
import { http } from '@/lib/api'

interface VisitorInput {
  name: string
  phone: string
  company: string
  companyAddr: string
  email: string
  purpose: string
}

interface VerdictView {
  id: number
  visitorId: number | null
  name: string | null
  company: string | null
  identity: string
  relationship: string
  confidence: number
  decidedBy: string
  rationale: string | null
  evidenceJson: string | null
  model: string | null
  needsReview: boolean
  createdAt: number
}

const IDENTITY_LABEL: Record<string, string> = {
  CUSTOMER: '客户',
  COMPETITOR: '竞争对手',
  VENDOR: '供应商',
  PARTNER: '合作伙伴',
  JOB_SEEKER: '求职者',
  OFFICIAL: '政府/监管/媒体',
  UNKNOWN: '无法识别',
}
const RELATIONSHIP_LABEL: Record<string, string> = {
  NEW: '新客',
  EXISTING: '熟客',
  CHURNED: '流失客户',
  NONE: '',
}

const EMPTY: VisitorInput = { name: '', phone: '', company: '', companyAddr: '', email: '', purpose: '' }

function identityText(v: VerdictView): string {
  const id = IDENTITY_LABEL[v.identity] ?? v.identity
  const rel = RELATIONSHIP_LABEL[v.relationship]
  return rel ? `${id} · ${rel}` : id
}

function decidedByText(by: string): string {
  if (by.startsWith('rule:')) return '确定性规则'
  if (by === 'llm') return 'AI 判别'
  return '降级/待确认'
}

export function VisitorAnalysisPage() {
  const [form, setForm] = useState<VisitorInput>(EMPTY)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<VerdictView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<VerdictView[]>([])
  const [sidecarOnline, setSidecarOnline] = useState<boolean | null>(null)

  const loadRecent = () => {
    http<VerdictView[]>('/visitor-analysis/verdicts?limit=20')
      .then(setRecent)
      .catch(() => setRecent([]))
  }

  useEffect(() => {
    loadRecent()
    http<{ online: boolean }>('/visitor-analysis/sidecar-health')
      .then((r) => setSidecarOnline(r.online))
      .catch(() => setSidecarOnline(false))
  }, [])

  const update = (k: keyof VisitorInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const analyze = async () => {
    setAnalyzing(true)
    setError(null)
    setResult(null)
    try {
      const v = await http<VerdictView>('/visitor-analysis/analyze-sync', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setResult(v)
      loadRecent()
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析失败')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">访客分析</h1>
        <p className="text-sm text-muted-foreground">
          确定性匹配优先（客户库 / 竞品名单命中即定），灰区交 AgentScope 判别。
          {sidecarOnline === false && (
            <span className="ml-2 text-amber-600">· AgentScope sidecar 未在线，灰区将待人工确认</span>
          )}
          {sidecarOnline === true && <span className="ml-2 text-emerald-600">· sidecar 在线</span>}
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-2">
        <Field label="姓名" value={form.name} onChange={update('name')} />
        <Field label="手机号" value={form.phone} onChange={update('phone')} />
        <Field label="公司" value={form.company} onChange={update('company')} />
        <Field label="公司地址" value={form.companyAddr} onChange={update('companyAddr')} />
        <Field label="邮箱（建议补充）" value={form.email} onChange={update('email')} />
        <Field label="来访目的（建议补充）" value={form.purpose} onChange={update('purpose')} />
        <div className="sm:col-span-2">
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            disabled={analyzing}
            onClick={analyze}
          >
            {analyzing ? '分析中…' : '分析访客'}
          </button>
        </div>
      </section>

      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {result && (
        <section className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-medium">{identityText(result)}</div>
            <div className="text-sm text-muted-foreground">
              置信度 {(result.confidence * 100).toFixed(0)}% · {decidedByText(result.decidedBy)}
              {result.needsReview && <span className="ml-2 text-amber-600">· 待人工确认</span>}
            </div>
          </div>
          {result.rationale && <p className="mt-2 text-sm">{result.rationale}</p>}
          {result.model && <p className="mt-1 text-xs text-muted-foreground">模型：{result.model}</p>}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">最近判别</h2>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2">姓名</th>
                <th className="p-2">公司</th>
                <th className="p-2">判别</th>
                <th className="p-2">置信度</th>
                <th className="p-2">来源</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={5}>
                    暂无记录
                  </td>
                </tr>
              )}
              {recent.map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="p-2">{v.name || '—'}</td>
                  <td className="p-2">{v.company || '—'}</td>
                  <td className="p-2">
                    {identityText(v)}
                    {v.needsReview && <span className="ml-1 text-amber-600">·待确认</span>}
                  </td>
                  <td className="p-2">{(v.confidence * 100).toFixed(0)}%</td>
                  <td className="p-2 text-muted-foreground">{decidedByText(v.decidedBy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Field(props: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{props.label}</span>
      <input
        className="rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        value={props.value}
        onChange={props.onChange}
      />
    </label>
  )
}
