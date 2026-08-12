package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.api.dto.QaPairRequest;
import com.exceptioncoder.toolbox.prdclarify.domain.DocumentProfile;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.function.Consumer;

/**
 * 生成 PRD、TDD 或执行计划，集中管理文档协议、Prompt 和 Agent 调用。
 *
 * <p>会话状态、知识查询、SSE、文件版本与持久化仍由 {@link PrdClarifyService} 编排。</p>
 */
public class PrdDocumentGenerationService {

    private static final String GENERATE_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是需求发现与澄清完成后的文档化步骤，直接输出 PRD 文档，不进入交互。

            已完成的前置工作：
            - 需求发现：原始需求描述已提供
            - 需求澄清：多轮澄清问答已完成
            基于以上产出生成正式 PRD 文档。不得依赖某个引擎专属的命令、skill 或 plugin。

            文档使用 Markdown 格式，必须包含以下章节（顺序不变，内容可根据实际情况扩展）：

            # [功能名称]

            ## 1. 文档概述
            ## 2. 业务背景与目标
            ## 3. 目标用户与使用场景
            ## 4. 功能范围（Scope）
            ### 4.1 本期包含
            ### 4.2 本期不包含
            ## 5. 功能需求详述
            ## 6. 非功能性需求
            ## 7. 数据模型影响
            ## 8. 验收标准
            ## 9. 开放问题与风险

            直接输出 Markdown，不加代码块，不加多余解释。内容具体可落地，让工程师无需追问即可开始设计。
            """;

    private static final String GENERATE_SYSTEM_SPEC_DRIVEN = """
            ⚠️ 直接输出任务：根据原始需求与已确认的澄清问答，生成一份可持续演进的核心规格。
            直接输出 Markdown，不进入交互，不调用任何额外流程。

            文档必须使用以下稳定结构：
            # [功能名称] · 核心规格
            ## 1. 规格元信息
            ## 2. 目标与成功信号
            ## 3. 范围与边界
            ## 4. 需求与业务规则
            ## 5. 场景
            ## 6. 验收标准
            ## 7. 约束
            ## 8. 决策记录
            ## 9. 开放问题

            每个可独立追踪的条目必须带稳定 ID，格式分别为 GOAL-001、REQ-001、RULE-001、
            SCN-001、AC-001、CONSTRAINT-001、DECISION-001、OPEN-001。条目之间用 ID 显式引用，
            验收标准必须引用对应 REQ/RULE/SCN。未知事实写入 OPEN，不得编造。
            这是持续更新的事实来源，不写排期、负责人或代码实现任务。
            """;

    private static final String GENERATE_SYSTEM_SPEC_DRIVEN_UPDATE = """
            ⚠️ 直接输出任务：更新已有核心规格并返回完整 Markdown，不进入交互。
            保留未变更条目的稳定 ID；新增条目使用下一个可用序号；废弃条目保留并标记 Deprecated，
            不得通过重排编号伪造新规格。将新证据合并为目标、范围、需求、规则、场景、验收标准、
            约束、决策或开放问题，并在“决策记录”说明本次规格变化及依据。
            输出仍须符合核心规格的固定章节和 ID 契约。
            """;

    private static final String GENERATE_SYSTEM_REVISION = """
            你是一名资深产品经理，正在对现有 PRD 进行修订，生成新版本文档。

            rawInput 中包含：
            1. 原版 PRD 全文（=== 原版 PRD 内容 === 区域）
            2. 本次修订说明（=== 本次修订说明 === 区域）

            请根据以上信息生成修订版 PRD，必须包含以下章节（顺序不变）：

            # [功能名称]（修订版 vX）

            ## 0. 实现状态（【重要】供 AI 开发使用，避免重复实现）
            按每个功能点标注当前状态：
            - ✅ 已实现 — [功能点描述]（已完成，勿重新实现）
            - 🆕 本版新增 — [功能点描述]（需要实现）
            - 🔄 本版修改 — [功能点描述]（原有实现需要更新，说明改动点）

