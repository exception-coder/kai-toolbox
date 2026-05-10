import { useState } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { OutputBox } from '@/components/ui/output-box'
import {
  generateKeyPair,
  rsaDecrypt,
  rsaEncrypt,
  rsaSign,
  rsaVerify,
  type RsaSignAlgo,
} from '../lib/rsa'

type RsaOp = 'encrypt' | 'decrypt' | 'sign' | 'verify'

const OP_OPTIONS = [
  { value: 'encrypt', label: '加密' },
  { value: 'decrypt', label: '解密' },
  { value: 'sign', label: '签名' },
  { value: 'verify', label: '验签' },
] as const

const ALGO_OPTIONS = [
  { value: 'sha1', label: 'SHA-1' },
  { value: 'sha256', label: 'SHA-256' },
  { value: 'sha512', label: 'SHA-512' },
] as const

const KEY_BITS_OPTIONS = [
  { value: '1024', label: '1024' },
  { value: '2048', label: '2048' },
] as const

export function RsaPanel() {
  const [op, setOp] = useState<RsaOp>('encrypt')
  const [algo, setAlgo] = useState<RsaSignAlgo>('sha256')
  const [bits, setBits] = useState<'1024' | '2048'>('2048')
  const [publicKey, setPublicKey] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [input, setInput] = useState('')
  const [signature, setSignature] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const needsAlgo = op === 'sign' || op === 'verify'
  const needsSignature = op === 'verify'

  const onGenerate = () => {
    setError(null)
    setGenerating(true)
    // 让 UI 先 disable 再做同步生成；2048 位生成可能阻塞 1-3s。
    setTimeout(() => {
      try {
        const pair = generateKeyPair(Number(bits) as 1024 | 2048)
        setPublicKey(pair.publicKey)
        setPrivateKey(pair.privateKey)
      } catch (e) {
        setError(e instanceof Error ? e.message : '生成失败')
      } finally {
        setGenerating(false)
      }
    }, 0)
  }

  const run = () => {
    setError(null)
    setOutput('')
    if (!input) {
      setError('请填写输入')
      return
    }
    try {
      if (op === 'encrypt') {
        if (!publicKey) return setError('加密需要公钥')
        const result = rsaEncrypt(input, publicKey)
        if (result === null) return setError('加密失败：公钥格式或数据长度不合法')
        setOutput(result)
      } else if (op === 'decrypt') {
        if (!privateKey) return setError('解密需要私钥')
        const result = rsaDecrypt(input, privateKey)
        if (result === null) return setError('解密失败：私钥格式或密文不合法')
        setOutput(result)
      } else if (op === 'sign') {
        if (!privateKey) return setError('签名需要私钥')
        const result = rsaSign(input, privateKey, algo)
        if (result === null) return setError('签名失败：私钥格式不合法')
        setOutput(result)
      } else {
        if (!publicKey) return setError('验签需要公钥')
        if (!signature) return setError('请填写待验证的签名（base64）')
        const ok = rsaVerify(input, signature, publicKey, algo)
        setOutput(ok ? '✓ 验签通过' : '✗ 验签失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败')
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">操作</label>
          <Segmented value={op} onChange={setOp} options={OP_OPTIONS} />
        </div>
        {needsAlgo && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">摘要算法</label>
            <Segmented value={algo} onChange={setAlgo} options={ALGO_OPTIONS} />
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">公钥（PEM）</label>
          <textarea
            value={publicKey}
            onChange={e => setPublicKey(e.target.value)}
            rows={6}
            placeholder="-----BEGIN PUBLIC KEY-----..."
            className="w-full resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">私钥（PEM）</label>
          <textarea
            value={privateKey}
            onChange={e => setPrivateKey(e.target.value)}
            rows={6}
            placeholder="-----BEGIN RSA PRIVATE KEY-----..."
            className="w-full resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--color-muted-foreground)]">没有密钥？</span>
        <Segmented value={bits} onChange={setBits} options={KEY_BITS_OPTIONS} />
        <Button onClick={onGenerate} size="sm" variant="outline" disabled={generating}>
          {generating ? <Loader2 className="animate-spin" /> : <KeyRound />} 生成密钥对
        </Button>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
          {op === 'verify' ? '原文' : '输入'}
        </label>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={4}
          className="w-full resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        />
      </div>

      {needsSignature && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">待验证签名（Base64）</label>
          <textarea
            value={signature}
            onChange={e => setSignature(e.target.value)}
            rows={3}
            className="w-full resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          />
        </div>
      )}

      <Button onClick={run} size="sm">
        执行 {OP_OPTIONS.find(o => o.value === op)?.label}
      </Button>

      <OutputBox
        label={op === 'verify' ? '验签结果' : '输出'}
        value={output}
        error={error}
        monospace={op !== 'verify'}
      />
    </div>
  )
}
