# 实施设计

适用原则 OBJ-01、NAV-01、CTX-01、FEED-01、AI-01、EVID-01、IDEM-01，无例外。

主对象是预览请求及运行账号资源 ID。资源中心的应用站点账号仍是唯一凭据源，密码经现有 OpsCredentialCipher 保存，由服务端解密供短期独立浏览器使用；回复、URL、前端视图只携带资源引用。个人 DPAPI 文件不是运行服务账号配置，不能假定自动登录已完成。

Vibe Markdown 在本地文件分类之前识别当前 Forge 来源下的精确预览路由，保留查询及锚点。`/tools`、`/api`、`/assets` 网页地址不传给系统路径 API；真实 Windows、Linux 与相对文件链接沿用原行为。预览模块公开弹框入口，提取 PagePreviewWorkspace 供路由和弹框复用，不复制身份、列表或浏览器实现。关闭恢复触发器或原消息焦点，切会话卸载；全屏/缩小不重建上下文。

弹框每次打开产生新 requestKey，打开期间重复点击、StrictMode 和尺寸变化共用请求；显式关闭后重开视为新一轮，避免复用 CLOSED 记录。仅由弹框新建的上下文在关闭时尽力释放，网络失败仍受后端 TTL 限制；查看已有预览链接不取得其关闭所有权。创建返回前离开则关闭迟到的新上下文。操作锁阻止重复创建和切换账号；账号修改先关闭旧上下文再创建，失败保留参数及恢复入口。独立路由保留原交付 requestKey 复用语义。

预览工作台可在打开后调整账号、路由及网页登录路径。无账号时可进入已有应用站点配置并刷新列表；不从多个账号中猜选，也不降低 ADMIN/非生产环境要求。未指定网页登录路径时先访问目标受保护路由并跟随同源登录跳转，避免带应用前缀的系统被错误送到根目录。账号/密码字段优先匹配显式 name；仅默认字段可回退到唯一 autocomplete/文本框及唯一密码框，多个候选直接等待接管，不猜测或重试登录。

兼容标准 form 与同源 SPA 登录；咨询只读路径继续只开放原有登录 API / form action，未增加写权限。导航后若仍存在可见密码框，即便存在标题也不标 READY。验证码、SSO、TLS 信任和错误密码保持等待/失败，由用户核对；不自动绕过证书。普通 `site-preview` iframe 保持无凭据浏览，自动登录必须使用资源账号预览链路。

验证包括截图链接回归、弹框焦点/滚动/草稿/生命周期、运行账号引用无密码、错误恢复、桌面及手机矮屏；后端真实回环 Chromium 验证 Cookie 登录、SPA 无 name 输入、含密码框的登录页不误报就绪、多密码框不提交。依据 [Playwright 认证](https://playwright.dev/java/docs/auth) 与 [定位器](https://playwright.dev/java/docs/locators)（2026-10-26）。运行测试账号真实目标与服务加载状态单独记录，不以构建或入口准备代替验收。

2026-10-27 子应用切换兼容修复：旧 Playwright 1.49.0 的 Chromium 131 在壳模块加载后无法合并新 import map，动态 `__runtime__` 导入失败。升级本模块到 Maven Central 已发布的 Playwright 1.64.0 并配套安装其 Chromium，保留独立无头 context、TLS、同源及账号边界，不改子应用打包或采用个人浏览器回退。依据 [Chrome 133 多份 import map 支持](https://developer.chrome.com/release-notes/133#multiple_import_maps)、[Playwright 1.64 发布说明](https://playwright.dev/java/docs/release-notes#version-164)及[驱动与浏览器版本配套要求](https://playwright.dev/java/docs/browsers)（2026-10-27）。在真实内核夹具中先加载壳模块，再点击甲→乙→甲并验证模块正文，覆盖桌面/手机 context；另复核原登录/只读路径和宿主装配。实际运行内核版本写入启动日志；服务加载与外部应用切换须在用户确认重启后单独验收。

版本由父 POM 的 `playwright.version` 和 dependencyManagement 统一管理，浏览器录制与媒体解析模块不再各自声明版本，避免 Maven 在宿主选择较早声明的媒体解析 1.49.0。除了模块回归，验收须核对最终宿主 jar 的 playwright、driver、driver-bundle 三项实际版本。媒体解析保留原可选初始化与失败缓存行为，不扩大本次外部抓取验收范围。
