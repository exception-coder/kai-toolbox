package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.SessionPendingSql;
import com.exceptioncoder.toolbox.claudechat.domain.SessionPendingSqlTarget;
import com.exceptioncoder.toolbox.claudechat.domain.SqlDdlEvidence;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionPendingSqlRepository;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.Set;

/** 会话待执行 SQL 的校验、保存与人工状态管理。 */
@Service
public class SessionPendingSqlService {

    private static final int MAX_SQL_LENGTH = 500 * 1024;
    private static final int MAX_TARGETS = 16;
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
        return save(sessionId, title, targetEnvironment, changeType, sqlText, List.of());
    }

    public SessionPendingSql save(String sessionId, String title, String targetEnvironment,
                                  String changeType, String sqlText,
                                  List<SessionPendingSqlTarget> requestedTargets) {
        return saveVerified(sessionId, title, targetEnvironment, changeType, sqlText, requestedTargets, null);
    }

    private SessionPendingSql saveVerified(String sessionId, String title, String targetEnvironment,
                                           String changeType, String sqlText,
                                           List<SessionPendingSqlTarget> requestedTargets, String evidenceId) {
        requireSession(sessionId);
        SessionPendingSql existing = repository.findBySessionId(sessionId);
        long now = System.currentTimeMillis();
        List<SessionPendingSqlTarget> targets = normalizeTargets(
                requestedTargets, targetEnvironment, changeType, sqlText, existing, now);
        String normalizedSql = buildSummarySql(targets);
        String normalizedType = aggregateChangeType(targets);
        String normalizedEnvironment = targets.size() == 1
                ? targets.get(0).targetEnvironment()
                : targets.size() + " 个目标库";
        SqlDdlEvidence evidence = ddlEvidenceService.verifyRegistration(sessionId, normalizedSql, evidenceId);
        SessionPendingSql pendingSql = new SessionPendingSql(
                sessionId,
                trimOrNull(title),
                normalizedEnvironment,
                normalizedType,
                normalizedSql,
                SessionPendingSql.STATUS_PENDING,
                existing == null ? now : existing.createdAt(),
                now,
                null,
                evidence.status(), evidence.project(), evidence.baselinePath(), evidence.evidenceId(),
                evidence.verifiedTables(), evidence.missingTables(), evidence.checkedAt(), targets);
        repository.upsert(pendingSql);
        return pendingSql;
    }

    /**
     * Forge Agent Tool 自动登记。默认把同一会话分多次生成的 SQL 合并到一份台账中；
     * 完全相同的调用保持幂等，不会把人工已完成状态重新改回待执行。
     */
    public SessionPendingSql registerFromTool(String sessionId, String title, String targetEnvironment,
                                              String changeType, String sqlText, String mode, String evidenceId) {
        SessionPendingSqlTarget target = new SessionPendingSqlTarget(
                null, null, null, targetEnvironment, changeType, sqlText,
                SessionPendingSql.STATUS_PENDING, 0, 0, 0, null);
        return registerFromTool(sessionId, title, mode, evidenceId, List.of(target));
    }

    /** 一次登记多个目标库；每个目标独立合并，汇总 SQL 由服务端统一重建。 */
    public SessionPendingSql registerFromTool(String sessionId, String title, String mode, String evidenceId,
                                              List<SessionPendingSqlTarget> requestedTargets) {
        requireSession(sessionId);
        String normalizedMode = mode == null || mode.isBlank() ? "APPEND" : mode.trim().toUpperCase();
        if (!Set.of("APPEND", "REPLACE").contains(normalizedMode)) {
            throw new IllegalArgumentException("不支持的自动登记模式：" + mode);
        }
        if (requestedTargets == null || requestedTargets.isEmpty()) {
            throw new IllegalArgumentException("至少提供一个目标库 SQL");
        }
        if (requestedTargets.size() > MAX_TARGETS) {
            throw new IllegalArgumentException("目标库不能超过 " + MAX_TARGETS + " 个");
        }

        SessionPendingSql existing = repository.findBySessionId(sessionId);
        List<SessionPendingSqlTarget> mergedTargets = new ArrayList<>();
        if (existing != null) {
            if (existing.targets().isEmpty()) {
                String legacyEnvironment = firstNonBlank(existing.targetEnvironment(), "未指定目标");
                mergedTargets.add(new SessionPendingSqlTarget(
                        "legacy-" + sessionId, targetKey(null, legacyEnvironment), null, legacyEnvironment,
                        existing.changeType(), existing.sqlText(), existing.status(), 0,
                        existing.createdAt(), existing.updatedAt(), existing.executedAt()));
            } else {
                mergedTargets.addAll(existing.targets());
            }
        }
        long now = System.currentTimeMillis();
        boolean targetsChanged = false;
        for (SessionPendingSqlTarget requestedTarget : requestedTargets) {
            String normalizedSql = normalizeSql(requestedTarget.sqlText());
            if (!DATABASE_CHANGE.matcher(normalizedSql).find()) {
                throw new IllegalArgumentException("Forge Tool 只登记 DDL/DML，纯查询 SQL 不进入待执行台账");
            }
            String normalizedType = normalizeChangeType(requestedTarget.changeType());
            SessionPendingSqlTarget implicitTarget = trimOrNull(requestedTarget.targetEnvironment()) == null
                    && trimOrNull(requestedTarget.targetKey()) == null
                    && trimOrNull(requestedTarget.datasourceId()) == null
                    && mergedTargets.size() == 1 ? mergedTargets.get(0) : null;
            String targetName = implicitTarget == null
                    ? firstNonBlank(requestedTarget.targetEnvironment(), "未指定目标")
                    : implicitTarget.targetEnvironment();
            String key = implicitTarget == null
                    ? targetKey(requestedTarget.datasourceId(), firstNonBlank(requestedTarget.targetKey(), targetName))
                    : implicitTarget.targetKey();
            int index = findTargetIndex(mergedTargets, key, targetName);
            SessionPendingSqlTarget previous = index < 0 ? null : mergedTargets.get(index);
            String mergedSql = previous == null || "REPLACE".equals(normalizedMode)
                    ? normalizedSql
                    : appendDistinct(previous.sqlText(), normalizedSql);
            String mergedChangeType = previous == null
                    ? normalizedType : mergeChangeType(previous.changeType(), normalizedType);
            targetsChanged |= previous == null || !previous.sqlText().equals(mergedSql)
                    || !previous.changeType().equals(mergedChangeType);
            SessionPendingSqlTarget merged = new SessionPendingSqlTarget(
                    previous == null ? UUID.randomUUID().toString() : previous.targetId(), key,
                    previous == null ? trimOrNull(requestedTarget.datasourceId()) : previous.datasourceId(), targetName,
                    mergedChangeType,
                    mergedSql,
                    previous != null && previous.sqlText().equals(mergedSql)
                            ? previous.status() : SessionPendingSql.STATUS_PENDING,
                    previous == null ? mergedTargets.size() : previous.sortOrder(),
                    previous == null ? now : previous.createdAt(), now,
                    previous != null && previous.sqlText().equals(mergedSql) ? previous.executedAt() : null);
            if (previous == null) mergedTargets.add(merged);
            else mergedTargets.set(index, merged);
        }
        String mergedTitle = firstNonBlank(title, existing == null ? null : existing.title());
        String summary = buildSummarySql(mergedTargets);
        if (existing != null && !targetsChanged && Objects.equals(existing.title(), mergedTitle)) {
            return refreshEvidence(existing, evidenceId);
        }
        return saveVerified(sessionId, mergedTitle, null, null, summary, mergedTargets, evidenceId);
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
                existing.ddlCheckedAt(), existing.targets().stream().map(target -> new SessionPendingSqlTarget(
                target.targetId(), target.targetKey(), target.datasourceId(), target.targetEnvironment(),
                target.changeType(), target.sqlText(), normalizedStatus, target.sortOrder(), target.createdAt(), now,
                executedAt)).toList());
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

    private static List<SessionPendingSqlTarget> normalizeTargets(
            List<SessionPendingSqlTarget> requestedTargets, String targetEnvironment,
            String changeType, String sqlText, SessionPendingSql existing, long now) {
        List<SessionPendingSqlTarget> source = requestedTargets == null ? List.of() : requestedTargets;
        if (source.isEmpty()) {
            if (existing != null && (sqlText == null || sqlText.isBlank()) && !existing.targets().isEmpty()) {
                source = existing.targets();
            } else {
                String environment = firstNonBlank(targetEnvironment, "未指定目标");
                source = List.of(new SessionPendingSqlTarget(
                        null, targetKey(null, environment), null, environment,
                        normalizeChangeType(changeType), normalizeSql(sqlText),
                        SessionPendingSql.STATUS_PENDING, 0, now, now, null));
            }
        }
        if (source.size() > MAX_TARGETS) {
            throw new IllegalArgumentException("目标库不能超过 " + MAX_TARGETS + " 个");
        }
        LinkedHashMap<String, SessionPendingSqlTarget> normalized = new LinkedHashMap<>();
        int order = 0;
        for (SessionPendingSqlTarget target : source) {
            String environment = firstNonBlank(target.targetEnvironment(), "未指定目标");
            String key = targetKey(target.datasourceId(), firstNonBlank(target.targetKey(), environment));
            if (normalized.containsKey(key)) {
                throw new IllegalArgumentException("目标库重复：" + environment);
            }
            SessionPendingSqlTarget old = existing == null ? null : existing.targets().stream()
                    .filter(item -> item.targetKey().equals(key)).findFirst().orElse(null);
            String normalizedSql = normalizeSql(target.sqlText());
            boolean unchanged = old != null && old.sqlText().equals(normalizedSql)
                    && old.changeType().equals(normalizeChangeType(target.changeType()));
            normalized.put(key, new SessionPendingSqlTarget(
                    old == null ? firstNonBlank(target.targetId(), UUID.randomUUID().toString()) : old.targetId(),
                    key, trimOrNull(target.datasourceId()), environment, normalizeChangeType(target.changeType()),
                    normalizedSql, unchanged ? old.status() : SessionPendingSql.STATUS_PENDING, order++,
                    old == null ? now : old.createdAt(), now, unchanged ? old.executedAt() : null));
        }
        return List.copyOf(normalized.values());
    }

    private static String targetKey(String datasourceId, String fallback) {
        String id = trimOrNull(datasourceId);
        if (id != null) return "datasource:" + id;
        String normalized = fallback.trim().toLowerCase(Locale.ROOT);
        if (normalized.startsWith("datasource:") || normalized.startsWith("name:")) return normalized;
        return "name:" + normalized.replaceAll("\\s+", "-");
    }

    private static int findTargetIndex(List<SessionPendingSqlTarget> targets, String key, String environment) {
        for (int index = 0; index < targets.size(); index++) {
            SessionPendingSqlTarget target = targets.get(index);
            if (target.targetKey().equals(key) || target.targetEnvironment().equalsIgnoreCase(environment)) return index;
        }
        return -1;
    }

    private static String aggregateChangeType(List<SessionPendingSqlTarget> targets) {
        String type = targets.get(0).changeType();
        for (int index = 1; index < targets.size(); index++) {
            type = mergeChangeType(type, targets.get(index).changeType());
        }
        return type;
    }

    static String buildSummarySql(List<SessionPendingSqlTarget> targets) {
        return targets.stream()
                .map(target -> "-- 目标库 / 环境：" + target.targetEnvironment()
                        + "\n-- 变更类型：" + target.changeType() + "\n" + target.sqlText().trim())
                .reduce((left, right) -> left + "\n\n" + right)
                .map(SessionPendingSqlService::normalizeSql)
                .orElseThrow(() -> new IllegalArgumentException("至少选择一个目标库"));
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
                evidence.verifiedTables(), evidence.missingTables(), evidence.checkedAt(), existing.targets());
        repository.upsert(refreshed);
        return refreshed;
    }
}
