import type { ProjectModule } from '@/features/claude-chat/public-api'

/**
 * 新建模块会话时的「编码范围前言」：把本模块的前端/后端目录带进提示词约束改动范围。
 * 有 codePath 或 webPath 才生成；末尾留「需求：」让用户接着写。无范围信息则返回空串（不预填）。
 */
export function buildModuleScopePrompt(module: ProjectModule): string {
  const web = (module.webPath ?? '').trim()
  const code = (module.codePath ?? '').trim()
  if (!web && !code) return ''
  const lines = [`【本次工作模块：${module.name}】`]
  if (module.summary?.trim()) lines.push(module.summary.trim())
  lines.push('改动请优先落在本模块目录内：')
  if (web) lines.push(`- 前端：${web}`)
  if (code) lines.push(`- 后端：${code}`)
  lines.push('若确实需要改动这两个目录之外的类（如公共库 / 共享 / 跨模块的类），先列出涉及了哪些外部类及原因，我确认后再改——不要擅自扩大范围，也不必因此卡住。')
  lines.push('', '需求：')
  return lines.join('\n')
}

/** 在当前项目复用套件初始化规则整理业务知识。 */
export function buildProjectKnowledgePrompt(project: string, projectPath: string): string {
  return `请使用 team-standards:init-project-docs 整理「${project}」的项目知识。
目标项目为 ${projectPath}，沿用项目现有目录、文档和维护约定。
先复用已有业务文档与规格，缺失内容从定向源码和 Git 梳理。推断标待确认并保留依据。
整理简明业务概览、核心流程、术语与必要的数据范围，补一张可编辑 draw.io 全景图及同源预览。
通过项目现有文档入口链接原文，知识随项目维护。同主题只维护一份正文，跨项目引用所属项目原文。
Markdown 为正文，轻量 YAML 只记录归属与可信度。Graphify 仅在复杂关系需要时辅助。
完成后核对链接与图文一致性，说明补充内容和待确认项。`
}
