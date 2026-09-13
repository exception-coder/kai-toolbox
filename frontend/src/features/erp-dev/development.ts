import { lazy } from 'react'
import type { DevelopmentWorkbench } from '@/features/project-development/public-api'

const workbench: DevelopmentWorkbench = {
  id: 'erp-dev', name: 'ERP', order: 1, permission: 'menu:erp-dev',
  component: lazy(() => import('./public-api').then(module => ({ default: module.ErpDevPage }))),
}
export default workbench
