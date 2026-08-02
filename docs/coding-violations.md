# 编码违规记录

> 本文件由 `coding-violation-log` Skill 自动维护。
> AI 编码前必须读取本文件，避免重犯已记录的错误。

| # | 类型 | 违规描述 | 正确做法 | 涉及文件 | 首次发生 | 次数 |
|---|------|---------|---------|---------|---------|------|
| 1 | 架构约束 | 将统一 LLM 网关配置拆成 AI 对话、LLM 网关、Java 八股等多个独立配置块 | 只保留中心化 LLM 网关配置；业务模块只选择自己使用的模型或网关档位，不单独维护 baseURL/API Key 配置块 | AiChatProperties.java、Java8guEnrichProperties.java、LlmGatewayProperties.java | 2026-07-10 | 1 |
| 2 | 内容准确性 | 在治理问题链路中把 Cursor 等代码执行工具列为信息断裂对象，混淆工具与治理载体的责任 | 用需求、沟通、AI 对话、任务、代码和文档等信息载体表达断裂，避免归责具体编辑器 | slidesContent.ts | 2026-07-20 | 1 |
| 3 | 内容准确性 | 将自定义文档流程和 pre-implementation-code-orientation 描述为 Feature Dev 主流程中已自动执行 | 当前需求开发明确以 feature-dev:feature-dev 为主流程；未有显式调用或 Hook 接线的 Skill 必须标注为待接入 | slidesContent.ts | 2026-07-20 | 1 |
| 4 | 视觉可访问性 | 页面级背景改色后未同步覆盖子元素文字色，出现浅底白字和深底灰字 | 每次改变容器明暗时显式定义标题、正文和辅助文字颜色，并对全篇执行对比度回归 | webppt-deck.css | 2026-07-21 | 1 |
| 5 | CSS 完整性 | 页面级重构只覆盖卡片部分属性，通用样式回流后形成白底但零水平内边距 | 页面级变体必须完整定义布局、背景、边界和间距，并检查最终计算样式 | webppt-deck.css | 2026-07-21 | 1 |
| 6 | 布局安全性 | 固定绝对定位页脚未参与正文布局，新增高内容页面时覆盖正文 | 页脚必须进入母版布局流或预留可验证安全区，并逐页执行正文与页脚碰撞检查 | SlideSection.tsx、webppt-deck.css | 2026-07-21 | 1 |
| 7 | 架构约束 | 将 npm、pip、Maven 不同配置语义过度抽象为统一缓存迁移流程 | 统一入口只负责编排；每个包管理器用独立策略处理原生配置、优先级、备份和验证 | PackageCacheConfigService.java、PackageCacheMigration.tsx | 2026-07-26 | 1 |
| 8 | 异常处理 | 将同名的 Codex item error 与顶层致命 error 混写在一个分支中，代码审查时无法直观看出严重级别边界 | 按 SDK 事件层级明确命名转换函数和事件码，item error 按官方 non-fatal 语义处理，turn.failed 与顶层 error 保持致命 | codexEngine.ts | 2026-07-29 | 1 |
| 9 | 架构约束 | 在交付中心另用原生 datalist 实现系统/模块选择，绕开 PRD 已有数据源和统一多选交互 | 将系统与模块数据查询、级联多选和主系统规则抽成共享能力，所有 PRD 入口统一复用 | PrdDraftDialog.tsx | 2026-07-29 | 1 |
| 10 | Spring 装配 | 新增 Spring 组件前未检查同一扫描范围内的默认 Bean 名，存在同简单类名导致启动冲突的风险 | 新增 `@Component` 系组件前先全仓检索同简单类名；可能冲突时使用模块限定 Bean 名，并用容器启动测试验证 | Spring 组件类 | 2026-07-30 | 1 |
| 11 | 开发环境 | 开发后端以 `spring-boot:run` 运行时执行 Maven `clean`，删除了运行 JVM 正在使用的依赖模块编译目录 | 运行期验证只执行非 clean 的 `test` 或 `compile`；需要 clean 时先停止后端，完成后再启动 | Maven 验证命令 | 2026-07-30 | 1 |
