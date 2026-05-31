import { createHighlighter, type Highlighter } from 'shiki'

let highlighterPromise: Promise<Highlighter> | null = null

export function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: ['java', 'json', 'xml', 'sql', 'bash', 'markdown', 'typescript', 'javascript', 'html', 'css', 'yaml'],
    })
  }
  return highlighterPromise
}
