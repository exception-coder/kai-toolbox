import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { AesPanel } from '../components/AesPanel'
import { RsaPanel } from '../components/RsaPanel'
import { HashPanel } from '../components/HashPanel'
import { EncodePanel } from '../components/EncodePanel'
import { JasyptPanel } from '../components/JasyptPanel'

type Tab = 'aes' | 'rsa' | 'jasypt' | 'hash' | 'encode'

const TAB_OPTIONS = [
  { value: 'aes', label: 'AES' },
  { value: 'rsa', label: 'RSA' },
  { value: 'jasypt', label: 'Jasypt' },
  { value: 'hash', label: 'Hash' },
  { value: 'encode', label: 'Encode' },
] as const

const TAB_HINTS: Record<Tab, string> = {
  aes: '对称加解密，CBC / ECB，PKCS7 padding',
  rsa: '非对称加解密 / 签名验签，可在线生成密钥对',
  jasypt: 'Spring Boot Jasypt 兼容：PBEWithMD5AndDES（2.x 默认） / PBEWithHMACSHA512AndAES_256（3.x 默认）',
  hash: '单向哈希：MD5 / SHA-1 / SHA-256 / SHA-512',
  encode: '编解码：Base64 / Hex / URL（非加密）',
}

export function CryptoPage() {
  const [tab, setTab] = useState<Tab>('aes')

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Card>
        <CardHeader className="space-y-3">
          <div>
            <CardTitle>加解密工具</CardTitle>
            <CardDescription>纯前端运算，输入数据不会上送服务端</CardDescription>
          </div>
          <Segmented value={tab} onChange={setTab} options={TAB_OPTIONS} size="md" />
          <p className="text-xs text-[var(--color-muted-foreground)]">{TAB_HINTS[tab]}</p>
        </CardHeader>
        <CardContent>
          {tab === 'aes' && <AesPanel />}
          {tab === 'rsa' && <RsaPanel />}
          {tab === 'jasypt' && <JasyptPanel />}
          {tab === 'hash' && <HashPanel />}
          {tab === 'encode' && <EncodePanel />}
        </CardContent>
      </Card>
    </div>
  )
}
