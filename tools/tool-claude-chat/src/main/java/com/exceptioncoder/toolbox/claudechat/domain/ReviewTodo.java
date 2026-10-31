package com.exceptioncoder.toolbox.claudechat.domain;

/** 持久评审待办；来源修订与开发侧编辑版本分别保留。 */
public record ReviewTodo(String id, String reviewSpaceId, String sourceSessionId, String feedbackId,
                         String requirementId, long sourceRevision, long version, String title, String content,
                         String status, String messageId, String note, long createdAt, long updatedAt) { }
