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
        String errorMsg,
        long createdAt,
        long updatedAt
) {

    private static final Logger log = LoggerFactory.getLogger(PrdSessionView.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 从领域对象转换为视图，自动解析 questions JSON。 */
    public static PrdSessionView from(PrdSession s) {
        return new PrdSessionView(
                s.getId(), s.getTitle(), s.getProject(), s.getModule(),
                s.getStatus(), s.getRole() != null ? s.getRole() : "PRODUCT",
                s.getReqType() != null ? s.getReqType() : "NEW_MODULE",
                s.getMaxQuestions() > 0 ? s.getMaxQuestions() : 5,
                s.getRawInput(),
                parseQuestions(s.getQuestions()),
                s.getMdPath(), s.getDevDocPath(), s.getDevSessionId(), s.getDevDocGeneratedAt(),
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
}
