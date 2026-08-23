package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.api.dto.QaPairRequest;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.function.Consumer;

/**
 * 生成核心规格或执行计划，集中管理文档协议、Prompt 和 Agent 调用。
 *
 * <p>会话状态、知识查询、SSE、文件版本与持久化仍由 {@link PrdClarifyService} 编排。</p>
 */
public class PrdDocumentGenerationService {

    private static final String SPECIFICATION_SYSTEM = """
            ⚠️ 直接输出任务：根据原始需求与已确认的初始化规格，生成一份可持续演进的核心规格。
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
            若输入包含初始化规格，必须沿用其中已有稳定 ID，并将已经回答的 OPEN 条目转换为对应
            规则、决策或验收标准；不得因为重新生成而重排编号。
            """;

    private static final String SPECIFICATION_UPDATE_SYSTEM = """
            ⚠️ 直接输出任务：更新已有核心规格并返回完整 Markdown，不进入交互。
            保留未变更条目的稳定 ID；新增条目使用下一个可用序号；废弃条目保留并标记 Deprecated，
            不得通过重排编号伪造新规格。将新证据合并为目标、范围、需求、规则、场景、验收标准、
            约束、决策或开放问题，并在“决策记录”说明本次规格变化及依据。
            输出仍须符合核心规格的固定章节和 ID 契约。
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
            ## 7. 待确认技术事项

            每个步骤使用稳定 ID PLAN-001 起，并用 specRefs 显式引用 GOAL/REQ/RULE/SCN/AC/
            CONSTRAINT ID；同时列出预计修改的真实类、接口、表或组件，以及可验证完成的证据。
            无法由代码图谱确认的位置标记“待定位”，禁止编造文件名。
            无法从核心规格、代码图谱或项目上下文确认且会影响实现的技术决策，集中写入
            “待确认技术事项”，说明影响范围、推荐默认方案和确认时点；不得停下来向用户提问。
            """;

