package com.exceptioncoder.toolbox.reqpool.api.dto;

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
        String deadline,
        String prdSessionId,
        String tags,
        long createdAt,
        long updatedAt
) {
    public static ReqItemView from(ReqItem item) {
        return new ReqItemView(
                item.getId(), item.getTitle(), item.getDescription(),
                item.getProject(), item.getModule(),
                item.getPriority(), item.getStatus(),
                item.getAssignee(), item.getDeadline(),
                item.getPrdSessionId(), item.getTags(),
                item.getCreatedAt(), item.getUpdatedAt());
    }
}
