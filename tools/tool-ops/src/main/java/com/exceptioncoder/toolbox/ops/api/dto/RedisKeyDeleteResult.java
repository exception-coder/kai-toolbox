package com.exceptioncoder.toolbox.ops.api.dto;

import java.util.List;

/**
 * Redis 键批量删除结果。
 *
 * @param patterns 每个模式的删除结果
 * @param totalDeleted 实际删除的键总数
 * @param elapsedMs 执行耗时（毫秒）
 */
public record RedisKeyDeleteResult(
        List<RedisPatternDeleteResult> patterns,
        long totalDeleted,
        long elapsedMs
) {
}

