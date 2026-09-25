import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Cloud, Server, Settings2 } from 'lucide-react'
import { Overlay } from './PermissionDialog'
import { ProviderProfilesPanel } from './ProviderProfilesPanel'
import { loadProfiles, type ProviderProfile } from '../providerProfiles'
import { providerHost } from './chatStatus'
import type { Engine } from '../types'
import { supportsSessionProvider } from '../lib/engineCatalog'

/**
 * 会话内「切换服务商」：官方登录 ↔ 第三方网关，或两网关互切。点击弹出卡片列表
 * （官方 + 各档案 + 管理档案），切换走 chat.switchProvider —— 同一会话与 sdkSessionId 不变，
 * 保留上下文，下一轮生效。网关能力由 supportsSessionProvider 判定，不改变引擎全局配置。
 *
 * 切到某档案时一并把它的默认模型透传（若有）：先 switchProvider 再 setModel，免得用户切完还得手点模型。
 */
export function ProviderSwitch({
  engine,
  providerKind,
  providerBaseUrl,
  onSwitch,
  onPickModel,
  disabled,
  align = 'left',
  hideManage = false,
}: {
  engine: Engine
  providerKind: 'official' | 'thirdParty'
  providerBaseUrl: string | null
  onSwitch: (provider?: { providerProfileId?: string; apiBaseUrl?: string; authToken?: string }) => void
  onPickModel?: (model: string) => void
  disabled?: boolean
  /** 弹层对齐方向：放工具条右侧时用 'right' 防溢出，默认 'left'。 */
  align?: 'left' | 'right'
  /** 嵌入 modal 时隐藏会 portal 到 modal 外的档案管理入口；Header More 仍提供完整管理入口。 */
  hideManage?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [managing, setManaging] = useState(false)
  const queryClient = useQueryClient()
  const profilesQuery = useQuery({ queryKey: ['gateway-provider-profiles'], queryFn: loadProfiles })
  const profiles: ProviderProfile[] = profilesQuery.data ?? []

  const gatewayCapable = supportsSessionProvider(engine)
  const isThird = providerKind === 'thirdParty'
  const host = providerHost(providerBaseUrl)
  const label = isThird ? (host ?? '第三方') : '官方'
  // 当前选中档案（按 baseUrl 匹配），用于打勾
  const matchingProfiles = isThird
    ? profiles.filter(p => p.baseUrl.replace(/\/+$/, '') === (providerBaseUrl ?? '').replace(/\/+$/, ''))
    : []
  const activeId = matchingProfiles.length === 1 ? matchingProfiles[0].id : undefined

  const toOfficial = () => { setOpen(false); onSwitch(undefined) }
  const toProfile = (p: ProviderProfile) => {
    setOpen(false)
    onSwitch({ providerProfileId: p.id, apiBaseUrl: p.baseUrl })
    if (p.model && onPickModel) onPickModel(p.model) // 档案带默认模型则一并切，省一步
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled || !gatewayCapable}
        onClick={() => { void profilesQuery.refetch(); setOpen(o => !o) }}
        title={gatewayCapable
          ? (isThird ? `第三方网关：${providerBaseUrl ?? host}（点击切换服务商）` : '官方登录（点击切到第三方网关）')
          : '当前 agent 自管服务商，不支持切换'}
        aria-label={`服务商 ${label}，点击切换`}
        className={'flex items-center gap-1 rounded-md border px-2 py-1 text-sm '
          + (isThird ? 'border-amber-400 text-amber-700 dark:border-amber-700 dark:text-amber-300' : '')
          + ((disabled || !gatewayCapable) ? ' opacity-50' : '')}
      >
        {isThird ? <Server className="size-4" /> : <Cloud className="size-4" />} {label}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={'absolute bottom-full z-50 mb-2 w-72 overflow-hidden rounded-xl border bg-[var(--color-background)] shadow-xl ' + (align === 'right' ? 'right-0' : 'left-0')}>
            <div className="px-3 py-2 text-xs font-medium text-[var(--color-muted-foreground)]">服务商（按会话生效，保留上下文）</div>

            {/* 官方登录 */}
            <button
              type="button"
              onClick={toOfficial}
              className={'flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[var(--color-muted)] ' + (!isThird ? 'bg-[var(--color-muted)]' : '')}
            >
              <Cloud className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">官方登录</span>
                <span className="block text-xs text-[var(--color-muted-foreground)]">用本机已登录的官方账号</span>
              </span>
              {!isThird && <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-primary)]" />}
            </button>

            {/* 第三方网关档案 */}
            {profilesQuery.isPending && <p className="px-3 py-2 text-xs text-[var(--color-muted-foreground)]">正在读取档案…</p>}
            {profilesQuery.error && (
              <p className="px-3 py-2 text-xs text-[var(--color-destructive)]">
                读取失败：{profilesQuery.error.message} <button type="button" onClick={() => void profilesQuery.refetch()} className="underline">重试</button>
              </p>
            )}
            {profiles.map(p => {
              const active = p.id === activeId
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toProfile(p)}
                  className={'flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[var(--color-muted)] ' + (active ? 'bg-[var(--color-muted)]' : '')}
                >
                  <Server className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-[var(--color-muted-foreground)]">{providerHost(p.baseUrl) ?? p.baseUrl}{p.model ? ` · ${p.model}` : ''}</span>
                  </span>
                  {active && <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-primary)]" />}
                </button>
              )
            })}

            {!hideManage && (
              <button
                type="button"
                onClick={() => { setOpen(false); setManaging(true) }}
                className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
              >
                <Settings2 className="size-4 shrink-0" /> 管理服务商档案…
              </button>
            )}
          </div>
        </>
      )}

      {!hideManage && managing && (
        <Overlay>
          <ProviderProfilesPanel onClose={() => { void queryClient.invalidateQueries({ queryKey: ['gateway-provider-profiles'] }); setManaging(false) }} />
        </Overlay>
      )}
    </div>
  )
}
