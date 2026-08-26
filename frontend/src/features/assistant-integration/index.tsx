import { lazy } from 'react'
import { BotMessageSquare } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const AssistantIntegrationPage = lazy(() => import('./pages/AssistantIntegrationPage').then((module) => ({
  default: module.AssistantIntegrationPage,
})))

const manifest: FeatureManifest = {
  id: 'assistant-integration',
  name: '嵌入式业务助手',
  icon: BotMessageSquare,
  group: '系统',
  description: '说明并诊断彩虹胶囊的项目绑定、可信来源、通信地址与宿主接入配置',
  order: 44,
  routes: [{ path: '/tools/assistant-integration', element: <AssistantIntegrationPage /> }],
}

export default manifest
