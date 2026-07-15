import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen, Code2, Edit2, Layers, Loader2, Plus, RefreshCw, Search, Trash2,
} from 'lucide-react'
import {
  createItem, deleteItem, listItems, startClarify, syncFromPrd, updateItem,
} from '../api'
import type { CreateReqRequest, ReqItemView, ReqPriority, ReqStatus, UpdateReqRequest } from '../types'
import { PRIORITY_META, STATUS_META } from '../types'
import { useConfirm } from '@/components/ui/confirm-dialog'

// ───── 工具组件 ─────
function StatusBadge({ status }: { status: ReqStatus }) {
  const m = STATUS_META[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-semibold ${m.bg} ${m.color}`}>
      {m.label}
    </span>
  )
}

function PriorityDot({ priority }: { priority: ReqPriority }) {
  const m = PRIORITY_META[priority]
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${m.dot}`} />
      <span className={`text-xs ${m.color} font-medium`}>{m.label}</span>
    </div>
  )
}

function isOverdue(deadline: string | null): boolean {
  if (!deadline) return false
  return new Date(deadline) < new Date()
}

// ───── 状态过滤器 ─────
const STATUS_TABS: Array<{ value: ReqStatus | ''; label: string }> = [
  { value: '', label: '全部' },
  { value: 'DRAFT', label: '草稿' },
  { value: 'CLARIFYING', label: '澄清中' },
  { value: 'PRD_READY', label: 'PRD就绪' },
  { value: 'IN_DEV', label: '开发中' },
  { value: 'DONE', label: '已完成' },
]

// ───── 新建/编辑表单 Sheet ─────
function ReqFormSheet({
  item,
  onClose,
  onSaved,
}: {
  item?: ReqItemView | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!item
  const [title, setTitle] = useState(item?.title ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [project, setProject] = useState(item?.project ?? '')
  const [module, setModule] = useState(item?.module ?? '')
  const [priority, setPriority] = useState<ReqPriority>(item?.priority ?? 'MEDIUM')
  const [status, setStatus] = useState<ReqStatus>(item?.status ?? 'DRAFT')
  const [assignee, setAssignee] = useState(item?.assignee ?? '')
  const [deadline, setDeadline] = useState(item?.deadline ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      if (isEdit && item) {
        const req: UpdateReqRequest = {
          title: title.trim(), description: description.trim(),
          project: project.trim(), module: module.trim(),
          priority, status, assignee: assignee.trim(), deadline: deadline.trim() || undefined,
        }
        await updateItem(item.id, req)
      } else {
        const req: CreateReqRequest = {
          title: title.trim(), description: description.trim(),
          project: project.trim(), module: module.trim(),
          priority, assignee: assignee.trim(), deadline: deadline.trim() || undefined,
        }
        await createItem(req)
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]'

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-[var(--color-card)] border-l border-[var(--color-border)] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Layers className="w-4 h-4 text-[var(--color-primary)]" />
            {isEdit ? '编辑需求' : '新建需求'}
          </div>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--color-muted-foreground)] mb-1 block">需求标题 *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="用一句话描述需求" />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--color-muted-foreground)] mb-1 block">详细描述</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              rows={5} className={`${inputCls} resize-y`}
              placeholder="描述业务背景、期望效果、约束条件等，越详细越有助于 AI 澄清…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--color-muted-foreground)] mb-1 block">项目</label>
              <input value={project} onChange={e => setProject(e.target.value)} className={inputCls} placeholder="如：kai-toolbox" />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--color-muted-foreground)] mb-1 block">模块</label>
              <input value={module} onChange={e => setModule(e.target.value)} className={inputCls} placeholder="如：tool-reqpool" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--color-muted-foreground)] mb-1 block">优先级</label>
              <select value={priority} onChange={e => setPriority(e.target.value as ReqPriority)} className={inputCls}>
                <option value="HIGH">🔴 高</option>
                <option value="MEDIUM">🟡 中</option>
                <option value="LOW">🟢 低</option>
              </select>
            </div>
            {isEdit && (
              <div>
                <label className="text-xs font-medium text-[var(--color-muted-foreground)] mb-1 block">状态</label>
                <select value={status} onChange={e => setStatus(e.target.value as ReqStatus)} className={inputCls}>
                  {Object.entries(STATUS_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--color-muted-foreground)] mb-1 block">负责人</label>
              <input value={assignee} onChange={e => setAssignee(e.target.value)} className={inputCls} placeholder="如：张三" />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--color-muted-foreground)] mb-1 block">截止日期</label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border)]">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-[var(--color-border)] hover:bg-[var(--color-muted)]">取消</button>
          <button
            disabled={!title.trim() || saving}
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

