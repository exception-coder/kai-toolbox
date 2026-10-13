import { Check, Copy, Download, AlignLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { JavaFormatOptions, JavaIndent, JavaInputMode } from '../../lib/java/contracts'

interface Props {
  options: JavaFormatOptions
  onOptionsChange: (options: JavaFormatOptions) => void
  busy: boolean
  valid: boolean
  onFormat: () => void
  onCancel: () => void
  onCopy: () => void
  onDownload: () => void
  copied: boolean
  wrap: boolean
  onWrapChange: (value: boolean) => void
}
const selectClass = 'h-9 rounded-md border bg-[var(--color-background)] px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-ring)]'

export function JavaToolbar({ options, onOptionsChange, busy, valid, onFormat, onCancel, onCopy, onDownload, copied, wrap, onWrapChange }: Props) {
  return <div className="flex shrink-0 flex-wrap items-end gap-3">
    <label className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">片段类型
      <select aria-label="Java 片段类型" className={selectClass} value={options.mode}
        onChange={event => onOptionsChange({ ...options, mode: event.target.value as JavaInputMode })}>
        <option value="auto">自动识别</option><option value="file">完整文件</option>
        <option value="member">方法 / 成员</option><option value="statements">语句片段</option><option value="expression">表达式</option>
      </select></label>
    <label className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">缩进
      <select aria-label="Java 缩进" className={selectClass} value={options.indent}
        onChange={event => onOptionsChange({ ...options, indent: event.target.value as JavaIndent })}>
        <option value="2">2 空格</option><option value="4">4 空格</option><option value="tab">Tab</option>
      </select></label>
    <label className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">行宽
      <select aria-label="Java 行宽" className={selectClass} value={options.printWidth}
        onChange={event => onOptionsChange({ ...options, printWidth: Number(event.target.value) })}>
        <option value="80">80</option><option value="100">100</option><option value="120">120</option>
      </select></label>
    <Button onClick={onFormat} disabled={busy} className="h-9" title="格式化副本（Ctrl / ⌘ + Enter）"><AlignLeft />{busy ? '格式化中…' : '格式化'}</Button>
    {busy && <Button onClick={onCancel} variant="ghost" className="h-9">取消</Button>}
    <label className="hidden min-h-9 items-center gap-2 text-xs lg:flex"><input type="checkbox" checked={wrap} onChange={event => onWrapChange(event.target.checked)} />自动换行</label>
    <div className="ml-auto flex gap-1">
      <Button onClick={onCopy} disabled={!valid} variant="ghost" className="h-9" title="复制当前格式化结果">
        {copied ? <Check /> : <Copy />}{copied ? '已复制' : '复制结果'}</Button>
      <Button onClick={onDownload} disabled={!valid} variant="ghost" className="h-9"><Download />下载</Button>
    </div>
  </div>
}
