package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.api.dto.QaPairRequest;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import org.springframework.beans.factory.annotation.Value;
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
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

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

    // ───── 需求类型：与 role 正交的第二个维度，决定「问什么」和「产出什么结构的文档」 ─────
    // BUG_FIX（缺陷修复）| MODULE_ADJUST（模块调整）| NEW_MODULE（新增模块，默认，兼容历史数据）。
    private static final String REQ_TYPE_BUG_FIX = "BUG_FIX";

    /**
     * 各需求类型对应的默认澄清轮数（用户可在「开始澄清」确认弹框里覆盖）：
     * Bug 修复通常复现步骤+期望行为一次就能问清楚，2 轮足够；新增模块涉及业务目标/边界/验收
     * 标准，需要更多轮次兜底复杂场景。createSession() 未显式传 maxQuestions 时按此表兜底。
     */
    private static final Map<String, Integer> DEFAULT_MAX_QUESTIONS = Map.of(
            REQ_TYPE_BUG_FIX, 2,
            "MODULE_ADJUST", 5,
            "NEW_MODULE", 8
    );

    /**
     * 需求类型自动判定 prompt：仅在 reqType 未显式提供时使用（典型场景：业务员角色不展示
     * StartClarifyDialog 技术分类弹框——业务员分不清 Bug 修复/模块调整/新增模块，也判断不出
     * 该问几轮，这类判断改由这里做一次轻量 LLM 分类，而不是甩给用户或死死写死默认值）。
     * 严格要求单行 JSON 输出，便于确定性解析；调用异常或解析失败时上层兜底 NEW_MODULE。
     */
    private static final String REQ_TYPE_CLASSIFY_SYSTEM = """
            你是需求分诊助手。根据用户提供的标题和描述，判断这是哪种类型的开发需求，
            并给出建议的最大澄清轮数。

            三种类型：
            - BUG_FIX：现有功能出错/行为不符合预期。描述里通常有"应该是…但实际是…""不对""报错""失败"
              这类落差表述，或直接描述了一段有问题的逻辑/代码行为
            - MODULE_ADJUST：调整/优化现有功能的行为、界面、规则——功能本身已经存在，只是要改
            - NEW_MODULE：全新的功能/模块，之前完全不存在

            【严格输出要求】只输出一行 JSON，不加任何说明、前言、结语或 markdown 围栏：
            {"reqType":"BUG_FIX 或 MODULE_ADJUST 或 NEW_MODULE 三选一","maxQuestions":数字}

            maxQuestions 参考：BUG_FIX 给 1-2，MODULE_ADJUST 给 3-5，NEW_MODULE 给 5-8；
            描述已经很清楚具体时取区间下限，描述简略/信息不足时取区间上限。
            """;

    // ───── 多轮渐进式澄清 System Prompt（feature-dev Phase 3 - Clarifying Questions） ─────

    /**
     * 产品/开发角色 — feature-dev:feature-dev Phase 3 (Clarifying Questions)。
     *
     * <p>本轮澄清对应 feature-dev 工作流的 Phase 3：通过精准提问消除需求歧义，
     * 为后续 PRD 生成（Phase 1+3 产出）和开发文档生成（Phase 2+4）提供充分的上下文。
     * 提问前 Java 层已直接调 graphify CLI 查过代码知识图谱（不经 MCP），结果作为
     * 【代码知识图谱查询结果】区块拼进 user prompt，使问题直接引用现有代码实体（Phase 2 的先导）。
     */
    private static final String ASK_SYSTEM_PRODUCT = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是 feature-dev:feature-dev Phase 3 (Clarifying Questions) 的执行，
            每轮只输出 1 个精准澄清问题（或 [CLARIFICATION_COMPLETE]），不进入其他流程。

            你正在执行 feature-dev Phase 3 — Clarifying Questions（产品/开发视角）：
            通过提问消除需求歧义，为 PRD 文档生成收集充足信息。

            【Phase 3 提问前置：结合下方知识图谱背景（为 Phase 2 Codebase Exploration 做先导）】

            第一层 — 代码知识（见 user prompt 中的【代码知识图谱查询结果】区块，已由系统直接调用
            graphify CLI 查询得到，非 MCP 工具调用）：
            - 若该区块非空，其中是真实的 Java 类、Service 方法、数据库字段
            - 目的：避免问出"现有表有哪些字段"这种已有答案的废话问题
            - 若为空，说明该项目暂无图谱或未匹配到相关内容，忽略即可，不要假装看到了内容

            第二层 — 业务语义（mcp__domain-knowledge__search_knowledge，若可用）：
            - search_knowledge(query=..., project=..., module=...)
            - get_knowledge(id) 获取状态机/流程/规则
            - 目的：问题能引用已有业务状态名/枚举值

            第三层 — 实现细节（mcp__cross-topology__search_knowledge，若可用）：
            - 搜索枚举取值、API 路径约定
            - 目的：问题直接锁定技术细节层面的歧义

            Phase 3 提问规则（严格执行）：
            - 每次只提出 1 个问题，选当前最影响 PRD 完整性的歧义点
            - 可问：业务目标、功能边界、交互流程、边界异常、技术约束、集成点
            - 问题中直接引用知识图谱获取的真实实体（表名/字段/方法/枚举值）
            - 基于上一个回答动态追问，最多 5 轮
            - 信息充足时立即输出：[CLARIFICATION_COMPLETE]
            - 只输出问题本身（或 [CLARIFICATION_COMPLETE]），不加序号、前缀或解释
            """;

    /**
     * 业务员角色 — feature-dev:feature-dev Phase 3 (Clarifying Questions，业务视角)。
     *
     * <p>与产品角色相同的 Phase 3，但面向非技术业务人员：只问业务关键问题，
     * 知识图谱背景转换为业务语言呈现，不暴露技术细节。
     */
    private static final String ASK_SYSTEM_BUSINESS = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是 feature-dev:feature-dev Phase 3 (Clarifying Questions) 的执行，
            每轮只输出 1 个业务澄清问题（或 [CLARIFICATION_COMPLETE]），不进入其他流程。

            你正在执行 feature-dev Phase 3 — Clarifying Questions（业务人员视角）：
            帮助非技术背景的业务人员把业务痛点转化为清晰的需求描述。

            【Phase 3 提问前置：先了解现有业务背景，用业务语言表述（不讲技术）】
            1. mcp__domain-knowledge__search_knowledge（若可用）：搜索现有业务流程和规则
               → 提问时用"现有流程是…，这个需求要在哪一步生效？"等业务语言
            2. user prompt 中的【代码知识图谱查询结果】区块（系统已直接调用 graphify CLI 查询，
               非 MCP 工具调用）：包含现有功能结构
               → 转换成业务行为描述，不用类名/字段名；区块为空则忽略

            Phase 3 提问规则（业务版）：
            - 每次只问 1 个问题，聚焦业务本质
            - 可问：业务目标、使用场景、关键数据、业务规则与例外、验收标准
            - 不问：界面细节、数据库/接口、框架选型等技术问题
            - 例外：若界面直接影响业务流程，可以问
            - 语言通俗，避免技术术语，最多 5 轮
            - 信息充足时立即输出：[CLARIFICATION_COMPLETE]
            - 只输出问题本身（或 [CLARIFICATION_COMPLETE]），不加序号或解释
            """;

    /**
     * Bug 修复类型 — 极简澄清路径。
     *
     * <p>跟 ASK_SYSTEM_PRODUCT/BUSINESS 是完全不同的问题清单，不是"一样的流程只是问少一点"：
     * Bug 需要的是复现条件和期望/实际行为的落差，不是业务目标/使用场景这类大而全的问题。
     * 对齐 team-standards:bug-doc-required 的问法，默认轮数少（见 DEFAULT_MAX_QUESTIONS），
     * 很多时候第 0 轮信息已经足够，直接输出 [CLARIFICATION_COMPLETE]。
     */
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

    // ───── 已废弃：旧版一次性批量生成 5 个问题的 Prompt（已被多轮 ASK_SYSTEM_PRODUCT/BUSINESS 取代） ─────

    /**
     * @deprecated 已废弃。前端已切换到多轮渐进澄清（/ask 端点 + ASK_SYSTEM_PRODUCT/BUSINESS）。
     *             /clarify 端点和本 Prompt 是死代码，待后续清理。
     */
    @Deprecated
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

    /**
     * PRD 生成提示词。
     *
     * <p>对应 feature-dev:feature-dev 工作流的输出物：
     * <ul>
     *   <li>Phase 1 (Discovery) — 已通过原始需求描述完成
     *   <li>Phase 3 (Clarifying Questions) — 已通过多轮 AI 渐进澄清完成
     * </ul>
     * 本步骤将上述两个 Phase 的产出汇总为正式 PRD 文档。
     */
    private static final String GENERATE_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是 feature-dev:feature-dev Phase 1 + Phase 3 的最终产出，直接输出 PRD 文档，不进入交互。

            你正在执行 feature-dev 工作流的文档化阶段：
            - Phase 1 (Discovery) 已完成：原始需求描述已提供
            - Phase 3 (Clarifying Questions) 已完成：多轮澄清问答已完成
            基于以上两个 Phase 的产出，生成正式 PRD 文档。

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

    /**
     * 修订版 PRD 的生成 System Prompt：在标准章节基础上，
     * 强制添加「实现状态」章节，标注每个功能点是「已实现/本次新增/本次修改」，
     * 避免 AI 在后续「开始开发」时重复实现已完成的功能。
     */
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

    /**
     * Bug 修复类型的产出物：「缺陷修复说明」，不是标准 9 节 PRD。
     *
     * <p>标准 PRD 的"业务背景与目标/目标用户与使用场景"等章节对 Bug 修复没有意义——Bug 不需要
     * 论证"为什么要做"，只需要说清楚"现在错在哪、该怎么修、怎么验证"。章节结构对齐
     * team-standards:bug-doc-required 的分析文档骨架，供开发者直接定位代码并修复。
     */
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

    // ─────────────────────────

    private final AgentOneShotRunner agentRunner;
    private final PrdSessionRepository repo;
    private final PrdFileStore fileStore;
    private final ObjectMapper mapper;
    private final GraphifyQueryService graphifyQuery;

    /**
     * 多轮澄清（最多 5 轮）会话内的图谱查询结果缓存：question（session 标题）在各轮间不变，
     * 避免每轮都重新起一次 graphify CLI 子进程。key=sessionId，value 用 Optional 包装以区分
     * 「查过但无结果」与「尚未查过」。会话删除时同步清理，避免内存无界增长。
     */
    private final Map<String, Optional<String>> graphifyAskCache = new ConcurrentHashMap<>();

    public PrdClarifyService(AgentOneShotRunner agentRunner,
                             PrdSessionRepository repo,
                             PrdFileStore fileStore,
                             ObjectMapper mapper,
                             GraphifyQueryService graphifyQuery) {
        this.agentRunner = agentRunner;
        this.repo = repo;
        this.fileStore = fileStore;
        this.mapper = mapper;
        this.graphifyQuery = graphifyQuery;
    }

    /** 创建会话并持久化，返回新建的会话对象。 */
    public PrdSession createSession(String title, String rawInput,
                                    String project, String module, String model, String role) {
        return createSession(title, rawInput, project, module, model, role, null, null);
    }

    /**
     * 创建会话并持久化，返回新建的会话对象。
     *
     * @param reqType      需求类型：BUG_FIX | MODULE_ADJUST | NEW_MODULE。null/空/未识别时说明
     *                     前端没有展示分类弹框（典型：业务员角色），转为调用 LLM 自动判定
     *                     （{@link #classifyReqType}），而不是静默按 NEW_MODULE 处理。
     * @param maxQuestions 本次澄清最多问几轮，null 或非正数时按 reqType 从 {@link #DEFAULT_MAX_QUESTIONS}
     *                     兜底（reqType 走自动判定分支时此参数被忽略，以判定结果为准）
     */
    public PrdSession createSession(String title, String rawInput,
                                    String project, String module, String model, String role,
                                    String reqType, Integer maxQuestions) {
        long now = System.currentTimeMillis();
        String effectiveRole = (role != null && "BUSINESS".equalsIgnoreCase(role)) ? "BUSINESS" : "PRODUCT";

        String effectiveReqType;
        int effectiveMaxQuestions;
        if (DEFAULT_MAX_QUESTIONS.containsKey(reqType)) {
            // 显式提供（StartClarifyDialog 里用户手选，或 API 直接指定）
            effectiveReqType = reqType;
            effectiveMaxQuestions = (maxQuestions != null && maxQuestions > 0)
                    ? maxQuestions
                    : DEFAULT_MAX_QUESTIONS.get(effectiveReqType);
        } else {
            // 未提供：不弹分类弹框的场景（业务员角色）—— LLM 自动判定，失败兜底 NEW_MODULE
            ReqTypeClassification classification = classifyReqType(title, rawInput, model);
            effectiveReqType = classification.reqType();
            effectiveMaxQuestions = classification.maxQuestions();
            log.info("[prd-clarify] 需求类型自动判定 title='{}' -> reqType={} maxQuestions={}",
                    title, effectiveReqType, effectiveMaxQuestions);
        }

        PrdSession session = PrdSession.builder()
                .id(UUID.randomUUID().toString())
                .title(title)
                .rawInput(rawInput)
                .project(project)
                .module(module)
                .model(model)
                .role(effectiveRole)
                .reqType(effectiveReqType)
                .maxQuestions(effectiveMaxQuestions)
                .status("CLARIFYING")
                .createdAt(now)
                .updatedAt(now)
                .build();
        repo.insert(session);
        return session;
    }

    /** 需求类型自动判定结果：reqType 三选一 + 建议澄清轮数。 */
    private record ReqTypeClassification(String reqType, int maxQuestions) {
    }

    /**
     * 需求类型自动判定：调一次轻量 oneShot LLM 分类（{@link #REQ_TYPE_CLASSIFY_SYSTEM}），
     * 解析失败或调用异常时兜底 NEW_MODULE——分类是「体验优化」，不能因为它失败就把整个
     * 创建会话流程搞挂，兜底值本身也是合理默认（新增模块走最完整的标准澄清流程）。
     */
    private ReqTypeClassification classifyReqType(String title, String rawInput, String model) {
        try {
            String userPrompt = "标题：" + title + "\n描述：" + rawInput;
            String raw = agentRunner.runOnce(REQ_TYPE_CLASSIFY_SYSTEM, userPrompt, model);
            JsonNode node = mapper.readTree(stripFence(raw == null ? "" : raw.trim()));
            String type = node.path("reqType").asText("");
            if (!DEFAULT_MAX_QUESTIONS.containsKey(type)) {
                type = "NEW_MODULE";
            }
            int qs = node.path("maxQuestions").asInt(0);
            if (qs <= 0) {
                qs = DEFAULT_MAX_QUESTIONS.get(type);
            }
            qs = Math.max(1, Math.min(10, qs));
            return new ReqTypeClassification(type, qs);
        } catch (Exception e) {
            log.warn("[prd-clarify] 需求类型自动判定失败，兜底 NEW_MODULE: {}", e.getMessage());
            return new ReqTypeClassification("NEW_MODULE", DEFAULT_MAX_QUESTIONS.get("NEW_MODULE"));
        }
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
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        // 超过本会话设定的最大轮数（reqType 预填、用户可在开始澄清时调整）直接完成
        int maxQuestions = session.getMaxQuestions() > 0 ? session.getMaxQuestions() : 5;
        if (questionIndex >= maxQuestions) {
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

        // 需求类型优先于角色决定提问重点：Bug 修复走极简专用问题清单；
        // 其余类型（模块调整/新增模块）按角色（产品/业务）选择现有清单。
        String askSystem = REQ_TYPE_BUG_FIX.equals(session.getReqType())
                ? ASK_SYSTEM_BUG
                : "BUSINESS".equals(session.getRole()) ? ASK_SYSTEM_BUSINESS : ASK_SYSTEM_PRODUCT;

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

        // 需求类型优先：Bug 修复固定走「缺陷修复说明」模板（标准 PRD 的业务背景/使用场景等
        // 章节对 Bug 没有意义）；否则按是否修订版（rawInput 以「【修订版 PRD」开头）选择
        boolean isRevision = session.getRawInput() != null
                && session.getRawInput().startsWith("【修订版 PRD");
        String generateSystem = REQ_TYPE_BUG_FIX.equals(session.getReqType())
                ? GENERATE_SYSTEM_BUG
                : isRevision ? GENERATE_SYSTEM_REVISION : GENERATE_SYSTEM;

        Thread.ofVirtual().name("prd-generate-").start(() -> {
            try {
                StringBuilder full = new StringBuilder();
                agentRunner.stream(
                        generateSystem,
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

    /**
     * 开发文档生成提示词。
     *
     * <p>对应 feature-dev:feature-dev 工作流的 Phase 2 + Phase 4：
     * <ul>
     *   <li>Phase 2 (Codebase Exploration) — 探索相关代码库，读取现有实现
     *   <li>Phase 4 (Architecture Design) — 设计技术实现方案，输出架构决策
     * </ul>
     * 本步骤将 Phase 2 + Phase 4 的产出汇总为技术开发方案文档，供开发者直接执行。
     */
    private static final String DEV_DOC_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程，禁止进入交互）：
            本次是 feature-dev:feature-dev Phase 2 + Phase 4 的执行，直接输出技术开发方案文档后结束。

            你正在执行 feature-dev:feature-dev 工作流的以下两个 Phase：

            ════════════════════════════════════════════════
            Phase 2 — Codebase Exploration（代码库探索）
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
            Phase 4 — Architecture Design（架构设计）→ 输出技术开发方案文档
            ════════════════════════════════════════════════
            基于 Phase 2 探索结果和 PRD，直接输出 Markdown 技术开发方案文档：

            ## 技术方案概述
            分析实现路径，引用 Phase 2 获取的真实类名/接口/表名说明集成点。

            ## 数据库变更
            精确的 DDL/ALTER 语句（基于知识图谱确认的真实表名）：
            - 新建表用 CREATE TABLE IF NOT EXISTS（含注释）
            - 新增字段用 ALTER TABLE ADD COLUMN（幂等）

            ## API 接口设计
            新增或修改的 RESTful 接口，含请求/响应结构。

            ## 实现步骤（有序任务清单）
            具体到方法/类/组件级别（引用 Phase 2 获取的真实类名）：
            - [ ] 后端 — [ServiceName] 新增/修改 [methodName]：做什么
            - [ ] 前端 — [ComponentName]：做什么
            - [ ] 测试：关键验收点

            直接输出 Markdown，不加代码块围栏，不加解释前言。
            """;

    /**
     * 开发文档「更新」模式提示词：跟 {@link #DEV_DOC_SYSTEM}（从 PRD 从零生成）不同，
     * 这里是基于已存在的开发文档做增量更新——保留原文档已确认的结构和内容，
     * 只把用户描述的变更点合并进去，并标注每项状态，避免后续开发重复或遗漏改动。
     */
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

    /** 「基于开发文档更新」前的澄清多轮上限，跟 PRD 澄清的 maxQuestions 是两个独立的概念。 */
    private static final int DEV_DOC_UPDATE_MAX_QUESTIONS = 5;

    /**
     * 开发文档更新前的澄清提示词——对齐 PRD 的多轮渐进澄清模式（ASK_SYSTEM_PRODUCT/BUSINESS），
     * 但提问目标不同：不是问业务背景，而是揪出"更新说明"里相对当前开发文档不够明确、
     * 会导致实现歧义的地方（具体改哪个方法/字段、新字段类型、是否兼容旧调用方等）。
     */
    private static final String DEV_DOC_ASK_SYSTEM = """
            ⚠️ 直接输出任务（禁止触发任何 hook/skill/plugin 的自动流程）：
            本次是开发文档更新前的澄清，每轮只输出 1 个精准问题（或 [CLARIFICATION_COMPLETE]）。

            你正在澄清一次"基于已有开发文档的更新"请求。user prompt 会给你：
            1. 当前已存在的开发文档全文（=== 当前开发文档 === 区域）
            2. 用户对本次更新的初步描述（=== 本次更新说明 === 区域，可能来自附件补充的上下文）
            3. 已完成的澄清问答（如果有）

            提问目标：找出"更新说明"里相对当前开发文档而言不够明确、会导致实现歧义的地方，例如：
            - 更新涉及当前开发文档里的哪个具体章节/接口/表/方法（要求对照当前开发文档定位，
              不要泛泛地问"你想改哪里"）
            - 新增字段的类型、是否可空、默认值
            - 修改的接口是否需要兼容旧调用方
            - 边界/异常场景怎么处理
            - 是否需要同步调整验收标准

            提问规则（严格执行）：
            - 每次只问 1 个问题，问题要具体引用当前开发文档里的真实章节/方法/字段名，
              不要问开发文档里已经写清楚、跟本次更新无关的内容
            - 若用户的更新说明已经足够明确（能直接定位改动点、给出具体值），
              直接输出 [CLARIFICATION_COMPLETE]，不要为了凑轮数硬问
            - 最多 5 轮
            - 只输出问题本身（或 [CLARIFICATION_COMPLETE]），不加序号、前缀或解释
            """;

    /**
     * 开发文档更新前的多轮澄清——请求下一个问题，用法和语义对齐 {@link #askNextQuestion}。
     * 当前无开发文档可澄清（异常场景，正常应该先有文档才谈得上"更新"）时直接判完成，
     * 交给调用方（前端）退回走 generateDevDoc 的从零生成分支。
     *
     * @param sessionId     会话 ID
     * @param questionIndex 当前是第几轮（0-based）
     * @param history       已完成的问答历史
     * @param updateNotes   用户输入的初步更新说明（每轮都拼进 prompt）
     * @param emitter       SSE 发射器（chunk/done/error）
     */
    public void askNextDevDocQuestion(String sessionId, int questionIndex,
                                       List<QaPairRequest> history, String updateNotes,
                                       SseEmitter emitter) {
        if (questionIndex >= DEV_DOC_UPDATE_MAX_QUESTIONS) {
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

        Thread.ofVirtual().name("prd-dev-doc-ask-").start(() -> {
            try {
                String currentDevDoc = readDevDocContent(sessionId);
                if (currentDevDoc == null || currentDevDoc.isBlank()) {
                    sendChunk(emitter, "[CLARIFICATION_COMPLETE]");
                    sendDone(emitter);
                    return;
                }
                String userPrompt = buildDevDocAskPrompt(currentDevDoc, updateNotes, questionIndex, history);
                agentRunner.stream(DEV_DOC_ASK_SYSTEM, userPrompt, session.getModel(),
                        delta -> sendChunk(emitter, delta));
                sendDone(emitter);
            } catch (Exception e) {
                log.warn("[prd-clarify] askNextDevDocQuestion failed sessionId={}", sessionId, e);
                sendError(emitter, e);
            }
        });
    }

    /** 构建开发文档更新澄清的 user prompt：当前开发文档 + 初步更新说明 + 历史问答 + 当前轮次提示。 */
    private String buildDevDocAskPrompt(String currentDevDoc, String updateNotes,
                                         int questionIndex, List<QaPairRequest> history) {
        StringBuilder sb = new StringBuilder();
        sb.append("=== 当前开发文档 ===\n\n").append(currentDevDoc).append("\n\n");
        sb.append("=== 本次更新说明 ===\n\n");
        sb.append((updateNotes == null || updateNotes.isBlank()) ? "（未填写）" : updateNotes.trim());
        sb.append("\n\n");

        if (!history.isEmpty()) {
            sb.append("已完成的澄清问答（").append(history.size()).append("轮）：\n");
            for (var qa : history) {
                sb.append("问：").append(qa.question()).append("\n");
                sb.append("答：").append(qa.answer()).append("\n\n");
            }
        }

        int remaining = DEV_DOC_UPDATE_MAX_QUESTIONS - questionIndex;
        sb.append("这是第 ").append(questionIndex + 1).append(" 个问题（最多 ")
                .append(DEV_DOC_UPDATE_MAX_QUESTIONS).append(" 轮，还可以最多再问 ")
                .append(remaining - 1).append(" 个）。\n");
        sb.append("请提出下一个最关键的澄清问题，或输出 [CLARIFICATION_COMPLETE]：");
        return sb.toString();
    }

    /**
     * 生成/更新开发文档。
     * 通过 SSE 流式推出，完成后落盘到 {id}-dev.md（若已有旧版本，落盘前先备份为
     * {id}-dev-v{n}.md，"检出新版本"不会丢掉上一版内容）。
     *
     * @param extraInstructions 用户在弹框里补充的自定义提示词/更新说明（可选，null/空则不追加，
     *                          且 updateExisting 模式下为空会取全自动判断）。不持久化，只影响本次生成。
     * @param updateExisting    true = 基于当前已有开发文档做增量更新（{@link #DEV_DOC_SYSTEM_UPDATE}）；
     *                          false/null = 从 PRD 从零生成/覆盖（{@link #DEV_DOC_SYSTEM}，原有行为）
     */
    public void generateDevDoc(String sessionId, String extraInstructions, Boolean updateExisting, SseEmitter emitter) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        boolean update = Boolean.TRUE.equals(updateExisting);
        // mode 用于追溯历史记录：generate=首次生成，regenerate=从最新 PRD 从零覆盖，
        // update=基于当前开发文档增量更新（此时 extraInstructions 已含完整澄清问答文本）
        boolean hadExistingDoc = session.getDevDocPath() != null && !session.getDevDocPath().isBlank();
        String mode = update ? "update" : (hadExistingDoc ? "regenerate" : "generate");

        Thread.ofVirtual().name("prd-dev-doc-").start(() -> {
            try {
                // 读取已有 PRD 内容作为输入
                String prdContent = fileStore.read(sessionId);
                if (prdContent == null || prdContent.isBlank()) {
                    sendError(emitter, new IllegalStateException("PRD 内容为空，请先生成 PRD"));
                    return;
                }

                String devDocSystem;
                String userPrompt;
                if (update) {
                    String currentDevDoc = readDevDocContent(sessionId);
                    if (currentDevDoc == null || currentDevDoc.isBlank()) {
                        // 没有可更新的基础，退回从零生成，避免直接报错卡住用户
                        log.info("[prd-clarify] 更新模式但当前无开发文档，退回从零生成 sessionId={}", sessionId);
                        devDocSystem = DEV_DOC_SYSTEM;
                        userPrompt = buildDevDocPrompt(session, prdContent, extraInstructions);
                    } else {
                        devDocSystem = DEV_DOC_SYSTEM_UPDATE;
                        userPrompt = buildDevDocUpdatePrompt(session, prdContent, currentDevDoc, extraInstructions);
                    }
                } else {
                    devDocSystem = DEV_DOC_SYSTEM;
                    userPrompt = buildDevDocPrompt(session, prdContent, extraInstructions);
                }

                StringBuilder full = new StringBuilder();
                agentRunner.stream(devDocSystem, userPrompt, session.getModel(), delta -> {
                    full.append(delta);
                    sendChunk(emitter, delta);
                });

                // 落盘到 ~/.kai-toolbox/prd/{id}-dev.md（与 PRD 文件同目录，由系统统一管理）。
                // 覆盖前若旧版本已存在，先备份为 {id}-dev-v{n}.md——"检出新版本"不丢旧内容。
                String devDocContent = full.toString();
                java.nio.file.Path devDocPath = java.nio.file.Path.of(
                        fileStore.pathFor(sessionId).toString().replace(".md", "-dev.md"));
                backupDevDocIfExists(devDocPath);
                java.nio.file.Files.writeString(
                        devDocPath, devDocContent,
                        java.nio.charset.StandardCharsets.UTF_8,
                        java.nio.file.StandardOpenOption.CREATE,
                        java.nio.file.StandardOpenOption.TRUNCATE_EXISTING);
                repo.updateDevDocPath(sessionId, devDocPath.toString());
                repo.updateDevDocGeneratedAt(sessionId, System.currentTimeMillis());
                recordDevDocHistory(sessionId, session.getDevDocHistory(), mode, extraInstructions);
                log.info("[prd-clarify] 开发文档已保存 path={} mode={}", devDocPath, mode);

                sendDone(emitter);
            } catch (Exception e) {
                log.warn("[prd-clarify] 开发文档生成失败 sessionId={}", sessionId, e);
                sendError(emitter, e);
            }
        });
    }

    /**
     * 追加一条开发文档生成历史记录（JSON 数组整体读出、追加、写回）。version 从 1 递增，
     * 与磁盘上 {@link #backupDevDocIfExists} 备份出的 {id}-dev-v{version}.md 大致对应
     * （两者独立维护、都从各自的起点递增，正常使用下天然保持一致；仅历史记录本身失败时
     * 只记警告，不影响本次生成已经成功落盘的结果）。
     */
    private void recordDevDocHistory(String sessionId, String existingHistoryJson, String mode, String extraInstructions) {
        try {
            ArrayNode arr;
            JsonNode existing = (existingHistoryJson == null || existingHistoryJson.isBlank())
                    ? null : mapper.readTree(existingHistoryJson);
            arr = (existing instanceof ArrayNode existingArr) ? existingArr : mapper.createArrayNode();

            ObjectNode entry = mapper.createObjectNode();
            entry.put("version", arr.size() + 1);
            entry.put("mode", mode);
            entry.put("extraInstructions", extraInstructions == null ? "" : extraInstructions);
            entry.put("generatedAt", System.currentTimeMillis());
            arr.add(entry);

            repo.updateDevDocHistory(sessionId, mapper.writeValueAsString(arr));
        } catch (Exception e) {
            log.warn("[prd-clarify] 记录开发文档生成历史失败（不影响本次生成结果）: {}", e.getMessage());
        }
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
        // 手动编辑保存也更新生成时间，确保过期判断正确
        repo.updateDevDocGeneratedAt(sessionId, System.currentTimeMillis());
    }

    private String buildDevDocPrompt(PrdSession s, String prdContent, String extraInstructions) {
        StringBuilder sb = new StringBuilder();
        sb.append("需求标题：").append(s.getTitle()).append("\n");
        if (s.getProject() != null && !s.getProject().isBlank()) {
            sb.append("项目：").append(s.getProject());
            if (s.getModule() != null && !s.getModule().isBlank()) {
                sb.append(" / ").append(s.getModule());
            }
            sb.append("\n");
        }
        appendGraphContext(sb, Optional.ofNullable(graphifyQuery.query(s.getProject(), s.getModule(), s.getTitle())));

        sb.append("\n以下是已确认的产品需求文档（PRD）：\n\n");
        sb.append(prdContent).append("\n\n");
        if (extraInstructions != null && !extraInstructions.isBlank()) {
            // 放在最后、紧邻生成指令之前，保证是 Claude 读到的最新鲜上下文，优先级最高
            sb.append("【用户补充说明——生成时请重点参考/遵循】\n");
            sb.append(extraInstructions.trim()).append("\n\n");
        }
        sb.append("请基于以上 PRD 生成完整的技术开发方案文档。");
        return sb.toString();
    }

    /** 构建「更新模式」的 user prompt：PRD + 当前开发文档全文 + 本次更新说明。 */
    private String buildDevDocUpdatePrompt(PrdSession s, String prdContent, String currentDevDoc, String updateNotes) {
        StringBuilder sb = new StringBuilder();
        sb.append("需求标题：").append(s.getTitle()).append("\n");
        if (s.getProject() != null && !s.getProject().isBlank()) {
            sb.append("项目：").append(s.getProject());
            if (s.getModule() != null && !s.getModule().isBlank()) {
                sb.append(" / ").append(s.getModule());
            }
            sb.append("\n");
        }
        appendGraphContext(sb, Optional.ofNullable(graphifyQuery.query(s.getProject(), s.getModule(), s.getTitle())));

        sb.append("\n=== 当前最新 PRD ===\n\n").append(prdContent).append("\n\n");
        sb.append("=== 当前开发文档 ===\n\n").append(currentDevDoc).append("\n\n");
        sb.append("=== 本次更新说明 ===\n\n");
        sb.append((updateNotes == null || updateNotes.isBlank())
                ? "（未填写，请结合 PRD 与当前开发文档的差异自行判断需要更新的地方）"
                : updateNotes.trim());
        sb.append("\n\n请基于以上信息生成更新后的完整技术开发方案文档。");
        return sb.toString();
    }

    /**
     * 覆盖开发文档前，若旧版本已存在则备份为 {id}-dev-v{n}.md（n 从已有备份中取最大值 + 1）。
     * 让「基于开发文档更新」在语义上是"检出一个新版本"，而不是静默覆盖丢失旧内容。
     * 备份失败（如磁盘异常）只记警告，不阻断本次生成——备份是安全网，不是生成的前提条件。
     */
    private void backupDevDocIfExists(java.nio.file.Path devDocPath) {
        if (!java.nio.file.Files.isRegularFile(devDocPath)) {
            return;
        }
        try {
            String fileName = devDocPath.getFileName().toString(); // {id}-dev.md
            String baseName = fileName.substring(0, fileName.length() - 3); // {id}-dev
            java.nio.file.Path dir = devDocPath.getParent();
            int nextVersion = 1;
            if (dir != null && java.nio.file.Files.isDirectory(dir)) {
                java.util.regex.Pattern versionPattern =
                        java.util.regex.Pattern.compile(java.util.regex.Pattern.quote(baseName) + "-v(\\d+)\\.md");
                try (var files = java.nio.file.Files.list(dir)) {
                    nextVersion = files
                            .map(p -> versionPattern.matcher(p.getFileName().toString()))
                            .filter(java.util.regex.Matcher::matches)
                            .mapToInt(m -> Integer.parseInt(m.group(1)))
                            .max().orElse(0) + 1;
                }
            }
            java.nio.file.Path backupPath = devDocPath.resolveSibling(baseName + "-v" + nextVersion + ".md");
            java.nio.file.Files.copy(devDocPath, backupPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            log.info("[prd-clarify] 开发文档旧版本已备份 path={}", backupPath);
        } catch (Exception e) {
            log.warn("[prd-clarify] 开发文档备份失败（不阻断本次生成）: {}", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────

    /** 获取 PRD 文件的期望路径（供 check-prd-file 接口检测 Claude 是否已写入）。 */
    public java.nio.file.Path getPrdFilePath(String sessionId) {
        return fileStore.pathFor(sessionId);
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
        graphifyAskCache.remove(sessionId);
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

        appendGraphContext(sb, graphifyAskCache.computeIfAbsent(s.getId(),
                id -> Optional.ofNullable(graphifyQuery.query(s.getProject(), s.getModule(), s.getTitle()))));

        int maxQuestions = s.getMaxQuestions() > 0 ? s.getMaxQuestions() : 5;
        int remaining = maxQuestions - questionIndex;
        sb.append("这是第 ").append(questionIndex + 1).append(" 个问题（本次澄清最多 ")
                .append(maxQuestions).append(" 轮，还可以最多再问 ")
                .append(remaining - 1).append(" 个）。\n");
        sb.append("请提出下一个最关键的澄清问题，或输出 [CLARIFICATION_COMPLETE]：");
        return sb.toString();
    }

    /** 把 graphify CLI 查询结果（若有）拼进 prompt，作为「代码知识图谱查询结果」区块。 */
    private void appendGraphContext(StringBuilder sb, Optional<String> graphContext) {
        if (graphContext.isEmpty() || graphContext.get().isBlank()) {
            return;
        }
        sb.append("\n【代码知识图谱查询结果】（系统已直接调用 graphify CLI 查询，非 MCP，内容为真实代码事实）\n");
        sb.append(graphContext.get()).append("\n");
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