            ## 1. 文档概述（含版本历史）
            ## 2. 业务背景与目标（修订原因）
            ## 3. 目标用户与使用场景
            ## 4. 功能范围（Scope）
            ### 4.1 本期包含
            ### 4.2 本期不包含
            ## 5. 功能需求详述
            ## 6. 非功能性需求
            ## 7. 数据模型影响
            ## 8. 验收标准
            ## 9. 开放问题与风险

            第 0 章「实现状态」是最重要的章节，务必准确标注，内容直接决定后续 AI 开发的实现范围。
            直接输出 Markdown，不加代码块，不加多余解释。
            """;

    private static final String GENERATE_SYSTEM_BUG = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是缺陷修复说明的最终产出，直接输出文档，不进入交互。

            基于原始需求描述和澄清问答（复现步骤/期望-实际行为/影响范围），生成「缺陷修复说明」。

            文档使用 Markdown 格式，必须包含以下章节（顺序不变，没有对应信息的章节如实标注
            "未提供"，不要编造）：

            # [Bug 标题]

            ## 1. 问题描述
            简述现象，一段话说清楚"哪里、什么情况下、发生了什么"。
            ## 2. 复现步骤
            有序列表，具体到操作/输入。
            ## 3. 期望行为 vs 实际行为
            两栏对比或分点列出。
            ## 4. 根因分析
            若澄清中已定位到代码层面原因（如具体 if/else 分支、条件判断），直接引用；
            未定位到则基于现象给出最可能的假设，并标注"待开发者代码确认"。
            ## 5. 修复方案
            具体到修改点：改哪个条件判断/哪个方法，怎么改。
            ## 6. 影响范围
            哪些场景/接口/用户会受影响，是否需要数据修复。
            ## 7. 验收标准
            修复后如何验证：具体的输入 → 预期输出。

            直接输出 Markdown，不加代码块围栏，不加多余解释。内容具体可落地，
            让工程师无需追问即可定位代码并动手修复。
            """;

    private static final String DEV_DOC_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程，禁止进入交互）：
            本次执行代码库探索与架构设计，直接输出技术开发方案文档后结束。
            不得依赖某个引擎专属的命令、skill 或 plugin。

            ════════════════════════════════════════════════
            阶段一 — Codebase Exploration（代码库探索）
            ════════════════════════════════════════════════
            必须结合以下上下文理解现有代码库，再基于真实代码事实生成方案：

            1. mcp__domain-knowledge__search_knowledge（若可用）：
               → search_knowledge(query=需求关键词, project=项目名, module=模块名)
               → get_knowledge(id) 获取状态机/业务规则详情
               → 目的：确保方案与现有业务逻辑一致

            2. user prompt 中的【代码知识图谱查询结果】区块：系统已在调用你之前直接执行
               graphify CLI（`graphify query`，非 MCP 工具调用）查询该项目的代码知识图谱，
               区块内是真实 Java 类名、Service 方法、数据库表名
               → 目的：引用真实代码实体而非推测；区块为空说明该项目暂无图谱，忽略即可

            3. mcp__cross-topology__search_knowledge（若可用）：
               → search_knowledge(query=枚举值/接口路径关键词)
               → 获取枚举取值、API 路径约定
               → 目的：DDL/API 与现有规范保持一致

            以上上下文均缺失时：仅基于 PRD 生成，在文档中注明"未完成代码库探索"。

            ════════════════════════════════════════════════
            阶段二 — Architecture Design（架构设计）→ 输出技术开发方案文档
            ════════════════════════════════════════════════
            基于代码库探索结果和 PRD，直接输出 Markdown 技术开发方案文档：

            ## 技术方案概述
            分析实现路径，引用代码库探索获取的真实类名/接口/表名说明集成点。

            ## 数据库变更
            精确的 DDL/ALTER 语句（基于知识图谱确认的真实表名）：
            - 新建表用 CREATE TABLE IF NOT EXISTS（含注释）
            - 新增字段用 ALTER TABLE ADD COLUMN（幂等）

            ## API 接口设计
            新增或修改的 RESTful 接口，含请求/响应结构。

            ## 实现步骤（有序任务清单）
            具体到方法/类/组件级别（引用代码库探索获取的真实类名）：
            - [ ] 后端 — [ServiceName] 新增/修改 [methodName]：做什么
            - [ ] 前端 — [ComponentName]：做什么
            - [ ] 测试：关键验收点

