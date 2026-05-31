import { Boxes } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { DockerPage } from './pages/DockerPage'

const manifest: FeatureManifest = {
  id: 'docker',
  name: 'Docker 治理',
  icon: Boxes,
  group: '运维工具',
  description: '远程主机 Docker 应用编排：登记、启停、配置、日志',
  order: 35,
  routes: [{ path: '/tools/docker', element: <DockerPage /> }],
}

export default manifest
