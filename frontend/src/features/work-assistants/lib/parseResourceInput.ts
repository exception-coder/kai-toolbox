import type { Enrollment } from '../api'

const aliases: Record<string, keyof Enrollment> = {
  host: 'host', 主机: 'host', 地址: 'host', port: 'port', 端口: 'port', db: 'database', database: 'database', service_name: 'database', 数据库: 'database',
  username: 'username', user: 'username', 账号: 'username', 用户名: 'username', password: 'password', pwd: 'password', 密码: 'password',
  name: 'name', 名称: 'name', env: 'environment', environment: 'environment', 环境: 'environment', type: 'type', 类型: 'type',
  url: 'baseUrl', 站点: 'baseUrl', loginpath: 'loginPath', 登录路径: 'loginPath',
}

/** 只解析明确的逐行键值格式，整个过程在安全表单本地内存中完成。 */
export function parseResourceInput(text: string): { patch: Partial<Enrollment>; unknown: number } {
  const patch: Partial<Enrollment> = {}
  let unknown = 0
  for (const line of text.split(/\r?\n/).filter(value => value.trim())) {
    const match = line.match(/^\s*([^:=：]+)\s*[:=：]\s*(.*?)\s*$/)
    const label = match?.[1].trim().toLowerCase()
    const key = label && Object.hasOwn(aliases, label) ? aliases[label] : undefined
    if (!key || !match) { unknown++; continue }
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (key === 'port') {
      const port = Number(value)
      if (!Number.isInteger(port) || port < 1 || port > 65535) { unknown++; continue }
      patch.port = port
    } else if (key === 'environment') {
      if (!['LOCAL', 'DEV', 'TEST', 'UAT', 'PROD'].includes(value.toUpperCase())) { unknown++; continue }
      patch.environment = value.toUpperCase()
    } else if (key === 'type') {
      if (!['ORACLE', 'MYSQL', 'REDIS', 'RABBITMQ', 'KAFKA'].includes(value.toUpperCase())) { unknown++; continue }
      patch.type = value.toUpperCase()
    } else if (['name', 'host', 'database', 'baseUrl', 'loginPath', 'username', 'password'].includes(key)) {
      Object.assign(patch, { [key]: value })
    }
  }
  return { patch, unknown }
}
