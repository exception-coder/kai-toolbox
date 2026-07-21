// 会话导出：PDF 走「html-to-image 截图 → jsPDF 按 A4 分页」（与其它 feature 的导出思路一致，
// 各 feature 各自实现，不跨 feature 引用）；Word 走 docx 库直接从消息数据构建结构化文档
// （标题/段落/加粗/代码块/图片），比截图更适合「领导打开能直接读」的场景。
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from 'docx'
import type { ChatItem, MsgAttachment } from '../types'

export type ExportableItem = Extract<ChatItem, { kind: 'user' | 'assistant' }>

/** 只保留用户提问与 assistant 回复（含图片），过滤掉工具调用/系统状态/错误等内部过程——
 *  发给非技术同事/领导看的是"问了什么、AI 回了什么"，不是工具调用细节。 */
export function filterExportableItems(items: ChatItem[]): ExportableItem[] {
  return items.filter((it): it is ExportableItem => it.kind === 'user' || it.kind === 'assistant')
}

export function buildExportFilename(title: string, ext: 'pdf' | 'docx'): string {
  const base = (title || 'session').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`
  return `${base}-${ts}.${ext}`
}

function formatTs(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// ── PDF：截图打印视图节点，按 A4 分页 ──────────────────────────────────────────

async function waitFontsReady(): Promise<void> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try { await document.fonts.ready } catch { /* 忽略 */ }
  }
}

async function waitImagesLoaded(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll('img'))
  await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => {
    img.addEventListener('load', () => resolve(), { once: true })
    img.addEventListener('error', () => resolve(), { once: true })
  })))
}

/** mermaid 图表异步渲染：轮询直到打印视图里没有「生成图表中…」占位符，超时兜底避免卡死导出。 */
async function waitMermaidRendered(container: HTMLElement, timeoutMs = 4000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (!container.textContent?.includes('生成图表中…')) return
    await new Promise(r => setTimeout(r, 150))
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('截图加载失败'))
    img.src = src
  })
}

/** 打印视图节点已渲染完成（图片/mermaid 均就绪）后，截图并按 A4 分页导出 PDF。 */
export async function exportSessionAsPdf(node: HTMLElement, filename: string): Promise<void> {
  await waitFontsReady()
  await waitImagesLoaded(node)
  await waitMermaidRendered(node)

  const width = node.scrollWidth
  const height = node.scrollHeight
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    width,
    height,
    canvasWidth: width,
    canvasHeight: height,
    backgroundColor: '#ffffff',
  })

  const img = await loadImage(dataUrl)
  const PAGE_W_MM = 210
  const PAGE_H_MM = 297
  const totalHeightMm = (img.naturalHeight / img.naturalWidth) * PAGE_W_MM
  const pageCount = Math.max(1, Math.ceil(totalHeightMm / PAGE_H_MM))

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  for (let i = 0; i < pageCount; i++) {
    if (i > 0) doc.addPage()
    // 同一张完整截图，每页用负 y 偏移把对应段落顶进可视区，超出页面部分被 jsPDF 自动裁掉
    doc.addImage(dataUrl, 'PNG', 0, -(i * PAGE_H_MM), PAGE_W_MM, totalHeightMm, undefined, 'FAST')
  }
  triggerDownload(doc.output('blob'), filename)
}

// ── Word：docx 库直接从消息数据构建结构化文档 ─────────────────────────────────

const IMAGE_TYPE_MAP: Record<string, 'png' | 'jpg' | 'gif' | 'bmp'> = {
  png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', bmp: 'bmp',
}

function docxImageType(mime?: string): 'png' | 'jpg' | 'gif' | 'bmp' | null {
  const sub = mime?.split('/')[1]?.toLowerCase()
  return sub ? IMAGE_TYPE_MAP[sub] ?? null : null
}

function loadImageDims(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 480, height: img.naturalHeight || 320 })
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

/** 附件转 docx 图片段落；不支持的格式（如 webp/svg）或加载失败时返回 null，调用方降级为文字提示。 */
async function attachmentToImageRun(a: MsgAttachment): Promise<ImageRun | null> {
  if (!a.url) return null
  const type = docxImageType(a.mime)
  if (!type) return null
  try {
    const [res, dims] = await Promise.all([fetch(a.url), loadImageDims(a.url)])
    const buf = new Uint8Array(await res.arrayBuffer())
    const maxW = 480
    const scale = dims.width > maxW ? maxW / dims.width : 1
    return new ImageRun({
      type,
      data: buf,
      transformation: { width: Math.round(dims.width * scale), height: Math.round(dims.height * scale) },
    })
  } catch {
    return null
  }
}

const HEADING_BY_LEVEL = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4] as const

function inlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push(new TextRun(text.slice(last, m.index)))
    const token = m[0]
    if (token.startsWith('**')) runs.push(new TextRun({ text: token.slice(2, -2), bold: true }))
    else runs.push(new TextRun({ text: token.slice(1, -1), font: 'Consolas' }))
    last = m.index + token.length
  }
  if (last < text.length) runs.push(new TextRun(text.slice(last)))
  return runs.length ? runs : [new TextRun(text)]
}

/** 极简 markdown → docx 段落：标题(#) / 列表(-*) / 代码块(```) / **加粗** / `行内代码`，
 *  其余按普通段落输出。目标是「打开就能读的文档」，不追求 markdown 语法的完整还原。 */
