import { useEffect, useState } from 'react'
import { http } from '@/lib/api'
import { useConfirm } from '@/components/ui/confirm-dialog'

interface VisitorInput {
  name: string
  phone: string
  company: string
  companyAddr: string
  email: string
  purpose: string
}

interface SimilarRecord {
  company: string | null
  identity: string | null
  relationship: string | null
  score: number
  source: string | null
  confidence: number | null
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
  similar?: SimilarRecord[]
}

interface CustomerRef {
  id: number
  custId: number | null
  custName: string | null
  keyword: string | null
  brandName: string | null
  custType: string | null
  custCategory: string | null
  bizMajor: string | null
  province: string | null
  city: string | null
  district: string | null
  custAddr: string | null
  checkinAddr: string | null
  lng: number | null
  lat: number | null
  level: string | null
  custProperty: string | null
  creator: string | null
  note: string | null
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

// 客户新增申请表样例用例。company/companyAddr 是去重比对的主信号，purpose 暂塞关键字/类别等
// 申请表附加信息（当前表单没有独立字段）。expect 标注期望的去重结论，便于核对引擎行为。
interface ApplyCase {
  label: string
  expect: string
  tone: 'reject' | 'pass' | 'review'
  input: VisitorInput
}

const APPLY_CASES: ApplyCase[] = [
  {
    label: '成塔服饰（原样重报）',
    expect: '疑似重复 · 命中 32172',
    tone: 'reject',
    input: {
      name: '白国侬', phone: '', company: '深圳成塔服饰',
      companyAddr: '广东省深圳市罗湖区鹏基工业区703栋西面402号',
      email: '', purpose: '客户新增申请 · 关键字:成塔 · 品牌/女装/服装',
    },
  },
  {
    label: '成塔写法变体',
    expect: '疑似重复 · 名称变体+同址',
    tone: 'reject',
    input: {
      name: '业务员A', phone: '', company: '成塔服装(深圳)有限公司',
      companyAddr: '广东省深圳市罗湖区鹏基工业区703栋西面402号1栋',
      email: '', purpose: '客户新增申请 · 女装/服装',
    },
  },
  {
    label: '谭飞服饰（同楼盘）',
    expect: '疑似重复 · 命中 30992',
    tone: 'reject',
    input: {
      name: '业务员B', phone: '', company: '深圳谭飞服饰',
      companyAddr: '广东省深圳市罗湖区鹏兴路2号鹏基工业区706栋',
      email: '', purpose: '客户新增申请 · 关键字:谭飞 · 女装/服装',
    },
  },
  {
    label: '雅理服饰（龙岗）',
    expect: '疑似重复 · 命中 31845',
    tone: 'reject',
    input: {
      name: '业务员C', phone: '', company: '雅理服饰',
      companyAddr: '广东省深圳市龙岗区平湖镇禾花岭路2号2楼',
      email: '', purpose: '客户新增申请 · 关键字:雅理 · 女装/服装',
    },
  },
  {
    label: '鹏基同楼新公司',
    expect: '不重复 · 地址近但另一家',
    tone: 'review',
    input: {
      name: '业务员D', phone: '', company: '深圳市鹏基纺织贸易行',
      companyAddr: '广东省深圳市罗湖区鹏基工业区705栋',
      email: '', purpose: '客户新增申请 · 关键字:鹏基纺织 · 贸易商二批/面料',
    },
  },
  {
    label: '全新客户（广州）',
    expect: '不重复 · 应通过',
    tone: 'pass',
    input: {
      name: '业务员E', phone: '', company: '广州花都靓彩制衣厂',
      companyAddr: '广东省广州市花都区狮岭镇前进路18号',
      email: '', purpose: '客户新增申请 · 关键字:靓彩 · 供应链/工厂/服装',
    },
  },
]

const CASE_TONE: Record<ApplyCase['tone'], string> = {
  reject: 'border-red-300 text-red-700 hover:bg-red-50',
  pass: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
  review: 'border-amber-300 text-amber-700 hover:bg-amber-50',
}

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
  const [customers, setCustomers] = useState<CustomerRef[]>([])
  const [sidecarOnline, setSidecarOnline] = useState<boolean | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const confirm = useConfirm()
  const [custSearch, setCustSearch] = useState('')
  const [custPage, setCustPage] = useState(0)
  const [custCollapsed, setCustCollapsed] = useState(false)

  const loadRecent = () => {
    http<VerdictView[]>('/visitor-analysis/verdicts?limit=20')
      .then(setRecent)
      .catch(() => setRecent([]))
  }

