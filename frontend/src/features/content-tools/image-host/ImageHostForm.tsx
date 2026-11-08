import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { HostProfile, HostSave, HostSettings } from './api'

const empty: HostSettings = { name: '', provider: 'OSS', endpoint: '', region: '', bucket: '', prefix: 'markdown', publicBaseUrl: '', repository: '', branch: 'main', pathStyle: false }
const fieldClass = 'min-w-0 space-y-1 text-sm'
const creationKey = 'forge:image-host:pending-creation'
function creationId() {
  try {
    const previous = sessionStorage.getItem(creationKey)
    if (previous && /^[\da-f-]{36}$/i.test(previous)) return previous
    const id = crypto.randomUUID(); sessionStorage.setItem(creationKey, id); return id
  } catch { return crypto.randomUUID() }
}
function clearCreation() { try { sessionStorage.removeItem(creationKey) } catch { /* No credentials are persisted. */ } }
export function ImageHostForm({ profile, busy, onSave, onClose }: {
  profile?: HostProfile; busy: boolean; onSave: (value: HostSave) => Promise<void>; onClose: () => void
}) {
  const [settings, setSettings] = useState<HostSettings>(profile?.settings ?? empty)
  const [accessKey, setAccessKey] = useState('')
  const [secret, setSecret] = useState('')
  const [makeDefault, setDefault] = useState(profile?.isDefault ?? !profile)
  const [requestId] = useState(() => profile?.id ?? creationId())
  const field = (key: keyof HostSettings, title: string, placeholder = '', required = true) => <label className={fieldClass}>{title}
    <Input autoComplete="off" required={required} value={String(settings[key])} placeholder={placeholder}
      onChange={event => setSettings(s => ({ ...s, [key]: event.target.value }))} /></label>
  const keeping = profile?.settings.provider === settings.provider && profile.credentialsConfigured
  return <form aria-label="图床配置" className="space-y-4 border-b pb-5" onSubmit={event => {
    event.preventDefault(); void onSave({ settings, accessKey, secret, makeDefault, creationId: requestId }).then(() => { setAccessKey(''); setSecret(''); if (!profile) clearCreation() }).catch(() => { /* Parent preserves form and reports error. */ })
  }}>
    <fieldset disabled={busy} className="space-y-4">
      <div className="flex items-center justify-between gap-3"><h2 className="font-medium">{profile ? '编辑图床' : '新增图床'}</h2><Button type="button" variant="ghost" onClick={() => { if (!profile) clearCreation(); onClose() }}>取消</Button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field('name', '配置名称', '例如：团队文档图片')}
        <label className={fieldClass}>图床类型<select className="h-10 w-full rounded-md border bg-[var(--color-background)] px-3" value={settings.provider} onChange={event => {
          setSettings(s => ({ ...empty, name: s.name, provider: event.target.value as HostSettings['provider'] })); setAccessKey(''); setSecret('')
        }}><option value="OSS">阿里云 OSS</option><option value="S3">S3 兼容（S3 / R2 / MinIO）</option><option value="GITHUB">GitHub 仓库</option></select></label>
        {settings.provider === 'GITHUB' ? <>
          {field('repository', '仓库', 'owner/repository')}{field('branch', '分支', 'main')}
          <p className="text-xs text-[var(--color-muted-foreground)] sm:col-span-2">建议使用专门的公开图片仓库和仅该仓库 Contents 写权限的 Token。私有仓库图片不能保证在同事的阅读器中显示。</p>
        </> : <>
          {field('endpoint', '上传 Endpoint', settings.provider === 'OSS' ? 'https://oss-cn-hangzhou.aliyuncs.com' : 'https://s3.example.com')}
          {field('region', 'Region', settings.provider === 'OSS' ? 'cn-hangzhou' : 'us-east-1；R2 填 auto')}
          {field('bucket', 'Bucket', '文档图片所在的存储桶')}
          <label className={fieldClass}>AccessKey ID<Input autoComplete="off" type="password" value={accessKey} required={!keeping} placeholder={keeping ? '已配置，留空保留' : '填写 AccessKey ID'} onChange={e => setAccessKey(e.target.value)} /></label>
        </>}
        <label className={fieldClass}>{settings.provider === 'GITHUB' ? 'GitHub Token' : 'AccessKey Secret'}<Input type="password" autoComplete="new-password" value={secret} required={!keeping}
          placeholder={keeping ? '已配置，留空保留' : '仅保存到服务端加密存储'} onChange={e => setSecret(e.target.value)} /></label>
        {field('prefix', '图片目录', 'markdown（可留空）', false)}
        {field('publicBaseUrl', '图片访问地址', settings.provider === 'GITHUB' ? '可留空，使用 raw.githubusercontent.com' : 'https://images.example.com', settings.provider !== 'GITHUB')}
        {settings.provider === 'S3' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.pathStyle} onChange={e => setSettings(s => ({ ...s, pathStyle: e.target.checked }))} />路径式寻址（常用于 MinIO）</label>}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={makeDefault} onChange={e => setDefault(e.target.checked)} />设为默认图床</label>
      <p className="text-xs text-[var(--color-muted-foreground)]">上传地址负责写入，图片访问地址负责阅读。保存不会上传图片，也不会改变存储桶权限。自托管 MinIO 或其他自定义 S3 服务需管理员预先信任该主机。</p>
      <Button disabled={busy} type="submit">{busy ? '正在保存…' : '保存配置'}</Button>
    </fieldset>
  </form>
}
