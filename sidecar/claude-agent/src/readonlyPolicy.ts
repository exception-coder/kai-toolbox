const WRITE_SQL = /\b(insert|update|delete|merge|replace|upsert|alter|drop|truncate|create|grant|revoke|call|execute|exec|comment|analyze|vacuum|attach|detach|into|outfile|dumpfile)\b/i
const LOCKING_READ = /\bfor\s+update\b/i

/**
 * 咨询数据库工具的第一层只读校验。Java 查询接口还会再次做 SELECT-only、只读连接与超时限制。
 */
export function validateReadonlySql(sql: string): string | null {
  const normalized = sql.trim()
  if (!normalized) return 'SQL 不能为空'
  if (normalized.length > 20_000) return 'SQL 过长'
  if (!/^(select|with)\b/i.test(normalized)) return '只允许 SELECT / WITH 查询'
  if (normalized.includes(';')) return '只允许单条 SQL，不能包含分号'
  if (WRITE_SQL.test(normalized) || LOCKING_READ.test(normalized)) return 'SQL 包含写入、DDL 或锁定语义'
  return null
}
