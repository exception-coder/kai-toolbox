package com.exceptioncoder.toolbox.ops.api.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 按安全前缀模式删除 Redis 键的请求。
 *
 * @param patterns 一至十个以单个星号结尾的键前缀模式
 */
public record RedisDeleteByPatternsRequest(
        @NotEmpty @Size(max = 10) List<String> patterns
) {
}

