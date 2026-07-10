import { useState } from 'react'
import { ChevronDown, ChevronRight, Stethoscope } from 'lucide-react'
import type { ProviderKind, TurnDiag } from '../types'
import { providerHost } from './chatStatus'

interface Props {
  providerKind: ProviderKind
  providerBaseUrl: string | null
  /** 当前选择的模型（前端 setModel 后的值）。 */
  currentModel: string | null
  /** 每轮诊断（最新在前）。 */
  diag: TurnDiag[]
  /** 紧凑模式（分屏块用，字号更小）。 */
  compact?: boolean
}

/**
 * 第三方网关「调用诊断」可展开小区块：直接在前端核对——本轮请求的模型 vs API 实际返回的模型
 * （responseModel 来自响应体，权威，非模型自述）+ 是否真经网关。用于排查「真走三方 / 被回退官方 / 网关别名」。
 * 仅第三方会话渲染；官方会话返回 null（不打扰）。
 */
export function ProviderDiagPanel({ providerKind, providerBaseUrl, currentModel, diag, compact }: Props) {
  const [open, setOpen] = useState(false)
  if (providerKind !== 'thirdParty') return null
  const host = providerHost(providerBaseUrl) ?? providerBaseUrl ?? '未知网关'
  const last = diag[0]
  // 折叠态摘要：用最近一轮的实际返回模型，一眼可见
  const summary = last
    ? `实际模型 ${last.responseModel ?? '未知'}`
    : '尚无调用记录'

  return (
    <div className={`border-t border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/40 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-amber-800 dark:text-amber-300"
        title="第三方网关调用诊断：核对实际命中的模型，排查是否真走了三方"
      >
        {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
        <Stethoscope className="size-3.5 shrink-0" />
        <span className="font-medium">调用诊断 · 第三方</span>
        <span className="truncate text-amber-700/80 dark:text-amber-400/80">{host} · {summary}</span>
      </button>
      {open && (
        <div className="space-y-1.5 px-3 pb-2">
          <div className="text-amber-700 dark:text-amber-400">
            网关 <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">{host}</code>
            ，当前选择模型 <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">{currentModel ?? '默认'}</code>
          </div>
          {diag.length === 0 ? (
            <div className="text-amber-700/80 dark:text-amber-400/80">
              还没有调用记录。发一条消息后，这里会显示本轮「请求模型 → API 实际返回模型」，据此判断是否真走了三方。
            </div>
          ) : (
            <ul className="space-y-1">
              {diag.map(d => {
                const mismatch = !!d.requestedModel && !!d.responseModel && d.requestedModel !== d.responseModel
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-1 font-mono">
                    <span className="rounded bg-amber-100 px-1 dark:bg-amber-900">{d.requestedModel ?? '默认'}</span>
                    <span className="text-amber-600">→</span>
                    <span className={`rounded px-1 ${mismatch
                      ? 'bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-100'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'}`}>
                      {d.responseModel ?? '未知'}
                    </span>
                    <span className="text-amber-700/80 dark:text-amber-400/80">
                      {d.viaGateway ? '经网关' : '⚠ 走的官方登录'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="text-amber-600/70 dark:text-amber-500/70">
            提示：「实际返回模型」取自 API 响应，权威。若与请求不一致，多为网关把该名字别名/回退到了别的上游。
          </div>
        </div>
      )}
    </div>
  )
}
