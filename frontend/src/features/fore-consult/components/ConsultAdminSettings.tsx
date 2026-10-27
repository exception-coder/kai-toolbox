import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { getConsultAttachmentPolicy, saveConsultAttachmentPolicy } from '../consultAttachmentPolicy'
import { ConsultDatabaseSettings } from './ConsultDatabaseSettings'
import type { BusinessConsultModelPolicy } from '../api'
import { ConsultAccountPolicyStatus } from './ConsultAccountPolicyStatus'

/** 管理员从原配置抽屉管理附件限制，并定位唯一数据库事实源。 */
export function ConsultAdminSettings({ sourcePath, modelPolicy }: { sourcePath?: string; modelPolicy?: BusinessConsultModelPolicy }) {
  const client = useQueryClient()
  const limits = useQuery({ queryKey: ['consult-attachment-policy'], queryFn: getConsultAttachmentPolicy })
  const [draft, setDraft] = useState<{ uploadMaxMb: number; readMaxMb: number } | null>(null)
  const save = useMutation({ mutationFn: saveConsultAttachmentPolicy, onSuccess: value => {
    client.setQueryData(['consult-attachment-policy'], value); setDraft(null)
  } })
  const values = draft ?? limits.data
  const invalid = !values || !Number.isInteger(values.uploadMaxMb) || !Number.isInteger(values.readMaxMb)
    || values.uploadMaxMb < 1 || values.uploadMaxMb > 200 || values.readMaxMb < 1 || values.readMaxMb > values.uploadMaxMb
    || values.uploadMaxMb * 1024 * 1024 > (limits.data?.transportMaxBytes ?? 0)
  return <div className="space-y-6 border-b pb-6 text-sm">
    <section aria-labelledby="consult-account-settings" className="space-y-3">
      <h3 id="consult-account-settings" className="font-semibold">咨询默认 AI 账号</h3>
      <p className="break-all text-xs text-muted-foreground">{modelPolicy?.codexHome ?? '尚未配置'} · {modelPolicy?.displayName ?? modelPolicy?.model ?? '尚未选择模型'}</p>
      <ConsultAccountPolicyStatus policy={modelPolicy} />
    </section>
    <section aria-labelledby="consult-file-settings" className="space-y-3">
      <h3 id="consult-file-settings" className="font-semibold">附件大小</h3>
      <p className="text-xs leading-5 text-muted-foreground">全体用户共用，保存后下次上传或读取立即生效，包含已有咨询。上传和读取是不同限制，不会扩大源码读取权限。</p>
      {limits.isPending && <p role="status">正在读取附件配置…</p>}
      {limits.isError && <p role="alert">附件配置读取失败，暂不可修改。<button className="min-h-11 underline" onClick={() => void limits.refetch()}>重试</button></p>}
      {values && <form onSubmit={event => { event.preventDefault(); if (!invalid) save.mutate(values) }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">{([['uploadMaxMb', '单文件上传上限'], ['readMaxMb', '附件读取上限']] as const).map(([key, label]) =>
          <label key={key} className="min-w-0 space-y-2 text-xs"><span className="block">{label}（MiB）</span>
            <input aria-label={label} type="number" min="1" max={key === 'readMaxMb' ? values.uploadMaxMb : Math.min(200, (limits.data?.transportMaxBytes ?? 0) / 1024 / 1024)} step="1"
              disabled={save.isPending || !limits.isSuccess} value={Number.isNaN(values[key]) ? '' : values[key]}
              onChange={event => { setDraft({ uploadMaxMb: values.uploadMaxMb, readMaxMb: values.readMaxMb, [key]: event.target.valueAsNumber }); save.reset() }}
              className="min-h-11 w-full rounded-md border bg-background px-3 text-sm" />
          </label>)}</div>
        <p className="text-xs leading-5 text-muted-foreground">当前生效：上传 {(limits.data?.effectiveUploadBytes ?? 0) / 1024 / 1024} MiB；读取 {(limits.data?.effectiveReadBytes ?? 0) / 1024 / 1024} MiB。部署传输上限 {(limits.data?.transportMaxBytes ?? 0) / 1024 / 1024} MiB，每条最多10个附件。文本/HTML分段读取；XLSX按工作表分页，另受解压和表格规模限制。图片输入仍受模型限制，旧XLS、Word/PDF需转存支持格式。</p>
        {draft && invalid && <p role="alert" className="text-xs text-destructive">请填写1至200的整数，读取不超过上传，上传不超过部署上限。</p>}
        {save.isError && <p role="alert" className="text-xs text-destructive">{save.error.message}；原配置未更改，请重试。</p>}
        {save.isSuccess && <p role="status" className="text-xs">附件限制已保存并生效。</p>}
        <Button type="submit" variant="outline" disabled={!draft || invalid || save.isPending || !limits.isSuccess}>{save.isPending ? '正在保存…' : '保存附件限制'}</Button>
      </form>}
    </section>
    <ConsultDatabaseSettings sourcePath={sourcePath} />
  </div>
}
