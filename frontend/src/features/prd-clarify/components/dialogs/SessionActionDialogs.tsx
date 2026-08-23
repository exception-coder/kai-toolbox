import { useEffect, useState } from 'react'
import { FileText, FolderOpen, GitBranch, Layers, Loader2, Sparkles, X } from 'lucide-react'
import { Combobox } from '@/components/ui/combobox'
import { adoptSplit, splitRequirement } from '../../api'
import type { PrdSessionView, SplitItem } from '../../types'

type ClarifyEngine = 'claude' | 'codex'

export function ReviseDialog({
  original,
  onConfirm,
  onClose,
}: {
  original: PrdSessionView
  onConfirm: (changeDesc: string, engine: ClarifyEngine) => void
  onClose: () => void
}) {
  const [changeDesc, setChangeDesc] = useState('')
  const [engine, setEngine] = useState<ClarifyEngine>(original.engine === 'codex' ? 'codex' : 'claude')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[var(--color-primary)]" />
            <span className="font-semibold text-sm">重新探索修订版</span>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-[var(--color-muted-foreground)]" /></button>
        </div>
        {/* 原版信息 */}
        <div className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/20 px-5 py-3">
          <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            <FileText className="w-3.5 h-3.5" />
            <span>基于：</span>
            <span className="font-medium text-[var(--color-foreground)] truncate">{original.title}</span>
          </div>
          <p className="text-[11px] text-[var(--color-muted-foreground)] mt-1.5 leading-relaxed">
            将基于原核心规格重新探索并生成初始化规格，确认后形成新版本。
            需要需求方判定的事项会写入规格，不会进入逐题问答。
          </p>
        </div>
        {/* 修订说明 */}
        <div className="px-5 py-4">
          <label className="block text-sm font-medium mb-2">
            修订说明（可选）
          </label>
          <textarea
            value={changeDesc}
            onChange={e => setChangeDesc(e.target.value)}
            rows={4}
            placeholder="描述本次修订的背景和主要变更点，如：
· 增加了多收货地址功能
· 调整了审批流程：去掉二级审批
· 修正了某业务规则"
            className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
          />
          <div className="mt-4">
            <label className="block text-sm font-medium mb-2">执行引擎</label>
            <div className="grid grid-cols-2 gap-2">
              {([['claude', 'Claude Code'], ['codex', 'Codex']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEngine(value)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    engine === value
                      ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/8 text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--color-muted-foreground)]">
              默认继承原版本使用的引擎，本次修订可单独切换。
            </p>
          </div>
        </div>
        {/* 操作 */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--color-border)]">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
            取消
          </button>
          <button
            onClick={() => onConfirm(changeDesc, engine)}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            <GitBranch className="w-3.5 h-3.5" />
            开始重新探索
          </button>
        </div>
      </div>
    </div>
  )
}

// ───── AI 需求拆分确认弹框 ─────
/**
 * 打开即自动触发一次 AI 拆分分析（只读，不落库）；用户可以对每个建议的子需求勾选采纳/
 * 编辑标题描述/整条移除，确认后点「采纳」才真正批量创建 DRAFT 子草稿（parentId 指向
 * sessionId）。canSplit=false 时（需求本身已经够聚焦）只展示判断理由，没有可操作列表。
 */
