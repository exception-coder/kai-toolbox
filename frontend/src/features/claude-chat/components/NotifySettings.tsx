import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useFeatureConfig } from '@/lib/featureConfig'
import { NOTIFY_DEFAULTS, type NotifyConfig } from '../types'
import { testNotify } from '../browserNotify'

/** 完成通知双渠道设置：Bark(iPhone) + ntfy(Android)，存 feature-config。 */
export function NotifySettings({ onClose }: { onClose: () => void }) {
  const { config, setConfig, isSaving } = useFeatureConfig<NotifyConfig>('claude-chat', {
    defaults: NOTIFY_DEFAULTS,
  })
  const [draft, setDraft] = useState<NotifyConfig>(config)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const runBrowserTest = async () => {
    setTesting(true)
    setTestMsg(null)
    try {
      setTestMsg(await testNotify())
    } finally {
      setTesting(false)
    }
  }

  const update = (path: (c: NotifyConfig) => void) => {
    setDraft(prev => {
      const next: NotifyConfig = JSON.parse(JSON.stringify(prev))
      path(next)
      return next
    })
  }

  const save = async () => {
    await setConfig(draft)
    onClose()
  }

  return (
    <div className="space-y-5 px-3 py-4">
      <Channel
        title="Bark（iPhone）"
        enabled={draft.notify.bark.enabled}
        onToggle={v => update(c => { c.notify.bark.enabled = v })}
      >
        <Field label="baseUrl" value={draft.notify.bark.baseUrl}
          onChange={v => update(c => { c.notify.bark.baseUrl = v })} />
        <Field label="deviceKey" value={draft.notify.bark.deviceKey}
          onChange={v => update(c => { c.notify.bark.deviceKey = v })} />
      </Channel>

      <Channel
        title="ntfy（Android）"
        enabled={draft.notify.ntfy.enabled}
        onToggle={v => update(c => { c.notify.ntfy.enabled = v })}
      >
        <Field label="baseUrl" value={draft.notify.ntfy.baseUrl}
          onChange={v => update(c => { c.notify.ntfy.baseUrl = v })} />
        <Field label="topic" value={draft.notify.ntfy.topic}
          onChange={v => update(c => { c.notify.ntfy.topic = v })} />
      </Channel>

      <div className="rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <span className="font-medium">浏览器通知自检</span>
          <Button variant="outline" size="sm" disabled={testing} onClick={runBrowserTest}>
            发送测试通知
          </Button>
        </div>
        {testMsg && (
          <p className="mt-2 break-words text-xs text-[var(--color-foreground)]">{testMsg}</p>
        )}
        <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
          点击会请求权限并立即弹一条测试通知（忽略前台判断）；移动端走 Service Worker。这是浏览器本机通知，与上面 Bark/ntfy 服务端推送相互独立。
        </p>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" size="lg" className="flex-1" onClick={onClose}>取消</Button>
        <Button size="lg" className="flex-1 shadow-md" disabled={isSaving} onClick={save}>保存</Button>
      </div>
    </div>
  )
}

function Channel({ title, enabled, onToggle, children }: {
  title: string; enabled: boolean; onToggle: (v: boolean) => void; children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border p-3">
      <label className="flex items-center justify-between">
        <span className="font-medium">{title}</span>
        <input type="checkbox" className="size-5" checked={enabled} onChange={e => onToggle(e.target.checked)} />
      </label>
      {enabled && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--color-muted-foreground)]">{label}</span>
      <input
        className="mt-1 w-full rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  )
}
