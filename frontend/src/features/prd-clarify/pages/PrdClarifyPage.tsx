import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { BotMessageSquare, Bug, ChevronRight, ClipboardCheck, Clock, Code2, Copy, ExternalLink, FileText, FolderOpen, GitBranch, Image as ImageIcon, Info, Layers, Loader2, Paperclip, Pencil, Plus, RefreshCw, Rocket, Save, Search, Send, Sparkles, Trash2, User, Wrench, X } from 'lucide-react'
import { SystemModuleSelector } from '@/components/prd/SystemModuleSelector'
import { Combobox } from '@/components/ui/combobox'
import { usePrompt } from '@/components/ui/prompt-dialog'
import { splitCatalogValues } from '@/lib/systemCatalog'
import { formatDuration } from '@/lib/utils'
import { MarkdownContent } from '@/components/markdown/MarkdownContent'
import {
  adoptSplit,
  askNextDevDocQuestion,
  askNextQuestion,
  autoRegisterToReqPool,
  createSession,
  deleteSession,
  distributeAnswer,
  estimateDevDocEffort,
  getContent,
  getDevDocContent,
  checkPrdFile,
  getSession,
  linkPrdToReqItem,
  listSessions,
  parseAttachment,
  saveContent,
  saveDevDocContent,
  saveDraft,
  saveQaHistory,
  returnToClarify,
  splitRequirement,
  startClarify,
  startClarifyFromDraft,
  startGenerate,
  startGenerateDevDoc,
  updateDraft,
  updateSessionProject,
  updateSessionTitle,
  uploadImageAttachment,
  type QaPair,
  type AttachmentParseResult,
} from '../api'
import type { CreateSessionRequest, DevDocEstimation, DocumentProfile, PrdClarifyMode, PrdReqType, PrdSessionView, PrdStep, QuestionItem, SplitItem } from '../types'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { navigateWithLaunchIntent } from '@/shell/launch-intent/api'
import { DocOutline } from '../components/DocOutline'
import { EstimationBadge } from '../components/EstimationBadge'
import { ChangeGroupDialog, ReviseDialog, SplitReviewDialog } from '../components/dialogs/SessionActionDialogs'
import { StartClarifyDialog, type ClarifyEngine } from '../components/dialogs/StartClarifyDialog'
import { DevDocUpdateDialog } from '../components/dialogs/DevDocUpdateDialog'
import { StartDevDialog } from '../components/dialogs/StartDevDialog'
import { StepBar } from '../components/StepBar'
import { RawInputCard } from '../components/RawInputCard'
import { HistoryPanel } from '../components/HistoryPanel'
import { GeneratingPanel, RevisionPreparingPanel } from '../components/panels/GenerationPanels'
import { BatchClarifyPanel, ChattingPanel } from '../components/panels/ClarificationPanels'
import { InputPanel } from '../components/panels/InputPanel'
import { EditingPanel } from '../components/panels/EditingPanel'
import { REQ_TYPE_CONFIG } from '../lib/requirementTypePresentation'
import { usePrdClarifySession } from '../hooks/usePrdClarifySession'
import {
  ClarifyHistorySheet,
  DevDocClarifyHistorySheet,
} from '../components/dialogs/ClarificationHistorySheets'
import {
  DevDocHistorySheet,
  DevDocVersionViewDialog,
  ProgressHistorySheet,
  ProgressVersionViewDialog,
} from '../components/dialogs/ArtifactHistoryDialogs'
import {
  EstimateEffortDialog,
  EstimationDetailSheet,
  EvaluateProgressDialog,
} from '../components/dialogs/EstimationDialogs'

// ───── 生成修订版 Dialog ─────