            直接输出 Markdown，不加代码块围栏，不加解释前言。
            """;

    private static final String DEV_DOC_SYSTEM_UPDATE = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程，禁止进入交互）：
            本次是基于已有开发文档的更新，直接输出更新后的完整技术开发方案文档后结束。

            你正在更新一份已存在的技术开发方案文档，不是从零生成。user prompt 会给你：
            1. 当前最新的 PRD 内容
            2. 当前已存在的开发文档全文（=== 当前开发文档 === 区域）
            3. 本次更新说明（=== 本次更新说明 === 区域，用户希望做的改动；可能为空，
               为空时结合 PRD 与当前开发文档的差异自行判断需要更新的地方）

            更新规则（严格执行）：
            - 章节结构与当前开发文档保持一致（技术方案概述/数据库变更/API接口设计/实现步骤），
              不要推倒重来，能沿用的内容原样保留
            - 「实现步骤」章节每一项标注状态前缀，让开发者一眼看出哪些已经不用管：
              ✅ 已完成 — 沿用原文档，本次不涉及
              🔄 需调整 — 原有步骤因本次更新需要修改，说明具体改动点
              🆕 新增 — 本次更新说明引入的新步骤
            - 若本次改动涉及新的代码事实，可参考 user prompt 中的【代码知识图谱查询结果】
              区块（系统已直接调用 graphify CLI 查询，非 MCP 工具调用），为空则忽略

            直接输出 Markdown，不加代码块围栏，不加多余解释。
            """;

    private static final String EXECUTION_PLAN_SYSTEM = """
            ⚠️ 直接输出任务：基于核心规格与真实代码上下文生成执行计划 Markdown，不进入交互。
            不得改写核心规格，也不得把推测当成代码事实。

            固定章节：
            # [功能名称] · 执行计划
            ## 1. 计划元信息
            ## 2. 规格追踪矩阵
            ## 3. 实现策略
            ## 4. 执行步骤
            ## 5. 验证计划
            ## 6. 风险与回退

            每个步骤使用稳定 ID PLAN-001 起，并用 specRefs 显式引用 GOAL/REQ/RULE/SCN/AC/
            CONSTRAINT ID；同时列出预计修改的真实类、接口、表或组件，以及可验证完成的证据。
            无法由代码图谱确认的位置标记“待定位”，禁止编造文件名。
            """;

    private static final String EXECUTION_PLAN_SYSTEM_UPDATE = """
            ⚠️ 直接输出任务：基于最新核心规格、当前执行计划与新证据，增量更新完整执行计划 Markdown。
            保留未变更 PLAN ID；同步新增或变化的 specRefs；已完成步骤保留并标记完成，失效步骤标记
            Superseded 且说明替代项。不得修改核心规格内容，不得编造代码位置。
            输出仍须符合执行计划的固定章节、PLAN ID 与 specRefs 契约。
            """;

    private final AgentOneShotRunner agentRunner;
    private final ObjectMapper mapper;
    private final PrdImageInputResolver imageInputResolver;

    public PrdDocumentGenerationService(AgentOneShotRunner agentRunner, ObjectMapper mapper,
                                        PrdImageInputResolver imageInputResolver) {
        this.agentRunner = agentRunner;
        this.mapper = mapper;
        this.imageInputResolver = imageInputResolver;
    }

    /** 生成 PRD 正文，并把每个增量原样转发给调用方。 */
    public String generatePrd(PrdGenerationRequest request, Consumer<String> onDelta) {
        PrdSession session = request.session();
        boolean update = request.updateExisting()
                && request.currentPrd() != null && !request.currentPrd().isBlank();
        String systemPrompt = update
                ? pickPrdUpdateSystem(session)
                : pickFreshPrdSystem(session);
        String userPrompt = update
                ? buildPrdUpdatePrompt(session, request.currentPrd(), request.extraInstructions())
                : buildFreshPrdPrompt(session, request.extraInstructions());
        return stream(systemPrompt, userPrompt, session, request.engine(), request.extraInstructions(), onDelta);
    }

