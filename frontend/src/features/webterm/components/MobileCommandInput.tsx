import { useRef, useState } from 'react'
import { Clipboard, History, Send, X } from 'lucide-react'

interface MobileCommandInputProps {
  onSend: (command: string) => void
  quickCommands?: QuickCommand[]
}

interface QuickCommand {
  label: string
  cmd: string
  icon?: React.ReactNode
}

const HISTORY_KEY = 'webterm_cmd_history'
const MAX_HISTORY = 50

export function MobileCommandInput({ onSend, quickCommands = [] }: MobileCommandInputProps) {
  const [input, setInput] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    } catch {
      return []
    }
  })

  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed) return

    onSend(trimmed + '\r')
    
    const newHistory = [trimmed, ...history.filter(h => h !== trimmed)].slice(0, MAX_HISTORY)
    setHistory(newHistory)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory))
    
    setInput('')
    setShowHistory(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) return
      e.preventDefault()
      handleSend()
    }
  }

  const handlePaste = () => {
    void navigator.clipboard?.readText().then(text => {
      if (!text) return
      setInput(prev => (prev ? prev + text : text))
      inputRef.current?.focus()
    })
  }

  return (
    <div className="flex flex-col border-t border-white/10 bg-[#151722] pb-[env(safe-area-inset-bottom)] md:hidden">
      {showHistory && history.length > 0 && (
        <div className="flex max-h-48 flex-col overflow-y-auto border-b border-white/10 bg-[#10131d] py-1">
          <div className="flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/45">
            <span>最近指令</span>
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              className="inline-flex size-8 items-center justify-center rounded-md active:bg-white/10"
              aria-label="关闭历史"
            >
              <X className="size-3" />
            </button>
          </div>
          {history.map((cmd, i) => (
            <button
              key={i}
              className="px-3 py-3 text-left font-mono text-[13px] leading-snug text-white/85 active:bg-white/10"
              onClick={() => {
                setInput(cmd)
                setShowHistory(false)
                inputRef.current?.focus()
              }}
            >
              {cmd}
            </button>
          ))}
        </div>
      )}
      {quickCommands.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-2 py-2 no-scrollbar">
          {quickCommands.map((qc, i) => (
            <button
              key={`${qc.label}-${i}`}
              type="button"
              onClick={() => onSend(qc.cmd)}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-medium text-white/70 active:bg-white/10 active:text-white"
            >
              {qc.icon}
              {qc.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 px-2 py-2">
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          className={`inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 transition-colors active:bg-white/10 ${
            showHistory ? 'text-sky-200' : 'text-white/65'
          }`}
          aria-label="打开历史指令"
        >
          <History className="size-4" />
        </button>
        <div className="relative flex-1">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入指令..."
            className="h-11 w-full resize-none rounded-md border border-white/10 bg-white/5 py-2.5 pl-3 pr-10 font-mono text-[15px] leading-5 text-white placeholder:text-white/25 focus:border-sky-400/60 focus:outline-none"
          />
          {input && (
            <button
              type="button"
              onClick={() => setInput('')}
              className="absolute right-1.5 top-1.5 inline-flex size-8 items-center justify-center rounded-md text-white/45 active:bg-white/10 active:text-white"
              aria-label="清空输入"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handlePaste}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/65 transition-colors active:bg-white/10"
          aria-label="粘贴剪贴板"
        >
          <Clipboard className="size-4" />
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim()}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-sky-500 text-white transition-opacity active:bg-sky-400 disabled:opacity-45"
          aria-label="发送指令"
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  )
}
