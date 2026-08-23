package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.api.dto.QaPairRequest;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;

import java.util.List;
import java.util.Objects;
import java.util.function.Consumer;

/**
 * 生成 PRD 批量澄清问题或渐进式下一题，并隔离模型输出解析与降级规则。
 *
 * <p>会话状态、知识查询、虚拟线程、SSE 生命周期和持久化仍由 {@link PrdClarifyService} 编排。
 */
@Slf4j
public class PrdClarificationQuestionService {

    private static final int LEGACY_DEFAULT_MAX_QUESTIONS = 5;
    private static final String FALLBACK_QUESTION = "请进一步描述您的核心需求和期望效果";

    private static final String ASK_SYSTEM_PRODUCT = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次执行平台统一的需求澄清流程，每轮只输出 1 个精准澄清问题
            （或 [CLARIFICATION_COMPLETE]），不进入其他流程。
            不得依赖某个引擎专属的命令、skill 或 plugin。

            你正在执行 PRD 生成前的需求澄清（产品/开发视角）：
            只确认业务目标、范围和规则，为 PRD 文档生成收集充足信息。技术设计留到 TDD 澄清。

            【提问前置：结合下方知识图谱背景】

            第一层 — 代码知识（见 user prompt 中的【代码知识图谱查询结果】区块，已由系统直接调用
            graphify CLI 查询得到，非 MCP 工具调用）：
            - 若该区块非空，其中是真实的 Java 类、Service 方法、数据库字段
            - 目的：避免问出"现有表有哪些字段"这种已有答案的废话问题
            - 若为空，说明该项目暂无图谱或未匹配到相关内容，忽略即可，不要假装看到了内容

            第二层 — 业务语义（mcp__domain-knowledge__search_knowledge，若可用）：
            - search_knowledge(query=..., project=..., module=...)
            - get_knowledge(id) 获取状态机/流程/规则
            - 目的：问题能引用已有业务状态名/枚举值

            提问规则（严格执行）：
            - 初始化规格存在时，只问其中高影响 OPEN 条目、证据冲突或缺失验收口径
            - 只问如果不明确就无法确定产品目标、业务范围、业务规则或验收口径的问题
            - 可问：业务目标、用户与场景、功能边界、业务流程、业务规则与例外、验收标准
            - 禁止询问：数据库/字段/API/类/方法、框架选型、代码结构、部署方案等实现细节
            - 代码与业务知识图谱只用于识别现有业务行为、避免重复提问；向用户提问时转成业务语言，
              不暴露表名、字段名、类名或方法名
            - 基于上一个回答动态追问，最多 5 轮
            - 只有开发者/产品负责人必须作出明确业务决策时才提问；可从上下文确定、可由实现阶段
              自行选择、或不影响 PRD 完成的问题不要问
            - 信息充足时立即输出：[CLARIFICATION_COMPLETE]
            - 只输出问题本身（或 [CLARIFICATION_COMPLETE]），不加序号、前缀或解释
            """;

    private static final String ASK_SYSTEM_BUSINESS = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次执行平台统一的需求澄清流程，每轮只输出 1 个业务澄清问题
            （或 [CLARIFICATION_COMPLETE]），不进入其他流程。
            不得依赖某个引擎专属的命令、skill 或 plugin。

            你正在执行需求澄清（业务人员视角）：
            帮助非技术背景的业务人员把业务痛点转化为清晰的需求描述。

            【提问前置：先了解现有业务背景，用业务语言表述（不讲技术）】
            1. mcp__domain-knowledge__search_knowledge（若可用）：搜索现有业务流程和规则
               → 提问时用"现有流程是…，这个需求要在哪一步生效？"等业务语言
            2. user prompt 中的【代码知识图谱查询结果】区块（系统已直接调用 graphify CLI 查询，
               非 MCP 工具调用）：包含现有功能结构
               → 转换成业务行为描述，不用类名/字段名；区块为空则忽略

            提问规则（业务版）：
            - 每次只问 1 个如果不明确就无法完成 PRD 的业务决策，聚焦业务本质
            - 可问：业务目标、使用场景、关键数据、业务规则与例外、验收标准
            - 不问：界面细节、数据库/接口、框架选型等技术问题
            - 例外：若界面直接影响业务流程，可以问
            - 语言通俗，避免技术术语，最多 5 轮
            - 信息充足时立即输出：[CLARIFICATION_COMPLETE]
            - 只输出问题本身（或 [CLARIFICATION_COMPLETE]），不加序号或解释
            """;

