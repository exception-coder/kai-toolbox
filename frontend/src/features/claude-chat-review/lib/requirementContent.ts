/** 结构化字段仍使用既有正文存储；历史原文与来源不被解析结果覆盖。 */
export interface RequirementContent { kind: string; problem: string; expected: string; acceptance: string }
function section(content: string, names: string[]) {
  const pieces = content.split(/^#{1,4}\s+(.+)\s*$/m)
  for (let index = 1; index < pieces.length; index += 2) {
    if (names.includes(pieces[index].trim())) return pieces[index + 1]?.trim() ?? ''
  }
  return ''
}
export function parseRequirementContent(content: string, source = ''): RequirementContent {
  return {
    kind: section(content, ['类型']) || '需求',
    problem: section(content, ['问题', '问题结论', '理解校对']) || source || content,
    expected: section(content, ['预期行为', '修改建议', '需求说明']),
    acceptance: section(content, ['验收标准', '验收场景']),
  }
}
export function writeRequirementContent(fields: RequirementContent) {
  return `## 类型\n${fields.kind}\n\n## 问题\n${fields.problem.trim()}\n\n## 预期行为\n${fields.expected.trim()}\n\n## 验收标准\n${fields.acceptance.trim()}`
}
