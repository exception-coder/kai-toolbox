import type { PrdSessionView } from '../types'

/** Vibe Coding 在进入实现前必须完成的 OpenSpec 同步门禁。 */
export const OPEN_SPEC_PRE_CODING_GATE = `## OpenSpec 编码前门禁（必须执行）
1. 先执行 \`openspec context --json\`，确认当前工作目录解析到 OpenSpec root。
2. 优先调用当前 Agent 已安装的 OpenSpec command / plugin；否则使用 OpenSpec CLI，为本需求创建或更新 change，并把上方核心规格与执行计划的稳定 ID 映射进 proposal、specs、design、tasks。
3. 执行 \`openspec validate <change-id>\`。在校验通过前不得进入编码阶段。
4. 回复中明确给出 OpenSpec change id、产物路径和校验结果。
5. 平台会在发送本任务前检测并在用户确认后初始化 OpenSpec；若运行时仍没有 root、工具不可用或同步失败，明确报告阻塞原因并停在编码前，不得自行静默初始化或声称已同步后继续实现。`

/** 手工把既有 Vibe Coding 会话关联到 PRD 时，触发一次显式规格同步。 */
export function buildOpenSpecLinkSyncPrompt(session: PrdSessionView): string {
  const artifacts = [
    session.mdPath ? `核心规格：${session.mdPath}` : null,
    session.devDocPath ? `TDD / 执行计划：${session.devDocPath}` : null,
    session.initialSpecPath ? `初始化规格：${session.initialSpecPath}` : null,
  ].filter(Boolean).join('\n')

  return `当前 Vibe Coding 会话刚关联到规格《${session.title}》（PRD_SESSION_ID: ${session.id}）。

${artifacts || '请通过 PRD_SESSION_ID 获取关联规格内容。'}

${OPEN_SPEC_PRE_CODING_GATE}

本条任务只负责把最新规格同步进 OpenSpec 并报告结果；完成门禁前不要开始或继续编码。`
}
