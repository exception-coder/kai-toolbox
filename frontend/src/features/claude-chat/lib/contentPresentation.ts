/** Visual annotations are applied only after the normal Markdown sanitizer. */
export function decorateContent(doc: Document) {
  doc.querySelectorAll('code').forEach(code => {
    if (code.closest('pre')) return
    const text = code.textContent ?? ''
    code.dataset.reference = /(?:[\\/]|\.[a-z]{1,6}(?::\d+)?$)/i.test(text) && !/\s/.test(text) ? 'path'
      : /^(?:GET|POST|PUT|PATCH|DELETE)\s+\/|^[\w.$]+\([^\n]*\)$/.test(text) ? 'api' : 'code'
  })
  doc.querySelectorAll('blockquote').forEach(quote => {
    const match = quote.textContent?.trim().match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i)
    if (match) quote.setAttribute('data-callout', match[1]!.toLowerCase())
  })
  doc.querySelectorAll('table').forEach(table => {
    const scroll = doc.createElement('div')
    scroll.className = 'wb-table-scroll'
    scroll.tabIndex = 0
    scroll.setAttribute('role', 'region')
    scroll.setAttribute('aria-label', '表格，可横向滚动')
    table.replaceWith(scroll)
    scroll.appendChild(table)
  })
  doc.querySelectorAll('pre').forEach((pre, index) => {
    const code = pre.querySelector('code')
    if (!code) return
    const shell = doc.createElement('figure')
    shell.className = 'wb-code-block'
    shell.dataset.codeIndex = String(index)
    const header = doc.createElement('figcaption')
    header.className = 'wb-code-header'
    const label = doc.createElement('span')
    label.className = 'wb-code-label'
    const language = code.className.match(/language-([^\s]+)/)?.[1] ?? 'text'
    label.textContent = code.dataset.filename ? `${code.dataset.filename} · ${language}` : language
    label.title = label.textContent
    const fold = doc.createElement('button')
    fold.type = 'button'
    fold.dataset.codeFold = 'true'
    fold.setAttribute('aria-label', '折叠代码')
    fold.setAttribute('aria-expanded', 'true')
    fold.textContent = '折叠'
    const copy = doc.createElement('button')
    copy.type = 'button'
    copy.dataset.codeCopy = 'true'
    copy.setAttribute('aria-label', '复制代码')
    copy.textContent = '复制'
    header.append(label, fold, copy)
    pre.replaceWith(shell)
    shell.append(header, pre)
    pre.tabIndex = 0
    pre.setAttribute('aria-label', `${language} 代码内容`)
  })
}
