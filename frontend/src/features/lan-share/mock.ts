import { registerHttp } from '@/lib/mock/registry'

registerHttp('GET', '/lan-share/health', () => undefined)

registerHttp('GET', '/lan-share/ice-config', () => ({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}))

// 注意：WebSocket 信令 + WebRTC DataChannel 不通过 HTTP/SSE registry，
// 由 useRoom 内部在 mock 模式下走 services/mockOrchestrator.ts 的内存模拟。
