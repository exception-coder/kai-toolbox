import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, ChevronDown, ChevronRight, Eye, GripVertical, History, Layers, Loader2, Pencil,
  PlayCircle, Plus, Save, Square, Trash2, XCircle,
} from 'lucide-react'
import {
  DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { usePrompt } from '@/components/ui/prompt-dialog'
import {
  createPipeline, deletePipeline, getPipeline, getPipelineRun, listPipelineRuns, listPipelines,
  listSavedRequests, listVars, runPipeline, updatePipeline,
} from '../api'
import type {
  ExecuteRequestBody, PipelineDetail, PipelineRunDetail, PipelineRunSummary,
  PipelineStep, SavedRequestView,
} from '../types'
import { OutputsEditor } from './OutputsEditor'
import { KeyValueFieldsEditor, type KvPair } from './KeyValueFieldsEditor'
import { VarBindableField, type VarOption } from './VarPickerPopover'
import { JsonTreeEditor, parseJsonBody, serializeJsonBody } from './JsonTreeEditor'
import { JsonViewer } from './JsonViewer'
import { parseCurl } from '../utils/curlParser'
import { parseUrl, serializeUrl, type QueryParam } from '../utils/url'

const PIPELINES_KEY = (sid: string) => ['browser-request', 'pipelines', sid] as const
const PIPELINE_KEY = (pid: string) => ['browser-request', 'pipeline', pid] as const
const RUNS_KEY = (pid: string) => ['browser-request', 'runs', pid] as const

const newUuid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

const newStep = (type: 'single' | 'foreach' = 'single'): PipelineStep => ({
  id: newUuid(),
  name: type === 'single' ? '新建单次请求' : '新建循环请求',
  type,
  request: type === 'single'
    ? { method: 'GET', url: '', headers: {}, body: '' }
    : { method: 'GET', url: 'https://example.com/{{item.id}}', headers: {}, body: '' },
  source: type === 'foreach' ? { varName: '', jsonPath: '' } : undefined,
  outputs: [],
  continueOnError: false,
  // foreach 默认 item 间 200ms 防限流；single 不需要 item 间隔
  requestIntervalMs: type === 'foreach' ? 200 : 0,
  // step 间默认 0（不等待）；用户按需调
  afterStepMs: 0,
})

// ── 主组件 ──────────────────────────────────────────────────────────────────

export function PipelinePanel({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const promptInput = usePrompt()

  const { data: pipelines = [] } = useQuery({
    queryKey: PIPELINES_KEY(sessionId),
    queryFn: () => listPipelines(sessionId),
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => {
    if (!selectedId && pipelines.length > 0) setSelectedId(pipelines[0].id)
  }, [pipelines, selectedId])

  const { data: detail } = useQuery({
    queryKey: selectedId ? PIPELINE_KEY(selectedId) : ['browser-request', 'pipeline', '__none__'],
    queryFn: () => getPipeline(selectedId!),
    enabled: !!selectedId,
  })

  /** 本地草稿 —— 编辑期间脱离 server 状态。selectedId 变更时从 detail 拷贝过来。 */
  const [draft, setDraft] = useState<PipelineDetail | null>(null)
  useEffect(() => {
    if (detail) setDraft(detail)
  }, [detail?.id, detail?.updatedAt])

  const dirty = useMemo(() => {
    if (!detail || !draft) return false
    return JSON.stringify(detail) !== JSON.stringify(draft)
  }, [detail, draft])

  const saveMut = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('no draft')
      // 阶段 4 · 硬拒绝：所有 step 如果用 cURL 模式且非空，必须能解析成功
      const errs: string[] = []
      draft.steps.forEach((s, i) => {
        const curl = s.request?.curl
        // 兼容后端把空字段序列化成 null：用 != null 同时挡掉 null 和 undefined
        if (curl != null && curl.trim() !== '') {
          try { parseCurl(curl) } catch (e) {
            errs.push(`Step #${i + 1}「${s.name}」cURL 解析失败：${(e as Error).message}`)
          }
        }
      })
      if (errs.length > 0) {
        throw new Error('保存被阻止：\n' + errs.join('\n'))
      }
      return updatePipeline(draft.id, draft.name, draft.steps)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PIPELINES_KEY(sessionId) })
      if (selectedId) qc.invalidateQueries({ queryKey: PIPELINE_KEY(selectedId) })
    },
    onError: e => alert((e as Error).message),
  })

  const createMut = useMutation({
    mutationFn: (name: string) => createPipeline(sessionId, name, [newStep('single')]),
    onSuccess: created => {
      qc.invalidateQueries({ queryKey: PIPELINES_KEY(sessionId) })
      setSelectedId(created.id)
    },
  })

  const delMut = useMutation({
    mutationFn: (id: string) => deletePipeline(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PIPELINES_KEY(sessionId) })
      setSelectedId(null)
      setDraft(null)
    },
  })

  const handleCreate = async () => {
    const name = await promptInput({
      title: '新建编排链',
      placeholder: '比如「拉取所有评论」',
      confirmText: '创建',
      validate: v => v.trim() === '' ? '名称不能为空' : null,
    })
    if (name) createMut.mutate(name)
  }

  const handleDelete = async () => {
    if (!selectedId || !draft) return
    const ok = await confirm({
      title: '删除编排链',
      description: `确认删除「${draft.name}」？不可恢复。`,
      variant: 'destructive', confirmText: '删除',
    })
    if (ok) delMut.mutate(selectedId)
  }

  // ── 运行 ──
  const [running, setRunning] = useState<RunState | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const abortRef = useRef<(() => void) | null>(null)

  const start = async (dryRun: boolean) => {
    if (!draft) return
    if (dirty) {
      await confirm({
        title: '请先保存',
        description: '请先保存草稿再运行',
        confirmText: '知道了',
        cancelText: '关闭',
      })
      return
    }
    const totalSteps = draft.steps.length
    setRunning({
      pipelineName: draft.name,
      totalSteps,
      dryRun,
      stepStates: Array.from({ length: totalSteps }, () => ({ status: 'pending' as const, progress: [] })),
      finished: false,
    })
    abortRef.current = runPipeline(draft.id, dryRun, {
      onEvent: (eventName, d) => {
        handleSseEvent(eventName, d as Record<string, unknown>, setRunning)
        // pipeline 结束时刷新 runs 列表，让历史面板能看到这次记录
        if (eventName === 'pipeline-completed' || eventName === 'pipeline-cancelled' || eventName === 'pipeline-error') {
          qc.invalidateQueries({ queryKey: RUNS_KEY(draft.id) })
        }
      },
      onError: e => setRunning(prev => prev ? { ...prev, finished: true, fatalError: (e as Error).message } : prev),
    })
  }
  const cancel = () => {
    abortRef.current?.()
    abortRef.current = null
    setRunning(prev => prev ? { ...prev, finished: true, fatalError: '已取消' } : prev)
  }
  const closeRun = () => {
    abortRef.current?.()
    abortRef.current = null
    setRunning(null)
  }

  return (
    <div className="rounded-xl border bg-[var(--color-card)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Layers className="h-4 w-4" />
        <div className="text-sm font-medium">编排链</div>
        <select
          className="rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
          value={selectedId ?? ''}
          onChange={e => setSelectedId(e.target.value || null)}
        >
          <option value="">— 选择编排链 —</option>
          {pipelines.map(p => (
            <option key={p.id} value={p.id}>{p.name} ({p.stepCount} 步)</option>
          ))}
        </select>
        <Button size="sm" onClick={handleCreate}>
          <Plus />
          新建
        </Button>
        {draft && (
          <Button size="sm" variant="ghost" onClick={handleDelete} title="删除当前编排链">
            <Trash2 />
          </Button>
        )}
        <div className="ml-auto flex gap-1">
          {draft && (
            <>
              <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}
                      title="查看运行历史 / 失败明细">
                <History />
                历史
              </Button>
              {/* 有未保存改动时变高亮蓝，提醒用户「记得保存」 */}
              <Button size="sm" variant={dirty ? 'default' : 'outline'}
                      disabled={!dirty || saveMut.isPending}
                      onClick={() => saveMut.mutate()}>
                {saveMut.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                保存草稿
              </Button>
              <Button size="sm" variant="secondary" onClick={() => start(true)}
                      disabled={!!running && !running.finished}>
                <Eye />
                干跑
              </Button>
              <Button size="sm" onClick={() => start(false)}
                      disabled={!!running && !running.finished}>
                <PlayCircle />
                运行
              </Button>
            </>
          )}
        </div>
      </div>

      {!draft && (
        <div className="rounded-md border border-dashed p-3 text-center text-xs text-[var(--color-muted-foreground)]">
          还没有编排链。点「新建」开始第一条。
        </div>
      )}

      {draft && (
        <>
          <NameEditor
            value={draft.name}
            onChange={v => setDraft({ ...draft, name: v })}
          />
          <StepsEditor
            sessionId={sessionId}
            steps={draft.steps}
            onChange={steps => setDraft({ ...draft, steps })}
          />
        </>
      )}

      {running && <RunView state={running} onCancel={cancel} onClose={closeRun} />}

      {historyOpen && draft && (
        <RunHistoryDialog pipelineId={draft.id} onClose={() => setHistoryOpen(false)} />
      )}
    </div>
  )
}

