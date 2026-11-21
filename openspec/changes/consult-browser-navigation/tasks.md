# 实施与验收

- [x] 官方 Codex App Server 的咨询轮次按当前或明确引用的上一条用户请求装配浏览器。67 项 sidecar 定向用例及 5 项浏览器回归通过。在隔离进程中，咨询请求经 stdio MCP 实际点击 example.com 的 Learn more，返回 HTTP 200。
- [x] 已授权账号可按名称展开导航菜单。40 项 Java 定向用例通过，覆盖会话、装配、账号与浏览器。真实 Chromium 在已登录测试页面展开菜单，阻止了点击产生的 GET 和 POST 请求，并正确报告动态菜单无法读取。咨询公告的 4 项前端测试通过。
- [x] 2026-11-21 17:36（北京时间），全栈重启后，在 17:23 连接桌面浏览器失败的原业务咨询中发送同一操作。原线程记录了一次 `forge_browser.browser_open_and_click`，从 `https://example.com/` 点击 `Learn more` 后到达 [IANA Example Domains](https://www.iana.org/help/example-domains)，标题为 `Example Domains`，HTTP 200。运行门禁 `API-RUNTIME-001` 通过。
- [x] 2026-11-21 17:55，截图中的原咨询再次收到相同的试点菜单请求。独立浏览器在上一次已核验的 IANA 页面点击 `Domains`，到达 [Domain Name Services](https://www.iana.org/domains)，HTTP 200。本轮仅调用独立浏览器。全栈重启后前后端和隧道连续观察 75 秒稳定，运行门禁 `API-RUNTIME-001` 通过。
- [x] 登录与菜单专项回归。19 项 Java 测试覆盖个人账号、资源路由、咨询装配和 Chromium 操作。失败登录的 HTTP 403 已复现；菜单点击及后续读取复用原登录态，点击触发的 GET、POST 和页面本地修改均未进入后续会话。Sidecar 的 20 项 App Server 生命周期测试、工具转发和账号选路断言通过，新旧咨询均显式接收当轮策略。
- [x] 原 ERP 咨询实测。17:44 普通读取菜单页得到 28 个一级分类，17:55 尝试展开未成功，随后工作台退回登录页。新版本全栈重启后，18:17 原咨询检查登录通过。18:19 原咨询使用同一测试账号绑定，依次完成账号发现、工作台读取及“现货销售”展开，返回 `READY`、`menuAction=EXPANDED` 和 17 个可见下一级菜单。该轮没有调用桌面浏览器。受管服务连续观察超过 92 秒稳定。
- [x] 17:59 曾跳过账号发现并调用桌面浏览器的旧咨询，18:20 用户再次尝试时先调用 `consult_web DISCOVER`。随后沿用匹配的绑定，实际展开“财务分析”和“财务管理”，分别读到 6 和 56 个条目。新版本的 `API-RUNTIME-001` 及 4 项咨询公告前端测试通过。
