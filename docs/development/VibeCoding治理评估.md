# Vibe Coding 治理评估

2026-11-10。为后续全面治理盘点 Vibe Coding（前端 `frontend/src/features/claude-chat`、后端 `tools/tool-claude-chat`、Sidecar `sidecar/claude-agent`）中冗余、设计较好与问题较大的部分。依据为代码规模与结构统计、定向检索、Git 变更历史和 OpenSpec 任务状态；不是逐行代码审查，冗余结论中的产品取舍需负责人确认。

## 关键指标

| 指标 | 数值 | 说明 |
| --- | --- | --- |
| 代码规模 | 前端约 4.3 万行（含测试 1.06 万行）；后端约 4.35 万行（测试 1.65 万行）；Sidecar 约 2.6 万行 | 三层合计约 11 万行 |
| 后端模块体量 | 59 个 Controller、184 个 Service 类、26 个 Repository、44 张表 | 包含大量非 Vibe Coding 功能 |
| 近 70 天变更 | 327 次提交触及本模块，其中 149 次（46%）为修复 | 修复占比高，稳定性不足 |
| 变更热点 | ChatPage.tsx 改 97 次、ClaudeChatService.java 38 次、sessionManager.ts 37 次、useClaudeChatSocket.ts 33 次 | 热点与超大文件高度重合 |
| 超大文件 | ClaudeChatService 3413 行；ChatPage 2538 行；sessionManager 2143 行；useClaudeChatSocket 2131 行；codexAppServer 1707 行；PluginUpdateService 1485 行 | 均超过可维护阈值 |
| 交付积压 | 147 个未归档 OpenSpec 变更，104 个只差重启加载后验收 | 见 [OpenSpec 待验收清单](OpenSpec待验收清单.md) |

## 设计较好的部分（保留并作为治理范式）

| 设计 | 为什么好 | 依据 |
| --- | --- | --- |
| 会话身份与原生句柄分离 | Forge 会话编号负责路由，各引擎原生会话句柄持久化，正文留在引擎记录；Sidecar 重启或崩溃后可续接，进程近乎无状态 | `claude_chat_session.engine_sessions`；[架构与实现](../architecture/vibe-coding-架构与实现.md) §4 |
| 两条链路分别恢复 | 浏览器断线按事件序号回放，Sidecar 崩溃按句柄续接，两个失效域互不替代 | 同上 §3 |
| 引擎目录作为唯一准入来源 | 可选引擎、实验引擎准入、会话准入都读 Sidecar 探活结果，不在 Java 或前端复制规则 | `sidecar/claude-agent/src/engine/engineCatalog.ts`、`EngineCatalogService` |
| 幂等与有界重试 | 复制会话按请求编号去重；队列派发有回执；完成核对最多三次后挂起；删除撤回防止迟到消息复活 | `claude_chat_session_copy`、`queue_delivery`、`queue_retirement` |
| 工具授权按请求编号配对 | 用户决定送回对应挂起调用；修改参数需模型重新调用，不会批准新参数却执行旧参数 | Sidecar 审批路径、Pi / Copilot 适配说明 |
| 受控资源与写入授权 | 凭据不进模型；写操作限 LOCAL / DEV / TEST / UAT 并需授权原话与稳定 requestId；会话外文件只认助手引用 | `SessionArtifactReferenceService`、资源中心工具 |
| 状态口径诚实 | 区分实现完成、Agent 自验完成、实际验收通过；不展示虚构进度 | 自动推进、README 各节 |
| 产品与工程约束成文 | 产品哲学（OBJ / NAV / IDEM 等原则）与路由懒加载约束有来源、有验收问题 | `docs/product-philosophy.md`、`CLAUDE.md` |

## 冗余或越界（建议合并、迁出或删除）

| 项目 | 证据 | 建议 |
| --- | --- | --- |
| 会话入口过多 | 会话相关组件约 30 个：SessionList、RecentSessions、SessionBoard 与 SessionBoardDock、HistoryList、MultiSessionView、FloatingChatWindow、PendingSessionsBanner、SessionSummaryBar、SessionActivityBar 等 | 按 NAV-03 收敛为“一个会话列表 + 一个看板视图”，其余作为该列表的筛选或显示形式 |
| 监督与推进入口分散 | 监督横栏、监督看板、推进页、AutopilotDashboard、AutopilotProgressWorkspace、SessionAutopilotStatus、SupervisionSummary、Agent Dock 详情 | 收敛为“推进”单一视图 + Dock 中一条摘要 |
| 三条语音路径 | VoiceInputButton（听写）、MiniVoiceBar、NativeVoiceControl（Codex 实时语音）及 voice 目录 | 保留“听写”和“实时对话”两类能力，合并为同一入口与状态机 |
| 摄像头手势控制 | GestureDebugPanel、GestureFlourish 及摄像头授权流程 | 低频且涉及隐私授权，建议移除或放入实验开关 |
| 主题数量 | 4 组艺术皮肤（含变体）+ 6 套经典配色，每类组件各有材质配方 | 保留 2～3 套，降低每次界面改动的视觉验收成本 |
| 死代码 | `components/SessionWorkStatus.tsx` 无任何引用；`features/claude-chat-stable` 仅剩空目录（模块已于 2026-07-16 移除） | 直接删除 |
| 后端模块越界 | tool-claude-chat 中有 ERP / SRM 应用与数据库控制器、SRM 开发任务（srm_dev_* 表）、ERP 小程序配置、业务咨询客户端、嵌入式助手、插件更新（1485 行）、开发服务管理等 | 按“工具按 schema 隔离”约定迁回各自模块，Vibe Coding 只保留会话、队列、推进、评审与交付 |
| Codex 双通道 | `codexEngine.ts`（SDK，903 行）与 `codexAppServer.ts`（1707 行）并存；语音与续问建议依赖 App Server | 需确认：是否以 App Server 为主、SDK 仅作降级，避免两套事件转换长期并行 |
| 引擎数量 | 9 个引擎，除 Codex、Claude Code 外大多未完成真实账号验收 | 分“正式 / 实验”，实验引擎冻结新功能，只保持可用性 |
| 文档重复 | 模块 README 278 行，几乎每段附“待验收”说明，与 OpenSpec tasks 重复 | README 只写当前行为，验收状态以 OpenSpec 与待验收清单为准 |

