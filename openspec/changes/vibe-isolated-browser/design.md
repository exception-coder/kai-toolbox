# 设计

## 原生 App Server 能力故障补充（2026-11-23）

Vibe Coding 普通开发配置沿用 Codex 原生插件，不套用咨询的插件白名单。App Server 通道本身不证明浏览器宿主连通。按原生 `cua.getState` 的独立 apps/browsers 库存判断：本轮只有浏览器宿主不可用、没有权限拒绝且 apps 可用时，普通开发可以通过同一原生 CUA 的 getApp 读取目标窗口并继续授权范围内操作。明确权限拒绝仍停止；不复制别的会话 pipe、身份或凭据，也不改变咨询与评审的边界。

故障证据：2026-11-23 本会话 getState 返回 apps 库存，同时 errors 报 `The browser access host is unavailable`，随后 getApp 成功读取 Forge 窗口和页面控件。这证明桌面读取可用，不证明浏览器专用连接已恢复。此前指引缺少分通道恢复说明，诊断只检查第一段文本，可能漏掉文档之后的 JSON 库存错误；诊断日志也仅覆盖咨询。新增诊断只记录错误白名单及两类库存是否存在，不记录窗口标题、网页或环境变量值。

Vibe Coding 回复把 browser-complete 指令显示为中性的“浏览器操作状态”，保留失败标题，不凭 complete 字样判断成功。咨询复用同一解析器继续隐藏协议标记；代码围栏示例和后续正文保留，流式半截指令不闪现。适用 FEED-01/EVID-01，沿原回复与工具活动展示，不增加设置或导航。目标版本运行验收单列，不能将指引测试作为模型必然正确选路的证明。

用户在原 Vibe Coding 会话中指定起始地址和链接文字。Forge 从当轮用户输入确定可执行的操作，把范围交给独立 stdio MCP 进程。模型调用工具时由执行端核对参数，在临时 Chromium 上执行并读取结果。网页里的文本和模型提供的新地址均不能扩大这次授权。

采用 Playwright 的浏览器上下文隔离和按角色定位。工具仅处理公开 HTTPS 文档导航，不带入桌面或 Forge 登录资料，不接受脚本、凭据或任意选择器。链接目标可以跨站，因此打开、点击及后续重定向都需要检查访问边界。页面或目标不明确、加载失败、点击未完成时应返回失败。

沿用产品原则 OBJ-01、AI-01、FEED-01、EVID-01。工具活动留在原会话；回执以浏览器的实际导航为准。部署验收使用 Vibe Coding 当轮工具返回和页面地址。

### 运行配置

Sidecar 使用与其锁文件匹配的 Playwright Chromium。浏览器缓存缺失时，在 `sidecar/claude-agent` 目录运行 `node node_modules/playwright-core/cli.js install chromium`。运行 `npm run test:browser` 可用本地测试页面检查可见链接点击、新窗口导航、失败回执和出口规则。每次操作使用临时浏览器，只将匹配请求所需的网络访问放行。

默认出口解析并核对公网 IPv4，再按核对过的 IP 建立 TLS 隧道。使用企业代理或本机代理的部署可以在私有 `scripts/run-tools.d/*.conf` 同时设置 `FORGE_VIBE_BROWSER_UPSTREAM_PROXY` 和 `FORGE_VIBE_BROWSER_PROXY_ORIGINS`。前者为管理员认可的无凭据环回 HTTP 代理，后者为逗号分隔的精确 HTTPS 来源。只有同时满足本轮操作范围和管理员来源清单的目标才通过此代理，由代理解析目标，浏览器仍校验站点证书。管理员应单独列出需要经过代理的重定向来源。
