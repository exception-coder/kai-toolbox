import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Plus, Save, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { recordings, tasks as taskApi } from '../api'
import type {
  CreateTaskBody, HttpCallView, ParamSpec, StepSpec, UpdateTaskBody,
} from '../types'
import { TaskStepEditor } from '../components/TaskStepEditor'

interface Props {
  sessionId: string
  /** 从录制派生新建时传 recordingId；编辑现有 task 时传 taskId */
  recordingId?: string
  taskId?: string
  onClose: (saved: boolean) => void
}

/**
 * 编排页：从录制派生新建 task / 编辑现有 task。
 * 左侧：录制内的 call 清单（仅 create 模式）；点「+」加为 step
 * 右侧：当前 steps，每个用 TaskStepEditor 展开参数化/抽取/重命名
 * 顶部：task name + params + 选项 + 保存/取消
 */
export function TaskCanvasPage({ sessionId, recordingId, taskId, onClose }: Props) {
  const isEditing = !!taskId
  const [name, setName] = useState('新任务')
  const [steps, setSteps] = useState<StepSpec[]>([])
  const [params, setParams] = useState<ParamSpec[]>([])
  const [stepIntervalMs, setStepIntervalMs] = useState<number>(200)
  // step 间随机化上限：null 表示固定 stepIntervalMs；> stepIntervalMs 时区间内均匀随机
  const [stepIntervalMaxMs, setStepIntervalMaxMs] = useState<number | null>(null)
  // 迭代间隔：同 step fan-out 循环之间，单独配置（重复调同一接口最容易触发风控）
  const [iterationIntervalMs, setIterationIntervalMs] = useState<number>(5000)
  const [iterationIntervalMaxMs, setIterationIntervalMaxMs] = useState<number | null>(null)
  const [continueOnError, setContinueOnError] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // 「录制内的调用」面板搜索词：按 URL / method 关键字过滤；空时全显示
  const [callSearchKw, setCallSearchKw] = useState('')

  // 拉录制（用于源 call 列表）
  const { data: recordingDetail } = useQuery({
    queryKey: ['browser-request', 'recording-detail', recordingId ?? 'none'],
    queryFn: () => recordings.detail(recordingId!, { withCalls: true, limit: 500 }),
    enabled: !!recordingId,
  })

  // 拉现有 task（编辑模式）
  const { data: existingTask } = useQuery({
    queryKey: ['browser-request', 'task', taskId ?? 'none'],
    queryFn: () => taskApi.detail(taskId!),
    enabled: !!taskId,
  })

  useEffect(() => {
    if (existingTask) {
      setName(existingTask.name)
      setSteps(existingTask.steps)
      setParams(existingTask.params)
      setStepIntervalMs(existingTask.options?.stepIntervalMs ?? 200)
      setStepIntervalMaxMs(existingTask.options?.stepIntervalMaxMs ?? null)
      setIterationIntervalMs(existingTask.options?.iterationIntervalMs ?? 5000)
      setIterationIntervalMaxMs(existingTask.options?.iterationIntervalMaxMs ?? null)
      setContinueOnError(existingTask.options?.continueOnError ?? false)
    }
  }, [existingTask])

  // 把 step 关联回原 call（用于 TaskStepEditor 显示原始 url/body + 响应）
  const callById = useMemo(() => {
    const map = new Map<string, HttpCallView>()
    if (recordingDetail?.calls) for (const c of recordingDetail.calls) map.set(c.id, c)
    return map
  }, [recordingDetail])

  // 自动同步 params 列表：所有 step.parameterizations 用到的 varName + 所有 step.extracts 提供的 name 都应该被显示
  // 实际：params 由用户显式管理；extracts 名进入 outputs，不进 params。
  // 这里推断当前已使用的变量列表给 ParameterizeBubble 联想 + 自动加 missing 的 params 到列表
  const usedVars = useMemo(() => {
    const set = new Set<string>()
    for (const s of steps) {
      for (const p of s.parameterizations ?? []) set.add(p.varName)
    }
    return set
  }, [steps])
  const providedVars = useMemo(() => {
    const set = new Set<string>()
    for (const s of steps) {
      for (const e of s.extracts ?? []) set.add(e.name)
    }
    return set
  }, [steps])
  /** 用户需要在回放时填的：被引用但不是上游 extract 产物。 */
  const requiredParams = useMemo(
    () => Array.from(usedVars).filter(v => !providedVars.has(v)),
    [usedVars, providedVars]
  )

  // 把缺失的 param 自动加进 params 列表（一次性同步）
  useEffect(() => {
    setParams(prev => {
      const existingNames = new Set(prev.map(p => p.name))
      const additions: ParamSpec[] = requiredParams
        .filter(n => !existingNames.has(n))
        .map(n => ({ name: n, kind: 'string', defaultValue: '' }))
      if (additions.length === 0) return prev
      return [...prev, ...additions]
    })
  }, [requiredParams])

  const addStepFromCall = (call: HttpCallView) => {
    const newStep: StepSpec = {
      name: call.method + ' ' + new URL(call.url, 'http://x.local').pathname,
      fromCallId: call.id,
      adhoc: {
        method: call.method,
        url: call.url,
        headers: call.requestHeaders,
        body: call.requestBody ?? null,
        // 把响应体快照进 step，保证以后编辑时不依赖 recording 是否还在
        responseSample: call.responseBody ?? null,
      },
      parameterizations: [],
      extracts: [],
    }
    setSteps(prev => [...prev, newStep])
  }

  const updateStep = (idx: number, next: StepSpec) => {
    setSteps(prev => prev.map((s, i) => (i === idx ? next : s)))
  }

  const removeStep = (idx: number) => {
    setSteps(prev => prev.filter((_, i) => i !== idx))
  }

  const moveStep = (idx: number, dir: -1 | 1) => {
    setSteps(prev => {
      const next = prev.slice()
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }

  const createMut = useMutation({
    mutationFn: (body: CreateTaskBody) => taskApi.create(body),
    onSuccess: () => onClose(true),
    onError: e => setSaveError((e as Error).message),
  })
  const updateMut = useMutation({
    mutationFn: (body: UpdateTaskBody) => taskApi.update(taskId!, body),
    onSuccess: () => onClose(true),
    onError: e => setSaveError((e as Error).message),
  })

  const save = () => {
    setSaveError(null)
    if (!name.trim()) { setSaveError('任务名不能为空'); return }
    if (steps.length === 0) { setSaveError('至少需要 1 个 step'); return }
    // 随机上限只有大于对应下限才传，否则后端会忽略
    const sendStepMax = stepIntervalMaxMs != null && stepIntervalMaxMs > stepIntervalMs
      ? stepIntervalMaxMs : null
    const sendIterMax = iterationIntervalMaxMs != null && iterationIntervalMaxMs > iterationIntervalMs
      ? iterationIntervalMaxMs : null
    if (isEditing) {
      updateMut.mutate({
        name: name.trim(), steps, params,
        stepIntervalMs, stepIntervalMaxMs: sendStepMax,
        iterationIntervalMs, iterationIntervalMaxMs: sendIterMax,
        continueOnError,
      })
    } else {
      createMut.mutate({
        sessionId, recordingId: recordingId ?? null,
        name: name.trim(), steps, params,
        stepIntervalMs, stepIntervalMaxMs: sendStepMax,
        iterationIntervalMs, iterationIntervalMaxMs: sendIterMax,
        continueOnError,
      })
    }
  }

  const saving = createMut.isPending || updateMut.isPending

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => onClose(false)}>
              <ArrowLeft className="size-4" />
              返回
            </Button>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              className="flex-1 font-medium"
              placeholder="任务名"
            />
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存
            </Button>
          </div>

          {saveError && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-300">
              {saveError}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="mb-1 font-medium text-[var(--color-muted-foreground)]" title="两次执行之间的下限延迟（含 step 间和迭代间）">
                step 间隔（ms） · 下限
              </div>
              <Input
                type="number"
                value={stepIntervalMs}
                onChange={e => setStepIntervalMs(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1 font-medium text-[var(--color-muted-foreground)]" title="勾上则每次延迟在 [下限, 上限] 内均匀随机——对付循环类风控有用">
                随机上限（ms）
                <label className="ml-1 flex cursor-pointer items-center gap-1 text-[10px]">
                  <input
                    type="checkbox"
                    checked={stepIntervalMaxMs != null}
                    onChange={e => setStepIntervalMaxMs(e.target.checked ? Math.max(stepIntervalMs * 2, stepIntervalMs + 500) : null)}
                    className="size-3.5 accent-[var(--color-primary)]"
                  />
                  启用
                </label>
              </div>
              <Input
                type="number"
                value={stepIntervalMaxMs ?? ''}
                disabled={stepIntervalMaxMs == null}
                placeholder="留空 = 固定下限值"
                onChange={e => setStepIntervalMaxMs(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <div className="mb-1 font-medium text-[var(--color-muted-foreground)]">失败策略</div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={continueOnError}
                  onChange={e => setContinueOnError(e.target.checked)}
                  className="size-4 accent-[var(--color-primary)]"
                />
                step 失败时继续执行后续 step（缺省 false——遇错即停）
              </label>
            </div>

            <div className="col-span-3">
              <div className="mb-1 text-[10px] font-medium text-[var(--color-muted-foreground)]">
                · 迭代间隔（step 内 fan-out 循环之间的延迟，通常比 step 间隔大；重复调同一接口最容易触发风控）
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="mb-1 font-medium text-[var(--color-muted-foreground)]" title="同 step fan-out 迭代之间的下限延迟（ms）">
                    迭代间隔（ms）· 下限
                  </div>
                  <Input
                    type="number"
                    value={iterationIntervalMs}
                    onChange={e => setIterationIntervalMs(Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-1 font-medium text-[var(--color-muted-foreground)]" title="勾上则迭代间隔在 [下限, 上限] 内均匀随机">
                    迭代随机上限（ms）
                    <label className="ml-1 flex cursor-pointer items-center gap-1 text-[10px]">
                      <input
                        type="checkbox"
                        checked={iterationIntervalMaxMs != null}
                        onChange={e => setIterationIntervalMaxMs(e.target.checked ? Math.max(iterationIntervalMs * 2, iterationIntervalMs + 5000) : null)}
                        className="size-3.5 accent-[var(--color-primary)]"
                      />
                      启用
                    </label>
                  </div>
                  <Input
                    type="number"
                    value={iterationIntervalMaxMs ?? ''}
                    disabled={iterationIntervalMaxMs == null}
                    placeholder="留空 = 固定下限值"
                    onChange={e => setIterationIntervalMaxMs(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>
          </div>

          <ParamsEditor params={params} onChange={setParams} usedVars={Array.from(usedVars)} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-12 gap-3">
        {recordingId && (() => {
          const allCalls = recordingDetail?.calls ?? []
          const kw = callSearchKw.trim().toLowerCase()
          // 关键字匹配：URL 含 OR method 全等（'POST' 准确匹配，但 'POS' 也走 URL）
          const filteredCalls = kw
            ? allCalls.filter(c =>
                c.url.toLowerCase().includes(kw) ||
                c.method.toLowerCase() === kw,
              )
            : allCalls
          return (
          <Card className="col-span-4">
            <CardContent className="p-2">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                <span>录制内的调用</span>
                <span className="text-[var(--color-muted-foreground)]">
                  ({kw ? `${filteredCalls.length} / ${allCalls.length}` : allCalls.length})
                </span>
              </div>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
                <Input
                  value={callSearchKw}
                  onChange={e => setCallSearchKw(e.target.value)}
                  placeholder="搜 URL 或 method（如 POST / /api/docs）"
                  className="h-8 pl-7 text-xs"
                />
              </div>
              <div className="max-h-[60vh] space-y-1 overflow-auto">
                {filteredCalls.map(c => (
                  <button
                    key={c.id}
                    onClick={() => addStepFromCall(c)}
                    className="flex w-full items-center gap-2 rounded-md border p-2 text-left text-xs hover:bg-[var(--color-accent)]"
                  >
                    <span className="shrink-0 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold">
                      {c.method}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono" title={c.url}>
                      {kw ? highlightUrl(c.url, kw) : c.url}
                    </span>
                    {c.status != null && (
                      <Badge variant="secondary">{c.status}</Badge>
                    )}
                    <Plus className="size-3 text-[var(--color-muted-foreground)]" />
                  </button>
                ))}
                {allCalls.length === 0 && (
                  <div className="rounded-md border border-dashed p-3 text-center text-[10px] text-[var(--color-muted-foreground)]">
                    源录制为空
                  </div>
                )}
                {allCalls.length > 0 && filteredCalls.length === 0 && (
                  <div className="rounded-md border border-dashed p-3 text-center text-[10px] text-[var(--color-muted-foreground)]">
                    没有调用匹配「{callSearchKw}」
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          )
        })()}

        <div className={recordingId ? 'col-span-8 space-y-3' : 'col-span-12 space-y-3'}>
          {steps.length === 0 && (
            <Card><CardContent className="p-4 text-center text-xs text-[var(--color-muted-foreground)]">
              {recordingId ? '点左侧调用 + 把它加为 step' : '没有 step。返回去录制重新派生'}
            </CardContent></Card>
          )}
          {steps.map((s, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-muted-foreground)]">
                <span>#{i + 1}</span>
                <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => moveStep(i, -1)} className="h-5 px-1">↑</Button>
                <Button size="sm" variant="ghost" disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)} className="h-5 px-1">↓</Button>
                {s.fromCallId && <span className="font-mono">fromCallId: {s.fromCallId.slice(0, 8)}…</span>}
              </div>
              <TaskStepEditor
                step={s}
                call={s.fromCallId ? callById.get(s.fromCallId) ?? null : null}
                varSuggestions={[...usedVars, ...providedVars, ...params.map(p => p.name)]}
                onChange={next => updateStep(i, next)}
                onRemove={() => removeStep(i)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ParamsEditor({
  params, onChange, usedVars,
}: {
  params: ParamSpec[]
  onChange: (next: ParamSpec[]) => void
  usedVars: string[]
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-[var(--color-muted-foreground)]">
        参数（回放时填）· 已使用 {usedVars.length} 个变量
      </div>
      <ul className="space-y-1">
        {params.length === 0 && (
          <li className="text-[10px] text-[var(--color-muted-foreground)]">
            （没有参数；在 step 上标变量后会自动出现在这里）
          </li>
        )}
        {params.map((p, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <code className="w-32 truncate rounded bg-[var(--color-muted)] px-1 font-mono" title={p.name}>{p.name}</code>
            <select
              className="rounded-md border bg-[var(--color-background)] p-1 text-xs"
              value={p.kind}
              onChange={e =>
                onChange(params.map((pp, j) => j === i ? { ...pp, kind: e.target.value as ParamSpec['kind'] } : pp))
              }
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
            </select>
            <Input
              className="flex-1"
              placeholder="默认值（可空）"
              value={p.defaultValue ?? ''}
              onChange={e =>
                onChange(params.map((pp, j) => j === i ? { ...pp, defaultValue: e.target.value } : pp))
              }
            />
            <Button
              size="sm" variant="ghost"
              onClick={() => onChange(params.filter((_, j) => j !== i))}
              title="移除参数（变量仍在 step 中使用时回放会失败）"
            >
              <Trash2 className="size-3" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 在 URL 上把命中关键字片段套 mark 高亮（大小写不敏感）。 */
function highlightUrl(url: string, kw: string): ReactNode {
  if (!kw) return url
  const lower = url.toLowerCase()
  const kwLower = kw.toLowerCase()
  const parts: ReactNode[] = []
  let i = 0
  let hit = lower.indexOf(kwLower, i)
  let n = 0
  while (hit >= 0) {
    if (hit > i) parts.push(url.slice(i, hit))
    parts.push(
      <mark key={n++} className="bg-amber-300/70 text-current dark:bg-amber-500/50">
        {url.slice(hit, hit + kw.length)}
      </mark>,
    )
    i = hit + kw.length
    hit = lower.indexOf(kwLower, i)
  }
  if (i < url.length) parts.push(url.slice(i))
  return parts.length === 0 ? url : <>{parts}</>
}