## 问题较大的部分

| 问题 | 严重度 | 影响 | 证据 |
| --- | --- | --- | --- |
| 交付积压，真实环境验证缺位 | 高 | 104 个变更只差重启验收；重启需逐次授权，大量能力长期未进入真实使用，问题只能在使用中暴露 | [OpenSpec 待验收清单](OpenSpec待验收清单.md) |
| 超大且高频修改的核心文件 | 高 | 改一处易牵连多处，修复占比 46%；回归测试难以覆盖 | ClaudeChatService：43 个依赖、39 个公开方法、22 处 synchronized、9 个并发 Map；ChatPage：64 个 useState、28 个 effect、10 个查询、109 行 import |
| 后端模块边界失控 | 高 | Vibe Coding 改动与 ERP / SRM / 咨询功能互相影响，测试与发布范围无法收敛 | 见上表“后端模块越界” |
| 安全前提与产品定位冲突 | 高 | 会话表明文保存第三方网关密钥，按“单机单用户”设计；系统已有多账号、角色与部门；曾出现会话内明文发送管理员密码 | `claude_chat_session.auth_token` 建表注释；CLAUDE.md 仍写“无认证” |
| 数据完整性依赖应用清理 | 中 | 44 张表仅 7 处外键，删除会话需手工清理关联表，易留孤儿数据；删除语句引用不存在的表 claude_chat_session_affected_api | `ClaudeChatSessionRepository`；DDL 文件 |
| 引擎抽象不彻底 | 中 | 已有 engineContract / engineRegistry，但 Sidecar 仍有 50 处按引擎名分支（sessionManager 中 46 处），新增或修改引擎需改核心文件 | `sidecar/claude-agent/src/sessionManager.ts` |
| 依赖实验或预发布协议 | 中 | Codex 0.162.1 实验 realtime 与续问协议、DeepSeek SDK alpha 版本，上游变化可能直接破坏功能 | `sidecar/claude-agent/package.json` |
| 静默吞掉错误 | 中 | 15 处 `catch(() => undefined)` 类写法，故障难以定位 | Sidecar 9 个文件 |
| 测试不稳定 | 中 | ChatControlWorkspace 测试基线即失败；Markdown 文件与页面预览测试受懒加载超时影响，结果随机 | 2026-11-10 定向测试结果 |
| 多处独立轮询 | 低 | 会话看板 15 秒、记录大小 30 秒、引擎与工作区 5 分钟各自轮询，手机端耗电与请求量叠加 | 前端查询配置 |
| 命令失败治理只显示不统计 | 低 | 无法衡量 Shell 引导等治理是否有效 | `commandExecution.ts` |

## 治理路线建议

| 阶段 | 内容 | 完成标准 |
| --- | --- | --- |
| P0 止血（1～2 周） | 设固定加载与验收窗口清理积压；处理明文密钥与会话内凭据规范；删除死代码与空目录；修正不存在表的删除语句 | 待重启验收变更降到 20 个以内；密钥不再明文入库 |
| P1 拆分（2～4 周） | ChatPage 按视图与状态拆分；ClaudeChatService 按会话生命周期、队列、引擎切换、授权拆分；越界功能迁出 tool-claude-chat | 单文件不超过 800 行；Vibe Coding 模块只含本域功能 |
| P2 收敛入口 | 会话列表、监督推进、语音、主题、手势按 NAV-03 收敛；引擎分正式 / 实验 | 同一目的只有一个入口；实验引擎冻结 |
| P3 夯实 | 引擎差异下沉到适配器、消除按引擎名分支；补关键外键或级联清理；命令失败统计与可观测性；修复不稳定测试 | Sidecar 核心无引擎名分支；测试基线全绿 |

## 需要负责人确认

- 会话入口、监督入口收敛后保留哪种形态（桌面与手机是否一致）。
- 手势控制、艺术皮肤是否保留。
- Codex 是否以 App Server 为主通道。
- 团队正式支持的引擎范围。
- Forge 对外定位（个人自托管 / 团队共享），决定密钥与权限的改造力度。
