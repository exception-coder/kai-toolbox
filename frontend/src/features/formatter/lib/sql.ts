import { format as sqlFormat15 } from 'sql-formatter'
import type { FormatResult } from './xml'

export type { FormatResult }

export type SqlDialect = 'sql' | 'mysql' | 'postgresql' | 'sqlite' | 'tsql' | 'mariadb' | 'bigquery' | 'snowflake'
export type SqlKeywordCase = 'upper' | 'lower' | 'preserve'

export const SQL_DIALECTS: { value: SqlDialect; label: string }[] = [
  { value: 'sql', label: 'Standard' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'tsql', label: 'SQL Server' },
  { value: 'mariadb', label: 'MariaDB' },
  { value: 'bigquery', label: 'BigQuery' },
  { value: 'snowflake', label: 'Snowflake' },
]

export interface SqlFormatOpts {
  indent: number | '\t'
  dialect: SqlDialect
  keywordCase: SqlKeywordCase
}

export function sqlFormat(input: string, opts: SqlFormatOpts): FormatResult {
  if (!input.trim()) return { ok: true, output: '' }
  const useTabs = opts.indent === '\t'
  const tabWidth = useTabs ? 1 : (opts.indent as number)
  try {
    const output = sqlFormat15(input, {
      language: opts.dialect,
      tabWidth,
      useTabs,
      keywordCase: opts.keywordCase,
      linesBetweenQueries: 2,
    })
    return { ok: true, output }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 自己实现 minify：sql-formatter v15 不提供 minify。
 *  做法：扫描 token，剥离 -- 行注释 + 块注释；多空白塌缩成单空格；保留单/双引号字符串与反引号标识符原样。 */
export function sqlMinify(input: string): FormatResult {
  if (!input.trim()) return { ok: true, output: '' }
  const out: string[] = []
  let i = 0
  const n = input.length
  while (i < n) {
    const ch = input[i]
    const next = i + 1 < n ? input[i + 1] : ''
    // 行注释 -- 到行尾
    if (ch === '-' && next === '-') {
      while (i < n && input[i] !== '\n') i++
      continue
    }
    // 块注释 /* ... */
    if (ch === '/' && next === '*') {
      i += 2
      while (i < n && !(input[i] === '*' && input[i + 1] === '/')) i++
      i += 2
      continue
    }
    // 字符串字面量 '...' 或 "..." 或 `...`，含转义 ''/""
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      out.push(quote)
      i++
      while (i < n) {
        const c = input[i]
        if (c === '\\' && i + 1 < n) {
          out.push(c, input[i + 1])
          i += 2
          continue
        }
        // SQL 的双重引号转义： '' -> 单引号
        if (c === quote && input[i + 1] === quote) {
          out.push(c, c)
          i += 2
          continue
        }
        out.push(c)
        i++
        if (c === quote) break
      }
      continue
    }
    // 空白塌缩
    if (/\s/.test(ch)) {
      // 跳过整段空白
      while (i < n && /\s/.test(input[i])) i++
      // 仅在前一个非空白与下一个非空白之间需要一个空格才输出
      const prev = out.length > 0 ? out[out.length - 1] : ''
      const after = i < n ? input[i] : ''
      if (prev && after && !/[\s(),;]/.test(prev) && !/[\s(),;]/.test(after)) {
        out.push(' ')
      }
      continue
    }
    out.push(ch)
    i++
  }
  return { ok: true, output: out.join('').trim() }
}
