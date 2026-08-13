export type PendingSqlStatementKind = 'DDL' | 'DML' | 'ROLLBACK' | 'OTHER'

export interface PendingSqlStatement {
  id: string
  order: number
  sql: string
  displaySql: string
  kind: PendingSqlStatementKind
  operation: string
  objectName: string | null
  title: string
  lineCount: number
  searchText: string
}

const OPERATION_RULES: Array<{
  pattern: RegExp
  kind: PendingSqlStatementKind
  operation: string
  objectGroup?: number
}> = [
  { pattern: /\bCREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([^\s(;]+)/i, kind: 'DDL', operation: '创建表', objectGroup: 1 },
  { pattern: /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+([^\s(;]+)/i, kind: 'DDL', operation: '创建索引', objectGroup: 1 },
  { pattern: /\bALTER\s+TABLE\s+([^\s(;]+)/i, kind: 'DDL', operation: '修改表', objectGroup: 1 },
  { pattern: /\bDROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+([^\s(;]+)/i, kind: 'DDL', operation: '删除表', objectGroup: 1 },
  { pattern: /\bDROP\s+INDEX(?:\s+IF\s+EXISTS)?\s+([^\s(;]+)/i, kind: 'DDL', operation: '删除索引', objectGroup: 1 },
  { pattern: /\bTRUNCATE\s+TABLE\s+([^\s(;]+)/i, kind: 'DDL', operation: '清空表', objectGroup: 1 },
  { pattern: /\bCOMMENT\s+ON\s+(?:TABLE|COLUMN)\s+([^\s(;]+)/i, kind: 'DDL', operation: '补充注释', objectGroup: 1 },
  { pattern: /\bRENAME\s+TABLE\s+([^\s(;]+)/i, kind: 'DDL', operation: '重命名表', objectGroup: 1 },
  { pattern: /\bINSERT\s+INTO\s+([^\s(;]+)/i, kind: 'DML', operation: '插入数据', objectGroup: 1 },
  { pattern: /\bUPDATE\s+([^\s(;]+)/i, kind: 'DML', operation: '更新数据', objectGroup: 1 },
  { pattern: /\bDELETE\s+FROM\s+([^\s(;]+)/i, kind: 'DML', operation: '删除数据', objectGroup: 1 },
  { pattern: /\bMERGE\s+INTO\s+([^\s(;]+)/i, kind: 'DML', operation: '合并数据', objectGroup: 1 },
  { pattern: /\bREPLACE\s+INTO\s+([^\s(;]+)/i, kind: 'DML', operation: '覆盖数据', objectGroup: 1 },
  { pattern: /\bROLLBACK\b/i, kind: 'ROLLBACK', operation: '回滚事务' },
]

const BUSINESS_COMMENT = /--\s*功能[：:]\s*([^；;\r\n]+)(?:[；;]|$)/i
const ROLLBACK_COMMENT = /(?:--|\/\*)[^\r\n]*(?:回滚|rollback)/i
const DELIMITER_DIRECTIVE = /^\s*DELIMITER\s+(\S+)\s*$/i

/**
 * 将完整 SQL 原文派生为只读审阅清单。解析器不修改持久化文本；遇到无法确认的边界时保留为一条。
 */
export function parsePendingSqlReview(sqlText: string): PendingSqlStatement[] {
  const chunks = splitSqlStatements(sqlText)
  return chunks.map((sql, index) => summarizeStatement(sql, index))
}

function splitSqlStatements(source: string): string[] {
  const statements: string[] = []
  let buffer = ''
  let delimiter = ';'
  let state: 'normal' | 'single' | 'double' | 'backtick' | 'bracket' | 'lineComment' | 'blockComment' | 'dollar' = 'normal'
  let dollarTag = ''
  let lineStart = true

  const flush = () => {
    const value = buffer.trim()
    if (containsExecutableSql(value)) statements.push(value)
    buffer = ''
  }

  for (let index = 0; index < source.length;) {
    if (state === 'normal' && lineStart) {
      const lineEnd = source.indexOf('\n', index)
      const end = lineEnd < 0 ? source.length : lineEnd
      const line = source.slice(index, end).replace(/\r$/, '')
      if (/^\s*GO\s*$/i.test(line)) {
        flush()
        index = lineEnd < 0 ? end : end + 1
        lineStart = true
        continue
      }
      if (/^\s*\/\s*$/.test(line) && isOracleBlock(buffer)) {
        buffer += source.slice(index, lineEnd < 0 ? end : end + 1)
        flush()
        index = lineEnd < 0 ? end : end + 1
        lineStart = true
        continue
      }
      const directive = DELIMITER_DIRECTIVE.exec(line)
      if (directive) {
        const directiveText = source.slice(index, lineEnd < 0 ? end : end + 1)
        if (directive[1] === ';' && statements.length > 0 && !buffer.trim()) {
          statements[statements.length - 1] += `\n${directiveText.trimEnd()}`
        } else {
          buffer += directiveText
        }
        delimiter = directive[1]
        index = lineEnd < 0 ? end : end + 1
        lineStart = true
        continue
      }
    }

    const char = source[index]
    const next = source[index + 1]

    if (state === 'lineComment') {
      buffer += char
      index += 1
      if (char === '\n') {
        state = 'normal'
        lineStart = true
      }
      continue
    }
    if (state === 'blockComment') {
      buffer += char
      index += 1
      if (char === '*' && next === '/') {
        buffer += '/'
        index += 1
        state = 'normal'
      }
      lineStart = char === '\n'
      continue
    }
    if (state === 'dollar') {
      if (source.startsWith(dollarTag, index)) {
        buffer += dollarTag
        index += dollarTag.length
        state = 'normal'
      } else {
        buffer += char
        index += 1
      }
      lineStart = char === '\n'
      continue
    }
    if (state !== 'normal') {
      buffer += char
      index += 1
      if (char === '\\' && state !== 'bracket' && index < source.length) {
        buffer += source[index]
        index += 1
        continue
      }
      const closing = state === 'single' ? "'" : state === 'double' ? '"' : state === 'backtick' ? '`' : ']'
      if (char === closing) {
        if (source[index] === closing && state !== 'bracket') {
          buffer += source[index]
          index += 1
        } else {
          state = 'normal'
        }
      }
      lineStart = char === '\n'
      continue
    }

    if (char === '-' && next === '-') {
      buffer += '--'
      index += 2
      state = 'lineComment'
      lineStart = false
      continue
    }
    if (char === '/' && next === '*') {
      buffer += '/*'
      index += 2
      state = 'blockComment'
      lineStart = false
      continue
    }
    if (char === "'" || char === '"' || char === '`' || char === '[') {
      buffer += char
      index += 1
      state = char === "'" ? 'single' : char === '"' ? 'double' : char === '`' ? 'backtick' : 'bracket'
      lineStart = false
      continue
    }
    if (char === '$') {
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(source.slice(index))?.[0]
      if (tag) {
        buffer += tag
        index += tag.length
        dollarTag = tag
        state = 'dollar'
        lineStart = false
        continue
      }
    }
    if (delimiter && source.startsWith(delimiter, index)
      && !(delimiter === ';' && isOracleBlock(buffer))) {
      buffer += delimiter
      index += delimiter.length
      flush()
      lineStart = false
      continue
    }

    buffer += char
    index += 1
    lineStart = char === '\n'
  }

  flush()
  if (statements.length === 0 && source.trim()) return [source.trim()]
  return statements
}

function isOracleBlock(value: string): boolean {
  const normalized = value
    .replace(/^\s*--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*DELIMITER\s+\S+\s*$/gim, '')
    .trimStart()
  if (/\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.test(normalized)) return false
  return /^(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:PROCEDURE|FUNCTION|TRIGGER|PACKAGE(?:\s+BODY)?|TYPE\s+BODY)|DECLARE\b|BEGIN\b)/i.test(normalized)
}

function containsExecutableSql(value: string): boolean {
  if (!value) return false
  const withoutComments = value
    .replace(/^\s*DELIMITER\s+\S+\s*$/gim, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '')
    .trim()
  return withoutComments.length > 0
}

function summarizeStatement(sql: string, index: number): PendingSqlStatement {
  const businessTitle = BUSINESS_COMMENT.exec(sql)?.[1]?.trim()
  const normalizedSql = sql.replace(/^\s*DELIMITER\s+\S+\s*$/gim, '')
  const rule = OPERATION_RULES.find(candidate => candidate.pattern.test(normalizedSql))
  const match = rule?.pattern.exec(normalizedSql)
  const rollback = ROLLBACK_COMMENT.test(sql)
  const kind = rollback ? 'ROLLBACK' : rule?.kind ?? 'OTHER'
  const operation = rollback ? '回滚语句' : rule?.operation ?? 'SQL 语句'
  const objectName = match && rule?.objectGroup ? cleanObjectName(match[rule.objectGroup]) : null
  const title = businessTitle || (objectName ? `${operation} · ${objectName}` : operation)
  const displaySql = stripLeadingRegistrationComments(sql)
  return {
    id: `sql-${index + 1}-${stableHash(sql)}`,
    order: index + 1,
    sql,
    displaySql,
    kind,
    operation,
    objectName,
    title,
    lineCount: displaySql.split(/\r?\n/).length,
    searchText: `${title}\n${operation}\n${objectName ?? ''}\n${sql}`.toLocaleLowerCase(),
  }
}

function stripLeadingRegistrationComments(sql: string): string {
  return sql.replace(/^(?:\s*--\s*(?:功能[：:]|Forge\s+自动登记)[^\r\n]*(?:\r?\n|$))+/i, '').trimStart()
}

function cleanObjectName(value: string): string {
  return value.replace(/^[`"\[]|[`"\]]$/g, '').replace(/[;,]$/, '')
}

function stableHash(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  return Math.abs(hash).toString(36)
}
