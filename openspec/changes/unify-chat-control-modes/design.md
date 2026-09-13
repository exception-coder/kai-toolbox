## Context

Production / M 档跨前后端变更。当前 ai-chat/ChatPage 使用独立 conversation 表、REST/SSE；claude-chat/ChatPage 依赖全局 ChatRuntime 和 WebSocket/Code Agent。AiChatService 当前自动提供 ChatToolService，不能视为纯 LLM。Graphify 未覆盖此次精确符号，使用当前源码和定向调用检索补齐事实。

## Goals / Non-Goals

统一交互入口并明确执行控制权。保留 Code Agent 能力、历史、任务、权限、模型/引擎选择、悬浮与分屏；不统一两套数据库或流协议，不迁移既有会话。保留 AI 对话的图片、视频及模型配置。

## Decisions

- 遵循 OBJ-01、NAV-01、CTX-01、AI-01、CTRL-01。claude-chat 新增薄控制模式页面，默认 CODE_AGENT，URL control=llm 显式选择 LLM。选择器置于现有页头，避免新增一层页签。两种模式保留各自身份和草稿；LLM 首次访问才挂载，访问后保留隐藏实例，流式与切换互不串线。
- Code Agent 原 ChatPage 只接收展示插槽；服务端、WebSocket 协议及权限模式保持不变。控制模式与 permission mode 为不同维度。ChatRuntime 懒激活排除纯 LLM 路由；已有 Agent 任务可在后台继续，切换不代表取消。
- ai-chat 通过 public-api 暴露页面。原路由重定向到统一入口，菜单目录仍由 manifest 生成；保留原 AI 对话权限码，统一页内按既有权限判断可用模式，不扩权。
- FeatureManifest 的 controlPermissions 声明统一入口下的模式权限；菜单允许任一模式授权，RouteGuard 在 entry 路径按控制参数校验，其他路由（尤其 session-client）仍用原权限。只有 LLM 权限时默认入口恢复到 LLM，不能通过添加 control 参数进入 Agent 专属页面。PRD 委托授权继续使用原校验通道。
- 纯模型服务保持在 tool-ai-chat，无 tool-claude-chat 依赖。CompletionControlPolicy 在保存消息前拒绝非 LLM 模式，省略模式兼容为 LLM；AiChatService 不再注入或调用 ChatToolService，不发工具定义，即使上游返回 tool call 也明确失败，不执行。客户端发送 controlMode=LLM，接口天然绑定独立会话命名空间。保留 stop、SSE、计费和附件逻辑。
- 不引入统一大服务去转译两种执行协议。模式层选择已有独立通道，后续能力可独立演进；无必要的新公共模块或空策略实现。

## Risks / Trade-offs

旧 AI 对话工具能力按用户纯 LLM 目标退出；相关工具类暂不清理，其他引用不变。恢复旧客户端工具循环不是本次兼容目标。LLM 与 Agent 历史不自动拼接，避免权限和消息类型串线。切换不改变正在执行的 Agent，模式切换不发送消息。模型凭据不可用时明确显示原错误。

## Migration Plan

前端入口和后端策略共同发布；无 DDL。回滚本次提交恢复旧入口和工具循环，不需回滚数据。专项测试：默认 Agent、纯 LLM 不激活 Agent、切换状态保持、旧链接、权限、未预期工具请求；运行宿主构建和现有 Agent 回归，更新版本启动后观察至少 60 秒。

## Evidence and review

Agent 自审：接受用户的控制模式方案，选择最小执行边界。Anthropic 的 Routing 说明专门处理通道有利于职责分离；本项目使用用户显式枚举而非 LLM 自动分类。来源 https://www.anthropic.com/engineering/building-effective-agents （2026-09-13 查阅；工具框架时效性不用于此次确定性协议决策）。无未决业务选择。
