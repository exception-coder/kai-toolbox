import { useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

/**
 * 一条可选变量。分组（saved / step-output / legacy）由调用方组织。
 */
export interface VarOption {
  /** 用户最终插入到字段里的字符串，如 `{{slug}}` 或 `{{item.slug}}` */
  ref: string
  /** 变量名（显示用） */
  name: string
  /** 值预览（截断后） */
  preview?: string
  /** 分组名，如 "来自「目录」"、"上游 step outputs"、"循环项 item"、"会话变量（旧）" */
  group: string
}

/**
 * 变量候选弹层。挂在某个 input 的右侧（绝对定位 Popover），
 * 弹出时显示分组的变量列表，点击某条调 onPick 写入。
 *
 * 用法：父组件持有 isOpen state；这个组件接 anchor ref 决定弹出位置。
 */
export function VarPickerPopover({
  options, onPick, onClose,
}: {
  options: VarOption[]
  onPick: (ref: string) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return options
    return options.filter(o =>
      o.name.toLowerCase().includes(q) ||
      (o.preview ?? '').toLowerCase().includes(q),
    )
  }, [filter, options])

  // 按 group 分组
  const groups = useMemo(() => {
    const m = new Map<string, VarOption[]>()
    for (const o of filtered) {
      const arr = m.get(o.group) ?? []
      arr.push(o)
      m.set(o.group, arr)
    }
    return Array.from(m.entries())
  }, [filtered])

  return (
    // 全屏遮罩，点空白处关闭；内容容器 stopPropagation
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-32"
         onClick={onClose}>
      <div className="w-[min(92vw,520px)] space-y-2 rounded-lg border bg-[var(--color-card)] p-3 shadow-xl"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          <div className="text-sm font-medium">选择变量</div>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            点击插入 <code>{'{{name}}'}</code> 到当前字段
          </span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
            <X />
          </Button>
        </div>
        <Input
          ref={inputRef}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="过滤变量名或值..."
        />
        <div className="max-h-[60vh] space-y-3 overflow-auto">
          {groups.length === 0 && (
            <div className="rounded border border-dashed p-3 text-center text-xs text-[var(--color-muted-foreground)]">
              {options.length === 0
                ? '当前没有可用变量。先在 saved 上提取输出，或编辑上游 step 的 outputs'
                : '没有匹配的变量'}
            </div>
          )}
          {groups.map(([groupName, items]) => (
            <div key={groupName}>
              <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
                {groupName}
              </div>
              <ul className="space-y-0.5">
                {items.map(o => (
                  <li key={o.ref}>
                    <button
                      type="button"
                      onClick={() => { onPick(o.ref); onClose() }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-[var(--color-accent)]"
                    >
                      <code className="shrink-0 font-mono text-xs font-semibold">{o.ref}</code>
                      {o.preview && (
                        <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-muted-foreground)]"
                              title={o.preview}>
                          = {o.preview}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * 受控字段：value + 「🎯 绑变量」按钮 + 双击触发。已绑变量时显示蓝边框。
 *
 * 替换策略（按"用户选中了什么"决定）：
 *   - 整字段已是 `{{xxx}}` 纯变量引用 → 整段换成新变量
 *   - 用户在输入框里选了一段文本（含浏览器双击 word 自动选中） → 只把那段换成 `{{var}}`
 *   - 仅有光标无选区 → 在光标位置插入 `{{var}}`（不会清空原内容）
 *   - 从未点过这个输入框就直接点 🎯 → 追加到末尾
 *
 * 这样 URL 如 `https://www.yuque.com/api/docs/fxvrxkep8rus8ytb`，
 * 双击末段 `fxvrxkep8rus8ytb`（浏览器默认会选中这个 word）→ 弹 picker → 选 slug
 * → 变成 `https://www.yuque.com/api/docs/{{slug}}`，不动其它部分。
 */
export function VarBindableField({
  value, onChange, options, placeholder, className,
}: {
  value: string
  onChange: (next: string) => void
  options: VarOption[]
  placeholder?: string
  className?: string
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // 最近一次 input 选区。null 表示从未在该 input 内交互过（点 🎯 时按"末尾"处理）
  const selRef = useRef<{ start: number; end: number } | null>(null)
  const isBound = /^\{\{\s*[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*(\[\d+\])*\s*\}\}$/.test(value)

  /** 同步当前 input 的 selection 到 ref。在 input 还持有焦点时调用才有意义。 */
  const captureSelection = () => {
    const el = inputRef.current
    if (!el) return
    if (document.activeElement === el) {
      selRef.current = { start: el.selectionStart ?? value.length, end: el.selectionEnd ?? value.length }
    }
  }

  /**
   * 点 🎯 / 双击没自带选区时的"默认选谁"：
   *   - 像 URL（含 ://）→ 选末段（去掉 query/hash 后最后一个 / 之后到末尾）
   *   - 其他场景 → 全选（典型如 Bearer xxx、纯值字段——多数情况下用户就是想整段换变量）
   *   - 空值 → 不动，落空时 handlePick 会按"插入到末尾"处理
   */
  const computeDefaultRange = (v: string): { start: number; end: number } | null => {
    if (!v) return null
    if (v.includes('://')) {
      const queryStart = v.search(/[?#]/)
      const pathPart = queryStart >= 0 ? v.slice(0, queryStart) : v
      const lastSlash = pathPart.lastIndexOf('/')
      if (lastSlash >= 0 && lastSlash + 1 < pathPart.length) {
        return { start: lastSlash + 1, end: pathPart.length }
      }
    }
    return { start: 0, end: v.length }
  }

  /** 打开 picker 前：若用户没有非空选区，按字段类型自动算一个默认选区，并在 input 里视觉高亮。 */
  const openPicker = () => {
    const el = inputRef.current
    let hasUserSelection = false
    if (el && document.activeElement === el) {
      const s = el.selectionStart ?? 0
      const e = el.selectionEnd ?? 0
      if (e > s) {
        selRef.current = { start: s, end: e }
        hasUserSelection = true
      }
    }
    if (!hasUserSelection && el && !isBound) {
      const auto = computeDefaultRange(value)
      if (auto) {
        el.focus()
        try { el.setSelectionRange(auto.start, auto.end) } catch { /* */ }
        selRef.current = auto
      } else {
        selRef.current = { start: value.length, end: value.length }
      }
    }
    setPickerOpen(true)
  }

  const handlePick = (ref: string) => {
    // 整字段已经是变量引用——按"换绑"语义整段替换
    if (isBound) { onChange(ref); return }
    const sel = selRef.current
    const start = sel ? sel.start : value.length
    const end = sel ? sel.end : value.length
    const next = value.slice(0, start) + ref + value.slice(end)
    onChange(next)
    // 把光标定位到插入后的位置，便于继续编辑
    const caret = start + ref.length
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      try { el.setSelectionRange(caret, caret) } catch { /* readonly safety */ }
      selRef.current = { start: caret, end: caret }
    })
  }

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <Input
        ref={inputRef}
        className={`font-mono ${isBound ? 'border-blue-500 ring-1 ring-blue-500/50' : ''}`}
        value={value}
        onChange={e => onChange(e.target.value)}
        onSelect={e => {
          // input 选区或光标位置变化时同步——picker 打开后取这里的值做局部替换
          const el = e.currentTarget
          selRef.current = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 }
        }}
        onDoubleClick={() => {
          // 浏览器双击会先 select 当前 word，此时 selectionStart/End 已经覆盖了那个 word
          captureSelection()
          openPicker()
        }}
        placeholder={placeholder}
        title={isBound
          ? '整段是变量引用，选变量会换绑'
          : '点 🎯 自动选中 URL 末段 / 整值；或先在框里手选要替换的范围'}
      />
      <Button size="sm" variant="ghost"
              // mouseDown 在 button 抢焦前抓最后一次选区——onClick 时 input 已经失焦
              onMouseDown={captureSelection}
              onClick={openPicker}
              title="自动选 URL 末段 / 整值，弹变量后替换；或先手选范围再点">
        <Crosshair />
      </Button>
      {isBound && <Badge variant="outline" className="shrink-0">变量</Badge>}
      {pickerOpen && (
        <VarPickerPopover
          options={options}
          onPick={handlePick}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
