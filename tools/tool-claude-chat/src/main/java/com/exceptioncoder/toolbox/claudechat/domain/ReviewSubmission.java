package com.exceptioncoder.toolbox.claudechat.domain;

/** 公开交付归属快照；列表不含正文，单条按需读取提交原文，不包含开发侧修订。 */
public record ReviewSubmission(String id, String submittedBy, String targetProject, long createdAt, String content) { }
