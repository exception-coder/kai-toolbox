package com.exceptioncoder.toolbox.claudechat.domain;

/** 一份待执行 SQL 登记中的单个目标库脚本；只做台账，不代表平台会连接或执行该库。 */
public record SessionPendingSqlTarget(
        String targetId,
        String targetKey,
        String datasourceId,
        String targetEnvironment,
        String changeType,
        String sqlText,
        String status,
        int sortOrder,
        long createdAt,
        long updatedAt,
        Long executedAt) {
}
