package com.exceptioncoder.toolbox.assistant.domain;

import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackCategory;
import com.exceptioncoder.toolbox.common.requirement.RequirementType;

/**
 * 一条新增用户消息的对话意图和持久化反馈分类。
 *
 * @param intentResult 兼容现有 Widget 的对话意图
 * @param feedbackCategory 公网候选库分类
 * @param requirementType 对应需求池类型
 */
public record AssistantMessageClassification(
        AssistantIntentResult intentResult,
        FeedbackCategory feedbackCategory,
        RequirementType requirementType) {
}
