import { marked } from 'marked'
import DOMPurify from 'dompurify'

/** Shared Vibe Coding text parser; interactive developer tools stay in the host. */
export function parseChatMarkdown(text: string): string {
  return marked.parse(text, { async: false, gfm: true, breaks: true }) as string
}

/** Business messages never enable raw interactive HTML or executable URLs. */
export function renderChatMarkdown(text: string): string {
  return DOMPurify.sanitize(parseChatMarkdown(text), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['input', 'button', 'form', 'textarea', 'style', 'iframe', 'video', 'audio', 'img'],
    FORBID_ATTR: ['style', 'id', 'name'],
  })
}
