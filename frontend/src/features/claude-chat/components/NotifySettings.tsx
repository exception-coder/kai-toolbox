import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useFeatureConfig } from '@/lib/featureConfig'
import { NOTIFY_DEFAULTS, type NotifyConfig } from '../types'
import { testNotify } from '../browserNotify'
import { testServerPush } from '../api'
import { playNotifySound } from '../sound'

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

  const [pushMsg, setPushMsg] = useState<string | null>(null)
  const [pushing, setPushing] = useState(false)

  const runServerPushTest = async () => {
    setPushing(true)
    setPushMsg(null)
    try {
      const { channels } = await testServerPush(draft)
      setPushMsg(channels.length
        ? `已向 [${channels.join(', ')}] 发送，请查看手机推送（用的是当前填写值，未保存也可测）`
        : '没有已启用的渠道：请先勾选 Bark/ntfy 并填好 baseUrl/topic 再测')
    } catch (e) {
      setPushMsg('发送失败：' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setPushing(false)
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
          点击会请求权限并立即弹一条测试通知（忽略前台判断）；移动端走 Service Worker。这是浏览器本机通知，与下面 Bark/ntfy 服务端推送相互独立。
        </p>
      </div>

      <div className="rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <span className="font-medium">服务端推送自检（Bark / ntfy）</span>
          <Button variant="outline" size="sm" disabled={pushing} onClick={runServerPushTest}>
            发送测试推送
          </Button>
        </div>
        {pushMsg && (
          <p className="mt-2 break-words text-xs text-[var(--color-foreground)]">{pushMsg}</p>
        )}
        <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
          后端按当前填写的渠道发一条测试推送（无需先保存）。真后台推送，锁屏/关页也能收——前提是手机已装并订阅对应 App/topic。
        </p>
      </div>

      <div className="rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <span className="font-medium">提示音自检</span>
          <Button variant="outline" size="sm" onClick={() => playNotifySound()}>试听「叮咚」</Button>
        </div>
        <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
          页内「叮咚」提示音：权限/提问弹窗时会响，Claude 回复完成且页面在后台时也会响。没声音多半是浏览器要求先有手势（本页发过消息即可）或页面被切后台挂起了。
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
