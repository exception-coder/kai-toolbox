import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import {
  estimateEntropy,
  generateBatch,
  strengthLabel,
  type GenerateInput,
  type PasswordOptions,
  type TokenKind,
} from '../lib/token'

const KIND_OPTIONS = [
  { value: 'hex', label: 'Hex' },
  { value: 'base64', label: 'Base64' },
  { value: 'base64url', label: 'Base64URL' },
  { value: 'alphanum', label: 'Alphanum' },
  { value: 'password', label: 'Password' },
  { value: 'uuid', label: 'UUID v4' },
  { value: 'nanoid', label: 'NanoID' },
] as const

/** 默认长度：字节型按字节，字符型按字符。 */
const DEFAULT_LENGTH: Record<TokenKind, number> = {
  hex: 16,
  base64: 32,
  base64url: 32,
  alphanum: 32,
  password: 20,
  uuid: 0,
  nanoid: 21,
}

const PRESET_LENGTH: Record<TokenKind, number[]> = {
  hex: [16, 24, 32, 64],
  base64: [16, 24, 32, 64],
  base64url: [16, 24, 32, 64],
  alphanum: [16, 24, 32, 48, 64],
  password: [12, 16, 20, 24, 32],
  uuid: [],
  nanoid: [10, 16, 21, 32],
}

const LENGTH_UNIT: Record<TokenKind, string> = {
  hex: '字节',
  base64: '字节',
  base64url: '字节',
  alphanum: '字符',
  password: '字符',
  uuid: '',
  nanoid: '字符',
}

const KIND_HINTS: Record<TokenKind, string> = {
  hex: '16 进制字符串，每字节 → 2 字符。`openssl rand -hex 16` 的等价物，frp / JWT secret / 通用密钥常用',
  base64: '6 字符 = 1 字节，体积更紧凑；末尾可能带 `=` padding。OAuth client secret、二进制 key 常见',
  base64url: 'Base64 的 URL/文件名安全变体（`+→-`，`/→_`，无 padding）。JWT、API key 直接放 URL 里时用',
  alphanum: 'A-Z a-z 0-9 共 62 个字符；不含符号，最大兼容（也能塞进数据库、命令行不用转义）',
  password: '可勾选字符类的人用密码：大小写/数字/符号。给 Dashboard / DB 账号用',
  uuid: '标准 UUID v4，122 bits 随机。生成对象 ID / trace ID 时用，不要当密钥',
  nanoid: '21 字符 URL-safe，等效碰撞概率 ≈ UUID v4，但字符更短',
}

export function TokenPanel() {
  const [kind, setKind] = useState<TokenKind>('hex')
  const [length, setLength] = useState<number>(DEFAULT_LENGTH.hex)
  const [count, setCount] = useState<number>(1)
  const [pwdOptions, setPwdOptions] = useState<PasswordOptions>({
    lower: true,
    upper: true,
    digit: true,
    symbol: false,
  })
  const [tokens, setTokens] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // 切类型时把长度重置成该类型的常用值
  useEffect(() => {
    setLength(DEFAULT_LENGTH[kind])
  }, [kind])

  const input: GenerateInput = useMemo(
    () => ({ kind, length, passwordOptions: pwdOptions }),
    [kind, length, pwdOptions],
  )

  const entropy = useMemo(() => estimateEntropy(input), [input])
  const strength = useMemo(() => strengthLabel(entropy), [entropy])

  const run = useCallback(() => {
    setError(null)
    try {
      setTokens(generateBatch(input, count))
    } catch (e) {
      setTokens([])
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [input, count])

  // 进入面板自动出一条，参数变了不自动重算（避免你边调长度边闪屏）
  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showLength = kind !== 'uuid'
  const showPwdOpts = kind === 'password'
  const presetLengths = PRESET_LENGTH[kind]

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[var(--color-muted-foreground)]">Token 类型</label>
        <Segmented value={kind} onChange={setKind} options={KIND_OPTIONS} />
        <p className="text-xs text-[var(--color-muted-foreground)]">{KIND_HINTS[kind]}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        {showLength && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
              长度（{LENGTH_UNIT[kind]}）
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={1}
                max={4096}
                value={length}
                onChange={e => setLength(Math.max(1, Number(e.target.value) || 1))}
                className="w-28"
              />
              <div className="flex gap-1">
                {presetLengths.map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setLength(n)}
                    className={
                      'rounded-md border px-2 py-0.5 text-xs transition-colors ' +
                      (length === n
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                        : 'hover:bg-[var(--color-accent)]')
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">一次生成几条</label>
          <div className="flex flex-wrap gap-1">
            {[1, 3, 5, 10, 20].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={
                  'rounded-md border px-2 py-1 text-xs transition-colors ' +
                  (count === n
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                    : 'hover:bg-[var(--color-accent)]')
                }
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end">
          <Button size="lg" className="shadow-md" onClick={run}>
            <RefreshCw />
            生成
          </Button>
        </div>
      </div>

      {showPwdOpts && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">字符类</label>
          <div className="flex flex-wrap gap-3 text-sm">
            {(
              [
                ['lower', '小写 a-z'],
                ['upper', '大写 A-Z'],
                ['digit', '数字 0-9'],
                ['symbol', '符号 !@#$%^&*…'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={pwdOptions[key]}
                  onChange={e => setPwdOptions(o => ({ ...o, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-[var(--color-muted)]/30 px-3 py-2 text-xs">
        <span className="text-[var(--color-muted-foreground)]">熵 ≈</span>
        <code className="font-mono">{entropy.toFixed(0)} bits</code>
        <Badge variant={toneVariant(strength.tone)}>{strength.label}</Badge>
        <span className="text-[var(--color-muted-foreground)]">
          {kind === 'hex' && length === 16 && '← 这正是 `openssl rand -hex 16` 输出的格式，frp auth.token 推荐'}
          {kind === 'uuid' && '← 不要当密钥用，UUID v4 只是身份 ID'}
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {error}
        </div>
      )}

      {tokens.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
              结果（{tokens.length} 条）
            </label>
            {tokens.length > 1 && (
              <CopyAllButton tokens={tokens} />
            )}
          </div>
          <div className="space-y-1.5">
            {tokens.map((t, i) => (
              <TokenRow key={i} index={i} value={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TokenRow({ index, value }: { index: number; value: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-md border bg-[var(--color-muted)]/40 px-2 py-1.5">
      <span className="w-6 shrink-0 text-right text-xs text-[var(--color-muted-foreground)]">
        {index + 1}
      </span>
      <code className="flex-1 break-all font-mono text-sm">{value}</code>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  )
}

function CopyAllButton({ tokens }: { tokens: string[] }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(tokens.join('\n'))
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        } catch {
          /* ignore */
        }
      }}
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? '已复制全部' : '复制全部（换行分隔）'}
    </button>
  )
}

function toneVariant(tone: 'weak' | 'medium' | 'strong' | 'overkill') {
  switch (tone) {
    case 'weak':
      return 'destructive' as const
    case 'medium':
      return 'outline' as const
    case 'strong':
      return 'success' as const
    case 'overkill':
      return 'secondary' as const
  }
}
