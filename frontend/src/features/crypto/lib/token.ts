/**
 * Token 生成器：全部走浏览器内置 CSPRNG（{@link Crypto.getRandomValues}），
 * 不依赖任何外部库，也不向后端发送任何字节。
 */

export type TokenKind = 'hex' | 'base64' | 'base64url' | 'alphanum' | 'password' | 'uuid' | 'nanoid'

export interface PasswordOptions {
  lower: boolean
  upper: boolean
  digit: boolean
  symbol: boolean
}

const SYMBOL_POOL = '!@#$%^&*()-_=+[]{};:,.<>?/'
const ALPHANUM_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
/** RFC 4648 §5 URL-safe Base64 字母表，去掉 `+` 和 `/`，长度 64 */
const NANOID_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** 拿 n 个加密强度的随机字节。 */
function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n)
  globalThis.crypto.getRandomValues(buf)
  return buf
}

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * 从字符池里按等概率挑 length 个字符。
 * 用 rejection sampling：丢弃 256 % poolSize 那块尾巴，否则会偏向前面的字符。
 */
function sampleFromPool(pool: string, length: number): string {
  if (pool.length === 0) throw new Error('字符池不能为空')
  const poolSize = pool.length
  const cutoff = 256 - (256 % poolSize)
  let out = ''
  while (out.length < length) {
    // 一次抓 length*2 字节，命中率高时一次就够，差不多够 OK
    const chunk = randomBytes(length * 2)
    for (const b of chunk) {
      if (b >= cutoff) continue
      out += pool[b % poolSize]
      if (out.length === length) break
    }
  }
  return out
}

/** 用 crypto.randomUUID（v4，122 bits 随机） */
function uuidV4(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  // 兜底：标准 v4 拼装（基本所有现代浏览器都已经有 randomUUID）
  const b = randomBytes(16)
  b[6] = (b[6] & 0x0f) | 0x40 // version 4
  b[8] = (b[8] & 0x3f) | 0x80 // variant 10
  const h = toHex(b)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Token 入口：根据 kind + 参数生成一条 token。 */
export interface GenerateInput {
  kind: TokenKind
  /** hex / base64 / base64url 解释为「字节数」；alphanum / password / nanoid 解释为「字符数」 */
  length: number
  passwordOptions?: PasswordOptions
}

export function generate(input: GenerateInput): string {
  const len = Math.max(1, Math.min(Math.floor(input.length), 4096))
  switch (input.kind) {
    case 'hex':
      return toHex(randomBytes(len))
    case 'base64':
      return toBase64(randomBytes(len))
    case 'base64url':
      return toBase64Url(randomBytes(len))
    case 'alphanum':
      return sampleFromPool(ALPHANUM_POOL, len)
    case 'password': {
      const opts = input.passwordOptions ?? { lower: true, upper: true, digit: true, symbol: false }
      let pool = ''
      if (opts.lower) pool += 'abcdefghijklmnopqrstuvwxyz'
      if (opts.upper) pool += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      if (opts.digit) pool += '0123456789'
      if (opts.symbol) pool += SYMBOL_POOL
      if (pool.length === 0) throw new Error('至少勾选一类字符')
      return sampleFromPool(pool, len)
    }
    case 'uuid':
      return uuidV4()
    case 'nanoid':
      return sampleFromPool(NANOID_POOL, len)
  }
}

/** 同参数批量生成 n 条，互相独立。 */
export function generateBatch(input: GenerateInput, count: number): string[] {
  const n = Math.max(1, Math.min(Math.floor(count), 100))
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(generate(input))
  return out
}

/**
 * 估算 token 的熵（单位 bits）。
 * 字节型走 length*8；字符池型走 length*log2(poolSize)；UUID v4 固定 122。
 */
export function estimateEntropy(input: GenerateInput): number {
  switch (input.kind) {
    case 'hex':
    case 'base64':
    case 'base64url':
      return input.length * 8
    case 'alphanum':
      return input.length * Math.log2(ALPHANUM_POOL.length)
    case 'nanoid':
      return input.length * Math.log2(NANOID_POOL.length)
    case 'uuid':
      return 122
    case 'password': {
      const opts = input.passwordOptions ?? { lower: true, upper: true, digit: true, symbol: false }
      let pool = 0
      if (opts.lower) pool += 26
      if (opts.upper) pool += 26
      if (opts.digit) pool += 10
      if (opts.symbol) pool += SYMBOL_POOL.length
      return pool > 0 ? input.length * Math.log2(pool) : 0
    }
  }
}

/** 把熵 bits 翻成人话提示。 */
export function strengthLabel(bits: number): { label: string; tone: 'weak' | 'medium' | 'strong' | 'overkill' } {
  if (bits < 64) return { label: '弱（不要用于生产）', tone: 'weak' }
  if (bits < 96) return { label: '一般（够日常但别给关键凭证用）', tone: 'medium' }
  if (bits < 160) return { label: '强（推荐）', tone: 'strong' }
  return { label: '超额（远超暴力破解可达范围）', tone: 'overkill' }
}
