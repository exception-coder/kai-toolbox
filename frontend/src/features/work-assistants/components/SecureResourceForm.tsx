import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LockKeyhole, ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FixedCombobox } from '@/components/ui/fixed-combobox'
import { useAuth } from '@/lib/auth'
import { enrollResource, listResourceGroups, type Enrollment } from '../api'
import { parseResourceInput } from '../lib/parseResourceInput'

const initial = (): Enrollment => ({ requestId: crypto.randomUUID(), kind: 'DATABASE', name: '', environment: 'SIT', systemId: '', type: 'ORACLE', host: '', port: 1521, database: '', baseUrl: '', loginPath: '', username: '', password: '' })
/** 秘密只保留在当前表单内存中；预览不落库、不调用模型、不持久化浏览器草稿。 */
export function SecureResourceForm({ onClose, onDirtyChange, onBusyChange }: { onClose: () => void; onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void }) {
  const { user } = useAuth()
  const [value, setValue] = useState(initial), [preview, setPreview] = useState(false), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [receipt, setReceipt] = useState<{ resourceId: string; configurationUrl: string } | null>(null)
  const [paste, setPaste] = useState(''), [parseNotice, setParseNotice] = useState('')
  const groups = useQuery({ queryKey: ['work-assistants', user?.userId, 'resource-groups'], queryFn: listResourceGroups })
  useEffect(() => { onDirtyChange?.(!receipt && !!(paste || value.name || value.host || value.baseUrl || value.username || value.password)) }, [value, paste, receipt, onDirtyChange])
  useEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])
  useEffect(() => () => { onDirtyChange?.(false); onBusyChange?.(false) }, [onDirtyChange, onBusyChange])
  const update = <K extends keyof Enrollment>(field: K, next: Enrollment[K]) => setValue(current => ({ ...current, requestId: crypto.randomUUID(), [field]: next }))
  const save = async () => {
    setBusy(true); setError('')
    try { const result = await enrollResource(value); setReceipt(result); setValue(initial()) }
    catch (failure) { setError(failure instanceof Error ? failure.message : '保存失败，请先核对原资源记录再重试') }
    finally { setBusy(false) }
  }
  const input = (field: 'name' | 'host' | 'database' | 'baseUrl' | 'loginPath' | 'username' | 'password', label: string, required = false) => <label className="block text-sm">{label}<input required={required} type={field === 'password' ? 'password' : 'text'} autoComplete={field === 'password' ? 'new-password' : 'off'} className="wa-field mt-2" value={value[field]} maxLength={field === 'password' ? 4096 : 250} onChange={event => update(field, event.target.value)} /></label>
  return <section className="min-h-0 flex-1 overflow-y-auto p-5" aria-label="资源安全登记">
    <div className="mb-5 flex items-center gap-2"><LockKeyhole className="size-4" /><h3 className="font-medium">安全登记</h3></div>
    <p className="mb-5 text-xs leading-5 text-[var(--color-muted-foreground)]">密码直接交给资源中心，不进入助理聊天或模型。请勿在名称、备注和普通对话中填写秘密。关闭会清除尚未保存的密码。</p>
    {receipt ? <div role="status" className="space-y-4"><p>已保存到原资源中心，记录 ID：{receipt.resourceId}</p><a className="inline-flex min-h-11 items-center gap-2 underline" href={receipt.configurationUrl}>查看或修改原记录<ArrowUpRight className="size-4" /></a></div>
      : preview ? <div className="space-y-5"><dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">{[['名称', value.name], ['类型', value.kind === 'DATABASE' ? value.type : '应用站点账号'], ['环境', value.environment], ['系统', groups.data?.find(group => group.id === value.systemId)?.name || '不绑定系统'], ['地址', value.kind === 'DATABASE' ? `${value.host}:${value.port}/${value.database}` : value.baseUrl], ['账号', value.username || '未填写'], ['密码', value.password ? '已填写 · 不回显' : '未填写']].map(([label, text]) => <div key={label} className="contents"><dt className="text-[var(--color-muted-foreground)]">{label}</dt><dd className="min-w-0 break-all">{text}</dd></div>)}</dl>
        <p className="text-xs leading-5 text-[var(--color-muted-foreground)]">只登记配置，不会测试连接、查询数据库或改变咨询绑定。生产环境也不因此获得执行权限。</p>
        <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void save()}>{busy ? '正在保存…' : '确认保存到资源中心'}</Button><Button variant="outline" disabled={busy} onClick={() => setPreview(false)}>返回修改</Button></div>
      </div> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); setPreview(true); setError('') }}>
        <details className="border-b pb-4"><summary className="cursor-pointer py-2 text-sm font-medium">快速粘贴连接信息</summary><label className="mt-3 block text-xs text-[var(--color-muted-foreground)]">一行一个字段，如 host、port、database、username、password，使用冒号或等号分隔。仅在本机表单解析，不发送给模型。<textarea aria-label="待解析连接信息" autoComplete="off" spellCheck={false} className="wa-field mt-2 min-h-24" value={paste} maxLength={12000} onChange={event => setPaste(event.target.value)} /></label><Button type="button" variant="outline" className="mt-3" onClick={() => { const parsed = parseResourceInput(paste); setValue(current => ({ ...current, ...parsed.patch, requestId: crypto.randomUUID() })); setPaste(''); setParseNotice(parsed.unknown ? `有 ${parsed.unknown} 行未识别，请核对下方字段后补充。未识别内容未保存。` : '已填入下方字段，请继续核对系统、类型与环境。') }}>解析并填入表单</Button>{parseNotice && <p role="status" className="mt-2 text-xs">{parseNotice}</p>}</details>
        <div><label htmlFor="wa-kind" className="text-sm">登记类型</label><FixedCombobox id="wa-kind" className="mt-2 min-h-11" value={value.kind} onChange={next => update('kind', next as Enrollment['kind'])} options={[{ value: 'DATABASE', label: '数据库与中间件' }, { value: 'APPLICATION', label: '应用站点账号' }]} /></div>
        {input('name', '名称', true)}
        <div><label htmlFor="wa-env" className="text-sm">环境</label><FixedCombobox id="wa-env" className="mt-2 min-h-11" value={value.environment} onChange={next => update('environment', next)} options={['DEV', 'SIT', 'PROD'].map(id => ({ value: id, label: id }))} /></div>
        {value.kind === 'DATABASE' ? <>
          <div><label htmlFor="wa-system" className="text-sm">已有系统分组（可选）</label><FixedCombobox id="wa-system" className="mt-2 min-h-11" value={value.systemId} onChange={next => update('systemId', next)} options={[{ value: '', label: '不绑定系统' }, ...(groups.data ?? []).map(group => ({ value: group.id, label: group.name }))]} /></div>
          {groups.isError && <p role="alert" className="text-sm">系统分组读取失败，<button type="button" className="min-h-11 underline" onClick={() => void groups.refetch()}>重试</button></p>}
          <div><label htmlFor="wa-type" className="text-sm">实例类型</label><FixedCombobox id="wa-type" className="mt-2 min-h-11" value={value.type} onChange={next => { update('type', next); update('port', ({ ORACLE: 1521, MYSQL: 3306, REDIS: 6379, RABBITMQ: 5672, KAFKA: 9092 } as Record<string, number>)[next]) }} options={['ORACLE', 'MYSQL', 'REDIS', 'RABBITMQ', 'KAFKA'].map(id => ({ value: id, label: id }))} /></div>
          {input('host', '主机地址', true)}<label className="block text-sm">端口<input type="number" required min={1} max={65535} className="wa-field mt-2" value={value.port} onChange={event => update('port', Number(event.target.value))} /></label>{input('database', '数据库 / Service Name / DB 索引')}
        </> : <>{input('baseUrl', '站点地址（HTTP / HTTPS）', true)}{input('loginPath', '登录路径（可选）')}</>}
        {input('username', '账号')}{input('password', '密码')}
        <Button type="submit">核对登记信息</Button>
      </form>}
    {error && <p role="alert" className="mt-4 break-words text-sm text-[var(--color-destructive)]">{error}</p>}
    <Button className="mt-5 min-h-11" variant="ghost" disabled={busy} onClick={onClose}>{receipt ? '返回助理' : '取消并清除密码'}</Button>
  </section>
}
