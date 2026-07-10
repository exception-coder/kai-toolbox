// Block 1+2：把一道八股题从「一段 markdown」升级成「结构化知识对象」。
//
// 设计要点（对齐专家评审）：
// - markdown 只是**来源**，不是页面。页面渲染 KnowledgePage 的各个 typed 字段。
// - 本层是**确定性解析**（无 LLM）：能从 markdown 里拆出来的，就地拆出来；
//   拆不出来的（如 mermaid 图解 / 结构化面试问答 / 深度讲解）留空，交给 Block 3 的 AI 补全。
// - 复用 structure.ts 的行扫描骨架；额外把此前被丢弃的 ```mermaid 围栏抽进 diagrams[]，
//   这是「左文右图」得以成立的关键数据。
//
// 后续 PC / 手机 / 导出 / AI 问答都消费同一个 KnowledgePage，不再各自 re-parse markdown。

import { analyzeMarkdown } from './analyze'
import { groupSections, parseStructure, type SectionGroup } from './structure'

/** 一个知识概念块（对应一个 ## 章节：标题 + 要点 + 关联代码） */
export interface KnowledgeConcept {
  title: string
  /** 该章节（含其 ### 子节）的要点，已去内联语法 */
  points: string[]
  /** 关联的代码段下标（指向 KnowledgePage.code） */
  codeIdxs: number[]
}

/** 一段代码示例 */
export interface KnowledgeCode {
  lang: string
  body: string
  lines: number
  firstLine: string
}

/** 一个图解（当前只有 mermaid，一种"来源"；AI 补全的图也落在这里） */
export interface KnowledgeDiagram {
  kind: 'mermaid'
  code: string
  /** 来源：markdown 原生 / AI 生成 */
  source: KnowledgeSource
}

/** 一条面试问答（markdown 通常没有结构化 Q/A，故此字段主要由 AI 补全） */
export interface KnowledgeQA {
  q: string
  a: string
}

/** 一条外部引用 */
export interface KnowledgeRef {
  text: string
  url: string
}

export type KnowledgeSource = 'markdown' | 'ai'

/** 哪些字段被 AI 补全过（其余均来自 markdown 确定性解析） */
export interface EnrichedFlags {
  diagrams?: boolean
  qa?: boolean
  pitfalls?: boolean
  explanation?: boolean
}

/**
 * 一道八股题的结构化知识对象。这是 UI 的唯一数据契约。
 * markdown 是产生它的一种来源；未来也可来自 AI / 手工编辑 / 其它导入。
 */
export interface KnowledgePage {
  id: string
  title: string
  /** 一句话总结（最高优先级，与索引卡片的 tldr 同源） */
  summary: string
  /** 顶层核心速记点（"速记 / 核心要点"章节，或首个概念块的前几条） */
  keyPoints: string[]
  /** 章节化知识块 */
  concepts: KnowledgeConcept[]
  code: KnowledgeCode[]
  diagrams: KnowledgeDiagram[]
  qa: KnowledgeQA[]
  pitfalls: string[]
  keywords: string[]
  references: KnowledgeRef[]
  /** AI 深度讲解（Block 3 补全；markdown 无此字段） */
  explanation?: string
  /** 各字段是否来自 AI 补全 */
  enriched: EnrichedFlags
}

// ── 章节标题语义分类 ──
const PITFALL_TITLE_RE = /(易错|坑|陷阱|注意事项|误区|风险|避免)/
const SUMMARY_TITLE_RE = /(速记|核心要点|一句话|典型回答|结论|要点)/
const MERMAID_FENCE_RE = /^```mermaid\s*$/i
const FENCE_END_RE = /^```\s*$/
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g

/**
 * 把题目 markdown 解析为结构化 KnowledgePage（确定性，无 LLM）。
 * @param id 题号（用于回填 KnowledgePage.id）
 * @param md 题目 markdown 原文
 */
