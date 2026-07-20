import { lazy } from 'react'
import { Rocket } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

/**
 * VibeCoding 平台化治理——面向汇报/宣讲场景的 reveal.js 静态故事页（展示型布局）。
 *
 * 与已存在的 `features/webppt`（「WebPPT 风格中心」，group: '内容'，/tools/webppt）
 * 概念上有重叠：那边是面向开发者的「风格规范浏览器」（真实后端 + Design Token/提示词/
 * reveal.js 样例的沉浸式工具页）；这里是面向汇报场景的一次性「story deck」（纯前端静态、
 * 无后端、离线可播）。两者刻意保持独立——本页的 Design Token 是从 tool-webppt 已发布的
 * v1.0.0 token 抄录固化的字面量（见 WebpptDesignTokens.ts 顶部注释），不复用其运行时 API。
 */
const WebpptGovernanceReportPage = lazy(() =>
  import('./pages/WebpptGovernanceReportPage').then((m) => ({ default: m.WebpptGovernanceReportPage })),
)

const manifest: FeatureManifest = {
  id: 'webppt-governance-report',
  name: 'VibeCoding平台化治理',
  icon: Rocket,
  group: '展示',
  description: 'vibecoding 开发平台统一治理 WebPPT 汇报（reveal.js 静态故事页）',
  order: 10, // 展示分组内既有 order:5 的 Feature 为 hidden:true，本功能是该分组首个可见菜单项
  layout: 'showcase',
  entry: '/showcase/webppt-governance-report',
  routes: [{ path: '/showcase/webppt-governance-report', element: <WebpptGovernanceReportPage /> }],
}

export default manifest
