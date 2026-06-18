import { lazy } from 'react'
import { Bot } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const CapturePage = lazy(() => import('./pages/CapturePage').then((m) => ({ default: m.CapturePage })))
const RecallPage = lazy(() => import('./pages/RecallPage').then((m) => ({ default: m.RecallPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const ArchitecturePage = lazy(() => import('./pages/ArchitecturePage').then((m) => ({ default: m.ArchitecturePage })))
const manifest: FeatureManifest = {
  id: 'ai-secretary',
  name: 'AI 秘书',
  icon: Bot,
  group: '内容工具',
  description:
    'LangChain4j + 本地 Qwen 的个人助理 Agent：随手记自动分类抽取、自然语言回忆',
  order: 36,
  routes: [
    { path: '/tools/ai-secretary', element: <CapturePage /> },
    { path: '/tools/ai-secretary/ask', element: <RecallPage /> },
    { path: '/tools/ai-secretary/profile', element: <ProfilePage /> },
    { path: '/tools/ai-secretary/architecture', element: <ArchitecturePage /> },
  ],
}

export default manifest
