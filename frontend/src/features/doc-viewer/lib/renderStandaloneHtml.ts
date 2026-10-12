import DOMPurify from 'dompurify'

export function renderStandaloneHtml(content: string): string {
  const policy = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'"
  const safeContent = DOMPurify.sanitize(content, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ['meta', 'base', 'form', 'iframe', 'object', 'embed', 'link'],
  })
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}">${safeContent}`
}
