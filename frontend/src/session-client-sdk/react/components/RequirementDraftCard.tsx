import { useEffect, useState } from 'react'
import { Check, Copy, Download, FileText } from 'lucide-react'
import { Button, Input, Textarea } from '../ui'
import type { RequirementDraft } from '../model/requirementDraft'

export function RequirementDraftCard({ source }: { source?: RequirementDraft }) {
  const [draft, setDraft] = useState<RequirementDraft | undefined>(undefined)
  const [confirmed, setConfirmed] = useState(false)
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const sourceKey = JSON.stringify(source)
  useEffect(() => { setPending(Boolean(sourceKey)); }, [sourceKey])
  function load() { setDraft(source); setConfirmed(false); setPending(false); setNotice('') }
  function update(key: keyof RequirementDraft, value: string | string[]) {
    if (draft) { setDraft({ ...draft, [key]: value }); setConfirmed(false) }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice('已复制') }
    catch { setNotice('复制失败，请选择文本手动复制。') }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...draft, status: confirmed ? 'confirmed' : 'draft' }, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = '业务需求.json'; link.click()
    URL.revokeObjectURL(url)
  }
  return <aside aria-label="需求稿" className="flex h-full min-h-0 flex-col">
    <header className="border-b border-[var(--color-border)] px-5 py-4">
      <h3 className="flex items-center gap-2 font-semibold"><FileText className="size-4" />需求稿</h3>
      <p className="mt-1 text-xs text-[var(--color-muted)]">对话澄清后，在这里检查和完善交接内容。</p>
    </header>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
      {pending && <Button variant="secondary" onClick={load}>{draft ? '载入助手新草稿（替换当前编辑）' : '载入助手草稿'}</Button>}
      {!draft ? <div className="space-y-5 text-sm leading-6 text-[var(--color-secondary)]">
        <p className="font-medium text-[var(--color-foreground)]">从一句描述，到一份明确需求。</p>
        <ol className="list-decimal space-y-3 pl-4"><li>说清场景与遇到的问题</li><li>核对现状，补充关键信息</li><li>整理目标、边界与验收标准</li><li>确认后复制或导出交接</li></ol>
        <p className="text-xs">{source ? '助手草稿已准备好。载入后逐项核对，再确认或导出。' : '助手尚未生成结构化草稿。先在对话中描述需求，信息充分后点击“整理需求稿”。'}</p>
      </div> : <>
        <label className="block text-xs font-medium">需求标题<Input className="mt-2" value={draft.title} onChange={e => update('title', e.target.value)} /></label>
        <label className="block text-xs font-medium">标准需求描述<Textarea className="mt-2" rows={5} value={draft.summary} onChange={e => update('summary', e.target.value)} /></label>
        {([['current', '当前行为'], ['expected', '期望结果'], ['scope', '范围与约束']] as const).map(([key, label]) =>
          <label key={key} className="block text-xs font-medium">{label}<Textarea className="mt-2" rows={2} value={draft[key]} onChange={e => update(key, e.target.value)} /></label>)}
        {([['acceptance', '验收标准'], ['evidence', '核验依据'], ['questions', '待确认项']] as const).map(([key, label]) =>
          <label key={key} className="block text-xs font-medium">{label} · 每行一项<Textarea className="mt-2" rows={3} value={draft[key].join('\n')} onChange={e => update(key, e.target.value.split('\n'))} /></label>)}
        <p className="text-xs text-[var(--color-muted)]">依据由助手提供，确认前请核对。草稿仅保留在本次窗口，关闭前请导出。</p>
      </>}
    </div>
    {draft && <footer className="space-y-3 border-t border-[var(--color-border)] p-4">
      <div className="flex flex-wrap gap-2"><Button onClick={() => setConfirmed(true)} disabled={!draft.title.trim() || !draft.summary.trim() || !draft.expected.trim() || !draft.acceptance.some(x => x.trim())}><Check className="size-4" />{confirmed ? '已确认草稿' : '确认草稿'}</Button>
        <Button variant="secondary" onClick={() => void copy(draft.summary)}><Copy className="size-4" />复制描述</Button>
        <Button variant="ghost" onClick={download}><Download className="size-4" />导出 JSON</Button></div>
      <p aria-live="polite" className="text-xs text-[var(--color-secondary)]">{notice || (confirmed ? '已确认，仅标记草稿；尚未提交开发。' : '确认不会触发改代码或部署。')}</p>
    </footer>}
  </aside>
}
