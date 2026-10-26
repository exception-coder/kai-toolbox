# 浏览器页面预览

复用本模块 Playwright worker 的独立无头浏览器。现有录制/回放会话保持原契约，预览不进入该会话列表。

从站点录制编排点击「页面预览」，或打开 `/tools/fore-consult/preview?auto=1&route=%2Ftools%2Ffore-consult&device=phone&scene=consult-image&requestKey=本次交付唯一标识`。Vibe Coding 回复中的该链接直接在当前会话弹框打开，不再当作本地文件路径；完整查询和锚点保留。访问者需先登录 Forge；未选择应用账号时用本人 Forge 身份预览 Forge 页面。弹框可全屏/缩小，关闭恢复原对话；切会话释放其新建的浏览器。切换设备、账号或重新预览先关闭旧上下文；关闭后重开产生新请求，不复用 CLOSED 记录。仅查看既有预览 ID 不取得其关闭所有权。查看实际页面不等于功能验收通过。

管理员在 **AI 交付中心 → Forge 系统资源 → 应用站点** 配置运行环境的应用地址、环境和账号密码（`/tools/reqpool/resources?view=accounts`）；复用原资源和密码加密存储，不另建预览凭据库。预览中选择账号或点击「调整预览账号」，可在不离开对话的情况下修改账号及目标；新增账号后点「刷新账号」。已有非生产账号的交付链接带上 `resourceId` 即自动执行服务端登录，链接不含用户名、密码或 Token。本机 DPAPI 文件不自动成为服务运行账号；普通 `site-preview` iframe 也不读取这些密码。

Vibe Coding 的桌面/手机输入框「＋ → 站点预览」直接打开同一工作台；先在「应用与环境」选择登记记录，目标路径会同步为该应用登记地址的路径，选好设备并确认后才启动。无需离开当前会话，也不会发送聊天消息。空列表保留配置及刷新入口。管理员人工预览还可选择 PROD 账号：先核对站点和账号，勾选「确认使用生产账号打开预览」，再点击打开；切换账号或重新调整配置会清除确认。生产资源的 auto=1 链接只打开设置，不能跳过确认；未知或尚未加载的资源不会自动启动。同一已确认预览的设备切换和重新预览可复用本次确认。

Agent 与业务咨询的网页登录资源仍仅支持 LOCAL/DEV/TEST/UAT，人工生产预览不扩大其授权。同源**网页登录路径**可留空，此时从受保护目标页进入并跟随登录跳转；显式路径不是登录 API。字段 name 优先取资源的 usernameField/passwordField；未定制字段时，也识别唯一的 autocomplete/文本账号框与密码框，兼容不带 form/name 的简单 SPA。多个候选不猜选、不自动反复登录；导航后仍有可见密码框时保留 WAITING_LOGIN，不因登录页标题存在就报 READY。验证码或登录未完成时开启「接管操作」，处理后点击「继续打开目标页」。跨域 SSO 不支持，TLS 校验不被跳过。

SDK/stdio MCP 的 `prepare_page_preview` 支持 route、device、scene、resourceId、loginPage、readySelector、sourceRevision。外部应用必须引用资源中心账号的 resourceId；缺少账号时先提供配置入口，不把外部应用路由作为 Forge 身份预览。返回 WAITING_VIEWER_AUTH 和不带凭据的 viewerPath；开发 Agent 在交付消息中将其作为链接提供。工具只准备入口，用户登录 Forge 后才校验权限并使用服务端账号，不能凭入口宣称已登录或验收通过。受限业务咨询不会注册此交付工具。

## API

所有接口要求真实用户认证。预览只能由创建用户读取/控制，管理员不能仅凭 ID 查看其他人的预览。截图使用 Authorization 请求并转成 blob，不在图片 URL 中携带 token。

| 接口 | 行为 |
|---|---|
| GET /api/page-previews/resources | 管理员人工预览可用账号元信息，含 PROD，无密码 |
| POST /api/page-previews | requestKey、origin、route、device、scene，以及可选资源/登录路径/就绪元素/源码标记；PROD 必须 productionConfirmed=true |
| GET /api/page-previews/{id} | 生命周期、目标、账号、环境、有效期及查看路径 |
| GET /api/page-previews/{id}/screenshot | 不缓存的 JPEG，仅在可查看状态返回 |
| POST /api/page-previews/{id}/resume | 人工完成登录后复用原 context 打开目标路由 |
| POST /api/page-previews/{id}/input | 显式接管后的点击、滚动、文字与有限按键 |
| DELETE /api/page-previews/{id} | 关闭并释放上下文 |

当前 Forge 身份只注入 `toolbox.browser-request.preview-origins` 的精确来源；可用 `TOOLBOX_PREVIEW_ORIGINS` 覆盖逗号分隔列表。默认登记本地 5173/8080 与当前 Forge 公网入口，不使用请求 Host 或任意模型 URL 推定可信来源。资源账号使用资源中心原有 baseUrl 的来源，路由与登录路径需包含应用实际前缀。

启动/继续导航最长 90 秒；会话最多 15 分钟或至当前 access token 更早过期，并发最多 4 个、内存最多 64 条。相同用户与 requestKey 的相同请求复用原结果，参数冲突拒绝；关闭或过期后通过「重新预览」使用新请求标识。重启会丢弃预览，登录态不落盘，不与其他用户共享。

关闭与接管输入是无返回内容的命令。前端显式接受成功的 200 空响应及 204，不再尝试将空内容解析为 JSON，避免“重新预览”先关闭旧上下文时被 JSON 错误中断。非成功响应仍报告错误；创建和查询仍要求有效 JSON。

## 验证与限制

`PagePreviewBrowserTest` 使用独立回环测试站点，显式 `-Dpreview.browser-test=true` 验证真实 Chromium 的登录、Cookie、路由及 390×844 JPEG；需要安装 Playwright 1.49.0 对应 Chromium。它不会启动或重启应用服务。控制器/实际业务页面、部署版本及手机实机分别验收；尚未部署的能力以 OpenSpec tasks 为准。
