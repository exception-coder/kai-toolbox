import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import type { Engine, EngineCatalogView, ModelInfo } from '../types'
import type { ProviderProfile } from '../providerProfiles'
import { supportsSessionProvider } from '../lib/engineCatalog'
import { groupModels } from './modelGroups'
import { isProviderAuthenticationError } from '../providerGateway'

export function NewSessionEngineSettings({ engine, providerId, providers, providersLoading, providersError, model, models,
  modelsLoading, modelsError, codexHome, catalog, refreshing, onCodexHome, onProvider, onModel, onManage, onRefresh, onRetryProviders }: {
  engine: Engine; providerId: string; providers: ProviderProfile[]; providersLoading: boolean; providersError?: string
  model: string; models: ModelInfo[]; modelsLoading: boolean; modelsError: string | null
  codexHome: string; catalog?: EngineCatalogView; refreshing: boolean
  onCodexHome: (value: string) => void; onProvider: (id: string) => void; onModel: (value: string) => void
  onManage: () => void; onRefresh: () => void; onRetryProviders: () => void
}) {
  const groups = useMemo(() => groupModels(models), [models])
  const [platform, setPlatform] = useState('all')
  const shown = groups.find(item => item.key === platform)?.models ?? models
  return <>
    {supportsSessionProvider(engine) && <div className="space-y-2">
      <label htmlFor="vibe-new-provider" className="block text-sm font-medium">服务商</label>
      <Combobox id="vibe-new-provider" aria-label="服务商" allowCustom={false} searchable value={providerId}
        onChange={onProvider} options={[{ value: '', label: '官方默认' }, ...providers.map(item => ({ value: item.id, label: item.name }))]} />
      <Button variant="link" size="sm" className="px-0" onClick={onManage}>管理服务商</Button>
      {providersLoading && <p role="status" className="text-xs">正在读取服务商档案…</p>}
      {providersError && <p role="alert" className="text-xs">{providersError} <button type="button" className="underline" onClick={onRetryProviders}>重试档案</button></p>}
    </div>}
    {engine === 'codex' && !providerId && <div className="space-y-2">
      <label htmlFor="vibe-coding-codex-home" className="block text-sm font-medium">Codex Auth 目录</label>
      <input id="vibe-coding-codex-home" value={codexHome} onChange={event => onCodexHome(event.target.value)} placeholder="留空使用默认登录目录"
        className="h-10 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm" />
    </div>}
    {(providerId && supportsSessionProvider(engine) || ['pi', 'copilot', 'opencode'].includes(engine)) && <div className="space-y-2">
      {groups.length > 1 && <Combobox aria-label="模型平台" allowCustom={false} value={platform} onChange={setPlatform}
        options={[{ value: 'all', label: '全部平台' }, ...groups.map(group => ({ value: group.key, label: group.label }))]} />}
      <label htmlFor="vibe-new-model" className="block text-sm font-medium">模型 · 可选</label>
      <input id="vibe-new-model" list="vibe-new-models" value={model} onChange={event => onModel(event.target.value)}
        placeholder={modelsLoading ? '正在读取模型…' : '选择或输入模型，留空使用引擎默认'} className="h-10 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm" />
      <datalist id="vibe-new-models">{shown.map(item => <option key={item.value} value={item.value}>{item.displayName}</option>)}</datalist>
      {modelsError && <p role="status" className="text-xs text-[var(--color-muted-foreground)]">{modelsError}。{isProviderAuthenticationError(modelsError) ? '请在服务商管理中核对凭据。' : '可直接输入模型名。'}</p>}
      {providerId && <p className="text-xs text-[var(--color-muted-foreground)]">使用所选服务商的连接与凭据。</p>}
    </div>}
    <details className="border-t pt-3">
      <summary className="cursor-pointer text-sm font-medium">引擎状态</summary>
      <div className="mt-2 divide-y text-xs">{catalog?.engines.map(entry => <p key={entry.id} className="break-words py-2"><strong className="font-medium">{entry.displayName}</strong> · {entry.selectable && entry.probe.status === 'ready' ? '可用' : entry.probe.detail || '暂不可用'}</p>)}</div>
      {catalog?.error && <p role="alert" className="text-xs">{catalog.error}</p>}
      <Button variant="outline" size="sm" disabled={refreshing} onClick={onRefresh}>{refreshing ? '正在检测…' : '重新检测引擎'}</Button>
    </details>
  </>
}
