import { useRef } from 'react'

interface MobileInputBarProps {
  onSend: (data: string) => void
}

// 移动端专用输入条：xterm 的隐藏 textarea 在 iOS Safari / Android Chrome 上经常
// 弹不出系统键盘，更别说调起中文 IME。这里用一个真实可见的 <input> 借力 OS 输入法，
// 把每次按键 diff（增删字符）转发给 PTY，等价于桌面端 xterm.onData 的转发路径。
export function MobileInputBar({ onSend }: MobileInputBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const lastValueRef = useRef('')
  const composingRef = useRef(false)

  const syncFromInput = () => {
    // IME 输入过程中（拼音未上屏）什么都不做，避免把 "ni" 作为字面量发给 PTY
    if (composingRef.current) return
    const v = inputRef.current?.value ?? ''
    const prev = lastValueRef.current
    if (v === prev) return
    if (v.startsWith(prev)) {
      onSend(v.slice(prev.length))
    } else if (prev.startsWith(v)) {
      onSend('\x7f'.repeat(prev.length - v.length))
    } else {
      // 中间删改这种少见情况：先用 DEL 抹掉旧内容再补新内容
      if (prev) onSend('\x7f'.repeat(prev.length))
      if (v) onSend(v)
    }
    lastValueRef.current = v
  }

  const clearInput = () => {
    if (inputRef.current) inputRef.current.value = ''
    lastValueRef.current = ''
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (composingRef.current) return
    let payload: string | null = null
    switch (e.key) {
      case 'Enter':
        payload = '\r'
        break
      case 'Tab':
        payload = '\t'
        break
      case 'Escape':
        payload = '\x1b'
        break
      case 'ArrowUp':
        payload = '\x1b[A'
        break
      case 'ArrowDown':
        payload = '\x1b[B'
        break
      case 'ArrowLeft':
        payload = '\x1b[D'
        break
      case 'ArrowRight':
        payload = '\x1b[C'
        break
    }
    if (payload !== null) {
      e.preventDefault()
      onSend(payload)
      // 回车后清空输入条，让用户从空白开始下一行；其他控制键不动 input 内容
      if (e.key === 'Enter') clearInput()
    }
  }

  const sendRaw = (data: string) => {
    onSend(data)
    inputRef.current?.focus()
  }

  // 桌面 PowerShell 的 Ctrl+V 是 PSReadLine 读「服务端」Windows 剪贴板，不是
  // 用户手机/浏览器的剪贴板，所以这里改用 Clipboard API 读浏览器剪贴板再把
  // 文本作为按键流送进 PTY（行为等价于用户用键盘把这段文本敲一遍）。
  // 图片暂不支持：PTY 本身只接受字节流，要把图片喂给 Claude Code 之类的程序
  // 需要后端先存成临时文件再把路径打回来，那是另一项工作。
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard?.readText?.()
      if (text) onSend(text)
    } catch {
      /* 用户拒绝剪贴板权限或浏览器不支持时静默 */
    }
    inputRef.current?.focus()
  }

  return (
    <div className="flex flex-col gap-1 border-t bg-[var(--color-card)] p-2 md:hidden">
      <div className="flex flex-wrap gap-1 text-xs">
        <AuxBtn onClick={() => sendRaw('\x1b')}>Esc</AuxBtn>
        <AuxBtn onClick={() => sendRaw('\t')}>Tab</AuxBtn>
        <AuxBtn onClick={() => sendRaw('\x1b[A')}>↑</AuxBtn>
        <AuxBtn onClick={() => sendRaw('\x1b[B')}>↓</AuxBtn>
        <AuxBtn onClick={() => sendRaw('\x1b[D')}>←</AuxBtn>
        <AuxBtn onClick={() => sendRaw('\x1b[C')}>→</AuxBtn>
        <AuxBtn onClick={() => sendRaw('\x03')}>Ctrl+C</AuxBtn>
        <AuxBtn onClick={() => sendRaw('\f')}>Ctrl+L</AuxBtn>
        <AuxBtn onClick={handlePaste}>粘贴</AuxBtn>
      </div>
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="send"
        placeholder="点此输入命令（支持中文/英文输入法）"
        className="rounded border bg-[var(--color-background)] px-2 py-2 font-mono text-sm outline-none focus:border-[var(--color-primary)]"
        onInput={syncFromInput}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          composingRef.current = true
        }}
        onCompositionEnd={() => {
          composingRef.current = false
          // 不同浏览器中 input 与 compositionend 的先后顺序不一致，
          // 这里再同步一次确保已上屏的中文文字被转发出去
          syncFromInput()
        }}
      />
    </div>
  )
}

function AuxBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      // 在按下瞬间阻止默认 focus 切换，否则 OS 键盘会一闪而下又升起
      onPointerDown={e => e.preventDefault()}
      onClick={onClick}
      className="rounded border px-2 py-1 active:bg-[var(--color-accent)]"
    >
      {children}
    </button>
  )
}
