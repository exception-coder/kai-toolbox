package com.exceptioncoder.toolbox.java8gu.api.dto;

/**
 * 知识补全请求：前端把题号 + 题目 markdown 原文送来。
 * 内容哈希由后端计算，作为缓存键，前端无需关心。
 */
public record EnrichRequest(String id, String markdown) {
}
