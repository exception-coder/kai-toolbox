import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { FixedCombobox } from '@/components/ui/fixed-combobox'
import { VoiceInputButton } from '@/features/claude-chat/public-api/voice'
import { useAuth } from '@/lib/auth'
import { enrollResource, listResourceGroups } from '../api'
import { parseNaturalResourceInput } from '../lib/parseNaturalResourceInput'
import { useRememberedProjects } from '../lib/useRememberedProjects'

/** Sensitive intake lives only in this mounted component and the enrollment API. */
export function ResourceIntake({ onClose, onDirtyChange, onBusyChange, onManual }: {
  onClose: () => void; onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void
  onManual?: () => void
}) {
  const { user } = useAuth()
  const groups = useQuery({ queryKey: ['work-assistants', user?.userId, 'resource-groups'], queryFn: listResourceGroups })
  const [selectedSystems, rememberSystem] = useRememberedProjects('resources', (groups.data || []).map(group => group.id))
  const systemId = selectedSystems[0] || ''
  const [environment, setEnvironment] = useState('')
  const [text, setText] = useState(''), [busy, setBusy] = useState(false)
  const [parsed, setParsed] = useState<ReturnType<typeof parseNaturalResourceInput> | null>(null)
  const [error, setError] = useState(''), [receipt, setReceipt] = useState<{ resourceId: string; configurationUrl: string } | null>(null)
  const submitting = useRef(false)
  useEffect(() => { onDirtyChange?.(!receipt && !!text) }, [text, receipt, onDirtyChange])
  useEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])
  useEffect(() => () => { onDirtyChange?.(false); onBusyChange?.(false) }, [onDirtyChange, onBusyChange])
  const inspect = () => {
    setError('')
    const result = parseNaturalResourceInput(text, systemId, groups.data?.find(group => group.id === systemId)?.name || '', environment)
    if (result.missing.length) { setError(`还需要补充：${result.missing.join('、')}。直接补充在输入中即可。`); return }
    setParsed(result)
  }
  const save = async () => {
    if (!parsed || submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    try { const result = await enrollResource(parsed.value); setText(''); setParsed(null); setReceipt(result) }
    catch (failure) {
      const message = failure instanceof Error ? failure.message : ''
      setError(/^(该连接与账号已登记|主机账号已登记|该站点账号已登记|请选择已有系统分组|请核对|请补充主机|主机登记能力未就绪|该登记请求已使用)/.test(message)
        ? message : '保存结果尚未确认，输入已保留；可重试同一次登记，或前往资源中心核对。')
    }
    finally { submitting.current = false; setBusy(false) }
  }
  return <section className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5" aria-label="自然语言资源登记">
    {receipt ? <div role="status" className="space-y-3"><p>已登记，资源 ID：{receipt.resourceId}</p><a href={receipt.configurationUrl} className="inline-flex min-h-11 items-center underline">查看和修改原记录</a><Button onClick={() => setReceipt(null)}>继续登记</Button></div>
      : parsed ? <div className="space-y-4"><h3 className="font-medium">已识别，核对后即可登记</h3><dl className="space-y-2 text-sm">{[
        ['项目', groups.data?.find(group => group.id === parsed.value.systemId)?.name || '不绑定系统'], ['环境', parsed.value.environment],
        ['分类', parsed.value.kind === 'HOST' ? 'SSH 主机' : parsed.value.kind === 'APPLICATION' ? '应用站点' : parsed.value.type],
        ['地址', parsed.value.kind === 'APPLICATION' ? parsed.value.baseUrl : `${parsed.value.host}:${parsed.value.port}/${parsed.value.database}`],
        ['账号', parsed.value.username || '未提供'], ['密码', parsed.value.password ? '已提取 · 不回显' : '未提供'],
      ].map(([label, value]) => <div className="grid grid-cols-[4rem_1fr] gap-3" key={label}><dt className="text-[var(--color-muted-foreground)]">{label}</dt><dd className="min-w-0 break-all">{value}</dd></div>)}</dl>
        <p className="text-xs leading-5 text-[var(--color-muted-foreground)]">只登记配置，不测试连接、不执行命令，也不改变业务咨询绑定。</p>
        <div className="flex gap-3"><Button disabled={busy} onClick={() => void save()}>{busy ? '正在登记…' : '确认登记'}</Button><Button variant="outline" disabled={busy} onClick={() => setParsed(null)}>补充或修改</Button></div>
      </div> : <form className="space-y-5" onSubmit={event => { event.preventDefault(); inspect() }}>
        <fieldset><legend className="mb-2 text-sm">环境（必选）</legend><div className="flex gap-2">
          {(['DEV', 'SIT', 'PROD'] as const).map(item => <Button key={item} type="button" variant={environment === item ? 'secondary' : 'outline'} className="min-h-11 flex-1" aria-pressed={environment === item} onClick={() => setEnvironment(item)}>{item}</Button>)}
        </div></fieldset>
        <div><label htmlFor="wa-resource-system" className="text-sm">所属项目 / 系统（可选）</label><FixedCombobox id="wa-resource-system" className="mt-2 min-h-11" value={systemId} onChange={id => rememberSystem(id ? [id] : [])} options={[{ value: '', label: '不绑定系统' }, ...(groups.data || []).map(group => ({ value: group.id, label: group.name }))]} /></div>
        {groups.isError && <p role="alert" className="text-sm">系统列表读取失败，仍可不绑定系统登记。<button type="button" className="min-h-11 underline" onClick={() => void groups.refetch()}>重试读取</button></p>}
        <label className="block text-sm">直接说或粘贴资源信息<textarea autoComplete="off" spellCheck={false} maxLength={12000} className="wa-field mt-2 min-h-40 resize-y" value={text} onChange={event => setText(event.target.value)} placeholder={'例如：MySQL 10.0.0.8:3306\n数据库：erp\n账号：report\n密码：…\n也可以只粘贴 MySQL / Redis / SSH 连接串。'} /></label>
        <p className="text-xs leading-5 text-[var(--color-muted-foreground)]">所选环境会用于登记，粘贴内容无需重复填写环境；如有冲突会提示核对。密码只在此安全输入中处理，不进入普通聊天、对话模型或浏览器持久存储。每次登记一项；语音请只描述资源，不口述密码。</p>
        <div className="flex items-center justify-between gap-3"><VoiceInputButton scope="work-assistants" onText={value => setText(current => `${current}${current ? '\n' : ''}${value}`)} /><Button type="submit" disabled={!environment || !text.trim()}>识别并登记</Button></div>
      </form>}
    {error && <p role="alert" className="text-sm leading-6 text-[var(--color-destructive)]">{error}</p>}
    {onManual && !receipt && <details className="border-t pt-3"><summary className="cursor-pointer py-2 text-xs text-[var(--color-muted-foreground)]">高级 · 手动填写</summary><Button variant="ghost" disabled={busy} onClick={onManual}>打开原安全表单（清除当前粘贴）</Button></details>}
    <Button variant="ghost" disabled={busy} onClick={() => { setText(''); setParsed(null); setReceipt(null); setError(''); onClose() }}>{receipt ? '返回助理' : '关闭并清除输入'}</Button>
  </section>
}
