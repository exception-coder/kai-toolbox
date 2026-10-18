# 浏览器页面预览

复用本模块 Playwright worker 的独立无头浏览器。现有录制/回放会话保持原契约，预览不进入该会话列表。

从站点录制编排点击「页面预览」，或打开 `/tools/fore-consult/preview?auto=1&route=%2Ftools%2Ffore-consult&device=phone&scene=consult-image&requestKey=本次交付唯一标识`。访问者需有业务咨询模块权限；进入后自动用本人 Forge 登录态打开目标页面，默认只读。切换手机/桌面、重新预览会关闭原上下文并创建新请求；关闭不归档或取消原业务咨询。查看实际页面不等于功能验收通过。

管理员可选择资源中心已经配置的 LOCAL/DEV/TEST/UAT 测试应用账号，填写同源的**网页登录路径**（不是登录 API）。目前只支持唯一可见且包含密码框的标准 form，字段 name 取既有资源的 usernameField/passwordField。验证码或登录未完成时开启「接管操作」，处理后点击「继续打开目标页」。跨域 SSO 不支持，TLS 校验不被跳过；不满足条件时保留失败/等待状态，不能声称自动登录成功。

SDK/stdio MCP 的 `prepare_page_preview` 支持 route、device、scene、resourceId、loginPage、readySelector、sourceRevision。返回 WAITING_VIEWER_AUTH 和不带凭据的 viewerPath；开发 Agent 在交付消息中将其作为链接提供。该工具只准备入口，不持有访问者登录令牌，也不能凭入口生成结果宣称验收通过。受限业务咨询不会注册此交付工具。

## API

所有接口要求真实用户认证。预览只能由创建用户读取/控制，管理员不能仅凭 ID 查看其他人的预览。截图使用 Authorization 请求并转成 blob，不在图片 URL 中携带 token。

| 接口 | 行为 |
|---|---|
| GET /api/page-previews/resources | 管理员可用的非生产账号元信息，无密码 |
| POST /api/page-previews | requestKey、origin、route、device、scene，以及可选资源/登录路径/就绪元素/源码标记 |
| GET /api/page-previews/{id} | 生命周期、目标、账号、环境、有效期及查看路径 |
| GET /api/page-previews/{id}/screenshot | 不缓存的 JPEG，仅在可查看状态返回 |
| POST /api/page-previews/{id}/resume | 人工完成登录后复用原 context 打开目标路由 |
| POST /api/page-previews/{id}/input | 显式接管后的点击、滚动、文字与有限按键 |
| DELETE /api/page-previews/{id} | 关闭并释放上下文 |

当前 Forge 身份只注入 `toolbox.browser-request.preview-origins` 的精确来源；可用 `TOOLBOX_PREVIEW_ORIGINS` 覆盖逗号分隔列表。默认登记本地 5173/8080 与当前 Forge 公网入口，不使用请求 Host 或任意模型 URL 推定可信来源。资源账号使用资源中心原有 baseUrl 的来源，路由与登录路径需包含应用实际前缀。

启动/继续导航最长 90 秒；会话最多 15 分钟或至当前 access token 更早过期，并发最多 4 个、内存最多 64 条。相同用户与 requestKey 的相同请求复用原结果，参数冲突拒绝；关闭或过期后通过「重新预览」使用新请求标识。重启会丢弃预览，登录态不落盘，不与其他用户共享。

## 验证与限制

`PagePreviewBrowserTest` 使用独立回环测试站点，显式 `-Dpreview.browser-test=true` 验证真实 Chromium 的登录、Cookie、路由及 390×844 JPEG；需要安装 Playwright 1.49.0 对应 Chromium。它不会启动或重启应用服务。控制器/实际业务页面、部署版本及手机实机分别验收；尚未部署的能力以 OpenSpec tasks 为准。
