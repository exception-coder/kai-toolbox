package com.exceptioncoder.toolbox.docker.service;

import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * 容器列表 / stats 的轻量 30s TTL 缓存。
 * key 格式：
 *   - containers:{hostId}:{appId?}:{includeStopped}
 *   - stats:{hostId}
 *
 * 写操作（容器动作 / compose 动作）成功后调用 {@link #invalidateHost(String)}。
 * 不引入 Caffeine（避免 premature infrastructure，按 CLAUDE.md 约定）。
 */
@Component
public class ContainerCache {

    private static final long TTL_MS = 30_000L;

    private record Entry(Object value, long expireAtMs) {}

    private final ConcurrentHashMap<String, Entry> store = new ConcurrentHashMap<>();

    /** 30s 内命中缓存返回快照；过期或缺失则跑 loader 回源、写回并返回。同 key 并发回源用 String.intern() 串行化。 */
    @SuppressWarnings("unchecked")
    public <T> T get(String key, Supplier<T> loader) {
        Entry hit = store.get(key);
        long now = System.currentTimeMillis();
        if (hit != null && hit.expireAtMs > now) {
            return (T) hit.value;
        }
        // 同 key 并发回源串行化，避免一次缓存失效引发的 N 个 SSH
        synchronized (key.intern()) {
            Entry second = store.get(key);
            if (second != null && second.expireAtMs > System.currentTimeMillis()) {
                return (T) second.value;
            }
            T fresh = loader.get();
            store.put(key, new Entry(fresh, System.currentTimeMillis() + TTL_MS));
            return fresh;
        }
    }

    /** nocache 路径：跳过读，但读到值后仍回填缓存（让后续 staleTime 内的请求享受缓存）。 */
    public void put(String key, Object value) {
        store.put(key, new Entry(value, System.currentTimeMillis() + TTL_MS));
    }

    /** host 维度失效：清掉本 host 下所有 containers / stats key。 */
    public void invalidateHost(String hostId) {
        String containersPrefix = "containers:" + hostId + ":";
        String statsKey = "stats:" + hostId;
        store.keySet().removeIf(k -> k.startsWith(containersPrefix) || k.equals(statsKey));
    }
}
