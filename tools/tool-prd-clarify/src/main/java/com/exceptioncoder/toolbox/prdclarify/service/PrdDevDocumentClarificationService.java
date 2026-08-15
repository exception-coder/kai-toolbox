package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.api.dto.QaPairRequest;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * TDD 技术澄清应用服务，负责渐进提问、批量问题生成及模型输出裁决。
 */
@Slf4j
@Service
public class PrdDevDocumentClarificationService {

    /** TDD 技术澄清的最大问题数，与 PRD 业务澄清轮数相互独立。 */
    static final int MAX_QUESTIONS = 5;

    private static final String INITIAL_ASK_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是 TDD 生成前的技术澄清，每轮只输出 1 个精准问题（或 [CLARIFICATION_COMPLETE]）。

            user prompt 会提供正式 PRD、代码知识图谱、业务知识图谱、用户补充约束和历史问答。
            先用这些事实自行消除疑问，只把“若不由开发者明确，TDD 会产生不同实现结果或带来
            兼容/数据/安全风险”的内容做成问题卡片。

            可提问范围：
            - 既有 API/事件/数据结构的兼容策略与迁移方式
            - 数据一致性、幂等、事务边界、并发冲突和失败补偿
            - 权限、安全、审计、性能容量等会改变实现方案的硬约束
            - 多种实现路径会影响现有代码边界时，需要开发者选择的关键方案

            禁止提问：
            - PRD 已确认的业务目标、范围、流程或验收口径
            - 代码/知识图谱里已有明确答案的问题
            - 命名、目录、普通类拆分、局部写法等开发者可以自行决定的细枝末节
            - “是否还有补充”“想用什么技术”等宽泛问题

            提问规则（严格执行）：
            - 每次只问 1 个问题，并给出从 PRD/图谱发现的具体冲突或选择背景
            - 问题必须让开发者能给出明确选项、规则或数值，不能泛泛讨论
            - 若编码关键细节都能从现有事实确定，直接输出 [CLARIFICATION_COMPLETE]
            - 最多 5 轮；不要为了凑轮数硬问
            - 只输出问题本身（或 [CLARIFICATION_COMPLETE]），不加序号、前缀或解释
            """;

    private static final String UPDATE_ASK_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是已有 TDD 更新前的技术澄清，每轮只输出 1 个精准问题（或 [CLARIFICATION_COMPLETE]）。

            user prompt 会给出当前 TDD、最新 PRD、代码/业务知识图谱、更新说明和历史问答。
            找出本次更新相对当前 TDD 会导致实现分歧，且必须由开发者明确的关键技术决策，例如：
            兼容旧调用方、字段迁移/默认值、事务与幂等、异常补偿、权限与性能硬约束。

            提问规则（严格执行）：
            - 每次只问 1 个问题，具体引用当前 TDD 或图谱中的真实接口、表、方法或约束
            - 不问已有答案、跟本次更新无关、或开发者可自行安全决定的普通实现细节
            - 若更新说明已经足够明确且不会产生关键实现分歧，
              直接输出 [CLARIFICATION_COMPLETE]，不要为了凑轮数硬问
            - 最多 5 轮
            - 只输出问题本身（或 [CLARIFICATION_COMPLETE]），不加序号、前缀或解释
            """;

    private static final String BATCH_ASK_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是 TDD 生成或更新前的批量技术澄清。一次性找出全部必须由开发者明确的关键技术决策，
            最多 5 个；不要逐题追问，也不要为了凑数量制造问题。

            user prompt 会提供正式 PRD、代码知识图谱、业务知识图谱，以及在更新模式下的当前 TDD。
            先使用已有事实自行消除疑问。只有缺少答案会导致不同实现结果，或带来兼容、数据、
            安全、事务、幂等、性能风险时才提问。

