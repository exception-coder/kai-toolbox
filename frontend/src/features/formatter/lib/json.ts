/** JSON 工具：失败时抛 Error，UI 层捕获显示。 */

export function jsonFormat(input: string, indent: number | '\t'): string {
  if (!input.trim()) return ''
  return JSON.stringify(JSON.parse(input), null, indent)
}

export function jsonMinify(input: string): string {
  if (!input.trim()) return ''
  return JSON.stringify(JSON.parse(input))
}

/** 把任意字符串转义为 JSON 字符串字面量（含外层双引号）。 */
export function jsonEscape(input: string): string {
  return JSON.stringify(input)
}

/** 反转义 JSON 字符串字面量；输入应是 "..." 或合法 JSON 字符串。 */
export function jsonUnescape(input: string): string {
  const trimmed = input.trim()
  // 容忍外层未带引号的转义串，自动补一对双引号
  const wrapped = trimmed.startsWith('"') ? trimmed : `"${trimmed}"`
  const v = JSON.parse(wrapped)
  if (typeof v !== 'string') throw new Error('反转义结果不是字符串')
  return v
}
