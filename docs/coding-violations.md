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
| 12 | 提交规范 | Codex 生成提交信息时只写标题，遗漏必填的变更说明正文和 Author 行 | 每次提交都按“标题、中文正文、Author”完整模板生成并在提交前核验，不因改动较小而省略正文或作者 | Git commit message | 2026-08-02 | 2 |
| 13 | 需求范围 | 将“移除页面内开始开发版块”误解为移除整个 Feature 注册，或在新工作台中重新生成该冗余版块 | 截图指定版块时只修改对应 UI 区域；新开发工作台默认只保留菜单、路由和启停能力，不重复生成开始开发表单 | erp-dev、kai-dev、srm-dev、scm-dev、erp-mini-program | 2026-08-04 | 2 |
| 14 | 架构约束 | 为业务咨询只注入通用源码搜索工具并允许从仓库根扫描，绕过既有 URL 定位与 Graphify 图谱流程 | 源码检索必须先走 URL 定位和 Graphify 上下文收敛，精确读取候选文件，仅在限定子目录内兜底搜索并排除 graphify-out | readonlyMcp.ts、ConsultStandardStepConfiguration.java、ForeConsultPage.tsx | 2026-08-05 | 1 |
| 15 | 路径约束 | 将已停用的 `D:\Users\zhang\myWork\yoooni-daily-plugin` 误当团队插件源码并额外写入 | 团队插件源码统一读取 `C:\Users\zhang\.kai-toolbox\team-tools`；禁止再维护 D 盘旧开发仓副本 | PluginUpdateService.java、yoooni-erp-auto-dev/SKILL.md | 2026-08-05 | 1 |
| 16 | 内容准确性 | 自动登记待执行 SQL 时只保存裸 SQL，缺少与系统业务变更关联的清晰注释 | 登记标题必须体现业务功能，每个 SQL 逻辑块前用注释说明关联功能、具体变更和执行目的 | pendingSqlPolicy.ts、forgePendingSql.ts | 2026-08-06 | 1 |
| 17 | 架构约束 | 将 taskspace 聚合工作区根当成单仓库物理源码根，忽略其下多个 junction/symlink 成员仓库 | 会话应保存工作区根并显式解析成员源码根集合；路径校验、Graphify 路由和结果相对路径必须基于该集合，不能用单一物理根判断所有成员 | readonlyMcp.ts、codexSecurity.ts、codexEngine.ts、TaskspaceService.java | 2026-08-12 | 1 |
| 18 | 架构约束 | 将企业账号模型、应用端口、持久化/HTTP 实现和 Spring 装配全部平铺在企业适配层根包，职责与依赖方向不可辨识 | 企业公共能力按 domain、application、infrastructure、config 分层；业务模块依赖应用端口，不直接依赖 JPA/HTTP 实现类 | wyoooni-enterprise-adapter | 2026-08-16 | 1 |
| 19 | 编码规范 | 新增配置属性类时手写重复 getter/setter，未沿用项目既有 Lombok 约定 | Properties 显式声明 Lombok 依赖并使用 `@Getter/@Setter`；避免对含密钥配置使用会生成 `toString` 的 `@Data`，MapStruct只用于对象映射 | supplier-quote、wyoooni 配置类 | 2026-08-16 | 1 |
| 20 | 文档结构 | 将Agent入口与工程规范混写，随后又把小型项目规范过度拆成多个细碎文件 | AGENTS.md与CLAUDE.md只作为入口；共享规范以engineering为唯一事实源，稳定收敛为架构、编码、测试三类，优先补充现有文档 | wyoooni/AGENTS.md、wyoooni/CLAUDE.md、wyoooni/docs/engineering | 2026-08-16 | 2 |
| 21 | 需求范围 | 已有供应商报价页可以承载市场报价流程时，额外创建 MarketQuotePage，造成两个同类报价页面并存 | 同一报价工作流优先重构既有 SupplierQuotationPage；仅在流程、权限和导航边界确实独立时新增页面 | SupplierQuotationPage.tsx、MarketQuotePage.tsx | 2026-08-16 | 1 |
| 22 | 架构约束 | 按 ERP Oracle、SRM MySQL 和本地业务库的数据源类型拆出多个 Maven Adapter，导致同一报价业务实现分散且模块价值不清 | Maven 模块按业务能力拆分；同一供应商报价模块内部用明确的数据源、Repository 和事务管理器隔离本地、ERP、SRM 数据访问 | supplier-quote-mysql-adapter、supplier-quote-forge-adapter、supplier-quote-spring-boot-starter | 2026-08-16 | 1 |
| 23 | 架构约束 | 报价业务已由 Starter 完整承载后仍保留 Forge Host 中间模块，并把本地存储和演示用例错误归为宿主接线 | 宿主直接依赖业务 Starter；属于报价模块的持久化与用例实现归入 Starter，只有存在真实宿主差异时才新增适配模块 | supplier-quote-forge-host、toolbox-starter | 2026-08-16 | 1 |
| 24 | 业务状态 | 将 SRM 打回和拒绝后重新下发任务拆成 `RETURNED`、`REQUOTE` 两个 H5 状态，并使用“需修改/需重新报价”等漂移文案 | H5 统一为五态；`auditResult=3` 或 `haveTask=1` 均展示“待重报”，已拒绝仅表示 SRM 审核结果且只读 | MarketQuoteBusinessStatus.java、SupplierQuotationPage.tsx、MarketQuoteCard.tsx | 2026-08-16 | 1 |
| 25 | 产品文案 | 在本地测试环境的账号关联页额外展示“本地开发模式”和固定验证账号，暴露实现概念并形成冗余视觉层级 | 本地统一视为测试环境；页面只呈现真实业务账号关联表单，测试凭据由测试人员掌握而不在 H5 明文展示 | BusinessAccountBindingPage.tsx | 2026-08-16 | 1 |
| 26 | 回归覆盖 | 修复业务咨询无回答终态时只验证状态展示，未覆盖带附件消息在发送前被安全校验拒绝的完整链路 | 修改咨询发送状态机时必须同时验证纯文本、合法附件、附件拒绝、WebSocket 反馈和回合生命周期收口 | ConsultConversation.tsx、ClaudeChatService.java、AttachmentStorageService.java | 2026-08-21 | 1 |
