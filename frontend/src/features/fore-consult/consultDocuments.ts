import { authFetch } from '@/lib/api'

const DOCUMENT_URL = /^\/api\/fore-consult\/sessions\/([A-Za-z0-9-]{1,100})\/documents\/([a-f0-9]{64})\/download$/

/** 只拦截同源受控下载地址，不把登录凭据发往模型输出的其它 URL。 */
export function consultDocumentPath(href: string): string | null {
  const url = new URL(href, window.location.origin)
  return url.origin === window.location.origin && !url.search && !url.hash && DOCUMENT_URL.test(url.pathname)
    ? url.pathname : null
}

export async function downloadConsultDocument(path: string, name?: string): Promise<void> {
  const safe = consultDocumentPath(path)
  if (!safe) throw new Error('文档下载地址无效')
  const response = await authFetch(safe.slice(4))
  if (!response.ok) throw new Error(response.status === 404 ? '文件不存在或你无权访问，请刷新文档列表' : '下载失败，请稍后重试')
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  let filename = name ?? '咨询文档'
  if (encodedName) {
    try { filename = decodeURIComponent(encodedName) } catch { /* 使用已知文件名 */ }
  }
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  // 留出移动端接管下载的时间，不在点击后立即撤销 Blob URL。
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
