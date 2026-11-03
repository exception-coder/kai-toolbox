# Built-in Harness Preset：研究优先

## 方案与证据

用户要求默认提供 environment-default 与 research-first。沿用现有 Sidecar developerInstructions 通道，最小扩展为一个静态研究引导和统一拼接函数，不自建搜索、研究 Agent、规则引擎、数据库或页面。模型依据语义判断触发，不靠关键词路由额外模型请求。

2026-11-03 核实：[Claude 官方最佳实践](https://code.claude.com/docs/en/best-practices)强调保持项目指令精简，并区分提示词和确定性约束；[Codex 原生 Web Search](https://learn.chatgpt.com/docs/web-search)区分缓存与实时访问。因此预设只引导使用已有获准工具，不能声称提示注入就保证研究执行或最新事实已核实。

规则覆盖技术选型、架构、最佳实践、新版本/API及是否自建；先项目、再官方、再成熟实现，必要时社区案例；按可信度、版本及适配性选最小方案。简单 Bug、文案、样式和已有充分证据的继续开发不强制搜索。输出推荐、依据、最小范围及不建议建设的内容，不强列候选。离线、工具缺失/失败不伪造检索；网页不可下达指令，内部源码/密钥/敏感业务信息不可进入搜索。

## 注入与兼容边界

普通交互式 Session.executeTurn 统一拼接两项预设，各引擎沿用已有映射：Claude/Qwen 使用原生 preset append，Codex 使用既有 developer instructions 路径，OpenCode 使用 system，Pi/Copilot 使用原有系统追加，CLI 和 DeepSeek 保持现有上下文适配。并非每个引擎都支持独立 developer 角色或相同联网能力。

demo、disabled、review-only、consult-readonly 和专用 systemPrompt 任务不注入，保持受限证据/执行边界。每轮交接配置以覆盖原生会话恢复，不另加用户消息、自动搜索或每工具推理。environment-default 改为默认启用，旧 FORGE_SHELL_GUIDANCE_EXPERIMENT=0 保留显式退出；没有改动私有运行配置或原生 Harness 搜索开关。

适用 AI-01 复用原生能力、EVID-01 区分证据与未知。整体上下文契约正文与流程同步 [架构说明](../../../docs/ai-coding-architecture.md#多引擎适配边界)。服务加载仍需当次授权，不以源码默认值冒充已上线。

## 最小验收

定向验证默认注入、原指令保留、受限策略以及三类提示契约：技术选型查询官方；简单 Bug 不强制联网；离线如实标注。字符串契约测试只能证明规则存在；目标版本加载后，三个真实 Harness 场景仍需查看原生工具轨迹与最终回答，不能用断言代替模型行为验收。不建设评测平台。