    private static final String EXECUTION_PLAN_SYSTEM_UPDATE = """
            ⚠️ 直接输出任务：基于最新核心规格、当前执行计划与新证据，增量更新完整执行计划 Markdown。
            保留未变更 PLAN ID；同步新增或变化的 specRefs；已完成步骤保留并标记完成，失效步骤标记
            Superseded 且说明替代项。不得修改核心规格内容，不得编造代码位置。
            输出仍须符合执行计划的固定章节、PLAN ID 与 specRefs 契约；新增未决技术事项写入
            “待确认技术事项”，不得停下来向用户提问。
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

    /** 生成核心规格正文，并把每个增量原样转发给调用方。 */
    public String generatePrd(PrdGenerationRequest request, Consumer<String> onDelta) {
        PrdSession session = request.session();
        boolean update = request.updateExisting()
                && request.currentPrd() != null && !request.currentPrd().isBlank();
        String systemPrompt = update
                ? SPECIFICATION_UPDATE_SYSTEM
                : SPECIFICATION_SYSTEM;
        String userPrompt = update
                ? buildPrdUpdatePrompt(session, request.currentPrd(), request.extraInstructions())
                : buildFreshPrdPrompt(request);
        return stream(systemPrompt, userPrompt, session, request.engine(), request.extraInstructions(), onDelta);
    }

    /** 生成执行计划正文，并把每个增量原样转发给调用方。 */
    public String generateDevDoc(DevDocGenerationRequest request, Consumer<String> onDelta) {
        PrdSession session = request.session();
        boolean update = request.updateExisting()
                && request.currentDevDoc() != null && !request.currentDevDoc().isBlank();
        String systemPrompt;
        String userPrompt;
        if (update) {
            systemPrompt = EXECUTION_PLAN_SYSTEM_UPDATE;
            userPrompt = buildDevDocUpdatePrompt(request);
        } else {
            systemPrompt = EXECUTION_PLAN_SYSTEM;
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

    private String buildFreshPrdPrompt(PrdGenerationRequest request) {
        PrdSession session = request.session();
        StringBuilder prompt = new StringBuilder();
        prompt.append("功能标题：").append(session.getTitle()).append("\n");
        appendProject(prompt, session, "关联项目：");
        prompt.append("\n原始需求描述：\n").append(session.getRawInput()).append("\n\n");
        if (request.initialSpec() != null && !request.initialSpec().isBlank()) {
            prompt.append("=== 已确认的初始化规格 ===\n")
                    .append(request.initialSpec()).append("\n\n");
        }
        appendBusinessQuestions(prompt, session.getQuestions());
        prompt.append("请基于以上信息生成完整的核心规格（Markdown 格式）。");
        if (request.extraInstructions() != null && !request.extraInstructions().isBlank()) {
            prompt.append("\n\n【用户在生成前补充的信息——请重点参考并纳入核心规格】\n")
                    .append(request.extraInstructions().trim());
        }
        return prompt.toString();
    }

    private String buildPrdUpdatePrompt(PrdSession session, String currentPrd, String extraInstructions) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("功能标题：").append(session.getTitle()).append("\n\n");
        prompt.append("=== 当前核心规格 ===\n").append(currentPrd).append("\n\n");
        prompt.append("=== 本次修订说明 ===\n");
        prompt.append(extraInstructions != null && !extraInstructions.isBlank()
                ? extraInstructions.trim()
                : "（未提供具体说明，请基于当前内容审视并适度完善，在「实现状态」章节标注哪些是本次调整）");
        prompt.append('\n');
        return prompt.toString();
    }

    private String buildFreshDevDocPrompt(DevDocGenerationRequest request) {
        StringBuilder prompt = buildDevDocHeader(request);
        prompt.append("\n以下是已确认的核心规格：\n\n")
                .append(request.prdContent()).append("\n\n");
        if (request.extraInstructions() != null && !request.extraInstructions().isBlank()) {
            prompt.append("【用户补充说明——生成时请重点参考/遵循】\n")
                    .append(request.extraInstructions().trim()).append("\n\n");
        }
        appendQaHistory(prompt, request.qaHistory(), "【执行计划生成前已确认的技术澄清】", false);
        prompt.append("请基于以上核心规格生成完整的执行计划。");
        return prompt.toString();
    }

    private String buildDevDocUpdatePrompt(DevDocGenerationRequest request) {
        StringBuilder prompt = buildDevDocHeader(request);
        prompt.append("\n=== 当前核心规格 ===\n\n").append(request.prdContent()).append("\n\n");
        prompt.append("=== 当前执行计划 ===\n\n").append(request.currentDevDoc()).append("\n\n");
        prompt.append("=== 本次更新说明 ===\n\n")
                .append(request.extraInstructions() == null || request.extraInstructions().isBlank()
                        ? "（未填写，请结合核心规格与当前执行计划的差异自行判断需要更新的地方）"
                        : request.extraInstructions().trim())
                .append("\n\n");
        appendQaHistory(prompt, request.qaHistory(), "=== 澄清问答 ===", true);
        prompt.append("请基于以上信息生成更新后的完整执行计划。");
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

    private static String value(String value) {
        return value == null ? "" : value;
    }

    /** 核心规格生成所需的不可变输入。 */
    public record PrdGenerationRequest(PrdSession session, String currentPrd, String initialSpec,
                                       String extraInstructions, boolean updateExisting, String engine) {

        public PrdGenerationRequest(PrdSession session, String currentPrd, String extraInstructions,
                                    boolean updateExisting, String engine) {
            this(session, currentPrd, "", extraInstructions, updateExisting, engine);
        }
    }

    /** 执行计划生成所需的不可变输入。 */
    public record DevDocGenerationRequest(PrdSession session, String prdContent, String currentDevDoc,
                                          String extraInstructions, List<QaPairRequest> qaHistory,
                                          String graphContext, boolean updateExisting, String engine) {
    }
}
