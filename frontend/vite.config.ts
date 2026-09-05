import { createLogger, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import mkcert from 'vite-plugin-mkcert'
import path from 'node:path'

const logger = createLogger()
const logError = logger.error.bind(logger)
let lastBackendStartingNoticeAt = 0

function assistantSdkCacheHeaders() {
  return {
    name: 'assistant-sdk-cache-headers',
    configureServer(server: { middlewares: { use: (middleware: (request: { url?: string }, response: { setHeader: (name: string, value: string) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split('?', 1)[0]
        if (pathname === '/assistant-sdk/loader.js' || pathname?.startsWith('/assistant-sdk/channels/')) {
          response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        } else if (pathname?.startsWith('/assistant-sdk/releases/')) {
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
        next()
      })
    },
  }
}

logger.error = (message, options) => {
  if (message.includes('proxy error') && message.includes('ECONNREFUSED')) {
    const now = Date.now()
    if (now - lastBackendStartingNoticeAt >= 15_000) {
      logger.warn('[proxy] 后端 :18080 仍在启动，API 会在服务就绪后自动恢复')
      lastBackendStartingNoticeAt = now
    }
    return
  }
  logError(message, options)
}

export default defineConfig({
  customLogger: logger,
  // 启用 HTTPS：浏览器把 getUserMedia / SpeechRecognition 等列为 secure-context only，
  // 手机走 LAN IP 明文 HTTP 时调用会被直接拒掉，必须是 HTTPS 或 localhost。
  // vite-plugin-mkcert 首次启动会下载 mkcert 二进制 + 弹一次 UAC 把本机根 CA 装进系统信任链，
  // 并自动把本机网卡上的 LAN IP 都签进证书 SAN，无需手动维护 IP 列表。
  // source: 'coding' 走腾讯 Coding 镜像绕开 GitHub API 限流（境内必备）。
  // 手机端要单独安装一次 rootCA.pem 才能零警告，路径 %LOCALAPPDATA%\mkcert\rootCA.pem。
  plugins: [assistantSdkCacheHeaders(), react(), tailwindcss(), mkcert({ source: 'coding' })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // CodeMirror 6 的 EditorState/Extension 是用 instanceof 校验的，
    // 若 @codemirror/state 被加载两份（一份给 @uiw/react-codemirror，
    // 一份给 @codemirror/lang-*），就会报 "Unrecognized extension value"。
    // 显式 dedupe 强制 Vite 解析到同一份。
    dedupe: ['@codemirror/state', '@codemirror/view', '@codemirror/language'],
  },
  optimizeDeps: {
    include: [
      '@uiw/react-codemirror',
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/lang-json',
      '@codemirror/lang-xml',
      '@codemirror/lang-html',
    ],
  },
  server: {
    // host: true 让 vite 同时监听 IPv4 + IPv6 通配地址，等价于 '::' 双栈；
    // 比 '0.0.0.0' 更稳，避免客户端 DNS 解析到 IPv6 时连不上。
    host: true,
    port: 5173,
    // Vite 5+ 默认只允许 localhost/127.0.0.1，LAN IP / 主机名访问会被挡成空白页。
    // 本地工具箱给信任内网访问，直接全放开。
    allowedHosts: true,
    // 当前由公网隧道承载统一助手 SDK，跨域许可继续由各后端接口的精确白名单控制。
    cors: true,
    // 独立页面和助手 SDK 会在开发服务器运行期间重建。它们是输出目录，
    // 不应触发主应用刷新，更不应被重新送入 CSS 分析流程。
    watch: {
      ignored: ['**/dist/**', '**/dist-assistant/**', '**/dist-session-client/**', '**/dist-pages/**'],
    },
    proxy: {
      '/MP_verify_eQMZqv1CWST9uWxh.txt': {
        target: 'http://localhost:18080',
        changeOrigin: true,
      },
      '/a620fcc6f64f87886cc922b0e5dd8a21.txt': {
        target: 'http://localhost:18080',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:18080',
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyRequest, request) => {
            const originalHost = request.headers.host
            if (originalHost) {
              proxyRequest.setHeader('X-Forwarded-Host', originalHost)
            } else {
              proxyRequest.removeHeader('X-Forwarded-Host')
            }
          })
        },
      },
      // 守护进程 HTTP 控制口（run-supervised.ps1 的 HttpListener）：一键重启走这里，
      // 与后端(18080)独立——后端宕机时本代理仍可达,故能拉起。/supervisor/restart → :18081/restart
      '/supervisor': {
        target: 'http://127.0.0.1:18081',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/supervisor/, ''),
      },
    },
  },
})
