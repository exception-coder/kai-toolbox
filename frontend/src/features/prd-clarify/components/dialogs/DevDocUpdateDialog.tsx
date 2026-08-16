import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BotMessageSquare, ExternalLink, FileText, GitBranch, Loader2, Paperclip, Send, User, X } from 'lucide-react'
import { askNextDevDocQuestion, parseAttachment, type AttachmentParseResult, type QaPair } from '../../api'
import type { ClarifyEngine } from './StartClarifyDialog'

const DEV_DOC_PROMPT_PRESETS = [
  '重点关注可维护性和代码复用，优先复用现有工具类/组件',
  '性能优先，标注关键索引/缓存点',
  '给出详细到方法级别的实现步骤',
  '参考现有代码风格保持一致，不引入新的第三方库',
  '重点设计好数据库表结构和字段类型',
] as const

/**
 * TDD 生成/更新前的技术澄清弹框，跟 PRD 一样采用多轮渐进澄清：
 *   input（填初步更新说明 + 可选上传附件补充上下文）
 *   → clarifying（AI 结合 PRD、代码与业务知识图谱，只询问开发者必须明确的编码关键细节）
 * 澄清完成后把补充说明和完整问答记录分别交给后端，用于 TDD 生成与版本追溯。
 */
export function DevDocUpdateDialog({
  sessionId,
  mode,
  initialEngine,
  onConfirm,
  onClose,
}: {
  sessionId: string
  mode: 'initial' | 'update'
  initialEngine: ClarifyEngine
  /** 澄清完成后回调：初步说明与问答记录分别传出，不再拼成一段文本——由后端结构化持久化，
   *  使这一版的澄清记录能跟 PRD 首次澄清记录分开单独展示。 */
  onConfirm: (extraInstructions: string, qaHistory: QaPair[], engine: ClarifyEngine) => void
  onClose: () => void
}) {
  const isUpdate = mode === 'update'
  const maxRounds = 5
  const [step, setStep] = useState<'input' | 'clarifying'>('input')
  const [engine, setEngine] = useState<ClarifyEngine>(initialEngine)

  // ── input 步骤：初步更新说明 + 附件 ──
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState<AttachmentParseResult[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** 进入 clarifying 后固定的初步说明（含附件内容），避免每轮重新拼接 */
  const finalNotesRef = useRef('')

  // ── clarifying 步骤：结构对齐 ChattingPanel ──
  const [history, setHistory] = useState<QaPair[]>([])
  const [currentQ, setCurrentQ] = useState('')
  const [currentA, setCurrentA] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<(() => void) | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const answerInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => abortRef.current?.(), [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [history, currentQ])
  useEffect(() => {
    if (!isStreaming && currentQ && !currentQ.includes('[CLARIFICATION_COMPLETE]')) {
      setTimeout(() => answerInputRef.current?.focus(), 100)
    }
  }, [isStreaming, currentQ])

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadError(null)
    setUploadingFile(true)
    try {
      const results = await Promise.all(Array.from(files).map((f) => parseAttachment(f)))
      setAttachments((prev) => [...prev, ...results])
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '文件解析失败')
    } finally {
      setUploadingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /**
   * 把附件内容追加到 notes，形成完整的初步更新说明。原始文件已随解析一并落盘（见
   * parseAttachment 的 fileId/url），这里把下载链接也用 Markdown 语法嵌进正文——不这样做的话
   * 原文件解析完就没有任何入口能再找回来了，只剩抽取出来的纯文本。
   */
  const buildFinalNotes = () => {
    let final = notes.trim()
    if (attachments.length > 0) {
      final += '\n\n' + attachments.map((a) =>
        `[📎 附件：${a.fileName}](${a.url})\n---\n【附件：${a.fileName}】\n${a.text}${a.truncated ? '\n（内容已截断）' : ''}\n---`
      ).join('\n\n')
    }
    return final
  }

  const askQuestion = (index: number, hist: QaPair[]) => {
    setCurrentQ('')
    setIsStreaming(true)
    const accRef = { current: '' }
    const abort = askNextDevDocQuestion(sessionId, index, hist, finalNotesRef.current, mode, {
      onEvent(name, data) {
        if (name === 'chunk') {
          const chunk = (data as { content: string }).content ?? ''
          accRef.current += chunk
          setCurrentQ(accRef.current)
        }
        if (name === 'done') {
          setIsStreaming(false)
          const text = accRef.current.trim()
          if (text.includes('[CLARIFICATION_COMPLETE]')) {
            finishClarify(hist)
          }
        }
        if (name === 'error') {
          setIsStreaming(false)
        }
      },
      onError() { setIsStreaming(false) },
    }, engine)
    abortRef.current = abort
  }

  /** 澄清完成：初步说明与问答记录分别传给调用方，不再拼成一段文本（见 onConfirm 类型注释） */
  const finishClarify = (finalHistory: QaPair[]) => {
    onConfirm(finalNotesRef.current, finalHistory, engine)
  }

  const handleStartClarify = () => {
    finalNotesRef.current = buildFinalNotes()
    setStep('clarifying')
    askQuestion(0, [])
  }

  const handleSubmitAnswer = () => {
    const answer = currentA.trim()
    if (!answer) return
    const newPair: QaPair = { question: currentQ, answer }
    const newHistory = [...history, newPair]
    setHistory(newHistory)
    setCurrentA('')
    setCurrentQ('')
    askQuestion(newHistory.length, newHistory)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmitAnswer()
    }
  }

  const isDone = !isStreaming && currentQ.includes('[CLARIFICATION_COMPLETE]')
  const progress = Math.round((history.length / maxRounds) * 100)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <GitBranch className="w-4 h-4 text-purple-400" />
            {isUpdate ? '基于当前 TDD 更新' : 'TDD 技术澄清'}
          </h3>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'input' ? (
          <div className="p-5 space-y-3 overflow-y-auto">
            <p className="text-[11px] text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-md px-2.5 py-1.5">
              {isUpdate
                ? `AI 会结合最新 PRD、当前 TDD、代码和业务知识图谱，只核对本次更新中必须由开发者明确的技术决策（最多 ${maxRounds} 轮）；生成前会自动备份当前版本。`
                : `AI 会结合正式 PRD、代码和业务知识图谱，只核对编码前必须由开发者明确的关键技术决策（最多 ${maxRounds} 轮），明确后再生成 TDD。`}
            </p>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
                  {isUpdate ? '本次更新说明' : '开发约束或偏好（可选）'}
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-[var(--color-border)] hover:border-[var(--color-ring)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
                >
                  {uploadingFile ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                  {uploadingFile ? '解析中…' : '上传附件补充上下文'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.txt,.pdf,.docx,.doc"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files)}
                />
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder={isUpdate
                  ? '如：新增了退款审批环节、调整了订单查询接口的入参…（可留空，附件也算说明）'
                  : '如：必须兼容旧接口、不能新增中间件、数据迁移需无停机…（可留空）'}
                className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
              />
              {uploadError && <p className="text-xs text-red-500 mt-1">{uploadError}</p>}
            </div>

            {attachments.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] text-[var(--color-muted-foreground)]">
                  附件内容将追加到更新说明（共 {attachments.length} 个）：
                </p>
                {attachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/30">
                    <FileText className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-primary)]" />
                    <span className="text-xs font-medium truncate flex-1">{att.fileName}</span>
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)]"
                      title="下载原始文件"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      className="text-[var(--color-muted-foreground)] hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!isUpdate && (
              <div>
                <div className="text-[11px] text-[var(--color-muted-foreground)] mb-1.5">常用约束（点击追加）</div>
                <div className="flex flex-wrap gap-1.5">
                  {DEV_DOC_PROMPT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNotes((current) => current.trim() ? `${current.trim()}\n${preset}` : preset)}
                      className="px-2 py-1 rounded-full text-[11px] border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-ring)] hover:text-[var(--color-foreground)] transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="text-[11px] text-[var(--color-muted-foreground)] mb-1.5">执行引擎</div>
              <div className="grid grid-cols-2 gap-2">
                {(['claude', 'codex'] as const).map((value) => (
                  <button key={value} type="button" onClick={() => setEngine(value)}
                    className={`rounded-lg border px-3 py-2 text-sm ${engine === value
                      ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/30 text-[var(--color-primary)]'
                      : 'border-[var(--color-border)]'}`}>
                    {value === 'claude' ? 'Claude Code' : 'Codex'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] hover:bg-[var(--color-muted)]/30">
                取消
              </button>
              <button onClick={handleStartClarify} className="px-4 py-1.5 rounded-md text-sm bg-purple-600 text-white hover:opacity-90">
                开始澄清
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* 进度条 */}
            <div className="flex items-center gap-3 px-5 py-2 border-b border-[var(--color-border)] flex-shrink-0">
              <span className="text-xs text-[var(--color-muted-foreground)]">
                {isUpdate ? 'TDD 更新澄清' : 'TDD 技术澄清'}：{history.length} / {maxRounds} 题
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--color-muted)]">
                <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              {isStreaming && (
                <div className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Claude 思考中…
                </div>
              )}
            </div>

            {/* 对话气泡区 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[200px]">
              {history.map((qa, i) => (
                <div key={i} className="space-y-1.5 rounded-xl border border-purple-500/20 bg-purple-500/[0.03] p-3">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                      <BotMessageSquare className="w-3.5 h-3.5 text-purple-400" />
                    </div>
                    <div className="flex-1">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-purple-400">
                        必须明确 · Q{i + 1}
                      </div>
                      <div className="text-sm leading-relaxed">{qa.question}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 justify-end">
                    <div className="flex-1 rounded-xl rounded-tr-sm bg-purple-500/10 border border-purple-500/20 px-3 py-2 text-sm leading-relaxed text-right ml-6">
                      {qa.answer}
                    </div>
                    <div className="w-6 h-6 rounded-full bg-[var(--color-muted)] flex items-center justify-center flex-shrink-0">
                      <User className="w-3.5 h-3.5 text-[var(--color-muted-foreground)]" />
                    </div>
                  </div>
                </div>
              ))}

              {currentQ && !isDone && (
                <div className="flex items-start gap-2 rounded-xl border border-purple-500/30 bg-purple-500/[0.04] p-3">
                  <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <BotMessageSquare className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <div className="flex-1 text-sm leading-relaxed">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-purple-400">
                      待开发者核对 · Q{history.length + 1}
                    </div>
                    {currentQ}
                    {isStreaming && (
                      <span className="inline-block w-1.5 h-3.5 bg-purple-400 rounded animate-pulse ml-1 align-middle" />
                    )}
                  </div>
                </div>
              )}

              {isStreaming && !currentQ && (
                <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)] italic px-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  AI 正在结合 PRD 与知识图谱分析必须明确的技术细节…
                </div>
              )}

              {isDone && (
                <div className="flex items-center gap-2 text-xs text-purple-400 px-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  澄清完成，正在生成更新后的开发文档…
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* 回答输入区 */}
            {!isDone && !isStreaming && currentQ && (
              <div className="border-t border-[var(--color-border)] p-3 flex-shrink-0">
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={answerInputRef}
                    value={currentA}
                    onChange={(e) => setCurrentA(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    placeholder="输入你的回答…（Ctrl+Enter 提交）"
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
                  />
                  <button
                    disabled={!currentA.trim()}
                    onClick={handleSubmitAnswer}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 text-white text-sm hover:opacity-90 disabled:opacity-40"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
