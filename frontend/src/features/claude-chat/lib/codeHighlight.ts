import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

// Only load grammars when a nearby block requests them; no second renderer or remote CDN.
const languages = {
  javascript: () => import('shiki/langs/javascript.mjs'), typescript: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'), jsx: () => import('shiki/langs/jsx.mjs'),
  java: () => import('shiki/langs/java.mjs'), python: () => import('shiki/langs/python.mjs'),
  go: () => import('shiki/langs/go.mjs'), sql: () => import('shiki/langs/sql.mjs'),
  json: () => import('shiki/langs/json.mjs'), bash: () => import('shiki/langs/bash.mjs'),
  powershell: () => import('shiki/langs/powershell.mjs'), html: () => import('shiki/langs/html.mjs'),
  xml: () => import('shiki/langs/xml.mjs'), css: () => import('shiki/langs/css.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'), markdown: () => import('shiki/langs/markdown.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
}
const aliases: Record<string, string> = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', shell: 'bash', ps1: 'powershell', yml: 'yaml', md: 'markdown', patch: 'diff' }
let highlighter: Promise<HighlighterCore> | undefined
const loading = new Map<string, Promise<unknown>>()

function getHighlighter() {
  highlighter ??= createHighlighterCore({
    engine: createJavaScriptRegexEngine(), langs: [],
    themes: [{ name: 'forge-content', colors: { 'editor.background': 'var(--wb-sidebar, var(--color-card))', 'editor.foreground': 'var(--color-foreground)' }, settings: [
      { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: 'var(--wb-syntax-comment, var(--color-muted-foreground))', fontStyle: 'italic' } },
      { scope: ['keyword', 'storage'], settings: { foreground: 'var(--wb-keyword, var(--color-primary))' } },
      { scope: ['string'], settings: { foreground: 'var(--wb-string, var(--color-success))' } },
      { scope: ['constant.numeric', 'constant.language'], settings: { foreground: 'var(--wb-syntax-number, var(--color-info))' } },
      { scope: ['entity.name.function', 'support.function'], settings: { foreground: 'var(--wb-syntax-function, var(--color-primary))' } },
      { scope: ['entity.name.type', 'support.type', 'entity.name.tag'], settings: { foreground: 'var(--wb-syntax-type, var(--color-info))' } },
      { scope: ['keyword.operator', 'punctuation'], settings: { foreground: 'var(--wb-syntax-operator, var(--color-foreground))' } },
    ] }],
  }).catch(error => { highlighter = undefined; throw error })
  return highlighter
}

export async function highlightCode(code: string, rawLanguage: string) {
  const language = aliases[rawLanguage.toLowerCase()] ?? rawLanguage.toLowerCase()
  if (!(language in languages) || code.length > 30_000 || code.split('\n').length > 600) return null
  const instance = await getHighlighter()
  if (!instance.getLoadedLanguages().includes(language)) {
    let pending = loading.get(language)
    if (!pending) {
      pending = languages[language as keyof typeof languages]().then(grammar => instance.loadLanguage(grammar.default)).finally(() => loading.delete(language))
      loading.set(language, pending)
    }
    await pending
  }
  return instance.codeToTokens(code, { lang: language, theme: 'forge-content' }).tokens
}
