package com.exceptioncoder.toolbox.ops.api.dto;

/**
 * Redis 命令执行结果。
 * result 为递归转换后的值：字符串 / 数字 / 嵌套 List（Jackson 直接序列化）。
 */
public record RedisExecResult(
        String command,
        Object result,
        long elapsedMs
) {}
