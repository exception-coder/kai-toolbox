## Context

ProjectRegistryPage 提供 systems/local/modules 三个区域；ProjectWorkspacePage 从工作区扫描选择目录并保存在 localStorage。RegistryProjectDetailPage 已掌握项目 ID、路径、画像及任务，但没有直接使用模块工作区。用户已确认合并方案。

## Goals / Non-Goals

使用登记项目作为唯一身份，工作区固定使用该项目路径；保留未初始化工作、现有会话和任务。目录发现与本地操作统一配置来源，兼容已保存的旧目录。不迁移业务数据、不修改原生会话 ID、不新增平行项目模型。

## Decisions

- 项目库默认显示项目列表；添加项目展开本地发现和手动登记，避免平行项目列表。保留 directories/environment/diagnostics 全局维护入口。
- 详情默认打开 workspace 标签，其他标签及旧深链仍可访问。模块页接受 scope，只读取当前项目模块；不依赖扫描发现结果，也不应用旧 localStorage 选择。
- 项目工作区展示根目录会话入口和当前目录及子目录的历史会话，调用现有 chat runtime 恢复同一个会话 ID。路径匹配必须有目录边界，避免把同名前缀项目混入。
- 独立模式兼容内部旧调用，外部旧 modules 链接按已登记项目与上次路径匹配恢复；未匹配时回项目列表，不静默登记。
- UI 采用既有 quiet-luxury-ui 和共享 Button/Input，CONSERVATIVE 模式：平铺布局、精细分隔线、窄屏换行，固定项目下不展示第二个项目侧栏。

## Risks / Trade-offs

会话名称修正（2026-09-13）：项目库必须复用聊天会话的显示名称规则，优先展示非空标题，其次使用 cwd 末级目录名称（兼容 Windows/Unix 与尾部分隔符）。原有“未命名会话”直接兜底造成与最近会话名称不一致。名称仅用于展示，不重命名持久记录、不替换 sessionId，也不使用项目别名覆盖会话标题。

- 项目切换串上下文：详情按项目 ID/path 重建 scope，查询键包含路径，历史会话按目录边界筛选。
- 注册目录不在扫描根内：根会话入口仍可用，模块 API 保持原权限，失败时提供目录设置恢复入口。
- 全量会话接口仍沿用现有 API；只在工作区挂载时读取，不在项目库首页启动模块、图谱或会话扫描。
- 并行改动：只提交本任务的项目工作区与目录合并范围，不纳入其他任务的 OpenSpec 看板、菜单目录和 Graphify 变更。

## Migration Plan

前后端发布后统一入口和目录源生效。旧 project ID、task ID、session ID 及目录配置键均保留，无 SQL 迁移。旧模块入口可恢复已登记项目；回滚需同时还原前后端代码，旧目录值仍保留供恢复使用。

## Verification

测试统一导航、添加项目、旧链接恢复、未初始化项目进入、scope 优先级与会话路径边界；执行类型检查、构建和质量门禁。真实浏览器可用时检查桌面及移动布局，不把组件测试称作视觉验收。

### 验证结果（2026-09-12）

- 前端 4 个测试文件、25 项通过：UnifiedProjectWorkspace 覆盖统一导航、添加、未初始化及旧链接；ProjectWorkspaceScope 覆盖目录隔离；ProjectAIWorkspace 覆盖根会话、原 ID 恢复及失败恢复；RegistryManagement 覆盖目录保存、旧值导入、显式清空、校验和失败保留草稿。
- `npm run build` 通过（含 TypeScript 和特性边界检查），宿主内嵌 index 与本次 dist 一致，入口资产存在。浏览器视觉验收未执行。
- `mvn -B -pl tools/tool-projects,tools/tool-claude-chat -am -Dtest=UnifiedProjectDirectoriesTest,WorkspaceRootResolverTest,WorkspaceScanServiceTest -Dsurefire.failIfNoSpecifiedTests=false install`：9 项通过，覆盖多根扫描、共享 Git 范围、旧值退出及扫描兼容。
- 42 模块宿主 install 成功。受控重启后端 18080、前端 5173、Studio 3000；本次 Java PID 79128，启动成功，连续 72.045 秒进程与重启次数稳定，HTTP 持续 200。
- 实际目录接口返回 2 个根、28 个项目；工作区和旧项目列表使用相同根范围，根内 Git 200、根外 Git 400，统一目录配置块可读取。
- Forge CLI `verify -Project . -Format json`：status/staticStatus/runtimeStatus 均 PASSED，实际 9 次 API-RUNTIME-001、0 个静态 checker；构建与专项测试单独提供静态证据。已有微信辅助服务和 Ollama 嵌入服务不可用不属于本次修改范围。

以上为本地执行结果；当前切片完成后保持 change 活跃，不声称已归档或完成浏览器视觉验证。

## Unified directory configuration

用户追加要求取消默认项目目录和工作区目录的区别。统一使用已有 workspace.roots、hidden-prefixes 和 cache-ttl-seconds；界面命名为项目目录。托管源码位置收进高级设置。

WorkspaceRootResolver 实现 common 中的 ProjectDirectorySource，供原项目列表、Git/文件操作和 AI 扫描共用。ProjectsProperties 只作为旧 root 的兼容来源，不再提供独立编辑入口。目录授权沿用根内校验，不因合并开放任意路径。

首次保存前展示并合并旧 root 与 workspace.roots；单次 workspace 配置请求同时保存合并列表和 directories-unified 标记。保存失败保持旧配置；成功后旧 root 不再影响有效范围，即使列表为空也不回退。保留旧值便于回退，不执行数据库迁移。扫描和缓存规则使用同一来源；旧项目列表响应保留 root 字段表示首个目录，但 items 聚合所有根。

该追加范围涉及跨模块读取与配置兼容，提升为 L 档。新增测试覆盖第二个根扫描、根外访问拒绝、迁移合并和清空后的禁止旧值复活。需要后端构建与受控重启验收。

## Open Questions

无。用户已确认项目入口及目录合并目标，最终范围为 L 档跨模块变更。Agent 自审重点是身份与路径隔离、配置保存失败回退及旧配置不复活。
