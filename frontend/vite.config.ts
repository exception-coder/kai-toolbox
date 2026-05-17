import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    },
  },
})
