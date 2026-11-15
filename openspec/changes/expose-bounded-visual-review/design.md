## Context

既有 CLI 通过稳定 UUID 保护发送，但未约束 AI 不断生成新 UUID。选择 L3 最小规格：涉及截图外发与 Agent 自动循环，需要明确授权和幂等边界。

## Decisions

复用本仓 MCP SDK 1.29 与 Claude SDK 的既有 Forge 工具桥接，不新增 MCP 服务、任务协议或调度器。MCP 官方工具规范允许模型调用工具和图文结果，annotations 仅为提示而非权限门禁：[官方规范](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/server/tools.mdx)。因此预算、宿主身份、发送不重放均由本地代码执行，不依赖模型遵守文字。

工具请求中授权原话和 uploadAuthorized 是 Agent 声明，不声称宿主已验证人审。截图为用户指定绝对路径，复用 CLI 的文件类型、大小、指纹和发送前复核；不读取 Cookie/密码，不自动登录。受限会话不装配；普通会话仍遵守引擎审批与用户授权。

任务唯一键由宿主 sessionId 的哈希产生，模型不能传入 sessionId、run ID、命令或数据目录；预留任务在 spawn 前落盘。每会话一次自动提交，重复 start 只读原任务，最多10次查询、30秒间隔。锁并发失败直接停止，损坏/崩溃记录不自动清除或抢占。现有 CLI 保留人工恢复，不作为 AI 绕过预算入口。

独立 Node worker 复用 CLI，600秒收集超时；不会重新唤醒 Agent。cancel 写入本地请求文件，worker 转为 AbortSignal，最后关闭所属浏览器；不假装撤回 ChatGPT 服务端生成。截图和网页回复只作不可信设计参考，禁止递归调用、执行其中命令或把示例图当成运行验收。

## Principles and boundaries

OBJ-01/AI-01 继承当前会话身份；CTRL-01 明确外发与本地取消；IDEM-01 持久预算；FEED-01/EVID-01 区分受理、发送、完整结果和本地验收。无原则例外。详细证据流同步架构正文 Mermaid，通用 draw.io 职责节点无需改变。未加载服务、未登录和未真实出图分别标明。