    /** 生成 TDD 或执行计划正文，并把每个增量原样转发给调用方。 */
    public String generateDevDoc(DevDocGenerationRequest request, Consumer<String> onDelta) {
        PrdSession session = request.session();
        boolean update = request.updateExisting()
                && request.currentDevDoc() != null && !request.currentDevDoc().isBlank();
        String systemPrompt;
        String userPrompt;
        if (update) {
            systemPrompt = isSpecDriven(session) ? EXECUTION_PLAN_SYSTEM_UPDATE : DEV_DOC_SYSTEM_UPDATE;
            userPrompt = buildDevDocUpdatePrompt(request);
        } else {
            systemPrompt = isSpecDriven(session) ? EXECUTION_PLAN_SYSTEM : DEV_DOC_SYSTEM;
            userPrompt = buildFreshDevDocPrompt(request);
        }
        return stream(systemPrompt, userPrompt, session, request.engine(), request.extraInstructions(), onDelta);
    }

    private String stream(String systemPrompt, String userPrompt, PrdSession session, String engine,
                          String extraInstructions, Consumer<String> onDelta) {
        StringBuilder full = new StringBuilder();
        Consumer<String> forwardingDelta = delta -> {
            full.append(delta);
            if (onDelta != null) {
                onDelta.accept(delta);
            }
        };
        String imageSource = value(session.getRawInput()) + "\n" + value(extraInstructions);
        agentRunner.stream(systemPrompt, userPrompt, session.getModel(), engine, forwardingDelta,
                imageInputResolver.resolve(imageSource));
        return full.toString();
    }

    private String pickPrdUpdateSystem(PrdSession session) {
        return isSpecDriven(session) ? GENERATE_SYSTEM_SPEC_DRIVEN_UPDATE : GENERATE_SYSTEM_REVISION;
    }

    private String pickFreshPrdSystem(PrdSession session) {
        if (isSpecDriven(session)) {
            return GENERATE_SYSTEM_SPEC_DRIVEN;
        }
        boolean revision = value(session.getRawInput()).startsWith("【修订版 PRD");
        if (PrdRequirementTypeResolver.BUG_FIX.equals(session.getReqType())) {
            return GENERATE_SYSTEM_BUG;
        }
        return revision ? GENERATE_SYSTEM_REVISION : GENERATE_SYSTEM;
    }

