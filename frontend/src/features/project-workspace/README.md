# 项目库

统一入口为 `/tools/project-workspace`，只展示一份项目列表。通过“添加项目”发现本地目录或手动登记，打开项目直接进入 AI 工作区；画像、代码、知识探索、任务、验证及设置使用同一个项目身份。

## AI 工作区

工作区固定使用登记项目的目录，不再显示第二份项目侧栏，也不受旧工作区选择影响。未初始化项目仍能新建会话；已有会话按根目录及子目录筛选，继续使用原会话 ID。模块扫描失败可重试或检查项目目录。

旧 `section=modules` 和 `/tools/project-workspace/modules` 入口会尝试按上次目录恢复已登记项目，无匹配时回到项目列表；不会自动创建或删除项目。旧 `section=local` 打开添加项目流程。原 `tab=overview/code/tasks` 等详情链接仍可使用。

## 目录设置

在“目录设置”集中维护以下配置。配置中心不再重复提供编辑，旧目录配置深链会跳转到此页。

| 设置 | 用途 |
|---|---|
| 项目目录 | 一份扫描根目录列表，供项目发现、AI 工作区、上下文查询和本地 Git/文件操作共用 |
| 托管业务源码目录 | 收进高级设置，指定 Forge 克隆源码的位置，自动纳入扫描；留空使用 `~/.kai-toolbox/sources` |
| 扫描高级设置 | 统一维护隐藏前缀和缓存秒数 |
| 托管 Git 超时 | 克隆、拉取和更新的单次命令时限，界面使用秒 |

只扫描一级子目录；隐藏前缀每行一项，留空不按前缀隐藏。显式失效目录仍由项目发现提示。保存按块提交改动字段，列表采用替换语义，失败时保留草稿；保存不会创建、搬移文件或删除已登记系统。列表按扫描缓存周期刷新。

## 配置兼容与模块边界

复用 config-center 的公开 API 及原动态配置存储。项目目录使用 `toolbox.claude-chat.workspace.roots`；首次保存前会合并旧 `toolbox.projects.root`，保存时一个请求同时发布完整列表及 `directories-unified=true`。此后旧单目录值不再生效，显式清空列表也不会回退。原值保留供回退，不执行数据库迁移。托管源码仍使用原配置块。

Graphify 名称查询和跨项目拓扑通过已有 `LocalProjectResolver` 读取发现结果。`ProjectDirectorySource` 提供公共目录范围与扫描策略，WorkspaceRootResolver 实现，原项目列表和本地操作复用此接口，不建立工具模块之间的依赖。Graphify 显式绝对路径查询保持原行为。

## 知识探索

项目详情的“知识探索”（兼容 `tab=domains`）统一提供业务知识与跨项目关系；AI 工作区的知识图谱区域复用相同入口。Graphify 只在主动检查时扫描，不再要求按六类／四类文档补齐知识仓库。

业务知识沿用 `.forge/domains/snapshot.json`。跨项目关系显式选择当前项目及另外 1–3 个登记项目，各自在自己的目录读取 Graphify 与源码，校验引用后归纳双端关系，保存至当前项目 `.forge/topology/snapshot.json`。探索失败保留旧结果；源码、图谱或参与项目路径变化会显示过期。重新探索会替换当前范围对应的整份快照，不自动合并旧候选。

新接口为 `GET /api/project-registry/{id}/topology` 和 `POST /api/project-registry/{id}/topology/explore`，启动参数为 `{ engine, scope, projectIds }`，引擎支持 Codex / Claude。所有探索结果均为代码推断，不代表已确认业务规则、实际调用或真实 DDL。

只读 MCP `consult-readonly.knowledge_query` 用 `source=domain/topology/all`、`action`、`arguments` 统一查询已有知识，返回各来源的结果或可恢复错误。先用 `list_projects` 获取知识库 key，再检索；候选和继承查询由原知识引擎负责。两个旧 MCP 名称、知识库内容和评审版本约束保留，不自动晋升候选，也不支持重载或写入。
