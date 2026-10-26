# 任务与验证

- [x] 复现截图的网页链接被误判为本地路径，修复分类并复用会话内预览弹框。
- [x] 提取公共预览工作台，补齐运行账号选择、配置入口、失败恢复和上下文生命周期。
- [x] 默认从目标页登录，兼容唯一 SPA 输入并避免把登录页标记为 READY。
- [x] 明确交付工具的外部应用资源引用与凭据边界。
- [x] 前后端定向测试、真实回环浏览器、Sidecar 校验、宿主装配与前端构建。
- [x] 桌面/手机实际浏览器夹具、规格与质量门禁。
- [x] 用户确认重启后，使用已登记测试账号验证默认登录路径：登录路径留空也能进入平台框架，原根路径 404 消除。
- [ ] 目标应用运行版本与子页面完整验收；预览旧 Chromium 的模块兼容性缺口仍未修复。

不涉及数据库结构或人工 SQL。实现阶段未重启；随后用户明确确认了本次后端重启，运行复核见下文。不能把个人 DPAPI 登记或 preview viewerPath 当作登录成功。

## 本次验证证据

- 前端 5 个测试文件共 43 项通过，覆盖网页/本地链接分类、弹框生命周期、迟到请求释放、流式更新后焦点恢复、账号切换顺序及手动创建；typecheck 和前端边界检查通过，Vite 构建通过（保留既有 chunk 体积警告）。
- 后端 PreviewTargetsTest、PagePreviewServiceTest、PagePreviewBrowserTest 共 8 项通过，0 失败/错误/跳过。其中 2 项真实 Chromium 回环测试覆盖标准表单与简单 SPA 登录、Cookie、手机截图、只读边界、多密码框不提交及登录页不误报就绪；未执行控制器真实站点测试。
- Maven `-pl toolbox-starter -am package` 宿主装配通过；本次使用 `skip.frontend=true`，前端独立构建，未宣称该 jar 已嵌入新前端或部署。
- Sidecar TypeScript 编译和 3 项页面预览工具测试通过。
- Firefox 155 使用真实组件、生产 CSS 与 HTTP 夹具，在 1440×900、390×844、390×500 验证全屏/缩小、账号切换、登录/请求失败恢复、Escape 焦点/草稿/滚动恢复及切会话释放；控制台无页面错误。架构 Mermaid 已实际渲染检查。夹具不代表外部站点登录或目标运行版本验收。
- `openspec validate complete-runtime-account-preview --strict`、`git diff --check` 通过。Forge CLI 质量门禁 exit 0 / JSON PASSED，实际执行 9 项既有 API 探测；executedCheckers 为空，不计为已执行静态检查，也不能据此宣称本次新预览功能运行通过。
- 初始开发阶段未重启；后续运行复核如下，不将原夹具证据当作外部站点验收。

## 2026-10-27 运行复核

- 用户明确要求重启后，经 `node forge.mjs restart --scope backend` 加载工作区 `11a318c7b`。源码启动构建成功，23:56:21 日志确认 Spring Boot Started、18080 就绪；实际 Java PID 39856，受管后端包装进程 PID 31604，前端及隧道保留。
- 00:00:41 至 00:05:52 连续观察 306.5 秒，受管进程身份不变、重启次数均为 0，启用服务 online/ready，HTTP `/api/tools` 起止均 200。公网首页和 API 回源均 200；重启后的 Forge 质量门禁 exit=0 / JSON PASSED，实际运行 9 项既有 API，静态 checker 为 0。Qdrant 外部连接仍有独立错误，未作为此次预览修复的通过项。
- 真实管理员浏览器创建测试应用预览，`loginPage` 留空时已自动登录并进入平台框架；原旧后端默认访问根路径 `/` 导致的 openresty 404 不再出现。仍不能将框架 READY 当作子应用正常或部署版本已核验。
- 业务子页另报 `Failed to resolve module specifier '__ck_.../__runtime__'`。本仓库 Playwright Java 1.49.0 内置 Chromium 实测为 131.0.6778.33；同一最小动态 import-map 夹具在该内核复现模块解析错误，而本机 Chrome 155.0.8059.85 通过。Chrome 133 才支持合并多份 import map，见[官方发布说明](https://developer.chrome.com/release-notes/133#multiple_import_maps)。这支持旧预览内核兼容性诊断；尚未升级内核或修复该缺口，未宣称完整站点验收通过。