  useEffect(() => {
    loadRecent()
    http<CustomerRef[]>('/visitor-analysis/customer-refs')
      .then(setCustomers)
      .catch(() => setCustomers([]))
    http<{ online: boolean }>('/visitor-analysis/sidecar-health')
      .then((r) => setSidecarOnline(r.online))
      .catch(() => setSidecarOnline(false))
  }, [])

  const update = (k: keyof VisitorInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const analyze = async (input: VisitorInput = form) => {
    setAnalyzing(true)
    setError(null)
    setResult(null)
    try {
      const v = await http<VerdictView>('/visitor-analysis/analyze-sync', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      setResult(v)
      loadRecent()
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析失败')
    } finally {
      setAnalyzing(false)
    }
  }

  // 一键把历史客户资料库全量 embed 后写入 Qdrant 向量库，供灰区语义召回。
  const syncVector = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const r = await http<{ ok: boolean; total: number; indexed: number; failed: number; message?: string }>(
        '/visitor-analysis/customer-refs/sync-vector',
        { method: 'POST' },
      )
      if (!r.ok) {
        setSyncMsg(r.message || '同步失败')
      } else {
        setSyncMsg(
          `已同步 ${r.indexed}/${r.total} 条到向量库` +
            (r.failed ? `，失败 ${r.failed} 条（检查嵌入模型 Ollama bge-m3 与 Qdrant 是否可用）` : ''),
        )
      }
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : '同步失败')
    } finally {
      setSyncing(false)
    }
  }

  // 一键清空判别历史（判别记录 + 人工纠正 + 访客台账），参照库/竞品不动。
  const clearVerdicts = async () => {
    const ok = await confirm({
      title: '清空最近判别',
      description: '将删除全部判别记录、人工纠正与访客台账（历史客户资料库不受影响）。此操作不可撤销，确定继续？',
      confirmText: '清空',
      variant: 'destructive',
    })
    if (!ok) return
    setClearing(true)
    try {
      await http<{ cleared: number }>('/visitor-analysis/verdicts', { method: 'DELETE' })
      setRecent([])
      setResult(null)
    } catch {
      /* 失败保持原列表，下次刷新自愈 */
    } finally {
      setClearing(false)
    }
  }

  // 选择申请表用例：回填表单 + 直接发起分析（用例本身做入参，避免读到未刷新的 form state）。
  const runCase = (c: ApplyCase) => {
    setForm(c.input)
    void analyze(c.input)
  }

  // 历史客户资料库：客户端模糊匹配（客户名称 / 客户地址）+ 分页（每页 20）。
  const CUST_PAGE_SIZE = 20
  const custQuery = custSearch.trim().toLowerCase()
  const custFiltered = custQuery
    ? customers.filter(
        (c) =>
          (c.custName ?? '').toLowerCase().includes(custQuery) ||
          (c.custAddr ?? '').toLowerCase().includes(custQuery),
      )
    : customers
  const custPageCount = Math.max(1, Math.ceil(custFiltered.length / CUST_PAGE_SIZE))
  const custPageSafe = Math.min(custPage, custPageCount - 1)
  const custPaged = custFiltered.slice(
    custPageSafe * CUST_PAGE_SIZE,
    custPageSafe * CUST_PAGE_SIZE + CUST_PAGE_SIZE,
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
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

      <section className="space-y-2 rounded-lg border bg-muted/30 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">客户新增申请表用例</h2>
          <span className="text-xs text-muted-foreground">点选即回填表单并分析</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {APPLY_CASES.map((c) => (
            <button
              key={c.label}
              disabled={analyzing}
              onClick={() => runCase(c)}
              title={c.expect}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${CASE_TONE[c.tone]}`}
            >
              {c.label}
              <span className="ml-1.5 font-normal opacity-70">· {c.expect}</span>
            </button>
          ))}
        </div>
      </section>

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
            onClick={() => analyze()}
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
          {result.similar && result.similar.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                向量召回的相似历史记录（喂给 AI 作判别参考，按相似度可信度排序）
              </div>
              <ul className="space-y-1">
                {result.similar.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-11 shrink-0 text-right font-medium tabular-nums text-emerald-600">
                      {(s.score * 100).toFixed(0)}%
                    </span>
                    <span className="font-medium">{s.company || '—'}</span>
                    <span className="text-muted-foreground">
                      {s.source === 'customer' ? '客户库' : '历史访客'}
                      {s.identity && ` · ${IDENTITY_LABEL[s.identity] ?? s.identity}`}
                      {s.relationship && s.relationship !== 'NONE' &&
                        ` / ${RELATIONSHIP_LABEL[s.relationship] ?? s.relationship}`}
                      {s.confidence != null && ` · 原判 ${(s.confidence * 100).toFixed(0)}%`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
            onClick={() => setCustCollapsed((v) => !v)}
            title={custCollapsed ? '展开' : '折叠'}
          >
            <span className="text-[10px]">{custCollapsed ? '▶' : '▼'}</span>
            历史客户资料库（去重检索底库）
          </button>
          <div className="flex items-center gap-3">
            <button
              className="rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-50"
              disabled={syncing || customers.length === 0}
              onClick={syncVector}
              title="把全部客户资料 embed 后写入 Qdrant 向量库，供灰区语义召回"
            >
              {syncing ? '同步中…' : '一键同步至向量库'}
            </button>
            <span className="text-xs text-muted-foreground">
              {custQuery ? `${custFiltered.length} / ${customers.length} 条` : `${customers.length} 条`}
            </span>
          </div>
        </div>

        {!custCollapsed && (
          <>
            <p className="text-xs text-muted-foreground">
              镜像原系统「客户资料」。客户新增申请会按关键字 / 名称 / 地址 / 经纬度与这些记录比对，判定是否重复客户。
            </p>
            {syncMsg && <p className="text-xs text-emerald-600">{syncMsg}</p>}
            <input
              value={custSearch}
              onChange={(e) => {
                setCustSearch(e.target.value)
                setCustPage(0)
              }}
              placeholder="模糊搜索：客户名称 / 客户地址"
              className="w-full max-w-sm rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="whitespace-nowrap p-2">custId</th>
                    <th className="whitespace-nowrap p-2">客户名称</th>
                    <th className="whitespace-nowrap p-2">关键字</th>
                    <th className="whitespace-nowrap p-2">类别</th>
                    <th className="whitespace-nowrap p-2">省/市/区</th>
                    <th className="p-2">客户地址</th>
                    <th className="whitespace-nowrap p-2">经纬度</th>
                    <th className="whitespace-nowrap p-2">等级</th>
                    <th className="whitespace-nowrap p-2">创建人</th>
                  </tr>
                </thead>
                <tbody>
                  {custFiltered.length === 0 && (
                    <tr>
                      <td className="p-3 text-muted-foreground" colSpan={9}>
                        {customers.length === 0 ? '暂无客户资料' : '无匹配记录'}
                      </td>
                    </tr>
                  )}
                  {custPaged.map((c) => (
                    <tr key={c.id} className="border-t align-top">
                      <td className="whitespace-nowrap p-2 text-muted-foreground">{c.custId ?? '—'}</td>
                      <td className="whitespace-nowrap p-2 font-medium">{c.custName || '—'}</td>
                      <td className="whitespace-nowrap p-2">{c.keyword || '—'}</td>
                      <td className="whitespace-nowrap p-2 text-muted-foreground">{c.custCategory || '—'}</td>
                      <td className="whitespace-nowrap p-2 text-muted-foreground">
                        {[c.province, c.city, c.district].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td className="p-2 text-muted-foreground">{c.custAddr || '—'}</td>
                      <td className="whitespace-nowrap p-2 text-xs text-muted-foreground">
                        {c.lng != null && c.lat != null ? `${c.lng.toFixed(5)}, ${c.lat.toFixed(5)}` : '—'}
                      </td>
                      <td className="whitespace-nowrap p-2 text-muted-foreground">{c.level || '—'}</td>
                      <td className="whitespace-nowrap p-2 text-muted-foreground">{c.creator || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {custFiltered.length > CUST_PAGE_SIZE && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  第 {custPageSafe * CUST_PAGE_SIZE + 1}–
                  {Math.min((custPageSafe + 1) * CUST_PAGE_SIZE, custFiltered.length)} 条，共{' '}
                  {custFiltered.length} 条
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-md border px-2 py-1 transition hover:bg-muted disabled:opacity-40"
                    disabled={custPageSafe <= 0}
                    onClick={() => setCustPage(custPageSafe - 1)}
                  >
                    上一页
                  </button>
                  <span>
                    {custPageSafe + 1} / {custPageCount}
                  </span>
                  <button
                    className="rounded-md border px-2 py-1 transition hover:bg-muted disabled:opacity-40"
                    disabled={custPageSafe >= custPageCount - 1}
                    onClick={() => setCustPage(custPageSafe + 1)}
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">最近判别</h2>
          <button
            className="rounded-md border px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
            disabled={clearing || recent.length === 0}
            onClick={clearVerdicts}
            title="清空全部判别记录 / 人工纠正 / 访客台账（历史客户资料库不受影响）"
          >
            {clearing ? '清空中…' : '清空'}
          </button>
        </div>
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