// ───── 主页面 ─────
export function ReqPoolPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [statusFilter, setStatusFilter] = useState<ReqStatus | ''>('')
  const [search, setSearch] = useState('')
  const [editItem, setEditItem] = useState<ReqItemView | null | 'new'>(null)

  const { data: items = [], isFetching } = useQuery({
    queryKey: ['reqpool', statusFilter],
    queryFn: () => listItems(statusFilter ? { status: statusFilter } : undefined),
  })

  const syncMut = useMutation({
    mutationFn: syncFromPrd,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reqpool'] }),
  })

  // 页面挂载时自动静默同步（把 prd_session 的最新状态同步到需求管理池）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { syncMut.mutate() }, [])

  const deleteMut = useMutation({
    mutationFn: deleteItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reqpool'] }),
  })

  const clarifyMut = useMutation({
    mutationFn: startClarify,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reqpool'] }),
  })

  const filtered = items.filter(item =>
    !search || item.title.includes(search) ||
    (item.project ?? '').includes(search) ||
    (item.module ?? '').includes(search)
  )

  const handleDelete = async (item: ReqItemView) => {
    const ok = await confirm({
      title: '删除需求',
      description: `确认删除「${item.title}」？此操作不可恢复。`,
      variant: 'destructive',
    })
    if (ok) deleteMut.mutate(item.id)
  }

  /** 将已知的技术模块 ID 转换为中文业务名（用于 prd-clarify 展示与 PRD 生成提示词） */
  const toModuleDisplayName = (moduleId: string | null): string => {
    if (!moduleId) return ''
    const MAP: Record<string, string> = {
      'tool-reqpool':     '需求管理池',
      'tool-prd-clarify': 'PRD澄清助手',
      'tool-resume':      '简历管理',
      'tool-treesize':    '磁盘分析',
      'tool-downloader':  '下载管理',
      'tool-ai-chat':     'AI对话',
      'tool-claude-chat': 'Vibe Coding',
      'tool-projects':    '项目管理',
    }
    return MAP[moduleId] ?? moduleId
  }

  /** 开始澄清：先更新状态，再跳转到 prd-clarify 并带上需求数据 */
  const handleStartClarify = async (item: ReqItemView) => {
    await clarifyMut.mutateAsync(item.id)
    const params = new URLSearchParams({
      title: item.title,
      rawInput: item.description ?? '',
      project: item.project ?? '',
      module: toModuleDisplayName(item.module),  // 中文业务名，不传技术 ID
      reqItemId: item.id,
    })
    navigate(`/tools/prd-clarify?${params.toString()}`)
  }

  /** 跳转到 prd-clarify 查看已关联的 PRD 会话 */
  const handleViewPrd = (item: ReqItemView) => {
    if (item.prdSessionId) {
      navigate(`/tools/prd-clarify?viewSession=${item.prdSessionId}`)
    }
  }

  // 真正没有数据（非过滤结果为空）
  const isEmpty = items.length === 0 && !isFetching && !search && !statusFilter

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 工具栏 */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-card)]">
        {/* 搜索 */}
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-muted-foreground)]" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索需求…"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-input)] focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
          />
        </div>

        {/* 状态 tabs */}
        <div className="flex items-center gap-1">
          {STATUS_TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setStatusFilter(t.value as ReqStatus | '')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                statusFilter === t.value
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* 自动同步进行中时显示小加载指示 */}
          {(isFetching || syncMut.isPending) && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-muted-foreground)]" />
          )}
          <button
            onClick={() => navigate('/tools/prd-clarify')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-[var(--color-primary)] text-white hover:opacity-90"
          >
            <Plus className="w-3.5 h-3.5" /> 写新需求
          </button>
        </div>
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-auto">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--color-muted-foreground)]">
            <Layers className="w-12 h-12 opacity-20" />
            <div className="text-center">
              <p className="font-medium text-[var(--color-foreground)] mb-1">
                {syncMut.isPending ? '正在同步 PRD 历史…' : '暂无需求记录'}
              </p>
              <p className="text-sm">
                {syncMut.isPending
                  ? '从 PRD 澄清助手读取已有记录，请稍候'
                  : '在 PRD 澄清助手中完成需求澄清并生成 PRD 后，会自动在此登记'}
              </p>
            </div>
            {!syncMut.isPending && (
              <button
                onClick={() => navigate('/tools/prd-clarify')}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-[var(--color-primary)] text-white hover:opacity-90"
              >
                <Plus className="w-4 h-4" /> 写新需求
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/30">
                <th className="text-left text-xs font-medium text-[var(--color-muted-foreground)] px-4 py-2.5 w-16">优先级</th>
                <th className="text-left text-xs font-medium text-[var(--color-muted-foreground)] px-4 py-2.5">需求标题</th>
                <th className="text-left text-xs font-medium text-[var(--color-muted-foreground)] px-4 py-2.5 w-36">项目/模块</th>
                <th className="text-left text-xs font-medium text-[var(--color-muted-foreground)] px-4 py-2.5 w-28">状态</th>
                <th className="text-left text-xs font-medium text-[var(--color-muted-foreground)] px-4 py-2.5 w-28">截止日期</th>
                <th className="text-left text-xs font-medium text-[var(--color-muted-foreground)] px-4 py-2.5 w-52">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const overdue = isOverdue(item.deadline) && !['DONE', 'CANCELLED'].includes(item.status)
                return (
                  <tr key={item.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-muted)]/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <PriorityDot priority={item.priority} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{item.title}</div>
                      {item.description && (
                        <div className="text-xs text-[var(--color-muted-foreground)] mt-0.5 line-clamp-1">
                          {item.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted-foreground)]">
                      {item.project && <div>{item.project}</div>}
                      {item.module && <div className="text-[10px] opacity-70">{item.module}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className={`px-4 py-2.5 text-xs ${overdue ? 'text-red-500 font-medium' : 'text-[var(--color-muted-foreground)]'}`}>
                      {item.deadline ?? '—'}
                      {overdue && ' ⚠'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* 开始澄清（DRAFT 状态） */}
                        {item.status === 'DRAFT' && (
                          <button
                            onClick={() => handleStartClarify(item)}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20 font-medium transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" /> 开始澄清
                          </button>
                        )}
                        {/* 继续澄清（CLARIFYING 状态） */}
                        {item.status === 'CLARIFYING' && (
                          <button
                            onClick={() => handleStartClarify(item)}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20 font-medium transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" /> 继续澄清
                          </button>
                        )}
                        {/* 查看 PRD（有 PRD 时） */}
                        {item.prdSessionId && (
                          <button
                            onClick={() => handleViewPrd(item)}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-500 hover:bg-blue-500/20 transition-colors"
                          >
                            <BookOpen className="w-3 h-3" /> PRD
                          </button>
                        )}
                        {/* 开始开发（PRD_READY 状态） */}
                        {item.status === 'PRD_READY' && (
                          <button
                            onClick={() => navigate('/tools/claude-chat')}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md bg-green-500/10 border border-green-500/20 text-green-500 hover:bg-green-500/20 transition-colors"
                          >
                            <Code2 className="w-3 h-3" /> 开始开发
                          </button>
                        )}
                        {/* 编辑 */}
                        <button
                          onClick={() => setEditItem(item)}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)] transition-colors"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        {/* 删除 */}
                        <button
                          onClick={() => handleDelete(item)}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-[var(--color-border)] hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-500 text-[var(--color-muted-foreground)] transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 新建/编辑 Sheet */}
      {editItem !== null && (
        <ReqFormSheet
          item={editItem === 'new' ? null : editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['reqpool'] })}
        />
      )}
    </div>
  )
}