            可提问范围：
            - 既有 API、事件、数据结构的兼容与迁移策略
            - 数据一致性、事务边界、并发冲突、幂等及失败补偿
            - 权限、安全、审计、容量和性能方面的硬约束
            - 会实质改变现有代码边界的关键实现方案选择

            禁止提问：
            - PRD 已确认的业务目标、范围、流程或验收口径
            - 代码或知识图谱已有明确答案的事实
            - 命名、目录、普通类拆分、局部写法等可安全自行决定的细节
            - “是否还有补充”“想用什么技术”等宽泛问题

            严格只输出 JSON 数组，不加 Markdown 围栏、前言或解释：
            [{"id":1,"question":"问题文本"},{"id":2,"question":"问题文本"}]
            每个问题必须包含具体背景，并能用明确选项、规则或数值回答。按风险和阻塞程度排序。
            如果现有信息已经足够，输出空数组 []。
            """;

    private final AgentOneShotRunner agentRunner;
    private final PrdSessionRepository repository;
    private final PrdFileStore fileStore;
    private final PrdDevDocumentService devDocumentService;
    private final ObjectMapper objectMapper;
    private final GraphifyQueryService graphifyQuery;
    private final DomainKnowledgeQueryService domainKnowledgeQuery;

    public PrdDevDocumentClarificationService(AgentOneShotRunner agentRunner,
                                               PrdSessionRepository repository,
                                               PrdFileStore fileStore,
                                               PrdDevDocumentService devDocumentService,
                                               ObjectMapper objectMapper,
                                               GraphifyQueryService graphifyQuery,
                                               DomainKnowledgeQueryService domainKnowledgeQuery) {
        this.agentRunner = agentRunner;
        this.repository = repository;
        this.fileStore = fileStore;
        this.devDocumentService = devDocumentService;
        this.objectMapper = objectMapper;
        this.graphifyQuery = graphifyQuery;
        this.domainKnowledgeQuery = domainKnowledgeQuery;
    }

    /** 请求下一项必须由开发者明确的技术决策。 */
    public void askNextQuestion(String sessionId, int questionIndex, List<QaPairRequest> history,
                                String updateNotes, String mode, SseEmitter emitter) {
        List<QaPairRequest> effectiveHistory = history == null ? List.of() : history;
        if (questionIndex >= MAX_QUESTIONS) {
            completeClarification(emitter);
            return;
        }

        PrdSession session = findSession(sessionId);
        Thread.ofVirtual().name("prd-dev-doc-ask-").start(() -> runNextQuestion(
                session, questionIndex, effectiveHistory, updateNotes, mode, emitter));
    }

    /** 一次模型调用生成全部关键技术澄清问题。 */
    public void generateQuestions(String sessionId, String updateNotes, String mode,
                                  Boolean background, SseEmitter emitter) {
        PrdSession session = findSession(sessionId);
        boolean continueOnDisconnect = Boolean.TRUE.equals(background);
        repository.updateDevDocQaDraft(sessionId, null);
        repository.updateDevDocQuestionsGeneratedAt(sessionId, null);
        repository.updateDevDocWorkStatus(sessionId, "BUILDING_QUESTIONS", null);

        Thread.ofVirtual().name("prd-dev-doc-questions-").start(() -> runQuestionGeneration(
                session, updateNotes, mode, continueOnDisconnect, emitter));
    }

    private void runNextQuestion(PrdSession session, int questionIndex, List<QaPairRequest> history,
                                 String updateNotes, String mode, SseEmitter emitter) {
        try {
            ClarificationContext context = loadContext(session, updateNotes, mode, history);
            String prompt = buildNextQuestionPrompt(context, questionIndex);
            String systemPrompt = context.update() ? UPDATE_ASK_SYSTEM : INITIAL_ASK_SYSTEM;
            agentRunner.stream(systemPrompt, prompt, session.getModel(), normalizeEngine(session.getEngine()),
                    delta -> sendChunk(emitter, delta));
            sendDone(emitter);
        } catch (Exception e) {
            log.warn("[prd-clarify] askNextDevDocQuestion failed sessionId={}", session.getId(), e);
            sendError(emitter, e);
        }
    }

    private void runQuestionGeneration(PrdSession session, String updateNotes, String mode,
                                       boolean continueOnDisconnect, SseEmitter emitter) {
        AtomicBoolean clientConnected = new AtomicBoolean(true);
        try {
            ClarificationContext context = loadContext(session, updateNotes, mode, List.of());
            String prompt = buildContextPrompt(context)
                    .append("请一次性输出全部关键技术澄清问题（最多 ")
                    .append(MAX_QUESTIONS)
                    .append(" 个），没有问题时输出 []。")
                    .toString();
            StringBuilder fullResponse = new StringBuilder();
            agentRunner.stream(BATCH_ASK_SYSTEM, prompt, session.getModel(), normalizeEngine(session.getEngine()),
                    delta -> collectBatchDelta(
                            delta, fullResponse, emitter, continueOnDisconnect, clientConnected));
            persistQuestions(session.getId(), parseQuestionsJson(fullResponse.toString()));
            completeQuestionGeneration(emitter, continueOnDisconnect, clientConnected);
        } catch (Exception e) {
            log.warn("[prd-clarify] generateDevDocQuestions failed sessionId={}", session.getId(), e);
            repository.updateDevDocWorkStatus(session.getId(), "ERROR", e.getMessage());
            if (!continueOnDisconnect || clientConnected.get()) {
                sendError(emitter, e);
            }
        }
    }

    private ClarificationContext loadContext(PrdSession session, String updateNotes, String mode,
                                             List<QaPairRequest> history) throws IOException {
        boolean update = "update".equalsIgnoreCase(mode);
        String prdContent = fileStore.read(session.getId());
        if (prdContent == null || prdContent.isBlank()) {
            throw new IllegalStateException("PRD 内容为空，请先完成 PRD");
        }
        String currentDevDoc = update ? devDocumentService.readContent(session.getId()) : null;
        if (update && (currentDevDoc == null || currentDevDoc.isBlank())) {
            throw new IllegalStateException("当前 TDD 内容为空，无法执行增量更新澄清");
        }
        return new ClarificationContext(session, prdContent, currentDevDoc, updateNotes, history, update);
    }

    private String buildNextQuestionPrompt(ClarificationContext context, int questionIndex) {
        StringBuilder prompt = buildContextPrompt(context);
        int remaining = MAX_QUESTIONS - questionIndex;
        prompt.append("这是第 ").append(questionIndex + 1).append(" 个问题（最多 ")
                .append(MAX_QUESTIONS).append(" 轮，还可以最多再问 ")
                .append(remaining - 1).append(" 个）。\n")
                .append("请提出下一个最关键的澄清问题，或输出 [CLARIFICATION_COMPLETE]：");
        return prompt.toString();
    }

    private StringBuilder buildContextPrompt(ClarificationContext context) {
        PrdSession session = context.session();
        StringBuilder prompt = new StringBuilder();
        prompt.append("需求标题：").append(session.getTitle()).append("\n");
        appendGraphContext(prompt, queryGraphContext(
                session.getProject(), session.getModule(), session.getTitle()));
        appendDomainContext(prompt, queryDomainContext(session.getProject(), session.getTitle()));
        prompt.append("\n=== 已确认 PRD ===\n\n").append(context.prdContent()).append("\n\n");
        if (context.update()) {
            prompt.append("=== 当前 TDD ===\n\n").append(context.currentDevDoc()).append("\n\n");
        }
        prompt.append(context.update() ? "=== 本次更新说明 ===\n\n" : "=== 开发者补充约束 ===\n\n")
                .append(normalizeNotes(context.updateNotes()))
                .append("\n\n");
        appendHistory(prompt, context.history());
        return prompt;
    }

    private void collectBatchDelta(String delta, StringBuilder fullResponse, SseEmitter emitter,
                                   boolean continueOnDisconnect, AtomicBoolean clientConnected) {
        fullResponse.append(delta);
        if (continueOnDisconnect) {
            sendChunkBestEffort(emitter, delta, clientConnected);
        } else {
            sendChunk(emitter, delta);
        }
    }

    private void persistQuestions(String sessionId, String questionsJson) {
        repository.updateDevDocQaDraft(sessionId, questionsJson);
        repository.updateDevDocQuestionsGeneratedAt(sessionId, System.currentTimeMillis());
        repository.updateDevDocWorkStatus(sessionId, "AWAITING_ANSWERS", null);
    }

    private void completeQuestionGeneration(SseEmitter emitter, boolean continueOnDisconnect,
                                            AtomicBoolean clientConnected) {
        if (continueOnDisconnect) {
            sendDoneBestEffort(emitter, clientConnected);
        } else {
            sendDone(emitter);
        }
    }

    private String parseQuestionsJson(String raw) throws JsonProcessingException {
        String cleaned = stripFence(raw == null ? "" : raw.trim());
        JsonNode source = objectMapper.readTree(cleaned);
        if (!source.isArray()) {
            throw new IllegalStateException("TDD 技术问题返回格式不是 JSON 数组");
        }
        ArrayNode result = objectMapper.createArrayNode();
        Set<String> seen = new LinkedHashSet<>();
        int id = 1;
        for (JsonNode node : source) {
            String question = node.isTextual()
                    ? node.asText("").trim()
                    : node.path("question").asText("").trim();
            if (question.isBlank() || !seen.add(question)) {
                continue;
            }
            ObjectNode item = objectMapper.createObjectNode();
            item.put("id", id++);
            item.put("question", question);
            item.put("answer", "");
            result.add(item);
            if (result.size() >= MAX_QUESTIONS) {
                break;
            }
        }
        return objectMapper.writeValueAsString(result);
    }

    private PrdSession findSession(String sessionId) {
        return repository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
    }

    private static String normalizeNotes(String updateNotes) {
        return updateNotes == null || updateNotes.isBlank() ? "（未填写）" : updateNotes.trim();
    }

    private static void appendHistory(StringBuilder prompt, List<QaPairRequest> history) {
        if (history.isEmpty()) {
            return;
        }
        prompt.append("已完成的澄清问答（").append(history.size()).append("轮）：\n");
        for (QaPairRequest pair : history) {
            prompt.append("问：").append(pair.question()).append("\n")
                    .append("答：").append(pair.answer()).append("\n\n");
        }
    }

    private Optional<String> queryGraphContext(String project, String module, String title) {
        List<String> projects = splitProjects(project);
        if (projects.size() <= 1) {
            String selectedProject = projects.isEmpty() ? null : projects.get(0);
            return Optional.ofNullable(graphifyQuery.query(selectedProject, module, title));
        }
        StringBuilder merged = new StringBuilder();
        for (String selectedProject : projects) {
            appendProjectResult(merged, selectedProject,
                    graphifyQuery.query(selectedProject, module, title));
        }
        return merged.isEmpty() ? Optional.empty() : Optional.of(merged.toString());
    }

    private Optional<String> queryDomainContext(String project, String title) {
        List<String> projects = splitProjects(project);
        if (projects.size() <= 1) {
            String selectedProject = projects.isEmpty() ? null : projects.get(0);
            return Optional.ofNullable(domainKnowledgeQuery.query(selectedProject, title));
        }
        StringBuilder merged = new StringBuilder();
        for (String selectedProject : projects) {
            appendProjectResult(merged, selectedProject,
                    domainKnowledgeQuery.query(selectedProject, title));
        }
        return merged.isEmpty() ? Optional.empty() : Optional.of(merged.toString());
    }

    private static void appendProjectResult(StringBuilder merged, String project, String result) {
        if (result == null || result.isBlank()) {
            return;
        }
        if (!merged.isEmpty()) {
            merged.append("\n\n");
        }
        merged.append("--- 项目 ").append(project).append(" ---\n").append(result);
    }

    private static List<String> splitProjects(String project) {
        if (project == null || project.isBlank()) {
            return List.of();
        }
        return Arrays.stream(project.split("[,，、]"))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .distinct()
                .toList();
    }

    private static void appendGraphContext(StringBuilder prompt, Optional<String> graphContext) {
        if (graphContext.isEmpty() || graphContext.get().isBlank()) {
            return;
        }
        prompt.append("\n【代码知识图谱查询结果】（系统已直接调用 graphify CLI 查询，非 MCP，内容为真实代码事实）\n")
                .append(graphContext.get()).append("\n");
    }

    private static void appendDomainContext(StringBuilder prompt, Optional<String> domainContext) {
        if (domainContext.isEmpty() || domainContext.get().isBlank()) {
            return;
        }
        prompt.append("\n【业务知识图谱查询结果】（系统已直接检索 project-domain-knowledge 库，内容为团队沉淀的业务真理，可信）\n")
                .append(domainContext.get()).append("\n");
    }

    private static String normalizeEngine(String engine) {
        if (engine == null || engine.isBlank() || "claude".equalsIgnoreCase(engine)) {
            return "claude";
        }
        if ("codex".equalsIgnoreCase(engine)) {
            return "codex";
        }
        throw new IllegalArgumentException("不支持的 Agent 引擎: " + engine);
    }

    private static String stripFence(String value) {
        if (value.startsWith("```")) {
            int start = value.indexOf('\n');
            int end = value.lastIndexOf("```");
            if (start > 0 && end > start) {
                return value.substring(start + 1, end).trim();
            }
        }
        return value;
    }

    private static void completeClarification(SseEmitter emitter) {
        try {
            emitter.send(SseEmitter.event().name("chunk")
                    .data(Map.of("content", "[CLARIFICATION_COMPLETE]")));
            emitter.send(SseEmitter.event().name("done").data("{}"));
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    }

    private static void sendChunk(SseEmitter emitter, String chunk) {
        if (chunk == null || chunk.isEmpty()) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name("chunk").data(Map.of("content", chunk)));
        } catch (Exception e) {
            emitter.completeWithError(e);
            throw new IllegalStateException("SSE client disconnected", e);
        }
    }

    private static void sendChunkBestEffort(SseEmitter emitter, String chunk,
                                            AtomicBoolean clientConnected) {
        if (chunk == null || chunk.isEmpty() || !clientConnected.get()) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name("chunk").data(Map.of("content", chunk)));
        } catch (Exception e) {
            clientConnected.set(false);
            log.info("[prd-clarify] TDD 后台生成客户端已断开，继续执行并落盘");
        }
    }

    private static void sendDoneBestEffort(SseEmitter emitter, AtomicBoolean clientConnected) {
        if (!clientConnected.get()) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name("done").data("{}"));
            emitter.complete();
        } catch (Exception e) {
            clientConnected.set(false);
        }
    }

    private static void sendDone(SseEmitter emitter) {
        try {
            emitter.send(SseEmitter.event().name("done").data("{}"));
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    }

    private static void sendError(SseEmitter emitter, Throwable error) {
        String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        try {
            emitter.send(SseEmitter.event().name("error").data(Map.of("message", message)));
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    }

    /**
     * TDD 技术澄清的不可变输入快照。
     *
     * @param session 当前 PRD 会话
     * @param prdContent 已确认的 PRD 正文
     * @param currentDevDoc 更新模式下的当前 TDD
     * @param updateNotes 开发者补充约束或更新说明
     * @param history 当前澄清问答历史
     * @param update 是否为增量更新模式
     */
    private record ClarificationContext(
            PrdSession session,
            String prdContent,
            String currentDevDoc,
            String updateNotes,
            List<QaPairRequest> history,
            boolean update
    ) {
    }
}