    private static final String ASK_SYSTEM_BUG = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是缺陷修复的极简澄清路径，每轮只输出 1 个问题（或 [CLARIFICATION_COMPLETE]）。

            你正在澄清一个 Bug 修复需求，目标是快速补全「复现条件」和「期望 vs 实际行为」的落差，
            不是完整的产品需求分析——不问业务目标、使用场景、验收标准这类大而全的问题。

            【可参考 user prompt 中的【代码知识图谱查询结果】区块（系统已直接调用 graphify CLI
            查询得到，非 MCP 工具调用），若非空可用其中的真实类名/方法名让问题更精确；为空则忽略】

            提问规则（严格执行）：
            - 只问以下几类：复现步骤、期望行为 vs 实际行为、影响范围（哪些场景/用户会触发）、
              是否是最近改动引入的回归、是否有报错日志/堆栈
            - 若用户描述已经包含"复现条件 + 期望行为"（如一段具体的 if/else 逻辑判断反了），
              信息通常已经足够，直接输出 [CLARIFICATION_COMPLETE]，不要为了凑轮数硬问
            - 每次只问 1 个当前最缺失的信息点，不加序号、前缀或解释
            """;

    private static final String CLARIFY_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是批量澄清模式，一次性输出 user prompt 指定数量的澄清问题，不进入其他流程。

            【严格输出要求】
            直接输出 JSON 数组，不加任何说明、前言、结语或 Markdown 围栏（禁止 ```json，直接以 [ 开头）。
            每个元素格式：{"question": "问题内容"}

            问题要求：
            - 数量严格等于 user prompt 指定的题数，不多不少
            - 每题聚焦一个独立的歧义点，互相不重复、不递进依赖——因为是一次性问完，不能像
              渐进模式那样根据上一题答案动态调整下一题，每题都要能独立作答
            - 每题简洁具体，一句话内可回答
            - 严格按 user prompt 里的"提问重点"作答（不同需求类型/角色侧重不同）
            - 这是 PRD 生成前的业务澄清：只问业务目标、用户场景、范围、业务规则/例外和验收口径
            - 禁止询问数据库、字段、API、类、方法、框架、代码结构或部署方案等技术实现细节
            - 知识图谱只用于理解现有行为和避免已有答案的问题，提问必须转成业务语言
            - 每个问题都必须是产品/开发负责人不明确回答就无法完成 PRD 的关键决策
            """;

    private final AgentOneShotRunner agentRunner;
    private final ObjectMapper mapper;
    private final PrdImageInputResolver imageInputResolver;

    /** 创建问题生成服务。 */
    public PrdClarificationQuestionService(AgentOneShotRunner agentRunner,
                                           ObjectMapper mapper,
                                           PrdImageInputResolver imageInputResolver) {
        this.agentRunner = Objects.requireNonNull(agentRunner, "agentRunner");
        this.mapper = Objects.requireNonNull(mapper, "mapper");
        this.imageInputResolver = Objects.requireNonNull(imageInputResolver, "imageInputResolver");
    }

    /**
     * 一次性生成批量澄清问题，并把非可信模型输出收敛成标准 questions JSON。
     */
    public String generateBatchQuestions(PrdSession session, String engine, KnowledgeContext knowledge,
                                         Consumer<String> onDelta) {
        StringBuilder full = new StringBuilder();
        Consumer<String> downstream = onDelta == null ? ignored -> { } : onDelta;
        agentRunner.stream(
                CLARIFY_SYSTEM,
                buildBatchPrompt(session, knowledge),
                session.getModel(),
                engine,
                delta -> {
                    full.append(delta);
                    downstream.accept(delta);
                },
                imageInputResolver.resolve(session.getRawInput()));
        return parseBatchQuestions(full.toString());
    }

