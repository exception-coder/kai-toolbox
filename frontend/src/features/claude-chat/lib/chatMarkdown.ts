import DOMPurify from 'dompurify'
import { marked, Renderer } from 'marked'

/** Parse the Markdown subset shared by Vibe Coding message surfaces. */
export function parseChatMarkdown(text: string): string {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const renderer = new Renderer()
  renderer.code = ({ text: code, lang }) => {
    const language = lang?.match(/^[\w+#.-]+/)?.[0] ?? 'text'
    const filename = lang?.match(/\b(?:title|filename)=["']([^"'\r\n]+)["']/)?.[1]
    return `<pre><code class="language-${escape(language)}"${filename ? ` data-filename="${escape(filename)}"` : ''}>${escape(code)}\n</code></pre>\n`
  }
  return marked.parse(text, { async: false, gfm: true, breaks: true, renderer }) as string
}

/** Remove interactive HTML and executable URLs from rendered chat content. */
export function renderChatMarkdown(text: string): string {
  return DOMPurify.sanitize(parseChatMarkdown(text), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['input', 'button', 'form', 'textarea', 'style', 'iframe', 'video', 'audio', 'img'],
    FORBID_ATTR: ['style', 'id', 'name'],
  })
}
