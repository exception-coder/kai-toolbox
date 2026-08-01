package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.SessionPendingSql;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionPendingSqlRepository;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
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

    private final SessionPendingSqlRepository repository;
    private final ClaudeChatSessionRepository sessionRepository;

    public SessionPendingSqlService(SessionPendingSqlRepository repository,
                                    ClaudeChatSessionRepository sessionRepository) {
        this.repository = repository;
        this.sessionRepository = sessionRepository;
    }

    /** 查询会话关联登记；会话不存在时拒绝查询。 */
    public SessionPendingSql get(String sessionId) {
        requireSession(sessionId);
        return repository.findBySessionId(sessionId);
    }

    /** 新建或更新登记；正文发生登记后统一回到待执行状态。 */
    public SessionPendingSql save(String sessionId, String title, String targetEnvironment,
                                  String changeType, String sqlText) {
        requireSession(sessionId);
        String normalizedSql = normalizeSql(sqlText);
        String normalizedType = normalizeChangeType(changeType);
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
                null);
        repository.upsert(pendingSql);
        return pendingSql;
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
                existing.sqlText(), normalizedStatus, existing.createdAt(), now, executedAt);
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
}
