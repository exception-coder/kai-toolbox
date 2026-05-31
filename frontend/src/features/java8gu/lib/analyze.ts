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
  const paragraphs = body
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(
      p =>
        p.length > 0 &&
        !p.startsWith('#') &&
        !p.startsWith('>') &&
        !p.startsWith('-') &&
        !p.startsWith('*'),
    )
  if (paragraphs.length > 0) {
    tldr = paragraphs[0].replace(/\s+/g, ' ').slice(0, 160)
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
