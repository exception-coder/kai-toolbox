import { lazy } from 'react'
import type { DevelopmentWorkbench } from '@/features/project-development/public-api'

const workbench: DevelopmentWorkbench = {
  id: 'scm-dev', name: 'SCM', order: 4, permission: 'menu:scm-dev',
  component: lazy(() => import('./public-api').then(module => ({ default: module.ScmDevPage }))),
}
export default workbench
