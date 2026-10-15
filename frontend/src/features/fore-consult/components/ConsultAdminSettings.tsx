import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { getConsultAttachmentPolicy, getConsultDatabaseConfiguration, saveConsultAttachmentPolicy } from '../consultAttachmentPolicy'

/** 管理员从原配置抽屉管理附件限制，并定位唯一数据库事实源。 */
export function ConsultAdminSettings() {
  const client = useQueryClient()
  const limits = useQuery({ queryKey: ['consult-attachment-policy'], queryFn: getConsultAttachmentPolicy })
  const databases = useQuery({ queryKey: ['consult-database-configuration'], queryFn: getConsultDatabaseConfiguration })
  const [draft, setDraft] = useState<{ uploadMaxMb: number; readMaxMb: number } | null>(null)
  const save = useMutation({ mutationFn: saveConsultAttachmentPolicy, onSuccess: value => {
    client.setQueryData(['consult-attachment-policy'], value); setDraft(null)
  } })
  const values = draft ?? limits.data
  const invalid = !values || !Number.isInteger(values.uploadMaxMb) || !Number.isInteger(values.readMaxMb)
    || values.uploadMaxMb < 1 || values.uploadMaxMb > 200 || values.readMaxMb < 1 || values.readMaxMb > values.uploadMaxMb
    || values.uploadMaxMb * 1024 * 1024 > (limits.data?.transportMaxBytes ?? 0)
  const selected = databases.data?.selectedBindingIds ?? []
  const missing = selected.filter(id => !databases.data?.resources.some(resource => resource.bindingId === id))
  const refresh = () => { void limits.refetch(); void databases.refetch() }
  return <div className="space-y-6 border-b pb-6 text-sm">
    <section aria-labelledby="consult-file-settings" className="space-y-3">
      <h3 id="consult-file-settings" className="font-semibold">附件大小</h3>
      <p className="text-xs leading-5 text-muted-foreground">全体用户共用，保存后下次上传或读取立即生效，包含已有咨询。上传和读取是不同限制，不会扩大源码读取权限。</p>
      {limits.isPending && <p role="status">正在读取附件配置…</p>}
      {limits.isError && <p role="alert">附件配置读取失败，暂不可修改。<button className="min-h-11 underline" onClick={() => void limits.refetch()}>重试</button></p>}
      {values && <form onSubmit={event => { event.preventDefault(); if (!invalid) save.mutate(values) }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">{([['uploadMaxMb', '单文件上传上限'], ['readMaxMb', '文本附件读取上限']] as const).map(([key, label]) =>
          <label key={key} className="min-w-0 space-y-2 text-xs"><span className="block">{label}（MiB）</span>
            <input aria-label={label} type="number" min="1" max={key === 'readMaxMb' ? values.uploadMaxMb : Math.min(200, (limits.data?.transportMaxBytes ?? 0) / 1024 / 1024)} step="1"
              disabled={save.isPending || !limits.isSuccess} value={Number.isNaN(values[key]) ? '' : values[key]}
              onChange={event => { setDraft({ uploadMaxMb: values.uploadMaxMb, readMaxMb: values.readMaxMb, [key]: event.target.valueAsNumber }); save.reset() }}
              className="min-h-11 w-full rounded-md border bg-background px-3 text-sm" />
          </label>)}</div>
        <p className="text-xs leading-5 text-muted-foreground">当前生效：上传 {(limits.data?.effectiveUploadBytes ?? 0) / 1024 / 1024} MiB；读取 {(limits.data?.effectiveReadBytes ?? 0) / 1024 / 1024} MiB。部署传输上限 {(limits.data?.transportMaxBytes ?? 0) / 1024 / 1024} MiB，每条最多10个附件。图片输入仍受模型限制；文本/HTML分段读取不等于执行网页或完整解析Office。</p>
        {draft && invalid && <p role="alert" className="text-xs text-destructive">请填写1至200的整数，读取不超过上传，上传不超过部署上限。</p>}
        {save.isError && <p role="alert" className="text-xs text-destructive">{save.error.message}；原配置未更改，请重试。</p>}
        {save.isSuccess && <p role="status" className="text-xs">附件限制已保存并生效。</p>}
        <Button type="submit" variant="outline" disabled={!draft || invalid || save.isPending || !limits.isSuccess}>{save.isPending ? '正在保存…' : '保存附件限制'}</Button>
      </form>}
    </section>
    <section aria-labelledby="consult-database-settings" className="space-y-3">
      <div className="flex items-center justify-between gap-3"><h3 id="consult-database-settings" className="font-semibold">咨询数据库</h3><Button variant="ghost" onClick={refresh} disabled={databases.isFetching}>刷新</Button></div>
      <p className="text-xs leading-5 text-muted-foreground">以下为当前系统绑定资源；标记“已发布流程选用”的连接才可能用于新咨询，且必须匹配咨询系统。旧咨询保留资源选择快照；连接地址修改影响下次查询，不回退ERP旧连接。</p>
      {databases.isPending && <p role="status">正在读取数据库配置…</p>}
      {databases.isError && <p role="alert" className="text-xs text-destructive">数据库配置读取失败，请刷新重试。</p>}
      {databases.isSuccess && !selected.length && <p className="text-xs">已发布流程尚未选择数据库，请到下方流程入口配置并发布。</p>}
      {missing.length > 0 && <p role="alert" className="break-all text-xs text-destructive">已发布流程包含失效绑定：{missing.join('、')}。请重新配置。</p>}
      <ul className="divide-y">{databases.data?.resources.map(resource => <li key={resource.bindingId} className="space-y-1 py-3 text-xs">
        <p className="font-medium">{resource.systemName} · {resource.name}</p>
        <p className="break-all font-mono">{resource.endpoint || '地址不可用'} · {resource.environment}</p>
        <p className="text-muted-foreground">{selected.includes(resource.bindingId) ? '已发布流程选用' : '未被已发布流程选用'} · {resource.state === 'AVAILABLE' ? '允许查询（未代表已测试连接）' : `不可查询：${resource.state}`}</p>
        <a className="inline-flex min-h-11 items-center underline underline-offset-4" href={resource.configurationUrl} target="_blank" rel="noreferrer">查看 / 修改此连接 ↗</a>
      </li>)}</ul>
      <div className="flex flex-wrap gap-x-4 text-xs">
        <a className="inline-flex min-h-11 items-center underline" href="/tools/reqpool/resources?view=connections" target="_blank" rel="noreferrer">连接与系统绑定 ↗</a>
        <a className="inline-flex min-h-11 items-center underline" href="/tools/agent-management?agent=business-consult" target="_blank" rel="noreferrer">选择咨询数据库并发布 ↗</a>
      </div>
    </section>
  </div>
}
