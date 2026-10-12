export const BROWSER_FILE_ACCEPT = '.md,.markdown,.mdx,.html,.htm,.txt,.rst,.adoc'
export const MAX_BROWSER_FILE_BYTES = 5 * 1024 * 1024
export const MAX_BROWSER_BATCH_BYTES = 20 * 1024 * 1024
export const MAX_BROWSER_FILE_COUNT = 10

export type BrowserDocumentKind = 'markdown' | 'html' | 'text'
export interface BrowserDocument {
  id: number
  name: string
  size: number
  kind: BrowserDocumentKind
  content: string
}

export function documentKind(name: string): BrowserDocumentKind {
  const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() : ''
  if (['md', 'markdown', 'mdx'].includes(extension ?? '')) return 'markdown'
  if (['html', 'htm'].includes(extension ?? '')) return 'html'
  if (['txt', 'rst', 'adoc'].includes(extension ?? '')) return 'text'
  throw new Error(`不支持「${name}」。请选择 Markdown、HTML、TXT、RST 或 ADOC 文件。`)
}

export function validateBrowserFiles(files: File[]): void {
  if (!files.length) throw new Error('未找到可读取的文件。请拖入文件，或点击选择文件；不支持拖入目录。')
  if (files.length > MAX_BROWSER_FILE_COUNT) throw new Error('一次最多打开 10 个文件，请分批选择。')
  for (const file of files) {
    documentKind(file.name)
    if (file.size > MAX_BROWSER_FILE_BYTES) throw new Error(`「${file.name}」超过 5 MiB，请通过本地目录打开。`)
  }
  if (files.reduce((size, file) => size + file.size, 0) > MAX_BROWSER_BATCH_BYTES) {
    throw new Error('所选文件总大小超过 20 MiB，请分批选择。')
  }
}

export async function readBrowserDocument(file: File, id: number): Promise<BrowserDocument> {
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    throw new Error(`无法读取「${file.name}」，请重新选择文件；不支持拖入目录。`)
  }
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
    : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8'
  let content: string
  try {
    content = new TextDecoder(encoding, { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`「${file.name}」编码无法读取。请使用 UTF-8 或带 BOM 的 UTF-16 文本。`)
  }
  if (content.includes('\0')) throw new Error(`「${file.name}」包含二进制内容，无法作为文本预览。`)
  return { id, name: file.name, size: file.size, kind: documentKind(file.name), content }
}
