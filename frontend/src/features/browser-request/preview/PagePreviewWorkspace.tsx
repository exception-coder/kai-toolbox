import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { Monitor, Smartphone, X, RefreshCw } from 'lucide-react'
import { createPreview, getPreview, closePreview, continuePreview, previewResources, type PreviewTarget, type PreviewView } from './api'
import { PreviewScreen } from './PreviewScreen'
import './preview.css'

const messages: Record<string, string> = {
  STARTING: '正在准备独立浏览器', AUTHENTICATING: '正在登录应用', NAVIGATING: '正在打开目标页面',
  WAITING_LOGIN: '登录尚未完成，可接管页面处理；可人工完成验证码或核对账号', READY: '目标页面已加载',
  FAILED: '页面未达到预期状态，可检查画面或重新预览', CLOSED: '预览已关闭', EXPIRED: '预览已过期，请重新打开',
  TIMED_OUT: '启动超过 90 秒，已结束等待，请检查服务后重新预览',
}
const displayable = new Set(['READY', 'WAITING_LOGIN', 'FAILED'])
export function PagePreviewWorkspace({ initial, previewId, onOpened, embedded = false, autoStart = false }: { initial: PreviewTarget; previewId?: string; onOpened: (view: PreviewView) => void; embedded?: boolean; autoStart?: boolean }) {
  const { user } = useAuth()
  const [target, setTarget] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [interactive, setInteractive] = useState(false)
  const [productionConfirmed, setProductionConfirmed] = useState(false)
  const launched = useRef<string | null>(null)
  const operation = useRef(false)
  const active = useRef(true)
  const [settingsOpen, setSettingsOpen] = useState(!previewId)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const resources = useQuery({ queryKey: ['page-preview-resources', user?.userId], queryFn: previewResources, enabled: settingsOpen || !previewId })
  const selectedResource = resources.data?.find(item => item.id === target.resourceId)
  const production = selectedResource?.environment.toUpperCase() === 'PROD'
  const selectionReady = !target.resourceId || (resources.isSuccess && !!selectedResource)
  const query = useQuery({ queryKey: ['page-preview', user?.userId, previewId], queryFn: () => getPreview(previewId!), enabled: !!previewId,
    refetchInterval: state => ['CLOSED', 'EXPIRED', 'TIMED_OUT'].includes(state.state.data?.status ?? '') ? false : 1500 })
  const open = useCallback(async (value: PreviewTarget, closeId?: string) => {
    if (operation.current) return
    operation.current = true
    setBusy(true); setError(''); setInteractive(false)
    try {
      if (closeId) await closePreview(closeId)
      const view = await createPreview(value)
      if (!active.current) { await closePreview(view.id); return }
      setSettingsOpen(false); onOpened(view)
    } catch (failure) { if (active.current) { setError(failure instanceof Error ? failure.message : '创建预览失败'); setSettingsOpen(true) } }
    finally { operation.current = false; if (active.current) setBusy(false) }
  }, [onOpened])
  useEffect(() => {
    if (autoStart && !previewId && launched.current !== initial.requestKey) {
      if (initial.resourceId) {
        if (!resources.isSuccess) return
        const resource = resources.data.find(item => item.id === initial.resourceId)
        if (!resource) return
        if (resource.environment.toUpperCase() === 'PROD') { launched.current = initial.requestKey; return }
      }
      launched.current = initial.requestKey; void open({ ...initial, productionConfirmed: false })
    }
  }, [open, previewId, initial, autoStart, resources.isSuccess, resources.data])
  useEffect(() => { setInteractive(false) }, [previewId, user?.userId])
  const view = query.data
  const restart = (device = view?.target.device) => {
    if (view) void open({ ...view.target, device: device ?? 'desktop', requestKey: crypto.randomUUID() }, view.id)
  }
  const adjust = () => { if (view) setTarget(view.target); setProductionConfirmed(false); setSettingsOpen(value => !value) }
  const chooseResource = (resourceId: string) => {
    const resource = resources.data?.find(item => item.id === resourceId)
    let route = '/tools/fore-consult'
    if (resource?.baseUrl) {
      const url = new URL(resource.baseUrl); route = url.pathname + url.search + url.hash
    }
    setProductionConfirmed(false)
    setTarget({ ...target, resourceId: resourceId || undefined, route, loginPage: undefined, productionConfirmed: false })
  }
  return <main className={embedded ? "page-preview page-preview-embedded" : "page-preview"}>
    {!embedded && <header className="preview-heading"><div><h1>页面预览</h1><p>真实浏览器渲染 · 当前账号隔离 · 15 分钟内有效</p></div><a href="/tools/fore-consult">返回咨询</a></header>}
    {error && <p role="alert" className="preview-error">{error}</p>}
    {settingsOpen && <form className="preview-setup" onSubmit={event => {
      event.preventDefault()
      if (!selectionReady || (production && !productionConfirmed)) return
      void open({ ...target, productionConfirmed: production && productionConfirmed, requestKey: previewId ? crypto.randomUUID() : target.requestKey }, view?.id)
    }}>
      <label>应用与环境<select disabled={busy} value={target.resourceId ?? ''} onChange={event => chooseResource(event.target.value)}>
        <option value="">当前登录的 Forge 用户</option>
        {target.resourceId && !resources.data?.some(item => item.id === target.resourceId) && <option value={target.resourceId}>已引用账号（等待核对）</option>}
        {resources.data?.map(resource => <option key={resource.id} value={resource.id}>{resource.name} · {resource.environment} · {resource.username}</option>)}
      </select></label>
      {resources.isPending && <p role="status" className="preview-meta">正在读取已登记应用…</p>}
      {resources.isSuccess && resources.data.length === 0 && <p className="preview-meta">暂无可自动登录的应用。管理员可在应用站点配置运行账号，然后刷新列表。</p>}
      {production && <div className="preview-production"><p>PROD · 生产环境。接管后的操作会影响真实业务数据。</p>
        <label><input type="checkbox" checked={productionConfirmed} onChange={event => setProductionConfirmed(event.target.checked)} />确认使用生产账号打开预览</label></div>}
      <label>目标路由<input autoComplete="off" value={target.route} onChange={event => setTarget({ ...target, route: event.target.value })} required /></label>
      {target.resourceId && <label>网页登录路径<input autoComplete="off" value={target.loginPage ?? ''} placeholder="留空从目标页进入，自动跟随登录跳转" onChange={event => setTarget({ ...target, loginPage: event.target.value })} /></label>}
      <p className="preview-meta">使用所选应用已保存的运行账号自动登录。<a href="/tools/reqpool/resources?view=accounts" target="_blank" rel="noopener noreferrer">配置运行账号</a> <button type="button" disabled={resources.isFetching} onClick={() => void resources.refetch()}>刷新账号</button></p>
      <div className="preview-options"><label>设备<select value={target.device} onChange={event => setTarget({ ...target, device: event.target.value as PreviewTarget['device'] })}><option value="desktop">桌面</option><option value="phone">手机</option></select></label>
      <label>查看状态<select value={target.scene} onChange={event => setTarget({ ...target, scene: event.target.value as PreviewTarget['scene'] })}><option value="page">页面</option><option value="consult-image">业务咨询图片预览</option></select></label></div>
      <button type="submit" disabled={busy || !selectionReady || (production && !productionConfirmed)}>{busy ? '正在创建预览…' : '登录并打开页面'}</button>
      {resources.isError && <p role="alert">应用账号列表读取失败，仍可预览当前 Forge 页面。<button type="button" onClick={() => void resources.refetch()}>重试账号列表</button></p>}
    </form>}
    {previewId && query.isPending && <p role="status">正在读取预览状态…</p>}
    {query.isError && <p role="alert">读取预览失败，可能已过期或不属于当前账号。<button type="button" onClick={() => void query.refetch()}>重试</button> <button type="button" onClick={() => setSettingsOpen(true)}>调整预览账号</button></p>}
    {view && !query.isError && <>
      <div className="preview-toolbar"><p role="status">{messages[view.status] ?? view.status}</p>
        <div><button type="button" disabled={busy} onClick={adjust}>调整预览账号</button><a href={view.targetOrigin + view.target.route} target="_blank" rel="noopener noreferrer" title="使用当前浏览器自己的登录状态打开">业务原地址</a>
        {['WAITING_LOGIN', 'FAILED'].includes(view.status) && <button type="button" onClick={() => { void continuePreview(view.id).then(() => query.refetch()).catch(failure => setError(String(failure))) }}>继续打开目标页</button>}
        <button type="button" disabled={busy} onClick={() => void restart('desktop')} aria-label="切换桌面预览"><Monitor size={16} />桌面</button>
        <button type="button" disabled={busy} onClick={() => void restart('phone')} aria-label="切换手机预览"><Smartphone size={16} />手机</button>
        <button type="button" disabled={busy} onClick={() => void restart()}><RefreshCw size={16} />重新预览</button>
        <button type="button" onClick={() => { void closePreview(view.id).then(() => query.refetch()).catch(failure => setError(String(failure))) }}><X size={16} />关闭</button></div>
      </div>
      <p className="preview-meta">{view.environment} · 账号 {view.account} · {view.targetOrigin}{view.target.route} · {view.target.sourceRevision ? `源码 ${view.target.sourceRevision} · ` : ''}{view.runtimeVersion}，页面就绪不代表功能验收通过。</p>
      {displayable.has(view.status) && <><label className="preview-control"><input type="checkbox" checked={interactive} onChange={event => setInteractive(event.target.checked)} />接管操作</label><PreviewScreen key={view.id} id={view.id} interactive={interactive} phone={view.target.device === 'phone'} /></>}
    </>}
  </main>
}
