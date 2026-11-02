# Codex 项目 Skill 前置检查超时

2026-11-02，修复范围为 L2：保持项目 Skill 优先、账号与配置边界不变，修正前置查询计时、进程复用和有界恢复。不重建或删除会话，不直接修改数据库运行状态。

## 现场与已知边界

- Forge 会话 `a748dacd-d9c3-4a9b-8c3b-434babef51ff`，目录 `D:\projects\yoooni-agent`，原生线程 `01a19379-a7b2-7421-b694-63779cd5ad0e`。
- 09:11:31.548—09:12:05.065、09:12:26.745—09:12:52.501 两轮均为 error。原生记录最后正常完成在 07:31:17；数据库 IDLE，待发队列为空。09:12:51.888 Sidecar 状态查询另有 1.5 秒超时；历史未知状态不得直接改为空闲。
- 报错 `Codex skills/list 超时` 对应旧 callAppServer 的总计时器：子进程启动、initialize 和业务 RPC 共用 20 秒；错误文本不能证明超时发生在扫描技能阶段。原前置查询分别为 skills/list 和 config/read 启动进程，且强制 reload。
- 本次只读复测没有重现历史卡死：旧 skills/list 总约 2.93 秒，初始化 2.211 秒、技能响应约 0.640 秒；旧双进程前置检查约 1.30 秒，项目指引和全局重复入口停用正确。历史现场缺少分段埋点，无法追溯断言卡在 initialize 或 skills/list，也不能宣称已查明某一插件导致阻塞。

## 修正与验证

- skills/list 与 config/read 共用一次握手，按返回 ID 保持请求对应关系；forceReload=false 仍由官方目录查询取得本轮真实 Skill，不跨轮次复用或持久缓存有效配置。
- 初始化和 RPC 各自保留 20 秒预算，RPC 从握手成功后开始计时。分段日志仅含方法、阶段、耗时与会话 ID，不记录配置、技能内容、凭据或请求正文；反向请求不能冒充客户端响应。
- 只读前置超时最多重试一次，上一进程确认退出后才可再开；取消、真实 RPC/配置错误和清理失败立即保持失败，不回退为忽略项目 Skill 的执行。thread/fork、thread/delete、turn/start 等写操作不因本改动自动重试。
- 项目 provider 声明、原有 skills.config 禁用项、套件可信适配器及非原生路径读取指引沿用原逻辑。主执行通过检查后继续使用原 thread/resume，不新增会话。
- 修复版实际前置检查约 1.06 秒：初始化 697ms、config/read 返回于 733ms、skills/list 返回于 1003ms、进程释放于 1053ms；保留项目 workflow Skill 指引与全局重复入口禁用项。原生 thread/read 成功读取同一线程，未发送 turn/start；notLoaded 仅描述该探针进程尚未加载线程，不是历史丢失。
- Sidecar 全部 TypeScript 编译输出至隔离目录；58 项定向回归覆盖真实管道清理、分阶段超时、单握手、响应乱序、取消、有界恢复、配置优先、未知配置不覆盖及原有 App Server 生命周期。最终检查以本次执行结果为准。

## 交付状态

源码已修正，目标版本尚未加载到常驻 Sidecar；未重启 Forge。需要用户单独确认 `node forge.mjs restart --scope backend` 后核对新日志、HTTP、原会话状态及至少 60 秒稳定观察，再在原会话核验正常续跑。前端、会话 ID、原生线程 ID 与历史文件保持原样。

当前会话状态接口需访问者身份，本次无凭据请求为 403；不得伪造身份、直接改库或以原生只读探针替代 Forge 端到端恢复验证。

参考：[官方 Skills 协议](https://learn.chatgpt.com/docs/app-server#skills)；整体职责见[AI 编程架构](../ai-coding-architecture.md#项目优先的-openspec-自动分级)。
