import { useState, type MouseEvent } from 'react'
import { ChevronRight, FileText, FolderOpen, GitBranch, Info, Layers, Loader2, Pencil, Search, Trash2, Wrench, X } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { usePrompt } from '@/components/ui/prompt-dialog'
import type { DevDocEstimation, PrdSessionView } from '../types'
import { RawInputCard } from './RawInputCard'
import { EstimationDetailSheet } from './dialogs/EstimationDialogs'
import { ChangeGroupDialog } from './dialogs/SessionActionDialogs'
import { REQ_TYPE_CONFIG } from '../lib/requirementTypePresentation'

export function HistoryPanel({
  sessions,
  activeId,
  onSelect,
  onDelete,
  onRevise,
  onRename,
  onChangeGroup,
  onSplit,
  mobileOpen = false,
  onMobileClose,
}: {
  sessions: PrdSessionView[]
  activeId: string | null
  onSelect: (s: PrdSessionView) => void
  onDelete: (id: string) => void
  onRevise: (s: PrdSessionView) => void
  onRename: (id: string, title: string) => void
  onChangeGroup: (id: string, project: string) => void
  /** 打开「AI 需求拆分」确认弹框（对已存在的历史记录，随时都能拆，不限状态）。 */
  onSplit: (s: PrdSessionView) => void
  /** 移动端抽屉是否展开。桌面端（md 及以上）此值被忽略，侧边栏常驻。 */
  mobileOpen?: boolean
  onMobileClose?: () => void
}) {
  const confirm = useConfirm()
  const prompt = usePrompt()
  const [previewSession, setPreviewSession] = useState<PrdSessionView | null>(null)
  const [viewingEstimation, setViewingEstimation] = useState<DevDocEstimation | null>(null)
  const [changingGroupSession, setChangingGroupSession] = useState<PrdSessionView | null>(null)

  const handleDelete = async (e: MouseEvent, id: string) => {
    e.stopPropagation()
    const ok = await confirm({ title: '删除确认', description: '删除后不可恢复，包括本地 .md 文件。', variant: 'destructive' })
    if (ok) onDelete(id)
  }

  const handleRename = async (e: MouseEvent, s: PrdSessionView) => {
    e.stopPropagation()
    const newTitle = await prompt({
      title: '修改需求标题',
      defaultValue: s.title,
      placeholder: '需求标题',
      confirmText: '保存',
      validate: (v) => (v.trim() ? null : '标题不能为空'),
    })
    if (newTitle && newTitle !== s.title) onRename(s.id, newTitle)
  }

  // 按系统（关联项目）/ 用户筛选 + 标题搜索：project 是逗号/顿号分隔的多选字符串，按 token
  // 匹配（命中其中任意一个即算，不要求恰好等于整个字符串）；用户按 createdByUsername 精确
  // 匹配（非 ADMIN 视角本来就只看得到自己的记录，这个筛选主要给 ADMIN 用）。
  const [filterProject, setFilterProject] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const splitProjectTags = (project: string | null) =>
    (project ?? '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean)

  const projectOptions = Array.from(
    new Set(sessions.flatMap((s) => splitProjectTags(s.project)))
  ).sort((a, b) => a.localeCompare(b, 'zh'))

  const handleChangeGroup = (e: MouseEvent, s: PrdSessionView) => {
    e.stopPropagation()
    setChangingGroupSession(s)
  }

  const confirmChangeGroup = (s: PrdSessionView, project: string) => {
    const currentProjects = splitProjectTags(s.project)
    // 分组取关联项目首项；换组时保留其余关联项目，移到“未分类”则清空全部关联。
    const nextProject = project === '未分类'
      ? ''
      : [project, ...currentProjects.slice(1).filter((item) => item !== project)].join(', ')
    onChangeGroup(s.id, nextProject)
    setChangingGroupSession(null)
  }

  const userOptions = Array.from(
    new Set(sessions.map((s) => s.createdByUsername).filter((u): u is string => !!u))
  ).sort((a, b) => a.localeCompare(b, 'zh'))

  // PRD 层级结构：需求拆分子项和修订版都通过 parentId 挂在来源 PRD 下面。按 parentId 建
  // 父子映射；根节点 = 没有 parentId，或 parentId 指向的记录不在当前列表里（父记录被删掉/
  // 不在当前用户可见范围）——后一种情况兜底当根处理，避免子记录因为找不到父节点而彻底消失。
  const byId = new Map(sessions.map((s) => [s.id, s]))
  const childrenMap = new Map<string, PrdSessionView[]>()
  for (const s of sessions) {
    if (s.parentId && byId.has(s.parentId)) {
      const arr = childrenMap.get(s.parentId) ?? []
      arr.push(s)
      childrenMap.set(s.parentId, arr)
    }
  }
  const roots = sessions.filter((s) => !s.parentId || !byId.has(s.parentId))

  // 筛选只作用于根节点：一个子需求的 project/creator 通常直接继承自父需求，筛选到父需求
  // 就该看到它完整的拆分子树，没必要对每个子节点再单独判一次（会把子树打散、体验更差）。
  const filteredRoots = roots.filter((s) => {
    if (filterProject && !splitProjectTags(s.project).includes(filterProject)) return false
    if (filterUser && s.createdByUsername !== filterUser) return false
    if (searchQuery.trim() && !s.title.toLowerCase().includes(searchQuery.trim().toLowerCase())) return false
    return true
  })

  // 按「主项目」（多选字符串的第一个 token）分组展示，呼应用户要的"层级关系清晰"——
  // 项目分组 > 父 PRD > 子 PRD 三层。没有关联项目的归到"未分类"。只有一个分组时不展示
  // 分组头（大部分人只用一个项目，加一层没有信息量的分组标题反而是噪音）。
  const groupedRoots: { project: string; items: PrdSessionView[] }[] = []
  const groupIndex = new Map<string, number>()
  for (const s of filteredRoots) {
    const p = splitProjectTags(s.project)[0] ?? '未分类'
    let i = groupIndex.get(p)
    if (i === undefined) {
      i = groupedRoots.length
      groupIndex.set(p, i)
      groupedRoots.push({ project: p, items: [] })
    }
    groupedRoots[i].items.push(s)
  }
  const showGroupHeaders = groupedRoots.length > 1

  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set())
  const toggleProjectCollapse = (p: string) =>
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p); else next.add(p)
      return next
    })
  const toggleParentCollapse = (id: string) =>
    setCollapsedParents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  return (
    <>
      {/* 原始需求弹出卡片 */}
      {previewSession && (
        <RawInputCard
          session={previewSession}
          requirementType={REQ_TYPE_CONFIG[previewSession.reqType ?? 'NEW_MODULE']}
          onClose={() => setPreviewSession(null)}
        />
      )}

      {/* AI 工时评估详情：历史列表里点徽标只读查看，评估动作在开发文档 Tab 工具栏 */}
      {viewingEstimation && (
        <EstimationDetailSheet estimation={viewingEstimation} onClose={() => setViewingEstimation(null)} />
      )}

      {changingGroupSession && (
        <ChangeGroupDialog
          session={changingGroupSession}
          projectOptions={projectOptions}
          onConfirm={(group) => confirmChangeGroup(changingGroupSession, group)}
          onClose={() => setChangingGroupSession(null)}
        />
      )}

      {/* 移动端抽屉遮罩：点击关闭。桌面端不渲染（侧边栏是常驻列，不需要遮罩） */}
      {mobileOpen && (
        <div className="absolute inset-0 z-30 bg-black/40 md:hidden" onClick={onMobileClose} />
      )}

      {/*
       * 移动端窄屏塞不下「256px 固定侧栏 + 表单」两列（表单只剩百来像素，文字会被挤成竖排一字一行），
       * 所以这里在 md 以下改成脱离文档流的抽屉：默认平移出屏，展开时滑入并盖一层遮罩；
       * md 及以上退回原来的常驻列（absolute → static，translate 归零）。
       */}
      <div
        className={`absolute inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-card)] transition-transform duration-200
          md:static md:z-auto md:w-64 md:max-w-none md:flex-shrink-0 md:translate-x-0 md:bg-transparent md:transition-none
          ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-3 py-2.5 text-sm font-semibold border-b border-[var(--color-border)]">
          PRD 库
          <button
            type="button"
            onClick={onMobileClose}
            className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] md:hidden"
            title="收起 PRD 库"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 搜索 + 筛选栏：标题搜索 + 系统（关联项目）/ 用户下拉，任一没有可选项时不展示对应下拉 */}
        <div className="px-2.5 py-2 space-y-1.5 border-b border-[var(--color-border)]">
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索 PRD…"
              className="w-full pl-6 pr-2 py-1 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-[11px] text-[var(--color-foreground)]"
            />
          </div>
          {(projectOptions.length > 0 || userOptions.length > 0) && (
            <div className="grid grid-cols-2 gap-1.5">
              {projectOptions.length > 0 && (
                <select
                  value={filterProject}
                  onChange={(e) => setFilterProject(e.target.value)}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input)] px-1.5 py-1 text-[11px] text-[var(--color-foreground)]"
                >
                  <option value="">全部项目</option>
                  {projectOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}
              {userOptions.length > 0 && (
                <select
                  value={filterUser}
                  onChange={(e) => setFilterUser(e.target.value)}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input)] px-1.5 py-1 text-[11px] text-[var(--color-foreground)]"
                >
                  <option value="">全部负责人</option>
                  {userOptions.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          {(filterProject || filterUser || searchQuery) && (
            <button
              type="button"
              onClick={() => { setFilterProject(''); setFilterUser(''); setSearchQuery('') }}
              className="text-[10px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:underline"
            >
              清除筛选
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 && (
            <div className="p-3 text-xs text-[var(--color-muted-foreground)]">暂无记录</div>
          )}
          {sessions.length > 0 && filteredRoots.length === 0 && (
            <div className="p-3 text-xs text-[var(--color-muted-foreground)]">没有匹配筛选条件的记录</div>
          )}
          {groupedRoots.map((g) => {
            const collapsed = collapsedProjects.has(g.project)
            return (
              <div key={g.project}>
                {showGroupHeaders && (
                  <button
                    type="button"
                    onClick={() => toggleProjectCollapse(g.project)}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-muted)]/30 border-y border-[var(--color-border)] text-left hover:bg-[var(--color-muted)]/50"
                  >
                    <ChevronRight className={`w-3 h-3 flex-shrink-0 text-[var(--color-muted-foreground)] transition-transform ${!collapsed ? 'rotate-90' : ''}`} />
                    <span className="text-xs font-semibold truncate">{g.project}</span>
                    <span className="text-[10px] text-[var(--color-muted-foreground)] ml-auto flex-shrink-0">{g.items.length} 个父需求</span>
                  </button>
                )}
                {!collapsed && g.items.map((s) => (
                  <HistoryItem
                    key={s.id}
                    session={s}
                    depth={0}
                    childrenMap={childrenMap}
                    activeId={activeId}
                    collapsedParents={collapsedParents}
                    onToggleCollapse={toggleParentCollapse}
                    onSelect={onSelect}
                    onRevise={onRevise}
                    onSplit={onSplit}
                    onRenameClick={handleRename}
                    onChangeGroupClick={handleChangeGroup}
                    onDeleteClick={handleDelete}
                    onPreview={setPreviewSession}
                    onViewEstimation={setViewingEstimation}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

/** 状态徽标文案 + 配色（提到组件外，HistoryItem 递归渲染时复用同一份，不用每层重建）。 */
const HISTORY_STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  CLARIFYING: '澄清中',
  GENERATING: '生成中',
  DONE: 'DONE',
  ERROR: '出错',
}
const HISTORY_STATUS_BADGE: Record<string, string> = {
  DRAFT: 'text-[var(--color-muted-foreground)] border-[var(--color-border)]',
  CLARIFYING: 'text-yellow-500 border-yellow-500/30',
  GENERATING: 'text-blue-500 border-blue-500/30',
  DONE: 'text-green-500 border-green-500/30',
  ERROR: 'text-red-500 border-red-500/30',
}

/**
 * 历史列表的一行（递归）：先渲染自己，再递归渲染 childrenMap 里挂在自己下面的子需求
 * （深度不设上限——正常只有「需求拆分」产生一层子节点，但子需求本身也是完整 PRD 会话，
 * 理论上可以再被拆一次，递归结构天然支持，不用另外加限制）。有子需求时行首带一个可点击
 * 折叠的箭头（默认展开），呼应"层级关系显示清晰"——列表长了可以自己收起不关心的分支。
 *
 * 开发文档不再单独占一行/单独一个可点击入口：点这一行本身进入 PRD 后，EditingPanel 只要
 * 检测到已有开发文档就会自动切到开发文档 Tab（见 EditingPanel 的 panelMode 初始值），
 * "点 PRD 就能看开发文档"，列表这里只用一小行文字展示版本号/是否过期，不需要重复一个入口。
 */
function HistoryItem({
  session: s,
  depth,
  childrenMap,
  activeId,
  collapsedParents,
  onToggleCollapse,
  onSelect,
  onRevise,
  onSplit,
  onRenameClick,
  onChangeGroupClick,
  onDeleteClick,
  onPreview,
  onViewEstimation,
}: {
  session: PrdSessionView
  depth: number
  childrenMap: Map<string, PrdSessionView[]>
  activeId: string | null
  collapsedParents: Set<string>
  onToggleCollapse: (id: string) => void
  onSelect: (s: PrdSessionView) => void
  onRevise: (s: PrdSessionView) => void
  onSplit: (s: PrdSessionView) => void
  onRenameClick: (e: MouseEvent, s: PrdSessionView) => void
  onChangeGroupClick: (e: MouseEvent, s: PrdSessionView) => void
  onDeleteClick: (e: MouseEvent, id: string) => void
  onPreview: (s: PrdSessionView) => void
  onViewEstimation: (est: DevDocEstimation | null) => void
}) {
  const children = childrenMap.get(s.id) ?? []
  const hasChildren = children.length > 0
  const collapsed = collapsedParents.has(s.id)
  const doneChildren = children.filter((c) => c.status === 'DONE').length
  const devDocVersionCount = s.devDocHistory.length > 0 ? s.devDocHistory.length : (s.devDocPath ? 1 : 0)
  const devDocStale = !!s.devDocPath && (!s.devDocGeneratedAt || s.devDocGeneratedAt < s.updatedAt)
  const hasMetrics = hasChildren || !!s.devDocPath || !!s.devDocEstimation
    || s.devDocWorkStatus === 'ERROR' || s.devDocWorkStatus === 'GENERATING' || !!s.errorMsg

  return (
    <>
      <div
        onClick={() => onSelect(s)}
        style={{ paddingLeft: 6 + depth * 16 }}
        className={`group flex items-start gap-1.5 pr-3 py-2 cursor-pointer hover:bg-[var(--color-muted)]/40 transition-colors
          ${s.id === activeId ? 'bg-[var(--color-muted)]/60' : ''}`}
      >
        {/* 折叠箭头（有子需求才显示，占位对齐没有子需求的行） */}
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleCollapse(s.id) }}
            className="mt-0.5 flex-shrink-0 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            title={collapsed ? '展开子需求' : '收起子需求'}
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${!collapsed ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}
        {depth > 0
          ? <GitBranch className="w-3 h-3 mt-0.5 flex-shrink-0 text-indigo-400 rotate-90" />
          : <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[var(--color-muted-foreground)]" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium truncate flex-1">{s.title}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border leading-tight flex-shrink-0 ${HISTORY_STATUS_BADGE[s.status] ?? 'text-[var(--color-muted-foreground)] border-[var(--color-border)]'}`}>
              {HISTORY_STATUS_LABEL[s.status] ?? s.status}
            </span>
          </div>
          {/* 项目/负责人 + 角色/需求类型标签 */}
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {(s.project || s.createdByUsername) && (
              <span className="text-[10px] text-[var(--color-muted-foreground)] truncate">
                {[s.project, s.createdByUsername].filter(Boolean).join(' · ')}
              </span>
            )}
            {/* 角色/需求类型标签：草稿阶段这两个字段只是占位默认值（还没到判定环节），
                显示出来反而误导，等转正式发起澄清后才有意义 */}
            {s.status !== 'DRAFT' && (s.role === 'BUSINESS' ? (
              <span className="text-[9px] px-1 rounded bg-green-500/15 text-green-500 border border-green-500/20 leading-tight">业务</span>
            ) : (
              <span className="text-[9px] px-1 rounded bg-blue-500/15 text-blue-500 border border-blue-500/20 leading-tight">产品</span>
            ))}
            {s.status !== 'DRAFT' && (() => {
              const cfg = REQ_TYPE_CONFIG[s.reqType ?? 'NEW_MODULE']
              return (
                <span className={`text-[9px] px-1 rounded border leading-tight ${cfg.bg} ${cfg.color}`}>
                  {cfg.label}
                </span>
              )
            })()}
            <span className={`text-[9px] px-1 rounded border leading-tight ${s.documentProfile === 'SPEC_DRIVEN' ? 'bg-violet-500/15 text-violet-500 border-violet-500/20' : 'bg-slate-500/10 text-[var(--color-muted-foreground)] border-[var(--color-border)]'}`}>
              {s.documentProfile === 'SPEC_DRIVEN' ? '规格驱动' : '经典文档'}
            </span>
          </div>

          {/* 指标行：子 PRD 完成度 / 开发文档版本(过期高亮) / AI 工时区间，一眼看全貌 */}
          {hasMetrics && (
            <div className="flex items-center gap-2.5 mt-1 text-[10px] text-[var(--color-muted-foreground)] flex-wrap">
              {hasChildren && <span>{doneChildren}/{children.length} 子 PRD</span>}
              {s.devDocPath && (
                <span className={`flex items-center gap-0.5 ${devDocStale ? 'text-amber-500' : ''}`}
                  title={devDocStale ? `${s.documentProfile === 'SPEC_DRIVEN' ? '执行计划' : '开发文档'}已过期，点进去后可重新生成` : `已生成${s.documentProfile === 'SPEC_DRIVEN' ? '执行计划' : '开发文档'}，点这一行进去查看`}>
                  <Wrench className="w-2.5 h-2.5" />
                  {devDocStale ? `⚠ ${s.documentProfile === 'SPEC_DRIVEN' ? '执行计划' : '开发文档'}` : (s.documentProfile === 'SPEC_DRIVEN' ? '执行计划' : '开发文档')}{devDocVersionCount > 0 ? ` · v${devDocVersionCount}` : ''}
                </span>
              )}
              {s.devDocWorkStatus === 'GENERATING' && (
                <span className="flex items-center gap-0.5 text-blue-500">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />开发文档后台生成中
                </span>
              )}
              {s.devDocWorkStatus === 'ERROR' && (
                <span className="max-w-full truncate text-red-500" title={s.devDocWorkError || '开发文档生成失败'}>
                  ⚠ 开发文档失败：{s.devDocWorkError || '未知原因'}
                </span>
              )}
              {s.status === 'ERROR' && s.errorMsg && (
                <span className="max-w-full truncate text-red-500" title={s.errorMsg}>⚠ PRD 失败：{s.errorMsg}</span>
              )}
              {s.devDocEstimation && (
                <button
                  onClick={(e) => { e.stopPropagation(); onViewEstimation(s.devDocEstimation) }}
                  className="hover:text-blue-400"
                  title="查看 AI 工时评估详情"
                >
                  {s.devDocEstimation.hoursMin}-{s.devDocEstimation.hoursMax}h
                </button>
              )}
            </div>
          )}
        </div>
        {/* 操作按钮区（hover 显示） */}
        <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
          {/* 生成修订版（DONE 状态才显示） */}
          {s.status === 'DONE' && (
            <button
              onClick={(e) => { e.stopPropagation(); onRevise(s) }}
              className="text-[var(--color-muted-foreground)] hover:text-amber-500"
              title="基于此版本生成修订版"
            >
              <GitBranch className="w-3 h-3" />
            </button>
          )}
          {/* AI 需求拆分：任意状态都能拆，只要求有需求描述可分析 */}
          {s.rawInput && s.rawInput.trim() && (
            <button
              onClick={(e) => { e.stopPropagation(); onSplit(s) }}
              className="text-[var(--color-muted-foreground)] hover:text-indigo-400"
              title="AI 需求拆分：判断是否该拆成多个子需求"
            >
              <Layers className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={(e) => onRenameClick(e, s)}
            className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)]"
            title="修改需求标题"
          >
            <Pencil className="w-3 h-3" />
          </button>
          {depth === 0 && (
            <button
              onClick={(e) => onChangeGroupClick(e, s)}
              className="text-[var(--color-muted-foreground)] hover:text-blue-500"
              title="修改分组（整棵子 PRD 树会一起移动）"
            >
              <FolderOpen className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onPreview(s) }}
            className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)]"
            title="查看原始需求"
          >
            <Info className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => onDeleteClick(e, s.id)}
            className="text-[var(--color-muted-foreground)] hover:text-red-500"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      {hasChildren && !collapsed && children.map((child) => (
        <HistoryItem
          key={child.id}
          session={child}
          depth={depth + 1}
          childrenMap={childrenMap}
          activeId={activeId}
          collapsedParents={collapsedParents}
          onToggleCollapse={onToggleCollapse}
          onSelect={onSelect}
          onRevise={onRevise}
          onSplit={onSplit}
          onRenameClick={onRenameClick}
          onChangeGroupClick={onChangeGroupClick}
          onDeleteClick={onDeleteClick}
          onPreview={onPreview}
          onViewEstimation={onViewEstimation}
        />
      ))}
    </>
  )
}
