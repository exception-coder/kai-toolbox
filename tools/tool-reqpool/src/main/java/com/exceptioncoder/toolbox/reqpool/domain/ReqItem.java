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
    /** 绑定的 auth_user.id；assignee 仅保留选择时的姓名快照用于降级展示。 */
    private Long assigneeUserId;
    /** yyyy-MM-dd */
    private String deadline;
    /** 关联的 prd_session.id */
    private String prdSessionId;
    /** JSON 数组字符串 */
    private String tags;
    /** AI 澄清策略分类；与业务侧原始需求分类正交。 */
    private String reqType;
    /** 需求类型来源：EXPLICIT | AI | PRD_SESSION | UNKNOWN。 */
    private String reqTypeSource;
    /** 需求类型置信度，范围 0.0..1.0。 */
    private Double reqTypeConfidence;
    /**
     * Claude AI 洞察分析（JSON），包含 priority/stars/recommendation/reason/impacts/roi/estimatedHours。
     * 兼容期保存最新投影；不可变历史和新鲜度元数据由 req_pool_insight 承载。
     */
    private String aiInsight;
    private long createdAt;
    private long updatedAt;
}
