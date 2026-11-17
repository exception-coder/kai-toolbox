import { useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { http } from '@/lib/api'

interface LoginState {
  configured: boolean
  siteUrl?: string
  environment?: string
  expiresAt: number
  result?: { page?: { status?: string } }
}

/** 凭据只提交本人鉴权接口，不进入聊天、工具参数或本地存储。 */
export function ConsultPersonalLogin({ consultId }: { consultId: string }) {
  const id = useId()
  const [siteUrl, setSiteUrl] = useState('')
  const [environment, setEnvironment] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginPage, setLoginPage] = useState('')
  const [state, setState] = useState<LoginState | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const endpoint = `/fore-consult/sessions/${encodeURIComponent(consultId)}/personal-web`

  async function refresh() {
    if (busy) return
    setBusy(true)
    try { setState(await http<LoginState>(endpoint)); setMessage('') }
    catch { setMessage('暂时无法读取个人登录状态，请稍后重新展开。仅咨询本人可操作。') }
    finally { setBusy(false) }
  }

  async function login(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('正在静默登录，请稍候…')
    try {
      const next = await http<LoginState>(endpoint, { method: 'POST', body: JSON.stringify({ siteUrl, environment, username, password, loginPage: loginPage || null }) })
      setState(next)
      setMessage(next.result?.page?.status === 'READY'
        ? '已登录。继续提问时说明“使用我的个人账号查看”，即可在本次咨询中读取。'
        : '登录未完成，请检查账号或登录页；验证码和跨域单点登录暂不支持。修改后可重新登录。')
    } catch { setState(null); setMessage('登录未完成，请核对站点、环境和账号。仅支持本人的进行中咨询及非生产站点。') }
    finally { setPassword(''); setBusy(false) }
  }

  async function logout() {
    setBusy(true)
    try {
      await http<void>(endpoint, { method: 'DELETE' }, 'empty')
      setState(null); setPassword(''); setMessage('已退出，个人账号授权和登录态已释放。')
    } catch { setMessage('退出未确认，请重试；不要假定登录态已释放。') }
    finally { setBusy(false) }
  }

  return <details className="shrink-0 border-b bg-background text-foreground" onToggle={event => {
    if (event.currentTarget.open) void refresh()
    else setPassword('')
  }}>
    <summary className="min-h-11 cursor-pointer px-4 py-3 text-xs focus-visible:outline focus-visible:outline-2">本次咨询使用个人账号</summary>
    <div className="max-h-[60dvh] overflow-y-auto px-4 pb-4 text-xs">
      <p className="mb-3 text-muted-foreground">填写测试站点和本人账号，无需登记公共账号。仅本次咨询可用，15 分钟后自动释放；密码不写入聊天或公共账号库。内网或非标准端口站点须先在资源中心登记地址。</p>
      {state?.configured && <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="min-w-0 break-all">临时授权：{state.siteUrl} · {state.environment} · 至 {new Date(state.expiresAt).toLocaleTimeString()}</span>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void logout()}>退出个人账号</Button>
      </div>}
      <form onSubmit={event => void login(event)} className="grid gap-3" autoComplete="off">
        <label htmlFor={`${id}-site`}>应用地址
          <Input id={`${id}-site`} type="url" required maxLength={2048} value={siteUrl} onChange={e => setSiteUrl(e.target.value)} placeholder="https://test.example.com" className="mt-1 min-h-11" />
        </label>
        <label htmlFor={`${id}-env`}>站点环境
          <select id={`${id}-env`} required value={environment} onChange={e => setEnvironment(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3 text-sm">
            <option value="">请选择已确认的非生产环境</option>
            <option value="TEST">测试 TEST</option><option value="UAT">验收 UAT</option><option value="DEV">开发 DEV</option><option value="LOCAL">本地 LOCAL</option>
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor={`${id}-user`}>个人账号<Input id={`${id}-user`} required maxLength={200} value={username} onChange={e => setUsername(e.target.value)} className="mt-1 min-h-11" /></label>
          <label htmlFor={`${id}-password`}>密码<Input id={`${id}-password`} type="password" required maxLength={1000} value={password} onChange={e => setPassword(e.target.value)} className="mt-1 min-h-11" /></label>
        </div>
        <label htmlFor={`${id}-login`}>登录页路径（可选）<Input id={`${id}-login`} maxLength={512} value={loginPage} onChange={e => setLoginPage(e.target.value)} placeholder="例如 /login，默认从应用地址进入" className="mt-1 min-h-11" /></label>
        <Button type="submit" disabled={busy} className="min-h-11 justify-self-start">{busy ? '处理中…' : '静默登录并用于本次咨询'}</Button>
        {message && <p role="status" className="break-words">{message}</p>}
      </form>
    </div>
  </details>
}