function markdownToParagraphs(md: string): Paragraph[] {
  const lines = (md ?? '').split(/\r?\n/)
  const paras: Paragraph[] = []
  let codeBuf: string[] | null = null

  const flushCode = () => {
    if (codeBuf && codeBuf.length) {
      paras.push(new Paragraph({
        children: [new TextRun({ text: codeBuf.join('\n'), font: 'Consolas', size: 18 })],
        shading: { fill: 'F2F2F2' },
        spacing: { before: 80, after: 120 },
      }))
    }
    codeBuf = null
  }

  for (const line of lines) {
    if (/^```/.test(line)) {
      if (codeBuf === null) codeBuf = []
      else flushCode()
      continue
    }
    if (codeBuf !== null) { codeBuf.push(line); continue }

    const h = line.match(/^(#{1,4})\s+(.*)/)
    if (h) {
      paras.push(new Paragraph({ children: inlineRuns(h[2]), heading: HEADING_BY_LEVEL[h[1].length] ?? undefined }))
      continue
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)/)
    if (bullet) {
      paras.push(new Paragraph({ children: inlineRuns(bullet[1]), bullet: { level: 0 } }))
      continue
    }
    if (!line.trim()) continue
    paras.push(new Paragraph({ children: inlineRuns(line), spacing: { after: 120 } }))
  }
  flushCode()
  return paras.length ? paras : [new Paragraph({ text: '' })]
}

/** 直接从消息数据构建 .docx（不依赖截图/DOM），异步是因为要逐张 fetch 图片字节。 */
export async function exportSessionAsDocx(items: ExportableItem[], sessionTitle: string, filename: string): Promise<void> {
  const children: Paragraph[] = []
  children.push(new Paragraph({ text: sessionTitle || 'Vibe Coding 会话记录', heading: HeadingLevel.TITLE }))
  children.push(new Paragraph({
    children: [new TextRun({ text: `导出时间：${new Date().toLocaleString('zh-CN')}`, italics: true, color: '888888', size: 18 })],
    spacing: { after: 240 },
  }))

  for (const item of items) {
    if (item.kind === 'user') {
      const text = item.displayText ?? item.text
      children.push(new Paragraph({
        children: [new TextRun({ text: `用户 ${formatTs(item.ts)}`, bold: true, color: '2563EB' })],
        spacing: { before: 200, after: 60 },
      }))
      if (text.trim()) {
        children.push(new Paragraph({ children: [new TextRun(text)], spacing: { after: 100 } }))
      }
      const attachments = item.attachments ?? []
      for (const a of attachments.filter(x => x.mime?.startsWith('image/'))) {
        const run = await attachmentToImageRun(a)
        children.push(run
          ? new Paragraph({ children: [run], spacing: { after: 120 } })
          : new Paragraph({ children: [new TextRun({ text: `[图片：${a.name}，此格式未能嵌入，可从 PDF 导出查看]`, italics: true, color: '999999' })] }))
      }
      for (const a of attachments.filter(x => !x.mime?.startsWith('image/'))) {
        children.push(new Paragraph({ children: [new TextRun({ text: `📎 ${a.name}`, italics: true, color: '999999' })] }))
      }
    } else {
      children.push(new Paragraph({
        children: [new TextRun({ text: `Claude ${formatTs(item.ts)}`, bold: true, color: '15803D' })],
        spacing: { before: 200, after: 60 },
      }))
      children.push(...markdownToParagraphs(item.text))
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] })
  const blob = await Packer.toBlob(doc)
  triggerDownload(blob, filename)
}
