package com.exceptioncoder.toolbox.claudechat.domain;

/**
 * 开发任务下的一条 SQL 变更登记（DDL/DML 脚本 + 目标库 + 说明）。纯台账：
 * {@code executed} 只是人工勾选的「已在某环境执行」标记，后端绝不真正连库执行。
 */
public record SrmSqlChange(
        String id,
        String taskId,
        String title,
        String dbName,
        String changeType,
        String sqlText,
        String author,
        boolean executed,
        int sortOrder,
        long createdAt,
        long updatedAt) {
}
