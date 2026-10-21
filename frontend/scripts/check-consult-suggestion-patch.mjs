import ts from 'typescript'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// 只有现有展示文字/样式可变化；不向概率模型授予修改程序结构的能力。
export function maskPresentation(source) {
  source = source.replace(/\r\n/g, '\n')
  const file = ts.createSourceFile('component.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  if (file.parseDiagnostics.length) throw new Error('补丁语法无效')
  const spans = []
  const attributes = new Set(['className', 'title', 'aria-label', 'placeholder', 'alt'])
  function visit(node) {
    const attribute = ts.isStringLiteral(node) && ts.isJsxAttribute(node.parent) && attributes.has(node.parent.name.getText(file))
    const style = ts.isStringLiteral(node) && ts.isVariableDeclaration(node.parent) && node.parent.name.getText(file) === 'buttonClass'
    if (ts.isJsxText(node) || attribute || style) spans.push([node.getStart(file), node.end])
    else ts.forEachChild(node, visit)
  }
  visit(file)
  let masked = source
  for (const [start, end] of spans.sort((a, b) => b[0] - a[0])) masked = masked.slice(0, start) + '__PRESENTATION__' + masked.slice(end)
  return masked
}

if (process.argv[1]?.endsWith('check-consult-suggestion-patch.mjs')) {
  try {
    for (const path of process.argv.slice(2)) {
      if (!/^src\/features\/fore-consult\/components\/[A-Za-z]+\.tsx$/.test(path)) throw new Error('文件范围无效')
      const before = execFileSync('git', ['show', `HEAD:frontend/${path}`], { encoding: 'utf8' })
      const after = readFileSync(path, 'utf8')
      if (maskPresentation(before) !== maskPresentation(after)) throw new Error('自动开发只允许现有展示内容变化，程序结构变化需要人工接续')
    }
    console.log('consult presentation scope: PASSED')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