export function parseKnowledge(id: string, md: string): KnowledgePage {
  const structure = parseStructure(md)
  const groups = groupSections(structure.sections)

  const code: KnowledgeCode[] = structure.codeBlocks.map(cb => ({
    lang: cb.lang,
    body: cb.body,
    lines: cb.lines,
    firstLine: cb.firstLine,
  }))

  const concepts: KnowledgeConcept[] = []
  const pitfalls: string[] = []
  let keyPoints: string[] = []

  for (const g of groups) {
    const title = g.head.title
    const bullets = collectGroupBullets(g)

    // 易错/坑/注意事项 → 单独成 pitfalls，便于 UI 高亮
    if (PITFALL_TITLE_RE.test(title)) {
      pitfalls.push(...bullets)
      continue
    }

    // 速记 / 核心要点 → 作为顶层 keyPoints（取该章节直接要点，保持"第几条"顺序）
    if (!keyPoints.length && SUMMARY_TITLE_RE.test(title) && g.head.bullets.length > 0) {
      keyPoints = g.head.bullets
    }

    concepts.push({
      title,
      points: bullets,
      codeIdxs: g.head.codeBlockIdxs,
    })
  }

  // 没有显式"速记"章节时，用首个概念块的前几条兜底做速记点（不从 concepts 删，避免丢内容）
  if (!keyPoints.length && concepts.length > 0) {
    keyPoints = concepts[0].points.slice(0, 8)
  }

  return {
    id,
    title: structure.title,
    summary: analyzeMarkdown(md).tldr,
    keyPoints,
    concepts,
    code,
    diagrams: extractMermaid(md),
    qa: [], // markdown 无结构化问答，交给 Block 3 AI 补全
    pitfalls,
    keywords: structure.terms,
    references: extractLinks(md),
    enriched: {},
  }
}

/** 收集一个 ## 组（含其 ### 子节）的全部要点 */
function collectGroupBullets(g: SectionGroup): string[] {
  const out = [...g.head.bullets]
  for (const child of g.children) out.push(...child.bullets)
  return out
}

/** 从 markdown 抽取 ```mermaid 围栏为图解（此前 structure.ts 会丢弃它们） */
function extractMermaid(md: string): KnowledgeDiagram[] {
  const lines = md.split(/\r?\n/)
  const diagrams: KnowledgeDiagram[] = []
  let inMermaid = false
  let buf: string[] = []
  for (const line of lines) {
    if (!inMermaid && MERMAID_FENCE_RE.test(line)) {
      inMermaid = true
      buf = []
      continue
    }
    if (inMermaid && FENCE_END_RE.test(line)) {
      inMermaid = false
      const code = buf.join('\n').trim()
      if (code) diagrams.push({ kind: 'mermaid', code, source: 'markdown' })
      continue
    }
    if (inMermaid) buf.push(line)
  }
  return diagrams
}

/** 抽取 markdown 里的外部链接为参考资料（去重） */
function extractLinks(md: string): KnowledgeRef[] {
  const seen = new Set<string>()
  const refs: KnowledgeRef[] = []
  let m: RegExpExecArray | null
  LINK_RE.lastIndex = 0
  while ((m = LINK_RE.exec(md))) {
    const url = m[2]
    if (seen.has(url)) continue
    seen.add(url)
    refs.push({ text: m[1].trim(), url })
  }
  return refs
}

/**
 * 把 AI 补全结果合并进一个已解析的 KnowledgePage：仅填充空字段，绝不覆盖 markdown 原生内容。
 * 用于 Block 3——补全是"锦上添花"，markdown 永远是权威来源。
 */
export function mergeEnrichment(
  base: KnowledgePage,
  enrich: {
    diagrams?: KnowledgeDiagram[]
    qa?: KnowledgeQA[]
    pitfalls?: string[]
    explanation?: string
  },
): KnowledgePage {
  const merged: KnowledgePage = { ...base, enriched: { ...base.enriched } }

  if (base.diagrams.length === 0 && enrich.diagrams?.length) {
    merged.diagrams = enrich.diagrams.map(d => ({ ...d, source: 'ai' as const }))
    merged.enriched.diagrams = true
  }
  if (base.qa.length === 0 && enrich.qa?.length) {
    merged.qa = enrich.qa
    merged.enriched.qa = true
  }
  if (base.pitfalls.length === 0 && enrich.pitfalls?.length) {
    merged.pitfalls = enrich.pitfalls
    merged.enriched.pitfalls = true
  }
  if (!base.explanation && enrich.explanation) {
    merged.explanation = enrich.explanation
    merged.enriched.explanation = true
  }
  return merged
}
