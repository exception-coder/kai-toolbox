import { useState } from 'react'
import { Lock, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { OutputBox } from '@/components/ui/output-box'
import {
  JASYPT_ALGO_LABEL,
  JASYPT_DEFAULT_ITERATIONS,
  jasyptDecrypt,
  jasyptEncrypt,
  type JasyptAlgo,
} from '../lib/jasypt'

const ALGO_OPTIONS = [
  { value: 'basic', label: JASYPT_ALGO_LABEL.basic },
  { value: 'strong', label: JASYPT_ALGO_LABEL.strong },
] as const

export function JasyptPanel() {
  const [algo, setAlgo] = useState<JasyptAlgo>('basic')
  const [password, setPassword] = useState('')
  const [iterations, setIterations] = useState(String(JASYPT_DEFAULT_ITERATIONS))
  const [wrapEnc, setWrapEnc] = useState(true)
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = (op: 'enc' | 'dec') => {
    setError(null)
    setOutput('')
    const iter = Number.parseInt(iterations, 10)
    if (!Number.isFinite(iter) || iter < 1) {
      setError('迭代次数必须为正整数')
      return
    }
    try {
      if (op === 'enc') {
        const cipher = jasyptEncrypt(input, password, algo, iter)
        setOutput(wrapEnc ? `ENC(${cipher})` : cipher)
      } else {
        setOutput(jasyptDecrypt(input, password, algo, iter))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败')
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[var(--color-muted-foreground)]">算法</label>
        <Segmented value={algo} onChange={setAlgo} options={ALGO_OPTIONS} />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {algo === 'basic'
            ? 'Spring Boot 2.x 默认；salt 8B + DES-CBC'
            : 'Spring Boot 3.x 默认（strong）；salt 16B + iv 16B + AES-256-CBC，PBKDF2-HMAC-SHA512'}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">主密码（jasypt.encryptor.password）</label>
          <Input
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="与服务端 jasypt 配置一致"
            type="password"
            className="font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">迭代次数（key-obtention-iterations）</label>
          <Input
            value={iterations}
            onChange={e => setIterations(e.target.value)}
            placeholder="默认 1000"
            inputMode="numeric"
            className="font-mono"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
        <input
          type="checkbox"
          checked={wrapEnc}
          onChange={e => setWrapEnc(e.target.checked)}
          className="size-3.5"
        />
        加密结果用 <code className="rounded bg-[var(--color-muted)] px-1">ENC(...)</code> 包裹（解密时自动剥除，无论是否勾选）
      </label>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[var(--color-muted-foreground)]">输入</label>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={5}
          placeholder="加密：明文；解密：base64 密文，可带 ENC() 包裹直接从 application.yml 复制"
          className="w-full resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={() => run('enc')} size="sm">
          <Lock /> 加密
        </Button>
        <Button onClick={() => run('dec')} size="sm" variant="secondary">
          <Unlock /> 解密
        </Button>
      </div>

      <OutputBox label="输出" value={output} error={error} />
    </div>
  )
}
