import { lazy } from 'react'
import type { DevelopmentWorkbench } from '@/features/project-development/public-api'

const workbench: DevelopmentWorkbench = {
  id: 'kai-dev', name: 'Forge', order: 5, permission: 'menu:kai-dev',
  component: lazy(() => import('./public-api').then(module => ({ default: module.KaiDevPage }))),
}
export default workbench
