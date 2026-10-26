# 任务与证据

- [x] 查明 PROD 已登记但被非生产过滤排除；分离人工预览与 Agent 端口。
- [x] 实现管理员生产预览确认、链接禁止自动确认及账号切换清除确认。
- [x] 同步架构正文、流程图、模块用法和行为增量。
- [x] 专项测试通过：后端 PreviewTargets 5、PagePreviewService 3、BrowserLoginResourceAdapter 1、ConsultWebResourceService 2，共 11 项；前端预览/空响应/Markdown 弹框/ChatPage 共 35 项。覆盖生产确认、普通用户拒绝、配置变更为 PROD、Agent 端口仍拒绝及生产链接不自动启动。
- [x] Java 21 下 `mvn -pl toolbox-starter -am package` 宿主装配通过（定向测试、`-Dskip.frontend=true`）；前端 `npm run typecheck` 与 `npx vite build` 通过。前端独立产物未随本次后端 jar 嵌入，不宣称已部署。
- [x] 真实 Firefox 的实际 ChatPage/预览组件 + HTTP 夹具在 1440×900、390×844、390×500 通过：PROD 列表、键盘确认、换账号清除确认、提交与关闭恢复、全屏及错误恢复。非生产 auto 链接回归和架构 Mermaid 实际渲染通过并检查截图。未访问生产站点，不证明实际登录或手机实机通过。
- [x] OpenSpec 严格校验、diff 检查通过。Forge 质量门禁 JSON status=PASSED、exit=0；实际执行 9 项既有 API 探测，executedCheckers 为空，不能视为新增预览功能的运行验收。
- [ ] 用户确认后加载新后端，验证真实 PROD 列表和人工登录；本任务尚未重启、未进行生产登录验收。
