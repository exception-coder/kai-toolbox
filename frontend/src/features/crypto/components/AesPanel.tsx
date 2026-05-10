import { useState } from 'react'
import { Lock, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { OutputBox } from '@/components/ui/output-box'
import { aesDecrypt, aesEncrypt, type AesMode, type CipherEncoding, type KeyEncoding } from '../lib/aes'

const MODE_OPTIONS = [
  { value: 'CBC', label: 'CBC' },
  { value: 'ECB', label: 'ECB' },
] as const

const KEY_ENC_OPTIONS = [
  { value: 'utf8', label: 'UTF-8' },
  { value: 'hex', label: 'Hex' },
  { value: 'base64', label: 'Base64' },
] as const

const OUT_ENC_OPTIONS = [
  { value: 'base64', label: 'Base64' },
  { value: 'hex', label: 'Hex' },
] as const

export function AesPanel() {
  const [mode, setMode] = useState<AesMode>('CBC')
  const [keyEncoding, setKeyEncoding] = useState<KeyEncoding>('utf8')
  const [ivEncoding, setIvEncoding] = useState<KeyEncoding>('utf8')
  const [outputEncoding, setOutputEncoding] = useState<CipherEncoding>('base64')
  const [key, setKey] = useState('')
  const [iv, setIv] = useState('')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = (op: 'enc' | 'dec') => {
    setError(null)
    if (!key) {
      setError('请填写密钥')
      setOutput('')
      return
    }
    if (mode === 'CBC' && !iv) {
      setError('CBC 模式需要 IV')
      setOutput('')
      return
    }
    try {
      const opts = { mode, keyEncoding, ivEncoding, outputEncoding, key, iv }
      const result = op === 'enc' ? aesEncrypt(input, opts) : aesDecrypt(input, opts)
      if (op === 'dec' && !result) {
        setError('解密失败：密钥/IV/密文不匹配')
        setOutput('')
        return
      }
      setOutput(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败')
      setOutput('')
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">模式</label>
          <Segmented value={mode} onChange={setMode} options={MODE_OPTIONS} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">输出编码</label>
          <Segmented value={outputEncoding} onChange={setOutputEncoding} options={OUT_ENC_OPTIONS} />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">密钥（Key）</label>
          <Segmented value={keyEncoding} onChange={setKeyEncoding} options={KEY_ENC_OPTIONS} />
        </div>
        <Input
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder="AES-128 用 16 字节、AES-256 用 32 字节"
          className="font-mono"
        />
      </div>

      {mode === 'CBC' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">IV</label>
            <Segmented value={ivEncoding} onChange={setIvEncoding} options={KEY_ENC_OPTIONS} />
          </div>
          <Input
            value={iv}
            onChange={e => setIv(e.target.value)}
            placeholder="16 字节"
            className="font-mono"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[var(--color-muted-foreground)]">输入</label>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={5}
          placeholder="加密：明文；解密：密文（按所选输出编码）"
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
