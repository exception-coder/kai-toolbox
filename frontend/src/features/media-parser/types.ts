export interface MediaItemView {
  type: 'VIDEO' | 'IMAGE' | 'AUDIO'
  url: string
  quality: string | null
  mimeType: string | null
}

export interface ParseResultView {
  platform: string
  type: 'VIDEO' | 'IMAGES' | 'AUDIO' | 'MULTI'
  title: string | null
  author: string | null
  thumbnail: string | null
  items: MediaItemView[]
}
