import { lazy } from 'react'
import { Compass } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const ExplorePage = lazy(() => import('./pages/ExplorePage'))
const DelegationGuidePage = lazy(() => import('./pages/DelegationGuidePage'))
const VibeCodingGuidePage = lazy(() => import('./pages/VibeCodingGuidePage'))

const manifest: FeatureManifest = {
  id: 'forge-explore',
  name: '探索 Forge',
  icon: Compass,
  group: 'AI',
  order: 1,
  description: '从一个想法到一份成果，认识 Forge 如何连接业务、需求与研发',
  layout: 'showcase',
  hideDock: true,
  routes: [
    { path: '/explore', element: <ExplorePage /> },
    { path: '/explore/delegation', element: <DelegationGuidePage /> },
    { path: '/explore/vibe-coding', element: <VibeCodingGuidePage /> },
  ],
}

export default manifest
