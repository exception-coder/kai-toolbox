import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CodeSample({ title, code, language }: { title: string; code: string; language: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }
  return (
    <div className="guide-code">
      <div className="guide-code-heading"><span>{title}<small>{language}</small></span><Button variant="ghost" className="h-11" aria-label={`复制${title}`} onClick={() => void copy()}>{copyState === 'copied' ? <Check /> : <Copy />}{copyState === 'copied' ? '已复制' : '复制'}</Button></div>
      <pre tabIndex={0} aria-label={title}><code>{code}</code></pre>
      <p className="guide-copy-status" role="status">{copyState === 'failed' ? '复制不可用，请选中上方代码手动复制。' : copyState === 'copied' ? '代码已复制；请替换环境与身份参数后在接入项目使用。' : '示例仅供复制，不会在此页面运行。'}</p>
    </div>
  )
}
