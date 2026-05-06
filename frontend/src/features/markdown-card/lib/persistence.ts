import type { PersistedState } from '../types'

const STORAGE_KEY = 'kai-toolbox:markdown-card:state'

export const DEFAULT_STATE: PersistedState = {
  splitMode: 'h1',
  sourceText: `# 你好，Markdown 卡片

把任意 Markdown 文本，**一键转成可分享的图片卡片**。

> 三种模式：小红书竖版 / 多页幻灯 / 纯预览
> 五套主题：极简 / 深色 / 小红书 / 知乎专栏 / 终端
> 跨端导出：PC 自动下载，移动端调起系统分享

---

## 用 \`---\` 切片就能分页

第二页内容写在这里。

- 列表项 1
- 列表项 2
- \`inline code\`

\`\`\`ts
function hello() {
  return 'world'
}
\`\`\`
`,
  mode: 'preview',
  theme: 'minimal',
  slideRatio: '16:9',
  watermark: {
    signature: '',
    subSignature: '',
    qrcodeUrl: '',
  },
}

export function loadState(): PersistedState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw)
    return mergeWithDefault(parsed)
  } catch {
    return DEFAULT_STATE
  }
}

export function saveState(state: PersistedState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('[markdown-card] localStorage write failed:', e)
  }
}

function mergeWithDefault(input: unknown): PersistedState {
  if (!input || typeof input !== 'object') return DEFAULT_STATE
  const obj = input as Partial<PersistedState>
  return {
    sourceText: typeof obj.sourceText === 'string' ? obj.sourceText : DEFAULT_STATE.sourceText,
    mode: isMode(obj.mode) ? obj.mode : DEFAULT_STATE.mode,
    theme: isTheme(obj.theme) ? obj.theme : DEFAULT_STATE.theme,
    slideRatio: isSlideRatio(obj.slideRatio) ? obj.slideRatio : DEFAULT_STATE.slideRatio,
    splitMode: isSplitMode(obj.splitMode) ? obj.splitMode : DEFAULT_STATE.splitMode,
    watermark: {
      signature: obj.watermark?.signature ?? '',
      subSignature: obj.watermark?.subSignature ?? '',
      qrcodeUrl: obj.watermark?.qrcodeUrl ?? '',
    },
  }
}

function isMode(v: unknown): v is PersistedState['mode'] {
  return v === 'xiaohongshu' || v === 'slide' || v === 'preview'
}

function isTheme(v: unknown): v is PersistedState['theme'] {
  return v === 'minimal' || v === 'dark' || v === 'xiaohongshu' || v === 'zhihu' || v === 'terminal'
}

function isSlideRatio(v: unknown): v is PersistedState['slideRatio'] {
  return v === '16:9' || v === '9:16'
}

function isSplitMode(v: unknown): v is PersistedState['splitMode'] {
  return v === 'manual' || v === 'h1' || v === 'h1h2'
}
