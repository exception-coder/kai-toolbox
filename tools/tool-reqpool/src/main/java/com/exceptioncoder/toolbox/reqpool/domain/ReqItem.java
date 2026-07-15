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
    /**
     * Claude AI 洞察分析（JSON），包含 priority/stars/recommendation/reason/impacts/roi/estimatedHours。
     * 首次分析后缓存，需求更新时可重新触发。
     */
    private String aiInsight;
    private long createdAt;
    private long updatedAt;
}
