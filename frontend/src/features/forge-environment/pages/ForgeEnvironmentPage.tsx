import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { subscribeSse } from '@/lib/api'
import { BootstrapProgress } from '../components/BootstrapProgress'
import { DependencySection } from '../components/DependencySection'
import { ReadinessSummary } from '../components/ReadinessSummary'
import { SuiteOperations } from '../components/SuiteOperations'
import {
  forgeEnvironmentBootstrapPath,
  getForgeEnvironment,
  teamSuiteInstallPath,
  teamSuiteUpdatePath,
} from '../api'
import type { BootstrapStep, ForgeEnvironmentSnapshot, RestartRequiredEvent } from '../types'

const QUERY_KEY = ['forge-environment']
type Operation = 'initialization' | 'suite-install' | 'suite-update'

const PROGRESS_COPY: Record<Operation, { title: string; emptyTitle: string; emptyDescription: string; errorTitle: string }> = {
  initialization: {
    title: '初始化进度',
    emptyTitle: '尚未开始初始化',
    emptyDescription: '点击“一键初始化”后，这里会按依赖顺序显示每一步。已就绪的项目会自动跳过。',
    errorTitle: '初始化未完成',
  },
  'suite-install': {
    title: '套件安装进度',
    emptyTitle: '等待安装套件',
    emptyDescription: '安装会先同步五个固定仓库，再从本地工作区构建并登记插件与 MCP。',
    errorTitle: '套件安装未完成',
  },
  'suite-update': {
    title: '套件更新进度',
    emptyTitle: '等待更新套件',
    emptyDescription: '更新会安全快进五个固定仓库，再从本地工作区重新构建并更新套件。',
    errorTitle: '套件更新未完成',
  },
}

function suiteStepName(step: string) {
  const [action, target] = step.split(':', 2)
  if (action === 'clone') return `克隆 ${target}`
  if (action === 'pull') return `更新 ${target}`
  return step.replaceAll('-', ' ')
}