export function SplitReviewDialog({
  sessionId,
  onClose,
  onAdopted,
}: {
  sessionId: string
  onClose: () => void
  onAdopted: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [canSplit, setCanSplit] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const [items, setItems] = useState<(SplitItem & { selected: boolean })[]>([])
  const [adopting, setAdopting] = useState(false)

  const runSplit = () => {
    setLoading(true)
    setError(null)
    splitRequirement(sessionId)
      .then((res) => {
        setCanSplit(res.canSplit)
        setReason(res.reason)
        setItems(res.items.map((it) => ({ ...it, selected: true })))
      })
      .catch((e) => setError(e instanceof Error ? e.message : '拆分失败，请重试'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    runSplit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const toggle = (i: number) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, selected: !it.selected } : it)))
  const updateField = (i: number, field: 'title' | 'rawInput' | 'module', value: string) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)))
  const removeItem = (i: number) =>
    setItems((prev) => prev.filter((_, idx) => idx !== i))

  const selectedCount = items.filter((it) => it.selected).length

  const handleAdopt = async () => {
    setAdopting(true)
    setError(null)
    try {
      const payload = items
        .filter((it) => it.selected)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ selected, ...rest }) => rest)
      await adoptSplit(sessionId, payload)
      onAdopted()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '采纳失败，请重试')
    } finally {
      setAdopting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold text-sm">AI 需求拆分</span>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-[var(--color-muted-foreground)]" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-[var(--color-muted-foreground)]">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm">Claude 正在分析需求，判断是否需要拆分…</p>
            </div>
          )}
          {!loading && error && (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-red-500 text-center">{error}</p>
              <button onClick={runSplit} className="text-xs underline text-[var(--color-primary)]">重试</button>
            </div>
          )}
          {!loading && !error && !canSplit && (
            <div className="text-center py-8">
              <Sparkles className="w-8 h-8 mx-auto opacity-20 mb-3" />
              <p className="text-sm font-medium mb-1">该需求已经足够聚焦，无需拆分</p>
              {reason && <p className="text-xs text-[var(--color-muted-foreground)]">{reason}</p>}
            </div>
          )}
          {!loading && !error && canSplit && (
            <>
              {reason && (
                <p className="text-xs text-[var(--color-muted-foreground)] mb-3 bg-indigo-500/5 border border-indigo-500/15 rounded-lg px-3 py-2">
                  {reason}
                </p>
              )}
              {items.length === 0 ? (
                <p className="text-xs text-[var(--color-muted-foreground)] text-center py-6">已全部移除，没有可采纳的子需求了</p>
              ) : (
                <div className="space-y-3">
                  {items.map((it, i) => (
                    <div key={i} className={`rounded-xl border p-3 transition-colors ${it.selected ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-[var(--color-border)] opacity-50'}`}>
                      <div className="flex items-start gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={it.selected}
                          onChange={() => toggle(i)}
                          className="mt-1.5 flex-shrink-0"
                        />
                        <input
                          value={it.title}
                          onChange={(e) => updateField(i, 'title', e.target.value)}
                          className="flex-1 px-2 py-1 text-sm font-medium rounded border border-[var(--color-border)] bg-[var(--color-input)]"
                        />
                        <button onClick={() => removeItem(i)} className="text-[var(--color-muted-foreground)] hover:text-red-500 flex-shrink-0" title="从列表中移除（不采纳）">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <textarea
                        value={it.rawInput}
                        onChange={(e) => updateField(i, 'rawInput', e.target.value)}
                        rows={3}
                        className="w-full px-2 py-1.5 text-xs rounded border border-[var(--color-border)] bg-[var(--color-input)] resize-y"
                      />
                      <input
                        value={it.module ?? ''}
                        onChange={(e) => updateField(i, 'module', e.target.value)}
                        placeholder="建议归属模块（可选，留空则继承父需求的模块）"
                        className="mt-1.5 w-full px-2 py-1 text-[11px] rounded border border-[var(--color-border)] bg-[var(--color-input)]"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 底部操作：canSplit 且还有可采纳项时才显示，其它情况（分析中/失败/不建议拆）只有关闭 */}
        {!loading && !error && canSplit && items.length > 0 && (
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--color-border)] flex-shrink-0">
            <button onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
              取消
            </button>
            <button
              disabled={selectedCount === 0 || adopting}
              onClick={handleAdopt}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adopting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
              采纳 {selectedCount} 项，生成草稿
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ───── 历史侧边栏 ─────
export function ChangeGroupDialog({
  session,
  projectOptions,
  onConfirm,
  onClose,
}: {
  session: PrdSessionView
  projectOptions: string[]
  onConfirm: (group: string) => void
  onClose: () => void
}) {
  const currentGroup = (session.project ?? '').split(/[,，、]/).map((item) => item.trim()).find(Boolean) ?? '未分类'
  const [group, setGroup] = useState(currentGroup)
  const options = [
    ...projectOptions.filter((item) => item !== '未分类').map((item) => ({ value: item, label: item })),
    { value: '未分类', label: '未分类' },
  ]
  const targetGroup = group.trim()
  const isNew = targetGroup !== '' && targetGroup !== '未分类' && !projectOptions.includes(targetGroup)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl overflow-visible">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-blue-500" />
            <span className="font-semibold text-sm">修改规格分组</span>
          </div>
          <button type="button" onClick={onClose}>
            <X className="w-4 h-4 text-[var(--color-muted-foreground)]" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="text-xs text-[var(--color-muted-foreground)]">
            <span>当前规格：</span>
            <span className="font-medium text-[var(--color-foreground)]">{session.title}</span>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">目标分组</label>
            <Combobox
              value={group}
              onChange={setGroup}
              options={options}
              placeholder="选择现有分组或输入新分组名称"
              emptyText="没有匹配的现有分组，保存后将创建新分组"
              showAllOnOpen
            />
            <p className="mt-2 text-[11px] text-[var(--color-muted-foreground)]">
              展开会显示全部 {projectOptions.length} 个现有分组；直接输入新名称即可创建。
            </p>
            {isNew && (
              <p className="mt-1 text-[11px] text-blue-500">将创建新分组“{targetGroup}”</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]/40"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!targetGroup || targetGroup === currentGroup}
            onClick={() => onConfirm(targetGroup)}
            className="px-5 py-2 text-sm font-medium rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-40"
          >
            移动
          </button>
        </div>
      </div>
    </div>
  )
}
