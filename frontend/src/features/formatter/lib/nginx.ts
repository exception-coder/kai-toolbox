/**
 * 简易 nginx.conf 格式化器：自实现 tokenizer + 缩进格式化，避免引入第三方依赖。
 *
 * 设计取舍：
 * - 注释统一独立成行（牺牲行内 `; # foo` 这种风格，换来实现简单）。
 * - 连续空行折叠为单空行。
 * - 单行多语句（`a; b; c;`）会被拆成多行。
 * - 引号字符串（"..." / '...'）保留原始引号和转义，不重写。
 */

type Token =
  | { kind: 'arg'; value: string }
  | { kind: ';' }
  | { kind: '{' }
  | { kind: '}' }
  | { kind: 'comment'; value: string }
  | { kind: 'blank' }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  const len = input.length
  let i = 0
  let consecutiveNewlines = 0

  const pushBlankIfNeeded = () => {
    if (
      consecutiveNewlines >= 2 &&
      tokens.length > 0 &&
      tokens[tokens.length - 1].kind !== 'blank'
    ) {
      tokens.push({ kind: 'blank' })
    }
  }

  while (i < len) {
    const c = input[i]

    if (c === '\n') {
      consecutiveNewlines++
      i++
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++
      continue
    }

    pushBlankIfNeeded()
    consecutiveNewlines = 0

    if (c === ';' || c === '{' || c === '}') {
      tokens.push({ kind: c as ';' | '{' | '}' })
      i++
      continue
    }

    if (c === '#') {
      i++
      const start = i
      while (i < len && input[i] !== '\n') i++
      tokens.push({ kind: 'comment', value: input.slice(start, i).trim() })
      continue
    }

    if (c === '"' || c === "'") {
      const quote = c
      const start = i
      i++
      while (i < len) {
        if (input[i] === '\\' && i + 1 < len) {
          i += 2
          continue
        }
        if (input[i] === quote) {
          i++
          break
        }
        i++
      }
      tokens.push({ kind: 'arg', value: input.slice(start, i) })
      continue
    }

    const start = i
    while (i < len) {
      const ch = input[i]
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') break
      if (ch === ';' || ch === '{' || ch === '}' || ch === '#') break
      i++
    }
    if (i > start) {
      tokens.push({ kind: 'arg', value: input.slice(start, i) })
    } else {
      // 防御：不可识别字符，跳过避免死循环
      i++
    }
  }

  return tokens
}

/** 美化输出，缩进可选 2/4/Tab。 */
export function nginxFormat(input: string, indent: 2 | 4 | '\t' = 4): string {
  const indentStr = indent === '\t' ? '\t' : ' '.repeat(indent)
  const tokens = tokenize(input)
  const lines: string[] = []
  let level = 0
  let buffer: string[] = []

  const ind = () => indentStr.repeat(Math.max(0, level))

  const flushBuffer = (suffix: string) => {
    if (buffer.length === 0) {
      lines.push(ind() + suffix.trim())
    } else {
      lines.push(ind() + buffer.join(' ') + suffix)
      buffer = []
    }
  }

  for (const t of tokens) {
    if (t.kind === 'arg') {
      buffer.push(t.value)
    } else if (t.kind === ';') {
      flushBuffer(';')
    } else if (t.kind === '{') {
      flushBuffer(' {')
      level++
    } else if (t.kind === '}') {
      if (buffer.length > 0) {
        // 不带 ; 的悬空 directive：先输出
        lines.push(ind() + buffer.join(' '))
        buffer = []
      }
      level = Math.max(0, level - 1)
      lines.push(ind() + '}')
    } else if (t.kind === 'comment') {
      if (buffer.length > 0) {
        lines.push(ind() + buffer.join(' '))
        buffer = []
      }
      lines.push(ind() + '# ' + t.value)
    } else if (t.kind === 'blank') {
      lines.push('')
    }
  }

  if (buffer.length > 0) {
    lines.push(ind() + buffer.join(' '))
  }

  // 收尾：把开头的空行去掉，结尾保留单个换行
  while (lines.length > 0 && lines[0] === '') lines.shift()
  while (lines.length > 1 && lines[lines.length - 1] === '' && lines[lines.length - 2] === '') {
    lines.pop()
  }

  return lines.join('\n') + (lines.length > 0 ? '\n' : '')
}

/** 紧凑输出：单行重组，去除注释和空行。 */
export function nginxMinify(input: string): string {
  const tokens = tokenize(input).filter(
    t => t.kind === 'arg' || t.kind === ';' || t.kind === '{' || t.kind === '}',
  )
  let out = ''
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const sym = t.kind === 'arg' ? t.value : t.kind
    if (i === 0) {
      out = sym
      continue
    }
    out += t.kind === ';' || t.kind === '}' ? sym : ' ' + sym
  }
  return out
}
