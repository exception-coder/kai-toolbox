import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  saveContent,
} from '../../api'
import type { DevDocEstimation } from '../../types'
import type { ClarifyEngine } from '../dialogs/StartClarifyDialog'
import { useDevDocEstimation } from '../../hooks/useDevDocEstimation'
import { useDevDocState } from '../../hooks/useDevDocState'
import { EditingPanelContent, type EditingPanelMode, type EditingViewMode } from './EditingPanelContent'
import { EditingPanelDialogs } from './EditingPanelDialogs'
import { EditingPanelToolbar } from './EditingPanelToolbar'

export function EditingPanel({
  sessionId,
  sessionTitle,
  projectName,
  initialContent,
  mdPath,
  devDocPath,
  hasDevDoc,
  isDevDocStale,
  initialDevDocEstimation,
  currentEngine,
  initialProgressPath,
  initialProgressGeneratedAt,
  initialDevDocWorkStatus,
  initialDevDocWorkError,
  initialDevDocWorkProgress,
  initialDevDocWorkContent,
  onReturnToClarify,
  onReset,
}: {
  sessionId: string
  sessionTitle: string
  projectName: string | null
  initialContent: string
  /** PRD 文件绝对路径（~/.kai-toolbox/prd/{id}.md），供「复制路径」按钮用，方便直接定位文件 */
  mdPath?: string | null
  /** 开发文档文件绝对路径，同上；尚未生成开发文档时为 null */
  devDocPath?: string | null
  /** 从历史加载时，该 PRD 是否已有开发文档（devDocPath 非空） */
  hasDevDoc?: boolean
  /** 开发文档是否过期（PRD 在开发文档生成后有更新，需要重新生成） */
  isDevDocStale?: boolean
  /** 从历史加载时该会话已有的 AI 工时评估结果（无则 null），评估/重新评估后本地状态覆盖它 */
  initialDevDocEstimation?: DevDocEstimation | null
  /** 当前 PRD 会话引擎；TDD 澄清默认继承，用户仍可在弹窗中切换。 */
  currentEngine: ClarifyEngine
  /** 从历史加载时该会话已有的进度评估文档路径（无则 null），评估过一次后本地状态覆盖它 */
  initialProgressPath?: string | null
  /** 同上，进度评估最后生成时间戳 */
  initialProgressGeneratedAt?: number | null
  /** 服务端执行计划任务状态与快照，供刷新后恢复后台生成。 */
  initialDevDocWorkStatus?: 'BUILDING_QUESTIONS' | 'AWAITING_ANSWERS' | 'GENERATING' | 'ERROR' | 'DONE' | null
  initialDevDocWorkError?: string | null
  initialDevDocWorkProgress?: string | null
  initialDevDocWorkContent?: string | null
  /** PRD 已生成但业务澄清不充分时，保留现有文档并回到原会话继续澄清。 */
  onReturnToClarify: () => Promise<void>
  onReset: () => void
}) {
  const specificationLabel = '核心规格'
  const planLabel = '执行计划'
  const [content, setContent] = useState(initialContent)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [returningToClarify, setReturningToClarify] = useState(false)
  const [returnToClarifyError, setReturnToClarifyError] = useState<string | null>(null)
  const confirm = useConfirm()
  /** PRD 内部视图（只在 panelMode=prd 时有效） */
  const [prdViewMode, setPrdViewMode] = useState<EditingViewMode>('split')
  const [showDevDialog, setShowDevDialog] = useState(false)

  // ── 顶层面板模式：prd（仅 PRD）| dev（仅开发文档）| side（并排） ──
  // hasDevDoc=true 时默认进入 dev 模式，让用户直接看到开发文档全屏
  const [panelMode, setPanelMode] = useState<EditingPanelMode>(
    hasDevDoc || initialDevDocWorkStatus === 'GENERATING' || initialDevDocWorkStatus === 'ERROR' ? 'dev' : 'prd',
  )
  /** 开发文档内部视图模式（仅 dev Tab 有效） */
  const [devViewMode, setDevViewMode] = useState<EditingViewMode>('split')

  /** 「生成开发文档」确认弹框：非 null 时打开，值决定弹框文案/是否走"基于当前更新"模式。 */
  const [genDevDocMode, setGenDevDocMode] = useState<'generate' | 'regenerate' | 'update' | null>(null)
  /** 「生成记录」只读抽屉是否打开：追溯每一版是基于什么补充说明/更新澄清生成的。 */
  const [showDevDocHistory, setShowDevDocHistory] = useState(false)
  /** 「本版澄清」抽屉是否打开：只看当前显示版本自己的澄清问答，跟 PRD 的澄清记录完全独立。 */
  const [showDevDocClarify, setShowDevDocClarify] = useState(false)
  /** 正在预览的历史版本；null 表示预览弹框未打开。isCurrent 由 DevDocHistorySheet 拉取时一并给出。 */
  const [viewingDevDocVersion, setViewingDevDocVersion] = useState<{ version: number; isCurrent: boolean } | null>(null)

  const estimationState = useDevDocEstimation({
    sessionId,
    initialEstimation: initialDevDocEstimation,
    initialProgressPath,
    initialProgressGeneratedAt,
  })
  const {
    estimation: devDocEstimation,
    estimateDialogOpen: showEstimateDialog,
    setEstimateDialogOpen: setShowEstimateDialog,
    estimating,
    estimateError,
    estimationDetailOpen: showEstimationDetail,
    setEstimationDetailOpen: setShowEstimationDetail,
    progressPath,
    progressGeneratedAt,
    progressDialogOpen: showEvaluateProgress,
    setProgressDialogOpen: setShowEvaluateProgress,
    progressHistoryOpen: showProgressHistory,
    setProgressHistoryOpen: setShowProgressHistory,
    progressVersion: viewingProgressVersion,
    setProgressVersion: setViewingProgressVersion,
    estimateEffort: handleEstimateEffort,
    markProgressEvaluated: handleProgressEvaluated,
    closeEstimateDialog,
  } = estimationState

  const devDocState = useDevDocState({
    sessionId,
    hasDevDoc: Boolean(hasDevDoc),
    active: panelMode !== 'prd',
    workStatus: initialDevDocWorkStatus,
    workError: initialDevDocWorkError,
    workProgress: initialDevDocWorkProgress,
    workContent: initialDevDocWorkContent,
  })
  const {
    content: devDocContent,
    streaming: devDocStreaming,
    progress: devDocProgress,
    loading: devDocLoading,
    dirty: devDocDirty,
    saving: devDocSaving,
    error: devDocError,
    clearError: clearDevDocError,
    generate: generateDevDoc,
    changeContent: changeDevDocContent,
    save: handleSaveDevDoc,
  } = devDocState

  const handleGenerateDevDoc = (...args: Parameters<typeof generateDevDoc>) => {
    setPanelMode('dev')
    generateDevDoc(...args)
  }

  // 监听「↺ 更新」触发的重新生成事件（来自历史侧边栏，PRD 有更新导致开发文档过期）——
  // 语义是"基于最新 PRD 重新生成"，同样先弹确认框，不直接生成
  useEffect(() => {
    const handler = (e: Event) => {
      const { sessionId: sid } = (e as CustomEvent).detail as { sessionId: string }
      if (sid === sessionId) {
        setPanelMode('dev')
        setGenDevDocMode('regenerate')
      }
    }
    window.addEventListener('prd-clarify:regen-dev-doc', handler)
    return () => window.removeEventListener('prd-clarify:regen-dev-doc', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])


  const handleChange = (next: string) => {
    setContent(next)
    setIsDirty(next !== initialContent)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveContent(sessionId, { content })
      setIsDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const handleReturnToClarify = async () => {
    const ok = await confirm({
      title: '返回初始化规格？',
      description: isDirty
        ? '当前核心规格有未保存的修改，返回后这些修改会丢失。已保存文件会保留，调整初始化规格后可重新生成。'
        : '当前核心规格文件会保留。你可以调整初始化规格中的目标、规则和待确定项，再重新生成。',
      confirmText: '返回初始化规格',
    })
    if (!ok) return
    setReturningToClarify(true)
    setReturnToClarifyError(null)
    try {
      await onReturnToClarify()
    } catch (cause) {
      setReturnToClarifyError(cause instanceof Error ? cause.message : '无法返回初始化规格，请重试')
      setReturningToClarify(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
  }

  /**
   * 复制文件绝对路径（PRD .md / 开发文档 .md），方便直接在编辑器/资源管理器里定位文件，
   * 不用再从 ~/.kai-toolbox/prd/ 目录里翻。复制成功后按钮图标短暂变成对勾提示一下，
   * 因为路径字符串本身不可见，不给反馈的话用户不知道到底有没有复制成功。
   */
  const [pathCopied, setPathCopied] = useState<'prd' | 'dev' | null>(null)
  const copyPath = (path: string | null | undefined, which: 'prd' | 'dev') => {
    if (!path) return
    navigator.clipboard.writeText(path)
    setPathCopied(which)
    setTimeout(() => setPathCopied((cur) => (cur === which ? null : cur)), 1500)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <EditingPanelDialogs
        sessionId={sessionId}
        currentEngine={currentEngine}
        startDev={{
          open: showDevDialog,
          title: sessionTitle,
          projectName,
          prdContent: content,
          devDocContent,
          onClose: () => setShowDevDialog(false),
        }}
        generation={{
          mode: genDevDocMode,
          onClose: () => setGenDevDocMode(null),
          onGenerate: handleGenerateDevDoc,
        }}
        history={{
          open: showDevDocHistory,
          clarificationOpen: showDevDocClarify,
          version: viewingDevDocVersion,
          onClose: () => setShowDevDocHistory(false),
          onCloseClarification: () => setShowDevDocClarify(false),
          onViewVersion: (version, isCurrent) => setViewingDevDocVersion({ version, isCurrent }),
          onCloseVersion: () => setViewingDevDocVersion(null),
        }}
        estimation={{
          dialogOpen: showEstimateDialog,
          detailOpen: showEstimationDetail,
          value: devDocEstimation,
          loading: estimating,
          error: estimateError,
          onConfirm: handleEstimateEffort,
          onCloseDialog: closeEstimateDialog,
          onCloseDetail: () => setShowEstimationDetail(false),
        }}
        progress={{
          dialogOpen: showEvaluateProgress,
          historyOpen: showProgressHistory,
          version: viewingProgressVersion,
          onGenerated: handleProgressEvaluated,
          onCloseDialog: () => setShowEvaluateProgress(false),
          onCloseHistory: () => setShowProgressHistory(false),
          onViewVersion: (version, isCurrent) => setViewingProgressVersion({ version, isCurrent }),
          onCloseVersion: () => setViewingProgressVersion(null),
        }}
      />

      <EditingPanelToolbar
        document={{
          panelMode, prdViewMode, devViewMode, specificationLabel, planLabel,
          hasDevDoc: Boolean(hasDevDoc), isDevDocStale: Boolean(isDevDocStale),
          devDocContent, devDocStreaming, devDocLoading, devDocDirty, devDocSaving,
          prdDirty: isDirty, prdSaving: saving, mdPath, devDocPath, copiedPath: pathCopied,
        }}
        progress={{ estimation: devDocEstimation, progressPath, progressGeneratedAt }}
        returningToClarify={returningToClarify}
        actions={{
          selectPanel: setPanelMode, selectPrdView: setPrdViewMode, selectDevView: setDevViewMode,
          generateDevDoc: setGenDevDocMode,
          showDevDocHistory: () => setShowDevDocHistory(true),
          showDevDocClarification: () => setShowDevDocClarify(true),
          showEstimation: () => setShowEstimateDialog(true),
          showEstimationDetail: () => setShowEstimationDetail(true),
          evaluateProgress: () => setShowEvaluateProgress(true),
          showProgressHistory: () => setShowProgressHistory(true),
          returnToClarify: handleReturnToClarify,
          startDevelopment: () => setShowDevDialog(true),
          reset: onReset, copyPath, copyPrd: handleCopy,
          copyDevDoc: () => navigator.clipboard.writeText(devDocContent),
          savePrd: handleSave, saveDevDoc: handleSaveDevDoc,
        }}
      />


      {returnToClarifyError && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          <span className="flex-1">返回初始化规格失败：{returnToClarifyError}</span>
          <button onClick={() => setReturnToClarifyError(null)}><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* 开发文档上次生成失败提示：常驻展示直到下一次生成开始，避免用户以为"生成过的文档不见了" */}
      {devDocError && panelMode !== 'prd' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs border-b border-red-200 dark:border-red-900">
          <span className="flex-1">执行计划上次生成失败：{devDocError}</span>
          <button
            onClick={() => setGenDevDocMode(devDocContent || hasDevDoc ? 'regenerate' : 'generate')}
            className="underline hover:no-underline flex-shrink-0"
          >
            重试
          </button>
          <button onClick={clearDevDocError} className="flex-shrink-0">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <EditingPanelContent
        panelMode={panelMode}
        specificationLabel={specificationLabel}
        planLabel={planLabel}
        prdContent={content}
        prdViewMode={prdViewMode}
        onPrdChange={handleChange}
        onPrdSave={handleSave}
        devDocContent={devDocContent}
        devViewMode={devViewMode}
        devDocStreaming={devDocStreaming}
        devDocProgress={devDocProgress}
        devDocLoading={devDocLoading}
        onDevDocChange={changeDevDocContent}
        onDevDocSave={handleSaveDevDoc}
        onGenerateDevDoc={() => setGenDevDocMode('generate')}
      />
    </div>
  )
}

// ───── 主页面 ─────
