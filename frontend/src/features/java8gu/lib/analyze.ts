// 浏览器端 markdown 元数据提取 —— 与 scripts/build-java8gu-index.mjs 的 analyze() 1:1 对齐。
// 数据源切到 GitHub 后这块逻辑必须在浏览器跑，任何字段口径变化要同步改 build 脚本。

import type { Java8guHeading } from '../types'

export interface QuestionAnalysis {
  title: string
  tldr: string
  chars: number
  words: number
  readMin: number
  headings: Java8guHeading[]
  codeCount: number
  codeLangs: string[]
  hasTable: boolean
  hasImage: boolean
  difficulty: number
  difficultyScore: number
}

export function analyzeMarkdown(raw: string): QuestionAnalysis {
  const lines = raw.split(/\r?\n/)

  let title = ''
  for (const line of lines) {
    const m = line.match(/^#\s+(.+?)\s*$/)
    if (m) {
      title = m[1].replace(/^[✅✓✔️]\s*/, '').trim()
      break
    }
  }

  const codeFenceRe = /```[\s\S]*?```/g
  const stripped = raw
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(codeFenceRe, '')
    .replace(/`[^`\n]*`/g, '')

  const codeBlocks = [...raw.matchAll(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g)]
  const codeLangSet = new Set<string>()
  let codeCount = 0
  for (const b of codeBlocks) {
    const lang = (b[1] || '').toLowerCase()
    if (lang === 'mermaid') continue
    codeCount++
    if (lang) codeLangSet.add(lang)
  }

  const hasTable = /^\|.+\|.+\|/m.test(raw) && /\|[-:|\s]+\|/m.test(raw)
  const hasImage = /!\[[^\]]*\]\([^)]+\)/.test(raw)

  const headings: Java8guHeading[] = []
  for (const line of lines) {
    const m = line.match(/^(#{2,4})\s+(.+?)\s*$/)
    if (m) headings.push({ level: m[1].length, text: m[2].trim() })
  }

  let tldr = ''
  const startIdx = stripped.search(/^##\s+(典型回答|核心要点|答案|回答)/m)
  const body = startIdx >= 0 ? stripped.slice(startIdx) : stripped
  const blocks = body
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
  // 优先纯文字段落（非标题/引用/列表/表格），表格只会得到一堆 | 分隔符，做预览很难看
  const prose = blocks.find(
    p =>
      !p.startsWith('#') &&
      !p.startsWith('>') &&
      !p.startsWith('-') &&
      !p.startsWith('*') &&
      !p.startsWith('|') &&
      !/^\d+\.\s/.test(p),
  )
  // 退而求其次：第一个非标题块（可能是表格/列表），压平成可读文本
  const fallback = blocks.find(p => !p.startsWith('#'))
  const chosen = prose ?? fallback ?? ''
  if (chosen) {
    tldr = toPreviewText(chosen).slice(0, 160)
  }

  const chars = stripped.replace(/\s+/g, '').length
  const words = stripped.split(/\s+/).filter(Boolean).length

  const score =
    chars * 0.0008 +
    codeCount * 1.2 +
    headings.length * 0.4 +
    (hasTable ? 0.8 : 0)
  let difficulty: number
  if (score < 1.5) difficulty = 1
  else if (score < 3.5) difficulty = 2
  else if (score < 6) difficulty = 3
  else if (score < 10) difficulty = 4
  else difficulty = 5

  return {
    title,
    tldr,
    chars,
    words,
    readMin: Math.max(1, Math.round(chars / 500)),
    headings,
    codeCount,
    codeLangs: [...codeLangSet],
    hasTable,
    hasImage,
    difficulty,
    difficultyScore: Math.round(score * 100) / 100,
  }
}

/**
 * 把一段 markdown 压成「卡片预览」用的纯文本：不渲染，只去掉语法噪声。
 * 表格展平成「单元 · 单元」、列表/标题/引用去掉行首标记、行内代码与强调去标记。
 * 卡片是 3 行 line-clamp 的小预览，渲染整张表会撑爆布局，所以这里走纯文本归一化。
 */
export function toPreviewText(md: string): string {
  let s = md
  // 代码围栏整块去掉
  s = s.replace(/```[\s\S]*?```/g, ' ')
  // 表格分隔行（|---|:--:|---）整行删除
  s = s.replace(/^[ \t]*\|?[ \t:|-]*-[ \t:|-]*\|?[ \t]*$/gm, ' ')
  // 图片 ![alt](url) -> alt
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  // 链接 [text](url) -> text
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // 行首标记：标题 / 引用 / 无序列表 / 有序列表
  s = s.replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
  s = s.replace(/^[ \t]*>[ \t]?/gm, '')
  s = s.replace(/^[ \t]*[-*+][ \t]+/gm, '')
  s = s.replace(/^[ \t]*\d+\.[ \t]+/gm, '')
  // 表格单元分隔 | -> ·
  s = s.replace(/[ \t]*\|[ \t]*/g, ' · ')
  // 行内代码 `x` -> x，强调/删除线标记去掉
  s = s.replace(/`([^`]+)`/g, '$1')
  s = s.replace(/(\*\*|__|\*|_|~~)/g, '')
  // 折叠空白
  s = s.replace(/\s+/g, ' ')
  // 折叠连续分隔符（空单元格留下的 · · ·）
  s = s.replace(/(?:·\s*){2,}/g, '· ')
  // 清掉首尾孤立分隔符与空白
  s = s.replace(/^[\s·]+|[\s·]+$/g, '')
  return s.trim()
}

export function hashHue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff
  return Math.abs(h) % 360
}

export function pickKeywordChips(titles: string[]): string[] {
  const stop = new Set([
    '的', '是', '在', '吗', '了', '和', '与', '什么', '如何', '为什么',
    '怎么', '哪些', '有', '一个', '及', '如何选择',
  ])
  const counter = new Map<string, number>()
  for (const title of titles) {
    const tokens = title
      .replace(/[\?？!。，,、:：;；()（）"“”'‘’]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
    for (const tok of tokens) {
      if (tok.length < 2 || stop.has(tok)) continue
      if (/^[a-zA-Z][a-zA-Z0-9_+#-]*$/.test(tok) || tok.length >= 2) {
        counter.set(tok, (counter.get(tok) || 0) + 1)
      }
    }
  }
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(e => e[0])
}
