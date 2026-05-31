import type {
  FrpConfigState,
  FrpcConfig,
  FrpsConfig,
  FrpTargetForm,
  ProxyEntry,
} from './types'

export const defaultTarget: FrpTargetForm = {
  hostId: '',
  installDir: '/opt/frp',
}

export const defaultFrps: FrpsConfig = {
  bindPort: '7000',
  bindAddr: '0.0.0.0',
  authToken: '',
  vhostHttpPort: '',
  vhostHttpsPort: '',
  subdomainHost: '',
  dashboardEnabled: true,
  dashboardAddr: '0.0.0.0',
  dashboardPort: '7500',
  dashboardUser: 'admin',
  dashboardPwd: '',
  logLevel: 'info',
  logFile: './frps.log',
  maxLogDays: '3',
  allowPortsText: '',
}

export const defaultFrpc: FrpcConfig = {
  serverAddr: '',
  serverPort: '7000',
  authToken: '',
  user: '',
  logLevel: 'info',
  logFile: './frpc.log',
  maxLogDays: '3',
  webEnabled: false,
  webAddr: '127.0.0.1',
  webPort: '7400',
  webUser: 'admin',
  webPwd: '',
  proxies: [],
}

export function makeEmptyProxy(seed?: Partial<ProxyEntry>): ProxyEntry {
  return {
    uid: cryptoRandom(),
    name: '',
    type: 'tcp',
    localIp: '127.0.0.1',
    localPort: '',
    remotePort: '',
    customDomains: '',
    subdomain: '',
    rangeMode: false,
    localPortsRange: '',
    remotePortsRange: '',
    ...seed,
  }
}

export const initialState: FrpConfigState = {
  mode: 'frpc',
  target: defaultTarget,
  frps: defaultFrps,
  frpc: defaultFrpc,
}

function cryptoRandom(): string {
  // 不依赖 node:crypto；浏览器 / vite 环境都有 globalThis.crypto
  const buf = new Uint8Array(8)
  globalThis.crypto.getRandomValues(buf)
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}
