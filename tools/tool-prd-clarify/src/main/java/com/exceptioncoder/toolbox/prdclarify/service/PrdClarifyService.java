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

            【关键：若有 MCP 工具，提问前先查三层知识图谱（三层互补，尽量都查）】

            第一层：代码知识图谱（若有 mcp__graphify-yoooni__query_graph）
            - 调用 query_graph(question="{需求关键词，如'SLA 预警 deadline'}")
            - 获得相关的 Java 类、Service 方法、数据库字段、模块关系
            - 这是最底层的事实：现有代码里真正有什么

            第二层：业务知识图谱（若有 mcp__domain-knowledge__search_knowledge）
            - 调用 search_knowledge(query=..., project=..., module=...)
            - 对命中 id 调用 get_knowledge(id) 获取状态机/流程/业务规则
            - 这是业务语义：现有规则是什么

            第三层：拓扑知识（若有 mcp__cross-topology__search_knowledge）
            - 搜索枚举值、API 路径、模块间依赖
            - 这是实现细节：具体的 ischeck=0/1/3 等值

            查完三层后，基于实际已有的字段名/方法名/枚举值提出精准问题，
            而不是泛泛地问"有哪些字段"或"接口是什么"。

            提问规则：
            - 每次只提出 1 个问题，选择当前最关键、影响 PRD 完整性最大的
            - 可以问：业务目标、功能边界、交互流程、边界异常、技术约束、集成点
            - 问题专业简洁，直接引用已有代码实体（如表名/字段/方法），不超过 60 字
            - 基于上一个回答动态追问或转换方向
            - 最多 5 轮，信息足够时立即输出：[CLARIFICATION_COMPLETE]
            - 只输出问题本身（或 [CLARIFICATION_COMPLETE]），不加序号、前缀或解释
            """;

    /**
     * 业务员角色：只问影响业务结果的关键问题，跳过纯 UI/技术细节，语言通俗易懂。
     * 若 MCP 工具可用，先查业务流程和规则，以更贴近业务现状提问。
     */
    private static final String ASK_SYSTEM_BUSINESS = """
            你是一名经验丰富的业务需求收集专家，正在帮助一位业务人员（非技术背景）整理业务需求。

            你的目标是通过简短对话，理解需求背后的业务价值、使用场景和关键业务规则。

            【关键：若有 MCP 工具，提问前先了解现有业务背景（用业务语言，不讲技术）】
            1. 若有 mcp__domain-knowledge__search_knowledge：搜索现有的业务流程、状态流转、业务规则
               了解后，提问时说"现有流程是…，这个需求要在哪一步生效？"
            2. 若有 mcp__graphify-yoooni__query_graph：搜索现有功能的大致结构
               了解后，转换为业务语言（不用类名/字段名，直接描述功能行为）
            始终用业务语言解释你了解到的背景，不暴露技术细节给业务人员。

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

    // ═══════════════════════════════════════════════════
    // 开发文档：由 PRD 转换生成的技术开发方案文档
    // ═══════════════════════════════════════════════════

    private static final String DEV_DOC_SYSTEM = """
            你是一名资深全栈工程师，专注于将产品需求文档（PRD）转化为可直接执行的技术开发方案。

            ════════════════════════════════════════════════
            第一步（必须执行，不可跳过）：读取知识图谱上下文
            ════════════════════════════════════════════════
            在生成任何文档内容之前，你必须按顺序执行以下工具调用：

            1. 若有 mcp__domain-knowledge__search_knowledge 工具：
               → 调用 search_knowledge(query="{需求核心关键词}", project="{项目名}", module="{模块名}")
               → 对命中的知识点调用 get_knowledge(id) 获取状态机/流程/业务规则详情
               → 目的：确保方案与现有业务逻辑一致，引用真实枚举值和状态名

            2. 若有 mcp__graphify-yoooni__query_graph 工具：
               → 调用 query_graph(question="{需求相关的代码组件关键词}")
               → 获取真实存在的 Java 类名、Service 方法、数据库表名
               → 目的：直接引用现有代码实体，而不是自己编造

            3. 若有 mcp__cross-topology__search_knowledge 工具：
               → 调用 search_knowledge(query="{枚举值/接口路径关键词}")
               → 获取具体的枚举取值、API 路径约定、字段格式
               → 目的：补充实现细节，保证 DDL/API 与现有规范一致

            无 MCP 工具时：仅基于 PRD 生成（精准度降低，请在文档中注明"未获取知识图谱"）。

            ════════════════════════════════════════════════
            第二步：基于 PRD + 知识图谱生成技术开发方案文档
            ════════════════════════════════════════════════

            ## 技术方案概述
            分析实现路径，若有多种选型简要对比并说明选定方案的理由。
            标注与现有代码的集成点（直接引用知识图谱返回的真实类名/接口/表名）。

            ## 数据库变更
            精确的 DDL/ALTER 语句（基于知识图谱中查到的真实表名）：
            - 新建表用 CREATE TABLE IF NOT EXISTS（含注释）
            - 新增字段用 ALTER TABLE ADD COLUMN（幂等）
            - 若知识图谱未返回相关表，说明"未能确认现有表结构，以下为推断"

            ## API 接口设计
            新增或修改的接口（RESTful），含请求/响应结构和字段说明。
            引用 cross-topology 返回的现有接口路径约定。

            ## 实现步骤（有序任务清单）
            具体到方法/类/组件级别（引用 graphify 返回的真实类名）：
            - [ ] 后端 — [真实ServiceName] 新增 [methodName]：做什么
            - [ ] 前端 — [ComponentName]：做什么
            - [ ] 测试：关键验收点

            直接输出 Markdown，不加代码块围栏，不加解释前言。
            """;

    /**
     * 生成开发文档：基于已生成的 PRD 内容，调用 Claude 生成技术开发方案文档（四章节）。
     * 通过 SSE 流式推出，完成后落盘到 {id}-dev.md。
     */
    public void generateDevDoc(String sessionId, SseEmitter emitter) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        Thread.ofVirtual().name("prd-dev-doc-").start(() -> {
            try {
                // 读取已有 PRD 内容作为输入
                String prdContent = fileStore.read(sessionId);
                if (prdContent == null || prdContent.isBlank()) {
                    sendError(emitter, new IllegalStateException("PRD 内容为空，请先生成 PRD"));
                    return;
                }

                StringBuilder full = new StringBuilder();
                String userPrompt = buildDevDocPrompt(session, prdContent);

                agentRunner.stream(DEV_DOC_SYSTEM, userPrompt, session.getModel(), delta -> {
                    full.append(delta);
                    sendChunk(emitter, delta);
                });

                // 落盘到 {id}-dev.md
                String devDocContent = full.toString();
                String devDocPath = fileStore.pathFor(sessionId).toString()
                        .replace(".md", "-dev.md");
                java.nio.file.Files.writeString(
                        java.nio.file.Path.of(devDocPath), devDocContent,
                        java.nio.charset.StandardCharsets.UTF_8,
                        java.nio.file.StandardOpenOption.CREATE,
                        java.nio.file.StandardOpenOption.TRUNCATE_EXISTING);
                repo.updateDevDocPath(sessionId, devDocPath);

                sendDone(emitter);
            } catch (Exception e) {
                log.warn("[prd-clarify] 开发文档生成失败 sessionId={}", sessionId, e);
                sendError(emitter, e);
            }
        });
    }

    /** 读取开发文档内容。 */
    public String readDevDocContent(String sessionId) throws java.io.IOException {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        if (session.getDevDocPath() == null || session.getDevDocPath().isBlank()) {
            return "";
        }
        java.nio.file.Path path = java.nio.file.Path.of(session.getDevDocPath());
        if (!java.nio.file.Files.exists(path)) return "";
        return java.nio.file.Files.readString(path, java.nio.charset.StandardCharsets.UTF_8);
    }

    /** 保存开发文档（用户编辑后）。 */
    public void saveDevDocContent(String sessionId, String content) throws java.io.IOException {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        String devDocPath = session.getDevDocPath();
        if (devDocPath == null || devDocPath.isBlank()) {
            // 首次保存时自动创建路径
            devDocPath = fileStore.pathFor(sessionId).toString().replace(".md", "-dev.md");
            repo.updateDevDocPath(sessionId, devDocPath);
        }
        java.nio.file.Files.writeString(
                java.nio.file.Path.of(devDocPath), content,
                java.nio.charset.StandardCharsets.UTF_8,
                java.nio.file.StandardOpenOption.CREATE,
                java.nio.file.StandardOpenOption.TRUNCATE_EXISTING);
    }

    private String buildDevDocPrompt(PrdSession s, String prdContent) {
        StringBuilder sb = new StringBuilder();
        sb.append("需求标题：").append(s.getTitle()).append("\n");
        if (s.getProject() != null && !s.getProject().isBlank()) {
            sb.append("项目：").append(s.getProject());
            if (s.getModule() != null && !s.getModule().isBlank()) {
                sb.append(" / ").append(s.getModule());
            }
            sb.append("\n");
        }
        sb.append("\n以下是已确认的产品需求文档（PRD）：\n\n");
        sb.append(prdContent).append("\n\n");
        sb.append("请基于以上 PRD 生成完整的技术开发方案文档。");
        return sb.toString();
    }

    // ─────────────────────────────────────────────────

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