/** Forge 研发环境总览与一键初始化工作台。 */
export function ForgeEnvironmentPage() {
  const queryClient = useQueryClient()
  const closeStreamRef = useRef<null | (() => void)>(null)
  const terminalRef = useRef(false)
  const [activeOperation, setActiveOperation] = useState<Operation | null>(null)
  const [progressKind, setProgressKind] = useState<Operation>('initialization')
  const [refreshing, setRefreshing] = useState(false)
  const [steps, setSteps] = useState<BootstrapStep[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [restartRequired, setRestartRequired] = useState<RestartRequiredEvent | null>(null)
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: () => getForgeEnvironment(false) })

  useEffect(() => () => closeStreamRef.current?.(), [])

  const refresh = async (fetchRemote = true, preserveError = false) => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const snapshot = await getForgeEnvironment(fetchRemote)
      queryClient.setQueryData(QUERY_KEY, snapshot)
      if (!preserveError) setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? `重新检测失败：${cause.message}` : '重新检测失败，请确认 Forge 后端可用。')
    } finally {
      setRefreshing(false)
    }
  }

  const upsertStep = (step: BootstrapStep) => {
    setSteps((current) => {
      const index = current.findIndex((item) => item.id === step.id)
      if (index < 0) return [...current, step]
      const next = [...current]
      next[index] = step
      return next
    })
  }

  const startOperation = (operation: Operation, path: string) => {
    if (activeOperation) return
    closeStreamRef.current?.()
    terminalRef.current = false
    setActiveOperation(operation)
    setProgressKind(operation)
    setSteps([])
    setLogs([])
    setError(null)
    setRestartRequired(null)
    closeStreamRef.current = subscribeSse(path, {
      onEvent: (eventName, data) => handleStreamEvent(eventName, data, operation),
      onError: () => {
        if (!terminalRef.current) setError('执行连接中断。已完成的步骤不会回滚，请重新检测后继续。')
        setActiveOperation(null)
      },
      onClose: () => {
        if (!terminalRef.current) setError('执行流提前结束，请重新检测当前状态。')
        setActiveOperation(null)
      },
    }, ['snapshot', 'step', 'restartRequired', 'done', 'message'])
  }

  const finishOperation = (preserveError = false) => {
    terminalRef.current = true
    setActiveOperation(null)
    void refresh(false, preserveError)
  }

  const failOperation = (message: string) => {
    terminalRef.current = true
    setActiveOperation(null)
    setError(message)
  }

  const handleStreamEvent = (eventName: string, data: unknown, operation: Operation) => {
    if (eventName === 'snapshot') {
      queryClient.setQueryData(QUERY_KEY, data as ForgeEnvironmentSnapshot)
      return
    }
    if (eventName === 'step') {
      upsertStep(data as BootstrapStep)
      return
    }
    if (eventName === 'message') {
      const message = data as {
        type?: string
        engine?: string
        step?: string
        text?: string
        exitCode?: number
        message?: string
        results?: Array<{ ok?: boolean; repo?: string; step?: string; message?: string; reason?: string }>
      }
      if (message.type === 'line' && message.text) {
        setLogs((current) => [...current.slice(-199), `${message.engine ? `[${message.engine}] ` : ''}${message.text}`])
      } else if (message.type === 'step' && message.step) {
        const succeeded = message.exitCode === 0
        upsertStep({
          id: `${message.engine ?? 'suite'}:${message.step}`,
          name: suiteStepName(message.step),
          state: succeeded ? 'SUCCEEDED' : 'FAILED',
          message: succeeded ? '已完成' : `执行失败（退出码 ${message.exitCode ?? -1}）`,
        })
      } else if (message.type === 'done') {
        const failures = (message.results ?? []).filter((result) => result.ok === false)
        failures.filter((result) => result.repo).forEach((result) => upsertStep({
          id: `git:${result.repo}`,
          name: `同步 ${result.repo}`,
          state: 'FAILED',
          message: result.message || result.reason || '仓库同步失败，已保留本地现场。',
        }))
        if (failures.length > 0) {
          setError(`有 ${failures.length} 个步骤未完成。请查看失败项和命令输出，处理后重试。`)
        }
        finishOperation(failures.length > 0)
      } else if (message.type === 'error') {
        failOperation(message.message || PROGRESS_COPY[operation].errorTitle)
      }
      return
    }
    if (eventName === 'restartRequired') {
      terminalRef.current = true
      setRestartRequired(data as RestartRequiredEvent)
      setActiveOperation(null)
      return
    }
    if (eventName === 'done') {
      finishOperation()
      return
    }
    if (eventName === 'error') {
      const payload = data as { message?: string; detail?: string }
      failOperation([payload.message, payload.detail].filter(Boolean).join('：') || PROGRESS_COPY[operation].errorTitle)
    }
  }

  const running = activeOperation !== null
  const progressCopy = PROGRESS_COPY[progressKind]

  if (query.isPending) {
    return <main className="mx-auto max-w-6xl p-6 text-sm text-[var(--color-muted-foreground)]">正在检测 Forge 研发环境…</main>
  }

  if (query.isError || !query.data) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-sm font-medium">无法读取 Forge 环境</p>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">{query.error instanceof Error ? query.error.message : '后端暂不可用，请确认 Forge 已启动。'}</p>
        <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>重新检测</Button>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-12">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">Forge · System Readiness</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">研发环境</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-muted-foreground)]">
          从基础运行时到公司知识套件，一处确认 Forge 是否具备完整研发能力。
        </p>
      </header>

      <ReadinessSummary
        snapshot={query.data}
        refreshing={query.isFetching || refreshing}
        initializing={activeOperation === 'initialization'}
        busy={running}
        onRefresh={() => void refresh(true)}
        onInitialize={() => startOperation('initialization', forgeEnvironmentBootstrapPath())}
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div>
          {query.data.groups.map((group) => <DependencySection key={group.id} group={group} />)}
        </div>
        <div className="order-first space-y-4 lg:order-none lg:sticky lg:top-6">
          <SuiteOperations
            running={running}
            onInstall={() => startOperation('suite-install', teamSuiteInstallPath())}
            onUpdate={() => startOperation('suite-update', teamSuiteUpdatePath())}
          />
          <BootstrapProgress
            steps={steps}
            logs={logs}
            running={running}
            error={error}
            restartRequired={restartRequired}
            onRetry={() => void refresh(true)}
            title={progressCopy.title}
            emptyTitle={progressCopy.emptyTitle}
            emptyDescription={progressCopy.emptyDescription}
            errorTitle={progressCopy.errorTitle}
          />
        </div>
      </div>
    </main>
  )
}
