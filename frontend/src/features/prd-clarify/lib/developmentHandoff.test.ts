import { describe, expect, it } from 'vitest'
import { buildDevelopmentHandoff } from './developmentHandoff'

describe('buildDevelopmentHandoff', () => {
  it('有执行计划时直接交接实现且不依赖私有斜杠命令', () => {
    const result = buildDevelopmentHandoff({
      title: '新品进度管理',
      sessionId: 'prd-1',
      content: '核心规格正文',
      devDocContent: '## 实现步骤\n\n1. 新增查询入口',
    })

    expect(result).toContain('# 规格开发交接')
    expect(result).toContain('当前任务：进入实现、验证和质量审查')
    expect(result).toContain('## 实现步骤')
    expect(result).toContain('OpenSpec 编码前门禁')
    expect(result).toContain('PRD_SESSION_ID: prd-1')
    expect(result).not.toContain('/feature-dev')
    expect(result).not.toContain('Phase 5')
  })

  it('没有执行计划时先探索和形成方案', () => {
    const result = buildDevelopmentHandoff({
      title: '新品进度管理',
      sessionId: 'prd-2',
      content: '核心规格正文',
    })

    expect(result).toContain('项目与代码探索：待执行')
    expect(result).toContain('核心规格正文')
    expect(result).toContain('业务知识、代码图谱、DDL 和路由能力')
    expect(result).toContain('只有无法消除且会改变业务结果或方案边界的阻塞项才向用户确认')
    expect(result).not.toContain('feature-dev')
  })
})
