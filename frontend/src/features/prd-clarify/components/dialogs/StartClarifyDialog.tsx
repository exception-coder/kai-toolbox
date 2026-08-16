import { useState } from 'react'
import { X } from 'lucide-react'
import type { PrdClarifyMode, PrdReqType } from '../../types'
import { REQ_TYPE_CONFIG } from '../../lib/requirementTypePresentation'

const DEPTH_PRESETS = [
  { label: '极简', hint: '1-2 轮', value: 2 },
  { label: '标准', hint: '3-5 轮', value: 5 },
  { label: '深入', hint: '6-8 轮', value: 8 },
] as const

export type ClarifyEngine = 'claude' | 'codex'

/**
 * 「开始澄清」确认弹框：选需求类型 + 调整澄清深度 + 选澄清方式（渐进/批量）。
 *
 * <p>需求类型决定 Claude 问什么、产出什么结构的文档（后端 PrdClarifyService 按 reqType
 * 切换 system prompt），深度是用户可显式覆盖的最大轮数——不再让 LLM 自己隐式判断该问几轮，
 * 对齐"确定性优先，关键决策不交给 LLM 自由发挥"的原则。
 *
 * <p>业务员角色只展示「澄清方式」一节（showTypeAndDepth=false）：技术分类和该问几轮业务员
 * 判断不了，仍交给后端 LLM 自动判定；但渐进式/批量是纯交互偏好，业务员完全能自己选，
 * 不该被连带剥夺（一次性填完 vs 一题题聊，对赶时间的业务员差别很大）。
 */
export function StartClarifyDialog({
  showModeToggle = true,
  showTypeAndDepth = true,
  showEngineToggle = false,
  onConfirm,
  onClose,
}: {
  /** Vibe Coding 澄清入口走的是完全独立的 Claude Code 长会话，不经过 ChattingPanel/批量表单，
   *  批量/渐进的区分对它没有意义，调用方传 false 隐藏这个选项。 */
  showModeToggle?: boolean
  /** false 时隐藏需求类型/澄清深度两节，onConfirm 回传 undefined，由后端 LLM 自动判定。 */
  showTypeAndDepth?: boolean
  showEngineToggle?: boolean
  onConfirm: (reqType: PrdReqType | undefined, maxQuestions: number | undefined, clarifyMode: PrdClarifyMode, engine: ClarifyEngine) => void
  onClose: () => void
}) {
  const [reqType, setReqType] = useState<PrdReqType>('NEW_MODULE')
  const [maxQuestions, setMaxQuestions] = useState(REQ_TYPE_CONFIG.NEW_MODULE.defaultMaxQuestions)
  /** 用户是否已手动调整过深度；未调整前，切换需求类型会自动带出该类型的推荐深度 */
  const [depthTouched, setDepthTouched] = useState(false)
  const [clarifyMode, setClarifyMode] = useState<PrdClarifyMode>('progressive')
  const [engine, setEngine] = useState<ClarifyEngine>('claude')

  const handleSelectType = (t: PrdReqType) => {
    setReqType(t)
    if (!depthTouched) setMaxQuestions(REQ_TYPE_CONFIG[t].defaultMaxQuestions)
  }

  const handlePickPreset = (value: number) => {
    setMaxQuestions(value)
    setDepthTouched(true)
  }

  const handleCustomInput = (value: number) => {
    setMaxQuestions(Math.max(1, Math.min(10, value || 1)))
    setDepthTouched(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      {/* 移动端小屏（尤其展开需求类型+深度+方式三节时）内容会超一屏，整卡限高可滚 */}
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h3 className="font-semibold text-sm">{showTypeAndDepth ? '开始澄清前确认' : '选择澄清方式'}</h3>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {showTypeAndDepth && (
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-2">这是什么类型的需求？</label>
            <div className="grid grid-cols-1 gap-2">
              {(Object.keys(REQ_TYPE_CONFIG) as PrdReqType[]).map((t) => {
                const cfg = REQ_TYPE_CONFIG[t]
                const active = reqType === t
                const Icon = cfg.icon
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleSelectType(t)}
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      active ? cfg.bg : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]/30'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${active ? cfg.color : 'text-[var(--color-muted-foreground)]'}`} />
                    <div>
                      <div className={`text-sm font-semibold ${active ? cfg.color : 'text-[var(--color-foreground)]'}`}>{cfg.label}</div>
                      <div className="text-[11px] text-[var(--color-muted-foreground)] leading-relaxed">{cfg.desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          )}

          {showTypeAndDepth && (
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-2">
              澄清深度（已按类型预填，可调整）
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {DEPTH_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handlePickPreset(p.value)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    maxQuestions === p.value
                      ? 'bg-[var(--color-primary)]/15 border-[var(--color-primary)]/30 text-[var(--color-primary)] font-medium'
                      : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-ring)]'
                  }`}
                >
                  {p.label} {p.hint}
                </button>
              ))}
              <div className="flex items-center gap-1 ml-1">
                <span className="text-xs text-[var(--color-muted-foreground)]">自定义</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={maxQuestions}
                  onChange={(e) => handleCustomInput(Number(e.target.value))}
                  className="w-14 px-1.5 py-1 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-xs text-center focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
                />
                <span className="text-xs text-[var(--color-muted-foreground)]">轮</span>
              </div>
            </div>
          </div>
          )}

          {showModeToggle && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-2">
                澄清方式
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setClarifyMode('progressive')}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    clarifyMode === 'progressive'
                      ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/30'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]/30'
                  }`}
                >
                  <div className={`text-sm font-semibold ${clarifyMode === 'progressive' ? 'text-[var(--color-primary)]' : 'text-[var(--color-foreground)]'}`}>
                    渐进式
                  </div>
                  <div className="text-[11px] text-[var(--color-muted-foreground)] leading-relaxed">
                    一题一题问，Claude 根据你的回答动态追问
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setClarifyMode('batch')}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    clarifyMode === 'batch'
                      ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/30'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]/30'
                  }`}
                >
                  <div className={`text-sm font-semibold ${clarifyMode === 'batch' ? 'text-[var(--color-primary)]' : 'text-[var(--color-foreground)]'}`}>
                    批量
                  </div>
                  <div className="text-[11px] text-[var(--color-muted-foreground)] leading-relaxed">
                    {showTypeAndDepth
                      ? `一次性生成全部 ${maxQuestions} 题，一起填完再提交`
                      : '一次性生成全部问题，一起填完再提交'}
                  </div>
                </button>
              </div>
            </div>
          )}

          {showEngineToggle && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-2">
                执行引擎
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'claude', label: 'Claude Code' },
                  { value: 'codex', label: 'Codex' },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setEngine(option.value)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      engine === option.value
                        ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/30 text-[var(--color-primary)]'
                        : 'border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/30'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] hover:bg-[var(--color-muted)]/30"
            >
              取消
            </button>
            <button
              onClick={() => onConfirm(
                showTypeAndDepth ? reqType : undefined,
                showTypeAndDepth ? maxQuestions : undefined,
                showModeToggle ? clarifyMode : 'progressive',
                engine,
              )}
              className="px-4 py-1.5 rounded-md text-sm bg-[var(--color-primary)] text-white hover:opacity-90"
            >
              开始澄清
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
