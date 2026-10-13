import { format } from 'prettier/standalone'
import type { Options } from 'prettier'
import javaPlugin from 'prettier-plugin-java'
import { lexAndParse } from 'java-parser'
import { JAVA_MAX_BYTES, type JavaFormatOptions, type JavaFormatResult, type JavaInputMode } from './contracts'

const PARSERS = [
  { entrypoint: 'compilationUnit', mode: 'file', kind: '完整文件' },
  { entrypoint: 'interfaceMemberDeclaration', mode: 'member', kind: '方法 / 接口成员' },
  { entrypoint: 'classBodyDeclaration', mode: 'member', kind: '方法 / 类成员' },
  { entrypoint: 'blockStatements', mode: 'statements', kind: '语句片段' },
  { entrypoint: 'expression', mode: 'expression', kind: '表达式' },
] as const

function syntaxFailure(input: string, failures: unknown[]): JavaFormatResult {
  const lines = input.split('\n')
  const locations = failures.map(error => {
    const message = String(error)
    // java-parser 的 EOF token 没有坐标；缺失闭合符时用真实原文末尾定位。
    if (/line: NaN, column: NaN/.test(message)) return { line: lines.length, column: lines[lines.length - 1].length + 1 }
    const match = /line: (\d+), column: (\d+)/.exec(message)
    return match ? { line: Number(match[1]), column: Number(match[2]) } : undefined
  }).filter((location): location is { line: number; column: number } => location !== undefined)
    .filter(location => Number.isFinite(location.line) && Number.isFinite(location.column))
    .sort((a, b) => b.line - a.line || b.column - a.column)
  const location = locations[0]
  const position = location ? lines.slice(0, location.line - 1).reduce((offset, line) => offset + line.length + 1, 0) + location.column - 1 : undefined
  return {
    ok: false,
    error: `无法解析 Java${location ? `，第 ${location.line} 行、第 ${location.column} 列` : ''}。请检查括号、分号或片段类型；原文和上一份结果已保留。`,
    position: position === undefined ? undefined : Math.min(input.length, Math.max(0, position)),
  }
}

function resolveParser(input: string, mode: JavaInputMode) {
  const failures: unknown[] = []
  for (const parser of PARSERS) {
    if (mode !== 'auto' && mode !== parser.mode) continue
    try {
      lexAndParse(input, parser.entrypoint)
      return { parser }
    } catch (error) { failures.push(error) }
  }
  return { failure: syntaxFailure(input, failures) }
}

/** 只生成副本；语法片段使用解析入口，不添加或删除包装类。 */
export async function formatJava(input: string, options: JavaFormatOptions): Promise<JavaFormatResult> {
  if (!input.trim()) return { ok: false, error: '先粘贴需要查看的 Java 代码。' }
  if (new Blob([input]).size > JAVA_MAX_BYTES) return { ok: false, error: '代码超过 256 KB，请选择较小的代码片段；原文已保留。' }
  if (![80, 100, 120].includes(options.printWidth) || !['2', '4', 'tab'].includes(options.indent)) {
    return { ok: false, error: '格式化选项无效，请重新选择缩进和行宽。' }
  }
  const resolved = resolveParser(input, options.mode)
  if (resolved.failure) return resolved.failure
  const parser = resolved.parser!
  try {
    const prettierOptions: Options & { entrypoint: string } = {
      parser: 'java', plugins: [javaPlugin], entrypoint: parser.entrypoint,
      tabWidth: options.indent === '2' ? 2 : 4, useTabs: options.indent === 'tab',
      printWidth: options.printWidth, arrowParens: 'avoid', trailingComma: 'none', endOfLine: 'lf',
    }
    const output = await format(input, prettierOptions)
    lexAndParse(output, parser.entrypoint)
    return { ok: true, output, kind: parser.kind }
  } catch { return { ok: false, error: '此片段暂时无法格式化，原文和上一份结果已保留。可调整片段类型后重试。' } }
}
