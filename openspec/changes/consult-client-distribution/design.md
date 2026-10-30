# 业务咨询外部接入

适用 OBJ-01、CTX-01、FEED-01、AI-01、EVID-01、CTRL-01、IDEM-01，无例外。

## 组件与协议

- `sdk/forge-consult-client` 是独立、无框架、无运行时依赖的 ESM 包，浏览器及 Node.js 22+ 共用；原 Widget 和历史 delegation SDK 文档不是本次实现依据。仓库中旧 Session Client/Starter 仅遗留 OpenSpec 和 target 产物，不能声称仍有可复用运行源码。
- 独立业务入口 `/api/fore-consult/client/ws` 是现有聊天引擎的薄适配器，区别于原方案讨论中的同路径子协议：这样保持旧 Widget 协议和握手不变，服务端只接受业务命令，不解析开发命令全集；不建立第二套 Agent、会话事实或队列。
- `ConsultClientApplication` 由 fore-consult 实现，负责用户、咨询对象、首问/追问编排与持久请求。`ConsultClientRuntime` 由 chat 实现，只创建已授权运行元数据。稳定咨询 ID 对应原平台运行 ID，底层 AI 账号继续逐轮由现有策略决定。
- 调度包仍通过 user 输入承载，与平台一致；不将包含用户问题的渲染结果提升为 developer/system 指令。外部历史展示沿用既有调度标记提取原始问题，旧版交接资料保留在原记录但不作为公开问题正文返回。
- HTTPS tickets 复用当前用户 Access Token，票据有 30 秒 TTL、一次消费、Origin 绑定和容量限制。WSS 首帧认证限时 5 秒，未认证不发业务资料。单实例票据重启后失效，客户端重新领取；无需 Redis。正式启用必须开启已有登录鉴权；接入默认关闭。
- 沿用账号登录及精确外部 Origin 配置。每个连接有消息大小/频率限制，总连接有上限；每个业务命令检查 token，出站每帧检查过期，撤销在有输出时最多每秒复核，避免每个 token 查询 SQLite。复核失败即关闭，不宣称登出零延迟推送。外部 API 即使管理员也仅允许本人咨询，不信任请求内的 userId/appId/AI 账号/源码路径。
- 一个客户端连接绑定一个咨询，避免切换期间迟到事件串流。客户端可用多实例管理多咨询；同咨询并发发送由现有原子准入返回 TURN_BUSY，一期不对外提供隐式排队。
- `accepted` 表示业务请求已经登记，不表示模型已接收或回答成功；`send.accepted` 继承现有发送回执语义。终态由 completed 的 stopReason 判断，错误和未知发送状态不得自动重放。
- 同一用户 requestId 持久绑定问题、附件列表和咨询；内容不一致拒绝。SDK 重连只恢复观察，不重发问题。epoch/游标用于有界回放，ready 要求读取持久历史快照；历史分页独立于 AI 登录。历史快照不是模型已读全部上下文的证明。
- 现有附件存储负责授权路径和类型限制；外部上传只返回不透明 ID，发送按本咨询元数据解析。投影只返回问答和状态，不返回工具原文、磁盘路径、账号与系统指令。用户/模型主动写在回答中的敏感信息不是协议投影能够保证自动消除的内容。

## 交付与状态

draw.io 使用团队 L2 系统协作模板的视觉语言，原生图形、文字与连接器，分别表达静态协作和执行/恢复。源码、SDK tarball、源图及同源预览随本次交付；不发布公共 npm，不改各项目源码，不重启服务。

新增 consult_client_request 为应用启动自动 schema，无人工待执行 SQL。prepare_sql_context 为 PARTIAL（新表不在既有知识基线）；字段根据本次代码定义，未声称已核验运行数据库。

参考：OWASP WebSocket Security Cheat Sheet（首帧认证、逐消息授权、URL 不传可复用 token）、Spring WebSocket API（Origin 与连接发送）、Node.js Globals（WebSocket/fetch）及 draw.io 模板。2026-10-30 核对。真实公网 TLS、代理空闲超时、Origin、用户资源范围及长会话恢复仍需实际联调，不用本地 mock 替代。
