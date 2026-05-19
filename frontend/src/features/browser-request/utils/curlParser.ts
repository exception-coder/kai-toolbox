/**
 * 前端版 cURL 解析器，保持与后端 {@code CurlParser.java} 行为一致。
 * 支持：
 *   -X / --request  方法
 *   -H / --header   头
 *   -b / --cookie   Cookie 头
 *   -d / --data / --data-raw / --data-binary / --data-urlencode  请求体
 *   -A / --user-agent / -e / --referer / -u / --user (basic auth)
 *   行尾续行符 \ ^ ` 规整为空格
 *   单引号 / 双引号 / 反斜杠转义
 *
 * 不支持：multipart -F、@file（同后端）。
 * 解析失败抛 Error（不返回 null）。
 */

export interface ParsedCurl {
  method: string
  url: string
  headers: Record<string, string>
  body: string | undefined
}

export function parseCurl(raw: string): ParsedCurl {
  if (!raw || !raw.trim()) throw new Error('cURL 文本为空')
  const normalized = raw
    .replace(/\r\n/g, '\n')
    .replace(/\\\n/g, ' ')
    .replace(/\^\n/g, ' ')
    .replace(/`\n/g, ' ')
    .trim()
  const tokens = tokenize(normalized)
  if (tokens.length === 0 || tokens[0].toLowerCase() !== 'curl') {
    throw new Error('不是有效的 cURL 命令，应以 curl 开头')
  }

  let method: string | null = null
  let url: string | null = null
  let body: string | undefined
  const headers: Record<string, string> = {}
  const cookies: string[] = []

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]
    switch (t) {
      case '-X':
      case '--request':
        method = tokens[++i]
        break
      case '-H':
      case '--header': {
        const h = tokens[++i]
        const colon = h.indexOf(':')
        if (colon > 0) {
          headers[h.slice(0, colon).trim()] = h.slice(colon + 1).trim()
        }
        break
      }
      case '-b':
      case '--cookie':
        cookies.push(tokens[++i])
        break
      case '-d':
      case '--data':
      case '--data-raw':
      case '--data-binary':
      case '--data-urlencode': {
        const d = tokens[++i]
        body = body == null ? d : body + '&' + d
        break
      }
      case '--compressed':
      case '-L': case '--location':
      case '-k': case '--insecure':
      case '-i': case '--include':
      case '-s': case '--silent':
      case '-v': case '--verbose':
      case '-O': case '--remote-name':
        break
      case '-A': case '--user-agent':
        headers['User-Agent'] = tokens[++i]
        break
      case '-e': case '--referer':
        headers['Referer'] = tokens[++i]
        break
      case '-u': case '--user': {
        const creds = tokens[++i]
        headers['Authorization'] = 'Basic ' + btoa(creds)
        break
      }
      default:
        if (t.startsWith('-')) {
          // 未识别的带值/无值选项保守跳过下一个 token（避免吞 URL）
          if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-') && url == null) {
            // 不动，让下轮判断
          } else if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
            i++
          }
        } else if (url == null) {
          url = t
        }
    }
  }

  if (!url) throw new Error('cURL 命令缺少 URL')
  if (cookies.length > 0) {
    const joined = cookies.join('; ')
    headers['Cookie'] = headers['Cookie'] ? headers['Cookie'] + '; ' + joined : joined
  }
  if (method == null) method = body != null ? 'POST' : 'GET'
  return { method: method.toUpperCase(), url, headers, body }
}

/** 简易 shell tokenizer：识别单/双引号 + 反斜杠转义。 */
function tokenize(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let inSingle = false, inDouble = false, hasContent = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inSingle) {
      if (c === "'") inSingle = false
      else cur += c
      hasContent = true
    } else if (inDouble) {
      if (c === '\\' && i + 1 < s.length) {
        const n = s[i + 1]
        if (n === '"' || n === '\\' || n === '$' || n === '`') { cur += n; i++ }
        else cur += c
      } else if (c === '"') inDouble = false
      else cur += c
      hasContent = true
    } else {
      if (c === "'") { inSingle = true; hasContent = true }
      else if (c === '"') { inDouble = true; hasContent = true }
      else if (c === '\\' && i + 1 < s.length) { cur += s[++i]; hasContent = true }
      else if (/\s/.test(c)) {
        if (hasContent) { out.push(cur); cur = ''; hasContent = false }
      } else { cur += c; hasContent = true }
    }
  }
  if (hasContent) out.push(cur)
  return out
}
