# 设计

用户在原 Vibe Coding 会话中指定起始地址和链接文字。Forge 从当轮用户输入确定可执行的操作，把范围交给独立 stdio MCP 进程。模型调用工具时由执行端核对参数，在临时 Chromium 上执行并读取结果。网页里的文本和模型提供的新地址均不能扩大这次授权。

采用 Playwright 的浏览器上下文隔离和按角色定位。工具仅处理公开 HTTPS 文档导航，不带入桌面或 Forge 登录资料，不接受脚本、凭据或任意选择器。链接目标可以跨站，因此打开、点击及后续重定向都需要检查访问边界。页面或目标不明确、加载失败、点击未完成时应返回失败。

沿用产品原则 OBJ-01、AI-01、FEED-01、EVID-01。工具活动留在原会话；回执以浏览器的实际导航为准。部署验收使用 Vibe Coding 当轮工具返回和页面地址。

### 运行配置

Sidecar 使用与其锁文件匹配的 Playwright Chromium。浏览器缓存缺失时，在 `sidecar/claude-agent` 目录运行 `node node_modules/playwright-core/cli.js install chromium`。运行 `npm run test:browser` 可用本地测试页面检查可见链接点击、新窗口导航、失败回执和出口规则。每次操作使用临时浏览器，只将匹配请求所需的网络访问放行。

默认出口解析并核对公网 IPv4，再按核对过的 IP 建立 TLS 隧道。使用企业代理或本机代理的部署可以在私有 `scripts/run-tools.d/*.conf` 同时设置 `FORGE_VIBE_BROWSER_UPSTREAM_PROXY` 和 `FORGE_VIBE_BROWSER_PROXY_ORIGINS`。前者为管理员认可的无凭据环回 HTTP 代理，后者为逗号分隔的精确 HTTPS 来源。只有同时满足本轮操作范围和管理员来源清单的目标才通过此代理，由代理解析目标，浏览器仍校验站点证书。管理员应单独列出需要经过代理的重定向来源。
