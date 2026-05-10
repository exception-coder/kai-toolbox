package com.exceptioncoder.toolbox.projects.service;

import com.exceptioncoder.toolbox.projects.api.dto.ProjectsListResponse;
import com.exceptioncoder.toolbox.projects.config.ProjectsProperties;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.function.Supplier;

/**
 * 单条目 TTL 缓存。频繁刷新页面（导航来回）时不重复扫描磁盘。
 *
 * <p>不引入 Caffeine：本工具只缓存一条记录，{@code ConcurrentHashMap} 都嫌重，
 * 用 {@code volatile} 字段 + double-checked locking 即可。</p>
 */
@Component
public class ProjectsCache {

    private final ProjectsProperties props;

    private volatile ProjectsListResponse cached;
    private volatile Instant expireAt = Instant.EPOCH;
    private final Object lock = new Object();

    public ProjectsCache(ProjectsProperties props) {
        this.props = props;
    }

    /**
     * 命中未过期缓存直接返回；否则在锁内重新加载并刷新过期时间。
     *
     * @param loader 缓存未命中时的加载器
     */
    public ProjectsListResponse getOrLoad(Supplier<ProjectsListResponse> loader) {
        if (Instant.now().isBefore(expireAt) && cached != null) {
            return cached;
        }
        synchronized (lock) {
            if (Instant.now().isBefore(expireAt) && cached != null) {
                return cached;
            }
            ProjectsListResponse fresh = loader.get();
            cached = fresh;
            int ttl = props.getCacheTtlSeconds() <= 0 ? 5 : props.getCacheTtlSeconds();
            expireAt = Instant.now().plusSeconds(ttl);
            return fresh;
        }
    }
}
