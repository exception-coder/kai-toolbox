package com.exceptioncoder.toolbox.resume.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 简历 KV 写入请求体。前端把整个 state / jobTarget 序列化为 JSON 字符串放进 {@code valueJson}。
 */
public record ResumeKvUpsertRequest(@NotBlank String valueJson) {}
