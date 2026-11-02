# 必要设计

## 实现与边界

适用 OBJ-01、NAV-01、CTX-01、FEED-01、AI-01、EVID-01、CTRL-01、IDEM-01，无例外。分析任务稳定 ID 不等于原生 AI 线程。调用方保存问题、requestId 和任务 ID；取消请求与实际退出分开。后续补充管理员应用授权页面，交互边界见下节。

## 管理员应用授权页面

入口在业务咨询原配置中，打开 `/tools/fore-consult/access`。不新增侧栏模块。主对象为已有 clientId，按应用与企业查看授权元数据，沿用原管理员 API、ProjectCatalog 和权限，不创建另一套账号或配置存储。独立页面用于跨应用管理和可分享定位；颁发、轮换与撤销依附对象，以受控 Sheet 承载，关闭后恢复触发器焦点。

GET backend-clients 返回有界搜索结果（最多 200 条并标明截断）、可授权项目选项和本实例开关。查询显式排除 secret_hash、票据及明文 secret。后台再次验证 ADMIN；普通用户页面不发管理请求，应用票据不能访问。管理员可在分析功能关闭时准备或撤销授权，业务换票与任务执行仍受原功能开关约束，页面不自动启用服务或重启。

颁发支持可选 UUID Idempotency-Key，按可信管理员 ID 与请求 UUID 确定稳定 clientId，单实例同步检查；相同键已完成时返回 409 CREDENTIAL_ALREADY_ISSUED，不再次生成或读取旧密钥。页面仅将非敏感申请草稿和请求 UUID 按当前用户保存到 sessionStorage，刷新后复用；确认已安全保存后清除。没有该请求头的原 API 行为保持兼容，不禁止同一应用/企业显式签发多组独立凭据。撤销重复执行不再增加版本。轮换保持企业、项目和原任务归属不变；需要改变范围时重新颁发并明确处理旧授权，页面说明新 clientId 不继承旧任务。

表单保留失败草稿；写请求不自动重试，进行中禁止重复提交/关闭，超时明确结果未知，先刷新核对版本。秘密响应仅进入组件短期内存，不进入 TanStack Query、持久存储、日志或路由。结果显示实例地址、clientId、secret、企业及有效期，支持复制/下载服务端配置；管理员确认安全保存后清除，无法重新查询旧 secret。失去 ADMIN 身份后清除并卸载授权内容。刷新/离开浏览器前对未保存密钥或进行中请求给出保护提示；已关闭或丢失密钥通过显式轮换恢复。

桌面使用平铺授权列表和侧边编辑层，窄屏为全宽 Sheet，44px 触控、可滚动正文与可达操作栏；Radix 保持焦点、Escape/关闭与触发器恢复。目标验收覆盖窄屏/矮屏、创建/查重、复制失败、结果未知恢复、一次展示清除、轮换/撤销确认、普通用户与应用票据拒绝、关闭功能时的管理和换票差异。新增只读元数据查询及原撤销条件，无新增 DDL，无人工执行 SQL。

研究依据：[OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) 的访问控制和轮换/撤销边界、[WAI-ARIA Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) 的焦点与键盘约束（2026-11-02 查阅）；沿用现有 React/Radix 组件及主题 tokens。

fore-consult 持有应用授权、票据、任务和结果。管理员沿用 Forge 真实身份签发授权；服务凭据不生成 AuthPrincipal，不进入用户 JWT。新 /api/fore-consult/v1 路由始终自行认证；在 JWT protected-patterns 覆盖所有 API 的部署，精确将这三个业务路由前缀交给专用认证，其他路由不放开。服务端每次查询都核对票据、凭据版本、到期和禁用状态；一个 clientId 只绑定一个企业，不能用请求 tenantId 改变授权。

凭据和 token 均为 SecureRandom 256 位随机值，只保存 SHA-256；凭据只在签发或轮换响应中出现一次。短期 token 最长 15 分钟，绑定凭据版本。管理员轮换/撤销后旧票据失效，原任务归属不变。每次签发记录管理员、时间和版本，无凭据日志。TLS 由部署入口负责；不发布真实凭据。

任务唯一键为 clientId + requestId，摘要包含完整规范化业务输入。相同键同内容返回原任务，不同内容 409。会话关联只是本应用的问题关联字段，不接续任何共享原生线程：每个任务通过现有 AgentOneShotRunner 独立运行，避免跨企业上下文复用。输入原文、上下文和源码资料作为 user 数据，固定规则在 system 中；工具策略 disabled，cwd 为空，沿用平台业务默认模型/账号，每次执行重新解析并记录配置版本。

只读取管理员授权的 ProjectCatalog 项目；请求的 systemIds 使用目录稳定 ID，显示名不参与授权。evidenceRefs 显式指定项目、相对源码路径及行区间，服务端检查真实路径、排除策略、扩展名、敏感文件名、大小和行数。不跟随任意 URL，不读取凭据文件，不继承项目关联关系扩大范围。未提供源码引用时可基于问题与附件提取文字分析，但必须标明没有独立核验源码/数据库；不声称等价于交互咨询的自主源码探索。图片二进制、数据库/Web 登录、回调和自动发现留待明确需求，不隐式提供。

模型只生成分析 JSON；服务端验证字段、枚举、长度和引用 ID。证据列表由服务端注入，不信任模型编造链接。没有证据不得作为已确认事实；建议不代表已执行。yoooni-agent 使用 DeepSeek 生成三个同结论的通俗回复，保存分析任务 ID、分析原件、候选、人工修改和确认发送记录；Forge 没有飞书发送端口。

持久队列最多 64 个未完成任务、每凭据最多 8 个；单进程最多 2 个受管模型调用，工作线程退出前不释放名额。新增 AgentOneShotRunner.runManaged/cancelManaged，复用原执行器且不改变旧调用。取消/超时先置 CANCEL_REQUESTED 并请求引擎中断，不直接中断等待线程；只有引擎终态确认后才置 CANCELLED/TIMED_OUT。非正常 stopReason 拒绝成功输出，输出超限有界保留并请求取消，未知退出继续等待。中断无法确认时保留状态与名额，不谎报已停止。启动将旧 RUNNING/CANCEL_REQUESTED 标为 INTERRUPTED，不自动重放；QUEUED 可继续。失败重试由调用方显式提交新 requestId 并关联原任务，原幂等键永远查询原结果。

## 风险与验证

L3：新增身份、企业隔离和异步契约。定向覆盖管理员签发、票据轮换/过期、跨企业和跨应用拒绝、幂等并发、持久恢复、取消/超时迟到结果、恶意模型 JSON/证据、路径越界以及 SDK 超时不重发。SQLite 自动 IF NOT EXISTS schema；prepare_sql_context 返回 PARTIAL，三张新表缺少运行 DDL 基线，不需人工 SQL。

研究依据：RFC 6749 §4.4（服务端 Client Credentials）、RFC 9110 §15.3.3（202 不等于完成）、OWASP Multi Tenant Security（企业选择须绑定已验证身份）。源码/测试、部署、真实模型与跨系统人工发送流程分别验收。保留旧 SDK 用户协议，不推送、不重启。
