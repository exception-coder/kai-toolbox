package com.exceptioncoder.toolbox.foreconsult.api.dto;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * 业务系统咨询会话的前端视图（只读）。moduleNames 由库中 JSON 数组字符串解析为字符串列表。
 *
 * @param sessionId        会话 ID（UUID）
 * @param userId           发起咨询的用户
 * @param systemName       所选系统名
 * @param systemSourcePath 所选系统源码路径
 * @param moduleNames      所选模块名列表（由 JSON 解析，空时为空列表）
 * @param promptSnapshot   约束提示词快照
 * @param devSessionId     关联的 claude-chat 会话 id（非 null 表示已拉起会话）
 * @param rawReferenceJson 引用清单原始 JSON
 * @param parseStatus      引用清单解析状态：NONE | OK | FAILED
 * @param archiveStatus    归档状态：PENDING | SUCCESS | FAILED
 * @param errorMsg         归档失败原因
 * @param createdAt        创建时间（Unix 毫秒）
 * @param endedAt          结束时间（Unix 毫秒），未结束时为 null
 * @param turns            会话轮次（仅详情接口填充，列表接口为空列表）
 */
public record ConsultSessionView(
        String sessionId,
        String userId,
        String creatorName,
        String questionTitle,
        String systemName,
        String systemSourcePath,
        List<String> moduleNames,
        String promptSnapshot,
        String devSessionId,
        String rawReferenceJson,
        String parseStatus,
        String archiveStatus,
        String role,
        String engine,
        String model,
        String codexReasoningEffort,
        String codexSpeed,
        String codexHome,
        String orchestrationVersion,
        String errorMsg,
        long createdAt,
        Long endedAt,
        int turnCount,
        List<ConsultTurnView> turns,
        List<FeedbackView> feedback
) {

    private static final Logger log = LoggerFactory.getLogger(ConsultSessionView.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    /** 列表视图：不带轮次明细与反馈。 */
    public static ConsultSessionView from(ConsultSession s) {
        return from(s, null, 0, List.of(), List.of());
    }

    public static ConsultSessionView summary(ConsultSession s, String creatorName, int turnCount) {
        return from(s, creatorName, turnCount, List.of(), List.of());
    }

    /** 详情视图：带轮次明细与评分反馈。 */
    public static ConsultSessionView from(ConsultSession s, List<ConsultTurnView> turns, List<FeedbackView> feedback) {
        return from(s, null, turns == null ? 0 : turns.size(), turns, feedback);
    }

    public static ConsultSessionView from(ConsultSession s, String creatorName, int turnCount,
                                          List<ConsultTurnView> turns, List<FeedbackView> feedback) {
        return new ConsultSessionView(
                s.getSessionId(), s.getUserId(), creatorName, s.getQuestionTitle(), s.getSystemName(), s.getSystemSourcePath(),
                parseModuleNames(s.getModuleNames()), s.getPromptSnapshot(), s.getDevSessionId(),
                s.getRawReferenceJson(),
                s.getParseStatus() != null ? s.getParseStatus() : "NONE",
                s.getArchiveStatus() != null ? s.getArchiveStatus() : "PENDING",
                s.getRole() != null ? s.getRole() : "IT",
                s.getEngine() != null ? s.getEngine() : "codex",
                s.getModel(), s.getCodexReasoningEffort(), s.getCodexSpeed(), s.getCodexHome(),
                s.getOrchestrationVersion() != null ? s.getOrchestrationVersion() : "v1",
                s.getErrorMsg(), s.getCreatedAt(), s.getEndedAt(), turnCount,
                turns != null ? turns : List.of(),
                feedback != null ? feedback : List.of());
    }

    private static List<String> parseModuleNames(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            List<String> parsed = MAPPER.readValue(json, STRING_LIST);
            return parsed != null ? parsed : List.of();
        } catch (Exception e) {
            log.warn("[fore-consult] moduleNames JSON 解析失败: {}", e.getMessage());
            return List.of();
        }
    }
}
