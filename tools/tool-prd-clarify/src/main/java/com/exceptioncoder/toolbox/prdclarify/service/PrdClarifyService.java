package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * PRD 澄清核心服务。
 *
 * <p>两阶段流程：
 * <ol>
 *   <li><b>澄清阶段</b>（{@link #clarify}）：调 Claude 生成澄清问题（JSON），流式推 SSE，落库。</li>
 *   <li><b>生成阶段</b>（{@link #generate}）：读出问答，调 Claude 生成 PRD Markdown，流式推 SSE，落盘。</li>
 * </ol>
 *
 * <p>SSE 事件命名与 resume 模块一致：{@code chunk}（文本增量）、{@code done}（完成）、{@code error}（失败）。
 */
@Slf4j
@Service
public class PrdClarifyService {

    // ───── Claude Prompts ─────

    private static final String CLARIFY_SYSTEM = """
            你是一名资深产品需求分析师，专注于帮助团队在动手开发前彻底厘清需求。
            用户会给你一段功能需求描述。你的任务是提出 5 个最关键的澄清问题，补全模糊点、边界条件和业务规则。

            【严格输出要求】
            直接输出 JSON 数组，不加任何说明、前言、结语或 Markdown 围栏（禁止 ```json，直接以 [ 开头）。
            每个元素格式：{"id": 数字, "question": "问题内容"}

            问题要求：
            - 每个问题简洁具体，一句话内可回答
            - 聚焦：业务目标、目标用户、功能边界、非功能需求（性能/安全/兼容性）、验收标准
            - 不重复，不问需求里已说清楚的内容
            - 严格 5 个，不多不少
            """;

    private static final String GENERATE_SYSTEM = """
            你是一名资深产品经理，请根据用户的原始需求和澄清问答，生成一份完整、专业的 PRD 文档。

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

    // ─────────────────────────

    private final AgentOneShotRunner agentRunner;
    private final PrdSessionRepository repo;
    private final PrdFileStore fileStore;
    private final ObjectMapper mapper;

    public PrdClarifyService(AgentOneShotRunner agentRunner,
                             PrdSessionRepository repo,
                             PrdFileStore fileStore,
                             ObjectMapper mapper) {
        this.agentRunner = agentRunner;
        this.repo = repo;
        this.fileStore = fileStore;
        this.mapper = mapper;
    }

    /** 创建会话并持久化，返回新建的会话对象。 */
    public PrdSession createSession(String title, String rawInput,
                                    String project, String module, String model) {
        long now = System.currentTimeMillis();
        PrdSession session = PrdSession.builder()
                .id(UUID.randomUUID().toString())
                .title(title)
                .rawInput(rawInput)
                .project(project)
                .module(module)
                .model(model)
                .status("CLARIFYING")
                .createdAt(now)
                .updatedAt(now)
                .build();
        repo.insert(session);
        return session;
    }

    /**
     * 澄清阶段：调 Claude 生成 5 个澄清问题（JSON），通过 SSE 流式推出，完成后更新库。
     * 在虚拟线程中调用；Controller 直接返回 SseEmitter。
     */
    public void clarify(String sessionId, SseEmitter emitter) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        Thread.ofVirtual().name("prd-clarify-").start(() -> {
            try {
                StringBuilder full = new StringBuilder();
                agentRunner.stream(
                        CLARIFY_SYSTEM,
                        buildClarifyPrompt(session),
                        session.getModel(),
                        delta -> {
                            full.append(delta);
                            sendChunk(emitter, delta);
                        });

                // 解析 JSON，写回库
                String questionsJson = parseAndBuildQuestionsJson(full.toString());
                repo.updateQuestions(sessionId, questionsJson);

                sendDone(emitter);
            } catch (Exception e) {
                log.warn("[prd-clarify] 澄清阶段失败 sessionId={}", sessionId, e);
                repo.updateError(sessionId, e.getMessage());
                sendError(emitter, e);
            }
        });
    }

    /**
     * 提交用户答案：将答案写入 questions JSON 后更新库。
     *
     * @param sessionId 会话 ID
     * @param answers   按问题序号（0-based）排列的答案列表
     */
    public PrdSession submitAnswers(String sessionId, List<String> answers) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        if (!"CLARIFYING".equals(session.getStatus())) {
            throw new IllegalStateException("当前状态 " + session.getStatus() + " 不允许提交答案");
        }

        String updatedJson = mergeAnswers(session.getQuestions(), answers);
        repo.updateQuestions(sessionId, updatedJson);

        // 重新加载最新记录返回
        return repo.findById(sessionId).orElse(session);
    }

    /**
     * 生成阶段：读取问答，调 Claude 生成 PRD Markdown，通过 SSE 流式推出，落盘后更新库。
     * 在虚拟线程中调用；Controller 直接返回 SseEmitter。
     */
    public void generate(String sessionId, SseEmitter emitter) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        repo.updateStatus(sessionId, "GENERATING");

        Thread.ofVirtual().name("prd-generate-").start(() -> {
            try {
                StringBuilder full = new StringBuilder();
                agentRunner.stream(
                        GENERATE_SYSTEM,
                        buildGeneratePrompt(session),
                        session.getModel(),
                        delta -> {
                            full.append(delta);
                            sendChunk(emitter, delta);
                        });

                String prdContent = full.toString();
                fileStore.write(sessionId, prdContent);
                String mdPath = fileStore.pathFor(sessionId).toString();
                repo.updateDone(sessionId, mdPath);

                sendDone(emitter);
            } catch (Exception e) {
                log.warn("[prd-clarify] 生成阶段失败 sessionId={}", sessionId, e);
                repo.updateError(sessionId, e.getMessage());
                sendError(emitter, e);
            }
        });
    }

    /** 覆写文件内容（用户在编辑器手动保存）。 */
    public void saveContent(String sessionId, String content) throws IOException {
        repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        fileStore.write(sessionId, content);
    }

    /** 读取 .md 文件内容。 */
    public String readContent(String sessionId) throws IOException {
        repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        return fileStore.read(sessionId);
    }

    /** 删除会话及关联文件。 */
    public void delete(String sessionId) throws IOException {
        fileStore.delete(sessionId);
        repo.delete(sessionId);
    }

    // ───── Prompt 构建 ─────

    private String buildClarifyPrompt(PrdSession s) {
        StringBuilder sb = new StringBuilder();
        sb.append("功能标题：").append(s.getTitle()).append("\n");
        if (s.getProject() != null && !s.getProject().isBlank()) {
            sb.append("关联项目：").append(s.getProject()).append("\n");
        }
        if (s.getModule() != null && !s.getModule().isBlank()) {
            sb.append("关联模块：").append(s.getModule()).append("\n");
        }
        sb.append("\n原始需求描述：\n").append(s.getRawInput()).append("\n\n");
        sb.append("请提出 5 个澄清问题（输出纯 JSON 数组，不加 markdown）。");
        return sb.toString();
    }

    private String buildGeneratePrompt(PrdSession s) {
        StringBuilder sb = new StringBuilder();
        sb.append("功能标题：").append(s.getTitle()).append("\n");
        if (s.getProject() != null && !s.getProject().isBlank()) {
            sb.append("关联项目：").append(s.getProject());
            if (s.getModule() != null && !s.getModule().isBlank()) {
                sb.append(" / ").append(s.getModule());
            }
            sb.append("\n");
        }
        sb.append("\n原始需求描述：\n").append(s.getRawInput()).append("\n\n");

        // 追加问答
        if (s.getQuestions() != null && !s.getQuestions().isBlank()) {
            sb.append("需求澄清问答：\n");
            try {
                JsonNode arr = mapper.readTree(s.getQuestions());
                if (arr.isArray()) {
                    int idx = 1;
                    for (JsonNode node : arr) {
                        sb.append("Q").append(idx).append(": ").append(node.path("question").asText("")).append("\n");
                        sb.append("A").append(idx).append(": ").append(node.path("answer").asText("（未填写）")).append("\n");
                        idx++;
                    }
                }
            } catch (Exception e) {
                sb.append(s.getQuestions()).append("\n");
            }
            sb.append("\n");
        }

        sb.append("请基于以上信息生成完整的 PRD 文档（Markdown 格式）。");
        return sb.toString();
    }

    // ───── JSON 解析与合并 ─────

    /**
     * 将 Claude 返回的问题 JSON 解析后，构建包含空 answer 的标准 questions JSON。
     * 解析失败时 fallback 为单个通用问题。
     */
    private String parseAndBuildQuestionsJson(String raw) {
        String cleaned = stripFence(raw == null ? "" : raw.trim());
        try {
            JsonNode arr = mapper.readTree(cleaned);
            if (!arr.isArray()) {
                throw new IllegalStateException("Claude 返回的不是 JSON 数组");
            }
            ArrayNode result = mapper.createArrayNode();
            int idx = 1;
            for (JsonNode node : arr) {
                ObjectNode item = mapper.createObjectNode();
                item.put("id", node.has("id") ? node.path("id").asInt(idx) : idx);
                item.put("question", node.path("question").asText(""));
                item.put("answer", "");
                result.add(item);
                idx++;
            }
            return mapper.writeValueAsString(result);
        } catch (Exception e) {
            log.warn("[prd-clarify] 澄清问题解析失败，使用 fallback: {}", e.getMessage());
            return fallbackQuestions();
        }
    }

    /** 将用户答案合并进已有的 questions JSON。 */
    private String mergeAnswers(String questionsJson, List<String> answers) {
        if (questionsJson == null || questionsJson.isBlank()) {
            return "[]";
        }
        try {
            JsonNode arr = mapper.readTree(questionsJson);
            if (!arr.isArray()) {
                return questionsJson;
            }
            ArrayNode result = mapper.createArrayNode();
            int idx = 0;
            for (JsonNode node : arr) {
                ObjectNode item = mapper.createObjectNode();
                item.put("id", node.path("id").asInt(idx + 1));
                item.put("question", node.path("question").asText(""));
                item.put("answer", idx < answers.size() ? answers.get(idx) : "");
                result.add(item);
                idx++;
            }
            return mapper.writeValueAsString(result);
        } catch (Exception e) {
            log.warn("[prd-clarify] 答案合并失败: {}", e.getMessage());
            return questionsJson;
        }
    }

    private String fallbackQuestions() {
        try {
            ArrayNode arr = mapper.createArrayNode();
            ObjectNode item = mapper.createObjectNode();
            item.put("id", 1);
            item.put("question", "请进一步描述您的核心需求和期望效果");
            item.put("answer", "");
            arr.add(item);
            return mapper.writeValueAsString(arr);
        } catch (JsonProcessingException e) {
            return "[{\"id\":1,\"question\":\"请进一步描述您的核心需求和期望效果\",\"answer\":\"\"}]";
        }
    }

    /** 去除可能的 ```json 或 ``` 围栏。 */
    private static String stripFence(String s) {
        if (s.startsWith("```")) {
            int start = s.indexOf('\n');
            int end = s.lastIndexOf("```");
            if (start > 0 && end > start) {
                return s.substring(start + 1, end).trim();
            }
        }
        return s;
    }

    // ───── SSE 工具方法 ─────

    private void sendChunk(SseEmitter emitter, String chunk) {
        if (chunk == null || chunk.isEmpty()) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name("chunk").data(Map.of("content", chunk)));
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    }

    private void sendDone(SseEmitter emitter) {
        try {
            emitter.send(SseEmitter.event().name("done").data("{}"));
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    }

    private void sendError(SseEmitter emitter, Throwable err) {
        String message = err.getMessage() == null ? err.getClass().getSimpleName() : err.getMessage();
        try {
            emitter.send(SseEmitter.event().name("error").data(Map.of("message", message)));
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(err);
        }
    }
}
