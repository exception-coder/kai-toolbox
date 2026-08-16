import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CHAT_ROUTE,
  useChatRuntime,
  type ClaudeChatSessionView,
  type ProjectModule,
  type WorkspaceDir,
} from '@/features/claude-chat/public-api'
import { navigateWithLaunchIntent } from '@/shell/launch-intent/api'
import { buildMenuSyncPrompt, buildModuleScopePrompt } from '../lib/workspacePrompts'
import { errorMessage, normalizePath } from '../lib/workspaceModel'

interface PendingModuleOpen {
  module: ProjectModule
  sessionId: string | null
}

/** 统一模块到 Vibe Coding 的会话恢复、草稿交接与延迟启动。 */
export function useWorkspaceModuleLaunch({
  sessionByCwd,
  selectedProject,
  knowledgeBaseDir,
}: {
  sessionByCwd: Map<string, ClaudeChatSessionView>
  selectedProject?: WorkspaceDir
  knowledgeBaseDir?: string | null
}) {
  const navigate = useNavigate()
  const { chat, activate } = useChatRuntime()
  const [pendingOpen, setPendingOpen] = useState<PendingModuleOpen | null>(null)
  const [launchError, setLaunchError] = useState('')

  useEffect(() => {
    if (!chat || !pendingOpen) return
    if (pendingOpen.sessionId) chat.switchTo(pendingOpen.sessionId)
    else chat.open(pendingOpen.module.absPath)
    setPendingOpen(null)
    navigate(CHAT_ROUTE)
  }, [chat, navigate, pendingOpen])

  const openModule = async (module: ProjectModule): Promise<void> => {
    const session = sessionByCwd.get(normalizePath(module.absPath))
    const next = { module, sessionId: session?.id ?? null }
    setLaunchError('')
    if (!next.sessionId) {
      const seed = buildModuleScopePrompt(module)
      if (seed) {
        activate()
        try {
          await navigateWithLaunchIntent(navigate, CHAT_ROUTE, {
            type: 'CHAT_OPEN_DRAFT',
            cwd: module.absPath,
            seed,
          })
        } catch (error) {
          setLaunchError(errorMessage(error))
        }
        return
      }
    }
    if (!chat) {
      setPendingOpen(next)
      activate()
      return
    }
    if (next.sessionId) chat.switchTo(next.sessionId)
    else chat.open(module.absPath)
    navigate(CHAT_ROUTE)
  }

  const launchMenuAgent = async (): Promise<void> => {
    if (!selectedProject) return
    const knowledgeRepo = (knowledgeBaseDir ?? '').replace(/[\\/]knowledge[\\/]?$/, '')
    const seed = buildMenuSyncPrompt(selectedProject.name, selectedProject.path, knowledgeRepo)
    setLaunchError('')
    activate()
    try {
      await navigateWithLaunchIntent(navigate, CHAT_ROUTE, {
        type: 'CHAT_OPEN_AND_SEND',
        cwd: selectedProject.path,
        seed,
        engine: 'claude',
      })
    } catch (error) {
      setLaunchError(errorMessage(error))
    }
  }

  return { launchError, pendingPath: pendingOpen?.module.absPath ?? null, openModule, launchMenuAgent }
}
