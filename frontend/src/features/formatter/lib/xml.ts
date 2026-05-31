import xmlFormatter from 'xml-formatter'

/** 所有 lib 函数都返回这种结构，UI 层统一处理 ok / 错误条 / 光标定位。 */
export type FormatResult =
  | { ok: true; output: string }
  | { ok: false; error: string; errorPos?: number }

function indentString(indent: number | '\t'): string {
  return indent === '\t' ? '\t' : ' '.repeat(indent)
}

/** 用 xml-formatter 输出的 line/column 信息估算字符 offset；找不到时返回 undefined。 */
function tryExtractErrorPos(error: string): number | undefined {
  const m = /line[^\d]*(\d+)[^\d]+col(?:umn)?[^\d]*(\d+)/i.exec(error)
  if (!m) return undefined
  return Number(m[1]) * 1000 + Number(m[2])
}

export function xmlFormat(input: string, opts: { indent: number | '\t' }): FormatResult {
  if (!input.trim()) return { ok: true, output: '' }
  try {
    const output = xmlFormatter(input, {
      indentation: indentString(opts.indent),
      collapseContent: true,
      lineSeparator: '\n',
      throwOnFailure: true,
      strictMode: false,
    })
    return { ok: true, output }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg, errorPos: tryExtractErrorPos(msg) }
  }
}

export function xmlMinify(input: string): FormatResult {
  if (!input.trim()) return { ok: true, output: '' }
  try {
    const output = xmlFormatter.minify(input, {
      collapseContent: true,
      throwOnFailure: true,
      strictMode: false,
    })
    return { ok: true, output }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg, errorPos: tryExtractErrorPos(msg) }
  }
}

const ESC_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
const UNESC_MAP: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function xmlEscape(input: string): string {
  return input.replace(/[&<>"']/g, c => ESC_MAP[c])
}

export function xmlUnescape(input: string): string {
  return input.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => UNESC_MAP[name] ?? `&${name};`)
}
