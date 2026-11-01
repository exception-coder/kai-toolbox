import { useEffect, type RefObject } from 'react'

/** Cancel stale stream work and leave literal source readable while the grammar loads. */
export function useContentHighlighting(root: RefObject<HTMLDivElement | null>, html: string | null) {
  useEffect(() => {
    const owner = root.current
    if (!owner) return
    let alive = true
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const highlight = (code: HTMLElement) => {
      const timer = setTimeout(async () => {
        timers.delete(timer)
        if (!alive || !code.isConnected) return
        const source = code.textContent ?? ''
        const language = (code.className.match(/language-([^\s]+)/)?.[1] ?? 'text').toLowerCase()
        if (/^(?:text|txt|plaintext|log|console)$/.test(language)) return
        try {
          const { highlightCode } = await import('../lib/codeHighlight')
          const tokens = await highlightCode(source, language)
          if (!alive || !code.isConnected || !owner.contains(code)) return
          if (!tokens) return
          const fragment = document.createDocumentFragment()
          tokens.forEach((line, index) => {
            const row = document.createElement('span')
            row.className = 'wb-code-line'
            row.dataset.line = String(index + 1)
            if (language === 'diff' || language === 'patch') {
              const raw = line.map(token => token.content).join('')
              row.dataset.diffKind = raw.startsWith('@@') ? 'hunk' : raw.startsWith('+') && !raw.startsWith('+++') ? 'added'
                : raw.startsWith('-') && !raw.startsWith('---') ? 'removed' : 'context'
            }
            line.forEach(token => {
              const span = document.createElement('span')
              span.textContent = token.content
              if (token.color) span.style.color = row.dataset.diffKind && row.dataset.diffKind !== 'context' ? 'inherit' : token.color
              if (token.fontStyle && token.fontStyle & 1) span.style.fontStyle = 'italic'
              row.appendChild(span)
            })
            fragment.appendChild(row)
            if (index < tokens.length - 1) fragment.appendChild(document.createTextNode('\n'))
          })
          code.replaceChildren(fragment)
          code.dataset.highlighted = 'true'
        } catch { /* Highlighting is optional; never replace readable source with an error. */ }
      }, 180)
      timers.add(timer)
    }
    const codes = Array.from(owner.querySelectorAll<HTMLElement>('.wb-code-block pre > code'))
      .filter(code => code.closest('[data-message-markdown]') === owner)
    if (!codes.length) return () => { alive = false }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { observer?.unobserve(entry.target); highlight(entry.target as HTMLElement) } })
    }, { rootMargin: '240px' })
    codes.forEach(code => observer ? observer.observe(code) : highlight(code))
    return () => { alive = false; observer?.disconnect(); timers.forEach(clearTimeout) }
  }, [root, html])
}
