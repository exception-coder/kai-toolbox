import yaml from 'js-yaml'
import type { FormatResult } from './xml'

export type { FormatResult }

function mapError(e: unknown): FormatResult {
  if (e instanceof yaml.YAMLException) {
    return {
      ok: false,
      error: e.reason || e.message,
      errorPos: e.mark?.position,
    }
  }
  return { ok: false, error: e instanceof Error ? e.message : String(e) }
}

/** 美化：使用块样式（block）+ 统一缩进。
 *  schema 用 JSON_SCHEMA 避免把 YYYY-MM-DD 误解析成 Date 对象后 dump 输出 `!!timestamp` 标签。 */
export function yamlFormat(input: string, opts: { indent: number }): FormatResult {
  if (!input.trim()) return { ok: true, output: '' }
  try {
    const data = yaml.load(input, { schema: yaml.JSON_SCHEMA })
    if (data === undefined) return { ok: true, output: '' }
    const output = yaml.dump(data, {
      indent: opts.indent,
      noRefs: true,
      lineWidth: 120,
      sortKeys: false,
    })
    return { ok: true, output }
  } catch (e) {
    return mapError(e)
  }
}

/** 压缩：flow 样式（{a: 1, b: 2}）。不像 JSON 那样真的紧凑，但比 block 短很多。 */
export function yamlMinify(input: string): FormatResult {
  if (!input.trim()) return { ok: true, output: '' }
  try {
    const data = yaml.load(input, { schema: yaml.JSON_SCHEMA })
    if (data === undefined) return { ok: true, output: '' }
    const output = yaml.dump(data, {
      flowLevel: 0,
      noRefs: true,
      lineWidth: -1,
      indent: 2,
    })
    return { ok: true, output: output.replace(/\n+$/g, '') }
  } catch (e) {
    return mapError(e)
  }
}

export function yamlToJson(input: string, opts: { indent: number }): FormatResult {
  if (!input.trim()) return { ok: true, output: '' }
  try {
    const data = yaml.load(input, { schema: yaml.JSON_SCHEMA })
    return { ok: true, output: JSON.stringify(data, null, opts.indent) }
  } catch (e) {
    return mapError(e)
  }
}

export function jsonToYaml(input: string, opts: { indent: number }): FormatResult {
  if (!input.trim()) return { ok: true, output: '' }
  try {
    const data = JSON.parse(input)
    const output = yaml.dump(data, {
      indent: opts.indent,
      noRefs: true,
      lineWidth: 120,
    })
    return { ok: true, output }
  } catch (e) {
    if (e instanceof SyntaxError) {
      // JSON.parse 的错误信息里 V8 / SpiderMonkey 都会含 "position N"
      const m = /position\s+(\d+)/i.exec(e.message)
      return { ok: false, error: e.message, errorPos: m ? Number(m[1]) : undefined }
    }
    return mapError(e)
  }
}
