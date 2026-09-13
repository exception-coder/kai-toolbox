import { lazy } from 'react'

export const localTools = [
  { id: 'flatten', name: '目录扁平化', component: lazy(() => import('@/features/flatten/public-api').then(m => ({ default: m.FlattenPage }))) },
  { id: 'port-process', name: '端口进程查询', component: lazy(() => import('@/features/port-process/public-api').then(m => ({ default: m.PortProcessPage }))) },
  { id: 'webterm', name: 'Web 终端', component: lazy(() => import('@/features/webterm/public-api').then(m => ({ default: m.WebTermPage }))) },
  { id: 'vscode-tunnel', name: 'VS Code Tunnel', component: lazy(() => import('@/features/vscode-tunnel/public-api').then(m => ({ default: m.VsCodeTunnelPage }))) },
]
