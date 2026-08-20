package com.exceptioncoder.toolbox.claudechat.domain;

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
 */
public record ReviewRequirement(String id, String reviewSpaceId, String sourceMessageId,
                                String title, String content, long revision,
                                long createdAt, long updatedAt) {
}