// ── 名称编辑 ────────────────────────────────────────────────────────────────

function NameEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  return (
    <div className="mb-3 flex items-center gap-2 text-sm">
      <span className="text-xs text-[var(--color-muted-foreground)]">名称</span>
      {editing ? (
        <Input
          className="h-8 max-w-sm"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { setEditing(false); if (draft.trim()) onChange(draft.trim()) }}
          onKeyDown={e => { if (e.key === 'Enter') { setEditing(false); if (draft.trim()) onChange(draft.trim()) } }}
          autoFocus
        />
      ) : (
        <span className="font-medium" onClick={() => setEditing(true)}>{value}</span>
      )}
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)} title="重命名">
        <Pencil />
      </Button>
    </div>
  )
}

// ── Steps 列表编辑 ──────────────────────────────────────────────────────────

function StepsEditor({
  sessionId, steps, onChange,
}: {
  sessionId: string
  steps: PipelineStep[]
  onChange: (steps: PipelineStep[]) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // 拖拽距离阈值 5px，防止误触（点击按钮也会触发 PointerSensor，加阈值保护）
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const updateAt = (idx: number, mut: (s: PipelineStep) => PipelineStep) => {
    const next = steps.slice()
    next[idx] = mut(next[idx])
    onChange(next)
  }
  const removeAt = (idx: number) => onChange(steps.filter((_, i) => i !== idx))
  const addStep = (type: 'single' | 'foreach') => {
    const s = newStep(type)
    onChange([...steps, s])
    setExpandedId(s.id)
  }
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = steps.findIndex(s => s.id === active.id)
    const newIdx = steps.findIndex(s => s.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    onChange(arrayMove(steps, oldIdx, newIdx))
  }

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {steps.map((step, idx) => {
              // 计算"前置 step.outputs.name"——本 step 可以用 {{name}} 引用它们
              const precedingOutputNames: string[] = []
              for (let i = 0; i < idx; i++) {
                for (const o of (steps[i].outputs ?? [])) {
                  if (o.name) precedingOutputNames.push(o.name)
                }
              }
              return (
                <SortableStepItem
                  key={step.id}
                  sessionId={sessionId}
                  step={step}
                  index={idx}
                  expanded={expandedId === step.id}
                  onToggleExpand={() => setExpandedId(expandedId === step.id ? null : step.id)}
                  onChange={s => updateAt(idx, () => s)}
                  onRemove={() => removeAt(idx)}
                  precedingOutputNames={precedingOutputNames}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => addStep('single')}>
          <Plus />
          + single
        </Button>
        <Button size="sm" variant="secondary" onClick={() => addStep('foreach')}>
          <Plus />
          + foreach
        </Button>
      </div>
    </div>
  )
}

/** 单个可拖拽的 step 卡片。dnd-kit 把 listeners 装到「拖拽把手」上，其他控件正常响应点击。 */
function SortableStepItem({
  sessionId, step, index, expanded, onToggleExpand, onChange, onRemove, precedingOutputNames,
}: {
  sessionId: string
  step: PipelineStep
  index: number
  expanded: boolean
  onToggleExpand: () => void
  onChange: (s: PipelineStep) => void
  onRemove: () => void
  precedingOutputNames: string[]
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="rounded-md border bg-[var(--color-card)]">
      <div className="flex items-center gap-2 p-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] active:cursor-grabbing"
          title="拖动调整顺序"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button onClick={onToggleExpand} className="text-[var(--color-muted-foreground)]">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className="w-6 shrink-0 text-right text-xs text-[var(--color-muted-foreground)]">
          #{index + 1}
        </span>
        <Badge variant={step.type === 'single' ? 'secondary' : 'default'}>{step.type}</Badge>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{step.name}</span>
        <Button size="sm" variant="ghost" onClick={onRemove} title="删除">
          <Trash2 />
        </Button>
      </div>
      {expanded && (
        <StepEditor
          sessionId={sessionId}
          step={step}
          onChange={onChange}
          precedingOutputNames={precedingOutputNames}
        />
      )}
    </div>
  )
}

// ── 单个 Step 内部编辑（inline） ─────────────────────────────────────────────

function StepEditor({
  sessionId, step, onChange, precedingOutputNames = [],
}: {
  sessionId: string
  step: PipelineStep
  onChange: (s: PipelineStep) => void
  /** 当前 step 之前所有 step 配置的 output 名字（运行时这些会出现在 chain vars 里） */
  precedingOutputNames?: string[]
}) {
  const updateRequest = (mut: (r: ExecuteRequestBody) => ExecuteRequestBody) =>
    onChange({ ...step, request: mut(step.request) })

  const { data: savedList = [] } = useQuery({
    queryKey: ['browser-request', 'saved', sessionId],
    queryFn: () => listSavedRequests(sessionId),
  })
  const { data: varsList = [] } = useQuery({
    queryKey: ['browser-request', 'vars', sessionId],
    queryFn: () => listVars(sessionId),
  })

  // 最近 import 的 saved request——保留用于在 UI 上展示其 lastResponseBody 作参考
  const [referenceSaved, setReferenceSaved] = useState<SavedRequestView | null>(null)

  /** 把已保存的请求一次性拷贝到当前 step：request + outputs 一起带过来。拷贝后是独立副本，编辑不影响源。 */
  const importFromSaved = (saved: SavedRequestView) => {
    const next: PipelineStep = saved.curl
      ? { ...step, request: { curl: saved.curl } }
      : {
          ...step,
          request: {
            method: saved.method ?? 'GET',
            url: saved.url ?? '',
            headers: saved.headers ?? {},
            body: saved.body ?? '',
          },
        }
    // 拷贝 outputs 配置——之前需要在 step 里手敲，现在保存请求时就配好可复用
    if (saved.outputs && saved.outputs.length > 0) {
      next.outputs = saved.outputs.map(o => ({ ...o }))   // 深拷贝避免共享引用
    }
    onChange(next)
    // 保留引用以便展示 lastResponseBody（参考用，不会影响 step.request 内容）
    setReferenceSaved(saved)
    setImportFeedback({
      name: saved.name,
      outputsCount: saved.outputs?.length ?? 0,
      hasResponse: !!saved.lastResponseBody,
      at: Date.now(),
    })
  }

  /** 短暂可见的 import 反馈——告诉用户这次具体载入了什么（outputs / 响应样本）。 */
  const [importFeedback, setImportFeedback] = useState<{
    name: string; outputsCount: number; hasResponse: boolean; at: number
  } | null>(null)

  // curl 字段存在（即使是空字符串）就视为 cURL 模式——切换到 cURL 后用户还没粘内容时也应保持 cURL 视图。
  // 用 != null 同时挡掉 undefined 和后端序列化出的 null，避免结构化模式被误判成 cURL 模式
  const isCurl = step.request.curl != null

  /** 构造该 step 可用的变量选项：会话所有 saved 的 lastExtractedValues + 前置 step.outputs + (foreach 时) item */
  const varOptions: VarOption[] = useMemo(() => {
    const opts: VarOption[] = []
    // 1. 来自 saved 的提取值
    for (const s of savedList) {
      const values = s.lastExtractedValues ?? {}
      for (const [name, value] of Object.entries(values)) {
        opts.push({
          ref: `{{${name}}}`,
          name,
          preview: value.length > 60 ? value.slice(0, 60) + '…' : value,
          group: `来自「${s.name}」`,
        })
      }
    }
    // 2. 前置 step 的 outputs（运行时进 chain vars）
    for (const name of precedingOutputNames) {
      opts.push({
        ref: `{{${name}}}`,
        name,
        preview: '（运行时由前置 step 写入）',
        group: '上游 step outputs',
      })
    }
    // 3. foreach 当前项
    if (step.type === 'foreach') {
      opts.push({ ref: '{{item}}', name: 'item', preview: '当前循环项', group: '循环项 item' })
      opts.push({ ref: '{{item.id}}', name: 'item.id', preview: '常用：item.id', group: '循环项 item' })
      opts.push({ ref: '{{item.slug}}', name: 'item.slug', preview: '常用：item.slug', group: '循环项 item' })
      opts.push({ ref: '{{item.name}}', name: 'item.name', preview: '常用：item.name', group: '循环项 item' })
    }
    // 4. 旧 session vars
    for (const v of varsList) {
      opts.push({
        ref: `{{${v.name}}}`,
        name: v.name,
        preview: v.value.length > 60 ? v.value.slice(0, 60) + '…' : v.value,
        group: '会话变量（旧）',
      })
    }
    return opts
  }, [savedList, varsList, precedingOutputNames, step.type])

  /** URL 拆 base+query。serializeUrl 拼回时跳过 {{...}} 不做 URL 编码。 */
  const parsedUrl = useMemo(() => parseUrl(step.request.url ?? ''), [step.request.url])
  const setBaseUrl = (base: string) =>
    updateRequest(r => ({ ...r, url: serializeUrl({ ...parsedUrl, base }) }))
  const setQuery = (query: QueryParam[]) =>
    updateRequest(r => ({ ...r, url: serializeUrl({ ...parsedUrl, query }) }))

  /** headers Map ↔ KvPair[] 双向。 */
  const headerPairs: KvPair[] = useMemo(
    () => Object.entries(step.request.headers ?? {}).map(([k, v]) => ({ key: k, value: v })),
    [step.request.headers],
  )
  const setHeaderPairs = (pairs: KvPair[]) => {
    const headers: Record<string, string> = {}
    for (const p of pairs) {
      if (p.key.trim()) headers[p.key] = p.value
    }
    updateRequest(r => ({ ...r, headers }))
  }

  /** 「粘 cURL → 解析填充」一次性操作。失败显示错误，不破坏现有字段。 */
  const [pasteCurl, setPasteCurl] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const handleParseAndFill = () => {
    if (!pasteCurl.trim()) return
    try {
      const parsed = parseCurl(pasteCurl)
      // 切到结构化模式 + 填充
      onChange({
        ...step,
        request: {
          method: parsed.method,
          url: parsed.url,
          headers: parsed.headers,
          body: parsed.body,
        },
      })
      setPasteCurl('')
      setParseError(null)
    } catch (e) {
      setParseError((e as Error).message)
    }
  }

  return (
    <div className="space-y-3 border-t p-3">
      <div className={`grid gap-2 ${step.type === 'foreach' ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <label className="text-xs">
          <span className="mb-1 block text-[var(--color-muted-foreground)]">步骤名称</span>
          <Input value={step.name} onChange={e => onChange({ ...step, name: e.target.value })} />
        </label>
        {step.type === 'foreach' && (
          <label className="text-xs">
            <span className="mb-1 block text-[var(--color-muted-foreground)]"
                  title="foreach 每次 item 之间等待的毫秒数——节流防止服务端限流">
              循环间隔 (ms) · item 之间
            </span>
            <Input
              type="number"
              min={0}
              placeholder="0 = 不等待"
              value={step.requestIntervalMs ?? 0}
              onChange={e => {
                const n = Math.max(0, Number(e.target.value) || 0)
                onChange({ ...step, requestIntervalMs: n })
              }}
            />
          </label>
        )}
        <label className="text-xs">
          <span className="mb-1 block text-[var(--color-muted-foreground)]"
                title="本 step 完成后、进入下一 step 之前的等待毫秒数">
            步骤间隔 (ms) · 进入下一 step 前
          </span>
          <Input
            type="number"
            min={0}
            placeholder="0 = 不等待"
            // 兼容旧数据：single step 的 requestIntervalMs 也算 step 间隔，afterStepMs 没设时回退它
            value={step.afterStepMs ?? (step.type === 'single' ? (step.requestIntervalMs ?? 0) : 0)}
            onChange={e => {
              const n = Math.max(0, Number(e.target.value) || 0)
              // 同时清掉 single 的旧 requestIntervalMs 以免后端先看旧字段（虽然后端已优先 afterStepMs）
              if (step.type === 'single') {
                onChange({ ...step, afterStepMs: n, requestIntervalMs: 0 })
              } else {
                onChange({ ...step, afterStepMs: n })
              }
            }}
          />
        </label>
        <label className="flex items-end gap-2 text-xs">
          <input
            type="checkbox"
            checked={!!step.continueOnError}
            onChange={e => onChange({ ...step, continueOnError: e.target.checked })}
          />
          <span>失败时继续下一步</span>
        </label>
      </div>

      {step.type === 'foreach' && (
        <div className="space-y-1.5 rounded-md border border-dashed bg-[var(--color-muted)]/30 p-2">
          <div className="text-xs font-medium">循环源（要遍历哪个数组）</div>
          <div className="flex gap-2">
            {/* datalist 把上游 step outputs + 会话变量 都列出来 */}
            <div className="flex w-44 flex-col gap-0.5">
              <label className="text-[10px] text-[var(--color-muted-foreground)]">变量名（字面，不带 {`{{}}`}）</label>
              <input
                list={`varlist-${step.id}`}
                className="rounded-md border bg-[var(--color-background)] px-3 py-1 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                placeholder="如：slugs"
                value={step.source?.varName ?? ''}
                onChange={e => onChange({
                  ...step,
                  source: { varName: e.target.value, jsonPath: step.source?.jsonPath ?? '' },
                })}
              />
              <datalist id={`varlist-${step.id}`}>
                {/* 1. 前置 step 的 outputs ——最常用，放最前 */}
                {precedingOutputNames.map(n => (
                  <option key={`up-${n}`} value={n}>（上游 step 输出）</option>
                ))}
                {/* 2. 会话变量（旧） */}
                {varsList.map(v => (
                  <option key={`s-${v.name}`} value={v.name}>
                    {v.value.length > 40 ? v.value.slice(0, 40) + '…' : v.value}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="flex flex-1 flex-col gap-0.5">
              <label className="text-[10px] text-[var(--color-muted-foreground)]">二次 JSONPath（可选，值已经是数组就留空）</label>
              <Input
                className="font-mono"
                placeholder="留空 / $ / $[*] / $.data[*].id"
                value={step.source?.jsonPath ?? ''}
                onChange={e => onChange({
                  ...step,
                  source: { varName: step.source?.varName ?? '', jsonPath: e.target.value },
                })}
              />
            </div>
          </div>
          <div className="text-[11px] text-[var(--color-muted-foreground)]">
            两个框 <strong>不是模板</strong>，不要写 <code>{'{{slugs}}'}</code>。
            上一步 output 叫 <code>slugs</code> 就直接填 <code>slugs</code>；它已经是扁平数组就 JSONPath 留空。
            可选变量：上游 step outputs（{precedingOutputNames.length} 个）+ 会话池（{varsList.length} 个）。
            循环体内用 <code>{'{{item}}'}</code> / <code>{'{{item.xxx}}'}</code> 取当前元素。
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">请求模板</span>
          <div className="flex rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => updateRequest(r => ({ ...r, curl: r.curl ?? '' }))}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                isCurl
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'
              }`}
            >cURL 粘贴</button>
            <button
              type="button"
              onClick={() => updateRequest(r => {
                const { curl, ...rest } = r
                void curl
                return { ...rest, method: r.method ?? 'GET', url: r.url ?? '', headers: r.headers ?? {} }
              })}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                !isCurl
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                  : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'
              }`}
            >结构化</button>
          </div>

          {/* 从已保存请求一键载入；选完即载入，select 立刻重置回占位项 */}
          {savedList.length > 0 && (
            <select
              className="rounded-md border bg-[var(--color-background)] px-2 py-1"
              value=""
              onChange={e => {
                const id = e.target.value
                if (!id) return
                const saved = savedList.find(s => s.id === id)
                if (saved) importFromSaved(saved)
                e.target.value = ''
              }}
              title="从已保存请求拷贝到本 step（一次性载入，后续编辑不影响源）"
            >
              <option value="">↘ 从已保存请求载入</option>
              {savedList.map(s => {
                const oc = s.outputs?.length ?? 0
                const hasResp = !!s.lastResponseBody
                const suffix = [
                  oc > 0 ? `${oc} 个输出` : null,
                  hasResp ? '有响应样本' : null,
                ].filter(Boolean).join(' · ')
                return (
                  <option key={s.id} value={s.id}>
                    {s.name}{suffix ? ` (${suffix})` : '（无 outputs · 无响应样本）'}
                  </option>
                )
              })}
            </select>
          )}

          <span className="text-[var(--color-muted-foreground)]">
            cURL 和结构化都支持 <code>{'{{var}}'}</code> / <code>{'{{item.xxx}}'}</code>
          </span>
        </div>

        {/* 可用变量徽章——点击复制 {{name}} 到剪贴板，贴到 URL/headers/body 即用 */}
        {varsList.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-[var(--color-muted-foreground)]">可用变量（点击复制 {`{{name}}`}）：</span>
            {varsList.map(v => (
              <button
                key={v.name}
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(`{{${v.name}}}`).catch(() => {})
                }}
                className="rounded border bg-[var(--color-muted)] px-1.5 py-0.5 font-mono text-[10px] hover:bg-[var(--color-accent)]"
                title={`值: ${v.value.length > 80 ? v.value.slice(0, 80) + '…' : v.value}`}
              >
                {`{{${v.name}}}`}
              </button>
            ))}
          </div>
        )}
        {isCurl ? (
          // cURL 模式：保留 textarea 编辑（兼容已有 step），并提供「解析为结构化」一键转换
          <div className="space-y-1.5">
            <textarea
              className="min-h-[80px] w-full rounded-md border bg-[var(--color-background)] p-2 font-mono text-xs"
              value={step.request.curl ?? ''}
              placeholder="粘贴 cURL"
              onChange={e => {
                updateRequest(r => ({ ...r, curl: e.target.value }))
                if (parseError) setParseError(null)
              }}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={!(step.request.curl ?? '').trim()}
                onClick={() => {
                  const text = step.request.curl ?? ''
                  if (!text.trim()) return
                  try {
                    const parsed = parseCurl(text)
                    // 解析成功 → 切到结构化模式，把 method/url/headers/body 填好；丢掉 curl 字段
                    onChange({
                      ...step,
                      request: {
                        method: parsed.method,
                        url: parsed.url,
                        headers: parsed.headers,
                        body: parsed.body,
                      },
                    })
                    setParseError(null)
                  } catch (e) {
                    setParseError((e as Error).message)
                  }
                }}
                title="把当前 cURL 拆成 method/url/headers/body 字段，便于绑变量"
              >
                解析为结构化
              </Button>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                cURL 模式整段保留，运行时再解析；点左侧把它拆成结构化字段后即可对 URL/header/body 绑变量。
              </span>
            </div>
            {parseError && (
              <div className="text-xs text-[var(--color-destructive)]">
                解析失败：{parseError}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* 顶部「粘 cURL 一键解析填充」入口 */}
            <div className="rounded-md border border-dashed bg-[var(--color-muted)]/30 p-2">
              <div className="mb-1 text-xs text-[var(--color-muted-foreground)]">
                有 cURL？粘到这里点「解析填充」自动拆成下方字段（不会覆盖已配的变量绑定，会替换 method/url/headers/body）
              </div>
              <div className="flex gap-2">
                <textarea
                  className="min-h-[40px] flex-1 rounded-md border bg-[var(--color-background)] p-2 font-mono text-xs"
                  placeholder="curl 'https://...' -H '...' --data '...'"
                  value={pasteCurl}
                  onChange={e => { setPasteCurl(e.target.value); if (parseError) setParseError(null) }}
                />
                <Button size="sm" onClick={handleParseAndFill} disabled={!pasteCurl.trim()}>
                  解析填充
                </Button>
              </div>
              {parseError && (
                <div className="mt-1 text-xs text-[var(--color-destructive)]">
                  解析失败：{parseError}
                </div>
              )}
            </div>

            {/* 方法 + URL */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium">方法 + URL</div>
              <div className="flex gap-2">
                <select
                  className="rounded-md border bg-[var(--color-background)] px-2 text-sm"
                  value={step.request.method ?? 'GET'}
                  onChange={e => updateRequest(r => ({ ...r, method: e.target.value }))}
                >
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map(m => <option key={m}>{m}</option>)}
                </select>
                <VarBindableField
                  className="flex-1"
                  value={parsedUrl.base}
                  onChange={setBaseUrl}
                  options={varOptions}
                  placeholder="https://api.example.com/v1/path"
                />
              </div>
            </div>

            {/* Query 参数 */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium">Query 参数</span>
                <span className="text-[var(--color-muted-foreground)]">
                  ({parsedUrl.query.length} 个) · 每行 value 双击 / 点 🎯 绑变量
                </span>
              </div>
              <KeyValueFieldsEditor
                pairs={parsedUrl.query}
                onChange={setQuery}
                varOptions={varOptions}
                addLabel="+ 添加 query"
              />
            </div>

            {/* Headers */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium">Headers</span>
                <span className="text-[var(--color-muted-foreground)]">
                  ({headerPairs.length} 个)
                </span>
              </div>
              <KeyValueFieldsEditor
                pairs={headerPairs}
                onChange={setHeaderPairs}
                varOptions={varOptions}
                addLabel="+ 添加 header"
              />
            </div>

            {/* Body — 支持 JSON 树状 / 原文本切换 */}
            <BodyEditor
              body={step.request.body ?? ''}
              onChange={b => updateRequest(r => ({ ...r, body: b }))}
              varOptions={varOptions}
            />
          </div>
        )}
      </div>

      {/* import 反馈：让用户清楚这次具体载入了什么；2 秒后自动淡出 */}
      {importFeedback && Date.now() - importFeedback.at < 60_000 && (
        <div className="rounded border border-blue-500/40 bg-blue-500/10 p-2 text-xs">
          已从「<strong>{importFeedback.name}</strong>」载入：请求模板
          {importFeedback.outputsCount > 0
            ? ` + ${importFeedback.outputsCount} 个 outputs`
            : '（该请求未配置 outputs——可去「请求 / 变量」Tab 点 ✏ 给它加上，下次 import 就带过来）'}
          {importFeedback.hasResponse && '；下方可展开「参考响应」对照配置 outputs'}
        </div>
      )}

      {/* 参考响应：import 自 saved 时，把那条 saved 的 lastResponseBody 显示出来便于配 outputs */}
      {referenceSaved?.lastResponseBody && (
        <details className="rounded border bg-[var(--color-muted)]/40 p-2 text-xs">
          <summary className="cursor-pointer">
            参考响应（来自「{referenceSaved.name}」
            {referenceSaved.lastResponseAt && ` · ${formatRelativeTime(referenceSaved.lastResponseAt)}保存`}
            {referenceSaved.lastResponseBody.length >= 200 * 1024 && ' · 已截断'}）
          </summary>
          <div className="mt-2">
            <JsonViewer value={referenceSaved.lastResponseBody} maxHeight="288px" />
          </div>
        </details>
      )}

      <OutputsEditor
        outputs={step.outputs ?? []}
        onChange={outputs => onChange({ ...step, outputs })}
        hint={<>把响应里的字段存为变量，后续步骤可用 <code>{'{{name}}'}</code> 引用</>}
        responseBody={referenceSaved?.lastResponseBody ?? null}
      />
    </div>
  )
}

/** 简单相对时间格式化（避免引第三方库）。 */
function formatRelativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))} 秒前`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return new Date(epochMs).toLocaleString()
}

function parseHeaderText(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf(':')
    if (idx <= 0) continue
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return out
}

// ── 运行视图 ────────────────────────────────────────────────────────────────

interface StepProgress {
  index: number
  status?: number
  statusText?: string
  elapsedMs?: number
  sample?: string
  error?: string
  dryRun?: boolean
  method?: string
  url?: string
  bodySample?: string
}

interface StepRunState {
  status: 'pending' | 'running' | 'done' | 'failed'
  type?: 'single' | 'foreach'
  total?: number       // foreach 才有
  progress: StepProgress[]
  outputs?: Record<string, { type: string; sample?: string; size?: number }>
  finalStatus?: number
  finalStatusText?: string
  elapsedMs?: number
  error?: string
  // single dry-run
  method?: string
  url?: string
  headers?: Record<string, string>
  bodySample?: string
}

interface RunState {
  pipelineName: string
  totalSteps: number
  dryRun: boolean
  stepStates: StepRunState[]
  finished: boolean
  fatalError?: string
  abortedAtStep?: number
}

function handleSseEvent(
  eventName: string,
  d: Record<string, unknown>,
  setRunning: (updater: (prev: RunState | null) => RunState | null) => void,
) {
  setRunning(prev => {
    if (!prev) return prev
    if (eventName === 'pipeline-started') {
      return { ...prev, totalSteps: Number(d.totalSteps ?? prev.totalSteps) }
    }
    if (eventName === 'step-started') {
      const idx = Number(d.stepIndex)
      const next = prev.stepStates.slice()
      next[idx] = {
        ...next[idx],
        status: 'running',
        type: d.type as 'single' | 'foreach' | undefined,
        total: d.total !== undefined ? Number(d.total) : next[idx]?.total,
      }
      return { ...prev, stepStates: next }
    }
    if (eventName === 'step-progress') {
      const idx = Number(d.stepIndex)
      const next = prev.stepStates.slice()
      const entry = d as unknown as StepProgress
      next[idx] = {
        ...next[idx],
        status: 'running',
        progress: [...(next[idx]?.progress ?? []), entry],
      }
      return { ...prev, stepStates: next }
    }
    if (eventName === 'step-completed') {
      const idx = Number(d.stepIndex)
      const next = prev.stepStates.slice()
      next[idx] = {
        ...next[idx],
        status: 'done',
        finalStatus: d.status !== undefined ? Number(d.status) : undefined,
        finalStatusText: d.statusText as string | undefined,
        elapsedMs: d.elapsedMs !== undefined ? Number(d.elapsedMs) : undefined,
        outputs: d.outputs as Record<string, { type: string; sample?: string; size?: number }> | undefined,
        method: d.method as string | undefined,
        url: d.url as string | undefined,
        headers: d.headers as Record<string, string> | undefined,
        bodySample: d.bodySample as string | undefined,
      }
      return { ...prev, stepStates: next }
    }
    if (eventName === 'step-failed') {
      const idx = Number(d.stepIndex)
      const next = prev.stepStates.slice()
      next[idx] = { ...next[idx], status: 'failed', error: String(d.error) }
      return { ...prev, stepStates: next }
    }
    if (eventName === 'pipeline-completed') {
      return { ...prev, finished: true, abortedAtStep: d.aborted ? Number(d.abortedAtStep) : undefined }
    }
    if (eventName === 'pipeline-cancelled') {
      return { ...prev, finished: true, fatalError: '已取消' }
    }
    if (eventName === 'pipeline-error') {
      return { ...prev, finished: true, fatalError: String(d.message) }
    }
    return prev
  })
}

function RunView({
  state, onCancel, onClose,
}: {
  state: RunState
  onCancel: () => void
  onClose: () => void
}) {
  return (
    <div className="mt-4 space-y-3 rounded-lg border bg-[var(--color-background)] p-3">
      <div className="flex items-center gap-2 text-sm">
        {!state.finished && <Loader2 className="h-4 w-4 animate-spin" />}
        {state.finished && !state.fatalError && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {state.finished && state.fatalError && <XCircle className="h-4 w-4 text-red-500" />}
        <span className="font-medium">{state.pipelineName}</span>
        {state.dryRun && <Badge variant="outline">干跑</Badge>}
        <div className="ml-auto flex gap-1">
          {!state.finished && (
            <Button size="sm" variant="destructive" onClick={onCancel}>
              <Square />
              取消
            </Button>
          )}
          {state.finished && (
            <Button size="sm" variant="ghost" onClick={onClose}>
              关闭
            </Button>
          )}
        </div>
      </div>

      {state.fatalError && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-xs">
          {state.fatalError}
          {state.abortedAtStep !== undefined && (
            <span> · 中断于 Step #{state.abortedAtStep + 1}</span>
          )}
        </div>
      )}

      <ol className="space-y-2">
        {state.stepStates.map((s, idx) => (
          <li key={idx} className="rounded-md border p-2 text-sm">
            <StepRow index={idx} state={s} dryRun={state.dryRun} />
          </li>
        ))}
      </ol>
    </div>
  )
}

function StepRow({ index, state, dryRun }: { index: number; state: StepRunState; dryRun: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const pct = state.total && state.total > 0
    ? Math.round((state.progress.length / state.total) * 100)
    : 0
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-right text-xs text-[var(--color-muted-foreground)]">
          #{index + 1}
        </span>
        {state.status === 'pending' && <Badge variant="outline">待运行</Badge>}
        {state.status === 'running' && <Loader2 className="h-4 w-4 animate-spin" />}
        {state.status === 'done' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {state.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}

        {state.type === 'single' && state.finalStatus !== undefined && (
          <Badge variant={state.finalStatus >= 400 ? 'destructive' : 'secondary'}>
            {state.finalStatus} {state.finalStatusText}
          </Badge>
        )}
        {state.type === 'foreach' && state.total !== undefined && (
          <span className="text-xs">
            {state.progress.length} / {state.total}
          </span>
        )}
        {state.elapsedMs !== undefined && (
          <span className="text-xs text-[var(--color-muted-foreground)]">{state.elapsedMs} ms</span>
        )}
        {state.outputs && Object.keys(state.outputs).length > 0 && (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            → {Object.entries(state.outputs).map(([k, v]) =>
              `${k}${v.size !== undefined ? `(${v.size})` : ''}`,
            ).join(', ')}
          </span>
        )}
        <button
          className="ml-auto text-xs text-[var(--color-muted-foreground)]"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '收起' : '展开'}
        </button>
      </div>
      {state.type === 'foreach' && state.total && state.total > 0 && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]">
          <div
            className={`h-full ${state.status === 'failed' ? 'bg-red-500' : 'bg-[var(--color-primary)]'}`}
            style={{ width: `${pct}%`, transition: 'width 0.2s' }}
          />
        </div>
      )}
      {state.error && (
        <div className="mt-1 rounded border border-red-500/40 bg-red-500/10 p-1.5 text-xs">
          {state.error}
        </div>
      )}
      {expanded && (
        <div className="mt-2 space-y-1">
          {dryRun && state.type === 'single' && state.url && (
            <pre className="rounded bg-[var(--color-muted)] p-2 text-xs">
{state.method} {state.url}
{state.headers && Object.entries(state.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}
{state.bodySample ? '\n\n' + state.bodySample : ''}
            </pre>
          )}
          {state.progress.length > 0 && (
            <ul className="max-h-[480px] space-y-1 overflow-auto">
              {state.progress.map((p, i) => (
                <li key={i} className="rounded border p-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-right text-[var(--color-muted-foreground)]">
                      #{p.index + 1}
                    </span>
                    {p.dryRun
                      ? <Badge variant="outline">dry</Badge>
                      : p.error
                        ? <Badge variant="destructive">ERR</Badge>
                        : <Badge variant="secondary">{p.status} {p.statusText}</Badge>}
                    <span className="w-12 shrink-0 text-[var(--color-muted-foreground)]">
                      {p.elapsedMs}ms
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono"
                          title={p.error ?? p.sample ?? p.url ?? ''}>
                      {p.error ?? p.url ?? p.sample ?? ''}
                    </span>
                  </div>
                  {/* 后端只给前 3 个 item 附 bodySample——保留扁平 UI 的同时让用户能展开看完整响应 */}
                  {p.bodySample && (
                    <details className="mt-1 ml-12">
                      <summary className="cursor-pointer text-[var(--color-muted-foreground)]">
                        响应（前 3 条实时预览，{(p.bodySample.length / 1024).toFixed(1)} KB）
                      </summary>
                      <div className="mt-1">
                        <JsonViewer value={p.bodySample} maxHeight="280px" />
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ── 运行历史 Dialog ─────────────────────────────────────────────────────────

function RunHistoryDialog({ pipelineId, onClose }: { pipelineId: string; onClose: () => void }) {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: RUNS_KEY(pipelineId),
    queryFn: () => listPipelineRuns(pipelineId, 20),
  })
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const { data: detail } = useQuery({
    queryKey: selectedRunId ? ['browser-request', 'run', selectedRunId] : ['browser-request', 'run', '__none__'],
    queryFn: () => getPipelineRun(selectedRunId!),
    enabled: !!selectedRunId,
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex h-[80vh] w-[min(95vw,960px)] flex-col gap-3 rounded-lg border bg-[var(--color-card)] p-5 shadow-lg"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <History className="h-4 w-4" />
          <div className="text-base font-semibold">运行历史</div>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            最近 {runs.length} 次
          </span>
          <div className="ml-auto">
            <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-[280px_1fr] gap-3 overflow-hidden">
          <div className="overflow-auto rounded border p-1">
            {isLoading && <div className="p-2 text-xs text-[var(--color-muted-foreground)]">加载中…</div>}
            {runs.length === 0 && !isLoading && (
              <div className="p-3 text-center text-xs text-[var(--color-muted-foreground)]">
                还没有运行过
              </div>
            )}
            {runs.map(r => (
              <RunListItem
                key={r.id}
                run={r}
                selected={selectedRunId === r.id}
                onClick={() => setSelectedRunId(r.id)}
              />
            ))}
          </div>
          <div className="overflow-auto rounded border p-3">
            {!detail
              ? <div className="text-center text-sm text-[var(--color-muted-foreground)]">
                  选择左侧某次运行查看详情
                </div>
              : <RunDetailView detail={detail} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function RunListItem({
  run, selected, onClick,
}: {
  run: PipelineRunSummary
  selected: boolean
  onClick: () => void
}) {
  const statusColor =
    run.status === 'done' ? 'text-green-600'
    : run.status === 'failed' ? 'text-red-600'
    : run.status === 'cancelled' ? 'text-yellow-600'
    : 'text-[var(--color-muted-foreground)]'
  const startStr = new Date(run.startedAt).toLocaleString()
  const fc = run.summary?.failureCount ?? 0
  return (
    <button
      onClick={onClick}
      className={`block w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
        selected ? 'bg-[var(--color-accent)]' : 'hover:bg-[var(--color-accent)]'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`font-medium ${statusColor}`}>{run.status}</span>
        {run.dryRun && <Badge variant="outline">干跑</Badge>}
        {fc > 0 && <Badge variant="destructive">{fc} 失败</Badge>}
      </div>
      <div className="mt-0.5 text-[var(--color-muted-foreground)]">{startStr}</div>
    </button>
  )
}

function RunDetailView({ detail }: { detail: PipelineRunDetail }) {
  const failures = detail.failures ?? []
  const stepResponses = detail.summary?.stepResponses ?? []
  const stepOutputs = detail.summary?.stepOutputs ?? []
  // 把每步响应按 stepIndex 分组方便渲染
  const responsesByStep = useMemo(() => {
    const m = new Map<number, typeof stepResponses>()
    for (const r of stepResponses) {
      const arr = m.get(r.stepIndex) ?? []
      arr.push(r)
      m.set(r.stepIndex, arr)
    }
    return m
  }, [stepResponses])

  // 收集所有出现过的 stepIndex（按从小到大），来源含 stepResponses 和 stepOutputs
  const allSteps = useMemo(() => {
    const set = new Set<number>()
    for (const r of stepResponses) set.add(r.stepIndex)
    for (const o of stepOutputs) set.add(o.stepIndex)
    return Array.from(set).sort((a, b) => a - b)
  }, [stepResponses, stepOutputs])

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <div className="text-xs text-[var(--color-muted-foreground)]">运行 ID</div>
        <div className="font-mono text-xs">{detail.id}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-[var(--color-muted-foreground)]">状态</div>
          <div className="font-medium">{detail.status}{detail.dryRun && ' · 干跑'}</div>
        </div>
        <div>
          <div className="text-[var(--color-muted-foreground)]">开始</div>
          <div>{new Date(detail.startedAt).toLocaleString()}</div>
        </div>
        {detail.summary && (
          <>
            <div>
              <div className="text-[var(--color-muted-foreground)]">Steps</div>
              <div>
                ok {detail.summary.okSteps ?? 0} / failed {detail.summary.failedSteps ?? 0}
                {detail.summary.totalSteps !== undefined && ` / 总 ${detail.summary.totalSteps}`}
              </div>
            </div>
            <div>
              <div className="text-[var(--color-muted-foreground)]">失败明细</div>
              <div>{detail.summary.failureCount ?? failures.length} 条</div>
            </div>
          </>
        )}
      </div>

      {/* 每步详情：响应样本 + outputs，展开式 */}
      {allSteps.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium">每步详情（点击展开看响应）</div>
          <div className="space-y-1">
            {allSteps.map(idx => (
              <StepDetailEntry
                key={idx}
                stepIndex={idx}
                responses={responsesByStep.get(idx) ?? []}
                outputs={stepOutputs.find(o => o.stepIndex === idx)}
              />
            ))}
          </div>
        </div>
      )}

      {failures.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium">失败明细（{failures.length}）</div>
          <ul className="max-h-96 space-y-1 overflow-auto">
            {failures.map((f, i) => (
              <li key={i} className="rounded border border-red-500/40 bg-red-500/10 p-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">Step #{f.stepIndex + 1}</Badge>
                  <span className="font-medium">{f.stepName}</span>
                  {f.itemIndex !== null && f.itemIndex !== undefined && (
                    <span className="text-[var(--color-muted-foreground)]">item #{f.itemIndex + 1}</span>
                  )}
                </div>
                <div className="mt-1 font-mono">{f.error}</div>
                {f.itemSample && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[var(--color-muted-foreground)]">
                      item 样本
                    </summary>
                    <pre className="mt-1 max-h-32 overflow-auto rounded bg-[var(--color-muted)] p-1.5">
{f.itemSample}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** 单个 step 在历史 detail 里的卡片：默认折叠，展开后看响应样本 + outputs。 */
function StepDetailEntry({
  stepIndex, responses, outputs,
}: {
  stepIndex: number
  responses: Array<{
    stepName: string; type: 'single' | 'foreach'; itemIndex?: number
    status?: number; statusText?: string; elapsedMs?: number; sample?: string
  }>
  outputs: { stepName: string; outputs: Record<string, { type: string; sample?: unknown; value?: unknown; totalSize?: number; truncated?: boolean }> } | undefined
}) {
  const name = responses[0]?.stepName ?? outputs?.stepName ?? `Step ${stepIndex + 1}`
  const type = responses[0]?.type ?? 'single'
  const successCount = responses.length
  const firstStatus = responses[0]?.status
  return (
    <details className="rounded border bg-[var(--color-muted)]/30 text-xs">
      <summary className="cursor-pointer p-2">
        <span className="font-mono text-[var(--color-muted-foreground)]">#{stepIndex + 1}</span>
        <span className="ml-2 font-medium">{name}</span>
        <Badge variant={type === 'single' ? 'secondary' : 'default'} className="ml-2">{type}</Badge>
        {firstStatus !== undefined && (
          <Badge variant={firstStatus >= 400 ? 'destructive' : 'outline'} className="ml-1">
            {firstStatus}
          </Badge>
        )}
        {type === 'foreach' && (
          <span className="ml-2 text-[var(--color-muted-foreground)]">
            响应样本 {successCount} 条
          </span>
        )}
        {outputs && (
          <span className="ml-2 text-[var(--color-muted-foreground)]">
            outputs：{Object.keys(outputs.outputs).join(', ')}
          </span>
        )}
      </summary>
      <div className="space-y-2 border-t p-2">
        {/* outputs 展示 */}
        {outputs && Object.keys(outputs.outputs).length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
              outputs
            </div>
            <ul className="space-y-0.5">
              {Object.entries(outputs.outputs).map(([k, v]) => (
                <li key={k} className="flex gap-2 font-mono">
                  <span className="font-semibold">{k}</span>
                  <span className="text-[var(--color-muted-foreground)]">
                    {v.type}{v.totalSize !== undefined ? `[${v.totalSize}]` : ''}
                    {v.truncated && ' · 已截断到前 3 项'}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={JSON.stringify(v.sample ?? v.value)}>
                    {JSON.stringify(v.sample ?? v.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 响应样本（single 1 条；foreach 前 3 条） */}
        {responses.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
              响应样本（截断到 16KB）
            </div>
            {responses.map((r, i) => (
              <div key={i} className="rounded border bg-[var(--color-background)] p-1.5">
                <div className="mb-1 flex items-center gap-2">
                  {r.itemIndex !== undefined && (
                    <Badge variant="outline">item #{r.itemIndex + 1}</Badge>
                  )}
                  <Badge variant={(r.status ?? 0) >= 400 ? 'destructive' : 'secondary'}>
                    {r.status} {r.statusText}
                  </Badge>
                  <span className="text-[var(--color-muted-foreground)]">{r.elapsedMs} ms</span>
                </div>
                {r.sample ? (
                  <JsonViewer value={r.sample} maxHeight="288px" />
                ) : (
                  <div className="rounded bg-[var(--color-muted)] p-2 text-xs text-[var(--color-muted-foreground)]">
                    (空响应)
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  )
}

// ── Body 编辑器：JSON 树状 / 原文本 切换 ─────────────────────────────────────

function BodyEditor({
  body, onChange, varOptions,
}: {
  body: string
  onChange: (next: string) => void
  varOptions: VarOption[]
}) {
  const parsed = useMemo(() => parseJsonBody(body), [body])
  const isJsonLikely = body.trim() === '' || (parsed.ok && parsed.value !== null && typeof parsed.value === 'object')
  const [mode, setMode] = useState<'tree' | 'text'>(isJsonLikely ? 'tree' : 'text')

  // 当 body 变化（如 cURL 解析填充）且能解析为 JSON 时，自动切到 tree
  useEffect(() => {
    if (body && parsed.ok && parsed.value !== null && typeof parsed.value === 'object') {
      // 不强切——尊重用户当前选择，但首次加载 tree 默认即可
    }
  }, [body, parsed])

  const treeValue = parsed.ok ? parsed.value : null
  const canTree = parsed.ok && (treeValue === null || typeof treeValue === 'object')

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium">Body</span>
        <div className="flex rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => setMode('tree')}
            disabled={!canTree}
            className={`rounded px-2 py-0.5 ${
              mode === 'tree'
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'
            } ${!canTree ? 'opacity-50' : ''}`}
            title={canTree ? '' : '当前 body 不是合法 JSON 对象/数组，无法用树状编辑'}
          >
            JSON 树状
          </button>
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`rounded px-2 py-0.5 ${
              mode === 'text'
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'
            }`}
          >
            原文本
          </button>
        </div>
        <span className="text-[var(--color-muted-foreground)]">
          GET/HEAD 留空；变量引用 <code>{'{{var}}'}</code> 序列化时输出 raw
        </span>
      </div>

      {!parsed.ok && mode === 'tree' && (
        <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs">
          当前 body 不是合法 JSON：{parsed.err}。已自动切到原文本模式编辑。
        </div>
      )}

      {mode === 'tree' && canTree ? (
        <JsonTreeEditor
          value={treeValue ?? {}}
          onChange={v => onChange(serializeJsonBody(v))}
          varOptions={varOptions}
        />
      ) : (
        <textarea
          className="min-h-[80px] w-full rounded-md border bg-[var(--color-background)] p-2 font-mono text-xs"
          placeholder='{"key":"{{var}}"}'
          value={body}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
