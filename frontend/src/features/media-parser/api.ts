import { http } from '@/lib/api'
import type { ParseResultView } from './types'

export function parseUrl(url: string) {
  return http<ParseResultView>('/media-parser/parse', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}
