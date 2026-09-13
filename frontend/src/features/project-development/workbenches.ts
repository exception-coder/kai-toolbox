import type { ComponentType } from 'react'

export interface DevelopmentWorkbench {
  id: string
  name: string
  order: number
  permission: string
  component: ComponentType<{ embedded?: boolean }>
}

const registrations = import.meta.glob<{ default: DevelopmentWorkbench }>('../*/development.ts', { eager: true })
export const workbenches = Object.values(registrations).map(module => module.default).sort((a, b) => a.order - b.order)
