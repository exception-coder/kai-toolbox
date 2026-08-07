export function downloadSvg(svgHtml: string) {
  const parser = new DOMParser()
  const documentNode = parser.parseFromString(svgHtml, 'image/svg+xml')
  const svg = documentNode.documentElement
  if (svg.tagName.toLowerCase() !== 'svg') return
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const content = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`
  const url = URL.createObjectURL(new Blob([content], { type: 'image/svg+xml;charset=utf-8' }))
  const link = document.createElement('a')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  link.href = url
  link.download = `mermaid-${timestamp}.svg`
  link.click()
  URL.revokeObjectURL(url)
}
