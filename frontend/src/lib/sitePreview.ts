/** A presentation declaration, never a credential or an automatic login instruction. */
export interface SitePreviewTarget {
  title: string
  url: string
}

export function parseSitePreview(code: string, forgeOrigin: string): SitePreviewTarget {
  let value: unknown
  try { value = JSON.parse(code) }
  catch { throw new Error('站点声明不是完整的 JSON 对象，请核对格式。') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请使用包含 title 和 url 的 JSON 对象。')
  const fields = value as Record<string, unknown>
  if (Object.keys(fields).some(key => key !== 'title' && key !== 'url')) throw new Error('站点声明只接受 title 和 url，不接受账号或密码字段。')
  if (typeof fields.url !== 'string' || fields.url.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(fields.url)) throw new Error('请填写完整的 HTTP 或 HTTPS 站点地址。')
  const url = new URL(fields.url)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('只支持不含账号密码的 HTTP 或 HTTPS 地址。')
  // The sandbox needs same-origin storage for external logins, so Forge itself must not run inside it.
  if (url.origin === forgeOrigin) throw new Error('Forge 内部页面请使用原有菜单或页面预览入口。')
  if (fields.title !== undefined && (typeof fields.title !== 'string' || fields.title.length > 120)) throw new Error('站点标题应为 120 字以内的文本。')
  return { title: typeof fields.title === 'string' && fields.title.trim() ? fields.title.trim() : url.host, url: url.href }
}
