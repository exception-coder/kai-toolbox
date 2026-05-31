import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  ClipboardCopy,
  CloudDownload,
  CloudUpload,
  FolderOpen,
  Plus,
  Power,
  RefreshCcw,
  Server,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { ApiError, http } from '@/lib/api'
import { HostPicker } from '@/components/host-picker'
import { defaultFrpc, defaultFrps, initialState, makeEmptyProxy } from '../lib/defaults'
import { buildFrpcToml, buildFrpsToml } from '../lib/tomlBuilder'
import {
  getFrpTarget,
  parseFrpcConfig,
  parseFrpsConfig,
  upsertFrpTarget,
} from '../lib/api'
import { PrincipleHint } from '../components/PrincipleHint'
import { FieldRow } from '../components/FieldRow'
import { ProxyCard } from '../components/ProxyCard'
import type {
  FrpConfigState,
  FrpcConfig,
  FrpMode,
  FrpsConfig,
  FrpTargetForm,
  ReadConfigResult,
  ServiceActionResult,
  TestConnectionResult,
  WriteConfigResult,
} from '../lib/types'

const MODE_OPTIONS = [
  { value: 'frpc' as const, label: 'frpc（客户端·内网）' },
  { value: 'frps' as const, label: 'frps（服务端·公网）' },
]

const LOG_LEVELS = [
  { value: 'trace', label: 'trace' },
  { value: 'debug', label: 'debug' },
  { value: 'info', label: 'info' },
  { value: 'warn', label: 'warn' },
  { value: 'error', label: 'error' },
]

