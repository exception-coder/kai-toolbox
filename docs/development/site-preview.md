# 声明站点并在弹框中打开

Vibe Coding 的 AI 回复使用下面的完整围栏即可生成“打开站点”入口。只有点击后才访问站点，关闭回到当前对话，支持全屏、缩小、刷新和新窗口打开。

````markdown
```site-preview
{"title":"平台运行管理","url":"https://47.107.245.220/platform-management/applications?view=runtime"}
```
````

只接受 `url` 和可选 `title`，标题最多 120 字，地址最多 2048 字。地址必须是完整 HTTP/HTTPS，不含 URL 用户名密码。不要把密码、Token 或签名参数放进声明；已登记站点复用其地址，不另建一份账号配置。声明是前端浏览入口，不代表资源登记、授权测试或自动登录。当前版本构建/加载/验收分别见[任务状态](../../openspec/changes/add-declarative-site-preview/tasks.md)。

未闭合的流式围栏和更大代码块里的示例保持代码；普通链接不改变打开方式。切换会话自动关闭旧预览。全屏和缩小保持同一网页，刷新及关闭后重开会重新加载；操作站点表单时注意自行保存，关闭不撤销已提交的站点操作。

## 供其他前端模块复用

导入 `@/components/site-preview/SitePreviewLink`，传入 `declaration={JSON.stringify({ title, url })}`，并以所属对象和目标地址为 React key。该组件负责校验、入口和延迟弹框；不要直接拼接原始 iframe 或提供凭据。公共类型与解析位于 `@/lib/sitePreview`。不依赖 Vibe Coding 的会话服务、不查询凭据、无新增后端接口。

## 浏览器限制与恢复

目标站可通过 CSP `frame-ancestors` / `X-Frame-Options` 阻止嵌入；无效或不受信任证书、跨站 Cookie 也可能使页面或登录不可用。Forge 不代理绕过这些限制，也不能读取跨域页面的真实加载/登录状态。加载 12 秒后仍保留页面并结束等待提示，请核对实际画面，空白时刷新或新窗口打开。HTTPS 工作台遇到 HTTP 目标直接提供新窗口入口；Forge 同源页面沿用菜单或已有页面预览能力。

用户提供的平台入口目前严格 TLS 检查失败；忽略证书校验的只读诊断返回 200，不代表 iframe 可用或登录成功。本次未实际登录，也未找到当前工作区中的 `.run/test-environment/` 文件，不能声称已登记或回读本机凭据。

依据：[MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)、[frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors)（2026-10-25）。
