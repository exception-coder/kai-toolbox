package com.exceptioncoder.toolbox.ops.api.dto;

/**
 * 单个 Redis 键模式的删除结果。
 *
 * @param pattern 已校验并执行的键模式
 * @param deleted 实际删除的键数量
 */
public record RedisPatternDeleteResult(
        String pattern,
        long deleted
) {
}

