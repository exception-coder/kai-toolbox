// 把当前题目正文打包扔到 ChatGPT。移动端会触发"用 ChatGPT 应用打开"。
//
// 策略：
// - 内容短（编码后 ≤ 6000 字符）：用 https://chatgpt.com/?q=<encoded> 直接预填到输入框
// - 内容长：先 navigator.clipboard 复制提示词，再打开 chatgpt.com，用户手动粘贴
// - 复制总是尝试，作为兜底（URL 在某些浏览器/系统会被截断）

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Java8guQuestion } from '../types'

interface Props {
  question: Java8guQuestion
  markdown: string
  /** loading markdown 时禁用 */
  disabled?: boolean
}

// URL 编码后的安全阈值：太长一些移动浏览器会截断或拒绝
const URL_LIMIT = 6000
const CHATGPT_BASE = 'https://chatgpt.com/'

export function SendToGptButton({ question, markdown, disabled }: Props) {
  const [status, setStatus] = useState<'idle' | 'short' | 'long' | 'error'>('idle')

  const handleClick = async () => {
    const prompt = buildPrompt(question, markdown)
    let copied = false
    try {
      await navigator.clipboard.writeText(prompt)
      copied = true
    } catch {
      // 不支持剪贴板就跳过；非 https / 用户拒绝授权都可能落到这
    }

    const encoded = encodeURIComponent(prompt)
    if (encoded.length <= URL_LIMIT) {
      window.open(`${CHATGPT_BASE}?q=${encoded}`, '_blank', 'noopener,noreferrer')
      setStatus('short')
    } else {
      // 内容超长：只能跳裸入口，用户粘贴
      window.open(CHATGPT_BASE, '_blank', 'noopener,noreferrer')
      setStatus(copied ? 'long' : 'error')
    }

    // 5 秒后回到 idle
    window.setTimeout(() => setStatus('idle'), 5000)
  }

  return (
    <div className="inline-flex flex-col items-stretch">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={disabled || !markdown}
        title="把当前题目打包扔到 ChatGPT 讲解（移动端会用 ChatGPT 应用打开）"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">GPT 讲解</span>
        <span className="sm:hidden">GPT</span>
      </Button>
      {status !== 'idle' && (
        <span className="mt-1 max-w-[260px] text-[10.5px] leading-snug text-[var(--color-muted-foreground)]">
          {status === 'short' && '已在新标签打开 ChatGPT 并填入提示词，点发送按钮即可；ChatGPT 回复后点扬声器图标可朗读'}
          {status === 'long' && '题目较长，已复制到剪贴板。请在 ChatGPT 输入框粘贴后发送'}
          {status === 'error' && '题目较长且剪贴板不可用，请手动复制正文到 ChatGPT'}
        </span>
      )}
    </div>
  )
}

function buildPrompt(question: Java8guQuestion, markdown: string): string {
  return `请用通俗易懂的口语化中文为我讲解下面这道 Java 面试题，要点：
1. 用面试者视角说人话，不要堆术语
2. 指出考点和易错点
3. 代码示例逐行解读
4. 结尾给一句话总结
5. 适合直接朗读

题目 #${question.id}：${question.title}
难度：★${question.difficulty}

—— 正文 ——
${markdown}`
}
