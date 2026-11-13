package com.exceptioncoder.toolbox.projects.catalog;

import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.exceptioncoder.toolbox.common.project.ProjectPaths;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** 排除整个项目及其子模块；每次读取最新配置，不依赖清单缓存。 */
@Component
public class ProjectVisibilityPolicy implements ProjectAccess {
    private static final long CANONICAL_TTL_NANOS = 15_000_000_000L;
    private static final int MAX_CANONICAL_CACHE = 1024;
    private final ProjectCatalogProperties properties;
    private final Map<Path, CachedCanonical> canonicalCache = new ConcurrentHashMap<>();
    private volatile CachedExcluded excludedSnapshot;

    public ProjectVisibilityPolicy(ProjectCatalogProperties properties) { this.properties = properties; }

    @Override
    public boolean allowed(Path path) {
        List<String> configured = properties.getExcludedPaths();
        if (configured == null || configured.isEmpty()) {
            return true;
        }
        Path absolute = path.toAbsolutePath().normalize();
        List<ExcludedRule> rules = resolveExcluded(configured);
        for (ExcludedRule rule : rules) {
            if (absolute.startsWith(rule.absolute())) {
                return false;
            }
        }
        Path normalized = canonical(absolute);
        for (ExcludedRule rule : rules) {
            if (normalized.startsWith(rule.canonical())) {
                return false;
            }
        }
        return true;
    }

    private List<ExcludedRule> resolveExcluded(List<String> configured) {
        long now = System.nanoTime();
        List<String> key = List.copyOf(configured);
        CachedExcluded current = this.excludedSnapshot;
        if (current != null && now < current.expiresAtNanos() && current.configured().equals(key)) {
            return current.rules();
        }
        List<ExcludedRule> rules = key.stream().map(Path::of).map(excluded -> {
            Path abs = excluded.toAbsolutePath().normalize();
            return new ExcludedRule(abs, ProjectPaths.canonical(abs));
        }).toList();
        this.excludedSnapshot = new CachedExcluded(key, now + CANONICAL_TTL_NANOS, rules);
        this.canonicalCache.clear();
        return rules;
    }

    private Path canonical(Path absolute) {
        long now = System.nanoTime();
        CachedCanonical cached = canonicalCache.get(absolute);
        if (cached != null && now < cached.expiresAtNanos()) {
            return cached.canonical();
        }
        Path resolved = ProjectPaths.canonical(absolute);
        if (canonicalCache.size() >= MAX_CANONICAL_CACHE) {
            canonicalCache.clear();
        }
        canonicalCache.put(absolute, new CachedCanonical(resolved, now + CANONICAL_TTL_NANOS));
        return resolved;
    }

    private record ExcludedRule(Path absolute, Path canonical) { }
    private record CachedExcluded(List<String> configured, long expiresAtNanos, List<ExcludedRule> rules) { }
    private record CachedCanonical(Path canonical, long expiresAtNanos) { }
}
