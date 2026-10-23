import { lazy } from 'react'

export { isDrawioFile } from '../drawio/drawioDocument'
export const DrawioPreview = lazy(() => import('../drawio/DrawioPreview').then(module => ({ default: module.DrawioPreview })))
