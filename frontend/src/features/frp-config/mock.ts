import { MockHttpError, registerHttp } from '@/lib/mock/registry'
import type {
  ReadConfigResult,
  ServiceActionResult,
  TestConnectionResult,
  WriteConfigResult,
} from './lib/types'
import type { FrpTargetView, FrpTargetUpsertPayload } from './lib/api'

interface ReqBody {
  hostId?: string
  installDir?: string
  mode?: 'FRPS' | 'FRPC'
  content?: string
  action?: string
}

/**
 * 进程内 frp_host_target「db」，刷新页面才丢——给 mock 模式用。
 * key 是 `${hostId}|${mode}`，对应后端的复合主键 (host_id, mode)。
 */
const FRP_TARGETS = new Map<string, FrpTargetView>()
const targetKey = (hostId: string, mode: string) => `${hostId}|${mode.toUpperCase()}`

registerHttp('POST', '/frp/test', async ({ body }) => {
  const b = (body ?? {}) as ReqBody
  await tick()
  if (!b.hostId || !b.installDir) {
    const r: TestConnectionResult = {
      connected: false,
      unameOutput: null,
      installDirExists: false,
      hasFrps: false,
      hasFrpc: false,
      hasFrpsToml: false,
      hasFrpcToml: false,
      version: null,
      errorMessage: '[mock] 请先选主机并填安装目录',
    }
    return r
  }
  const r: TestConnectionResult = {
    connected: true,
    unameOutput: 'Linux 6.1.0-23-amd64 x86_64',
    installDirExists: true,
    hasFrps: true,
    hasFrpc: true,
    hasFrpsToml: true,
    hasFrpcToml: false,
    version: 'v0.62.0',
    errorMessage: null,
  }
  return r
})

registerHttp('POST', '/frp/read', async ({ body }) => {
  const b = (body ?? {}) as ReqBody
  await tick()
  const mode = b.mode === 'FRPS' ? 'frps' : 'frpc'
  const fake =
    mode === 'frps'
      ? 'bindPort = 7000\nauth.token = "demo-token"\n'
      : 'serverAddr = "1.2.3.4"\nserverPort = 7000\nauth.token = "demo-token"\n\n[[proxies]]\nname = "ssh"\ntype = "tcp"\nlocalIP = "127.0.0.1"\nlocalPort = 22\nremotePort = 6022\n'
  const r: ReadConfigResult = {
    mode: mode as 'frps' | 'frpc',
    remotePath: (b.installDir ?? '/opt/frp') + '/' + mode + '.toml',
    exists: true,
    content: fake,
  }
  return r
})

registerHttp('POST', '/frp/write', async ({ body }) => {
  const b = (body ?? {}) as ReqBody
  await tick(300)
  const mode = b.mode === 'FRPS' ? 'frps' : 'frpc'
  const r: WriteConfigResult = {
    remotePath: (b.installDir ?? '/opt/frp') + '/' + mode + '.toml',
    backupPath: (b.installDir ?? '/opt/frp') + '/' + mode + '.toml.bak.20260525143000',
    bytesWritten: (b.content ?? '').length,
  }
  return r
})

registerHttp('POST', '/frp/service', async ({ body }) => {
  const b = (body ?? {}) as ReqBody
  await tick()
  const unit = b.mode === 'FRPS' ? 'frps' : 'frpc'
  const r: ServiceActionResult = {
    command: `[mock] sudo systemctl ${b.action ?? 'status'} ${unit}`,
    exitCode: 0,
    stdout: b.action === 'status' ? `12345 /opt/frp/${unit} -c /opt/frp/${unit}.toml` : '',
    stderr: '',
    running: b.action !== 'stop',
    pids: b.action === 'stop' ? '' : `12345 /opt/frp/${unit} -c /opt/frp/${unit}.toml`,
  }
  return r
})

/* -------- (主机, 角色) 配置快照持久化 -------- */

registerHttp('GET', '/frp/targets', () => {
  return Array.from(FRP_TARGETS.values()).sort((a, b) => b.updatedAt - a.updatedAt)
})

registerHttp('GET', '/frp/targets/:hostId', ({ params }) => {
  // 取该主机所有角色的快照（可能 0 / 1 / 2 条）
  return Array.from(FRP_TARGETS.values()).filter(v => v.hostId === params.hostId)
})

registerHttp('GET', '/frp/targets/:hostId/:mode', ({ params }) => {
  const t = FRP_TARGETS.get(targetKey(params.hostId, params.mode))
  if (!t) throw new MockHttpError(404, 'frp target not found')
  return t
})

registerHttp('PUT', '/frp/targets/:hostId/:mode', ({ params, body }) => {
  const payload = (body ?? {}) as FrpTargetUpsertPayload
  const modeUpper = params.mode.toUpperCase() as 'FRPS' | 'FRPC'
  const view: FrpTargetView = {
    hostId: params.hostId,
    mode: modeUpper,
    installDir: payload.installDir,
    configJson: payload.configJson ?? null,
    updatedAt: Date.now(),
  }
  FRP_TARGETS.set(targetKey(params.hostId, modeUpper), view)
  return view
})

registerHttp('DELETE', '/frp/targets/:hostId/:mode', ({ params }) => {
  FRP_TARGETS.delete(targetKey(params.hostId, params.mode))
  return undefined
})

function tick(ms = 120): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
