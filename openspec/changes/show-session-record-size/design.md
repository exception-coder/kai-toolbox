# 会话记录大小设计

## 对象与交互

原则：OBJ-01、NAV-01、CTX-01、DENS-01、FEED-01、EVID-01、IDEM-01；无例外。主对象是 Forge 逻辑会话 ID，原生记录以引擎、句柄及已保存的 Codex 授权目录定位。复用会话列表、最近会话和会话看板，不新增页面或写操作。

大小在引擎、时间旁以中性小字展示，可窄屏换行。当前会话补充同样的统计说明；加载与失败不会阻止切换、输入或发送，失败可重试。缓存按用户与会话定位信息区分，旧会话响应不能投影到新会话。自动刷新只有只读元信息操作。

## 统计口径

统计逻辑会话已保存的各引擎原生记录，按真实路径去重；不是模型上下文窗口、Token 数或整个工作目录大小。Claude 包含主 transcript 与该会话的 subagents JSONL，Codex 包含匹配 thread 的 sessions/archived_sessions rollout，Pi 使用已保存的原生 JSONL 路径，Antigravity 使用已适配的 transcript，Copilot 统计绑定 session-state 目录的文件。工作区源码、Forge 上传附件、引擎认证配置及共享数据库不计入。无法确认布局的引擎保持未支持；已知部分显示“部分已知”，不冒充总大小。

每批最多 100 个逻辑 ID，以主键 IN 集合查询一次元数据并应用既有访问策略。文件定位只扫描受限深度与条目数，短时缓存目录索引，刷新时重新读取命中文件元信息；不读取或解析大型 JSONL。目录和文件真实路径必须留在引擎存储根内；Pi 句柄只接受默认会话根内的 JSONL。扫描失败、上限、跨界链接、路径歧义不伪造成功；返回可观察状态，不返回正文、凭据或文件绝对路径。缓存条目数量受限。

## 已核对依据与边界

- 现有 `SessionHistoryService`、`AntigravityHistoryReader`、`piEngine` 提供当前布局和句柄依据；内容索引不用于计算大小。
- [Copilot 配置目录](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference#session-state) 确认 session-state 为每会话目录，共享 session-store.db 不计入。
- [Claude 子 Agent 文档](https://code.claude.com/docs/en/sub-agents) 确认会话子目录中的 subagents transcript。
- 共享存储或未确认的 Qwen、Trae、OpenCode 不据目录名推定完整字节数。后续原生存储契约确认后再扩展适配。

每个扫描至多 20,000 个条目、1 秒；每批在后续定位开始前检查 3 秒总预算。达到预算返回未完整获取，不能把中断定位解释为记录不存在。索引最多保留 32 个根目录、30 秒；已定位文件每次重新读取长度，新增路径最长等到索引刷新。真实文件系统调用本身可能受磁盘或网络延迟影响，不宣称强制 IO 超时。

验证集中覆盖账号路径隔离、多引擎汇总、缺失/零字节区别、越界与扫描边界、批量授权、异步前端身份及窄屏展示。不执行全套前端回归；后端新版本业务验收等待本次重启授权。
