import DOMPurify from 'dompurify'
import { marked } from 'marked'

/** Parse the Markdown subset shared by Vibe Coding message surfaces. */
export function parseChatMarkdown(text: string): string {
  return marked.parse(text, { async: false, gfm: true, breaks: true }) as string
}

/** Remove interactive HTML and executable URLs from rendered chat content. */
export function renderChatMarkdown(text: string): string {
  return DOMPurify.sanitize(parseChatMarkdown(text), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['input', 'button', 'form', 'textarea', 'style', 'iframe', 'video', 'audio', 'img'],
    FORBID_ATTR: ['style', 'id', 'name'],
  })
}
