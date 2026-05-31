import { GraduationCap } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { Java8guHubPage } from './pages/Java8guHubPage'
import { Java8guCategoryPage } from './pages/Java8guCategoryPage'
import { Java8guQuestionPage } from './pages/Java8guQuestionPage'

const manifest: FeatureManifest = {
  id: 'java8gu',
  name: 'Java 八股·卡片回顾',
  icon: GraduationCap,
  group: '学习/参考',
  description: '把 1300+ 题 Java 面试题按难度分桶可视化，由浅入深快速扫读',
  order: 65,
  entry: '/tools/java8gu',
  routes: [
    { path: '/tools/java8gu', element: <Java8guHubPage /> },
    { path: '/tools/java8gu/c/:cid', element: <Java8guCategoryPage /> },
    { path: '/tools/java8gu/q/:qid', element: <Java8guQuestionPage /> },
  ],
}

export default manifest
