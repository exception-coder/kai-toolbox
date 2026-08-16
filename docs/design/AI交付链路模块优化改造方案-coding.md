# AI 交付链路模块优化改造编码摘要

本文是《AI 交付链路模块优化改造方案》的实施坐标，覆盖尚未完成的 PRD 前端、Delivery Center、ReqPool、Project Workspace 与可靠性收口。改造保持 REST、SSE、数据库和用户交互契约不变，采用逐组件迁移与门面委托的方式降低回归风险。

## 1. 实施边界

- Presentation 只保留路由、输入输出适配和页面组合。
- React 业务流程进入 feature 内 hooks/use-case，纯展示进入 components，确定性转换进入 lib。
- Spring Controller 不直接访问 `JdbcTemplate`，事务编排进入 focused application service，SQL 归 Repository。
- 跨 feature 只使用 `public-api.ts` 或平台级稳定契约；不得新增对其他 feature 私有目录的依赖。
- 不修改 REST、SSE、数据库表结构、FeatureManifest 和现有用户文案。

## 2. 涉及类清单

| 模块 | 文件 | 目标职责 |
|---|---|---|
| PRD | `frontend/src/features/prd-clarify/pages/PrdClarifyPage.tsx` | 仅保留页面查询与面板组合 |
| PRD | `frontend/src/features/prd-clarify/components/panels/` | 澄清、生成、编辑等独立交互面板 |
| PRD | `frontend/src/features/prd-clarify/components/dialogs/` | 修订、拆分、历史和启动类弹层 |
| PRD | `frontend/src/features/prd-clarify/hooks/` | 会话、开发文档与估算状态所有权 |
| Delivery | `frontend/src/features/delivery-center/components/DeliveryStageDialog.tsx` | 仅保留阶段弹层编排 |
| Delivery | `frontend/src/features/delivery-center/components/stages/` | PRD、TDD、代码、测试和运行阶段展示 |
| ReqPool | `tools/tool-reqpool/src/main/java/com/exceptioncoder/toolbox/reqpool/api/ReqPoolController.java` | HTTP 协议适配 |
| ReqPool | `tools/tool-reqpool/src/main/java/com/exceptioncoder/toolbox/reqpool/service/` | 条目命令、PRD 同步、组合分析与开发入口用例 |
| ReqPool | `tools/tool-reqpool/src/main/java/com/exceptioncoder/toolbox/reqpool/repository/` | ReqPool SQL 唯一容器 |
| ReqPool | `frontend/src/features/reqpool/pages/ReqPoolPage.tsx` | 页面查询与组件组合 |
| Workspace | `frontend/src/features/project-workspace/pages/ProjectWorkspacePage.tsx` | 工作台页面组合 |
| Workspace | `frontend/src/features/project-workspace/components/` | 项目、模块、聚合篮与同步面板 |
| Workspace | `frontend/src/features/project-workspace/lib/` | 提示词、过滤和路径纯函数 |
| 公共边界 | `frontend/src/features/claude-chat/public-api.ts` | Claude Chat 稳定工作台能力出口 |
| 公共边界 | `frontend/src/features/knowledge-graph/public-api.ts` | 知识图谱稳定状态能力出口 |

## 3. 关键代码路径

| 文件与位置 | 当前职责 | 本轮处理 |
|---|---|---|
| `PrdClarifyPage.tsx:76-4013` | 14 个内联弹层与面板 | 先原样搬组件，再收敛 props 与状态 hook |
| `PrdClarifyPage.tsx:4014` | 页面容器 | 保留查询、路由和面板选择 |
| `DeliveryStageDialog.tsx:50` | 阶段加载与展示编排 | 拆分五类阶段内容和共享只读组件 |
| `ReqPoolController.java:65` | Controller 直接持有 `JdbcTemplate` | SQL 迁 Repository，用例迁 focused service |
| `ReqPoolPage.tsx:437-2297` | 血缘、阶段、抽屉、移动卡片和 AI 工作室 | 按视觉职责迁入 components |
| `ReqPoolPage.tsx:2309` | 页面容器与运行状态集合 | 回调进入 `useReqpoolActions` |
| `ProjectWorkspacePage.tsx:75-267` | 模块与菜单提示词 | 迁入 `lib/` 并补纯函数测试 |
| `ProjectWorkspacePage.tsx:967-1755` | 项目、模块、聚合和同步组件 | 迁入 components |
| `ProjectWorkspacePage.tsx:15-21` | 引用其他 feature 私有实现 | 改由 `public-api.ts` 引用 |