    private String buildFreshPrdPrompt(PrdSession session, String extraInstructions) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("功能标题：").append(session.getTitle()).append("\n");
        appendProject(prompt, session, "关联项目：");
        prompt.append("\n原始需求描述：\n").append(session.getRawInput()).append("\n\n");
        appendBusinessQuestions(prompt, session.getQuestions());
        prompt.append("请基于以上信息生成完整的 PRD 文档（Markdown 格式）。");
        if (extraInstructions != null && !extraInstructions.isBlank()) {
            prompt.append("\n\n【用户在生成前补充的信息——请重点参考并纳入 PRD】\n")
                    .append(extraInstructions.trim());
        }
        return prompt.toString();
    }

    private String buildPrdUpdatePrompt(PrdSession session, String currentPrd, String extraInstructions) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("功能标题：").append(session.getTitle()).append("\n\n");
        prompt.append("=== 原版 PRD 内容 ===\n").append(currentPrd).append("\n\n");
        prompt.append("=== 本次修订说明 ===\n");
        prompt.append(extraInstructions != null && !extraInstructions.isBlank()
                ? extraInstructions.trim()
                : "（未提供具体说明，请基于当前内容审视并适度完善，在「实现状态」章节标注哪些是本次调整）");
        prompt.append('\n');
        return prompt.toString();
    }

    private String buildFreshDevDocPrompt(DevDocGenerationRequest request) {
        StringBuilder prompt = buildDevDocHeader(request);
        prompt.append("\n以下是已确认的产品需求文档（PRD）：\n\n")
                .append(request.prdContent()).append("\n\n");
        if (request.extraInstructions() != null && !request.extraInstructions().isBlank()) {
            prompt.append("【用户补充说明——生成时请重点参考/遵循】\n")
                    .append(request.extraInstructions().trim()).append("\n\n");
        }
        appendQaHistory(prompt, request.qaHistory(), "【TDD 生成前已确认的技术澄清】", false);
        prompt.append("请基于以上 PRD 生成完整的技术开发方案文档。");
        return prompt.toString();
    }

    private String buildDevDocUpdatePrompt(DevDocGenerationRequest request) {
        StringBuilder prompt = buildDevDocHeader(request);
        prompt.append("\n=== 当前最新 PRD ===\n\n").append(request.prdContent()).append("\n\n");
        prompt.append("=== 当前开发文档 ===\n\n").append(request.currentDevDoc()).append("\n\n");
        prompt.append("=== 本次更新说明 ===\n\n")
                .append(request.extraInstructions() == null || request.extraInstructions().isBlank()
                        ? "（未填写，请结合 PRD 与当前开发文档的差异自行判断需要更新的地方）"
                        : request.extraInstructions().trim())
                .append("\n\n");
        appendQaHistory(prompt, request.qaHistory(), "=== 澄清问答 ===", true);
        prompt.append("请基于以上信息生成更新后的完整技术开发方案文档。");
        return prompt.toString();
    }

    private StringBuilder buildDevDocHeader(DevDocGenerationRequest request) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("需求标题：").append(request.session().getTitle()).append("\n");
        appendProject(prompt, request.session(), "项目：");
        appendGraphContext(prompt, request.graphContext());
        return prompt;
    }

    private void appendBusinessQuestions(StringBuilder prompt, String questionsJson) {
        if (questionsJson == null || questionsJson.isBlank()) {
            return;
        }
        prompt.append("需求澄清问答：\n");
        try {
            JsonNode questions = mapper.readTree(questionsJson);
            if (questions.isArray()) {
                int index = 1;
                for (JsonNode question : questions) {
                    prompt.append("Q").append(index).append(": ")
                            .append(question.path("question").asText("")).append("\n");
                    prompt.append("A").append(index).append(": ")
                            .append(question.path("answer").asText("（未填写）")).append("\n");
                    index++;
                }
            }
        } catch (Exception ignored) {
            prompt.append(questionsJson).append("\n");
        }
        prompt.append("\n");
    }

    private static void appendProject(StringBuilder prompt, PrdSession session, String prefix) {
        if (session.getProject() == null || session.getProject().isBlank()) {
            return;
        }
        prompt.append(prefix).append(session.getProject());
        if (session.getModule() != null && !session.getModule().isBlank()) {
            prompt.append(" / ").append(session.getModule());
        }
        prompt.append("\n");
    }

    private static void appendGraphContext(StringBuilder prompt, String graphContext) {
        if (graphContext == null || graphContext.isBlank()) {
            return;
        }
        prompt.append("\n【代码知识图谱查询结果】（系统已直接调用 graphify CLI 查询，非 MCP，内容为真实代码事实）\n")
                .append(graphContext).append("\n");
    }

    private static void appendQaHistory(StringBuilder prompt, List<QaPairRequest> qaHistory,
                                        String heading, boolean addBlankLineAfterHeading) {
        if (qaHistory == null || qaHistory.isEmpty()) {
            return;
        }
        prompt.append(heading).append(addBlankLineAfterHeading ? "\n\n" : "\n");
        int index = 1;
        for (QaPairRequest qa : qaHistory) {
            prompt.append(index++).append(". ").append(qa.question())
                    .append("\n   → ").append(qa.answer()).append("\n\n");
        }
    }

    private static boolean isSpecDriven(PrdSession session) {
        return DocumentProfile.SPEC_DRIVEN.name().equals(
                DocumentProfile.normalize(session.getDocumentProfile()));
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }

    /** PRD 生成所需的不可变输入。 */
    public record PrdGenerationRequest(PrdSession session, String currentPrd,
                                       String extraInstructions, boolean updateExisting, String engine) {
    }

    /** TDD 或执行计划生成所需的不可变输入。 */
    public record DevDocGenerationRequest(PrdSession session, String prdContent, String currentDevDoc,
                                          String extraInstructions, List<QaPairRequest> qaHistory,
                                          String graphContext, boolean updateExisting, String engine) {
    }
}
