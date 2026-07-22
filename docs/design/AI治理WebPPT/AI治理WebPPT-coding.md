# AI Coding 治理 WebPPT 编码摘要

## 实现范围

- 内容模型：`frontend/src/features/webppt-governance-report/slidesContent.ts`
- 页面渲染：`frontend/src/features/webppt-governance-report/components/SlideSection.tsx`
- 视觉样式：`frontend/src/features/webppt-governance-report/styles/webppt-deck.css`

## 本轮实现

在总结页之前增加“从统一开发入口走向团队智能工作台”展望总览，并用统一 `outlook-detail` 内容模型扩展 7 张单主题亮点页。每页包含状态、核心承诺、三项能力动作和三项组织收益，避免复制七套渲染代码。

根据视觉评审，`outlook-detail` 进一步改为发布会式故事模板：大号结果标题、发光 AI Core、Before/After 叙事、横向知识 Journey 和大号收益词。全局样式新增极光背景、轻量引用和弱容器边界，降低后台 Dashboard 观感。

第二轮视觉评审后，前 15 页不再只做主题覆盖，而是按内容类型替换布局骨架：开篇三结论舞台、架构五节点横向轨道、知识关系舞台、OpenSpec 裁决 Hero、双方法发光路径、工具强对比、截图主视觉、闭环 Journey 与大数字量化页。

第三轮内容审查删除开篇的制作目的句，以及全篇面向制作者的来源、免责和自证说明。架构、知识、闭环与文档页只保留节点、关系和方向，图形已表达的信息不再用长段正文重复；量化洞察收敛为三条。

封面最终改为左右 Hero：左侧标题与治理结论，右侧为六类信息载体环绕 AI 核心的失控现场；底部四项根因使用横向原因带，删除旧版流程胶囊和 2×2 后台卡片结构。

## 数据边界

- 当前基础：项目/模块可视化选择、模块目录拉起会话、业务知识与 Graphify 项目图谱、PRD/开发文档版本管理。
- 未来规划：Windows/macOS 标准启停脚本、一键拉取公司项目与开发环境、业务问答助手、自动进度评估和同类需求合并建议。

## 验证

- `npm run typecheck`
- `npm run build`
- Reveal.js 23 页 1280×720 页面无溢出、遮挡和异常换行。
# 第 3 页：Agent Harness 实现摘要

- `OpeningSlide` 使用目标、上下文、Agent Loop、质量四组数据表达分层架构。
- `SlideSection` 用四层横向分区承载纵向语义，执行层内部突出 Reason → Decide Tool → Execute Tool → Observe → Replan 回环。
- 页面沿用第 2 页深蓝、青色光效与大标题体系；微软来源放在页底、英文术语作为中文说明的第二层信息。
# 第 4 页：Feature Dev 实现摘要

- `FEATURE_DEV_PHASES` 以官方 `commands/feature-dev.md` 为事实源，保留 7 阶段顺序。
- 第 2、4、6 阶段显示并行专用 Agent，第 1、3、4、5、6 阶段显示确认门。
- `FORGE_FEATURE_DEV_SUPPORTS` 单独表达团队知识、编码前定位与规范门禁，避免混淆官方插件与内部增强。

# 第 6 页：Forge 当前开发闭环实现摘要

- 使用单一横向主链表达澄清、知识检索、PRD 审核、方案审核、交互编码和质量复查，不再延续 OpenSpec 替代声明页面。
- PDK 业务知识图谱与 Graphify 代码知识图谱作为澄清阶段的双上下文输入，明确它们属于 Forge 增强层而非 Feature Dev 内建能力。
- 质量复查节点连接 `team-standards` 通用 Skill 与 `project-coding-profiles` 项目规范 MCP，两层约束共同形成一轮代码检查。
- 页脚明确当前边界：Feature Dev 承担代码质量复查与完成总结，业务验收仍由产品、业务和开发对照 PRD 完成。

# 第 7 页：工具选型实现摘要

- 复用 `TOOL_COMPARISON` 四项事实数据，渲染改为 Superpowers 与 Feature Dev 左右对决舞台。
- 中轴只承载比较维度，Feature Dev 使用青色高亮，避免继续使用白底表格和后台卡片。
- 底部裁决条表达当前主选与组合边界，不再显示长段自举说明和来源声明。

# 第 8 页：多引擎调度实现摘要

- 由后台式双卡片改为项目入口、Forge 会话、引擎路由、结果回传四节点发光链路。
- 四种引擎作为可替换执行池展示，Forge 负责 cwd 绑定、会话生命周期和执行句柄管理。
- 底部只保留会话持久、句柄隔离和中断续跑三项真实能力，以及统一操作入口的管理价值。

# 第 9 页：研发记忆闭环实现摘要

- 使用五节点闭环表达 PRD、开发文档、开发会话、新版归档和下次续接的关系。
- 归档节点明确借鉴 OpenSpec 思想：本轮重要变更回写最新开发文档，使其成为后续会话的事实入口。
- 下方分析层只保留进度推算、变更归因和问题复盘三项平台能力，结论统一为可追溯、可验证、可回归、可归档。

# 第 10–19 页：统一发布会视觉实现摘要

- `quant` 改为四列大数字舞台、三条洞察和单一结论条。
- `outlook` 改为四项 Foundation、中央 Team AI OS 光球与三项未来能力构成的系统图。
- `outlook-detail` 复用统一故事骨架，并按 slide id 提供七套主题光色；全部切换为深色高对比文字体系。
- `adoption` 改为四步横向采纳路径、三项最终价值与单一优先决策条。
- 第 10–19 页在 1280×720 画布逐页验证，无水平/垂直溢出、页脚覆盖或低对比度文字。
- 篇章标签按内容类型动态计算：第 11–18 页统一显示“当前平台能力”，最终页使用“终章”。
