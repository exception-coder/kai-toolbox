import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHAT_ROUTE, createTaskspace, useChatRuntime, type WorkspaceDir } from '@/features/claude-chat/public-api'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { navigateWithLaunchIntent } from '@/shell/launch-intent/api'
import { useAggregationCart } from './useAggregationCart'
import { buildLinkagePrompt } from '../lib/workspaceModel'
import type { ProjectModule } from '@/features/claude-chat/public-api'

/** 持有跨项目模块篮子及聚合工作区的创建流程。 */
export function useWorkspaceAggregation(selectedProject?: WorkspaceDir) {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { activate } = useChatRuntime()
  const cart = useAggregationCart()
  const [aggregating, setAggregating] = useState(false)
  const [error, setError] = useState('')

  const pinModule = (module: ProjectModule) => {
    if (!selectedProject) return
    cart.toggle({
      projectName: selectedProject.name,
      projectPath: selectedProject.path,
      moduleName: module.name,
      moduleRelPath: module.relPath,
      modulePath: module.absPath,
    })
  }

  const aggregate = async (): Promise<void> => {
    if (cart.items.length < 1) return
    const roots = [...new Set(cart.items.map(item => item.projectPath))]
    setError('')
    setAggregating(true)
    try {
      const base = roots[0].replace(/[\\/][^\\/]+$/, '')
      const name = `aggregate-${Date.now().toString(36)}`
      const view = await createTaskspace(base, name, roots)
      activate()
      await navigateWithLaunchIntent(navigate, CHAT_ROUTE, {
        type: 'CHAT_OPEN_DRAFT',
        cwd: view.dir,
        seed: buildLinkagePrompt(cart.items),
      })
      cart.clear()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setAggregating(false)
    }
  }

  const clear = async (): Promise<void> => {
    if (cart.items.length === 0) return
    const accepted = await confirm({
      title: '清空待聚合',
      description: '移除所有已钉选模块?',
      confirmText: '清空',
      variant: 'destructive',
    })
    if (accepted) cart.clear()
  }

  return { cart, aggregating, error, pinModule, aggregate, clear }
}
