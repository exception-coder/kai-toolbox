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

    // ───── 多轮渐进式澄清 System Prompt（按角色区分） ─────

    /**
     * 产品经理/开发者角色：可以问设计细节、技术约束、边界条件，问题专业、全面。
     * 若 MCP 工具可用，先查业务知识图谱再提问（使问题更精准）。
     */
    private static final String ASK_SYSTEM_PRODUCT = """
            你是一名资深产品经理，正在与产品团队进行需求澄清对话。

            你的目标是通过提问将模糊需求转化为可编写完整 PRD 的清晰要求。

            【关键：若有 MCP 工具，提问前先查知识图谱】
            如果你有 mcp__domain-knowledge__search_knowledge 工具可用：
            1. 先用 search_knowledge(query="{需求关键词}", project="{项目名}", module="{模块名}") 搜索相关业务知识
            2. 对命中的知识点（id）调用 get_knowledge(id) 获取详情（状态机/流程/公式）
            3. 如有 mcp__cross-topology__search_knowledge，再搜索对应的枚举值和实现细节
            4. 基于获得的知识提出精准问题（直接引用已有的字段名、状态枚举、API路径）
            这样提出的问题能显著减少无效澄清，让开发者可以直接对现有代码做决策。

            提问规则：
            - 每次只提出 1 个问题，选择当前最关键、影响 PRD 完整性最大的
            - 可以问：业务目标、目标用户、功能边界（MVP范围）、用户交互流程、
              界面设计细节、边界条件与异常处理、技术约束、性能安全要求、集成点
            - 问题专业简洁，不超过 60 字，能直接回答
            - 基于上一个回答动态追问或转换方向
            - 最多 5 轮，信息足够时立即输出：[CLARIFICATION_COMPLETE]
            - 只输出问题本身（或 [CLARIFICATION_COMPLETE]），不加序号、前缀或解释
            """;

    /**
     * 业务员角色：只问影响业务结果的关键问题，跳过纯 UI/技术细节，语言通俗易懂。
     * 若 MCP 工具可用，先查业务流程和规则（domain-knowledge），以更贴近业务现状提问。
     */
    private static final String ASK_SYSTEM_BUSINESS = """
            你是一名经验丰富的业务需求收集专家，正在帮助一位业务人员（非技术背景）整理业务需求。

            你的目标是通过简短对话，理解需求背后的业务价值、使用场景和关键业务规则。

            【关键：若有 MCP 工具，提问前先了解现有业务背景】
            如果你有 mcp__domain-knowledge__search_knowledge 工具：
            1. 搜索相关的业务流程、状态流转、业务规则
            2. 获取详情，了解现有业务如何运转
            3. 提问时基于现有业务逻辑（如："现有的审核流程已有草稿→提交→审核，这个新需求要插入哪个阶段？"）
            不要用技术术语解释，用业务语言描述你从知识图谱了解到的背景。

            提问规则：
            - 每次只问 1 个问题，必须聚焦业务本质
            - 可以问：业务目标、使用场景、关键数据、业务规则与例外、验收标准
            - 不要问：界面颜色/布局/图标、数据库/接口/技术方案、框架选型
            - 例外：若界面设计直接影响业务流程，可以问
            - 语言通俗，避免技术术语，最多 5 轮
            - 信息足够时立即输出：[CLARIFICATION_COMPLETE]
            - 只输出问题本身（或 [CLARIFICATION_COMPLETE]），不加序号或解释
            """;

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
                                    String project, String module, String model, String role) {
        long now = System.currentTimeMillis();
        String effectiveRole = (role != null && "BUSINESS".equalsIgnoreCase(role)) ? "BUSINESS" : "PRODUCT";
        PrdSession session = PrdSession.builder()
                .id(UUID.randomUUID().toString())
                .title(title)
                .rawInput(rawInput)
                .project(project)
                .module(module)
                .model(model)
                .role(effectiveRole)
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

    // ═══════════════════════════════════════════════════
    // 多轮渐进式澄清：每题单独调 Claude，基于历史动态追问
    // ═══════════════════════════════════════════════════

    /**
     * 多轮澄清——请求下一个问题。
     *
     * <p>Claude 接收原始需求 + 已完成的问答历史，输出下一个最关键的澄清问题；
     * 若信息已足够，输出 {@code [CLARIFICATION_COMPLETE]}。
     * 前端收到 {@code done} 事件后根据文本内容决定继续问还是跳转生成 PRD。
     *
     * @param sessionId     会话 ID
     * @param questionIndex 当前是第几轮（0-based），用于告知 Claude 剩余轮数
     * @param history       已完成的问答历史
     * @param emitter       SSE 发射器（chunk/done/error）
     */
    public void askNextQuestion(String sessionId, int questionIndex,
                                List<QaPairRequest> history, SseEmitter emitter) {
        // 超过 5 轮直接完成
        if (questionIndex >= 5) {
            try {
                emitter.send(SseEmitter.event().name("chunk")
                        .data(Map.of("content", "[CLARIFICATION_COMPLETE]")));
                emitter.send(SseEmitter.event().name("done").data("{}"));
                emitter.complete();
            } catch (Exception e) {
                emitter.completeWithError(e);
            }
            return;
        }

        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        // 根据会话角色选择对应的澄清提示词
        String askSystem = "BUSINESS".equals(session.getRole())
                ? ASK_SYSTEM_BUSINESS : ASK_SYSTEM_PRODUCT;

        Thread.ofVirtual().name("prd-ask-").start(() -> {
            try {
                agentRunner.stream(
                        askSystem,
                        buildAskUserPrompt(session, questionIndex, history),
                        session.getModel(),
                        delta -> sendChunk(emitter, delta));
                sendDone(emitter);
            } catch (Exception e) {
                log.warn("[prd-clarify] askNextQuestion failed sessionId={}", sessionId, e);
                sendError(emitter, e);
            }
        });
    }

    /**
     * 多轮澄清完成后，将完整问答历史持久化到 {@code questions} 字段，以便 {@link #generate} 读取。
     */
    public PrdSession saveQaHistory(String sessionId, List<QaPairRequest> history) {
        repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        String questionsJson = buildQuestionsJson(history);
        repo.updateQuestions(sessionId, questionsJson);

        return repo.findById(sessionId).orElseThrow();
    }

    // ─────────────────────────────────────────────────

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

    /**
     * 删除会话及关联文件。
     * 先删数据库记录，再删文件：若 DB 删除失败则文件仍在（数据一致），
     * 若文件删除失败（孤儿文件）不影响功能，下次创建同名会话会覆盖。
     */
    public void delete(String sessionId) throws IOException {
        repo.delete(sessionId);
        fileStore.delete(sessionId);
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

    /** 构建多轮提问的 user prompt（原始需求 + 历史问答 + 当前轮次提示）。 */
    private String buildAskUserPrompt(PrdSession s, int questionIndex, List<QaPairRequest> history) {
        StringBuilder sb = new StringBuilder();
        sb.append("需求标题：").append(s.getTitle()).append("\n");
        if (s.getProject() != null && !s.getProject().isBlank()) {
            sb.append("项目：").append(s.getProject());
            if (s.getModule() != null && !s.getModule().isBlank()) {
                sb.append(" / ").append(s.getModule());
            }
            sb.append("\n");
        }
        sb.append("\n原始需求描述：\n").append(s.getRawInput()).append("\n\n");

        if (!history.isEmpty()) {
            sb.append("已完成的澄清问答（").append(history.size()).append("轮）：\n");
            for (var qa : history) {
                sb.append("问：").append(qa.question()).append("\n");
                sb.append("答：").append(qa.answer()).append("\n\n");
            }
        }

        int remaining = 5 - questionIndex;
        sb.append("这是第 ").append(questionIndex + 1).append(" 个问题（还可以最多再问 ")
                .append(remaining - 1).append(" 个）。\n");
        sb.append("请提出下一个最关键的澄清问题，或输出 [CLARIFICATION_COMPLETE]：");
        return sb.toString();
    }

    /** 将多轮问答历史转换为 questions JSON 格式（供 generate() 读取）。 */
    private String buildQuestionsJson(List<QaPairRequest> history) {
        try {
            ArrayNode arr = mapper.createArrayNode();
            int idx = 1;
            for (var qa : history) {
                ObjectNode node = mapper.createObjectNode();
                node.put("id", idx++);
                node.put("question", qa.question());
                node.put("answer", qa.answer());
                arr.add(node);
            }
            return mapper.writeValueAsString(arr);
        } catch (JsonProcessingException e) {
            log.warn("[prd-clarify] buildQuestionsJson failed", e);
            return "[]";
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

    /**
     * 向 SSE 推送文本增量。
     * 发送失败（客户端已断开）时先关闭 emitter，再抛出异常，使外层虚拟线程感知到断连
     * 并退出 {@code agentRunner.stream()} 循环，避免 LLM 调用继续浪费资源。
     */
    private void sendChunk(SseEmitter emitter, String chunk) {
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
            // 连接已断，用触发 catch 的异常 e 而非业务异常 err，避免混淆日志
            emitter.completeWithError(e);
        }
    }
}
