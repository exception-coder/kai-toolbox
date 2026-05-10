import CryptoJS from 'crypto-js'

export type EncodeKind = 'base64' | 'hex' | 'url'

export function encode(kind: EncodeKind, plain: string): string {
  if (!plain) return ''
  switch (kind) {
    case 'base64':
      return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(plain))
    case 'hex':
      return CryptoJS.enc.Hex.stringify(CryptoJS.enc.Utf8.parse(plain))
    case 'url':
      return encodeURIComponent(plain)
  }
}

export function decode(kind: EncodeKind, cipher: string): string {
  if (!cipher) return ''
  switch (kind) {
    case 'base64':
      return CryptoJS.enc.Base64.parse(cipher).toString(CryptoJS.enc.Utf8)
    case 'hex':
      return CryptoJS.enc.Hex.parse(cipher).toString(CryptoJS.enc.Utf8)
    case 'url':
      return decodeURIComponent(cipher)
  }
}
