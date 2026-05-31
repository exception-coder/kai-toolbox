import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Boxes, RefreshCw, Server as ServerIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { listHosts } from '@/features/hosts/api'
import { listApps } from '../api'
import { AppListPanel } from '../components/AppListPanel'
import { ContainerTable } from '../components/ContainerTable'
import { ComposeEditor } from '../components/ComposeEditor'
import { LogStreamPanel } from '../components/LogStreamPanel'
import { StatsSnapshotCard } from '../components/StatsSnapshotCard'

type TabKey = 'containers' | 'config' | 'logs' | 'stats'

const TABS: { value: TabKey; label: string }[] = [
  { value: 'containers', label: '容器' },
  { value: 'config', label: '配置' },
  { value: 'logs', label: '日志' },
  { value: 'stats', label: '资源' },
]

export function DockerPage() {
  const [hostId, setHostId] = useState<string | null>(null)
  // appId === null = 「全部容器」，appId === string = 某个登记应用
  const [appId, setAppId] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('containers')
  const [logContainer, setLogContainer] = useState<string | null>(null)

  const hostsQuery = useQuery({ queryKey: ['hosts'], queryFn: listHosts })
  const hosts = hostsQuery.data ?? []

  const appsQuery = useQuery({
    queryKey: ['docker', 'apps', hostId],
    queryFn: () => listApps(hostId!),
    enabled: !!hostId,
  })
  const apps = appsQuery.data ?? []

  const currentApp = useMemo(
    () => (appId ? apps.find(a => a.id === appId) ?? null : null),
    [apps, appId],
  )
  const currentHost = useMemo(
    () => (hostId ? hosts.find(h => h.id === hostId) ?? null : null),
    [hosts, hostId],
  )

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Boxes className="size-5 text-primary" />
              <CardTitle>Docker 治理</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => hostsQuery.refetch()}>
              <RefreshCw className="size-3.5" /> 刷新主机
            </Button>
          </div>
          <CardDescription>远程主机 Docker 应用编排：登记、启停、配置、日志</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">主机：</span>
          {hosts.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              暂无主机，请先去「主机管理」登记
            </span>
          ) : (
            hosts.map(h => (
              <Button
                key={h.id}
                size="sm"
                variant={h.id === hostId ? 'default' : 'outline'}
                onClick={() => {
                  setHostId(h.id)
                  setAppId(null)
                  setLogContainer(null)
                }}
              >
                <ServerIcon className="size-3.5" />
                {h.name}
                <span className="text-[10px] opacity-60">{h.label}</span>
              </Button>
            ))
          )}
        </CardContent>
      </Card>

      {hostId && currentHost ? (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4">
          <AppListPanel
            hostId={hostId}
            apps={apps}
            currentAppId={appId}
            onSelect={id => {
              setAppId(id)
              setLogContainer(null)
            }}
            onRefresh={() => appsQuery.refetch()}
          />

          <div className="flex flex-col gap-3 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline">{currentHost.label}</Badge>
                {currentApp ? (
                  <Badge>{currentApp.name}</Badge>
                ) : (
                  <Badge variant="secondary">全部容器</Badge>
                )}
                {currentApp && (
                  <span className="text-xs text-muted-foreground truncate">
                    {currentApp.baseDir}
                  </span>
                )}
              </div>
              <Segmented
                value={tab}
                onChange={v => setTab(v as TabKey)}
                options={TABS}
              />
            </div>

            {tab === 'containers' && (
              <ContainerTable
                hostId={hostId}
                appId={appId}
                appBaseDir={currentApp?.baseDir ?? null}
                onPickLog={cid => {
                  setLogContainer(cid)
                  setTab('logs')
                }}
              />
            )}
            {tab === 'config' && currentApp && (
              <ComposeEditor hostId={hostId} appId={currentApp.id} baseDir={currentApp.baseDir} />
            )}
            {tab === 'config' && !currentApp && (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  请先在左侧选中一个登记应用，才能查看 / 编辑其配置文件
                </CardContent>
              </Card>
            )}
            {tab === 'logs' && (
              <LogStreamPanel
                hostId={hostId}
                containerId={logContainer}
                onChangeContainerId={setLogContainer}
              />
            )}
            {tab === 'stats' && <StatsSnapshotCard hostId={hostId} />}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            选择上方一台主机以开始管理 Docker 应用
          </CardContent>
        </Card>
      )}
    </div>
  )
}