    /** 流式生成渐进式澄清的下一题。 */
    public void streamNextQuestion(PrdSession session, int questionIndex, List<QaPairRequest> history,
                                   String engine, KnowledgeContext knowledge, Consumer<String> onDelta) {
        agentRunner.stream(
                selectAskSystem(session),
                buildProgressivePrompt(session, questionIndex, history, knowledge),
                session.getModel(),
                engine,
                onDelta,
                imageInputResolver.resolve(session.getRawInput()));
    }

    private static String selectAskSystem(PrdSession session) {
        if (PrdRequirementTypeResolver.BUG_FIX.equals(session.getReqType())) {
            return ASK_SYSTEM_BUG;
        }
        return "BUSINESS".equals(session.getRole()) ? ASK_SYSTEM_BUSINESS : ASK_SYSTEM_PRODUCT;
    }

    private String buildBatchPrompt(PrdSession session, KnowledgeContext knowledge) {
        int count = maxQuestions(session);
        StringBuilder prompt = new StringBuilder();
        prompt.append("功能标题：").append(session.getTitle()).append("\n");
        if (session.getProject() != null && !session.getProject().isBlank()) {
            prompt.append("关联项目：").append(session.getProject()).append("\n");
        }
        if (session.getModule() != null && !session.getModule().isBlank()) {
            prompt.append("关联模块：").append(session.getModule()).append("\n");
        }
        prompt.append("\n本次需要一次性提出 ").append(count).append(" 个澄清问题。\n");
        prompt.append("提问重点：").append(batchFocusHint(session)).append("\n");
        appendKnowledgeContext(prompt, knowledge);
        prompt.append("\n原始需求描述：\n").append(session.getRawInput()).append("\n\n");
        prompt.append("请提出 ").append(count).append(" 个澄清问题（严格输出 JSON 数组，不加 markdown）。");
        return prompt.toString();
    }

