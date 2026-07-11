import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

/**
 * SRM 本地实例（yudao 网关，验证用）探测 MCP：供 agent 在「自闭环验证」阶段以 OAuth2 登录态实发 REST 请求，
 * 校验代码改动是否符合预期（配合只读 mcp__srm_db__query 回读数据面）。
 *
 * 请求回灌到 Java 后端 {@code POST /api/claude-chat/srm-app/call}，后端负责 OAuth2 登录换 accessToken、
 * 带 {@code Authorization: Bearer} + {@code tenant-id} 头实发，并施加 host 白名单（同源）+ 拒生产域 + 超时/响应体上限；
 * 实例地址与账号由用户在「SRM需求开发」里配置。工具名对 SDK 暴露为 {@code mcp__srm_app__http_call}。
 * **只打本地/测试实例**——绝不允许碰生产。
 */
export function createSrmAppServer(apiBase: string) {
  return createSdkMcpServer({
    name: 'srm_app',
    version: '1.0.0',
    tools: [
      tool(
        'http_call',
        [
          '对已配置的【本地/测试】SRM 网关实例实发一条 HTTP 请求（OAuth2 登录态自动带 Bearer + tenant-id 头），用于自闭环验证改动效果。',
          '仅同源（配置的 baseUrl 那台）可达，命中生产域名会被拒。写接口会经网关正规逻辑真写测试库，请用专门测试数据。',
          'path 用相对路径（如 /admin-api/srm/supplier/page）；GET 的 params 拼进 query，POST/PUT 按 bodyType 编码（芋道 REST 默认 json）。',
          '返回 status / 最终 URL / 耗时 / 关键响应头 / 响应体（截断到上限）。判定数据落库效果请再用 mcp__srm_db__query 只读回读。',
        ].join(' '),
        {
          method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP 方法'),
          path: z.string().describe('相对 baseUrl 的路径或同源绝对 URL，如 /admin-api/...'),
          params: z.record(z.string(), z.any()).optional().describe('请求参数（GET 拼 query，POST/PUT 作请求体）'),
          bodyType: z.enum(['form', 'json']).optional().describe('POST/PUT 请求体编码：json(默认) 或 form'),
        },
        async (args: { method?: string; path: string; params?: Record<string, unknown>; bodyType?: string }) => {
          try {
            const res = await fetch(`${apiBase}/api/claude-chat/srm-app/call`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                method: args.method ?? 'GET',
                path: args.path,
                params: args.params ?? {},
                bodyType: args.bodyType ?? 'json',
              }),
            })
            const text = await res.text()
            return { content: [{ type: 'text' as const, text }] }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return { content: [{ type: 'text' as const, text: `srm_app 调用失败: ${msg}` }], isError: true }
          }
        },
      ),
    ],
  })
}
