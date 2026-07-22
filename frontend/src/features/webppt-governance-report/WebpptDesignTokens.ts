/**
 * 设计期固化的 Design Token 常量——全篇章唯一样式取值来源，禁止在组件里硬编码色值/字号。
 *
 * 取值改编自 tools/tool-webppt/src/main/resources/style/design-token/v1.0.0.json
 * （Forge 已有的「WebPPT 统一风格提示词 v1.0.0」真实产物，而非临时拍脑袋的颜色）。
 * 本页与 tool-webppt 是两个独立模块（详见 index.tsx 顶部注释），因此这里不通过任何
 * 运行时接口读取该文件，只是把同一套已验证过的视觉规范以字面量方式抄录并冻结一份，
 * 满足「离线可播、无运行时后端依赖」的约束。
 */

export const colors = {
  primary: '#1F4FD8',
  primaryDark: '#17369A',
  primarySoft: '#BFDBFE',
  primarySofter: '#DBEAFE',
  canvas: '#EAF1FF',
  canvasSoft: '#F7FAFF',
  glowPrimary: 'rgba(31, 79, 216, 0.12)',
  glowAccent: 'rgba(0, 179, 164, 0.10)',
  accent: '#00B3A4',
  neutral: ['#0B1220', '#334155', '#64748B', '#CBD5E1', '#F1F5F9', '#FFFFFF'] as const,
  chartScale: ['#1F4FD8', '#00B3A4', '#F59E0B', '#EF4444', '#8B5CF6', '#0EA5E9'] as const,
  semantic: {
    success: '#16A34A',
    warning: '#F59E0B',
    danger: '#EF4444',
  },
} as const

export const typography = {
  fontCn: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  fontEn: '"Inter", "Segoe UI", sans-serif',
  scale: {
    h1: 40,
    h2: 28,
    h3: 20,
    body: 16,
    caption: 13,
  },
  lineHeight: {
    heading: 1.25,
    body: 1.6,
  },
} as const

export const spacing = {
  baseUnit: 8,
  scale: [8, 16, 24, 32, 48, 64] as const,
}

export const shape = {
  radius: {
    sm: 4,
    md: 8,
    lg: 16,
  },
  borderWidth: 1,
}

export const elevation = {
  card: '0 2px 8px rgba(15, 23, 42, 0.08)',
  floating: '0 8px 24px rgba(15, 23, 42, 0.16)',
}

/** 母版类型：每页 <section> 用其一标注布局意图，与 PRD §「reveal.js 落地」约定一致。 */
export type MasterType = 'cover' | 'section' | 'content-single' | 'content-dual' | 'summary'

export const layout = {
  aspectRatio: '16:9',
  gridColumns: 12,
  safeMargin: 64,
  masterTypes: ['cover', 'section', 'content-single', 'content-dual', 'summary'] as const satisfies readonly MasterType[],
}

export const webpptDesignTokens = { colors, typography, spacing, shape, elevation, layout } as const
