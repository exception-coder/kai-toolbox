package com.exceptioncoder.toolbox.ops.api.dto;

/** 目标数据库对 SQL 的解析检查结果；检查过程不会执行待检查 SQL。 */
public record SqlCheckResult(
        Status status,
        String statementType,
        String message,
        long elapsedMs
) {
    public enum Status {
        VALID,
        INVALID,
        UNSUPPORTED,
        ERROR
    }
}
