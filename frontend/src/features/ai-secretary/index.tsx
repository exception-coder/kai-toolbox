import { Bot } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { CapturePage } from './pages/CapturePage'
import { ArchitecturePage } from './pages/ArchitecturePage'

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
    { path: '/tools/ai-secretary/architecture', element: <ArchitecturePage /> },
  ],
}

export default manifest
