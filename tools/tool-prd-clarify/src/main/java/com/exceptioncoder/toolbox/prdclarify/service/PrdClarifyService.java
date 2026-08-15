package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.api.dto.DevDocVersionSummary;
import com.exceptioncoder.toolbox.prdclarify.api.dto.ProgressVersionSummary;
import com.exceptioncoder.toolbox.prdclarify.api.dto.QaPairRequest;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdBusinessFields;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.domain.DocumentProfile;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import org.springframework.beans.factory.annotation.Value;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

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

    // ─────────────────────────

    private final AgentOneShotRunner agentRunner;
    private final PrdSessionRepository repo;
    private final PrdFileStore fileStore;
    private final PrdArtifactService artifactService;
    private final ObjectMapper mapper;
    private final GraphifyQueryService graphifyQuery;
    private final DomainKnowledgeQueryService domainKnowledgeQuery;
    private final PrdTitleSuggestionService titleSuggestionService;
    private final PrdRequirementTypeResolver requirementTypeResolver;
    private final PrdClarificationQuestionService clarificationQuestionService;
    private final PrdAnswerProcessingService answerProcessingService;
    private final PrdDocumentGenerationService documentGenerationService;
    private final PrdEffortEstimationService effortEstimationService;
    private final PrdRequirementSplitService requirementSplitService;
    private final PrdProgressEvaluationService progressEvaluationService;
    private final PrdDocRevisionService docRevisionService;
    private final PrdDevDocumentService devDocumentService;
    private final PrdDevDocumentClarificationService devDocumentClarificationService;
    private final PrdImageInputResolver imageInputResolver;

    /**
     * 多轮澄清（最多 5 轮）会话内的图谱查询结果缓存：question（session 标题）在各轮间不变，
     * 避免每轮都重新起一次 graphify CLI 子进程。key=sessionId，value 用 Optional 包装以区分
     * 「查过但无结果」与「尚未查过」。会话删除时同步清理，避免内存无界增长。
     */
    private final Map<String, Optional<String>> graphifyAskCache = new ConcurrentHashMap<>();
    public PrdClarifyService(AgentOneShotRunner agentRunner,
                             PrdSessionRepository repo,
                             PrdFileStore fileStore,
                             PrdArtifactService artifactService,
                             ObjectMapper mapper,
                             GraphifyQueryService graphifyQuery,
                             DomainKnowledgeQueryService domainKnowledgeQuery,
                             PrdImageInputResolver imageInputResolver,
                             PrdEffortEstimationService effortEstimationService,
                             PrdRequirementSplitService requirementSplitService,
                             PrdProgressEvaluationService progressEvaluationService,
                             PrdDocRevisionService docRevisionService,
                             PrdDevDocumentService devDocumentService,
                             PrdDevDocumentClarificationService devDocumentClarificationService) {
        this.agentRunner = agentRunner;
        this.repo = repo;
        this.fileStore = fileStore;
        this.artifactService = artifactService;
        this.mapper = mapper;
        this.graphifyQuery = graphifyQuery;
        this.domainKnowledgeQuery = domainKnowledgeQuery;
        this.imageInputResolver = imageInputResolver;
        this.titleSuggestionService = new PrdTitleSuggestionService(agentRunner, imageInputResolver);
        this.requirementTypeResolver = new PrdRequirementTypeResolver(agentRunner, mapper);
        this.clarificationQuestionService =
                new PrdClarificationQuestionService(agentRunner, mapper, imageInputResolver);
        this.answerProcessingService = new PrdAnswerProcessingService(agentRunner, mapper);
        this.documentGenerationService =
                new PrdDocumentGenerationService(agentRunner, mapper, imageInputResolver);
        this.effortEstimationService = effortEstimationService;
        this.requirementSplitService = requirementSplitService;
        this.progressEvaluationService = progressEvaluationService;
        this.docRevisionService = docRevisionService;
        this.devDocumentService = devDocumentService;
        this.devDocumentClarificationService = devDocumentClarificationService;
    }

    /** 创建会话并持久化，返回新建的会话对象。 */
    public PrdSession createSession(String title, String rawInput,
                                    String project, String module, String model, String role) {
        return createSession(title, rawInput, project, module, model, "claude", role,
                null, null, null, null, PrdBusinessFields.empty(), null, DocumentProfile.CLASSIC.name());
    }

    /**
     * 创建会话并持久化，返回新建的会话对象。
     *
     * @param reqType         需求类型：BUG_FIX | MODULE_ADJUST | NEW_MODULE。null/空/未识别时说明
     *                        前端没有展示分类弹框（典型：业务员角色），转为调用 LLM 自动判定
     *                        （{@link PrdRequirementTypeResolver#resolve}），而不是静默按 NEW_MODULE 处理。
     * @param maxQuestions    本次澄清最多问几轮，null 或非正数时按 reqType 取默认值；
     *                        reqType 走自动判定分支时此参数被忽略，以判定结果为准
     * @param createdByUserId 创建者（当前登录用户 auth_user.id），由 Controller 从 AuthContext 解析后传入；
     *                        未登录/鉴权关闭时为 null（历史列表退回旧的「全部按时间倒序」行为，不做用户过滤）
     * @param clarifyMode     澄清模式：progressive（渐进式，默认）| batch（批量一次性生成全部问题）；
     *                        null/未识别一律归一化成 progressive
     */
    public PrdSession createSession(String title, String rawInput,
                                    String project, String module, String model, String engine, String role,
                                    String reqType, Integer maxQuestions, Long createdByUserId,
                                    String clarifyMode, PrdBusinessFields businessFields, String parentId,
                                    String documentProfile) {
        long now = System.currentTimeMillis();
        PrdBusinessFields fields = businessFields == null ? PrdBusinessFields.empty() : businessFields;
        String effectiveRole = (role != null && "BUSINESS".equalsIgnoreCase(role)) ? "BUSINESS" : "PRODUCT";
        String effectiveEngine = normalizeEngine(engine);
        String effectiveParentId = parentId == null || parentId.isBlank() ? null : parentId.trim();
        if (effectiveParentId != null && repo.findById(effectiveParentId).isEmpty()) {
            throw new IllegalArgumentException("父 PRD 会话不存在: " + effectiveParentId);
        }
        PrdRequirementTypeResolver.Resolution classification =
                requirementTypeResolver.resolve(title, rawInput, model, effectiveEngine, reqType, maxQuestions);
        String effectiveClarifyMode = "batch".equals(clarifyMode) ? "batch" : "progressive";

        PrdSession session = PrdSession.builder()
                .id(UUID.randomUUID().toString())
                .title(title)
                .rawInput(rawInput)
                .project(project)
                .module(module)
                .requirementDetail(fields.requirementDetail())
                .businessBackground(fields.businessBackground())
                .businessRequirementType(fields.businessRequirementType())
                .requirementSoftware(fields.requirementSoftware())
                .initiatingDepartment(fields.initiatingDepartment())
                .requester(fields.requester())
                .requestedAt(fields.requestedAt())
                .attachments(fields.attachments())
                .followUpRecords(fields.followUpRecords())
                .model(model)
                .engine(effectiveEngine)
                .role(effectiveRole)
                .reqType(classification.reqType())
                .maxQuestions(classification.maxQuestions())
                .clarifyMode(effectiveClarifyMode)
                .documentProfile(DocumentProfile.normalize(documentProfile))
                .status("CLARIFYING")
                .createdByUserId(createdByUserId)
                .parentId(effectiveParentId)
                .createdAt(now)
                .updatedAt(now)
                .build();
        repo.insert(session);
        return session;
    }

    /**
     * 保存草稿：只落盘标题/需求描述/关联项目模块，不判定需求类型/澄清深度/澄清模式——那些要等
     * 用户真正点「开始澄清」（{@link #startClarifyFromDraft}）时才需要决定，草稿阶段还没到那一步。
     * role/reqType/maxQuestions/clarifyMode 落成跟数据库列默认值一致的占位值，转正式时会被覆盖。
     *
     * @param rawInput 需求描述，草稿允许暂时空着（只想先占个标题/项目/模块的位）；null 归一化为空串
     *                 （raw_input 列 NOT NULL，不能真塞 null）
     */
    public PrdSession saveDraft(String title, String rawInput, String project, String module, Long createdByUserId,
                                PrdBusinessFields businessFields, String documentProfile) {
        long now = System.currentTimeMillis();
        PrdBusinessFields fields = businessFields == null ? PrdBusinessFields.empty() : businessFields;
        PrdSession session = PrdSession.builder()
                .id(UUID.randomUUID().toString())
                .title(title)
                .rawInput(rawInput == null ? "" : rawInput)
                .project(project)
                .module(module)
                .requirementDetail(fields.requirementDetail())
                .businessBackground(fields.businessBackground())
                .businessRequirementType(fields.businessRequirementType())
                .requirementSoftware(fields.requirementSoftware())
                .initiatingDepartment(fields.initiatingDepartment())
                .requester(fields.requester())
                .requestedAt(fields.requestedAt())
                .attachments(fields.attachments())
                .followUpRecords(fields.followUpRecords())
                .role("PRODUCT")
                .reqType(PrdRequirementTypeResolver.NEW_MODULE)
                .maxQuestions(defaultNewModuleQuestionCount())
                .clarifyMode("progressive")
                .documentProfile(DocumentProfile.normalize(documentProfile))
                .status("DRAFT")
                .createdByUserId(createdByUserId)
                .createdAt(now)
                .updatedAt(now)
                .build();
        repo.insert(session);
        return session;
    }

    /** 再次保存草稿（覆盖字段，状态保持 DRAFT）。会话必须仍处于 DRAFT 状态，否则说明前端页面状态过期。 */
    public PrdSession updateDraft(String sessionId, String title, String rawInput, String project, String module,
                                  PrdBusinessFields businessFields, String documentProfile) {
        PrdSession existing = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        if (!"DRAFT".equals(existing.getStatus())) {
            throw new IllegalStateException("当前状态 " + existing.getStatus() + " 不是草稿，无法这样保存");
        }
        String effectiveDocumentProfile = documentProfile == null
                ? existing.getDocumentProfile() : documentProfile;
        repo.updateDraftFields(sessionId, title, rawInput == null ? "" : rawInput, project, module, businessFields,
                effectiveDocumentProfile);
        return repo.findById(sessionId).orElseThrow();
    }

    /**
     * 草稿转正式：发起澄清。复用 {@link #createSession} 同一套需求类型自动判定逻辑
     * （{@link PrdRequirementTypeResolver#resolve}），区别只是不新插入一条记录，而是原地更新已存在的草稿行
     * （草稿和后续的澄清/生成是同一条需求记录的同一个生命周期，不应该产生两条历史记录）。
     */
    public PrdSession startClarifyFromDraft(String sessionId, String title, String rawInput,
                                             String project, String module, String model, String engine, String role,
                                             String reqType, Integer maxQuestions, String clarifyMode,
                                             PrdBusinessFields businessFields, String documentProfile) {
        PrdSession existing = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        if (!"DRAFT".equals(existing.getStatus())) {
            throw new IllegalStateException("当前状态 " + existing.getStatus() + " 不是草稿，不能重复发起澄清");
        }
        String effectiveRole = (role != null && "BUSINESS".equalsIgnoreCase(role)) ? "BUSINESS" : "PRODUCT";
        String effectiveEngine = normalizeEngine(engine);
        PrdRequirementTypeResolver.Resolution classification =
                requirementTypeResolver.resolve(title, rawInput, model, effectiveEngine, reqType, maxQuestions);
        String effectiveClarifyMode = "batch".equals(clarifyMode) ? "batch" : "progressive";
        String effectiveDocumentProfile = documentProfile == null
                ? existing.getDocumentProfile() : documentProfile;
        repo.startClarifyFromDraft(sessionId, title, rawInput, project, module, model, effectiveEngine,
                effectiveRole, classification.reqType(), classification.maxQuestions(), effectiveClarifyMode,
                businessFields, effectiveDocumentProfile);
        return repo.findById(sessionId).orElseThrow();
    }

    /** AI 标题建议，完整标题由代码按固定格式拼接。 */
    public record TitleSuggestion(String shortTitle, String title) {
    }

    /**
     * 从需求文本和图片提炼业务短标题；模型异常时使用描述首行降级。
     *
     * @param project  系统或项目名称
     * @param module   业务模块名称
     * @param rawInput 需求描述及附件引用
     * @return 确定性格式化后的标题建议
     */
    public TitleSuggestion suggestTitle(String project, String module, String rawInput) {
        PrdTitleSuggestionService.TitleSuggestion suggestion =
                titleSuggestionService.suggest(project, module, rawInput);
        return new TitleSuggestion(suggestion.shortTitle(), suggestion.title());
    }

    private static String normalizeEngine(String engine) {
        if (engine == null || engine.isBlank() || "claude".equalsIgnoreCase(engine)) return "claude";
        if ("codex".equalsIgnoreCase(engine)) return "codex";
        throw new IllegalArgumentException("不支持的 Agent 引擎: " + engine);
    }

    /**
     * 一次性回答的自动分配结果。
     *
     * @param answers          与 session.questions 等长、按题序对齐的答案数组（未匹配到内容的位置为空串）
     * @param matchedCount     实际分配到内容的题数
     * @param unmatchedNumbers 没分到内容的题号（1 起，供前端提示用户手动补充）
     * @param leftover         整段回答里没能归到任何一题的内容（可能是补充说明，也可能是模型漏分，
     *                         原样回给前端展示，避免用户粘贴的内容被静默吞掉）
     */
    public record AnswerDistribution(List<String> answers, int matchedCount,
                                     List<Integer> unmatchedNumbers, String leftover) {
    }

    /**
     * 批量澄清模式的「一次性回答」：用户把对全部问题的回答写/粘成一整段，这里调一次 oneShot LLM
     * 把它拆分归位到每一题，返回按题序对齐的答案数组，由前端填进各题输入框后仍可人工修改。
     *
     * <p>定位是「省去逐题复制粘贴的体力活」，不是替用户作答——所以：
     * <ul>
     *   <li>LLM 只负责「这段话里哪句在回答第几题」这个模糊判断，不允许它编造、补全、润色答案，
     *       原文没提到的题一律留空（宁可留空让用户补，也不能拿编的内容去生成 PRD）；</li>
     *   <li>LLM 的输出当不可信入参：题号越界/重复/非数字一律丢弃，答案 trim 后为空视为没答，
     *       最终数组长度由服务端按 questions 实际题数固定，不由模型说了算；</li>
     *   <li>没归到任何一题的内容作为 leftover 原样回传，不静默丢弃。</li>
     * </ul>
     *
     * @param rawAnswer 用户一次性写下的整段回答
     * @throws IllegalStateException 会话还没有澄清问题，或 LLM 返回无法解析（这是用户主动点的动作，
     *                               失败要如实报错让他改用逐题填写，不能兜个空结果假装成功）
     */
    public AnswerDistribution distributeBatchAnswer(String sessionId, String rawAnswer) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        PrdAnswerProcessingService.DistributionResult result = answerProcessingService.distribute(
                session, rawAnswer, normalizeEngine(session.getEngine()));
        return new AnswerDistribution(
                result.answers(), result.matchedCount(), result.unmatchedNumbers(), result.leftover());
    }

    /**
     * 批量澄清阶段：调 Claude 一次性生成 session.maxQuestions 个澄清问题（JSON），通过 SSE
     * 流式推出，完成后更新库。跟渐进模式（{@link #askNextQuestion}）并列的两种澄清方式，
     * 由前端在「开始澄清前确认」弹框里选。在虚拟线程中调用；Controller 直接返回 SseEmitter。
     */
    public void clarify(String sessionId, SseEmitter emitter) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        // ERROR 会话允许从澄清阶段重试；开始执行时立即恢复状态并清掉上次错误。
        repo.updateStatus(sessionId, "CLARIFYING");
        repo.clearPrdQuestionsGeneratedAt(sessionId);

        Thread.ofVirtual().name("prd-clarify-").start(() -> {
            try {
                String questionsJson = clarificationQuestionService.generateBatchQuestions(
                        session,
                        normalizeEngine(session.getEngine()),
                        resolveClarificationKnowledge(session),
                        delta -> sendChunk(emitter, delta));
                repo.updateGeneratedQuestions(sessionId, questionsJson);

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

        String updatedJson = answerProcessingService.mergeAnswers(session.getQuestions(), answers);
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

        Thread.ofVirtual().name("prd-ask-").start(() -> {
            try {
                clarificationQuestionService.streamNextQuestion(
                        session,
                        questionIndex,
                        history,
                        normalizeEngine(session.getEngine()),
                        resolveClarificationKnowledge(session),
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

    /**
     * 已进入生成/编辑阶段后回到需求澄清。保留现有 PRD 文件和问答历史，只恢复生命周期状态；
     * 这样误跳过澄清的会话无需删除重建，完成补充澄清后可在同一会话重新生成。
     */
    public PrdSession returnToClarify(String sessionId) {
        repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        repo.updateStatus(sessionId, "CLARIFYING");
        return repo.findById(sessionId).orElseThrow();
    }

    // ─────────────────────────────────────────────────

    /**
     * 生成/更新阶段：调 Claude 生成或增量更新 PRD Markdown，通过 SSE 流式推出，落盘后更新库。
     * 在虚拟线程中调用；Controller 直接返回 SseEmitter。
     *
     * @param extraInstructions update=true 时用户补充的本次更新说明（可选，null/空表示不追加）。
     * @param updateExisting    true = 基于当前已有 PRD 内容做增量更新——复用「生成修订版」
     *                          （PrdClarifyPage.tsx#handleReviseConfirm）同一套修订协议和
     *                          === 原版 PRD 内容 === / === 本次修订说明 === 输入格式
     *                          约定，区别是不新建会话、不走多轮澄清，原地覆盖同一份文件（旧版本先备份
     *                          为 {id}-v{n}.md，语义是"检出新版本"而不是静默覆盖）。当前无 PRD 内容
     *                          时退回从零生成，避免直接报错卡住用户。
     *                          false/null = 原有行为：按原始需求描述+澄清问答从零生成/覆盖。
     */
    public void generate(String sessionId, String extraInstructions, Boolean updateExisting, SseEmitter emitter) {
        generate(sessionId, extraInstructions, updateExisting, false, emitter);
    }

    /** 后台 PRD 生成：客户端断开后继续模型调用、版本备份和落盘。 */
    public void generate(String sessionId, String extraInstructions, Boolean updateExisting,
                         boolean continueOnDisconnect, SseEmitter emitter) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));

        repo.updateStatus(sessionId, "GENERATING");
        boolean update = Boolean.TRUE.equals(updateExisting);

        Thread.ofVirtual().name("prd-generate-").start(() -> {
            AtomicBoolean clientConnected = new AtomicBoolean(true);
            try {
                String currentPrd = update ? fileStore.read(sessionId) : null;
                if (update && (currentPrd == null || currentPrd.isBlank())) {
                    log.info("[prd-clarify] 更新模式但当前无 PRD 内容，退回从零生成 sessionId={}", sessionId);
                }
                PrdDocumentGenerationService.PrdGenerationRequest request =
                        new PrdDocumentGenerationService.PrdGenerationRequest(
                                session, currentPrd, extraInstructions, update,
                                normalizeEngine(session.getEngine()));
                String prdContent = documentGenerationService.generatePrd(request, delta -> {
                    if (continueOnDisconnect) sendChunkBestEffort(emitter, delta, clientConnected);
                    else sendChunk(emitter, delta);
                });
                java.nio.file.Path mdPath = fileStore.pathFor(sessionId);
                if (update) {
                    backupPrdIfExists(mdPath);
                }
                artifactService.write(sessionId, PrdArtifactType.PRD, prdContent,
                        PrdArtifactService.ArtifactMetadata.empty());

                if (continueOnDisconnect) sendDoneBestEffort(emitter, clientConnected); else sendDone(emitter);
            } catch (Exception e) {
                log.warn("[prd-clarify] 生成阶段失败 sessionId={}", sessionId, e);
                repo.updateError(sessionId, e.getMessage());
                if (!continueOnDisconnect || clientConnected.get()) sendError(emitter, e);
            }
        });
    }

    /**
     * 覆盖 PRD 前，若旧版本已存在则备份为 {id}-v{n}.md（n 从已有备份中取最大值 + 1），
     * 跟开发文档版本备份同一套命名/递增策略——「一键更新」在语义上是
     * "检出新版本"，不是静默覆盖丢失旧内容。备份失败只记警告，不阻断本次更新。
     */
    private void backupPrdIfExists(java.nio.file.Path mdPath) {
        if (!java.nio.file.Files.isRegularFile(mdPath)) {
            return;
        }
        try {
            String fileName = mdPath.getFileName().toString(); // {id}.md
            String baseName = fileName.substring(0, fileName.length() - 3); // {id}
            java.nio.file.Path dir = mdPath.getParent();
            List<Integer> backups = scanPrdBackupVersions(dir, baseName);
            int nextVersion = (backups.isEmpty() ? 0 : backups.get(backups.size() - 1)) + 1;
            java.nio.file.Path backupPath = mdPath.resolveSibling(baseName + "-v" + nextVersion + ".md");
            java.nio.file.Files.copy(mdPath, backupPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            log.info("[prd-clarify] PRD 旧版本已备份 path={}", backupPath);
        } catch (Exception e) {
            log.warn("[prd-clarify] PRD 备份失败（不阻断本次更新）: {}", e.getMessage());
        }
    }

    private List<Integer> scanPrdBackupVersions(java.nio.file.Path dir, String baseName) {
        if (dir == null || !java.nio.file.Files.isDirectory(dir)) {
            return List.of();
        }
        java.util.regex.Pattern versionPattern =
                java.util.regex.Pattern.compile(java.util.regex.Pattern.quote(baseName) + "-v(\\d+)\\.md");
        try (var files = java.nio.file.Files.list(dir)) {
            return files
                    .map(p -> versionPattern.matcher(p.getFileName().toString()))
                    .filter(java.util.regex.Matcher::matches)
                    .map(m -> Integer.parseInt(m.group(1)))
                    .sorted()
                    .toList();
        } catch (Exception e) {
            log.debug("[prd-clarify] 扫描 PRD 备份版本失败: {}", e.getMessage());
            return List.of();
        }
    }

    // ═══════════════════════════════════════════════════
    // 开发文档：由 PRD 转换生成的技术开发方案文档
    // ═══════════════════════════════════════════════════

    /** TDD 生成/更新前的多轮技术澄清——请求下一个必须由开发者明确的问题。 */
    public void askNextDevDocQuestion(String sessionId, int questionIndex,
                                       List<QaPairRequest> history, String updateNotes,
                                       String mode,
                                       SseEmitter emitter) {
        devDocumentClarificationService.askNextQuestion(
                sessionId, questionIndex, history, updateNotes, mode, emitter);
    }

    /** TDD 生成/更新前的批量技术澄清——一次模型调用生成全部问题。 */
    public void generateDevDocQuestions(String sessionId, String updateNotes, String mode,
                                        Boolean background, SseEmitter emitter) {
        devDocumentClarificationService.generateQuestions(
                sessionId, updateNotes, mode, background, emitter);
    }

    /**
     * 生成/更新开发文档。
     * 通过 SSE 流式推出，完成后落盘到 {id}-dev.md（若已有旧版本，落盘前先备份为
     * {id}-dev-v{n}.md，"检出新版本"不会丢掉上一版内容）。
     *
     * @param extraInstructions 用户在弹框里补充的开发约束/更新说明（可选，null/空则不追加）。
     * @param updateExisting    true = 基于当前已有开发文档做增量更新；
     *                          false/null = 从 PRD 从零生成/覆盖（原有行为）
     * @param qaHistory         本次 TDD 生成/更新前的技术澄清问答，结构化持久化进生成记录，
     *                          与 PRD 业务澄清（session.questions）分开。
     * @param clarificationCompleted 是否已经走完 TDD 澄清关卡；即使 AI 判断无需提问也必须为 true
     */
    public void generateDevDoc(String sessionId, String extraInstructions, Boolean updateExisting,
                                List<QaPairRequest> qaHistory, Boolean clarificationCompleted,
                                Boolean background,
                                SseEmitter emitter) {
        devDocumentService.generate(sessionId, extraInstructions, updateExisting, qaHistory,
                clarificationCompleted, background, emitter);
    }

    /** 读取开发文档内容。 */
    public String readDevDocContent(String sessionId) throws java.io.IOException {
        return devDocumentService.readContent(sessionId);
    }

    /**
     * 读取开发文档某个历史版本的内容。version 对应磁盘上实际存在的版本号（见
     * {@link #listDevDocVersions}）：等于当前版本号时读当前 {id}-dev.md，
     * 否则读磁盘上备份的 {id}-dev-v{version}.md（由 {@link PrdDevDocumentService} 在每次
     * 覆盖前生成）。版本号非法或备份文件缺失时返回空字符串，不抛异常，前端据此提示不可查看。
     */
    public String readDevDocVersionContent(String sessionId, int version) throws java.io.IOException {
        return devDocumentService.readVersionContent(sessionId, version);
    }

    /**
     * 列出该会话开发文档的所有版本摘要，供「生成记录」抽屉展示。
     *
     * <p>以磁盘上实际存在的备份文件为准（而非 {@code dev_doc_history} JSON，见
     * {@link DevDocVersionSummary} 类注释解释为什么）——JSON 记录只是用来给扫出的版本
     * 补充 mode/补充说明/生成时间，缺失时该版本仍会出现在列表里，只是这几项为 null。</p>
     */
    public List<DevDocVersionSummary> listDevDocVersions(String sessionId) {
        return devDocumentService.listVersions(sessionId);
    }

    /** 保存开发文档（用户编辑后）。 */
    public void saveDevDocContent(String sessionId, String content) throws java.io.IOException {
        devDocumentService.saveContent(sessionId, content);
    }

    // ───── 工时评估 ─────

    /**
     * AI 工时评估：基于当前 PRD + 当前开发文档（开发文档一定基于最新 PRD 生成，见
     * {@link #generateDevDoc}，因此只需读这两份当前内容，不需要额外关联版本），结合代码/业务
     * 知识图谱查询结果，调一次 oneShot LLM 给出工时区间估算，落库到 {@code dev_doc_estimation}。
     *
     * <p>与 {@link PrdRequirementTypeResolver} 的兜底策略不同：这是用户主动点按钮触发的动作，LLM 输出
     * 解析失败时直接抛异常让请求报错，不用随意兜底值掩盖失败（兜底出的数字反而会误导决策）。</p>
     *
     * @param extraContext 用户在确认弹框里补充的上下文（如团队人力、技术栈熟悉度），可为空
     * @throws IllegalStateException 尚未生成开发文档，或 LLM 输出解析失败
     */
    public PrdSession estimateDevDocEffort(String sessionId, String extraContext) {
        return effortEstimationService.estimate(sessionId, extraContext, null);
    }

    public PrdSession estimateDevDocEffort(String sessionId, String extraContext, String requestedEngine) {
        return effortEstimationService.estimate(sessionId, extraContext, requestedEngine);
    }

    /** 启动真正的后台评估；HTTP 请求只负责登记任务，关闭弹框/页面不会中断 Code Agent。 */
    public PrdSession startEstimateDevDocEffort(String sessionId, String extraContext, String requestedEngine) {
        return effortEstimationService.start(sessionId, extraContext, requestedEngine);
    }

    // ───── 需求拆分 ─────

    /** 兼容入口：拆分分析实现由聚焦服务负责。 */
    public PrdRequirementSplitService.SplitResult splitRequirement(String sessionId) {
        return requirementSplitService.split(sessionId);
    }

    /** 兼容入口：采纳拆分项并创建子草稿。 */
    public List<PrdSession> adoptSplit(
            String parentId, List<PrdRequirementSplitService.SplitItem> items, Long createdByUserId) {
        return requirementSplitService.adopt(parentId, items, createdByUserId);
    }

    // ───── 进度评估 ─────
    //
    // 设计取自"平台文档管理事实来源，衍生产物按需生成"的分工：PRD/开发文档是业务/技术事实
    // 来源，不会为了做进度追踪被推倒重写；进度评估报告是可重复生成的派生产物，每次核对当时
    // 最新的 PRD + 开发文档 + 真实源码证据，按版本追加落盘（不覆盖），历史快照仍可回看——
    // 用法/文件命名/版本管理逻辑完全对齐开发文档，只是换了个
    // 产物类型，故意不抽取公共父类/工具方法：避免为了复用而牵连开发文档已经稳定工作的逻辑。

    /**
     * AI 进度评估：基于当前 PRD + 当前开发文档，结合 URL、代码图谱、源码和业务知识，核对代码库
     * 实际实现进度，生成大纲固定的 Markdown 报告，通过 SSE 流式推出，完成后按版本追加落盘到
     * {@code {id}-progress.md}（覆盖前先备份为 {id}-progress-v{n}.md，"检出新版本"不丢历史）。
     */
    public void evaluateProgress(String sessionId, String extraContext, SseEmitter emitter) {
        progressEvaluationService.evaluate(sessionId, extraContext, emitter);
    }

    /** 读取当前进度评估文档内容。 */
    public String readProgressContent(String sessionId) throws java.io.IOException {
        return progressEvaluationService.readContent(sessionId);
    }

    /** 读取进度评估某个历史版本的内容，逻辑对齐 {@link #readDevDocVersionContent}。 */
    public String readProgressVersionContent(String sessionId, int version) throws java.io.IOException {
        return progressEvaluationService.readVersionContent(sessionId, version);
    }

    /** 列出该会话进度评估的所有版本摘要，逻辑对齐 {@link #listDevDocVersions}。 */
    public List<ProgressVersionSummary> listProgressVersions(String sessionId) {
        return progressEvaluationService.listVersions(sessionId);
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
        java.nio.file.Path path = fileStore.pathFor(sessionId);
        backupPrdIfExists(path);
        artifactService.write(sessionId, PrdArtifactType.PRD, content,
                PrdArtifactService.ArtifactMetadata.empty());
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

    // ───── JSON 解析与合并 ─────

    /** 兼容入口：创建后台 PRD 修订节点。 */
    public PrdSession createBackgroundRevision(String parentId, String changeReason) throws IOException {
        return docRevisionService.create(parentId, changeReason);
    }

    /** 兼容入口：将历史原地覆盖恢复为后台修订节点。 */
    public PrdSession recoverInPlacePrdAsBackgroundRevision(String parentId, String changeReason) throws IOException {
        return docRevisionService.recoverInPlaceUpdate(parentId, changeReason);
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }

    /** 查询澄清问题所需的代码和业务知识，保持 Graphify 的会话级缓存语义。 */
    private PrdClarificationQuestionService.KnowledgeContext resolveClarificationKnowledge(PrdSession session) {
        Optional<String> graphContext = graphifyAskCache.computeIfAbsent(session.getId(),
                id -> queryGraphContext(session.getProject(), session.getModule(), session.getTitle()));
        Optional<String> domainContext = queryDomainContext(session.getProject(), session.getTitle());
        return new PrdClarificationQuestionService.KnowledgeContext(
                graphContext.orElse(""), domainContext.orElse(""));
    }

    /** 把 graphify CLI 查询结果（若有）拼进 prompt，作为「代码知识图谱查询结果」区块。 */
    private void appendGraphContext(StringBuilder sb, Optional<String> graphContext) {
        if (graphContext.isEmpty() || graphContext.get().isBlank()) {
            return;
        }
        sb.append("\n【代码知识图谱查询结果】（系统已直接调用 graphify CLI 查询，非 MCP，内容为真实代码事实）\n");
        sb.append(graphContext.get()).append("\n");
    }

    /** 把业务知识图谱查询结果拼入模型上下文。 */
    private void appendDomainContext(StringBuilder sb, Optional<String> domainContext) {
        if (domainContext.isEmpty() || domainContext.get().isBlank()) {
            return;
        }
        sb.append("\n【业务知识图谱查询结果】（系统已直接检索 project-domain-knowledge 库，内容为团队沉淀的业务真理，可信）\n");
        sb.append(domainContext.get()).append("\n");
    }

    /**
     * 关联项目支持多选，落库时按逗号/顿号拼成一个字符串（跟 module 多选同样的处理方式，
     * 没有改表结构）。{@link GraphifyQueryService}/{@link DomainKnowledgeQueryService} 底层
     * 一次只认一个项目名，这里拆开逐个查再拼接结果，而不是把整串"kai-toolbox, yoooni"
     * 原样传下去——那样两个服务各自的项目目录解析/精确匹配都会直接查不到，多选就变成
     * 查询静默失效。
     */
    private static List<String> splitProjects(String project) {
        if (project == null || project.isBlank()) {
            return List.of();
        }
        return Arrays.stream(project.split("[,，、]"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .distinct()
                .toList();
    }

    /**
     * 代码知识图谱查询，自动展开多选项目逐个查询后拼接（单项目时等价于直接查一次）。
     * 任一项目查询失败/查不到不影响其它项目，各自独立降级为"该项目无结果"。
     */
    private Optional<String> queryGraphContext(String project, String module, String title) {
        List<String> projects = splitProjects(project);
        if (projects.size() <= 1) {
            String p = projects.isEmpty() ? null : projects.get(0);
            return Optional.ofNullable(graphifyQuery.query(p, module, title));
        }
        StringBuilder merged = new StringBuilder();
        for (String p : projects) {
            String result = graphifyQuery.query(p, module, title);
            if (result != null && !result.isBlank()) {
                if (!merged.isEmpty()) {
                    merged.append("\n\n");
                }
                merged.append("--- 项目 ").append(p).append(" ---\n").append(result);
            }
        }
        return merged.isEmpty() ? Optional.empty() : Optional.of(merged.toString());
    }

    /** 业务知识图谱查询，多选项目的展开逻辑对齐 {@link #queryGraphContext}。 */
    private Optional<String> queryDomainContext(String project, String title) {
        List<String> projects = splitProjects(project);
        if (projects.size() <= 1) {
            String p = projects.isEmpty() ? null : projects.get(0);
            return Optional.ofNullable(domainKnowledgeQuery.query(p, title));
        }
        StringBuilder merged = new StringBuilder();
        for (String p : projects) {
            String result = domainKnowledgeQuery.query(p, title);
            if (result != null && !result.isBlank()) {
                if (!merged.isEmpty()) {
                    merged.append("\n\n");
                }
                merged.append("--- 项目 ").append(p).append(" ---\n").append(result);
            }
        }
        return merged.isEmpty() ? Optional.empty() : Optional.of(merged.toString());
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

    private static int defaultNewModuleQuestionCount() {
        return PrdRequirementTypeResolver.defaultMaxQuestions(PrdRequirementTypeResolver.NEW_MODULE);
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

    /** 后台 TDD 生成专用：客户端断开只停止推流，不取消模型任务和后续落盘。 */
    private void sendChunkBestEffort(SseEmitter emitter, String chunk, AtomicBoolean clientConnected) {
        if (chunk == null || chunk.isEmpty() || !clientConnected.get()) return;
        try {
            emitter.send(SseEmitter.event().name("chunk").data(Map.of("content", chunk)));
        } catch (Exception e) {
            clientConnected.set(false);
            log.info("[prd-clarify] TDD 后台生成客户端已断开，继续执行并落盘");
        }
    }

    private void sendDoneBestEffort(SseEmitter emitter, AtomicBoolean clientConnected) {
        if (!clientConnected.get()) return;
        try {
            emitter.send(SseEmitter.event().name("done").data("{}"));
            emitter.complete();
        } catch (Exception e) {
            clientConnected.set(false);
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

    private void sendProgress(SseEmitter emitter, String message) {
        try {
            emitter.send(SseEmitter.event().name("progress").data(Map.of("message", message)));
        } catch (Exception e) {
            emitter.completeWithError(e);
            throw new IllegalStateException("SSE client disconnected", e);
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
