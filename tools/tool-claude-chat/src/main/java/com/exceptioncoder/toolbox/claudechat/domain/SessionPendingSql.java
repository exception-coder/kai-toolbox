package com.exceptioncoder.toolbox.claudechat.domain;

/**
 * Vibe Coding 会话关联的一份待执行 SQL 登记。
 * 状态只代表人工处理结果，本系统不负责连接目标库或执行 SQL。
 */
public record SessionPendingSql(
        String sessionId,
        String title,
        String targetEnvironment,
        String changeType,
        String sqlText,
        String status,
        long createdAt,
        long updatedAt,
        Long executedAt) {

    public static final String TYPE_DDL = "DDL";
    public static final String TYPE_DML = "DML";
    public static final String TYPE_MIXED = "MIXED";

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_EXECUTED = "EXECUTED";
    public static final String STATUS_CANCELLED = "CANCELLED";
}
