package com.exceptioncoder.toolbox.assistant.domain;

/**
 * Assistant 草稿登记结果。
 *
 * @param draftId 草稿标识
 * @param requirementId ReqPool 需求标识
 * @param status 正式需求状态
 * @param alreadySaved 是否为重复请求返回的既有结果
 */
public record AssistantRegistration(
        String draftId,
        String requirementId,
        String status,
        boolean alreadySaved
) {
}
