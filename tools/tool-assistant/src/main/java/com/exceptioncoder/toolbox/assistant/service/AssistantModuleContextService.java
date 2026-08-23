package com.exceptioncoder.toolbox.assistant.service;

import com.exceptioncoder.toolbox.assistant.domain.AssistantModuleContext;
import com.exceptioncoder.toolbox.assistant.repository.AssistantModuleContextRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.UUID;

/** 读取和刷新当前用户的模块探索摘要；摘要只作为历史线索，不代表当前页面事实。 */
@Service
public class AssistantModuleContextService {

    static final int MAX_SUMMARY_LENGTH = 6_000;
    static final Duration CACHE_TTL = Duration.ofDays(7);

    private final AssistantModuleContextRepository repository;

    public AssistantModuleContextService(AssistantModuleContextRepository repository) {
        this.repository = repository;
    }

    /** 返回尚未过期且来源版本仍匹配的摘要。 */
    public ResolveResult resolve(String appId, String moduleKey, String route, String sourceRevision) {
        String normalizedAppId = requireText(appId, "appId", 64);
        String normalizedModuleKey = requireText(moduleKey, "moduleKey", 240);
        requireOptionalText(route, "route", 1_000);
        String normalizedRevision = normalizeOptionalText(sourceRevision, "sourceRevision", 160);
        long now = System.currentTimeMillis();
        return repository.find(currentUserId(), normalizedAppId, normalizedModuleKey)
                .filter(context -> context.expiresAt() > now)
                .filter(context -> revisionMatches(normalizedRevision, context.sourceRevision()))
                .map(context -> new ResolveResult(true, context.summary(), context.sourceRevision(),
                        context.updateTime(), context.expiresAt()))
                .orElseGet(() -> new ResolveResult(false, null, normalizedRevision, null, null));
    }

    /** 保存一次探索完成后的有界摘要，并刷新七天有效期。 */
    public SaveResult save(String appId, String moduleKey, String route, String sourceRevision, String summary) {
        String normalizedAppId = requireText(appId, "appId", 64);
        String normalizedModuleKey = requireText(moduleKey, "moduleKey", 240);
        String normalizedRoute = normalizeOptionalText(route, "route", 1_000);
        String normalizedRevision = normalizeOptionalText(sourceRevision, "sourceRevision", 160);
        String normalizedSummary = requireText(summary, "summary", MAX_SUMMARY_LENGTH);
        long now = System.currentTimeMillis();
        long expiresAt = now + CACHE_TTL.toMillis();
        repository.upsert(new AssistantModuleContext(
                UUID.randomUUID().toString(), currentUserId(), normalizedAppId, normalizedModuleKey,
                normalizedRoute, normalizedRevision, normalizedSummary, expiresAt, now, now));
        return new SaveResult(normalizedModuleKey, now, expiresAt);
    }

    private boolean revisionMatches(String requested, String cached) {
        return requested.isBlank() || requested.equals(cached);
    }

    private long currentUserId() {
        return AuthContext.current().map(principal -> principal.userId()).orElse(0L);
    }

    private String requireText(String value, String field, int maxLength) {
        String normalized = normalizeOptionalText(value, field, maxLength);
        if (normalized.isBlank()) {
            throw new IllegalArgumentException(field + " 不能为空");
        }
        return normalized;
    }

    private void requireOptionalText(String value, String field, int maxLength) {
        normalizeOptionalText(value, field, maxLength);
    }

    private String normalizeOptionalText(String value, String field, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException(field + " 长度不能超过 " + maxLength);
        }
        return normalized;
    }

    /**
     * 模块摘要读取结果。
     *
     * @param found 是否命中
     * @param summary 历史探索摘要
     * @param sourceRevision 摘要对应版本
     * @param updatedAt 最后更新时间
     * @param expiresAt 失效时间
     */
    public record ResolveResult(boolean found, String summary, String sourceRevision,
                                Long updatedAt, Long expiresAt) {
    }

    /**
     * 模块摘要保存结果。
     *
     * @param moduleKey 稳定模块标识
     * @param updatedAt 最后更新时间
     * @param expiresAt 失效时间
     */
    public record SaveResult(String moduleKey, long updatedAt, long expiresAt) {
    }
}
