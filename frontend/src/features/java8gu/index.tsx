import { lazy } from 'react'
import { GraduationCap } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
const Java8guHubPage = lazy(() => import('./pages/Java8guHubPage').then((m) => ({ default: m.Java8guHubPage })))
const Java8guCategoryPage = lazy(() => import('./pages/Java8guCategoryPage').then((m) => ({ default: m.Java8guCategoryPage })))
const Java8guQuestionPage = lazy(() => import('./pages/Java8guQuestionPage').then((m) => ({ default: m.Java8guQuestionPage })))
const Java8guAskPage = lazy(() => import('./pages/Java8guAskPage').then((m) => ({ default: m.Java8guAskPage })))
const manifest: FeatureManifest = {
  id: 'java8gu',
  name: 'Java 八股·卡片回顾',
  icon: GraduationCap,
  group: '学习/参考',
  description: '把 1300+ 题 Java 面试题按难度分桶可视化，由浅入深快速扫读；并可向量检索 + 复习问答',
  order: 65,
  entry: '/tools/java8gu',
  routes: [
    { path: '/tools/java8gu', element: <Java8guHubPage /> },
    { path: '/tools/java8gu/ask', element: <Java8guAskPage /> },
    { path: '/tools/java8gu/c/:cid', element: <Java8guCategoryPage /> },
    { path: '/tools/java8gu/q/:qid', element: <Java8guQuestionPage /> },
  ],
}

export default manifest
