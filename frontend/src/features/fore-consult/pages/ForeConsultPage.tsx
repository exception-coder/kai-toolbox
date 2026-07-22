import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3, Boxes, BrainCircuit, Briefcase, Contact, Eye, EyeOff, Factory, Handshake, History,
  Landmark, Loader2, Radar, Route, Save, Send, Server, ShoppingBag, ShoppingCart, SlidersHorizontal,
  Trash2, Truck, Users, Warehouse, Waypoints, X, type LucideIcon,
} from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useChatRuntime } from '@/features/claude-chat/runtime/ChatRuntimeContext'
import type { ChatItem } from '@/features/claude-chat/types'
import {
  archiveConsult,
  deleteConsult,
  fetchProjectModules,
  linkDevSession,
  listConsults,
  analyzeTopology,
  getTopology,
  listSystemPrefs,
  listWorkspaces,
  saveSystemPrefs,
  startConsult,
  type ArchiveTurnItem,
  type ConsultSessionView,
  type SaveSystemPrefItem,
  type TopoLink,
} from '../api'
import '../styles/space.css'

/**
 * 业务域分类：决定球体配色 + 图例分组（同一业务域同色，便于把星图读成有组织的系统地图）。
 * 具体域在前、通用兜底在后；每个系统仍保留自己的独立图标（见 SYSTEM_ICONS），只是按域着色。
 */
interface Category { key: string; label: string; color: string; kw: string[] }
const CATEGORIES: Category[] = [
  { key: 'supply', label: '供应链 / 采购', color: '#34d399', kw: ['SRM', 'SCM', 'WMS', 'TMS', '供应', '采购', '供应商', '寻源', '物流', '仓储', '仓库', '库存', '配送'] },
  { key: 'manufacture', label: '生产制造', color: '#fb923c', kw: ['MES', 'PLM', '生产', '制造', '车间', '工单', '排产'] },
  { key: 'sales', label: '销售 / 客户', color: '#f472b6', kw: ['CRM', 'POS', 'OMS', '客户', '会员', '销售', '商城', '电商', '订单', '零售', '门店', '门市'] },
  { key: 'finance', label: '财务 / 资金', color: '#fbbf24', kw: ['FICO', 'FMS', '财务', '会计', '资金', '结算', '费用', '账'] },
  { key: 'hr', label: '人力 / 行政', color: '#a78bfa', kw: ['HR', 'HCM', '人力', '人事', '薪酬', '招聘', 'OA', '办公', '审批', '流程', '协同'] },
  { key: 'data', label: '数据 / 智能', color: '#818cf8', kw: ['BI', 'AI', '报表', '数据', '分析', '看板', '大屏', '智能', '大脑', '算法', '模型'] },
  { key: 'erp', label: 'ERP / 中台', color: '#60a5fa', kw: ['ERP', '中台', '平台'] },
]
const OTHER_CATEGORY: Category = { key: 'other', label: '其他系统', color: '#94a3b8', kw: [] }

function categoryOf(name: string, label: string): Category {
  const hay = `${name} ${label}`.toUpperCase()
  return CATEGORIES.find((c) => c.kw.some((k) => hay.includes(k.toUpperCase()))) ?? OTHER_CATEGORY
}

// 经典业务系统 → 贴合图标（按名/别名关键词命中，具体在前，兜底通用 Server）。
const SYSTEM_ICONS: Array<{ kw: string[]; Icon: LucideIcon }> = [
  { kw: ['SRM', '供应商', '寻源', '采购协同'], Icon: Handshake },
  { kw: ['SCM', '供应链'], Icon: Truck },
  { kw: ['WMS', '仓储', '仓库', '库存'], Icon: Warehouse },
  { kw: ['MES', '制造', '生产', '车间', '工单'], Icon: Factory },
  { kw: ['TMS', '运输', '物流', '配送'], Icon: Route },
  { kw: ['CRM', '客户', '会员'], Icon: Contact },
  { kw: ['ERP'], Icon: Boxes },
  { kw: ['OA', '办公', '协同', '审批', '流程'], Icon: Briefcase },
  { kw: ['HR', 'HCM', '人力', '人事', '招聘', '薪酬'], Icon: Users },
  { kw: ['FICO', 'FMS', '财务', '会计', '资金', '结算', '账'], Icon: Landmark },
  { kw: ['POS', '收银', '零售', '门店', '门市'], Icon: ShoppingCart },
  { kw: ['商城', '电商', 'MALL', 'SHOP', '订单', 'OMS'], Icon: ShoppingBag },
  { kw: ['BI', '报表', '数据', '分析', '看板', '大屏'], Icon: BarChart3 },
  { kw: ['AI', '智能', '大脑', '算法', '模型'], Icon: BrainCircuit },
]

