package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.SessionAffectedApi;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAffectedApiRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/** 接口登记的可信边界：校验整批输入、规范化路由，并聚合发布就绪结论。 */
@Service
public class SessionAffectedApiService {

    private static final Set<String> METHODS = Set.of("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS");
    private static final Set<String> CHANGE_TYPES = Set.of("ADDED", "MODIFIED", "REMOVED");
    private static final Set<String> VERIFICATION_STATUSES = Set.of(
            SessionAffectedApi.UNVERIFIED, SessionAffectedApi.PASSED,
            SessionAffectedApi.FAILED, SessionAffectedApi.NOT_APPLICABLE);
    private static final int MAX_BATCH = 50;

    private final SessionAffectedApiRepository repository;
    private final ClaudeChatSessionRepository sessionRepository;

    public SessionAffectedApiService(SessionAffectedApiRepository repository,
                                     ClaudeChatSessionRepository sessionRepository) {
        this.repository = repository;
        this.sessionRepository = sessionRepository;
    }

    public List<SessionAffectedApi> list(String sessionId) {
        requireSession(sessionId);
        return repository.findBySessionId(sessionId);
    }

    @Transactional
    public List<SessionAffectedApi> register(String sessionId, List<Registration> registrations) {
        requireSession(sessionId);
        if (registrations == null || registrations.isEmpty()) {
            throw new IllegalArgumentException("至少登记一条 OpenSpec 接口影响证据");
        }
        if (registrations.size() > MAX_BATCH) {
            throw new IllegalArgumentException("单次最多登记 " + MAX_BATCH + " 个接口");
        }

        long now = System.currentTimeMillis();
        Set<String> batchKeys = new HashSet<>();
        List<SessionAffectedApi> normalized = registrations.stream()
                .map(input -> normalize(sessionId, input, now))
                .peek(api -> {
                    String key = api.httpMethod() + " " + api.apiPath();
                    if (!batchKeys.add(key)) throw new IllegalArgumentException("本批次接口重复：" + key);
                })
                .toList();
        normalized.forEach(repository::upsert);
        return repository.findBySessionId(sessionId);
    }

    public Readiness readiness(String sessionId) {
        List<SessionAffectedApi> entries = list(sessionId);
        long passed = count(entries, SessionAffectedApi.PASSED);
        long failed = count(entries, SessionAffectedApi.FAILED);
        long unverified = count(entries, SessionAffectedApi.UNVERIFIED);
        long notApplicable = count(entries, SessionAffectedApi.NOT_APPLICABLE);
        return new Readiness(entries.size(), passed, failed, unverified, notApplicable,
                !entries.isEmpty() && failed == 0 && unverified == 0);
    }

    public void delete(String sessionId) {
        requireSession(sessionId);
        repository.deleteBySessionId(sessionId);
    }

    private SessionAffectedApi normalize(String sessionId, Registration input, long now) {
        if (input == null) throw new IllegalArgumentException("接口登记项不能为空");
        String method = required(input.method(), "HTTP 方法", 16).toUpperCase(Locale.ROOT);
        if (!METHODS.contains(method)) throw new IllegalArgumentException("不支持的 HTTP 方法：" + method);
        String path = normalizePath(required(input.path(), "接口路径", 500));
        String changeType = optional(input.changeType(), "MODIFIED", 24).toUpperCase(Locale.ROOT);
        if (!CHANGE_TYPES.contains(changeType)) throw new IllegalArgumentException("不支持的接口变更类型：" + changeType);
        String sourceFile = required(input.sourceFile(), "源码位置", 1000);
        String verificationStatus = optional(input.verificationStatus(), SessionAffectedApi.UNVERIFIED, 32)
                .toUpperCase(Locale.ROOT);
        if (!VERIFICATION_STATUSES.contains(verificationStatus)) {
            throw new IllegalArgumentException("不支持的验证状态：" + verificationStatus);
        }
        String verificationMethod = optional(input.verificationMethod(), null, 80);
        String verificationSummary = optional(input.verificationSummary(), null, 2000);
        if ((SessionAffectedApi.PASSED.equals(verificationStatus) || SessionAffectedApi.FAILED.equals(verificationStatus))
                && (verificationMethod == null || verificationSummary == null)) {
            throw new IllegalArgumentException("已验证状态必须提供 verificationMethod 和 verificationSummary");
        }
        if (SessionAffectedApi.NOT_APPLICABLE.equals(verificationStatus) && verificationSummary == null) {
            throw new IllegalArgumentException("NOT_APPLICABLE 必须提供 verificationSummary 说明原因");
        }
        Long verifiedAt = SessionAffectedApi.UNVERIFIED.equals(verificationStatus) ? null : now;
        return new SessionAffectedApi(UUID.randomUUID().toString(), sessionId, method, path, changeType,
                sourceFile, optional(input.handlerName(), null, 500), optional(input.summary(), null, 2000),
                verificationStatus, verificationMethod, optional(input.verificationCommand(), null, 2000),
                verificationSummary, now, now, verifiedAt);
    }

    private static String normalizePath(String rawPath) {
        if (!rawPath.startsWith("/") || rawPath.startsWith("//")) {
            throw new IllegalArgumentException("接口路径必须是以 / 开头的路由模板");
        }
        if (rawPath.contains("?") || rawPath.contains("#") || rawPath.contains("://")
                || rawPath.contains("\\") || rawPath.chars().anyMatch(Character::isWhitespace)) {
            throw new IllegalArgumentException("接口路径不能包含 host、query 或 fragment");
        }
        long openBraces = rawPath.chars().filter(character -> character == '{').count();
        long closeBraces = rawPath.chars().filter(character -> character == '}').count();
        if (openBraces != closeBraces) {
            throw new IllegalArgumentException("接口路径参数花括号不完整");
        }
        String normalized = rawPath.replaceAll("/{2,}", "/");
        return normalized.length() > 1 && normalized.endsWith("/")
                ? normalized.substring(0, normalized.length() - 1) : normalized;
    }

    private void requireSession(String sessionId) {
        if (sessionId == null || sessionId.isBlank() || sessionRepository.findById(sessionId).isEmpty()) {
            throw new IllegalArgumentException("会话不存在：" + sessionId);
        }
    }

    private static long count(List<SessionAffectedApi> entries, String status) {
        return entries.stream().filter(entry -> status.equals(entry.verificationStatus())).count();
    }

    private static String required(String value, String field, int maxLength) {
        String normalized = optional(value, null, maxLength);
        if (normalized == null) throw new IllegalArgumentException(field + "不能为空");
        return normalized;
    }

    private static String optional(String value, String defaultValue, int maxLength) {
        if (value == null || value.isBlank()) return defaultValue;
        String normalized = value.trim();
        if (normalized.length() > maxLength) throw new IllegalArgumentException("字段长度不能超过 " + maxLength);
        return normalized;
    }

    public record Registration(String method, String path, String changeType, String sourceFile,
                               String handlerName, String summary, String verificationStatus,
                               String verificationMethod, String verificationCommand,
                               String verificationSummary) {
    }

    public record Readiness(long total, long passed, long failed, long unverified,
                            long notApplicable, boolean ready) {
    }
}