## 4. 执行顺序

1. PRD 按“弹层与只读组件 → 交互面板 → 状态 hooks → 页面容器”迁移。
2. Delivery Stage Dialog 按阶段拆分，服务器返回值继续作为评分单一事实源。
3. ReqPool 先以测试锁定同步和分析行为，再拆 Controller 和页面。
4. Project Workspace 先建立公开能力出口，再迁移纯函数和组件。
5. 最后补 AI 调用失败恢复、并发保护、架构门禁和浏览器回归。

## 5. 验证门禁

- 每个前端批次运行 `npm run typecheck` 与相关 Vitest；阶段结束运行 `npm run build`。
- ReqPool 后端批次运行 `mvn -pl tools/tool-reqpool -am test`。
- PRD/Delivery 后端相关批次运行 `mvn -pl tools/tool-prd-clarify -am test`。
- 运行 feature boundary 和文件规模门禁，确认没有新增跨 feature 私有引用。
- 在约 375px 与 1440px 视口分别验证主路径，并覆盖空状态或失败状态。

## 6. 回滚策略

- 每个组件或 focused service 独立变更，迁移时不同时改变业务算法。
- 新结构稳定前保留兼容门面；调用点全部切换且测试通过后再清理旧实现。
- 任何批次失败只回滚该批次，不回滚已经稳定的产物账本、Prompt 审计和 LaunchIntent 能力。

## 7. 本轮完成结果

- PRD 页面容器由 4775 行收敛至 320 行，会话状态归入 `usePrdClarifySession`，生成、澄清、编辑和弹层按职责拆分。
- Delivery 阶段弹层由 898 行收敛至 496 行，阶段展示、补充生成弹层和确定性转换已分离，并新增 4 项纯函数测试。
- ReqPool Controller 不再持有 `JdbcTemplate`；PRD 镜像同步由事务服务编排，跨表访问统一进入 Repository。
- PRD 编辑面板由 636 行收敛至 323 行；内容区、弹层和工具栏均已独立，开发文档流式状态与估算进度分别归入 `useDevDocState`、`useDevDocEstimation`。
- ReqPool 页面由约 3000 行收敛至 424 行；动作状态归入 `useReqpoolActions` 与 `useReqpoolItemCommands`，PRD/TDD 的 SSE、轮询、缓存更新和通知归入 `useReqpoolDocumentWorkflow`，页面头部、页面模型和交付分区均已独立。
- 项目工作台页面由约 1700 行收敛至 491 行；会话启动、跨项目聚合、模块同步与知识库就绪检查归入 focused hooks，页面头部、项目选择侧栏和模块区均由独立组件承载。
- 新增 PRD、Delivery、Claude Chat、知识图谱和文档查看器公开能力出口，跨 feature 私有引用基线由 98 项降至 80 项。
- 需求类型解析增加 30 秒超时和明确的 `UNKNOWN` 回退，避免外部 Agent 阻塞请求线程。
- Claude Chat 已只消费带版本、可确认和可重试的持久化 LaunchIntent；旧 `sessionStorage` 跳转键及生产端已全部移除。

## 8. 验证结果

- 前端类型检查和架构守卫通过，未新增私有跨 feature 引用。
- 前端 25 个测试文件、87 项测试全部通过；模块同步覆盖预览、选择、成功提交与失败保留状态。
- 前端生产构建、类型检查和架构守卫通过。
- 本地业务路由已做浏览器检查，但当前未登录，页面返回“无权访问”；交互和响应式视觉验收仍需在有效登录态补跑。
- PRD 后端及依赖 126 项测试全部通过。
- ReqPool 后端及依赖 18 项测试全部通过。
