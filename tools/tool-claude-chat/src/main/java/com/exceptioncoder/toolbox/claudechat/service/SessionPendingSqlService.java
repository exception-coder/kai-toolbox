package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.SessionPendingSql;
import com.exceptioncoder.toolbox.claudechat.domain.SqlDdlEvidence;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionPendingSqlRepository;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
import java.util.Set;

/** 会话待执行 SQL 的校验、保存与人工状态管理。 */
@Service
public class SessionPendingSqlService {

    private static final int MAX_SQL_LENGTH = 500 * 1024;
    private static final Set<String> CHANGE_TYPES = Set.of(
            SessionPendingSql.TYPE_DDL, SessionPendingSql.TYPE_DML, SessionPendingSql.TYPE_MIXED);
    private static final Set<String> STATUSES = Set.of(
            SessionPendingSql.STATUS_PENDING,
            SessionPendingSql.STATUS_EXECUTED,
            SessionPendingSql.STATUS_CANCELLED);
    private static final Pattern DATABASE_CHANGE = Pattern.compile(
            "(?is)\\b(CREATE|ALTER|DROP|TRUNCATE|COMMENT|GRANT|REVOKE|INSERT|UPDATE|DELETE|MERGE|REPLACE)\\b");

    private final SessionPendingSqlRepository repository;
    private final ClaudeChatSessionRepository sessionRepository;
    private final SqlDdlEvidenceService ddlEvidenceService;

    public SessionPendingSqlService(SessionPendingSqlRepository repository,
                                    ClaudeChatSessionRepository sessionRepository,
                                    SqlDdlEvidenceService ddlEvidenceService) {
        this.repository = repository;
        this.sessionRepository = sessionRepository;
        this.ddlEvidenceService = ddlEvidenceService;
    }

    /** 查询会话关联登记；会话不存在时拒绝查询。 */
    public SessionPendingSql get(String sessionId) {
        requireSession(sessionId);
        return repository.findBySessionId(sessionId);
    }

    /** 新建或更新登记；正文发生登记后统一回到待执行状态。 */
    public SessionPendingSql save(String sessionId, String title, String targetEnvironment,
                                  String changeType, String sqlText) {
        return saveVerified(sessionId, title, targetEnvironment, changeType, sqlText, null);
    }

    private SessionPendingSql saveVerified(String sessionId, String title, String targetEnvironment,
                                           String changeType, String sqlText, String evidenceId) {
        requireSession(sessionId);
        String normalizedSql = normalizeSql(sqlText);
        String normalizedType = normalizeChangeType(changeType);
        SqlDdlEvidence evidence = ddlEvidenceService.verifyRegistration(sessionId, normalizedSql, evidenceId);
        SessionPendingSql existing = repository.findBySessionId(sessionId);
        long now = System.currentTimeMillis();
        SessionPendingSql pendingSql = new SessionPendingSql(
                sessionId,
                trimOrNull(title),
                trimOrNull(targetEnvironment),
                normalizedType,
                normalizedSql,
                SessionPendingSql.STATUS_PENDING,
                existing == null ? now : existing.createdAt(),
                now,
                null,
                evidence.status(), evidence.project(), evidence.baselinePath(), evidence.evidenceId(),
                evidence.verifiedTables(), evidence.missingTables(), evidence.checkedAt());
        repository.upsert(pendingSql);
        return pendingSql;
    }

    /**
     * Forge Agent Tool 自动登记。默认把同一会话分多次生成的 SQL 合并到一份台账中；
     * 完全相同的调用保持幂等，不会把人工已完成状态重新改回待执行。
     */
    public SessionPendingSql registerFromTool(String sessionId, String title, String targetEnvironment,
                                              String changeType, String sqlText, String mode, String evidenceId) {
        requireSession(sessionId);
        String normalizedSql = normalizeSql(sqlText);
        if (!DATABASE_CHANGE.matcher(normalizedSql).find()) {
            throw new IllegalArgumentException("Forge Tool 只登记 DDL/DML，纯查询 SQL 不进入待执行台账");
        }
        String normalizedType = normalizeChangeType(changeType);
        String normalizedMode = mode == null || mode.isBlank() ? "APPEND" : mode.trim().toUpperCase();
        if (!Set.of("APPEND", "REPLACE").contains(normalizedMode)) {
            throw new IllegalArgumentException("不支持的自动登记模式：" + mode);
        }

        SessionPendingSql existing = repository.findBySessionId(sessionId);
        if (existing == null) {
            return saveVerified(sessionId, title, targetEnvironment, normalizedType, normalizedSql, evidenceId);
        }
        String mergedSql = "REPLACE".equals(normalizedMode)
                ? normalizedSql
                : appendDistinct(existing.sqlText(), normalizedSql);
        String mergedTitle = firstNonBlank(title, existing.title());
        String mergedEnvironment = firstNonBlank(targetEnvironment, existing.targetEnvironment());
        String mergedType = mergeChangeType(existing.changeType(), normalizedType);
        if (existing.sqlText().equals(mergedSql)
                && java.util.Objects.equals(existing.title(), mergedTitle)
                && java.util.Objects.equals(existing.targetEnvironment(), mergedEnvironment)
                && existing.changeType().equals(mergedType)) {
            return refreshEvidence(existing, evidenceId);
        }
        return saveVerified(sessionId, mergedTitle, mergedEnvironment, mergedType, mergedSql, evidenceId);
    }

