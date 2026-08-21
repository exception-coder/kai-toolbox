package com.exceptioncoder.toolbox.claudechat.domain;

import java.util.List;

/**
 * 计划评审中经 AI 整理并由评审员确认的当前需求清单条目。
 *
 * @param id 条目 ID
 * @param reviewSpaceId 所属评审空间 ID
 * @param sourceMessageId 来源需求轮次的稳定指纹
 * @param title 业务需求标题
 * @param content 可交接的完整业务说明
 * @param revision 人工修订版本
 * @param createdAt 创建时间
 * @param updatedAt 最近更新时间
 * @param sources 形成当前需求的对话来源证据
 */
public record ReviewRequirement(String id, String reviewSpaceId, String sourceMessageId,
                                String title, String content, long revision,
                                long createdAt, long updatedAt, List<Source> sources) {

    public ReviewRequirement(String id, String reviewSpaceId, String sourceMessageId,
                             String title, String content, long revision,
                             long createdAt, long updatedAt) {
        this(id, reviewSpaceId, sourceMessageId, title, content, revision,
                createdAt, updatedAt, List.of());
    }

    /**
     * 需求形成过程中的可追溯来源，不属于正式交付正文。
     *
     * @param sourceMessageId 来源轮次稳定指纹
     * @param sourceText 业务人员原始表述
     * @param analysisText AI 对该轮诉求的业务分析
     * @param operation 编译器对该来源采取的动作
     * @param createdAt 来源进入编译器的时间
     */
    public record Source(String sourceMessageId, String sourceText, String analysisText,
                         String operation, long createdAt) {
    }
}
