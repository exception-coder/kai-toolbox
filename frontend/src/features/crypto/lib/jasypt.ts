import CryptoJS from 'crypto-js'

/**
 * Jasypt 兼容的两种最常见 PBE 算法。
 * - basic: PBEWithMD5AndDES，jasypt-spring-boot-starter 2.x 默认；
 *   输出 = base64( salt[8B] || DES-CBC 密文 )，key/iv 由 PBKDF1-MD5(password,salt,iter) 派生。
 * - strong: PBEWithHMACSHA512AndAES_256，jasypt-spring-boot-starter 3.x 默认；
 *   输出 = base64( salt[16B] || iv[16B] || AES-256-CBC 密文 )，key 由 PBKDF2-HMAC-SHA512 派生。
 *
 * Jasypt 默认 iterations=1000，保持一致。
 */
export type JasyptAlgo = 'basic' | 'strong'

export const JASYPT_ALGO_LABEL: Record<JasyptAlgo, string> = {
  basic: 'PBEWithMD5AndDES',
  strong: 'PBEWithHMACSHA512AndAES_256',
}

const DEFAULT_ITERATIONS = 1000

type WA = CryptoJS.lib.WordArray

/** 把 base64 中可能的 ENC(...) 包裹剥掉，方便直接粘贴 application.yml 的密文。 */
function stripEncWrapper(s: string): string {
  const t = s.trim()
  const m = /^ENC\((.*)\)$/i.exec(t)
  return m ? m[1].trim() : t
}

/** WordArray 在字节边界切片；offsetBytes 必须是 4 的倍数（jasypt 头部都满足）。 */
function sliceWA(wa: WA, offsetBytes: number, length?: number): WA {
  const offsetWords = offsetBytes >>> 2
  const sigBytes = length ?? wa.sigBytes - offsetBytes
  const wordCount = (sigBytes + 3) >>> 2
  return CryptoJS.lib.WordArray.create(
    wa.words.slice(offsetWords, offsetWords + wordCount),
    sigBytes,
  )
}

/** PKCS#5 PBKDF1-MD5：T1 = MD5(password || salt)，T_n = MD5(T_{n-1})，取 16 字节。前 8 = key，后 8 = iv。 */
function deriveBasicKeyIv(password: string, salt: WA, iterations: number) {
  const passwordWA = CryptoJS.enc.Utf8.parse(password)
  let digest = CryptoJS.MD5(passwordWA.clone().concat(salt))
  for (let i = 1; i < iterations; i++) {
    digest = CryptoJS.MD5(digest)
  }
  return {
    key: CryptoJS.lib.WordArray.create(digest.words.slice(0, 2), 8),
    iv: CryptoJS.lib.WordArray.create(digest.words.slice(2, 4), 8),
  }
}

function jasyptEncryptBasic(plain: string, password: string, iterations: number): string {
  const salt = CryptoJS.lib.WordArray.random(8)
  const { key, iv } = deriveBasicKeyIv(password, salt, iterations)
  const encrypted = CryptoJS.DES.encrypt(plain, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })
  return CryptoJS.enc.Base64.stringify(salt.clone().concat(encrypted.ciphertext))
}

function jasyptDecryptBasic(cipher: string, password: string, iterations: number): string {
  const combined = CryptoJS.enc.Base64.parse(stripEncWrapper(cipher))
  if (combined.sigBytes < 16) throw new Error('密文长度过短，应至少包含 8 字节 salt + 8 字节 DES 块')
  const salt = sliceWA(combined, 0, 8)
  const ct = sliceWA(combined, 8)
  const { key, iv } = deriveBasicKeyIv(password, salt, iterations)
  const decrypted = CryptoJS.DES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext: ct }),
    key,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
  )
  const out = decrypted.toString(CryptoJS.enc.Utf8)
  if (!out) throw new Error('解密结果为空，可能密码错误或密文不是 PBEWithMD5AndDES')
  return out
}

function jasyptEncryptStrong(plain: string, password: string, iterations: number): string {
  const salt = CryptoJS.lib.WordArray.random(16)
  const iv = CryptoJS.lib.WordArray.random(16)
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations,
    hasher: CryptoJS.algo.SHA512,
  })
  const encrypted = CryptoJS.AES.encrypt(plain, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })
  return CryptoJS.enc.Base64.stringify(salt.clone().concat(iv).concat(encrypted.ciphertext))
}

function jasyptDecryptStrong(cipher: string, password: string, iterations: number): string {
  const combined = CryptoJS.enc.Base64.parse(stripEncWrapper(cipher))
  if (combined.sigBytes < 48) throw new Error('密文过短，应至少 16B salt + 16B iv + 16B AES 块')
  const salt = sliceWA(combined, 0, 16)
  const iv = sliceWA(combined, 16, 16)
  const ct = sliceWA(combined, 32)
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations,
    hasher: CryptoJS.algo.SHA512,
  })
  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext: ct }),
    key,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
  )
  const out = decrypted.toString(CryptoJS.enc.Utf8)
  if (!out) throw new Error('解密结果为空，可能密码错误或密文不是 PBEWithHMACSHA512AndAES_256')
  return out
}

export function jasyptEncrypt(plain: string, password: string, algo: JasyptAlgo, iterations = DEFAULT_ITERATIONS): string {
  if (!plain || !password) throw new Error('明文和密码均不能为空')
  return algo === 'basic'
    ? jasyptEncryptBasic(plain, password, iterations)
    : jasyptEncryptStrong(plain, password, iterations)
}

export function jasyptDecrypt(cipher: string, password: string, algo: JasyptAlgo, iterations = DEFAULT_ITERATIONS): string {
  if (!cipher || !password) throw new Error('密文和密码均不能为空')
  return algo === 'basic'
    ? jasyptDecryptBasic(cipher, password, iterations)
    : jasyptDecryptStrong(cipher, password, iterations)
}

export const JASYPT_DEFAULT_ITERATIONS = DEFAULT_ITERATIONS
