import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import mkcert from 'vite-plugin-mkcert'
import path from 'node:path'

export default defineConfig({
  // 启用 HTTPS：浏览器把 getUserMedia / SpeechRecognition 等列为 secure-context only，
  // 手机走 LAN IP 明文 HTTP 时调用会被直接拒掉，必须是 HTTPS 或 localhost。
  // vite-plugin-mkcert 首次启动会下载 mkcert 二进制 + 弹一次 UAC 把本机根 CA 装进系统信任链，
  // 并自动把本机网卡上的 LAN IP 都签进证书 SAN，无需手动维护 IP 列表。
  // source: 'coding' 走腾讯 Coding 镜像绕开 GitHub API 限流（境内必备）。
  // 手机端要单独安装一次 rootCA.pem 才能零警告，路径 %LOCALAPPDATA%\mkcert\rootCA.pem。
  plugins: [react(), tailwindcss(), mkcert({ source: 'coding' })],
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
    proxy: {
      '/api': {
        target: 'http://localhost:18080',
        changeOrigin: true,
        ws: true,
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
