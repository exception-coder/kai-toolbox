package com.exceptioncoder.toolbox.prdclarify.api.dto;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
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
 * @param status    状态：CLARIFYING | GENERATING | DONE | ERROR
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
        String role,
        /** 需求类型：BUG_FIX | MODULE_ADJUST | NEW_MODULE，决定澄清问题重点和生成文档结构。 */
        String reqType,
        /** 本次澄清最多问几轮（用户在「开始澄清」确认弹框里设置）。 */
        int maxQuestions,
        /** 原始需求描述（用户在填写表单时输入的完整内容），用于历史记录弹窗展示。 */
        String rawInput,
        List<QuestionItem> questions,
        String mdPath,
        /** 开发文档路径（非 null 表示已生成开发文档）。 */
        String devDocPath,
        /** 关联的 Vibe Coding 开发会话 ID（非 null 表示已启动 feature-dev 开发会话）。 */
        String devSessionId,
        /** 开发文档最后生成时间戳（毫秒）。null 或小于 updatedAt 表示开发文档已过期。 */
        Long devDocGeneratedAt,
        /**
         * 开发文档生成历史（按发生顺序，version 从 1 递增），每次生成/重新生成/更新都有一条记录，
         * 用于追溯"这版为什么长这样"。见 {@link DevDocHistoryEntryView} 各字段说明。
         */
        List<DevDocHistoryEntryView> devDocHistory,
        /** AI 工时评估结果，尚未评估过时为 null。见 {@link DevDocEstimationView} 各字段说明。 */
        DevDocEstimationView devDocEstimation,
        /** 创建者 auth_user.id；未登录/鉴权关闭时创建、或早于该功能上线的存量数据可能为 null。 */
        Long createdByUserId,
        /**
         * 创建者用户名，尽力而为解析（见 {@link #from(PrdSession, String)}）。单会话相关接口
         * （详情/创建/改标题等）默认不解析，传 null——只有历史列表接口会批量查一次全部用户名
         * 再传入，避免每个会话单独查一次库。前端据此展示"创建人"标签，主要给能看到全部用户
         * 记录的 ADMIN 用。
         */
        String createdByUsername,
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
            List<EstimationBreakdownItemView> breakdown, long estimatedAt, boolean stale) {}

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
                s.getStatus(), s.getRole() != null ? s.getRole() : "PRODUCT",
                s.getReqType() != null ? s.getReqType() : "NEW_MODULE",
                s.getMaxQuestions() > 0 ? s.getMaxQuestions() : 5,
                s.getRawInput(),
                parseQuestions(s.getQuestions()),
                s.getMdPath(), s.getDevDocPath(), s.getDevSessionId(), s.getDevDocGeneratedAt(),
                parseDevDocHistory(s.getDevDocHistory()),
                parseDevDocEstimation(s.getDevDocEstimation(), s.getDevDocGeneratedAt()),
                s.getCreatedByUserId(), createdByUsername,
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

    /**
     * 解析工时评估 JSON。devDocGeneratedAt 用于判断评估是否已过期（开发文档在评估之后
     * 又重新生成过）：devDocGeneratedAt 为 null（尚未生成开发文档）时不算过期，
     * 避免评估结果本身正常但因为没有对照时间而被误标过期。
     */
    private static DevDocEstimationView parseDevDocEstimation(String json, Long devDocGeneratedAt) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            JsonNode node = MAPPER.readTree(json);
            if (!node.isObject()) {
                return null;
            }
            long estimatedAt = node.path("estimatedAt").asLong(0);
            boolean stale = devDocGeneratedAt != null && estimatedAt < devDocGeneratedAt;
            List<EstimationBreakdownItemView> breakdown = new ArrayList<>();
            for (JsonNode item : node.path("breakdown")) {
                breakdown.add(new EstimationBreakdownItemView(
                        item.path("item").asText(""), item.path("hours").asDouble(0)));
            }
            return new DevDocEstimationView(
                    node.path("hoursMin").asInt(0),
                    node.path("hoursMax").asInt(0),
                    node.path("confidence").asText("MEDIUM"),
                    node.path("reasoning").asText(""),
                    breakdown, estimatedAt, stale);
        } catch (Exception e) {
            log.warn("[prd-clarify] devDocEstimation JSON 解析失败: {}", e.getMessage());
            return null;
        }
    }
}
