// 把题目 markdown 解析成"结构化骨架"——给图表视图直接用
//
// 不依赖 marked AST，自己做轻量行扫描即可：八股文 markdown 形式很规整，
// 不需要解析嵌套规则。输出能驱动：
// - mind map（h1/h2/h3 三层）
// - 章节卡片（带 emoji 化的图标暗示）
// - 列表要点（每节抽前 N 条 bullet 作"知识弹幕"）
// - 代码段元数据（语言、行数、首行注释）
// - 表格元数据（行列数、表头）
// - 关键术语 chip（加粗 / 反引号包围的短语）

export interface ParsedSection {
  level: 2 | 3 | 4
  title: string
  /** 章节直接子项前 N 条要点（line < 60 char） */
  bullets: string[]
  /** 章节内代码段索引（引用 codeBlocks） */
  codeBlockIdxs: number[]
  /** 段落条数（非空白非列表非代码） */
  paragraphCount: number
}

export interface ParsedCodeBlock {
  lang: string
  lines: number
  /** 首行内容（用于侧栏快速辨识） */
  firstLine: string
  body: string
}

export interface ParsedTable {
  rows: number
  cols: number
  headers: string[]
}

export interface ParsedStructure {
  /** 一级标题（去掉 ✅） */
  title: string
  /** 顶部 ## 典型回答 之前的引文（题号 / 分类） */
  meta: string
  sections: ParsedSection[]
  codeBlocks: ParsedCodeBlock[]
  tables: ParsedTable[]
  /** 加粗 / 反引号短语去重后的术语 */
  terms: string[]
}

const FENCE_RE = /^```([a-zA-Z0-9_+-]*)\s*$/

export function parseStructure(raw: string): ParsedStructure {
  const lines = raw.split(/\r?\n/)
  const sections: ParsedSection[] = []
  const codeBlocks: ParsedCodeBlock[] = []
  const tables: ParsedTable[] = []
  const termCounter = new Map<string, number>()

  let title = ''
  let meta = ''
  let current: ParsedSection | null = null
  let inCode = false
  let codeLang = ''
  let codeBuf: string[] = []
  let tableHeader: string[] | null = null
  let tableRows = 0
  let metaStarted = false

  const pushTable = () => {
    if (tableHeader) {
      tables.push({
        headers: tableHeader,
        cols: tableHeader.length,
        rows: tableRows,
      })
    }
    tableHeader = null
    tableRows = 0
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 代码块开关
    const fence = line.match(FENCE_RE)
    if (fence) {
      if (!inCode) {
        inCode = true
        codeLang = fence[1] || ''
        codeBuf = []
      } else {
        inCode = false
        const body = codeBuf.join('\n')
        // mermaid 块在 markdown 渲染/卡片视图都不展示，直接丢弃，避免污染代码段索引
        if (codeLang.toLowerCase() !== 'mermaid') {
          const firstLine = (codeBuf[0] ?? '').trim().slice(0, 60)
          codeBlocks.push({
            lang: codeLang || 'text',
            lines: codeBuf.length,
            firstLine,
            body,
          })
          if (current) current.codeBlockIdxs.push(codeBlocks.length - 1)
        }
      }
      pushTable()
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }

    // 一级标题
    const h1 = line.match(/^#\s+(.+?)\s*$/)
    if (h1) {
      title = h1[1].replace(/^[✅✓✔️]\s*/, '').trim()
      continue
    }

    // 二/三/四级标题 → 新章节
    const h234 = line.match(/^(#{2,4})\s+(.+?)\s*$/)
    if (h234) {
      pushTable()
      const level = h234[1].length as 2 | 3 | 4
      current = {
        level,
        title: h234[2].trim(),
        bullets: [],
        codeBlockIdxs: [],
        paragraphCount: 0,
      }
      sections.push(current)
      metaStarted = true
      continue
    }

    // meta：第一段 > 引用块
    if (!metaStarted && line.startsWith('>')) {
      meta = (meta ? meta + ' ' : '') + line.replace(/^>\s*/, '')
      continue
    }
    if (line.trim() === '---') {
      metaStarted = true
      continue
    }

    // 表格头识别：行包含 | + 下一行是 |--- 形式
    if (/^\|.+\|/.test(line) && /^\|[\s-:|]+\|\s*$/.test(lines[i + 1] ?? '')) {
      pushTable()
      tableHeader = line
        .split('|')
        .map(s => s.trim())
        .filter(Boolean)
      tableRows = 0
      i++ // 跳过分隔行
      continue
    }
    if (tableHeader && /^\|.+\|/.test(line)) {
      tableRows++
      continue
    }
    if (tableHeader && line.trim() === '') {
      pushTable()
    }

    // 列表项 bullet：- / * / 1. 开头
    const bullet = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$/)
    if (bullet && current) {
      const text = stripInline(bullet[1])
      if (text.length > 1 && text.length <= 80) {
        current.bullets.push(text)
      }
      collectTerms(line, termCounter)
      continue
    }

    // 非空白普通段落
    if (line.trim() !== '') {
      if (current) current.paragraphCount++
      collectTerms(line, termCounter)
    }
  }

  pushTable()

  const terms = [...termCounter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(e => e[0])

  return { title, meta, sections, codeBlocks, tables, terms }
}

// 收集加粗 **xxx** 与行内代码 `xxx` 作为术语，长度 2-20
function collectTerms(line: string, counter: Map<string, number>) {
  const re = /\*\*([^*\n]{2,20})\*\*|`([^`\n]{2,20})`/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    const term = (m[1] ?? m[2] ?? '').trim()
    if (!term) continue
    if (/^[\d\s.,]+$/.test(term)) continue
    counter.set(term, (counter.get(term) || 0) + 1)
  }
}

function stripInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}
