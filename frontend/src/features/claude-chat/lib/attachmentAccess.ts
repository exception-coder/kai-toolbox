import { withAuthToken } from '@/lib/auth'

/** Attach credentials only when requesting a same-origin session attachment. */
export function attachmentRequestUrl(url: string): string {
  return url.startsWith('/api/claude-chat/attachments/file?') ? withAuthToken(url) : url
}
