// 索引脚本：扫描 java8gu 题库，产出前端用的静态 JSON + 原始 markdown 拷贝
//
// 输入：源目录默认 D:\Users\zhang\IdeaProjects\job-interview-log\java8gu-速记版（速记/精简版），
//      要切回完整版可设环境变量 JAVA8GU_DIR=...\java8gu
// 输出：
//   public/java8gu/index.json       — 全量题目轻量索引（不含正文）
//   public/java8gu/q/{id}.md        — 每题速记 markdown
//
// 用法：npm run java8gu:sync

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = path.resolve(__dirname, '..')
const DEFAULT_SRC = 'D:\\Users\\zhang\\IdeaProjects\\job-interview-log\\java8gu-速记版'
const SRC_DIR = process.env.JAVA8GU_DIR || DEFAULT_SRC
const OUT_DIR = path.join(FRONTEND_ROOT, 'public', 'java8gu')
const OUT_QUESTIONS_DIR = path.join(OUT_DIR, 'q')

const CATEGORY_PATTERN = /^\d{2}_/
const QUESTION_FILE_PATTERN = /^(\d{4})_(.+)\.md$/

async function main() {
  console.log(`[java8gu] source: ${SRC_DIR}`)
  console.log(`[java8gu] target: ${OUT_DIR}`)

  await fs.rm(OUT_DIR, { recursive: true, force: true })
  await fs.mkdir(OUT_QUESTIONS_DIR, { recursive: true })

  const entries = await fs.readdir(SRC_DIR, { withFileTypes: true })
  const categoryDirs = entries
    .filter(e => e.isDirectory() && CATEGORY_PATTERN.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  const categories = []
  const allQuestions = []

  for (const dir of categoryDirs) {
    const catId = dir.name
    const catLabel = dir.name.replace(CATEGORY_PATTERN, '')
    const catPath = path.join(SRC_DIR, catId)
    const files = (await fs.readdir(catPath))
      .filter(name => QUESTION_FILE_PATTERN.test(name))
      .sort((a, b) => a.localeCompare(b))

    const questions = []
    for (const file of files) {
      const m = file.match(QUESTION_FILE_PATTERN)
      if (!m) continue
      const id = m[1]
      const filePath = path.join(catPath, file)
      const raw = await fs.readFile(filePath, 'utf8')
      const meta = analyze(raw)
      const q = {
        id,
        categoryId: catId,
        title: meta.title || m[2].replace(/_/g, ' '),
        tldr: meta.tldr,
        chars: meta.chars,
        words: meta.words,
        readMin: Math.max(1, Math.round(meta.chars / 500)),
        headings: meta.headings,
        codeCount: meta.codeCount,
        codeLangs: meta.codeLangs,
        hasTable: meta.hasTable,
        hasImage: meta.hasImage,
        difficulty: meta.difficulty,
        difficultyScore: meta.difficultyScore,
        sourceFile: `${catId}/${file}`,
      }
      questions.push(q)
      allQuestions.push(q)

      // 拷贝 markdown 到 public/java8gu/q/{id}.md
      await fs.writeFile(path.join(OUT_QUESTIONS_DIR, `${id}.md`), raw, 'utf8')
    }

    // 难度分布（1-5 桶）
    const dist = [0, 0, 0, 0, 0]
    for (const q of questions) dist[q.difficulty - 1]++

    categories.push({
      id: catId,
      label: catLabel,
      count: questions.length,
      difficultyDist: dist,
      // 类目代表色（HSL hue），按 id 数字稳定生成
      hue: hashHue(catId),
      // 类目简介：从分类下若干个题挑“浅 / 高频”的语义关键词作 chip
      keywordChips: pickKeywordChips(questions),
    })

    console.log(`[java8gu] ${catId} -> ${questions.length} questions`)
  }

  const index = {
    generatedAt: new Date().toISOString(),
    totalQuestions: allQuestions.length,
    categories,
    questions: allQuestions,
  }

  await fs.writeFile(
    path.join(OUT_DIR, 'index.json'),
    JSON.stringify(index),
    'utf8',
  )

  console.log(
    `[java8gu] done: ${categories.length} categories, ${allQuestions.length} questions`,
  )
}

// 提取一条题目的可视化元数据
function analyze(raw) {
  const lines = raw.split(/\r?\n/)
  let title = ''
  // 标题：第一行 # xxx，去掉 ✅ 前缀
  for (const line of lines) {
    const m = line.match(/^#\s+(.+?)\s*$/)
    if (m) {
      title = m[1].replace(/^[✅✓✔️]\s*/, '').trim()
      break
    }
  }

  // 去掉 frontmatter / 题号块、代码块、链接、图片，仅留正文用于 TL;DR & 字数估算
  const codeFenceRe = /```[\s\S]*?```/g
  const stripped = raw
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(codeFenceRe, '')
    .replace(/`[^`\n]*`/g, '')

  // 代码块统计（mermaid 块不计入代码段，也不再单独标记）
  const codeBlocks = [...raw.matchAll(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g)]
  const codeLangSet = new Set()
  let codeCount = 0
  for (const b of codeBlocks) {
    const lang = (b[1] || '').toLowerCase()
    if (lang === 'mermaid') continue
    codeCount++
    if (lang) codeLangSet.add(lang)
  }

  // 表格 / 图片
  const hasTable = /^\|.+\|.+\|/m.test(raw) && /\|[-:|\s]+\|/m.test(raw)
  const hasImage = /!\[[^\]]*\]\([^)]+\)/.test(raw)

  // 章节
  const headings = []
  for (const line of lines) {
    const m = line.match(/^(#{2,4})\s+(.+?)\s*$/)
    if (m) headings.push({ level: m[1].length, text: m[2].trim() })
  }

  const tldr = extractReadableSummary(raw, title, 160)

  // 字数 / 字符数：粗略统计（按中文字符数估算）
  const chars = stripped.replace(/\s+/g, '').length
  const words = stripped.split(/\s+/).filter(Boolean).length

  // 难度评分：长度 + 代码块 + 章节数 + 表格
  const score =
    chars * 0.0008 +
    codeCount * 1.2 +
    headings.length * 0.4 +
    (hasTable ? 0.8 : 0)
  let difficulty
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
    headings,
    codeCount,
    codeLangs: [...codeLangSet],
    hasTable,
    hasImage,
    difficulty,
    difficultyScore: Math.round(score * 100) / 100,
  }
}

function extractReadableSummary(raw, title = '', limit = 160) {
  const withoutCode = raw.replace(/```[\s\S]*?```/g, '')
  const lines = withoutCode.split(/\r?\n/)
  const candidates = []
  let tableFallback = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    if (isTableHeader(lines, i)) {
      tableFallback ||= describeTable(lines, i)
      while (i + 1 < lines.length && isTableRow(lines[i + 1])) i++
      continue
    }
    if (
      /^#{1,6}\s/.test(line) ||
      /^(?:---+|\*\*\*+|___+)$/.test(line) ||
      /^>\s*(?:题号|分类|来源)\s*[:：｜|]/.test(line) ||
      isTableRow(line)
    ) {
      continue
    }

    const preview = toPreviewText(line)
    if (!isMeaningfulPreview(preview, title)) continue
    candidates.push(preview)
  }

  return truncatePreview(buildSummaryText(candidates) || tableFallback || toPreviewText(title), limit)
}

function toPreviewText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^[ \t]*\|?[ \t:|-]*-[ \t:|-]*\|?[ \t]*$/gm, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '')
    .replace(/^[ \t]*\d+\.[ \t]+/gm, '')
    .replace(/[ \t]*\|[ \t]*/g, ' · ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/(?:·\s*){2,}/g, '· ')
    .replace(/^[\s·]+|[\s·]+$/g, '')
    .trim()
}

function isMeaningfulPreview(text, title) {
  if (text.length < 4) return false
  if (/^(?:优点|缺点|总结|注意|具体来说)[：:]?$/.test(text)) return false
  if (/^(?:题号|分类|来源|更新时间|更新内容)[：:｜|]/.test(text)) return false
  const normalize = value => value.replace(/^[✅✓✔️\s]+/, '').replace(/[？?。\s]/g, '')
  return normalize(text) !== normalize(title)
}

function isTableHeader(lines, index) {
  return index + 1 < lines.length && isTableRow(lines[index]) && isTableSeparator(lines[index + 1])
}

function isTableRow(line) {
  const trimmed = line.trim()
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 3
}

function isTableSeparator(line) {
  if (!isTableRow(line)) return false
  return splitTableRow(line).every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))
}

function splitTableRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(cell => toPreviewText(cell))
}

function describeTable(lines, headerIndex) {
  const headers = splitTableRow(lines[headerIndex])
  for (let i = headerIndex + 2; i < lines.length && isTableRow(lines[i]); i++) {
    const cells = splitTableRow(lines[i])
    if (!cells.some(Boolean)) continue
    const label = cells[0]
    const details = cells.slice(1).flatMap((cell, column) => {
      if (!cell) return []
      const header = headers[column + 1]
      return [header ? `${header}：${cell}` : cell]
    })
    if (label && details.length) return `${label}：${details.join('；')}`
    if (details.length) return details.join('；')
  }
  return ''
}

function truncatePreview(text, limit) {
  if (text.length <= limit) return text
  const window = text.slice(0, limit + 1)
  const boundary = Math.max(...['。', '！', '？', '；'].map(mark => window.lastIndexOf(mark)))
  if (boundary >= Math.floor(limit / 2)) return window.slice(0, boundary + 1)
  return `${text.slice(0, limit - 1).replace(/[，,、；;：:\s]+$/, '')}…`
}

function buildSummaryText(candidates) {
  const leadingFragments = []
  for (const candidate of candidates) {
    if (isFragment(candidate)) {
      leadingFragments.push(candidate.replace(/[：:]$/, ''))
      continue
    }
    if (leadingFragments.length >= 2) {
      return `${leadingFragments.slice(0, 6).join('、')}；${candidate}`
    }
    return candidate
  }
  return leadingFragments.slice(0, 8).join('、')
}

function isFragment(text) {
  return text.length < 12 && !/[。！？!?；;，,]/.test(text)
}

function hashHue(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff
  return Math.abs(h) % 360
}

// 简易：取分类下题目的标题里出现次数最多的 2-4 个关键词
function pickKeywordChips(questions) {
  const stop = new Set([
    '的', '是', '在', '吗', '了', '和', '与', '什么', '如何', '为什么', '怎么', '哪些', '有', '一个', '及', '如何选择',
  ])
  const counter = new Map()
  for (const q of questions) {
    const t = q.title
    // 简单切分（中文逐字 + 英文按空格 / 分隔符）
    const tokens = t
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

main().catch(e => {
  console.error(e)
  process.exit(1)
})
