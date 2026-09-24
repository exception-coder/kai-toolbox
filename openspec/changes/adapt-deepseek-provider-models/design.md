## Context and evidence

截图显示模型目录请求为 404、Claude 对话为 401 Invalid token。实现证据：`ProviderModelService` 将所有 baseURL 拼接 `/v1/models`，而 DeepSeek 官方模型目录是根路径 `/models`；其 Claude Code 兼容入口为 `/anthropic`。401 只能证明该轮认证失败，不能仅由 404 推定为同一个故障，也不能由代码判断用户的 Key 是否真实有效。

外部契约依据：[DeepSeek 模型目录](https://api-docs.deepseek.com/api/list-models/)、[Anthropic API 兼容入口](https://api-docs.deepseek.com/guides/anthropic_api/) 与 [Claude Code 集成说明](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code/)。

适用原则：OBJ-01、CTX-01、FEED-01、EVID-01、AI-01、IDEM-01。主对象为既有服务商档案及其会话，不创建第二套 DeepSeek 配置。服务商管理保留原覆盖层，新建会话保留原位置和草稿。目录刷新为只读、可重复操作；失败后显示原因与下一动作，不伪造模型或成功状态。原生输入、焦点与窄屏行为保持原组件契约。

## Routing and boundaries

- 服务商档案复用 SQLite `claude_chat_setting` 的单一配置记录，按认证用户 ID 隔离；关闭鉴权的单用户模式沿用全局记录。服务端持有 Key；HTTP 列表、保存响应与 WebSocket Ready 只回脱敏元数据。新建/切换会话携带档案 ID，由服务端按当前连接用户解析地址及 Key。已有会话继续保留其会话级网关快照，删改档案不隐式改写活动会话；旧客户端的直接网关参数暂保留兼容。
- 旧浏览器 `localStorage` 档案在原浏览器打开时按稳定 ID 批量导入。服务端遇到同 ID 已存在即保留服务端版本；确认成功后浏览器才删除旧副本。网络失败保留旧副本并显示重试，其他设备无需复制 Key。管理入口仍为当前会话的覆盖层，保留草稿、焦点和窄屏可达性；适用 OBJ-01、CTX-01、FEED-01、IDEM-01。
- 服务商 API 的模型查询优先接受档案 ID 并由服务端读取凭据；新建未保存档案的模型预览仍可用一次性地址/Key。编辑已存档案时留空 Key 表示保留原 Key，不通过读取接口泄露原值。存储边界与既有会话 `auth_token` 同为本机 SQLite 明文，不宣称提供静态加密；不打印或返回 Key。
- 编辑档案输入新 Key 时，模型预览用这次输入而不是旧档案 Key；已删除档案的切换请求返回明确错误并重发服务端当前 Ready，纠正前端乐观状态。创建请求带稳定 ID，重复提交相同内容返回原档案，ID 相同但内容不同则冲突，避免超时重试产生重影或误认成功。

- 只识别精确官方主机 `api.deepseek.com`。Claude Sidecar 将根地址及旧 `/v1` 地址规范为 `https://api.deepseek.com/anthropic`，并使用会话 API Key 作为 Anthropic auth token；不继承其他账号的 API Key 或模型默认值。
- 模型代理对官方主机请求根 `/models`，使用 Bearer Key；通用网关仍请求 `/v1/models`。成功目录按地址和凭据摘要缓存，不会将一个 Key 的目录误用到另一个 Key。
- 第三方会话的模型目录以 Java 网关代理为唯一来源，手动刷新也走它；Sidecar 原生 `supportedModels` 不得覆盖。异步请求只在地址、Key、引擎仍与发起时一致时写回，避免切换后旧目录串入新会话。
- 目录 401 明确提示开放平台 Key 认证失败；手填模型不能绕过认证。目录不可用但非认证错误时，可在现有会话配置中手填并显式应用，保留旧网关兼容能力。
- 实际对话 401 的 Key 有效性和模型权限需要用户在运行环境核对；本次不记录或回显 Key，不自动调用付费对话探测。
- Claude SDK 在失败轮次可能给出 `<synthetic>` 占位模型；诊断面板不得把它标成上游实际命中模型。
- 第三方 Claude Code 会话显式加载 SDK 的 project/local 设置，以保留项目配置和 `CLAUDE.md`，但隔离用户级 `settings.json` 中的网关 `env`、模型和认证覆盖。会话档案的地址、Key、模型仍是唯一路由输入，包括旧会话 resume。用户启用插件从个人安装目录白名单映射到 SDK `plugins`；个人 `~/.claude.json` MCP 只提取有效、启用的服务器配置，与会话内服务器按名字去重。无效配置返回可恢复错误，不记录凭据。官方 Claude 会话继续使用 SDK 默认设置来源；Codex 引擎沿用独立路由和设置处理。

## Verification boundary

使用纯路由测试、带本地 HTTP 服务的目录与凭据隔离测试、前端恢复文案测试，以及相应构建和 Forge 门禁。运行中的后端与 Sidecar 不会因本次编辑自行重启；真实 DeepSeek Key/模型对话验收必须在明确重启授权与有效 Key 下另行执行。
