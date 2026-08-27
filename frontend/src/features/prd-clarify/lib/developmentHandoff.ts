import { OPEN_SPEC_PRE_CODING_GATE } from './openSpecHandoff'

export interface DevelopmentHandoffInput {
  title: string
  sessionId: string
  content: string
  devDocContent?: string
}

const PLATFORM_CAPABILITY_RULE = '直接使用当前会话可用的项目规则、Skills、插件和工具执行。不要调用或假设存在任何特定平台的斜杠命令；若某项能力不可用，使用当前平台的等价能力完成。'

/** 生成不依赖具体 Agent 私有命令的规格开发交接。 */
export function buildDevelopmentHandoff({
  title,
  sessionId,
  content,
  devDocContent,
}: DevelopmentHandoffInput): string {
  const executionPlan = devDocContent?.trim()
  if (executionPlan) {
    return `# 规格开发交接

你正在接手《${title}》的实现任务。规格探索、代码证据核验、初始化规格确认和执行计划已经完成。

${PLATFORM_CAPABILITY_RULE}

## 当前交付状态

- 初始化规格：已确认
- 项目与代码探索：已完成，证据和坐标见执行计划
- 技术方案与执行计划：已生成
- 当前任务：进入实现、验证和质量审查

## 执行计划

${executionPlan}

---

${OPEN_SPEC_PRE_CODING_GATE}

---

## 开发要求

1. 编码前读取并遵循项目内的 AGENTS.md、编码规范及执行计划约束。
2. 以执行计划为实施基线；先核验关键代码坐标，发现事实已变化时同步修正规格或计划，不得按失效坐标盲改。
3. 按「实现步骤（有序任务清单）」逐项实施；数据库变更必须幂等，接口与数据契约必须保持兼容边界。
4. 每完成一个可验证任务项就执行相应测试或检查，并记录真实结果。
5. 优先依据规格、代码、知识图谱、DDL 和路由证据自主解决问题；只有无法消除且会改变业务结果或方案边界的阻塞项才向用户确认。
6. 完成后执行代码质量与需求符合度审查，汇总修改文件、验证结果、剩余风险和待确认事项。

PRD_SESSION_ID: ${sessionId}`
  }

  return `# 规格开发交接

你正在接手《${title}》的开发任务。初始化规格已经确认，但项目代码探索和执行计划尚未完成。

${PLATFORM_CAPABILITY_RULE}

## 当前交付状态

- 初始化规格：已确认
- 项目与代码探索：待执行
- 技术方案与执行计划：待生成
- 实现、验证与质量审查：待执行

## 核心规格

${content}

---

${OPEN_SPEC_PRE_CODING_GATE}

---

## 开发要求

1. 先读取项目内的 AGENTS.md 和相关规范，确认项目边界、编码约束与可用能力。
2. 优先使用当前 Agent 可用的项目定位、业务知识、代码图谱、DDL 和路由能力核验现有实现，避免重复建设。
3. 基于可靠证据形成技术方案和有序执行清单；无法证实的内容标记为待确定，不得编造类、字段、接口或路由。
4. 将方案按项目约定落入规格或设计文档，并完成 OpenSpec 编码前门禁后再实施。
5. 按执行清单完成实现、测试和质量审查；只有无法消除且会改变业务结果或方案边界的阻塞项才向用户确认。
6. 最终汇总修改文件、验证结果、剩余风险和待确认事项。

PRD_SESSION_ID: ${sessionId}`
}
