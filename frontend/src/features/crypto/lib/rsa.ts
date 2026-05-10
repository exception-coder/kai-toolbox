import { JSEncrypt } from 'jsencrypt'
import CryptoJS from 'crypto-js'

export type RsaSignAlgo = 'sha1' | 'sha256' | 'sha512'

const DIGEST_FNS: Record<RsaSignAlgo, (s: string) => string> = {
  sha1: s => CryptoJS.SHA1(s).toString(CryptoJS.enc.Hex),
  sha256: s => CryptoJS.SHA256(s).toString(CryptoJS.enc.Hex),
  sha512: s => CryptoJS.SHA512(s).toString(CryptoJS.enc.Hex),
}

/** RSA 公钥加密。失败返回 null，配合 UI 给"密钥/数据非法"提示。 */
export function rsaEncrypt(plain: string, publicKeyPem: string): string | null {
  if (!plain || !publicKeyPem) return null
  const enc = new JSEncrypt()
  enc.setPublicKey(publicKeyPem)
  const result = enc.encrypt(plain)
  return result === false ? null : result
}

/** RSA 私钥解密。失败返回 null。 */
export function rsaDecrypt(cipher: string, privateKeyPem: string): string | null {
  if (!cipher || !privateKeyPem) return null
  const enc = new JSEncrypt()
  enc.setPrivateKey(privateKeyPem)
  const result = enc.decrypt(cipher)
  return result === false ? null : result
}

/** 私钥签名，输出 base64。失败返回 null。 */
export function rsaSign(text: string, privateKeyPem: string, algo: RsaSignAlgo): string | null {
  if (!text || !privateKeyPem) return null
  const enc = new JSEncrypt()
  enc.setPrivateKey(privateKeyPem)
  const result = enc.sign(text, DIGEST_FNS[algo], algo)
  return result === false ? null : result
}

/** 公钥验签，输入 base64 签名。 */
export function rsaVerify(text: string, signature: string, publicKeyPem: string, algo: RsaSignAlgo): boolean {
  if (!text || !signature || !publicKeyPem) return false
  const enc = new JSEncrypt()
  enc.setPublicKey(publicKeyPem)
  return enc.verify(text, signature, DIGEST_FNS[algo])
}

/** 生成新的 RSA 密钥对（PEM PKCS#1）。1024 位约 100ms，2048 位约 1-3s（同步阻塞 UI）。 */
export function generateKeyPair(bits: 1024 | 2048): { publicKey: string; privateKey: string } {
  const enc = new JSEncrypt({ default_key_size: String(bits) })
  enc.getKey()
  return {
    publicKey: enc.getPublicKey(),
    privateKey: enc.getPrivateKey(),
  }
}
