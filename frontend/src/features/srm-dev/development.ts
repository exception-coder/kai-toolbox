import { lazy } from 'react'
import type { DevelopmentWorkbench } from '@/features/project-development/public-api'

const workbench: DevelopmentWorkbench = {
  id: 'srm-dev', name: 'SRM', order: 3, permission: 'menu:srm-dev',
  component: lazy(() => import('./public-api').then(module => ({ default: module.SrmDevPage }))),
}
export default workbench
