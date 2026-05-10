import CryptoJS from 'crypto-js'

export type AesMode = 'CBC' | 'ECB'
export type KeyEncoding = 'utf8' | 'hex' | 'base64'
export type CipherEncoding = 'base64' | 'hex'

export interface AesOptions {
  mode: AesMode
  keyEncoding: KeyEncoding
  ivEncoding: KeyEncoding
  outputEncoding: CipherEncoding
  key: string
  iv: string
}

function parseKey(value: string, enc: KeyEncoding): CryptoJS.lib.WordArray {
  if (enc === 'utf8') return CryptoJS.enc.Utf8.parse(value)
  if (enc === 'hex') return CryptoJS.enc.Hex.parse(value)
  return CryptoJS.enc.Base64.parse(value)
}

function buildCfg(opts: AesOptions) {
  const cfg: { mode: typeof CryptoJS.mode.CBC; padding: typeof CryptoJS.pad.Pkcs7; iv?: CryptoJS.lib.WordArray } = {
    mode: opts.mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }
  if (opts.mode === 'CBC') {
    cfg.iv = parseKey(opts.iv, opts.ivEncoding)
  }
  return cfg
}

export function aesEncrypt(plain: string, opts: AesOptions): string {
  if (!plain) return ''
  const key = parseKey(opts.key, opts.keyEncoding)
  const encrypted = CryptoJS.AES.encrypt(plain, key, buildCfg(opts))
  return opts.outputEncoding === 'hex'
    ? encrypted.ciphertext.toString(CryptoJS.enc.Hex)
    : encrypted.ciphertext.toString(CryptoJS.enc.Base64)
}

export function aesDecrypt(cipher: string, opts: AesOptions): string {
  if (!cipher) return ''
  const key = parseKey(opts.key, opts.keyEncoding)
  const ciphertext =
    opts.outputEncoding === 'hex'
      ? CryptoJS.enc.Hex.parse(cipher)
      : CryptoJS.enc.Base64.parse(cipher)
  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext }),
    key,
    buildCfg(opts),
  )
  return decrypted.toString(CryptoJS.enc.Utf8)
}
