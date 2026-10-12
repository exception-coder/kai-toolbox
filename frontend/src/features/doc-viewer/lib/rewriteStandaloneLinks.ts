export function rewriteStandaloneLinks(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href') ?? ''
    if (href.startsWith('#')) return
    if (/^(https?:|mailto:|tel:)/i.test(href)) {
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noopener noreferrer')
      return
    }
    link.removeAttribute('href')
    link.setAttribute('aria-disabled', 'true')
    link.setAttribute('title', '关联文件需要通过本地目录打开')
  })
  document.querySelectorAll('img[src]').forEach(image => {
    if (!/^(https?:|data:image\/)/i.test(image.getAttribute('src') ?? '')) image.removeAttribute('src')
  })
  return document.body.innerHTML
}
