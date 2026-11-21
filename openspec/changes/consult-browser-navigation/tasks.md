# 实施与验收

- [x] 官方 Codex App Server 的咨询轮次按当前或明确引用的上一条用户请求装配浏览器。67 项 sidecar 定向用例及 5 项浏览器回归通过。在隔离进程中，咨询请求经 stdio MCP 实际点击 example.com 的 Learn more，返回 HTTP 200。
- [x] 已授权账号可按名称展开导航菜单。40 项 Java 定向用例通过，覆盖会话、装配、账号与浏览器。真实 Chromium 在已登录测试页面展开菜单，阻止了点击产生的 GET 和 POST 请求，并正确报告动态菜单无法读取。咨询公告的 4 项前端测试通过。
- [x] 2026-11-21 17:36（北京时间），全栈重启后，在 17:23 连接桌面浏览器失败的原业务咨询中发送同一操作。原线程记录了一次 `forge_browser.browser_open_and_click`，从 `https://example.com/` 点击 `Learn more` 后到达 [IANA Example Domains](https://www.iana.org/help/example-domains)，标题为 `Example Domains`，HTTP 200。运行门禁 `API-RUNTIME-001` 通过。
- [x] 2026-11-21 17:55，截图中的原咨询再次收到相同的试点菜单请求。独立浏览器在上一次已核验的 IANA 页面点击 `Domains`，到达 [Domain Name Services](https://www.iana.org/domains)，HTTP 200。本轮仅调用独立浏览器。全栈重启后前后端和隧道连续观察 75 秒稳定，运行门禁 `API-RUNTIME-001` 通过。
- [ ] 使用真实业务站点的已授权账号核验该站点的菜单结构。