function iconForSystem(name: string, label: string): LucideIcon {
  const hay = `${name} ${label}`.toUpperCase()
  for (const { kw, Icon } of SYSTEM_ICONS) {
    if (kw.some((k) => hay.includes(k.toUpperCase()))) return Icon
  }
  return Server
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** 黄金角螺旋布点，把系统均匀铺在星系里（确定性，随索引稳定）。 */
function orbLayout(count: number) {
  const out: Array<{ x: number; y: number }> = []
  for (let i = 0; i < count; i++) {
    const angle = i * 2.399963 // 黄金角 ≈137.5°
    const r = Math.min(41, 6 + Math.sqrt(i) * 8.2)
    const x = Math.max(8, Math.min(92, 50 + r * Math.cos(angle) * 1.15))
    const y = Math.max(12, Math.min(84, 46 + r * Math.sin(angle) * 0.92))
    out.push({ x, y })
  }
  return out
}

type Pos = { x: number; y: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * 力导向布局：无连线时用螺旋原样铺开；有连线时——
 *  - 参与关系的系统在中心区做力导向（互斥 + 边弹簧 + 向心 + 避免遮挡其它边）；
 *  - 不参与关系的系统被推到外圈椭圆环，让开中间的连线，不遮挡。
 * 被拖拽固定（overrides）的节点不参与迭代，作为定点。确定性、无随机。
 */
function computeLayout(names: string[], edges: Array<{ from: string; to: string }>, overrides: Map<string, Pos>): Map<string, Pos> {
  const seed = orbLayout(names.length)
  const pos = new Map<string, Pos>()
  names.forEach((n, i) => pos.set(n, overrides.get(n) ?? { ...seed[i] }))
  if (edges.length === 0) return pos

  const center = { x: 50, y: 48 }
  const connected = new Set<string>()
  edges.forEach((e) => { connected.add(e.from); connected.add(e.to) })
  const conNames = names.filter((n) => connected.has(n))
  const isoNames = names.filter((n) => !connected.has(n))

  // 孤立系统：按序均匀铺在外圈椭圆环，让开中心连线区域。
  isoNames.forEach((n, i) => {
    if (overrides.has(n)) return
    const ang = -Math.PI / 2 + (i / Math.max(1, isoNames.length)) * Math.PI * 2
    pos.set(n, { x: clamp(50 + 44 * Math.cos(ang), 7, 93), y: clamp(48 + 35 * Math.sin(ang), 10, 86) })
  })

  // 连线系统：力导向。
  const REP = 42, REST = 30, K = 0.05, GRAV = 0.05, AVOID = 0.6, MIN_EDGE = 8, STEP = 0.85, MAXSTEP = 3
  for (let it = 0; it < 300; it++) {
    const disp = new Map<string, Pos>()
    conNames.forEach((n) => disp.set(n, { x: 0, y: 0 }))

    for (let i = 0; i < conNames.length; i++) {
      for (let j = i + 1; j < conNames.length; j++) {
        const a = pos.get(conNames[i])!, b = pos.get(conNames[j])!
        let dx = a.x - b.x, dy = a.y - b.y
        const d2 = dx * dx + dy * dy + 0.01
        const d = Math.sqrt(d2)
        const f = REP / d2
        dx = (dx / d) * f; dy = (dy / d) * f
        const da = disp.get(conNames[i])!, db = disp.get(conNames[j])!
        da.x += dx; da.y += dy; db.x -= dx; db.y -= dy
      }
    }
    for (const e of edges) {
      const a = pos.get(e.from), b = pos.get(e.to)
      if (!a || !b || !disp.has(e.from) || !disp.has(e.to)) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.hypot(dx, dy) || 1
      const f = (d - REST) * K
      const ux = (dx / d) * f, uy = (dy / d) * f
      disp.get(e.from)!.x += ux; disp.get(e.from)!.y += uy
      disp.get(e.to)!.x -= ux; disp.get(e.to)!.y -= uy
    }
    conNames.forEach((n) => {
      const p = pos.get(n)!
      disp.get(n)!.x += (center.x - p.x) * GRAV
      disp.get(n)!.y += (center.y - p.y) * GRAV
    })
    // 避免非端点节点压在某条边上
    for (const e of edges) {
      const a = pos.get(e.from), b = pos.get(e.to)
      if (!a || !b) continue
      for (const n of conNames) {
        if (n === e.from || n === e.to) continue
        const p = pos.get(n)!
        const abx = b.x - a.x, aby = b.y - a.y
        const len2 = abx * abx + aby * aby || 1
        let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2
        t = clamp(t, 0, 1)
        const cxp = a.x + t * abx, cyp = a.y + t * aby
        let dx = p.x - cxp, dy = p.y - cyp
        const dist = Math.hypot(dx, dy) || 0.01
        if (dist < MIN_EDGE) {
          const push = (MIN_EDGE - dist) * AVOID
          disp.get(n)!.x += (dx / dist) * push
          disp.get(n)!.y += (dy / dist) * push
        }
      }
    }
    conNames.forEach((n) => {
      if (overrides.has(n)) return
      const d = disp.get(n)!
      const mag = Math.hypot(d.x, d.y)
      const s = mag > MAXSTEP ? MAXSTEP / mag : 1
      const p = pos.get(n)!
      pos.set(n, { x: clamp(p.x + d.x * s * STEP, 7, 93), y: clamp(p.y + d.y * s * STEP, 10, 86) })
    })
  }
  return pos
}

/** 拼装投喂给复用的 Vibe Coding 悬浮会话的「业务系统咨询」约束提示词。 */
function buildConsultSeed(system: string, modules: string[], ask: string): string {
  const moduleLine = modules.length
    ? `聚焦模块：${modules.join('、')}。`
    : '（未锁定具体模块，面向整个系统。）'
  return [
    `关于「${system}」业务系统的咨询。${moduleLine}`,
    '问题：',
    ask.trim(),
    '',
    '回答对象是业务人员，不是来读代码的：先给一句话结论，再用业务语言分点说明「这个功能是做什么的 / 操作入口在哪 / 有哪些注意点」，最多 3~5 点。',
    '不要主动展开源码片段/文件路径/行号/数据库表结构这类实现细节，除非我明确追问。',
    '可以先用已挂载的 graphify 知识图谱、domain-knowledge 业务认知、cross-topology 跨项目拓扑等能力核对事实，但不要把「查了什么」的过程复述给我。',
    '回答末尾附一小节「引用来源」，分别列出你依据的：命中的前端菜单/页面路径、graphify 图谱节点、domain-knowledge 条目（没有就写「无」）。',
  ].join('\n')
}

/** 从 chat.items 抽取「用户问 → AI 答」成对轮次。 */
function extractTurns(items: ChatItem[]): ArchiveTurnItem[] {
  const raw: Array<{ question: string; answerParts: string[] }> = []
  let cur: { question: string; answerParts: string[] } | null = null
  for (const it of items) {
    if (it.kind === 'user') {
      if (cur) raw.push(cur)
      cur = { question: it.displayText ?? it.text, answerParts: [] }
    } else if (it.kind === 'assistant' && cur) {
      if (it.text.trim()) cur.answerParts.push(it.text)
    }
  }
  if (cur) raw.push(cur)
  return raw.map((t, i) => ({ turnIndex: i + 1, question: t.question, answer: t.answerParts.join('\n\n') }))
}

export function ForeConsultPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { chat, activate, setFloating, setMinimized } = useChatRuntime()

  const [system, setSystem] = useState('')
  const [moduleTags, setModuleTags] = useState<string[]>([])
  const [ask, setAsk] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [configRows, setConfigRows] = useState<Array<{ name: string; path: string; alias: string; visible: boolean }>>([])
  const [showLinks, setShowLinks] = useState(true)
  const [overrides, setOverrides] = useState<Map<string, Pos>>(new Map())
  const [activeConsultId, setActiveConsultId] = useState<string | null>(null)

  const pendingRef = useRef<{ cwd: string; seed: string; displayText: string; consultId: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ name: string; moved: boolean } | null>(null)

  const { data: workspaces } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })

  const projects = useMemo<Array<{ name: string; path: string }>>(() => {
    const seen = new Set<string>()
    const out: Array<{ name: string; path: string }> = []
    for (const root of workspaces?.roots ?? []) {
      for (const d of root.dirs ?? []) {
        if (seen.has(d.name)) continue
        seen.add(d.name)
        out.push({ name: d.name, path: d.path })
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  }, [workspaces])

  const { data: prefs } = useQuery({ queryKey: ['fore-consult-system-prefs'], queryFn: listSystemPrefs })
  const prefMap = useMemo(() => {
    const m = new Map<string, { alias: string | null; visible: boolean; sortOrder: number }>()
    for (const p of prefs ?? []) m.set(p.systemName, { alias: p.alias, visible: p.visible, sortOrder: p.sortOrder })
    return m
  }, [prefs])

  /** 应用别名：无别名回退原名。 */
  const displayName = useCallback((name: string) => prefMap.get(name)?.alias?.trim() || name, [prefMap])

  // 星图只渲染「未被隐藏」的系统，按 (sortOrder, 展示名) 排序；无偏好记录默认可见。
  const visibleProjects = useMemo(() => {
    return projects
      .filter((p) => prefMap.get(p.name)?.visible !== false)
      .map((p) => ({ ...p, label: displayName(p.name), sortOrder: prefMap.get(p.name)?.sortOrder ?? 0 }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'zh'))
  }, [projects, prefMap, displayName])

  const presentCategories = useMemo(() => {
    const map = new Map<string, Category>()
    visibleProjects.forEach((p) => {
      const c = categoryOf(p.name, p.label)
      if (!map.has(c.key)) map.set(c.key, c)
    })
    return [...map.values()]
  }, [visibleProjects])

  const { data: topoData } = useQuery({ queryKey: ['fore-consult-topology'], queryFn: getTopology })
  const topoLinks = useMemo<TopoLink[]>(() => (showLinks ? topoData?.links ?? [] : []), [showLinks, topoData])

  const visibleNames = useMemo(() => new Set(visibleProjects.map((p) => p.name)), [visibleProjects])
  // 只保留两端都可见的边（隐藏某系统后其相关连线自动消失）。
  const activeLinks = useMemo(
    () => topoLinks.filter((l) => visibleNames.has(l.from) && visibleNames.has(l.to)),
    [topoLinks, visibleNames],
  )

  // 力导向坐标：有连线时把无关系的球推到外圈、让开连线，可拖拽微调。
  const positions = useMemo(
    () => computeLayout(visibleProjects.map((p) => p.name), activeLinks, overrides),
    [visibleProjects, activeLinks, overrides],
  )

  // 链路边几何：二次贝塞尔轻微外弓，标签落在曲线中点。
  const edges = useMemo(() => {
    return activeLinks
      .map((l) => {
        const a = positions.get(l.from)
        const b = positions.get(l.to)
        if (!a || !b) return null
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len = Math.hypot(dx, dy) || 1
        const k = Math.min(9, len * 0.16)
        const cx = mx + (-dy / len) * k
        const cy = my + (dx / len) * k
        return {
          link: l,
          d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`,
          lx: 0.25 * a.x + 0.5 * cx + 0.25 * b.x,
          ly: 0.25 * a.y + 0.5 * cy + 0.25 * b.y,
        }
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
  }, [activeLinks, positions])

  const stars = useMemo(() => {
    let s = 20260721
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296)
    return Array.from({ length: 72 }, () => ({
      x: rand() * 100,
      y: rand() * 100,
      size: 1 + rand() * 2,
      dur: 3 + rand() * 5,
      delay: rand() * 5,
    }))
  }, [])

  const systemPath = useMemo(() => projects.find((p) => p.name === system)?.path ?? '', [projects, system])

  const { data: modulesData } = useQuery({
    queryKey: ['fore-consult-modules', systemPath],
    queryFn: () => fetchProjectModules(systemPath),
    enabled: !!systemPath,
  })
  const moduleOptions = useMemo(
    () => (modulesData?.modules ?? []).map((m) => m.name),
    [modulesData],
  )

  const { data: history } = useQuery({ queryKey: ['fore-consult-sessions'], queryFn: listConsults })

  const deliver = useCallback(() => {
    const p = pendingRef.current
    if (!chat || !p) return
    pendingRef.current = null
    chat.open(p.cwd, undefined, undefined, 'claude')
    chat.send(p.seed, undefined, p.displayText)
    setFloating(true)
    setMinimized(false)
    setTimeout(() => {
      const sid = chat.sessionId
      if (sid) linkDevSession(p.consultId, sid).catch(() => {})
    }, 1500)
  }, [chat, setFloating, setMinimized])
  useEffect(() => {
    if (chat && pendingRef.current) deliver()
  }, [chat, deliver])

  // 离开页面再回来时组件重挂载会丢失 activeConsultId，但悬浮会话仍在跑——
  // 据当前 chat.sessionId 从历史里找回仍 PENDING 的会话，恢复归档入口。
  useEffect(() => {
    const sid = chat?.sessionId
    if (activeConsultId || !sid) return
    const pending = (history ?? []).find((s) => s.archiveStatus === 'PENDING' && s.devSessionId === sid)
    if (pending) setActiveConsultId(pending.sessionId)
  }, [history, chat, activeConsultId])

  const startMutation = useMutation({
    mutationFn: async () => {
      const cwd = systemPath || system.trim()
      const seed = buildConsultSeed(system.trim(), moduleTags, ask)
      const created = await startConsult({
        systemName: system.trim(),
        systemSourcePath: cwd,
        moduleNames: moduleTags,
        promptSnapshot: seed,
      })
      return { created, seed, cwd }
    },
    onSuccess: ({ created, seed, cwd }) => {
      setActiveConsultId(created.sessionId)
      pendingRef.current = { cwd, seed, displayText: ask.trim(), consultId: created.sessionId }
      if (chat) deliver()
      else activate()
      setAsk('')
      setPanelOpen(false)
      qc.invalidateQueries({ queryKey: ['fore-consult-sessions'] })
    },
  })

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!activeConsultId) return null
      const items = chat?.items ?? []
      return archiveConsult(activeConsultId, {
        rawReferenceJson: JSON.stringify(items),
        parseStatus: 'NONE',
        turns: extractTurns(items),
      })
    },
    onSuccess: () => {
      setActiveConsultId(null)
      qc.invalidateQueries({ queryKey: ['fore-consult-sessions'] })
    },
  })

  const topoMutation = useMutation({
    mutationFn: () => analyzeTopology(visibleProjects.map((p) => p.name)),
    onSuccess: (d) => {
      setShowLinks(true)
      qc.setQueryData(['fore-consult-topology'], d)
    },
  })

  // 拖拽球体：pointerdown 起拽，move 更新覆盖坐标（钉住该点，其余节点力导向避让），
  // 未移动则视为点击打开该系统。
  const toPct = (clientX: number, clientY: number): Pos | null => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    return { x: clamp(((clientX - rect.left) / rect.width) * 100, 4, 96), y: clamp(((clientY - rect.top) / rect.height) * 100, 6, 92) }
  }
  const onOrbPointerDown = (e: ReactPointerEvent, name: string) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { name, moved: false }
  }
  const onOrbPointerMove = (e: ReactPointerEvent) => {
    const ds = dragRef.current
    if (!ds) return
    const p = toPct(e.clientX, e.clientY)
    if (!p) return
    ds.moved = true
    setOverrides((prev) => new Map(prev).set(ds.name, p))
  }
  const onOrbPointerUp = (name: string) => {
    const ds = dragRef.current
    dragRef.current = null
    if (ds && !ds.moved) openSystem(name)
  }

  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      const payload: SaveSystemPrefItem[] = configRows.map((r, i) => ({
        systemName: r.name,
        systemSourcePath: r.path,
        alias: r.alias.trim() || null,
        visible: r.visible,
        sortOrder: i,
      }))
      return saveSystemPrefs(payload)
    },
    onSuccess: () => {
      setConfigOpen(false)
      qc.invalidateQueries({ queryKey: ['fore-consult-system-prefs'] })
    },
  })

  const openConfig = () => {
    // 用全部工作区项目（含当前被隐藏的）铺初始行，套上已保存的别名/可见性。
    setConfigRows(
      projects
        .map((p) => {
          const pref = prefMap.get(p.name)
          return { name: p.name, path: p.path, alias: pref?.alias ?? '', visible: pref?.visible !== false, sortOrder: pref?.sortOrder ?? 0 }
        })
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh')),
    )
    setConfigOpen(true)
  }

  const openSystem = (name: string) => {
    if (activeConsultId) return // 有咨询进行中时，先归档再开新的
    setSystem(name)
    setModuleTags([])
    setAsk('')
    setPanelOpen(true)
  }

  const toggleModule = (m: string) => {
    setModuleTags((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
  }

  const onDelete = async (s: ConsultSessionView) => {
    const ok = await confirm({
      title: '删除咨询记录',
      description: `删除「${s.systemName}」的咨询会话及其全部问答轮次，不可恢复。`,
      variant: 'destructive',
    })
    if (!ok) return
    await deleteConsult(s.sessionId)
    if (activeConsultId === s.sessionId) setActiveConsultId(null)
    qc.invalidateQueries({ queryKey: ['fore-consult-sessions'] })
  }

  const canStart = !!system.trim() && !!ask.trim() && !startMutation.isPending && !activeConsultId
  const PanelIcon = iconForSystem(system, displayName(system))

  return (
    <div ref={containerRef} className="fc-space h-[calc(100vh-5rem)] w-full rounded-2xl">
      {/* 星尘 */}
      {stars.map((st, i) => (
        <span
          key={i}
          className="fc-star"
          style={{
            left: `${st.x}%`,
            top: `${st.y}%`,
            width: st.size,
            height: st.size,
            ['--fc-dur' as string]: `${st.dur}s`,
            ['--fc-delay' as string]: `${st.delay}s`,
          }}
        />
      ))}

      {/* 顶部标题栏 */}
      <header className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <Radar className="size-5 text-sky-300" />
          <div>
            <h1 className="text-base font-semibold tracking-wide text-white">业务系统星图</h1>
            <p className="text-xs text-indigo-200/60">点击一颗资产星球，选定模块后向 AI 发起业务咨询</p>
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => topoMutation.mutate()}
            disabled={visibleProjects.length < 2 || topoMutation.isPending}
            className="flex items-center gap-1.5 rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1.5 text-xs text-sky-100 backdrop-blur-md transition-colors hover:bg-sky-400/20 disabled:opacity-40"
            title="调用 cross-topology 图谱分析系统之间的链路关系"
          >
            {topoMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Waypoints className="size-3.5" />}
            {topoMutation.isPending ? '分析中…' : '分析链路'}
          </button>
          {(topoData?.links.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => setShowLinks((s) => !s)}
              className="flex items-center gap-1.5 rounded-full border border-indigo-300/25 bg-white/5 px-3 py-1.5 text-xs text-indigo-100 backdrop-blur-md transition-colors hover:bg-white/10"
              title={showLinks ? '隐藏连线' : '显示连线'}
            >
              {showLinks ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              连线 {topoData?.links.length}
            </button>
          )}
          <button
            type="button"
            onClick={openConfig}
            className="flex items-center gap-1.5 rounded-full border border-indigo-300/25 bg-white/5 px-3 py-1.5 text-xs text-indigo-100 backdrop-blur-md transition-colors hover:bg-white/10"
            title="管理系统别名与显示范围"
          >
            <SlidersHorizontal className="size-3.5" />
            配置
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-full border border-indigo-300/25 bg-white/5 px-3 py-1.5 text-xs text-indigo-100 backdrop-blur-md transition-colors hover:bg-white/10"
          >
            <History className="size-3.5" />
            历史咨询 {(history ?? []).length > 0 && `· ${(history ?? []).length}`}
          </button>
        </div>
      </header>

      {/* 进行中横幅 */}
      {activeConsultId && (
        <div className="absolute left-1/2 top-16 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-1.5 text-xs text-emerald-100 backdrop-blur-md">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </span>
          咨询进行中，在右下悬浮窗继续追问
          <button
            type="button"
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
            className="ml-1 flex items-center gap-1 rounded-full bg-emerald-400/90 px-2.5 py-1 font-medium text-emerald-950 transition-transform hover:scale-105 disabled:opacity-60"
          >
            {archiveMutation.isPending && <Loader2 className="size-3 animate-spin" />}
            结束并归档
          </button>
        </div>
      )}

      {/* 系统链路：发光连线（在球体之下） */}
      {edges.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="fc-edge-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
          </defs>
          {edges.map((e, i) => (
            <path key={i} className="fc-edge" d={e.d} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      )}

      {/* 链路关系标签（在连线中点） */}
      {edges.map((e, i) => (
        <div
          key={i}
          className="fc-edge-label z-20"
          style={{ left: `${e.lx}%`, top: `${e.ly}%` }}
          title={e.link.description || `${e.link.from} → ${e.link.to}`}
        >
          {e.link.relation}
        </div>
      ))}

      {/* 星系：资产球体 */}
      <div className="absolute inset-0 z-10">
        {projects.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-indigo-200/60">
            未扫描到业务系统（检查 claude-chat 工作区配置）
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-indigo-200/60">
            所有系统都被隐藏了
            <button type="button" onClick={openConfig} className="rounded-full border border-indigo-300/30 bg-white/5 px-3 py-1.5 text-xs text-indigo-100 hover:bg-white/10">
              打开配置调整显示范围
            </button>
          </div>
        ) : (
          visibleProjects.map((p) => {
            const h = hashStr(p.name)
            const hue = categoryOf(p.name, p.label).color
            const size = 52 + (h % 34)
            const pos = positions.get(p.name)
            if (!pos) return null
            const isActive = system === p.name && (panelOpen || !!activeConsultId)
            const dragging = overrides.has(p.name)
            const SysIcon = iconForSystem(p.name, p.label)
            const iconSize = Math.round(size * 0.42)
            return (
              <div
                key={p.name}
                className={`fc-orb-wrap ${isActive ? 'is-active' : ''}`}
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  ['--fc-drift-dur' as string]: `${7 + (h % 5)}s`,
                  ['--fc-drift-delay' as string]: `${(h % 40) / 10}s`,
                  // 显示连线时冻结漂浮，让球体稳定贴合连线端点；拖拽中的球也不漂浮。
                  ...(dragging || edges.length > 0 ? { animation: 'none' } : {}),
                }}
              >
                <button
                  type="button"
                  onPointerDown={(e) => onOrbPointerDown(e, p.name)}
                  onPointerMove={onOrbPointerMove}
                  onPointerUp={() => onOrbPointerUp(p.name)}
                  disabled={!!activeConsultId && system !== p.name}
                  aria-label={p.label}
                  className="fc-orb flex cursor-grab touch-none select-none items-center justify-center active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    width: size,
                    height: size,
                    ['--fc-hue' as string]: hue,
                    ['--fc-orbit-dur' as string]: `${12 + (h % 8)}s`,
                  }}
                >
                  <SysIcon
                    className="pointer-events-none relative z-[1] text-white/90"
                    style={{ width: iconSize, height: iconSize, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.55))' }}
                    strokeWidth={1.8}
                  />
                </button>
                <span className="fc-orb-label">{p.label}</span>
              </div>
            )
          })
        )}
      </div>

      {/* 业务域图例（左下） */}
      {presentCategories.length > 0 && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex max-w-[70%] flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-indigo-300/15 bg-white/[0.04] px-3 py-2 backdrop-blur-md">
          {presentCategories.map((c) => (
            <span key={c.key} className="flex items-center gap-1.5 text-[11px] text-indigo-100/80">
              <span className="size-2.5 rounded-full" style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }} />
              {c.label}
            </span>
          ))}
        </div>
      )}

      {/* 模块选择 + 提问面板 */}
      {panelOpen && (
        <div className="fc-backdrop absolute inset-0 z-30 flex items-center justify-center p-6" onClick={() => setPanelOpen(false)}>
          <div
            className="fc-panel w-[min(560px,calc(100vw-3rem))] rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <PanelIcon className="size-4 text-sky-300" />
                  <h2 className="truncate text-lg font-semibold text-white">{displayName(system)}</h2>
                </div>
                <p className="mt-0.5 truncate text-xs text-indigo-200/50">{systemPath || '（自由输入的系统，无源码路径）'}</p>
              </div>
              <button type="button" onClick={() => setPanelOpen(false)} className="rounded-lg p-1.5 text-indigo-200/70 hover:bg-white/10" aria-label="关闭">
                <X className="size-4" />
              </button>
            </div>

            <div className="mb-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-indigo-200/60">选择模块（可多选，可不选）</div>
              {moduleOptions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-indigo-300/20 px-3 py-4 text-center text-xs text-indigo-200/40">
                  该系统暂无可选模块，可直接对整个系统提问
                </p>
              ) : (
                <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1">
                  {moduleOptions.map((m) => {
                    const on = moduleTags.includes(m)
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleModule(m)}
                        className={`rounded-full border px-3 py-1 text-xs transition-all ${
                          on
                            ? 'border-sky-300/60 bg-sky-400/20 text-sky-100 shadow-[0_0_14px_-2px_rgba(120,180,255,0.6)]'
                            : 'border-indigo-300/25 bg-white/5 text-indigo-100/80 hover:bg-white/10'
                        }`}
                      >
                        {m}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="mb-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-indigo-200/60">咨询问题</div>
              <textarea
                autoFocus
                rows={4}
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                placeholder="用业务语言描述问题，如：采购退货单在哪里录入？退货后库存怎么回冲？"
                className="fc-glass-input w-full resize-none rounded-xl px-3 py-2.5 text-sm"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="rounded-xl px-4 py-2 text-sm text-indigo-200/70 transition-colors hover:bg-white/5"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => startMutation.mutate()}
                disabled={!canStart}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 px-5 py-2 text-sm font-medium text-white shadow-[0_8px_30px_-8px_rgba(99,102,241,0.8)] transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {startMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                发起咨询
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 历史抽屉 */}
      {historyOpen && (
        <div className="fc-backdrop absolute inset-0 z-30 flex justify-end" onClick={() => setHistoryOpen(false)}>
          <div
            className="fc-panel h-full w-[min(400px,calc(100vw-2rem))] overflow-y-auto rounded-l-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <History className="size-4 text-sky-300" /> 历史咨询
              </h2>
              <button type="button" onClick={() => setHistoryOpen(false)} className="rounded-lg p-1.5 text-indigo-200/70 hover:bg-white/10" aria-label="关闭">
                <X className="size-4" />
              </button>
            </div>
            {(history ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-indigo-300/20 p-6 text-center text-sm text-indigo-200/40">暂无咨询记录</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {(history ?? []).map((s) => (
                  <li key={s.sessionId} className="rounded-xl border border-indigo-300/15 bg-white/[0.03] px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium text-white">{displayName(s.systemName)}</span>
                        <ArchiveBadge status={s.archiveStatus} />
                      </div>
                      <button type="button" onClick={() => onDelete(s)} className="shrink-0 rounded-lg p-1 text-indigo-200/50 hover:bg-white/10 hover:text-red-300" aria-label="删除">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    {s.moduleNames.length > 0 && (
                      <div className="mt-1 truncate text-xs text-indigo-200/50">{s.moduleNames.join('、')}</div>
                    )}
                    <div className="mt-1 text-[11px] text-indigo-200/40">
                      {s.turns.length} 轮问答 · {new Date(s.createdAt).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 配置抽屉：别名 + 过滤 */}
      {configOpen && (
        <div className="fc-backdrop absolute inset-0 z-40 flex justify-end" onClick={() => setConfigOpen(false)}>
          <div className="fc-panel flex h-full w-[min(460px,calc(100vw-2rem))] flex-col rounded-l-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-indigo-300/15 p-5">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <SlidersHorizontal className="size-4 text-sky-300" /> 系统别名与显示
                </h2>
                <p className="mt-0.5 text-xs text-indigo-200/50">取消勾选可从星图隐藏；别名为空则用原名。</p>
              </div>
              <button type="button" onClick={() => setConfigOpen(false)} className="rounded-lg p-1.5 text-indigo-200/70 hover:bg-white/10" aria-label="关闭">
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {configRows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-indigo-300/20 p-6 text-center text-sm text-indigo-200/40">未扫描到业务系统</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {configRows.map((r, idx) => (
                    <li key={r.name} className={`flex items-center gap-2.5 rounded-xl border border-indigo-300/15 bg-white/[0.03] px-3 py-2.5 ${r.visible ? '' : 'opacity-55'}`}>
                      <button
                        type="button"
                        onClick={() => setConfigRows((rows) => rows.map((x, i) => (i === idx ? { ...x, visible: !x.visible } : x)))}
                        className={`shrink-0 rounded-lg p-1.5 transition-colors ${r.visible ? 'text-sky-300 hover:bg-white/10' : 'text-indigo-200/40 hover:bg-white/5'}`}
                        title={r.visible ? '点击隐藏' : '点击显示'}
                        aria-label={r.visible ? '隐藏' : '显示'}
                      >
                        {r.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <input
                          value={r.alias}
                          onChange={(e) => setConfigRows((rows) => rows.map((x, i) => (i === idx ? { ...x, alias: e.target.value } : x)))}
                          placeholder={r.name}
                          className="fc-glass-input w-full rounded-lg px-2.5 py-1.5 text-sm"
                        />
                        <div className="mt-1 truncate text-[11px] text-indigo-200/40">原名：{r.name}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-indigo-300/15 p-4">
              <button type="button" onClick={() => setConfigOpen(false)} className="rounded-xl px-4 py-2 text-sm text-indigo-200/70 hover:bg-white/5">
                取消
              </button>
              <button
                type="button"
                onClick={() => saveConfigMutation.mutate()}
                disabled={saveConfigMutation.isPending}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 px-5 py-2 text-sm font-medium text-white shadow-[0_8px_30px_-8px_rgba(99,102,241,0.8)] transition-transform hover:scale-[1.03] disabled:opacity-50"
              >
                {saveConfigMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                保存配置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ArchiveBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING: { label: '进行中', cls: 'bg-amber-400/15 text-amber-300 border-amber-300/30' },
    SUCCESS: { label: '已归档', cls: 'bg-emerald-400/15 text-emerald-300 border-emerald-300/30' },
    FAILED: { label: '归档失败', cls: 'bg-red-400/15 text-red-300 border-red-300/30' },
  }
  const it = map[status] ?? { label: status, cls: 'bg-white/10 text-indigo-200/70 border-indigo-300/20' }
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${it.cls}`}>{it.label}</span>
}
