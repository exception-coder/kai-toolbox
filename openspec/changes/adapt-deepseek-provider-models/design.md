## Context and evidence

截图显示模型目录请求为 404、Claude 对话为 401 Invalid token。实现证据：`ProviderModelService` 将所有 baseURL 拼接 `/v1/models`，而 DeepSeek 官方模型目录是根路径 `/models`；其 Claude Code 兼容入口为 `/anthropic`。401 只能证明该轮认证失败，不能仅由 404 推定为同一个故障，也不能由代码判断用户的 Key 是否真实有效。

外部契约依据：[DeepSeek 模型目录](https://api-docs.deepseek.com/api/list-models/)、[Anthropic API 兼容入口](https://api-docs.deepseek.com/guides/anthropic_api/) 与 [Claude Code 集成说明](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code/)。

适用原则：OBJ-01、CTX-01、FEED-01、EVID-01、AI-01、IDEM-01。主对象为既有服务商档案及其会话，不创建第二套 DeepSeek 配置。服务商管理保留原覆盖层，新建会话保留原位置和草稿。目录刷新为只读、可重复操作；失败后显示原因与下一动作，不伪造模型或成功状态。原生输入、焦点与窄屏行为保持原组件契约。

## Routing and boundaries

- 只识别精确官方主机 `api.deepseek.com`。Claude Sidecar 将根地址及旧 `/v1` 地址规范为 `https://api.deepseek.com/anthropic`，并使用会话 API Key 作为 Anthropic auth token；不继承其他账号的 API Key 或模型默认值。
- 模型代理对官方主机请求根 `/models`，使用 Bearer Key；通用网关仍请求 `/v1/models`。成功目录按地址和凭据摘要缓存，不会将一个 Key 的目录误用到另一个 Key。
- 第三方会话的模型目录以 Java 网关代理为唯一来源，手动刷新也走它；Sidecar 原生 `supportedModels` 不得覆盖。异步请求只在地址、Key、引擎仍与发起时一致时写回，避免切换后旧目录串入新会话。
- 目录 401 明确提示开放平台 Key 认证失败；手填模型不能绕过认证。目录不可用但非认证错误时，可在现有会话配置中手填并显式应用，保留旧网关兼容能力。
- 实际对话 401 的 Key 有效性和模型权限需要用户在运行环境核对；本次不记录或回显 Key，不自动调用付费对话探测。
- Claude SDK 在失败轮次可能给出 `<synthetic>` 占位模型；诊断面板不得把它标成上游实际命中模型。

## Verification boundary

使用纯路由测试、带本地 HTTP 服务的目录与凭据隔离测试、前端恢复文案测试，以及相应构建和 Forge 门禁。运行中的后端与 Sidecar 不会因本次编辑自行重启；真实 DeepSeek Key/模型对话验收必须在明确重启授权与有效 Key 下另行执行。
