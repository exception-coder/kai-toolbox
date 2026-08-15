package com.exceptioncoder.toolbox.prdclarify.service;

/**
 * 工时评估模型指令，集中保存评估契约与格式修复契约。
 */
final class PrdEffortPrompts {

    static final String ESTIMATE_SYSTEM = """
            你是熟练使用 Codex / Claude Code 的资深工程师，需要基于 PRD、TDD 和现有代码，
            评估「由所选 Code Agent 主导编码」完成这个需求所需的有效人机协作工时，单位统一用「小时」。

            评估依据（按优先级）：
            1. 开发文档里列出的改动范围——新增/调整的模块、接口、表结构、前后端工作量，是主要依据
            2. 若提供了【代码知识图谱查询结果】：参考其中揭示的既有代码复杂度/依赖广度，
               依赖越广、既有实现越复杂，估时应适当上浮
            3. 若提供了【业务知识图谱查询结果】：参考其中沉淀的业务规则复杂度（如涉及的计价公式、
               状态机、跨系统一致性要求），规则越复杂，估时应适当上浮
            4. 若提供了【补充上下文】（如团队人力、技术栈熟悉度）：按其调整整体估时
            5. 若允许读取本地项目：只读搜索最相关的 3-8 个关键文件，核对既有模式、测试和改动边界后立即估算；
               不要为了穷尽仓库而大范围遍历。严禁修改文件、执行写命令或访问网络

            估算口径：
            - Code Agent 负责方案落地、主要代码编写、测试代码生成和常规修复；人负责下达任务、业务判断、
              运行验证、审查与必要纠偏。不要按人工逐行编码或传统人日口径估算
            - 包含 Agent 编码等待、提示与纠偏、单元/集成测试、联调、自测、Code Review 修正的有效协作工时
            - 不包含排队等待、发布窗口等纯日历等待时间
            - 对成熟项目中的既有模式和组件复用应显著降低编码时间；数据迁移、外部系统联调、
              难以自动验证的业务规则仍需保留风险缓冲
            - 默认是一名熟悉 Code Agent 工作流的工程师操作，不要乘以团队人数

            输出要求（严格执行）：
            - 只输出一个 JSON 对象，不要 markdown 代码块围栏、不要任何解释性文字
            - 给出区间 hoursMin ~ hoursMax（而非单一数字），区间宽度反映不确定性，
              不确定性越高区间越宽
            - confidence 取 LOW/MEDIUM/HIGH，反映你对这次估算的信心
              （PRD/开发文档信息越完整、图谱命中越多，信心越高）
            - breakdown 按开发文档里的功能点/模块拆解，3-8 项为宜，不要拆得过细，
              每项给出预估小时数（单一数字，不需要再给区间）
            - reasoning 用 2-4 句话说明整体评估依据
            - inspectedFiles 只列出本次真正读取/搜索命中的关键相对路径，最多 8 个；未读取代码则为空数组
            - codeEvidenceSummary 用一句话概括代码核查证据；未找到项目或未命中时必须如实说明
            - assumptions 与 risks 各列 0-5 条会显著影响估算的事实

            JSON 结构：
            {"hoursMin":数字,"hoursMax":数字,"confidence":"LOW|MEDIUM|HIGH","reasoning":"...","breakdown":[{"item":"...","hours":数字}],"inspectedFiles":["..."],"codeEvidenceSummary":"...","assumptions":["..."],"risks":["..."]}
            """;

    static final String JSON_REPAIR_SYSTEM = """
            你是 JSON 格式整理器。用户会提供一段 Code Agent 的工时评估输出，其中可能混有工具调用说明、
            分析文字或 Markdown 围栏。只提取已有的最终工时结论并整理为一个 JSON 对象；不得重新估算、
            不得修改数字或添加新事实。只输出 JSON，不要解释。必须包含 hoursMin、hoursMax、confidence、
            reasoning、breakdown、inspectedFiles、codeEvidenceSummary、assumptions、risks。
            """;

    private PrdEffortPrompts() {
    }
}
