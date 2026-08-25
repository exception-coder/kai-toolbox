package com.exceptioncoder.toolbox.prdclarify.api.dto;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdBusinessFields;
import com.exceptioncoder.toolbox.prdclarify.service.EstimationEvidenceFingerprint;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;

/**
 * PRD 会话的前端视图（只读）。
 *
 * @param id        会话 ID（UUID）
 * @param title     需求标题
 * @param project   关联项目名
 * @param module    关联模块名
 * @param status    状态：DRAFT | DISCOVERING | SPEC_REVIEW | CLARIFYING | GENERATING | DONE | ERROR
 * @param questions 澄清问题列表（含用户答案），未生成时为空列表
 * @param mdPath    PRD 文件路径（仅 DONE 状态下有值）
 * @param errorMsg  错误信息（仅 ERROR 状态下有值）
 * @param createdAt 创建时间（Unix 毫秒）
 * @param updatedAt 最后更新时间（Unix 毫秒）
 */
public record PrdSessionView(
        String id,
        String title,
        String project,
        String module,
        String status,
        String engine,
        String role,
        /** 需求类型：BUG_FIX | MODULE_ADJUST | NEW_MODULE，决定澄清问题重点和生成文档结构。 */
        String reqType,
        /** 本次澄清最多问几轮（用户在「开始澄清」确认弹框里设置）。 */
        int maxQuestions,
        /** 澄清模式：progressive（渐进式逐题追问）| batch（批量一次性生成全部问题）。 */
        String clarifyMode,
        /** 原始需求描述（用户在填写表单时输入的完整内容），用于历史记录弹窗展示。 */
        String rawInput,
        /** 业务来源结构化字段（飞书需求池导入或 PRD 起草时填写）。 */
        PrdBusinessFields businessFields,
        List<QuestionItem> questions,
        /** 最近一次 PRD 澄清问题生成完成时间（毫秒）。 */
        Long prdQuestionsGeneratedAt,
        /** 最近一次 PRD 文档生成完成时间（毫秒）。 */
        Long prdGeneratedAt,
        /** 初始化规格兼容主文件路径。 */
        String initialSpecPath,
        String mdPath,
        /** 开发文档路径（非 null 表示已生成开发文档）。 */
        String devDocPath,
        /** 关联的 Vibe Coding 开发会话 ID（非 null 表示已启动 feature-dev 开发会话）。 */
        String devSessionId,
        /** 开发文档最后生成时间戳（毫秒）。null 或小于 updatedAt 表示开发文档已过期。 */
        Long devDocGeneratedAt,
        /** 最近一次 TDD 澄清问题生成完成时间（毫秒）。 */
        Long devDocQuestionsGeneratedAt,
        /**
         * 开发文档生成历史（按发生顺序，version 从 1 递增），每次生成/重新生成/更新都有一条记录，
         * 用于追溯"这版为什么长这样"。见 {@link DevDocHistoryEntryView} 各字段说明。
         */
        List<DevDocHistoryEntryView> devDocHistory,
        /** 已提交但尚未成功生成 TDD 的技术澄清答案；失败重试时用于恢复表单。 */
        List<DevDocQaDraftItemView> devDocQaDraft,
        /** TDD 点按作业状态：BUILDING_QUESTIONS | AWAITING_ANSWERS | GENERATING | ERROR | DONE。 */
        String devDocWorkStatus,
        String devDocWorkError,
        /** 执行计划后台生成的当前阶段提示。 */
        String devDocWorkProgress,
        /** 尚未落为正式产物的 Markdown 增量快照。 */
        String devDocWorkContent,
        /** 最近一次执行计划进度落库时间（毫秒）。 */
        Long devDocWorkUpdatedAt,
        /** AI 工时评估结果，尚未评估过时为 null。见 {@link DevDocEstimationView} 各字段说明。 */
        DevDocEstimationView devDocEstimation,
        /** 进度评估文档路径（非 null 表示评估过至少一次）。 */
        String progressPath,
        /**
         * 最后一次进度评估时间戳（毫秒）。是否"已过期"由前端跟 devDocGeneratedAt/updatedAt
         * 比较判断（对齐 isDevDocStale 的算法，未在后端预计算）。
         */
        Long progressGeneratedAt,
        /** 本地代码分析后台任务状态：IDLE | RUNNING | COMPLETED | ERROR。 */
        String progressWorkStatus,
        String progressWorkStage,
        String progressWorkError,
        Long progressWorkStartedAt,
        Long progressWorkCompletedAt,
        Long progressWorkUpdatedAt,
        /** 创建者 auth_user.id；未登录/鉴权关闭时创建、或早于该功能上线的存量数据可能为 null。 */
        Long createdByUserId,
        /**
         * 创建者用户名，尽力而为解析（见 {@link #from(PrdSession, String)}）。单会话相关接口
         * （详情/创建/改标题等）默认不解析，传 null——只有历史列表接口会批量查一次全部用户名
         * 再传入，避免每个会话单独查一次库。前端据此展示"创建人"标签，主要给能看到全部用户
         * 记录的 ADMIN 用。
         */
        String createdByUsername,
        /**
         * 父会话 ID，非 null 表示这是「需求拆分」产生的子需求（见
         * {@code com.exceptioncoder.toolbox.prdclarify.service.PrdRequirementSplitService#adopt}）。
         * 历史列表前端据此把子记录嵌套展示在父记录下面。
         */
        String parentId,
        String errorMsg,
        long createdAt,
        long updatedAt
) {

    private static final Logger log = LoggerFactory.getLogger(PrdSessionView.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /**
     * 一条开发文档生成历史记录。
     *
     * @param version           版本号（从 1 递增），对应磁盘上被取代前备份出的 {id}-dev-v{version}.md
     * @param mode              generate（首次生成）| regenerate（基于最新 PRD 从零重新生成）|
     *                          update（基于当前开发文档增量更新，extraInstructions 含澄清问答记录）
     * @param extraInstructions 本次生成实际使用的补充说明/更新说明（update 模式下含完整澄清问答文本）
     * @param generatedAt       生成时间戳（毫秒）
     */
    public record DevDocHistoryEntryView(int version, String mode, String extraInstructions, long generatedAt) {}

    public record DevDocQaDraftItemView(String question, String answer) {}

    /**
     * AI 工时评估结果（对应当前这份开发文档，开发文档一定基于最新 PRD 生成，见
     * {@code PrdClarifyService#generateDevDoc}）。
     *
     * @param hoursMin    预估最少小时数
     * @param hoursMax    预估最多小时数
     * @param confidence  评估信心：LOW | MEDIUM | HIGH
     * @param reasoning   整体评估依据（2-4 句话）
     * @param breakdown   按功能点/模块拆解的工时明细
     * @param estimatedAt 评估时间戳（毫秒）
     * @param stale       true 表示开发文档在这次评估之后又重新生成/更新过，工时可能已经不准，
     *                     建议重新评估（estimatedAt 早于 devDocGeneratedAt 时为 true）
     */
    public record DevDocEstimationView(
            int hoursMin, int hoursMax, String confidence, String reasoning,
            List<EstimationBreakdownItemView> breakdown,
            List<String> inspectedFiles, String codeEvidenceSummary,
            List<String> assumptions, List<String> risks,
            String engine, String projectPath, boolean codeInspected,
            String sourceSessionId, String sourceTitle,
            String workStatus, String workError, long startedAt, Long completedAt,
            long estimatedAt, boolean stale, List<String> staleReasons) {}

    /** 工时拆解明细的一项。 */
    public record EstimationBreakdownItemView(String item, double hours) {}

    /** 从领域对象转换为视图，自动解析 questions / devDocHistory / devDocEstimation JSON；不解析创建者用户名。 */
    public static PrdSessionView from(PrdSession s) {
        return from(s, null);
    }

    /**
     * 从领域对象转换为视图，createdByUsername 由调用方解析后传入（历史列表批量查一次
     * auth_user，避免每条记录单独查一次库；见 {@link #createdByUsername}）。
     */
    public static PrdSessionView from(PrdSession s, String createdByUsername) {
        return new PrdSessionView(
                s.getId(), s.getTitle(), s.getProject(), s.getModule(),
                s.getStatus(),
                s.getEngine() == null ? null
                        : ("codex".equalsIgnoreCase(s.getEngine()) ? "codex" : "claude"),
                s.getRole() != null ? s.getRole() : "PRODUCT",
                s.getReqType() != null ? s.getReqType() : "NEW_MODULE",
                s.getMaxQuestions() > 0 ? s.getMaxQuestions() : 5,
                "batch".equals(s.getClarifyMode()) ? "batch" : "progressive",
                s.getRawInput(),
                new PrdBusinessFields(
                        s.getRequirementDetail(), s.getBusinessBackground(), s.getBusinessRequirementType(),
                        s.getRequirementSoftware(), s.getInitiatingDepartment(), s.getRequester(),
                        s.getRequestedAt(), s.getAttachments(), s.getFollowUpRecords()),
                parseQuestions(s.getQuestions()), s.getPrdQuestionsGeneratedAt(), s.getPrdGeneratedAt(),
                s.getInitialSpecPath(), s.getMdPath(), s.getDevDocPath(), s.getDevSessionId(), s.getDevDocGeneratedAt(),
                s.getDevDocQuestionsGeneratedAt(),
                parseDevDocHistory(s.getDevDocHistory()),
                parseDevDocQaDraft(s.getDevDocQaDraft()),
                s.getDevDocWorkStatus(), s.getDevDocWorkError(),
                s.getDevDocWorkProgress(), s.getDevDocWorkContent(), s.getDevDocWorkUpdatedAt(),
                parseDevDocEstimation(s.getDevDocEstimation(), s),
                s.getProgressPath(), s.getProgressGeneratedAt(),
                s.getProgressWorkStatus(), s.getProgressWorkStage(), s.getProgressWorkError(),
                s.getProgressWorkStartedAt(), s.getProgressWorkCompletedAt(), s.getProgressWorkUpdatedAt(),
                s.getCreatedByUserId(), createdByUsername, s.getParentId(),
                s.getErrorMsg(), s.getCreatedAt(), s.getUpdatedAt());
    }

    private static List<QuestionItem> parseQuestions(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            JsonNode arr = MAPPER.readTree(json);
            if (!arr.isArray()) {
                return List.of();
            }
            List<QuestionItem> result = new ArrayList<>();
            for (JsonNode node : arr) {
                result.add(new QuestionItem(
                        node.path("id").asInt(0),
                        node.path("question").asText(""),
                        node.path("answer").asText("")));
            }
            return result;
        } catch (Exception e) {
            log.warn("[prd-clarify] questions JSON 解析失败: {}", e.getMessage());
            return List.of();
        }
    }

    private static List<DevDocHistoryEntryView> parseDevDocHistory(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            JsonNode arr = MAPPER.readTree(json);
            if (!arr.isArray()) {
                return List.of();
            }
            List<DevDocHistoryEntryView> result = new ArrayList<>();
            for (JsonNode node : arr) {
                result.add(new DevDocHistoryEntryView(
                        node.path("version").asInt(0),
                        node.path("mode").asText("generate"),
                        node.path("extraInstructions").asText(""),
                        node.path("generatedAt").asLong(0)));
            }
            return result;
        } catch (Exception e) {
            log.warn("[prd-clarify] devDocHistory JSON 解析失败: {}", e.getMessage());
            return List.of();
        }
    }

    private static List<DevDocQaDraftItemView> parseDevDocQaDraft(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            JsonNode arr = MAPPER.readTree(json);
            if (!arr.isArray()) return List.of();
            List<DevDocQaDraftItemView> result = new ArrayList<>();
            for (JsonNode node : arr) {
                String question = node.path("question").asText("").trim();
                if (!question.isBlank()) {
                    result.add(new DevDocQaDraftItemView(question, node.path("answer").asText("")));
                }
            }
            return result;
        } catch (Exception e) {
            log.warn("[prd-clarify] devDocQaDraft JSON 解析失败: {}", e.getMessage());
            return List.of();
        }
    }

    /** 解析工时评估并实时核对当时使用的 PRD、TDD 和关键代码文件指纹。 */
    private static DevDocEstimationView parseDevDocEstimation(String json, PrdSession session) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            JsonNode node = MAPPER.readTree(json);
            if (!node.isObject()) {
                return null;
            }
            long estimatedAt = node.path("estimatedAt").asLong(0);
            long startedAt = node.path("startedAt").asLong(0);
            String workStatus = node.path("workStatus").asText(estimatedAt > 0 ? "COMPLETED" : "IDLE");
            String workError = node.path("workError").asText("");
            Long completedAt = node.hasNonNull("completedAt") ? node.path("completedAt").asLong() : null;
            if ("RUNNING".equals(workStatus) && startedAt > 0
                    && System.currentTimeMillis() - startedAt > 30 * 60 * 1000L) {
                workStatus = "ERROR";
                workError = "后台评估任务已中断，请重新发起";
            }
            List<String> staleReasons = new ArrayList<>();
            String invalidatedReason = node.path("invalidatedReason").asText("").trim();
            if (!invalidatedReason.isBlank()) staleReasons.add(invalidatedReason);

            if (node.hasNonNull("prdFingerprint")) {
                if (!node.path("prdFingerprint").asText("")
                        .equals(EstimationEvidenceFingerprint.fileOrEmpty(node.path("prdPath").asText("")))) {
                    staleReasons.add("PRD 已更新");
                }
                if (!node.path("tddFingerprint").asText("")
                        .equals(EstimationEvidenceFingerprint.fileOrEmpty(node.path("tddPath").asText("")))) {
                    staleReasons.add("TDD 已更新");
                }
                String codeFingerprint = node.path("codeFingerprint").asText("");
                List<String> inspectedFilesForCheck = parseStringArray(node.path("inspectedFiles"));
                if (!codeFingerprint.isBlank() && !codeFingerprint.equals(
                        EstimationEvidenceFingerprint.inspectedFiles(
                                node.path("projectPath").asText(""), inspectedFilesForCheck))) {
                    staleReasons.add("已核查的代码发生变化");
                }
            } else {
                // 兼容功能上线前的旧评估记录：没有内容指纹时退回生成时间判断。
                if (session.getPrdGeneratedAt() != null && estimatedAt < session.getPrdGeneratedAt()) {
                    staleReasons.add("PRD 已重新生成");
                }
                if (session.getDevDocGeneratedAt() != null && estimatedAt < session.getDevDocGeneratedAt()) {
                    staleReasons.add("TDD 已重新生成");
                }
            }
            // 第一次后台评估尚无上一版结果，不应把 0 时间戳误判成旧评估过期。
            if (estimatedAt == 0) staleReasons.clear();
            List<EstimationBreakdownItemView> breakdown = new ArrayList<>();
            for (JsonNode item : node.path("breakdown")) {
                breakdown.add(new EstimationBreakdownItemView(
                        item.path("item").asText(""), item.path("hours").asDouble(0)));
            }
            List<String> inspectedFiles = parseStringArray(node.path("inspectedFiles"));
            List<String> assumptions = parseStringArray(node.path("assumptions"));
            List<String> risks = parseStringArray(node.path("risks"));
            return new DevDocEstimationView(
                    node.path("hoursMin").asInt(0),
                    node.path("hoursMax").asInt(0),
                    node.path("confidence").asText("MEDIUM"),
                    node.path("reasoning").asText(""),
                    breakdown,
                    inspectedFiles, node.path("codeEvidenceSummary").asText(""),
                    assumptions, risks,
                    node.path("engine").asText(""), node.path("projectPath").asText(""),
                    node.path("codeInspected").asBoolean(false),
                    node.path("sourceSessionId").asText(session.getId()),
                    node.path("sourceTitle").asText(session.getTitle()),
                    workStatus, workError, startedAt, completedAt,
                    estimatedAt, !staleReasons.isEmpty(), List.copyOf(staleReasons));
        } catch (Exception e) {
            log.warn("[prd-clarify] devDocEstimation JSON 解析失败: {}", e.getMessage());
            return null;
        }
    }

    private static List<String> parseStringArray(JsonNode node) {
        if (!node.isArray()) return List.of();
        List<String> result = new ArrayList<>();
        for (JsonNode value : node) {
            String text = value.asText("").trim();
            if (!text.isBlank()) result.add(text);
        }
        return result;
    }
}
