import { createHash } from 'node:crypto'
import { z } from 'zod'

export const pagePreviewSchema = {
  route: z.string().min(1).max(1024).describe('目标系统的站内路由，例如 /tools/fore-consult'),
  device: z.enum(['phone', 'desktop']).default('desktop'),
  scene: z.enum(['page', 'consult-image']).default('page'),
  resourceId: z.string().max(100).optional().describe('资源中心已有测试应用 ID；不传则使用访问者当前 Forge 身份'),
  loginPage: z.string().max(256).optional().describe('测试应用的同源网页登录路径，不是登录 API'),
  readySelector: z.string().max(200).optional().describe('预期可见的页面元素；不传时等待页面标题'),
  sourceRevision: z.string().max(100).optional().describe('源码版本标记；不能代替实际运行版本核验'),
}
export const PAGE_PREVIEW_STEER = 'Web 页面或交互修改交付时，若 prepare_page_preview 可用，应准备目标路由及手机/桌面预览入口并提供给用户。入口准备成功不等于已登录或验收通过；真实浏览器未执行、运行版本未核验或服务待启动时须明确标注，不得自行重启服务。'
export const PAGE_PREVIEW_DESCRIPTION = '生成真实浏览器页面预览入口。用户打开入口后以本人登录身份自动启动隔离渲染会话；测试应用引用资源中心账号，不能传密码。返回 WAITING_VIEWER_AUTH 只表示入口已准备，不能宣称已登录、截图或验收通过。不会启动或重启应用。'
type Args = z.infer<z.ZodObject<typeof pagePreviewSchema>>

export function preparePagePreview(args: Args, sessionId = 'delivery') {
  for (const value of [args.route, args.loginPage].filter((value): value is string => !!value)) {
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[?&](access_token|password|token)=/i.test(value)) {
      throw new Error('页面预览只接受不含凭据的站内路径')
    }
  }
  const requestKey = createHash('sha256').update(JSON.stringify([sessionId, args])).digest('hex').slice(0, 40)
  const query = new URLSearchParams({ auto: '1', requestKey })
  for (const [key, value] of Object.entries(args)) if (value) query.set(key, value)
  const result = { status: 'WAITING_VIEWER_AUTH', viewerPath: `/tools/fore-consult/preview?${query}`,
    message: '打开入口后将以访问者身份登录并渲染目标页面；尚未执行页面验收。' }
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result }
}
