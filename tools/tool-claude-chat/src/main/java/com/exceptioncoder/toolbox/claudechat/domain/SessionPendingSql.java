package com.exceptioncoder.toolbox.claudechat.domain;

import java.util.List;

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
        Long executedAt,
        String ddlEvidenceStatus,
        String ddlProject,
        String ddlBaselinePath,
        String ddlEvidenceId,
        List<String> ddlVerifiedTables,
        List<String> ddlMissingTables,
        Long ddlCheckedAt) {

    public SessionPendingSql(String sessionId, String title, String targetEnvironment, String changeType,
                             String sqlText, String status, long createdAt, long updatedAt, Long executedAt) {
        this(sessionId, title, targetEnvironment, changeType, sqlText, status, createdAt, updatedAt, executedAt,
                SqlDdlEvidence.STATUS_NOT_CHECKED, null, null, null, List.of(), List.of(), null);
    }

    public static final String TYPE_DDL = "DDL";
    public static final String TYPE_DML = "DML";
    public static final String TYPE_MIXED = "MIXED";

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_EXECUTED = "EXECUTED";
    public static final String STATUS_CANCELLED = "CANCELLED";
}