    /** 更新人工处理状态，不触发任何 SQL 执行。 */
    public SessionPendingSql updateStatus(String sessionId, String status) {
        requireSession(sessionId);
        SessionPendingSql existing = requireRegistration(sessionId);
        String normalizedStatus = normalizeStatus(status);
        long now = System.currentTimeMillis();
        Long executedAt = SessionPendingSql.STATUS_EXECUTED.equals(normalizedStatus) ? now : null;
        repository.updateStatus(sessionId, normalizedStatus, now, executedAt);
        return new SessionPendingSql(
                existing.sessionId(), existing.title(), existing.targetEnvironment(), existing.changeType(),
                existing.sqlText(), normalizedStatus, existing.createdAt(), now, executedAt,
                existing.ddlEvidenceStatus(), existing.ddlProject(), existing.ddlBaselinePath(),
                existing.ddlEvidenceId(), existing.ddlVerifiedTables(), existing.ddlMissingTables(),
                existing.ddlCheckedAt());
    }

    /** 删除登记但保留会话。 */
    public void delete(String sessionId) {
        requireSession(sessionId);
        repository.deleteBySessionId(sessionId);
    }

    private void requireSession(String sessionId) {
        if (sessionRepository.findById(sessionId).isEmpty()) {
            throw new IllegalArgumentException("会话不存在：" + sessionId);
        }
    }

    private SessionPendingSql requireRegistration(String sessionId) {
        SessionPendingSql pendingSql = repository.findBySessionId(sessionId);
        if (pendingSql == null) {
            throw new IllegalArgumentException("当前会话尚未登记待执行 SQL");
        }
        return pendingSql;
    }

    private static String normalizeSql(String sqlText) {
        if (sqlText == null || sqlText.isBlank()) {
            throw new IllegalArgumentException("SQL 内容不能为空");
        }
        String normalized = sqlText.trim();
        if (normalized.getBytes(StandardCharsets.UTF_8).length > MAX_SQL_LENGTH) {
            throw new IllegalArgumentException("SQL 内容不能超过 500 KiB");
        }
        return normalized;
    }

    private static String normalizeChangeType(String changeType) {
        String normalized = changeType == null || changeType.isBlank()
                ? SessionPendingSql.TYPE_MIXED
                : changeType.trim().toUpperCase();
        if (!CHANGE_TYPES.contains(normalized)) {
            throw new IllegalArgumentException("不支持的 SQL 变更类型：" + changeType);
        }
        return normalized;
    }

    private static String normalizeStatus(String status) {
        String normalized = status == null ? "" : status.trim().toUpperCase();
        if (!STATUSES.contains(normalized)) {
            throw new IllegalArgumentException("不支持的 SQL 登记状态：" + status);
        }
        return normalized;
    }

    private static String trimOrNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String firstNonBlank(String preferred, String fallback) {
        String value = trimOrNull(preferred);
        return value == null ? fallback : value;
    }

    private static String mergeChangeType(String existing, String incoming) {
        return existing.equals(incoming) ? existing : SessionPendingSql.TYPE_MIXED;
    }

    private static String appendDistinct(String existing, String incoming) {
        String current = existing == null ? "" : existing.trim();
        if (current.isEmpty()) return incoming;
        if (current.contains(incoming)) return current;
        return current + "\n\n-- Forge 自动登记：补充 SQL\n" + incoming;
    }

    private SessionPendingSql refreshEvidence(SessionPendingSql existing, String evidenceId) {
        SqlDdlEvidence evidence = ddlEvidenceService.verifyRegistration(
                existing.sessionId(), existing.sqlText(),
                evidenceId == null ? existing.ddlEvidenceId() : evidenceId);
        if (java.util.Objects.equals(existing.ddlEvidenceStatus(), evidence.status())
                && java.util.Objects.equals(existing.ddlProject(), evidence.project())
                && java.util.Objects.equals(existing.ddlEvidenceId(), evidence.evidenceId())
                && java.util.Objects.equals(existing.ddlVerifiedTables(), evidence.verifiedTables())
                && java.util.Objects.equals(existing.ddlMissingTables(), evidence.missingTables())) {
            return existing;
        }
        long now = System.currentTimeMillis();
        SessionPendingSql refreshed = new SessionPendingSql(
                existing.sessionId(), existing.title(), existing.targetEnvironment(), existing.changeType(),
                existing.sqlText(), existing.status(), existing.createdAt(), now, existing.executedAt(),
                evidence.status(), evidence.project(), evidence.baselinePath(), evidence.evidenceId(),
                evidence.verifiedTables(), evidence.missingTables(), evidence.checkedAt());
        repository.upsert(refreshed);
        return refreshed;
    }
}
