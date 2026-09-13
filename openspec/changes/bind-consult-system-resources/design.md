## Context
统一资源入口已有 discover_resources/execute_resource；后者包含应用 CALL，不能整体进入只读咨询。节点配置已随版本和会话冻结。

## Decisions
1. common 增加 ReadonlyResourceGateway 端口，ops 实现；项目目录提供源码路径，精确规范化匹配且歧义拒绝，不按显示名或子目录猜测。
2. 节点增加 resourceBindingIds，旧配置为空。管理员选择现有数据库绑定时装配 consult_resources 和 consult_resource_query。凭据不进入配置/提示词/目录。
3. 咨询 HTTP 适配按底层会话 ID 查询已冻结节点，仅查询启用节点声明的资源，发现与执行均按当前系统精确匹配。环境、启停、QUERY 能力由统一服务再次校验；不提供 CALL 或自定义操作参数。
4. 通过服务端装配向双引擎 readonly MCP 注入会话 ID；不接受模型传入系统/环境/连接地址。旧专用工具保留兼容，选用统一资源节点时移除该节点旧数据库工具，避免隐式回退。
5. Agent 流程节点内展示资源选择、系统/环境/用途/状态和资源中心入口，不增加平行资源编辑表。适用 OBJ-01/NAV-01/CTX-01/DENS-01/FEED-01/AI-01/EVID-01/CTRL-01，无例外。对象为节点，身份为节点 ID 和资源 binding ID；加载错误可重试、保存沿用候选版本，移除后保留配置并展示缺失，可取消勾选。链接新页打开保留草稿。键盘原生控件、窄屏堆叠验证。

## Risks
会话级能力为启用节点并集，不是独立节点沙箱。资源选择不会自动批准生产环境。当前通用资源限 LOCAL/DEV/TEST/UAT。旧版本不迁移不自动发布。

## Verification
验证跨系统拒绝、停用/删除/生产拒绝、只读 SQL 和会话冻结、双引擎装配、资源编辑持久化；完整构建、测试、Forge 及重启稳定观察。
参考 MCP tools 规范 https://modelcontextprotocol.io/specification/2025-06-18/server/tools ：工具元数据不代替服务端输入与访问校验。

运行查询入口验证会话 HMAC 签名，签名只通过服务端装配注入 MCP 环境，不作为模型工具参数；跨会话和后端重启失效，避免仅凭会话 ID 调用资源。
