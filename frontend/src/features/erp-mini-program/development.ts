import { lazy } from 'react'
import type { DevelopmentWorkbench } from '@/features/project-development/public-api'

const workbench: DevelopmentWorkbench = {
  id: 'erp-mini-program', name: 'ERP小程序', order: 2, permission: 'menu:erp-mini-program',
  component: lazy(() => import('./public-api').then(module => ({ default: module.ErpMiniProgramPage }))),
}
export default workbench
