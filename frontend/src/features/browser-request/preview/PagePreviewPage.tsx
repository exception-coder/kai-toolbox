import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { Monitor, Smartphone, X, RefreshCw } from 'lucide-react'
import { createPreview, getPreview, closePreview, continuePreview, previewResources, type PreviewTarget } from './api'
import { PreviewScreen } from './PreviewScreen'
import './preview.css'

const messages: Record<string, string> = {
  STARTING: '正在准备独立浏览器', AUTHENTICATING: '正在登录测试应用', NAVIGATING: '正在打开目标页面',
  WAITING_LOGIN: '登录尚未完成，可接管页面处理；当前仅支持同源表单登录', READY: '目标页面已加载',
  FAILED: '页面未达到预期状态，可检查画面或重新预览', CLOSED: '预览已关闭', EXPIRED: '预览已过期，请重新打开',
  TIMED_OUT: '启动超过 90 秒，已结束等待，请检查服务后重新预览',
}
const displayable = new Set(['READY', 'WAITING_LOGIN', 'FAILED'])
export function PagePreviewPage() {
  const { user } = useAuth()
  const { previewId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const initial = useMemo<PreviewTarget>(() => ({ requestKey: params.get('requestKey') || crypto.randomUUID(), origin: window.location.origin,
    route: params.get('route') || '/tools/fore-consult', device: params.get('device') === 'phone' ? 'phone' : 'desktop',
    scene: params.get('scene') === 'consult-image' ? 'consult-image' : 'page',
    resourceId: params.get('resourceId') || undefined, loginPage: params.get('loginPage') || undefined,
    readySelector: params.get('readySelector') || undefined, sourceRevision: params.get('sourceRevision') || undefined }), [params])
  const [target, setTarget] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [interactive, setInteractive] = useState(false)
  const launched = useRef<string | null>(null)
  const resources = useQuery({ queryKey: ['page-preview-resources', user?.userId], queryFn: previewResources, enabled: !previewId })
  const query = useQuery({ queryKey: ['page-preview', user?.userId, previewId], queryFn: () => getPreview(previewId!), enabled: !!previewId,
    refetchInterval: state => ['CLOSED', 'EXPIRED', 'TIMED_OUT'].includes(state.state.data?.status ?? '') ? false : 1500 })
  const open = useCallback(async (value: PreviewTarget) => {
    setBusy(true); setError(''); setInteractive(false)
    try { const view = await createPreview(value); navigate(view.viewerPath, { replace: true }) }
    catch (failure) { setError(failure instanceof Error ? failure.message : '创建预览失败') }
    finally { setBusy(false) }
  }, [navigate])
  useEffect(() => {
    if (!previewId && params.get('auto') === '1' && launched.current !== initial.requestKey) {
      launched.current = initial.requestKey; void open(initial)
    }
  }, [open, params, previewId, initial])
  useEffect(() => { setInteractive(false) }, [previewId, user?.userId])
  const view = query.data
  const restart = async (device = view?.target.device) => {
    if (!view) return
    try { await closePreview(view.id); await open({ ...view.target, device: device ?? 'desktop', requestKey: crypto.randomUUID() }) }
    catch (failure) { setError(failure instanceof Error ? failure.message : '重新预览失败') }
  }
  return <main className="page-preview">
    <header className="preview-heading"><div><h1>页面预览</h1><p>真实浏览器渲染 · 当前账号隔离 · 15 分钟内有效</p></div><Link to="/tools/fore-consult">返回咨询</Link></header>
    {error && <p role="alert" className="preview-error">{error}</p>}
    {!previewId && <form className="preview-setup" onSubmit={event => { event.preventDefault(); void open(target) }}>
      <label>访问身份<select value={target.resourceId ?? ''} onChange={event => setTarget({ ...target, resourceId: event.target.value || undefined })}>
        <option value="">当前登录的 Forge 用户</option>
        {resources.data?.map(resource => <option key={resource.id} value={resource.id}>{resource.name} · {resource.environment} · {resource.username}</option>)}
      </select></label>
      <label>目标路由<input autoComplete="off" value={target.route} onChange={event => setTarget({ ...target, route: event.target.value })} required /></label>
      {target.resourceId && <label>网页登录路径<input autoComplete="off" value={target.loginPage ?? '/'} onChange={event => setTarget({ ...target, loginPage: event.target.value })} /></label>}
      <div className="preview-options"><label>设备<select value={target.device} onChange={event => setTarget({ ...target, device: event.target.value as PreviewTarget['device'] })}><option value="desktop">桌面</option><option value="phone">手机</option></select></label>
      <label>查看状态<select value={target.scene} onChange={event => setTarget({ ...target, scene: event.target.value as PreviewTarget['scene'] })}><option value="page">页面</option><option value="consult-image">业务咨询图片预览</option></select></label></div>
      <button type="submit" disabled={busy}>{busy ? '正在创建预览…' : '登录并打开页面'}</button>
      {resources.isError && <p role="alert">测试账号列表读取失败，仍可预览当前 Forge 页面。<button type="button" onClick={() => void resources.refetch()}>重试账号列表</button></p>}
    </form>}
    {previewId && query.isPending && <p role="status">正在读取预览状态…</p>}
    {query.isError && <p role="alert">读取预览失败，可能已过期或不属于当前账号。<button type="button" onClick={() => void query.refetch()}>重试</button> <Link to="/tools/fore-consult/preview">新建预览</Link></p>}
    {view && !query.isError && <>
      <div className="preview-toolbar"><p role="status">{messages[view.status] ?? view.status}</p>
        <div><a href={view.targetOrigin + view.target.route} target="_blank" rel="noopener noreferrer" title="使用当前浏览器自己的登录状态打开">业务原地址</a>
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
