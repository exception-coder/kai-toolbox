import type { Enrollment } from '../api'
import { parseResourceInput } from './parseResourceInput'

const environments = [
  ['PROD', /生产|正式|\bprod(?:uction)?\b/i], ['UAT', /验收|预发布|\buat\b/i],
  ['TEST', /测试|\btest(?:ing)?\b/i], ['DEV', /开发|\bdev(?:elopment)?\b/i], ['LOCAL', /本地|\blocal\b/i],
] as const
const ports: Record<string, number> = { MYSQL: 3306, ORACLE: 1521, REDIS: 6379, RABBITMQ: 5672, KAFKA: 9092, SSH: 22 }
const field = (text: string, names: string) => {
  const match = text.match(new RegExp(`(?:^|[\\s,，;；])(?:${names})\\s*(?:[:=：]|是|为)?\\s*("[^"\\r\\n]*"|'[^'\\r\\n]*'|[^\\s,，;；]+)`, 'i'))
  return match?.[1].replace(/^(["'])([\s\S]*)\1$/, '$2')
}

/** Only connection grammar and a finite environment/type vocabulary are parsed locally.
 * Raw text and credentials never enter a model, browser storage or ordinary chat. */
export function parseNaturalResourceInput(text: string, systemId: string, systemName: string): { value: Enrollment; missing: string[] } {
  const explicit = parseResourceInput(text.split(/\r?\n/).filter(line => /^\s*[^:=：\s]+\s*[:=：]\s*("[^"\r\n]*"|'[^'\r\n]*'|[^\s]+)\s*$/.test(line)
    && !/[,，;；]\s*(?:password|passwd|pwd|密码|口令|user|username|账号|host|port|database|db)\s*[:=：]/i.test(line)).join('\n')).patch
  const password = explicit.password ?? field(text, 'password|passwd|pwd|密码|口令') ?? ''
  const username = explicit.username ?? field(text, 'username|user|用户名|账号') ?? ''
  const metadata = text.replace(/(?:password|passwd|pwd|密码|口令|username|user|用户名|账号)\s*(?:[:=：]|是|为)?\s*("[^"\r\n]*"|'[^'\r\n]*'|[^\s,，;；]+)/gi, '')
    .replace(/(?:jdbc:)?[a-z]+:\/\/[^\s，,；;]+/gi, '')
  const matches = environments.filter(([, pattern]) => pattern.test(metadata))
  const type = explicit.type || Object.keys(ports).filter(key => key !== 'SSH').find(key => new RegExp(`\\b${key}\\b`, 'i').test(metadata))
    || (/\bssh\b|linux|主机|服务器/i.test(metadata) ? 'SSH' : '')
  const suppliedPort = field(text, 'port|端口')
  const value: Enrollment = { requestId: crypto.randomUUID(), kind: type === 'SSH' ? 'HOST' : 'DATABASE', name: '',
    environment: explicit.environment || (matches.length === 1 ? matches[0][0] : ''), systemId, type,
    host: explicit.host || field(text, 'host|ip|主机地址|地址') || '',
    port: explicit.port ?? (suppliedPort ? Number(suppliedPort) : ports[type] || 0), database: explicit.database || field(text, 'database|db|数据库|服务名') || '',
    baseUrl: explicit.baseUrl || '', loginPath: explicit.loginPath || '', username, password }
  const connection = text.match(/(?:jdbc:)?(?:mysql|redis|rediss|ssh|https?):\/\/[^\s，,；;]+/i)?.[0]
  let invalidConnection = false
  if (connection) {
    try {
      const url = new URL(connection.replace(/^jdbc:/i, ''))
      const protocol = url.protocol.replace(':', '').toUpperCase()
      value.kind = protocol === 'SSH' ? 'HOST' : ['HTTP', 'HTTPS'].includes(protocol) ? 'APPLICATION' : 'DATABASE'
      if (value.kind !== 'APPLICATION') {
        value.type = protocol === 'REDISS' ? 'REDIS' : protocol
        value.host = url.hostname.replace(/^\[|\]$/g, ''); value.port = Number(url.port) || ports[value.type] || 0
        value.username ||= decodeURIComponent(url.username); value.password ||= decodeURIComponent(url.password)
        value.database ||= decodeURIComponent(url.pathname.replace(/^\//, ''))
      } else {
        // Userinfo never remains in the public endpoint field.
        value.username ||= decodeURIComponent(url.username); value.password ||= decodeURIComponent(url.password)
        url.username = ''; url.password = ''; url.search = ''; url.hash = ''; value.baseUrl = url.toString()
      }
    } catch { invalidConnection = true }
  }
  if (!value.host && value.kind !== 'APPLICATION') {
    const address = metadata.match(/\b((?:\d{1,3}\.){3}\d{1,3})(?::(\d{1,5}))?\b/)
    if (address) { value.host = address[1]; if (address[2]) value.port = Number(address[2]) }
  }
  const hostPort = value.host.match(/^([^:/]+):(\d{1,5})(?:\/([^\s]*))?$/)
  if (hostPort) { value.host = hostPort[1]; value.port = Number(hostPort[2]); value.database ||= hostPort[3] || '' }
  const oracle = text.match(/jdbc:oracle:thin:@(?:\/\/)?([^\s:/]+):(\d+)[/:]([^\s，,；;]+)/i)
  if (oracle) { value.type = 'ORACLE'; value.host = oracle[1]; value.port = Number(oracle[2]); value.database = oracle[3] }
  if (value.baseUrl && !type && !connection) value.kind = 'APPLICATION'
  value.name = explicit.name || `${systemName || '资源'} · ${value.environment || '待确认环境'} · ${value.kind === 'APPLICATION' ? '站点' : value.type || '待确认类型'}`
  const missing: string[] = []
  if (invalidConnection) missing.push('有效连接串（特殊密码字符需使用 URI 编码）')
  if (!connection && !explicit.password && /(?:password|passwd|pwd|密码|口令)\s*[:=：]\s*[^"'\s][^\s]*[,;，；]/i.test(text)) {
    missing.push('密码含分隔符，请将密码单独一行填写或加引号，避免截断')
  }
  if (!value.systemId) missing.push('所属项目 / 系统')
  if (!value.environment) missing.push(matches.length > 1 ? '环境存在歧义，请一次登记一个环境' : '环境（如生产、测试）')
  if (value.kind === 'APPLICATION') { if (!value.baseUrl) missing.push('站点地址') }
  else {
    if (!value.type) missing.push('资源类型（如 MySQL、Redis、SSH 主机）')
    if (!value.host) missing.push('主机地址')
    if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535) missing.push('有效端口')
    if (value.kind === 'HOST' && (!value.username || !value.password)) missing.push('SSH 账号和密码')
  }
  if (/PRIVATE KEY|passphrase|token\s*[:=：]/i.test(text)) missing.push('当前入口不保存私钥或 Token，请使用原配置入口')
  return { value, missing }
}
