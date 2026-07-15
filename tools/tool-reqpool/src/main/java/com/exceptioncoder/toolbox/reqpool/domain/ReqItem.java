package com.exceptioncoder.toolbox.reqpool.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 需求管理池条目，对应 req_pool_item 表。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReqItem {
    private String id;
    private String title;
    private String description;
    private String project;
    private String module;
    /** HIGH | MEDIUM | LOW */
    private String priority;
    /** DRAFT | CLARIFYING | PRD_READY | IN_DEV | DONE | CANCELLED */
    private String status;
    private String assignee;
    /** yyyy-MM-dd */
    private String deadline;
    /** 关联的 prd_session.id */
    private String prdSessionId;
    /** JSON 数组字符串 */
    private String tags;
    private long createdAt;
    private long updatedAt;
}
