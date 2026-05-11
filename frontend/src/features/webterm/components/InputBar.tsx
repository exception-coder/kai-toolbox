import { useRef, useState } from 'react'
import { ClipboardPaste, CornerDownLeft } from 'lucide-react'

interface InputBarProps {
  onSend: (data: string) => void
}

// 移动端输入条：参考移动 Google 的"输入框 + 系统键盘"模式。
// 用户用 OS 系统键盘（含中文 IME / 九宫格 / 各家输入法）输入到这个 input 里，
// 输入条本身把当前键入的内容显示得清清楚楚；按系统键盘上的发送/回车键 → 整行
// 加上 \r 一起喂给 PTY。Tab、方向键、Ctrl+C 之类 OS 键盘没有的特殊键走辅助按钮。
//
// 为什么不再做"每按一键就实时透传到 PTY"：那种模式 PTY 会立刻回显，
// 输入条里看到的字会和终端里 echo 的字两份重叠，对正常用户来说反而乱；现在
// 改为整行提交模式，输入条就是"待发送命令"的清单，回车后才会落到终端里执行。
export function InputBar({ onSend }: InputBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const composingRef = useRef(false)
  const [value, setValue] = useState('')

  const submit = () => {
    const v = inputRef.current?.value ?? value
    onSend(v + '\r')
    setValue('')
    if (inputRef.current) inputRef.current.value = ''
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (composingRef.current) return // IME 组词阶段不要拦截
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  const sendRaw = (data: string) => {
    onSend(data)
    inputRef.current?.focus()
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard?.readText?.()
      if (text) {
        // 直接把剪贴板内容拼到 input 末尾，让用户看清再决定要不要发，避免把
        // 长串 token / 多行文本无脑塞进 PTY
        const next = (inputRef.current?.value ?? '') + text
        if (inputRef.current) inputRef.current.value = next
        setValue(next)
      }
    } catch {
      /* 用户拒绝剪贴板权限时静默 */
    }
    inputRef.current?.focus()
  }

  return (
    <div
      className="flex flex-col gap-2 border-t bg-[var(--color-card)] p-2 md:hidden"
      // 拦截按钮 mousedown 默认行为，让 input 不会因点击辅助键而失焦、关掉系统键盘
      onPointerDown={e => {
        if ((e.target as HTMLElement).tagName === 'BUTTON') e.preventDefault()
      }}
    >
      {/* 辅助键行：OS 键盘上没有 / 不好按的那些 */}
      <div className="flex flex-wrap gap-1 text-xs">
        <AuxBtn onClick={() => sendRaw('\x1b')}>Esc</AuxBtn>
        <AuxBtn onClick={() => sendRaw('\t')}>Tab</AuxBtn>
        <AuxBtn onClick={() => sendRaw('\x1b[A')}>↑</AuxBtn>
        <AuxBtn onClick={() => sendRaw('\x1b[B')}>↓</AuxBtn>
        <AuxBtn onClick={() => sendRaw('\x1b[D')}>←</AuxBtn>
        <AuxBtn onClick={() => sendRaw('\x1b[C')}>→</AuxBtn>
        <AuxBtn onClick={() => sendRaw('\x03')}>Ctrl+C</AuxBtn>
        <AuxBtn onClick={() => sendRaw('\f')}>Ctrl+L</AuxBtn>
        <AuxBtn onClick={handlePaste}>
          <ClipboardPaste className="size-3.5" />
          粘贴
        </AuxBtn>
      </div>

      {/* 输入条主体：用大字号 + 大输入框，让"用户当前在打什么"非常清楚 */}
      <div className="flex items-center gap-2">
        <span className="text-[var(--color-muted-foreground)] font-mono text-base">$</span>
        <input
          ref={inputRef}
          type="text"
          // font-size ≥ 16px 关键：iOS Safari 看到 <16px 会触发自动放大整页，
          // 让 layout 跳一下；这里用 text-base = 16px 直接绕过这个坑
          className="flex-1 rounded border bg-[var(--color-background)] px-3 py-2.5 font-mono text-base outline-none focus:border-[var(--color-primary)]"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
          placeholder="输入命令…回车执行"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onCompositionEnd={() => {
            composingRef.current = false
          }}
        />
        <button
          type="button"
          onClick={submit}
          className="inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)] px-3 py-2.5 text-sm text-[var(--color-primary-foreground)] active:opacity-80"
          aria-label="执行"
        >
          <CornerDownLeft className="size-4" />
        </button>
      </div>
    </div>
  )
}

function AuxBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded border px-2 py-1 active:bg-[var(--color-accent)]"
    >
      {children}
    </button>
  )
}
