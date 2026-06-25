import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
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
  companyAddr: string | null
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
  syncedAt: number | null
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

// 子路由路径：入口重定向到 analyze；各 Tab 独立路径，便于侧边栏外直达 / 收藏。
export const VA_BASE = '/tools/visitor-analysis'
export const VA_ANALYZE = `${VA_BASE}/analyze`
export const VA_CUSTOMERS = `${VA_BASE}/customers`
export const VA_VERDICTS = `${VA_BASE}/verdicts`

const TABS: { path: string; label: string }[] = [
  { path: VA_ANALYZE, label: '访客分析' },
  { path: VA_CUSTOMERS, label: '客户资料库' },
  { path: VA_VERDICTS, label: '判别记录' },
]

/** 顶部 Tab 切换条：各表单/列表作为同一工具下的二级页面，路由切换、各自保留滚动位置。 */
function VaTabs() {
  const { pathname } = useLocation()
  const active = pathname.startsWith(VA_CUSTOMERS)
    ? VA_CUSTOMERS
    : pathname.startsWith(VA_VERDICTS)
      ? VA_VERDICTS
      : VA_ANALYZE
  return (
    <div className="flex gap-1 border-b">
      {TABS.map((t) => (
        <Link
          key={t.path}
          to={t.path}
          className={
            'border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
            (active === t.path
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground')
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}

/** 访客分析 Tab：客户新增申请表单 + 用例 + 判别结果 + 最近判别列表。 */
function AnalyzePanel() {
  const [form, setForm] = useState<VisitorInput>(EMPTY)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<VerdictView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vectorReady, setVectorReady] = useState<boolean | null>(null)

  useEffect(() => {
    http<{ online: boolean }>('/visitor-analysis/sidecar-health')
      .then((r) => setVectorReady(r.online))
      .catch(() => setVectorReady(false))
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
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析失败')
    } finally {
      setAnalyzing(false)
    }
  }

  // 选择申请表用例：回填表单 + 直接发起分析（用例本身做入参，避免读到未刷新的 form state）。
  const runCase = (c: ApplyCase) => {
    setForm(c.input)
    void analyze(c.input)
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        确定性匹配优先（客户库 / 竞品名单命中即定），灰区交 LangChain4j 判别。
        {vectorReady === false && (
          <span className="ml-2 text-amber-600">· 向量召回未就绪，灰区判别将不带历史相似客户参考</span>
        )}
        {vectorReady === true && <span className="ml-2 text-emerald-600">· 向量召回在线</span>}
      </p>

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
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 inline-block w-11 shrink-0 text-right font-medium tabular-nums text-emerald-600">
                      {(s.score * 100).toFixed(0)}%
                    </span>
                    <div className="min-w-0">
                      <div>
                        <span className="font-medium">{s.company || '—'}</span>
                        <span className="ml-2 text-muted-foreground">
                          {s.source === 'customer' ? '客户库' : '历史访客'}
                          {s.identity && ` · ${IDENTITY_LABEL[s.identity] ?? s.identity}`}
                          {s.relationship && s.relationship !== 'NONE' &&
                            ` / ${RELATIONSHIP_LABEL[s.relationship] ?? s.relationship}`}
                          {s.confidence != null && ` · 原判 ${(s.confidence * 100).toFixed(0)}%`}
                        </span>
                      </div>
                      <div className="text-muted-foreground">地址：{s.companyAddr || '—'}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

/** 判别记录 Tab：按姓名/公司、身份、是否待复核查询判别历史，支持清空。 */
function VerdictsPanel() {
  const [rows, setRows] = useState<VerdictView[]>([])
  const [loading, setLoading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const confirm = useConfirm()
  // 查询条件（受控）：关键字、身份枚举、复核态。
  const [q, setQ] = useState('')
  const [identity, setIdentity] = useState('')
  const [review, setReview] = useState<'all' | 'review' | 'confirmed'>('all')
  const [limit, setLimit] = useState(50)

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (q.trim()) params.set('q', q.trim())
    if (identity) params.set('identity', identity)
    if (review !== 'all') params.set('needsReview', review === 'review' ? 'true' : 'false')
    http<VerdictView[]>(`/visitor-analysis/verdicts?${params.toString()}`)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }

  // 首次加载默认列表；条件变化由用户点「查询」触发，避免每次输入都打后端。
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    setQ('')
    setIdentity('')
    setReview('all')
    setLimit(50)
  }

  // 一键清空判别历史（判别记录 + 人工纠正 + 访客台账），参照库/竞品不动。
  const clearVerdicts = async () => {
    const ok = await confirm({
      title: '清空判别记录',
      description: '将删除全部判别记录、人工纠正与访客台账（历史客户资料库不受影响）。此操作不可撤销，确定继续？',
      confirmText: '清空',
      variant: 'destructive',
    })
    if (!ok) return
    setClearing(true)
    try {
      await http<{ cleared: number }>('/visitor-analysis/verdicts', { method: 'DELETE' })
      setRows([])
    } catch {
      /* 失败保持原列表，下次查询自愈 */
    } finally {
      setClearing(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">判别记录</h2>
        <button
          className="rounded-md border px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
          disabled={clearing || rows.length === 0}
          onClick={clearVerdicts}
          title="清空全部判别记录 / 人工纠正 / 访客台账（历史客户资料库不受影响）"
        >
          {clearing ? '清空中…' : '清空'}
        </button>
      </div>

      {/* 查询条件：关键字 + 身份 + 复核态 + 条数；回车或点「查询」触发。 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load() }}
          placeholder="模糊搜索：姓名 / 公司"
          className="w-full max-w-xs rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <select
          value={identity}
          onChange={(e) => setIdentity(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          title="按身份过滤"
        >
          <option value="">全部身份</option>
          {Object.entries(IDENTITY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={review}
          onChange={(e) => setReview(e.target.value as 'all' | 'review' | 'confirmed')}
          className="rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          title="按复核状态过滤"
        >
          <option value="all">全部状态</option>
          <option value="review">仅待复核</option>
          <option value="confirmed">仅已确认</option>
        </select>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          title="返回条数上限"
        >
          {[20, 50, 100, 200, 500].map((n) => (
            <option key={n} value={n}>最多 {n} 条</option>
          ))}
        </select>
        <button
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          disabled={loading}
          onClick={load}
        >
          {loading ? '查询中…' : '查询'}
        </button>
        <button
          className="rounded-md border px-3 py-1.5 text-sm transition hover:bg-muted"
          onClick={reset}
        >
          重置
        </button>
        <span className="text-xs text-muted-foreground">{rows.length} 条</span>
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
              <th className="whitespace-nowrap p-2">时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={6}>
                  {loading ? '查询中…' : '无匹配记录'}
                </td>
              </tr>
            )}
            {rows.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="p-2">{v.name || '—'}</td>
                <td className="p-2">{v.company || '—'}</td>
                <td className="p-2">
                  {identityText(v)}
                  {v.needsReview && <span className="ml-1 text-amber-600">·待确认</span>}
                </td>
                <td className="p-2">{(v.confidence * 100).toFixed(0)}%</td>
                <td className="p-2 text-muted-foreground">{decidedByText(v.decidedBy)}</td>
                <td className="whitespace-nowrap p-2 text-xs text-muted-foreground">
                  {new Date(v.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** 客户资料库 Tab：去重检索底库的搜索 / 过滤 / 分页 + 向量库同步运维。 */
function CustomersPanel() {
  const [customers, setCustomers] = useState<CustomerRef[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [clearingVec, setClearingVec] = useState(false)
  const confirm = useConfirm()
  const [custSearch, setCustSearch] = useState('')
  const [custPage, setCustPage] = useState(0)
  const [custSyncFilter, setCustSyncFilter] = useState<'all' | 'synced' | 'unsynced'>('all')

  const loadCustomers = () => {
    http<CustomerRef[]>('/visitor-analysis/customer-refs')
      .then(setCustomers)
      .catch(() => setCustomers([]))
  }

  useEffect(loadCustomers, [])

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
        loadCustomers()
      }
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : '同步失败')
    } finally {
      setSyncing(false)
    }
  }

  // 清空向量库已同步的客户资料（Qdrant va_customers）；清完可重新「一键同步」灌入。
  const clearVector = async () => {
    const ok = await confirm({
      title: '清空向量库客户资料',
      description:
        '将删除已同步进向量库（Qdrant va_customers）的全部客户向量。下方「历史客户资料库」表格（SQLite）不受影响，可随后点「一键同步至向量库」重新灌入。确定继续？',
      confirmText: '清空',
      variant: 'destructive',
    })
    if (!ok) return
    setClearingVec(true)
    setSyncMsg(null)
    try {
      const r = await http<{ ok?: boolean; before?: number; after?: number; message?: string }>(
        '/visitor-analysis/vector/customers',
        { method: 'DELETE' },
      )
      setSyncMsg(
        r.ok
          ? `已清空向量库客户资料（${r.before ?? '?'} → ${r.after ?? 0} 条），可重新一键同步`
          : r.message || '清空失败',
      )
      if (r.ok) loadCustomers()
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : '清空失败')
    } finally {
      setClearingVec(false)
    }
  }

  // 新增/编辑弹窗：editing=null 关闭；'new' 新增；CustomerRef 编辑。
  const [editing, setEditing] = useState<CustomerRef | 'new' | null>(null)
  const [saving, setSaving] = useState(false)

  // 删除一条客户资料（按主键 id）。
  const removeCustomer = async (c: CustomerRef) => {
    const ok = await confirm({
      title: '删除客户资料',
      description: `将从去重底库删除《${c.custName || '未命名'}》。若已同步进向量库，建议删除后重新「一键同步」。确定继续？`,
      confirmText: '删除',
      variant: 'destructive',
    })
    if (!ok) return
    try {
      await http<{ deleted: number }>(`/visitor-analysis/customer-refs/${c.id}`, { method: 'DELETE' })
      loadCustomers()
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : '删除失败')
    }
  }

  // 保存新增/编辑：归一化键由后端 Normalizer 现算，前端只传业务字段。
  const saveCustomer = async (form: CustomerRefForm) => {
    setSaving(true)
    try {
      const body = JSON.stringify(toRequest(form))
      if (editing === 'new') {
        await http<CustomerRef>('/visitor-analysis/customer-refs', { method: 'POST', body })
      } else if (editing) {
        await http<CustomerRef>(`/visitor-analysis/customer-refs/${editing.id}`, { method: 'PUT', body })
      }
      setEditing(null)
      loadCustomers()
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 历史客户资料库：客户端模糊匹配（客户名称 / 客户地址）+ 分页（每页 20）。
  const CUST_PAGE_SIZE = 20
  const custQuery = custSearch.trim().toLowerCase()
  const custFiltered = customers.filter((c) => {
    if (custSyncFilter === 'synced' && c.syncedAt == null) return false
    if (custSyncFilter === 'unsynced' && c.syncedAt != null) return false
    if (!custQuery) return true
    return (
      (c.custName ?? '').toLowerCase().includes(custQuery) ||
      (c.custAddr ?? '').toLowerCase().includes(custQuery)
    )
  })
  const custPageCount = Math.max(1, Math.ceil(custFiltered.length / CUST_PAGE_SIZE))
  const custPageSafe = Math.min(custPage, custPageCount - 1)
  const custPaged = custFiltered.slice(
    custPageSafe * CUST_PAGE_SIZE,
    custPageSafe * CUST_PAGE_SIZE + CUST_PAGE_SIZE,
  )

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">历史客户资料库（去重检索底库）</h2>
        <div className="flex items-center gap-3">
          <button
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
            onClick={() => setEditing('new')}
            title="人工新增一条客户资料到去重底库"
          >
            新增客户
          </button>
          <button
            className="rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-50"
            disabled={syncing || customers.length === 0}
            onClick={syncVector}
            title="把全部客户资料 embed 后写入 Qdrant 向量库，供灰区语义召回"
          >
            {syncing ? '同步中…' : '一键同步至向量库'}
          </button>
          <button
            className="rounded-md border px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
            disabled={clearingVec}
            onClick={clearVector}
            title="清空向量库 va_customers 已同步的客户资料；底库表格不受影响，可重新同步"
          >
            {clearingVec ? '清空中…' : '清空向量库'}
          </button>
          <span className="text-xs text-muted-foreground">
            {custFiltered.length !== customers.length
              ? `${custFiltered.length} / ${customers.length} 条`
              : `${customers.length} 条`}
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        镜像原系统「客户资料」。客户新增申请会按关键字 / 名称 / 地址 / 经纬度与这些记录比对，判定是否重复客户。
      </p>
      {syncMsg && <p className="text-xs text-emerald-600">{syncMsg}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={custSearch}
          onChange={(e) => {
            setCustSearch(e.target.value)
            setCustPage(0)
          }}
          placeholder="模糊搜索：客户名称 / 客户地址"
          className="w-full max-w-sm rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <select
          value={custSyncFilter}
          onChange={(e) => {
            setCustSyncFilter(e.target.value as 'all' | 'synced' | 'unsynced')
            setCustPage(0)
          }}
          className="rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          title="按是否已同步至向量库过滤"
        >
          <option value="all">全部</option>
          <option value="synced">已同步向量库</option>
          <option value="unsynced">未同步</option>
        </select>
      </div>
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
              <th className="whitespace-nowrap p-2">向量库</th>
              <th className="whitespace-nowrap p-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {custFiltered.length === 0 && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={11}>
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
                <td className="whitespace-nowrap p-2">
                  {c.syncedAt != null ? (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">已同步</span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">未同步</span>
                  )}
                </td>
                <td className="whitespace-nowrap p-2 text-right">
                  <button
                    className="rounded-md border px-2 py-1 text-xs transition hover:bg-muted"
                    onClick={() => setEditing(c)}
                  >
                    编辑
                  </button>
                  <button
                    className="ml-1.5 rounded-md border px-2 py-1 text-xs text-destructive transition hover:bg-destructive/10"
                    onClick={() => removeCustomer(c)}
                  >
                    删除
                  </button>
                </td>
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

      {editing && (
        <CustomerRefEditor
          initial={editing === 'new' ? null : editing}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={saveCustomer}
        />
      )}
    </section>
  )
}

/**
 * 访客分析工具页外壳：顶部 Tab 在「访客分析 / 客户资料库 / 判别记录」三个二级页面间切换。
 * 四条路由（入口重定向 + 三个 Tab）共用本组件，按 pathname 决定渲染哪个面板。
 */
export function VisitorAnalysisPage() {
  const { pathname } = useLocation()
  const panel = pathname.startsWith(VA_CUSTOMERS)
    ? <CustomersPanel />
    : pathname.startsWith(VA_VERDICTS)
      ? <VerdictsPanel />
      : <AnalyzePanel />
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold">访客分析</h1>
        <VaTabs />
      </header>
      {panel}
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

// ── 客户资料新增/编辑 ──────────────────────────────────────────────────────────

// 表单态：全字符串，便于受控输入；数值字段（custId/lng/lat）保存时再解析。
interface CustomerRefForm {
  custId: string
  custName: string
  keyword: string
  brandName: string
  custType: string
  custCategory: string
  bizMajor: string
  province: string
  city: string
  district: string
  custAddr: string
  checkinAddr: string
  lng: string
  lat: string
  level: string
  custProperty: string
  creator: string
  note: string
}

const EMPTY_FORM: CustomerRefForm = {
  custId: '', custName: '', keyword: '', brandName: '', custType: '', custCategory: '',
  bizMajor: '', province: '', city: '', district: '', custAddr: '', checkinAddr: '',
  lng: '', lat: '', level: '', custProperty: '', creator: '', note: '',
}

function formFrom(c: CustomerRef): CustomerRefForm {
  const s = (v: string | number | null) => (v == null ? '' : String(v))
  return {
    custId: s(c.custId), custName: s(c.custName), keyword: s(c.keyword), brandName: s(c.brandName),
    custType: s(c.custType), custCategory: s(c.custCategory), bizMajor: s(c.bizMajor),
    province: s(c.province), city: s(c.city), district: s(c.district), custAddr: s(c.custAddr),
    checkinAddr: s(c.checkinAddr), lng: s(c.lng), lat: s(c.lat), level: s(c.level),
    custProperty: s(c.custProperty), creator: s(c.creator), note: s(c.note),
  }
}

// 表单 → 后端 CustomerRefRequest：空串转 null，数值字段解析；归一化键由后端算，不传。
function toRequest(f: CustomerRefForm) {
  const t = (v: string) => { const x = v.trim(); return x === '' ? null : x }
  const num = (v: string) => { const x = v.trim(); if (x === '') return null; const n = Number(x); return Number.isFinite(n) ? n : null }
  return {
    custId: num(f.custId), custName: t(f.custName), keyword: t(f.keyword), brandName: t(f.brandName),
    custType: t(f.custType), custCategory: t(f.custCategory), bizMajor: t(f.bizMajor),
    province: t(f.province), city: t(f.city), district: t(f.district), custAddr: t(f.custAddr),
    checkinAddr: t(f.checkinAddr), lng: num(f.lng), lat: num(f.lat), level: t(f.level),
    custProperty: t(f.custProperty), creator: t(f.creator), note: t(f.note),
  }
}

/** 客户资料新增/编辑弹窗。initial=null 为新增。归一化键由后端 Normalizer 现算，前端不碰。 */
function CustomerRefEditor(props: {
  initial: CustomerRef | null
  saving: boolean
  onCancel: () => void
  onSave: (form: CustomerRefForm) => void
}) {
  const [form, setForm] = useState<CustomerRefForm>(() =>
    props.initial ? formFrom(props.initial) : EMPTY_FORM,
  )
  const set = (k: keyof CustomerRefForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={props.onCancel}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-base font-semibold">{props.initial ? '编辑客户资料' : '新增客户资料'}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="客户名称" value={form.custName} onChange={set('custName')} />
          <Field label="关键字 / 简称" value={form.keyword} onChange={set('keyword')} />
          <Field label="公司(品牌)名称" value={form.brandName} onChange={set('brandName')} />
          <Field label="custId（原系统主键，可空）" value={form.custId} onChange={set('custId')} />
          <Field label="客户类型" value={form.custType} onChange={set('custType')} />
          <Field label="客户类别" value={form.custCategory} onChange={set('custCategory')} />
          <Field label="经营大类" value={form.bizMajor} onChange={set('bizMajor')} />
          <Field label="客户等级" value={form.level} onChange={set('level')} />
          <Field label="省" value={form.province} onChange={set('province')} />
          <Field label="市" value={form.city} onChange={set('city')} />
          <Field label="区" value={form.district} onChange={set('district')} />
          <Field label="客户属性" value={form.custProperty} onChange={set('custProperty')} />
          <div className="sm:col-span-2">
            <Field label="客户地址（门牌级，去重地址轴主输入）" value={form.custAddr} onChange={set('custAddr')} />
          </div>
          <div className="sm:col-span-2">
            <Field label="打卡地址" value={form.checkinAddr} onChange={set('checkinAddr')} />
          </div>
          <Field label="经度 lng" value={form.lng} onChange={set('lng')} />
          <Field label="纬度 lat" value={form.lat} onChange={set('lat')} />
          <Field label="创建人" value={form.creator} onChange={set('creator')} />
          <Field label="备注" value={form.note} onChange={set('note')} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          归一化匹配键（名称 / 关键字 / 地址）由后端统一计算，无需手填；保存后该记录在向量库的同步标记会重置，需重新「一键同步」。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-md border px-4 py-2 text-sm transition hover:bg-muted disabled:opacity-50"
            onClick={props.onCancel}
            disabled={props.saving}
          >
            取消
          </button>
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            onClick={() => props.onSave(form)}
            disabled={props.saving || form.custName.trim() === ''}
            title={form.custName.trim() === '' ? '客户名称必填' : undefined}
          >
            {props.saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
