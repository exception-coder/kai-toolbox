import { describe, expect, it } from 'vitest'
import { lexAndParse } from 'java-parser'
import { formatJava } from './formatJava'
import { DEFAULT_JAVA_OPTIONS, JAVA_MAX_BYTES } from './contracts'
import platformProfiles from './fixtures/platformProfiles.java.txt?raw'

describe('Java 本地格式化', () => {
  it('用户的 default 方法无需包装类，保留泛型、lambda、字面值和中文注释', async () => {
    const result = await formatJava(platformProfiles, DEFAULT_JAVA_OPTIONS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.kind).toBe('方法 / 接口成员')
    expect(result.output).not.toMatch(/class\s+\w+\s*\{/)
    const original = lexAndParse(platformProfiles, 'interfaceMemberDeclaration')
    const formatted = lexAndParse(result.output, 'interfaceMemberDeclaration')
    expect(formatted.tokens.map(token => token.image)).toEqual(original.tokens.map(token => token.image))
    for (const line of platformProfiles.split('\n').filter(line => line.trim().startsWith('//'))) {
      expect(result.output).toContain(line.trim())
    }
    expect(result.output).toContain('查询需要新增或重新激活的平台授权。')
    expect(await formatJava(result.output, DEFAULT_JAVA_OPTIONS)).toEqual(result)
  })
  it('完整文件支持嵌套泛型与字符串内的大括号和 Windows 路径', async () => {
    const result = await formatJava(String.raw`class Example{String path="C:\\Users\\name"; java.util.Map<String,java.util.List<Integer>> values; void f(){System.out.println("{ ; }");}}`, DEFAULT_JAVA_OPTIONS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.kind).toBe('完整文件')
    expect(result.output).toContain('"{ ; }"')
    expect(result.output).toContain(String.raw`C:\\Users\\name`)
  })
  it('语句或表达式直接解析，尊重用户缩进与行宽', async () => {
    const statement = await formatJava('if(ready){call();}else{stop();}', { ...DEFAULT_JAVA_OPTIONS, indent: '2', mode: 'statements' })
    expect(statement).toMatchObject({ ok: true, kind: '语句片段' })
    if (statement.ok) expect(statement.output).toContain('\n  call();')
    const expression = await formatJava('items.stream().map(item->item.getName()).collect(toList())', { ...DEFAULT_JAVA_OPTIONS, mode: 'expression' })
    expect(expression).toMatchObject({ ok: true, kind: '表达式' })
  })
  it('文本块与块注释中的代码符号不被当作语法', async () => {
    const input = 'String sample(){/* 保留 { ; } 注释 */return """\n{ code: ";" }\n""";}'
    const result = await formatJava(input, DEFAULT_JAVA_OPTIONS)
    expect(result.ok).toBe(true)
    if (result.ok) { expect(result.output).toContain('/* 保留 { ; } 注释 */'); expect(result.output).toContain('{ code: ";" }') }
  })
  it('拒绝未消费的尾部代码，定位不完整语法而不返回成功前缀', async () => {
    const result = await formatJava('void first(){call();}\nvoid second(){', { ...DEFAULT_JAVA_OPTIONS, mode: 'member' })
    expect(result.ok).toBe(false)
    if (!result.ok) { expect(result.error).toContain('第 2 行'); expect(result.position).toBeGreaterThanOrEqual(21) }
    const incomplete = 'default int example('
    expect(await formatJava(incomplete, DEFAULT_JAVA_OPTIONS)).toMatchObject({ ok: false, position: incomplete.length, error: expect.stringContaining('第 21 列') })
  })
  it('空输入、超限代码和无效选项提供可恢复失败', async () => {
    expect(await formatJava(' ', DEFAULT_JAVA_OPTIONS)).toMatchObject({ ok: false })
    expect(await formatJava('x'.repeat(JAVA_MAX_BYTES + 1), DEFAULT_JAVA_OPTIONS)).toMatchObject({ ok: false, error: expect.stringContaining('256 KB') })
    expect(await formatJava('call()', { ...DEFAULT_JAVA_OPTIONS, printWidth: 1 })).toMatchObject({ ok: false })
  })
})
