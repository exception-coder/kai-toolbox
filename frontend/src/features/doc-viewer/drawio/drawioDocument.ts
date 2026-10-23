const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_EXPANDED_BYTES = 20 * 1024 * 1024
const MAX_CELLS = 20_000
const MAX_PAGES = 100

export interface DrawioPage { id: string; name: string; xml: string }

export function isDrawioFile(name: string | null): boolean {
  return /\.drawio(?:\.xml)?$/i.test(name ?? '')
}

function parseXml(xml: string): XMLDocument {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('图文件包含不支持的 XML 声明，请在 draw.io 中重新保存。')
  const parsed = new DOMParser().parseFromString(xml, 'application/xml')
  if (parsed.querySelector('parsererror')) throw new Error('图文件 XML 已损坏，请检查源码或重新导出。')
  return parsed
}

async function inflatePage(encoded: string): Promise<string> {
  let bytes: Uint8Array
  try { bytes = Uint8Array.from(atob(encoded.replace(/\s/g, '')), char => char.charCodeAt(0)) }
  catch { throw new Error('图页面压缩数据已损坏，请重新导出。') }
  if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持解压图文件，请升级浏览器或导出未压缩的 draw.io XML。')
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_EXPANDED_BYTES) {
        await reader.cancel()
        throw new Error('图页面解压后超过 20 MiB，请拆分后打开。')
      }
      chunks.push(value)
    }
    return decodeURIComponent(await new Blob(chunks as BlobPart[]).text())
  } catch (error) {
    if (error instanceof Error && error.message.includes('20 MiB')) throw error
    throw new Error('图页面解压失败，请重新导出未压缩的 draw.io XML。')
  } finally { reader.releaseLock() }
}

/** Bound decompression before passing untrusted diagrams to the synchronous renderer. */
export async function readDrawioPages(content: string): Promise<DrawioPage[]> {
  if (new Blob([content]).size > MAX_FILE_BYTES) throw new Error('图文件超过 5 MiB，请拆分后打开。')
  if (!content.trim()) throw new Error('图文件为空，请选择包含图形的 draw.io 文件。')
  const root = parseXml(content).documentElement
  const diagrams = root.tagName === 'mxfile' ? Array.from(root.children).filter(node => node.tagName === 'diagram') : []
  if (root.tagName !== 'mxGraphModel' && (root.tagName !== 'mxfile' || !diagrams.length)) {
    throw new Error('不是有效的 draw.io 图文件，请选择 .drawio 或 .drawio.xml 文件。')
  }
  if (diagrams.length > MAX_PAGES) throw new Error('图文件超过 100 页，请拆分后打开。')
  let expandedBytes = 0
  let cells = 0
  const serializer = new XMLSerializer()
  const pages: DrawioPage[] = []
  for (const [index, diagram] of (root.tagName === 'mxGraphModel' ? [root] : diagrams).entries()) {
    const model = diagram.tagName === 'mxGraphModel' ? diagram
      : diagram.firstElementChild?.tagName === 'mxGraphModel' ? diagram.firstElementChild
        : parseXml(await inflatePage(diagram.textContent ?? '')).documentElement
    if (model.tagName !== 'mxGraphModel' || !model.querySelector('root')) throw new Error(`第 ${index + 1} 页缺少图形数据，请重新导出。`)
    const xml = serializer.serializeToString(model)
    expandedBytes += new Blob([xml]).size
    cells += model.getElementsByTagName('mxCell').length
    if (expandedBytes > MAX_EXPANDED_BYTES || cells > MAX_CELLS) throw new Error('图文件展开后超过 20 MiB 或 20000 个单元，请拆分后打开。')
    pages.push({ id: diagram.getAttribute('id') ?? String(index), name: diagram.getAttribute('name') || `第 ${index + 1} 页`, xml })
  }
  return pages
}
