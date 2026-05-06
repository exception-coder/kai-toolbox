export type Mode = 'xiaohongshu' | 'slide' | 'preview'

export type Theme = 'minimal' | 'dark' | 'xiaohongshu' | 'zhihu' | 'terminal'

export type SlideRatio = '16:9' | '9:16'

export type SplitMode = 'manual' | 'h1' | 'h1h2'

export const SPLIT_MODES: ReadonlyArray<{ id: SplitMode; label: string; hint: string }> = [
  { id: 'manual', label: '手动 ---', hint: '用 --- 单独一行手动分页' },
  { id: 'h1', label: '按 H1', hint: '每个一级标题（#）开始新的一张卡，适合大章节' },
  { id: 'h1h2', label: '按 H1+H2', hint: '一级和二级标题（# / ##）都会开始新的一张卡，粒度更细' },
]

export interface Watermark {
  signature: string
  subSignature: string
  qrcodeUrl: string
}

export interface PersistedState {
  sourceText: string
  mode: Mode
  theme: Theme
  slideRatio: SlideRatio
  splitMode: SplitMode
  watermark: Watermark
}

export const MODES: ReadonlyArray<{ id: Mode; label: string; hint: string }> = [
  { id: 'xiaohongshu', label: '小红书卡', hint: '750 竖版长图，适合社交分享' },
  { id: 'slide', label: '幻灯卡片', hint: '用 --- 切片，多张 16:9 / 9:16' },
  { id: 'preview', label: '纯预览', hint: '响应式 Markdown 预览' },
]

export const SLIDE_RATIOS: ReadonlyArray<{ id: SlideRatio; label: string; w: number; h: number }> = [
  { id: '16:9', label: '横版 16:9', w: 1280, h: 720 },
  { id: '9:16', label: '竖版 9:16', w: 720, h: 1280 },
]
