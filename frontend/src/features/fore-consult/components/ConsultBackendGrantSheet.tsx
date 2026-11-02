import { useEffect, useRef, useState } from 'react'
import { Copy, Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { ApiError } from '@/lib/api'
import {
  backendEnvironment, createBackendGrant, defaultGrantDate, grantExpiry, isBackendBaseUrl,
  forgetGrantIntent, pendingGrantIntent, rememberGrantIntent,
  revokeBackendGrant, rotateBackendGrant,
  type BackendCredential, type BackendGrant, type BackendManagement,
} from '../consultBackendAdmin'

export type GrantAction = { type: 'create' } | { type: 'rotate' | 'revoke'; grant: BackendGrant }
const control = 'min-h-11 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** A single modal owns both the request and its one-time result. No secret survives unmount. */
export function ConsultBackendGrantSheet({ owner, action, projects, trigger, onClose, onChanged }: {
  owner: number
  action: GrantAction
  projects: BackendManagement['projects']
  trigger: HTMLElement | null
  onClose: () => void
  onChanged: () => void
}) {
  const grant = action.type === 'create' ? null : action.grant
  const [pending] = useState(() => action.type === 'create' ? pendingGrantIntent(owner) : null)
  const intentKey = useRef<string | null>(null)
  const [appId, setAppId] = useState(grant?.appId ?? pending?.input.appId ?? '')
  const [tenantId, setTenantId] = useState(grant?.tenantId ?? pending?.input.tenantId ?? '')
  const [selected, setSelected] = useState<string[]>(pending?.input.projectIds ?? [])
  const [date, setDate] = useState(() => pending ? new Date(pending.input.expiresAt - new Date(pending.input.expiresAt).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : defaultGrantDate())
  const [baseUrl, setBaseUrl] = useState(() => window.location.origin)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const mounted = useRef(true)
  const [credential, setCredential] = useState<BackendCredential | null>(null)
  const [saved, setSaved] = useState(false)
  const [completedIntent, setCompletedIntent] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const resultRef = useRef<HTMLTextAreaElement>(null)
  const title = action.type === 'create' ? '颁发应用凭据' : action.type === 'rotate' ? '轮换密钥与续期' : '撤销应用授权'
  const expiresAt = grantExpiry(date)
  const valid = /^[A-Za-z0-9_.:-]{1,100}$/.test(appId) && /^[A-Za-z0-9_.:-]{1,100}$/.test(tenantId)
    && Number.isFinite(expiresAt) && expiresAt > Date.now() && expiresAt < Date.now() + 366 * 86400000
    && selected.length <= 8 && isBackendBaseUrl(baseUrl)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  useEffect(() => {
    if (!busy && !credential) return
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [busy, credential])
  useEffect(() => { if (credential) resultRef.current?.focus() }, [credential])

  function close() {
    if (lock.current) return
    if (credential && !saved) { setError('请先安全保存配置，并勾选保存确认。关闭后无法再次查看此密钥。'); return }
    if ((credential || completedIntent) && intentKey.current) forgetGrantIntent(owner, intentKey.current)
    setCredential(null)
    onClose()
  }

  async function submit() {
    if (lock.current || completedIntent || (action.type !== 'revoke' && !valid)) return
    lock.current = true; setBusy(true); setError(''); setMessage('')
    try {
      if (action.type === 'revoke') {
        await revokeBackendGrant(action.grant.clientId)
        if (!mounted.current) return
        onChanged(); onClose()
      } else {
        let result: BackendCredential
        if (action.type === 'create') {
          const input = { appId, tenantId, projectIds: selected, expiresAt }
          try { intentKey.current = rememberGrantIntent(owner, input) }
          catch { setError('浏览器无法保存颁发请求标识，尚未提交授权。请检查浏览器存储设置。'); return }
          result = await createBackendGrant(input, intentKey.current)
        } else result = await rotateBackendGrant(action.grant.clientId, expiresAt)
        if (!mounted.current) return
        setCredential(result)
        onChanged()
      }
    } catch (cause) {
      if (!mounted.current) return
      onChanged()
      const definite = cause instanceof ApiError && [400, 401, 403, 409, 413, 429, 503].includes(cause.status)
      if (action.type === 'create' && cause instanceof ApiError && cause.status === 409) setCompletedIntent(true)
      setError(definite ? cause.message : '操作结果暂未确认，未自动重试。请刷新授权列表核对；如版本已变但密钥未收到，可显式再次轮换。')
    } finally { lock.current = false; setBusy(false) }
  }

  const environment = credential ? backendEnvironment(baseUrl, credential) : ''
  async function copy() {
    try { await navigator.clipboard.writeText(environment); setMessage('配置已复制，请仅粘贴到接入应用的服务端私有配置。'); setError('') }
    catch { setError('复制失败，请手动选择下方配置，或下载私有配置文件。') }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([environment], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${credential!.appId}-forge-private.env`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage('已发起配置下载，请确认文件已安全保存，不要提交到 Git。')
  }

  return <Sheet open onOpenChange={open => { if (!open) close() }}>
    <SheetContent hideCloseButton className="flex h-dvh w-full max-w-none flex-col overflow-hidden p-0 sm:max-w-lg"
      onCloseAutoFocus={event => { if (trigger?.isConnected) { event.preventDefault(); trigger.focus() } }}>
      <header className="flex items-start justify-between gap-4 border-b p-5">
        <div className="space-y-2"><SheetTitle>{credential ? '请安全保存本次密钥' : title}</SheetTitle>
          <SheetDescription>{grant ? `${grant.appId} · ${grant.tenantId}` : '为接入应用创建独立身份，员工账号和 AI 账号保持原配置。'}</SheetDescription></div>
        <Button aria-label="关闭凭据操作" variant="ghost" className="min-h-11 min-w-11" disabled={busy} onClick={close}><X /></Button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        {credential ? <>
          <p className="text-sm leading-6">密钥仅本次显示。列表不会保存或返回密钥明文；遗失后需轮换，旧票据随即失效。</p>
          <div className="space-y-2 text-xs text-muted-foreground"><p>应用：{credential.appId}</p><p>到期：{new Date(credential.expiresAt).toLocaleString()} · v{credential.version}</p></div>
          <label className="block space-y-2 text-sm">服务端私有配置<textarea ref={resultRef} aria-label="本次私有配置" readOnly value={environment}
            className="min-h-48 w-full resize-y rounded-md border bg-muted/30 p-3 font-mono text-xs leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <div className="flex flex-wrap gap-3"><Button variant="outline" className="min-h-11" onClick={() => void copy()}><Copy />复制配置</Button><Button variant="outline" className="min-h-11" onClick={download}><Download />下载私有配置</Button></div>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} />我已将密钥安全保存到服务端</label>
        </> : action.type === 'revoke' ? <>
          <p className="text-sm leading-6">撤销后，此应用凭据及已签发票据立即失效，不能重新启用。原分析任务和结果保留。</p>
          <p className="break-all font-mono text-xs text-muted-foreground">{grant!.clientId}</p>
          <p className="text-sm leading-6">重新授权会产生新的 clientId，新凭据不能读取旧 clientId 的任务。仅需更换密钥时，请使用轮换。</p>
        </> : <form id="backend-grant-form" className="space-y-5" autoComplete="off" onSubmit={event => { event.preventDefault(); void submit() }}>
          {pending && <p className="text-xs leading-5 text-muted-foreground">已恢复上次颁发草稿和请求标识。先核对列表中的结果；相同请求不会再颁发第二组凭据。</p>}
          <label className="block space-y-2 text-sm">应用标识<input className={control} aria-label="应用标识" value={appId} disabled={busy || !!grant} maxLength={100} placeholder="例如 yoooni-agent" onChange={event => setAppId(event.target.value)} required pattern="[A-Za-z0-9_.:-]+" /></label>
          <label className="block space-y-2 text-sm">企业标识<input className={control} aria-label="企业标识" value={tenantId} disabled={busy || !!grant} maxLength={100} placeholder="例如 yoooni-agent-test-tenant" onChange={event => setTenantId(event.target.value)} required pattern="[A-Za-z0-9_.:-]+" /></label>
          <label className="block space-y-2 text-sm">凭据到期日<input type="date" className={control} aria-label="凭据到期日" value={date} disabled={busy} onChange={event => setDate(event.target.value)} required /></label>
          <label className="block space-y-2 text-sm">交付给应用的 Forge 地址<input type="url" className={control} aria-label="Forge 地址" value={baseUrl} disabled={busy} onChange={event => setBaseUrl(event.target.value)} required />
            <span className="block text-xs leading-5 text-muted-foreground">填写可访问的站点根地址。同机可用实际后端回环地址，跨机器须用可信 HTTPS；本项只生成交付配置，不改变服务地址。</span></label>
          {grant ? <p className="text-xs leading-5 text-muted-foreground">保留原企业、项目范围和任务归属。确认轮换后，旧密钥和旧票据立即失效，请同步更新接入应用。</p>
            : <fieldset disabled={busy} className="space-y-2"><legend className="mb-2 text-sm">允许引用源码的项目（最多 8 个）</legend>
              <p className="text-xs leading-5 text-muted-foreground">不选项目可先分析调用方资料；不会自动授权 ERP、数据库或 Web 账号。</p>
              <div className="max-h-56 overflow-y-auto">{projects.map(project => <label key={project.id} className="flex min-h-11 items-center gap-3 border-b py-2 text-sm">
                <input type="checkbox" checked={selected.includes(project.id)} disabled={!selected.includes(project.id) && selected.length >= 8}
                  onChange={event => setSelected(values => event.target.checked ? [...values, project.id] : values.filter(id => id !== project.id))} />
                <span className="min-w-0 break-all">{project.name}<span className="block text-xs text-muted-foreground">{project.id}</span></span></label>)}
                {!projects.length && <p className="py-3 text-xs text-muted-foreground">暂无可授权项目，可以先不授权源码。</p>}</div>
            </fieldset>}
          {!valid && <p className="text-xs leading-5 text-muted-foreground">标识限字母、数字及 _ . : -；有效期须在未来一年内；地址应为 HTTPS 或本机回环 HTTP。</p>}
        </form>}
        {busy && <p role="status" className="text-sm">正在提交，请等待本次结果，避免重复颁发。</p>}
        {message && <p role="status" className="text-sm">{message}</p>}
        {error && <p role="alert" className="text-sm leading-6 text-destructive">{error}</p>}
      </div>
      <footer className="flex shrink-0 justify-end gap-3 border-t p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {credential ? <Button className="min-h-11" disabled={!saved} onClick={close}>已保存，清除并关闭</Button>
          : <><Button className="min-h-11" variant="outline" disabled={busy} onClick={close}>{completedIntent ? '返回列表核对' : '取消'}</Button>
            {action.type === 'revoke' ? <Button className="min-h-11" variant="destructive" disabled={busy} onClick={() => void submit()}>确认撤销</Button>
              : <Button className="min-h-11" type="submit" form="backend-grant-form" disabled={busy || completedIntent || !valid}>{busy ? '正在提交…' : action.type === 'create' ? '确认颁发' : '确认轮换'}</Button>}</>}
      </footer>
    </SheetContent>
  </Sheet>
}
