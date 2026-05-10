import CryptoJS from 'crypto-js'

export type HashAlgo = 'MD5' | 'SHA1' | 'SHA256' | 'SHA512'

const HASH_FNS: Record<HashAlgo, (m: string | CryptoJS.lib.WordArray) => CryptoJS.lib.WordArray> = {
  MD5: CryptoJS.MD5,
  SHA1: CryptoJS.SHA1,
  SHA256: CryptoJS.SHA256,
  SHA512: CryptoJS.SHA512,
}

export function hash(algo: HashAlgo, input: string, upper = false): string {
  if (!input) return ''
  const hex = HASH_FNS[algo](input).toString(CryptoJS.enc.Hex)
  return upper ? hex.toUpperCase() : hex
}
