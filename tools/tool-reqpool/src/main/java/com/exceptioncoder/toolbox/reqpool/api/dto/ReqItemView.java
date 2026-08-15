package com.exceptioncoder.toolbox.reqpool.api.dto;

import com.exceptioncoder.toolbox.common.requirement.RequirementType;
import com.exceptioncoder.toolbox.common.requirement.RequirementTypeSource;
import com.exceptioncoder.toolbox.reqpool.domain.ReqInsightStatus;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;

/**
 * 需求条目的前端视图。
 */
public record ReqItemView(
        String id,
        String title,
        String description,
        String project,
        String module,
        String priority,
        String status,
        String assignee,
        Long assigneeUserId,
        String deadline,
        String prdSessionId,
        String tags,
        String reqType,
        String reqTypeSource,
        double reqTypeConfidence,
        /** AI 洞察分析 JSON（含 priority/stars/recommendation/impacts/roi/estimatedHours）。 */
        String aiInsight,
        String aiInsightType,
        String aiInsightPromptVersion,
        Long aiInsightGeneratedAt,
        boolean aiInsightStale,
        String aiInsightStaleReason,
        long createdAt,
        long updatedAt
) {
    public static ReqItemView from(ReqItem item) {
        return from(item, item.getAiInsight() == null || item.getAiInsight().isBlank()
                ? ReqInsightStatus.absent()
                : ReqInsightStatus.legacy());
    }

    public static ReqItemView from(ReqItem item, ReqInsightStatus insightStatus) {
        return new ReqItemView(
                item.getId(), item.getTitle(), item.getDescription(),
                item.getProject(), item.getModule(),
                item.getPriority(), item.getStatus(),
                item.getAssignee(), item.getAssigneeUserId(), item.getDeadline(),
                item.getPrdSessionId(), item.getTags(),
                normalizedType(item.getReqType()), normalizedSource(item),
                normalizedConfidence(item),
                item.getAiInsight(),
                insightStatus.analysisType() == null ? null : insightStatus.analysisType().name(),
                insightStatus.promptVersion(), insightStatus.generatedAt(), insightStatus.stale(),
                insightStatus.staleReason(),
                item.getCreatedAt(), item.getUpdatedAt());
    }

    private static String normalizedType(String value) {
        return RequirementType.fromCode(value).name();
    }

    private static String normalizedSource(ReqItem item) {
        if (!RequirementType.fromCode(item.getReqType()).isClassified()) {
            return RequirementTypeSource.UNKNOWN.name();
        }
        try {
            return item.getReqTypeSource() == null ? RequirementTypeSource.UNKNOWN.name()
                    : RequirementTypeSource.valueOf(item.getReqTypeSource()).name();
        } catch (IllegalArgumentException ignored) {
            return RequirementTypeSource.UNKNOWN.name();
        }
    }

    private static double normalizedConfidence(ReqItem item) {
        Double value = item.getReqTypeConfidence();
        return RequirementType.fromCode(item.getReqType()).isClassified()
                && !RequirementTypeSource.UNKNOWN.name().equals(normalizedSource(item))
                && value != null && Double.isFinite(value) && value >= 0 && value <= 1
                ? value
                : 0;
    }
}
