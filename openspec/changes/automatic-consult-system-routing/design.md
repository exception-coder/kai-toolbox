# 自动系统定位设计

## 范围与交互

会话13846853-ec73-4a4f-accb-d99c04201e01的调查显示，单目录绑定限制了前端探索，图谱预热和排队也使定位停滞。单项目未命中或图谱未就绪不等于用户必须提供 URL。

一期实现有界候选、跨项目源码读取、服务端焦点、用户纠正和授权校验。不引入向量库、独立路由模型、全磁盘扫描或新的项目关系页面。扩大候选上限等待实际命中和耗时数据。

适用原则：OBJ-01、NAV-01、CTX-01、DENS-01、FEED-01、AI-01、EVID-01、CTRL-01、IDEM-01，无权限例外。

- 主对象是原咨询sessionId，项目使用ProjectCatalog的id和完整路径；运行cwd仅为启动锚点。沿用原页面，不增加导航或强制系统选择；标题可从问题生成，指定系统是可选动作。
- 原对话展示候选与焦点，低频纠正渐进展开。切换只改咨询元数据，不新建咨询、切换WS或清空草稿/附件。失败原地重选，读取失败可重试；关闭不取消已经发出的请求。
- 原生select和按钮支持键盘及焦点，窄屏换行。恢复历史咨询收起首问面板，避免双输入区覆盖；旧咨询不轮询新范围。
- 焦点持久化，重复用户选择产生相同结果；比较原快照并限定PENDING，拒绝并发旧写和归档后写。用户纠正优先，模型不得覆盖。创建沿用既有链路，不新增重连创建逻辑。

## 候选与证据快照

ConsultSourceRoutingService投影ProjectCatalog：目录可用、未排除、ProjectAccess允许、咨询配置已显示且路径一致。最多八个，按当前用户最近100条已定位咨询使用次数、配置顺序、稳定名称/id排序。未识别的启动锚点不计为使用命中，不用其他用户历史排序。排序只决定探索优先级。

复用consult_session.evidence_route_snapshot，不改表：版本2对象含routes（原确认的数据归属）和sourceRouting（automatic、focusedProject、projects、evidencePath、reason、selectedBy）。旧数组兼容读取，保留原单目录。模型焦点标为MODEL_INFERRED，用户指定标为USER，不能把推断转成人工确认的业务规则。

source_projects返回候选id及显示名，不向模型暴露根路径。助手结合截图语义先查最可能三个，未命中换项目；找到前端后沿请求核对服务端，以真实服务端相对文件和理由select焦点。文件存在只证明可引用，不能证明语义判断正确。用户纠正后保留候选以探索关联证据，但不得自动改回焦点。证据仍不能区分时才请求URL等最少信息。

## 工具与权限

source_context/source_search/source_read/source_git_history增加候选id。每次通过原HMAC会话签名向后端核验当前范围；具体文件/子目录校验真实路径及排除策略。Sidecar用AsyncLocalStorage隔离并发根，路由映射缓存按根隔离。未知项目、越界、撤销或核验失败均拒绝，不回退锚点。旧咨询范围以JSON null返回，继续原目录并复查目录策略。

source_projects(select)是受限咨询具名元数据写入例外，readOnlyHint=false；不开放终端、Git或业务写入。新默认流程登记；旧冻结流程仅具备source_read时由服务端追加，原快照不变。两引擎共用白名单，不接受模型指定任意根。

AUTO无焦点时拒绝数据库发现和查询；定位后仍使用原流程冻结的resourceBindingIds，并校验对应系统、环境、能力及当前启用状态。源码候选不授予数据库范围，生产禁用与凭据保护保持原约束。

自动探索每项目图谱预算最多10秒。预热/排队不是未命中，不缓存为完成证据，不反复等待同一项目。source_context返回最多20个根层结构线索，允许沿已确认子目录定位，仍禁止根目录扫描；支持小程序wxml/wxss/wxs。既有图谱和输出上限保持。

## 依据及交付边界

本地事实与用户问题是决策依据。外部取舍参考：[Anthropic的简单可组合routing工作流](https://www.anthropic.com/engineering/building-effective-agents)、[MCP工具注解不能替代权限执行](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/)，查阅于2026-10-17，不据此增加框架。

数据库基线已核验，仅应用运行内UPDATE，无人工执行脚本。实现、构建、运行事实分别记录在tasks。尚未获得本次重启确认，后端/Sidecar新版本未部署，真实截图跨系统咨询待运行验收。
