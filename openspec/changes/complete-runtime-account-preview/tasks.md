# 任务与验证

- [x] 复现截图的网页链接被误判为本地路径，修复分类并复用会话内预览弹框。
- [x] 提取公共预览工作台，补齐运行账号选择、配置入口、失败恢复和上下文生命周期。
- [x] 默认从目标页登录，兼容唯一 SPA 输入并避免把登录页标记为 READY。
- [x] 明确交付工具的外部应用资源引用与凭据边界。
- [x] 前后端定向测试、真实回环浏览器、Sidecar 校验、宿主装配与前端构建。
- [x] 桌面/手机实际浏览器夹具、规格与质量门禁。
- [ ] 指定测试站点配置账号后的真实登录与目标版本验收；本次尚未授权服务重启。

不涉及数据库结构或人工 SQL，未改动真实凭据、服务配置或重启服务。外部站点实际验证等待明确验收目标，不能把个人 DPAPI 登记或 preview viewerPath 当作登录成功。

## 本次验证证据

- 前端 5 个测试文件共 43 项通过，覆盖网页/本地链接分类、弹框生命周期、迟到请求释放、流式更新后焦点恢复、账号切换顺序及手动创建；typecheck 和前端边界检查通过，Vite 构建通过（保留既有 chunk 体积警告）。
- 后端 PreviewTargetsTest、PagePreviewServiceTest、PagePreviewBrowserTest 共 8 项通过，0 失败/错误/跳过。其中 2 项真实 Chromium 回环测试覆盖标准表单与简单 SPA 登录、Cookie、手机截图、只读边界、多密码框不提交及登录页不误报就绪；未执行控制器真实站点测试。
- Maven `-pl toolbox-starter -am package` 宿主装配通过；本次使用 `skip.frontend=true`，前端独立构建，未宣称该 jar 已嵌入新前端或部署。
- Sidecar TypeScript 编译和 3 项页面预览工具测试通过。
- Firefox 155 使用真实组件、生产 CSS 与 HTTP 夹具，在 1440×900、390×844、390×500 验证全屏/缩小、账号切换、登录/请求失败恢复、Escape 焦点/草稿/滚动恢复及切会话释放；控制台无页面错误。架构 Mermaid 已实际渲染检查。夹具不代表外部站点登录或目标运行版本验收。
- `openspec validate complete-runtime-account-preview --strict`、`git diff --check` 通过。Forge CLI 质量门禁 exit 0 / JSON PASSED，实际执行 9 项既有 API 探测；executedCheckers 为空，不计为已执行静态检查，也不能据此宣称本次新预览功能运行通过。
- Forge 未重启，目标站点账号配置、真实登录、目标版本启动及稳定观察仍待完成。