export function FrpConfigPage() {
  const [state, setState] = useState<FrpConfigState>(initialState)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<WriteConfigResult | null>(null)
  const [serviceBusy, setServiceBusy] = useState<string | null>(null)
  const [serviceResult, setServiceResult] = useState<ServiceActionResult | null>(null)
  const [readSnapshot, setReadSnapshot] = useState<ReadConfigResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 持久化层最近一次写入的时间戳，仅用于 UI 提示「已自动保存」 */
  const [savedAt, setSavedAt] = useState<number | null>(null)
  /** 远端 frp 进程当前是否在跑；用来给启停按钮上色 + 顶部状态徽章。 */
  const [runningState, setRunningState] = useState<'unknown' | 'checking' | 'running' | 'stopped'>('unknown')
  /** 避免「切主机时载入的数据」反过来又被 autosave 写回——载入期间禁止 autosave */
  const restoringRef = useRef<boolean>(false)
  /** 第一次 mount 时也不要立刻 autosave（form 还没绑定 hostId） */
  const mountedOnceRef = useRef<boolean>(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toml = useMemo(() => {
    return state.mode === 'frps' ? buildFrpsToml(state.frps) : buildFrpcToml(state.frpc)
  }, [state])

  const target = state.target
  const targetPayload = {
    hostId: target.hostId,
    installDir: target.installDir.trim(),
  }
  const sshReady = Boolean(targetPayload.hostId && targetPayload.installDir)

  function updateTarget(patch: Partial<FrpTargetForm>) {
    setState(s => ({ ...s, target: { ...s.target, ...patch } }))
  }
  function updateFrps(patch: Partial<FrpsConfig>) {
    setState(s => ({ ...s, frps: { ...s.frps, ...patch } }))
  }
  function updateFrpc(patch: Partial<FrpcConfig>) {
    setState(s => ({ ...s, frpc: { ...s.frpc, ...patch } }))
  }

  // ① 切换 (主机, 角色) 时载入对应记录；每个 (hostId, mode) 是独立的一条 db 行。
  //    没记录时：把当前 mode 的表单**重置为默认值**，不再继承上一主机/角色的脏 state，
  //    然后种子写入一条新记录。这就是修「切主机加载同一个配置」那个 bug 的关键。
  useEffect(() => {
    const hostId = state.target.hostId
    const mode = state.mode
    if (!hostId) {
      mountedOnceRef.current = true
      return
    }
    let cancelled = false
    restoringRef.current = true
    ;(async () => {
      try {
        const view = await getFrpTarget(hostId, mode)
        if (cancelled) return
        if (view) {
          // 命中：把这台 (主机, 角色) 的 installDir + 表单 state 还原
          if (mode === 'frps') {
            const restored = parseFrpsConfig(view.configJson) ?? defaultFrps
            setState(s => ({
              ...s,
              target: { ...s.target, installDir: view.installDir || s.target.installDir },
              frps: restored,
            }))
          } else {
            const restored = parseFrpcConfig(view.configJson) ?? defaultFrpc
            setState(s => ({
              ...s,
              target: { ...s.target, installDir: view.installDir || s.target.installDir },
              frpc: restored,
            }))
          }
          setSavedAt(view.updatedAt)
        } else {
          // 第一次进这个 (主机, 角色)：清空当前 mode 的表单成默认值（防止上一台主机的脏 state 渗透），
          // 然后用默认值种子写入一行
          if (mode === 'frps') {
            setState(s => ({ ...s, frps: defaultFrps }))
          } else {
            setState(s => ({ ...s, frpc: defaultFrpc }))
          }
          const seedInstallDir = state.target.installDir.trim() || '/opt/frp'
          const seedConfig = mode === 'frps' ? defaultFrps : defaultFrpc
          const seed = await upsertFrpTarget(hostId, mode, {
            installDir: seedInstallDir,
            configJson: JSON.stringify(seedConfig),
          })
          if (!cancelled) {
            setSavedAt(seed.updatedAt)
            setState(s => ({ ...s, target: { ...s.target, installDir: seedInstallDir } }))
          }
        }
      } catch {
        // 静默：失败保持当前 state
      } finally {
        setTimeout(() => {
          restoringRef.current = false
          mountedOnceRef.current = true
        }, 0)
      }
    })()
    return () => {
      cancelled = true
    }
    // 依赖 hostId + mode：任一变化都重新载入。其他 state 字段由 ② 处理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.target.hostId, state.mode])

  // ② 表单任何字段变化都防抖 800ms 后写回 db；写的是「当前 (主机, 角色)」这一行，
  //    只带当前 mode 的 config，不污染另一角色的记录。
  useEffect(() => {
    if (!mountedOnceRef.current) return
    if (restoringRef.current) return
    if (!state.target.hostId || !state.target.installDir.trim()) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const currentConfig = state.mode === 'frps' ? state.frps : state.frpc
      upsertFrpTarget(state.target.hostId, state.mode, {
        installDir: state.target.installDir.trim(),
        configJson: JSON.stringify(currentConfig),
      })
        .then(v => setSavedAt(v.updatedAt))
        .catch(() => { /* 静默 */ })
    }, 800)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state])

  async function handleTest() {
    setTesting(true)
    setError(null)
    setTestResult(null)
    try {
      const r = await http<TestConnectionResult>('/frp/test', {
        method: 'POST',
        body: JSON.stringify(targetPayload),
      })
      setTestResult(r)
      if (!r.connected) setError(r.errorMessage ?? '连接失败')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setTesting(false)
    }
  }

  async function handleLoadRemote() {
    setLoading(true)
    setError(null)
    setReadSnapshot(null)
    try {
      const r = await http<ReadConfigResult>('/frp/read', {
        method: 'POST',
        body: JSON.stringify({ ...targetPayload, mode: state.mode.toUpperCase() }),
      })
      setReadSnapshot(r)
      if (!r.exists) {
        setError(`远端不存在 ${r.remotePath}，将以表单默认值生成新文件`)
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaveResult(null)
    try {
      const r = await http<WriteConfigResult>('/frp/write', {
        method: 'POST',
        body: JSON.stringify({
          ...targetPayload,
          mode: state.mode.toUpperCase(),
          content: toml,
        }),
      })
      setSaveResult(r)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleService(action: 'status' | 'restart' | 'stop' | 'start') {
    setServiceBusy(action)
    setError(null)
    setServiceResult(null)
    try {
      const r = await http<ServiceActionResult>('/frp/service', {
        method: 'POST',
        body: JSON.stringify({
          ...targetPayload,
          mode: state.mode.toUpperCase(),
          action,
        }),
      })
      setServiceResult(r)
      // 命令本身返回的 running 字段就是它二次 pgrep 的结果，最新最准——直接用它给按钮上色
      setRunningState(r.running ? 'running' : 'stopped')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setServiceBusy(null)
    }
  }

  /**
   * 自动探测远端 frp 进程状态。
   * 触发时机：sshReady 变化（选完主机/填完安装目录后） + 切换 frps/frpc。
   * 注意：不依赖 installDir 的每个键入——状态命令是 pgrep 按 unit 名匹配的，跟路径无关。
   */
  useEffect(() => {
    if (!sshReady) {
      setRunningState('unknown')
      return
    }
    let cancelled = false
    setRunningState('checking')
    http<ServiceActionResult>('/frp/service', {
      method: 'POST',
      body: JSON.stringify({
        hostId: target.hostId,
        installDir: target.installDir.trim(),
        mode: state.mode.toUpperCase(),
        action: 'status',
      }),
    })
      .then(r => {
        if (cancelled) return
        setRunningState(r.running ? 'running' : 'stopped')
      })
      .catch(() => {
        if (!cancelled) setRunningState('unknown')
      })
    return () => {
      cancelled = true
    }
    // 不订阅 installDir：避免每次按键都重新发请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sshReady, target.hostId, state.mode])

  async function copyToml() {
    try {
      await navigator.clipboard.writeText(toml)
    } catch {
      /* ignore */
    }
  }

  function addProxy() {
    updateFrpc({ proxies: [...state.frpc.proxies, makeEmptyProxy()] })
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-6">
      {/* Header + 模式切换 */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-5" />
              frp 可视化配置
            </CardTitle>
            <CardDescription>
              通过 SSH 远程编辑 frps/frpc 的 TOML 配置。修改在右侧实时预览，点保存才会真正写入远端并备份旧文件。
            </CardDescription>
          </div>
          <Segmented
            value={state.mode}
            onChange={m => setState(s => ({ ...s, mode: m as FrpMode }))}
            options={MODE_OPTIONS}
            size="md"
          />
        </CardHeader>
      </Card>

      {/* 选主机 + frp 安装目录 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="size-4" />
            选择远端主机 & frp 安装目录
          </CardTitle>
          <CardDescription>
            主机统一在「主机管理」里维护；这里只选哪一台、装在哪。所有读写、重启都基于这一对值。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <HostPicker
            value={target.hostId}
            onChange={id => updateTarget({ hostId: id })}
          />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[120px_1fr]">
            <div className="pt-2 text-sm font-medium">
              <FolderOpen className="mr-1 inline size-4" />
              安装目录
            </div>
            <div className="space-y-1">
              <Input
                placeholder="frp 安装目录绝对路径，例如 /opt/frp"
                value={target.installDir}
                onChange={e => updateTarget({ installDir: e.target.value })}
              />
              {target.hostId && (
                <div className="text-[11px] text-[var(--color-muted-foreground)]">
                  {savedAt
                    ? `按主机自动保存到 db（最近一次：${formatSavedAt(savedAt)}）`
                    : '将随表单变化自动保存到 db'}
                </div>
              )}
            </div>
          </div>

          <PrincipleHint k="ssh" />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="lg"
              className="shadow-md"
              onClick={handleTest}
              disabled={!sshReady || testing}
            >
              <ShieldCheck />
              {testing ? '体检中…' : '探测 frp 安装'}
            </Button>
            <Button
              variant="outline"
              onClick={handleLoadRemote}
              disabled={!sshReady || loading}
            >
              <CloudDownload />
              {loading ? '拉取中…' : '拉取远端配置（仅查看）'}
            </Button>
          </div>

          {testResult && (
            <div className="rounded-md border bg-[var(--color-muted)]/30 p-3 text-sm">
              <div className="mb-2 flex items-center gap-2">
                {testResult.connected ? (
                  <Badge variant="success">
                    <CheckCircle2 className="mr-1 size-3" />
                    SSH 已连通
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <XCircle className="mr-1 size-3" />
                    SSH 失败
                  </Badge>
                )}
                {testResult.unameOutput && (
                  <code className="rounded bg-[var(--color-muted)]/60 px-2 py-0.5 text-xs">
                    {testResult.unameOutput}
                  </code>
                )}
                {testResult.version && (
                  <Badge variant="outline">frp {testResult.version}</Badge>
                )}
              </div>
              {testResult.connected && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                  <DetectItem label="安装目录" ok={testResult.installDirExists} />
                  <DetectItem label="frps 二进制" ok={testResult.hasFrps} />
                  <DetectItem label="frpc 二进制" ok={testResult.hasFrpc} />
                  <DetectItem label="frps.toml" ok={testResult.hasFrpsToml} />
                  <DetectItem label="frpc.toml" ok={testResult.hasFrpcToml} />
                </div>
              )}
              {!testResult.connected && testResult.errorMessage && (
                <pre className="mt-1 whitespace-pre-wrap text-xs text-[var(--color-destructive)]">
                  {testResult.errorMessage}
                </pre>
              )}
            </div>
          )}

          {readSnapshot && (
            <div className="rounded-md border bg-[var(--color-muted)]/30 p-3 text-sm">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant={readSnapshot.exists ? 'success' : 'outline'}>
                  {readSnapshot.exists ? '远端文件已存在' : '远端文件不存在'}
                </Badge>
                <code className="text-xs">{readSnapshot.remotePath}</code>
              </div>
              {readSnapshot.exists && (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-[var(--color-background)] p-2 font-mono text-xs">
                  {readSnapshot.content}
                </pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 主编辑区：左表单 / 右 TOML 预览 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {state.mode === 'frps' ? (
            <FrpsForm value={state.frps} onChange={updateFrps} />
          ) : (
            <FrpcForm value={state.frpc} onChange={updateFrpc} onAddProxy={addProxy} />
          )}
        </div>

        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base">
                  生成的 {state.mode}.toml（实时预览）
                </CardTitle>
                <CardDescription>
                  改左侧任何字段，这里立刻重新生成；点「保存到远端」才真正写入。
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={copyToml}>
                <ClipboardCopy />
                复制
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[60vh] overflow-auto rounded-md border bg-[var(--color-muted)]/40 p-3 font-mono text-xs leading-relaxed">
                {toml}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 动作栏 */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" />
              部署与服务控制
            </CardTitle>
            <CardDescription>
              进入页面自动探测 {state.mode} 进程状态。启动 / 停止按钮会根据当前状态变色，避免误操作。
            </CardDescription>
          </div>
          <RunningBadge state={runningState} mode={state.mode} />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              className="shadow-md"
              onClick={handleSave}
              disabled={!sshReady || saving}
            >
              <CloudUpload />
              {saving ? '保存中…' : `保存到远端（${state.mode}.toml）`}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleService('status')}
              disabled={!sshReady || serviceBusy !== null}
            >
              <Activity />
              {serviceBusy === 'status' ? '查询中…' : '刷新状态'}
            </Button>
            {/* 重启：进程在跑时高亮成 default，没跑时禁用 */}
            <Button
              variant={runningState === 'running' ? 'default' : 'outline'}
              onClick={() => handleService('restart')}
              disabled={!sshReady || serviceBusy !== null || runningState === 'stopped'}
              title={runningState === 'stopped' ? '当前进程未运行，无需重启' : ''}
            >
              <RefreshCcw />
              {serviceBusy === 'restart' ? '重启中…' : '重启 frp'}
            </Button>
            {/* 启动：未跑时主色调（绿）强调，已跑时禁用 */}
            <Button
              variant={runningState === 'stopped' ? 'default' : 'outline'}
              className={runningState === 'stopped' ? 'bg-emerald-600 text-white shadow-md hover:bg-emerald-700' : ''}
              onClick={() => handleService('start')}
              disabled={!sshReady || serviceBusy !== null || runningState === 'running'}
              title={runningState === 'running' ? '进程已在运行，无需重复启动' : ''}
            >
              <Power />
              {serviceBusy === 'start' ? '启动中…' : '启动'}
            </Button>
            {/* 停止：进程在跑时 destructive 红色提示，没跑时禁用 */}
            <Button
              variant={runningState === 'running' ? 'destructive' : 'outline'}
              onClick={() => handleService('stop')}
              disabled={!sshReady || serviceBusy !== null || runningState === 'stopped'}
              title={runningState === 'stopped' ? '当前进程未运行' : ''}
            >
              <Power />
              {serviceBusy === 'stop' ? '停止中…' : '停止'}
            </Button>
          </div>

          {saveResult && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              <div className="font-medium">已写入 {saveResult.remotePath}（{saveResult.bytesWritten} bytes）</div>
              {saveResult.backupPath && (
                <div className="text-xs opacity-80">旧文件已备份：{saveResult.backupPath}</div>
              )}
            </div>
          )}

          {serviceResult && (
            <div className="space-y-2 rounded-md border bg-[var(--color-muted)]/30 p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={serviceResult.running ? 'success' : 'outline'}>
                  {serviceResult.running ? '进程运行中' : '未检测到进程'}
                </Badge>
                <Badge variant="outline">exit {serviceResult.exitCode}</Badge>
              </div>
              <div className="text-xs">
                <div className="text-[var(--color-muted-foreground)]">执行命令：</div>
                <pre className="overflow-x-auto rounded bg-[var(--color-background)] p-2 font-mono">
                  {serviceResult.command}
                </pre>
              </div>
              {serviceResult.pids && (
                <div className="text-xs">
                  <div className="text-[var(--color-muted-foreground)]">匹配进程：</div>
                  <pre className="overflow-x-auto rounded bg-[var(--color-background)] p-2 font-mono">
                    {serviceResult.pids}
                  </pre>
                </div>
              )}
              {(serviceResult.stdout || serviceResult.stderr) && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-[var(--color-muted-foreground)]">
                    展开 stdout / stderr
                  </summary>
                  {serviceResult.stdout && (
                    <pre className="mt-1 overflow-x-auto rounded bg-[var(--color-background)] p-2 font-mono">
                      {serviceResult.stdout}
                    </pre>
                  )}
                  {serviceResult.stderr && (
                    <pre className="mt-1 overflow-x-auto rounded bg-[var(--color-background)] p-2 font-mono text-[var(--color-destructive)]">
                      {serviceResult.stderr}
                    </pre>
                  )}
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-[var(--color-destructive)]/50 bg-[var(--color-destructive)]/10 p-3 text-sm text-[var(--color-destructive)]">
          {error}
        </div>
      )}
    </div>
  )
}

/* ============ 子表单 ============ */

function FrpsForm({ value, onChange }: { value: FrpsConfig; onChange: (p: Partial<FrpsConfig>) => void }) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">服务端基础</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow label="bindAddr" hint="0.0.0.0 表示监听所有网卡">
            <Input value={value.bindAddr} onChange={e => onChange({ bindAddr: e.target.value })} />
          </FieldRow>
          <FieldRow label="bindPort" hint="客户端 frpc 主动 dial 的端口，默认 7000" required>
            <Input value={value.bindPort} onChange={e => onChange({ bindPort: e.target.value })} />
          </FieldRow>
          <PrincipleHint k="bindPort" />

          <FieldRow label="auth.token" hint="共享密钥；强烈建议 openssl rand -hex 16 生成 32 位">
            <Input
              type="text"
              value={value.authToken}
              onChange={e => onChange({ authToken: e.target.value })}
              placeholder="一个长随机字符串"
            />
          </FieldRow>
          <PrincipleHint k="authToken" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">HTTP / HTTPS 多域名分流（可选）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow label="vhostHTTPPort" hint="一般填 80。所有 type=http 的代理都共用这个端口">
            <Input
              value={value.vhostHttpPort}
              onChange={e => onChange({ vhostHttpPort: e.target.value })}
              placeholder="80"
            />
          </FieldRow>
          <FieldRow label="vhostHTTPSPort" hint="一般填 443，配合 type=https 代理">
            <Input
              value={value.vhostHttpsPort}
              onChange={e => onChange({ vhostHttpsPort: e.target.value })}
              placeholder="443"
            />
          </FieldRow>
          <FieldRow label="subdomainHost" hint="启用子域名分发后，proxy 写 subdomain=app1，实际访问 app1.example.com">
            <Input
              value={value.subdomainHost}
              onChange={e => onChange({ subdomainHost: e.target.value })}
              placeholder="example.com"
            />
          </FieldRow>
          <PrincipleHint k="vhostHttp" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dashboard（管理 UI）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.dashboardEnabled}
              onChange={e => onChange({ dashboardEnabled: e.target.checked })}
            />
            启用 Dashboard
          </label>
          {value.dashboardEnabled && (
            <>
              <FieldRow label="webServer.addr">
                <Input
                  value={value.dashboardAddr}
                  onChange={e => onChange({ dashboardAddr: e.target.value })}
                />
              </FieldRow>
              <FieldRow label="webServer.port">
                <Input
                  value={value.dashboardPort}
                  onChange={e => onChange({ dashboardPort: e.target.value })}
                />
              </FieldRow>
              <FieldRow label="用户名">
                <Input
                  value={value.dashboardUser}
                  onChange={e => onChange({ dashboardUser: e.target.value })}
                />
              </FieldRow>
              <FieldRow label="密码">
                <Input
                  type="password"
                  value={value.dashboardPwd}
                  onChange={e => onChange({ dashboardPwd: e.target.value })}
                />
              </FieldRow>
            </>
          )}
          <PrincipleHint k="dashboard" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">日志 & 端口白名单</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow label="log.to">
            <Input value={value.logFile} onChange={e => onChange({ logFile: e.target.value })} />
          </FieldRow>
          <FieldRow label="log.level">
            <Segmented
              value={value.logLevel}
              onChange={v => onChange({ logLevel: v })}
              options={LOG_LEVELS}
            />
          </FieldRow>
          <FieldRow label="log.maxDays">
            <Input value={value.maxLogDays} onChange={e => onChange({ maxLogDays: e.target.value })} />
          </FieldRow>
          <FieldRow
            label="allowPorts"
            hint="每行一条；区间用 6000-7000，单点直接写 8080。空 = 全放行"
          >
            <textarea
              value={value.allowPortsText}
              onChange={e => onChange({ allowPortsText: e.target.value })}
              rows={4}
              placeholder={'6000-7000\n8080\n8443'}
              className="flex w-full rounded-md border bg-[var(--color-background)] px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
            />
          </FieldRow>
          <PrincipleHint k="allowPorts" />
        </CardContent>
      </Card>
    </>
  )
}

function FrpcForm({
  value,
  onChange,
  onAddProxy,
}: {
  value: FrpcConfig
  onChange: (p: Partial<FrpcConfig>) => void
  onAddProxy: () => void
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">连到哪台 frps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow label="serverAddr" hint="frps 的公网 IP / 域名" required>
            <Input value={value.serverAddr} onChange={e => onChange({ serverAddr: e.target.value })} />
          </FieldRow>
          <FieldRow label="serverPort" hint="必须等于 frps 的 bindPort（默认 7000）" required>
            <Input value={value.serverPort} onChange={e => onChange({ serverPort: e.target.value })} />
          </FieldRow>
          <FieldRow label="auth.token" hint="必须和 frps 的 auth.token 完全一致">
            <Input
              type="text"
              value={value.authToken}
              onChange={e => onChange({ authToken: e.target.value })}
            />
          </FieldRow>
          <FieldRow label="user" hint="可选；同一 frps 下不同客户端区分用，影响 proxy 名空间">
            <Input value={value.user} onChange={e => onChange({ user: e.target.value })} />
          </FieldRow>
          <PrincipleHint k="serverAddr" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">代理列表</CardTitle>
            <CardDescription>
              每条 [[proxies]] 对应一个端口/服务穿透；HTTP 类按域名共享 80
            </CardDescription>
          </div>
          <Badge variant="outline">{value.proxies.length} 条</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {value.proxies.length === 0 && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-[var(--color-muted-foreground)]">
              还没有代理。点下方按钮添加第一条。
            </div>
          )}
          {value.proxies.map((p, i) => (
            <ProxyCard
              key={p.uid}
              index={i}
              value={p}
              onChange={next => {
                const copy = value.proxies.slice()
                copy[i] = next
                onChange({ proxies: copy })
              }}
              onRemove={() => onChange({ proxies: value.proxies.filter((_, idx) => idx !== i) })}
            />
          ))}

          <button
            type="button"
            onClick={onAddProxy}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/20 py-4 text-sm font-medium text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 hover:text-[var(--color-primary)]"
          >
            <Plus className="size-4" />
            新增代理（TCP / UDP / HTTP / HTTPS）
          </button>

          <div className="grid gap-2">
            <PrincipleHint k="proxyTcp" />
            <PrincipleHint k="proxyUdp" />
            <PrincipleHint k="proxyHttp" />
            <PrincipleHint k="proxyRange" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">日志 & Admin UI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow label="log.to">
            <Input value={value.logFile} onChange={e => onChange({ logFile: e.target.value })} />
          </FieldRow>
          <FieldRow label="log.level">
            <Segmented
              value={value.logLevel}
              onChange={v => onChange({ logLevel: v })}
              options={LOG_LEVELS}
            />
          </FieldRow>
          <FieldRow label="log.maxDays">
            <Input value={value.maxLogDays} onChange={e => onChange({ maxLogDays: e.target.value })} />
          </FieldRow>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.webEnabled}
              onChange={e => onChange({ webEnabled: e.target.checked })}
            />
            启用 frpc Admin UI（本机管理面板，可热重载 proxy）
          </label>
          {value.webEnabled && (
            <>
              <FieldRow label="webServer.addr">
                <Input value={value.webAddr} onChange={e => onChange({ webAddr: e.target.value })} />
              </FieldRow>
              <FieldRow label="webServer.port">
                <Input value={value.webPort} onChange={e => onChange({ webPort: e.target.value })} />
              </FieldRow>
              <FieldRow label="用户名">
                <Input value={value.webUser} onChange={e => onChange({ webUser: e.target.value })} />
              </FieldRow>
              <FieldRow label="密码">
                <Input type="password" value={value.webPwd} onChange={e => onChange({ webPwd: e.target.value })} />
              </FieldRow>
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function DetectItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {ok ? (
        <CheckCircle2 className="size-3.5 text-emerald-500" />
      ) : (
        <XCircle className="size-3.5 text-[var(--color-destructive)]" />
      )}
      <span className={ok ? '' : 'text-[var(--color-muted-foreground)]'}>{label}</span>
    </div>
  )
}

function formatSavedAt(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 顶部状态徽章：绿点=运行中 / 灰点=未运行 / 闪烁=探测中 / 暗淡=未知 */
function RunningBadge({
  state,
  mode,
}: {
  state: 'unknown' | 'checking' | 'running' | 'stopped'
  mode: FrpMode
}) {
  const unit = mode
  const cfg = {
    unknown: {
      dot: 'bg-[var(--color-muted-foreground)]/60',
      text: '状态未知',
      cls: 'border-[var(--color-border)] bg-[var(--color-muted)]/50 text-[var(--color-muted-foreground)]',
    },
    checking: {
      dot: 'bg-sky-500 animate-pulse',
      text: '探测中…',
      cls: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    },
    running: {
      dot: 'bg-emerald-500',
      text: `${unit} 运行中`,
      cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    },
    stopped: {
      dot: 'bg-[var(--color-destructive)]',
      text: `${unit} 未运行`,
      cls: 'border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 text-[var(--color-destructive)]',
    },
  }[state]
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${cfg.cls}`}>
      <span className={`size-2 rounded-full ${cfg.dot}`} />
      {cfg.text}
    </div>
  )
}