    private String buildProgressivePrompt(PrdSession session, int questionIndex, List<QaPairRequest> history,
                                          KnowledgeContext knowledge) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("需求标题：").append(session.getTitle()).append("\n");
        if (session.getProject() != null && !session.getProject().isBlank()) {
            prompt.append("项目：").append(session.getProject());
            if (session.getModule() != null && !session.getModule().isBlank()) {
                prompt.append(" / ").append(session.getModule());
            }
            prompt.append("\n");
        }
        prompt.append("\n原始需求描述：\n").append(session.getRawInput()).append("\n\n");
        if (history != null && !history.isEmpty()) {
            prompt.append("已完成的澄清问答（").append(history.size()).append("轮）：\n");
            for (QaPairRequest qa : history) {
                prompt.append("问：").append(qa.question()).append("\n");
                prompt.append("答：").append(qa.answer()).append("\n\n");
            }
        }
        appendKnowledgeContext(prompt, knowledge);
        int maxQuestions = maxQuestions(session);
        int remaining = maxQuestions - questionIndex;
        prompt.append("这是第 ").append(questionIndex + 1).append(" 个问题（本次澄清最多 ")
                .append(maxQuestions).append(" 轮，还可以最多再问 ")
                .append(remaining - 1).append(" 个）。\n");
        prompt.append("请提出下一个最关键的澄清问题，或输出 [CLARIFICATION_COMPLETE]：");
        return prompt.toString();
    }

    private static int maxQuestions(PrdSession session) {
        return session.getMaxQuestions() > 0 ? session.getMaxQuestions() : LEGACY_DEFAULT_MAX_QUESTIONS;
    }

    private static String batchFocusHint(PrdSession session) {
        if (PrdRequirementTypeResolver.BUG_FIX.equals(session.getReqType())) {
            return "这是缺陷修复需求，只问复现步骤、期望 vs 实际行为的落差、影响范围（哪些场景/用户会触发）、"
                    + "业务上的正确处理规则；不问代码位置、报错堆栈或具体修复方式。";
        }
        if ("BUSINESS".equals(session.getRole())) {
            return "提问对象是非技术背景的业务人员：只问业务目标、使用场景、关键数据、业务规则与例外、验收标准，"
                    + "不问界面细节/数据库/接口/框架选型等技术问题（除非直接影响业务流程），语言通俗，避免技术术语。";
        }
        return "提问对象是产品/开发人员：只问业务目标、用户场景、功能边界、业务流程、业务规则与例外、"
                + "验收口径；不问数据库、字段、接口、类、方法、框架或部署等实现细节。";
    }

    private static void appendKnowledgeContext(StringBuilder prompt, KnowledgeContext knowledge) {
        KnowledgeContext safeKnowledge = knowledge == null ? KnowledgeContext.EMPTY : knowledge;
        if (!safeKnowledge.initialSpec().isBlank()) {
            prompt.append("\n【待审阅的初始化规格】\n");
            prompt.append(safeKnowledge.initialSpec()).append("\n");
            prompt.append("问题必须优先来自其中的 OPEN 条目；已有证据支持的条目不要重复询问。\n");
        }
        if (!safeKnowledge.graphContext().isBlank()) {
            prompt.append("\n【代码知识图谱查询结果】（系统已直接调用 graphify CLI 查询，非 MCP，内容为真实代码事实）\n");
            prompt.append(safeKnowledge.graphContext()).append("\n");
        }
        if (!safeKnowledge.domainContext().isBlank()) {
            prompt.append("\n【业务知识图谱查询结果】（系统已直接检索 project-domain-knowledge 库，")
                    .append("内容为团队沉淀的业务真理，可信）\n");
            prompt.append(safeKnowledge.domainContext()).append("\n");
        }
    }

    private String parseBatchQuestions(String raw) {
        String cleaned = stripFence(raw == null ? "" : raw.trim());
        try {
            JsonNode source = mapper.readTree(cleaned);
            if (!source.isArray()) {
                throw new IllegalStateException("Agent 返回的不是 JSON 数组");
            }
            ArrayNode result = mapper.createArrayNode();
            int index = 1;
            for (JsonNode node : source) {
                ObjectNode item = mapper.createObjectNode();
                item.put("id", node.has("id") ? node.path("id").asInt(index) : index);
                item.put("question", node.path("question").asText(""));
                item.put("answer", "");
                result.add(item);
                index++;
            }
            return mapper.writeValueAsString(result);
        } catch (Exception e) {
            log.warn("[prd-clarify] 澄清问题解析失败，使用 fallback", e);
            return fallbackQuestions();
        }
    }

    private String fallbackQuestions() {
        try {
            ArrayNode questions = mapper.createArrayNode();
            ObjectNode item = mapper.createObjectNode();
            item.put("id", 1);
            item.put("question", FALLBACK_QUESTION);
            item.put("answer", "");
            questions.add(item);
            return mapper.writeValueAsString(questions);
        } catch (JsonProcessingException e) {
            log.warn("[prd-clarify] fallback 问题序列化失败，使用固定 JSON", e);
            return "[{\"id\":1,\"question\":\"" + FALLBACK_QUESTION + "\",\"answer\":\"\"}]";
        }
    }

    private static String stripFence(String text) {
        if (text.startsWith("```")) {
            int start = text.indexOf('\n');
            int end = text.lastIndexOf("```");
            if (start > 0 && end > start) {
                return text.substring(start + 1, end).trim();
            }
        }
        return text;
    }

    /** 已由门面查询完成的代码与业务知识上下文。 */
    public record KnowledgeContext(String graphContext, String domainContext, String initialSpec) {
        private static final KnowledgeContext EMPTY = new KnowledgeContext("", "", "");

        public KnowledgeContext(String graphContext, String domainContext) {
            this(graphContext, domainContext, "");
        }

        public KnowledgeContext {
            graphContext = graphContext == null ? "" : graphContext;
            domainContext = domainContext == null ? "" : domainContext;
            initialSpec = initialSpec == null ? "" : initialSpec;
        }
    }
}