// ───── 快捷示例模板（围绕需求管理池模块展开） ─────
export function PrdClarifyPage() {
  const {
    autoStartPending,
    changeGroupMut,
    clarifyQuestions,
    deleteMut,
    errorMsg,
    generationFailed,
    handleAutoStartConfirm,
    handleBackToInput,
    handleChattingDone,
    handleReset,
    handleRetryGenerate,
    handleReturnToClarify,
    handleReviseConfirm,
    handleSelectHistory,
    handleStart,
    handleStartVibe,
    mobileHistoryOpen,
    navigate,
    prdContent,
    qc,
    renameMut,
    reqContextTitle,
    revisingSesion,
    revisionPreparing,
    session,
    sessionId,
    sessionTitle,
    sessions,
    setAutoStartPending,
    setErrorMsg,
    setMobileHistoryOpen,
    setRevisingSession,
    setSearchParams,
    setSessionId,
    setShowClarifyHistory,
    setSplittingSessionId,
    setStep,
    showClarifyHistory,
    splittingSessionId,
    step,
    streamText,
    urlModule,
    urlProject,
    urlRawInput,
    urlTitle,
  } = usePrdClarifySession()

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--color-background)]">
      {/* 步骤条：可返回第 1 步重新填写；在第 3 步可查看第 2 步澄清记录 */}
      <StepBar
        step={step}
        onClickStep={(idx) => {
          if (idx === 0) handleBackToInput()
          if (idx === 1) setShowClarifyHistory(true)  // 点击第 2 步 → 打开澄清记录抽屉
        }}
        leading={
          // 移动端 PRD 库抽屉触发器：只在侧边栏本该显示的步骤（非编辑/对话）才有意义
          step !== 'EDITING' && step !== 'CHATTING' ? (
            <button
              type="button"
              onClick={() => setMobileHistoryOpen(true)}
              className="mr-1 flex flex-shrink-0 items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] md:hidden"
              title="打开 PRD 库"
            >
              <Layers className="w-3 h-3" />
              PRD 库
            </button>
          ) : null
        }
      />

      {/* 澄清记录抽屉 */}
      {showClarifyHistory && (
        <ClarifyHistorySheet
          questions={clarifyQuestions}
          onClose={() => setShowClarifyHistory(false)}
        />
      )}

      {/* 来自需求管理池的上下文条 */}
      {reqContextTitle && step !== 'INPUT' && (
        <div className="flex items-center gap-2 px-5 py-1.5 bg-[var(--color-primary)]/8 border-b border-[var(--color-primary)]/15 text-xs text-[var(--color-primary)]">
          <Layers className="w-3 h-3 flex-shrink-0" />
          <span>来自需求管理池：<strong>{reqContextTitle}</strong></span>
          <button
            onClick={() => navigate('/tools/reqpool')}
            className="ml-auto underline opacity-70 hover:opacity-100"
          >
            返回需求池
          </button>
        </div>
      )}

      {/* 错误提示 */}
      {errorMsg && (
        <div className="flex items-center gap-2 px-6 py-2 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border-b border-red-200 dark:border-red-900">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-xs underline">关闭</button>
        </div>
      )}

      {/* 需求池自动入口：启动澄清前确认引擎 */}
      {autoStartPending && (
        <StartClarifyDialog
          showEngineToggle
          onConfirm={handleAutoStartConfirm}
          onClose={() => {
            setAutoStartPending(false)
            setSearchParams({}, { replace: true })
          }}
        />
      )}

      {/* 修订版 Dialog */}
      {revisingSesion && (
        <ReviseDialog
          original={revisingSesion}
          onConfirm={(desc, engine) => handleReviseConfirm(revisingSesion, desc, engine)}
          onClose={() => setRevisingSession(null)}
        />
      )}

      {/* AI 需求拆分确认弹框 */}
      {splittingSessionId && (
        <SplitReviewDialog
          sessionId={splittingSessionId}
          onClose={() => setSplittingSessionId(null)}
          onAdopted={() => qc.invalidateQueries({ queryKey: ['prd-sessions'] })}
        />
      )}

      {/* relative：移动端 PRD 库抽屉以内容区（而非整个视口）为定位参照，不会盖住工作台 TopBar */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* 历史侧边栏（非编辑器、非对话模式下显示）；移动端为抽屉，md 及以上为常驻列 */}
        {step !== 'EDITING' && step !== 'CHATTING' && (
          <HistoryPanel
            sessions={sessions}
            activeId={sessionId}
            mobileOpen={mobileHistoryOpen}
            onMobileClose={() => setMobileHistoryOpen(false)}
            onSelect={(s) => { setMobileHistoryOpen(false); handleSelectHistory(s) }}
            onDelete={(id) => deleteMut.mutate(id)}
            onRevise={(s) => setRevisingSession(s)}
            onRename={(id, title) => renameMut.mutate({ id, title })}
            onChangeGroup={(id, project) => changeGroupMut.mutate({ id, project })}
            onSplit={(s) => setSplittingSessionId(s.id)}
          />
        )}

        {/* 主内容区 */}
        {step === 'INPUT' && (
          <InputPanel
            // 返回第 1 步时回填当前会话；非草稿再次提交会创建新会话，不覆盖旧记录。
            key={sessionId ?? 'new'}
            onStart={handleStart}
            onStartVibe={handleStartVibe}
            initialTitle={session?.title ?? urlTitle}
            initialRawInput={session?.rawInput ?? urlRawInput}
            initialProject={session?.project ?? urlProject}
            initialModule={session?.module ?? urlModule}
            initialDocumentProfile={session?.documentProfile ?? 'CLASSIC'}
            draftId={session?.status === 'DRAFT' ? sessionId : null}
            onDraftSaved={(id) => {
              setSessionId(id)
              qc.invalidateQueries({ queryKey: ['prd-sessions'] })
            }}
            onSplit={(id) => setSplittingSessionId(id)}
          />
        )}

        {/* 修订会话尚在创建时先给出即时反馈，避免用户误以为点击未生效 */}
        {step === 'CHATTING' && revisionPreparing && (
          <RevisionPreparingPanel
            engine={revisionPreparing.engine}
            stage={revisionPreparing.stage}
          />
        )}

        {/* 多轮渐进澄清对话（ChattingPanel 自管理 askNextQuestion 循环）—— 渐进模式，
            未选批量或 session 还没读到（新建会话必是渐进兜底）时走这条 */}
        {step === 'CHATTING' && !revisionPreparing && sessionId && session?.clarifyMode !== 'batch' && (
          <ChattingPanel
            sessionId={sessionId}
            engine={session?.engine === 'codex' ? 'codex' : 'claude'}
            maxRounds={session?.maxQuestions && session.maxQuestions > 0 ? session.maxQuestions : 5}
            initialHistory={(session?.questions ?? [])
              .filter((q) => q.answer && q.answer.trim())
              .map((q) => ({ question: q.question, answer: q.answer }))}
            onDone={handleChattingDone}
            onError={(msg) => { setErrorMsg(msg); setStep('INPUT') }}
          />
        )}

        {/* 批量澄清面板：一次性生成 maxQuestions 道题，用户一起填完再提交 —— 批量模式 */}
        {step === 'CHATTING' && sessionId && session?.clarifyMode === 'batch' && (
          <BatchClarifyPanel
            sessionId={sessionId}
            initialQuestions={session?.questions ?? []}
            onDone={handleChattingDone}
            onError={(msg) => { setErrorMsg(msg); setStep('INPUT') }}
          />
        )}

        {step === 'GENERATING' && (
          <GeneratingPanel
            streamText={streamText}
            failed={generationFailed}
            onRetry={handleRetryGenerate}
            engine={session?.engine ?? undefined}
          />
        )}

        {step === 'EDITING' && sessionId && (
          <EditingPanel
            sessionId={sessionId}
            sessionTitle={sessionTitle || session?.title || 'PRD 文档'}
            projectName={session?.project ?? urlProject ?? null}
            initialContent={prdContent}
            mdPath={session?.mdPath}
            devDocPath={session?.devDocPath}
            hasDevDoc={!!(session?.devDocPath)}
            isDevDocStale={
              !!(session?.devDocPath) &&
              (!session?.devDocGeneratedAt || session.devDocGeneratedAt < session.updatedAt)
            }
            initialDevDocEstimation={session?.devDocEstimation ?? null}
            currentEngine={session?.engine === 'codex' ? 'codex' : 'claude'}
            initialProgressPath={session?.progressPath ?? null}
            initialProgressGeneratedAt={session?.progressGeneratedAt ?? null}
            documentProfile={session?.documentProfile ?? 'CLASSIC'}
            onReturnToClarify={handleReturnToClarify}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  )
}
