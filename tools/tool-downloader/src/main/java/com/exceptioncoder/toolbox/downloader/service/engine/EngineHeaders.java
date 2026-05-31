package com.exceptioncoder.toolbox.downloader.service.engine;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;

/**
 * 引擎中立的响应头表示。
 * 不直接用 {@code java.net.http.HttpHeaders}，因为 OkHttp 是另一套类型。
 * key 统一小写存储；只保留 first value（下载器场景够用）。
 */
public final class EngineHeaders {

    private final Map<String, String> firstValues;

    public EngineHeaders(Map<String, String> firstValues) {
        // defensive copy + 强制小写
        Map<String, String> copy = new HashMap<>(firstValues.size());
        firstValues.forEach((k, v) -> {
            if (k != null && v != null) copy.put(k.toLowerCase(), v);
        });
        this.firstValues = copy;
    }

    public Optional<String> firstValue(String name) {
        return Optional.ofNullable(firstValues.get(name.toLowerCase()));
    }

    public OptionalLong firstValueAsLong(String name) {
        return firstValue(name)
                .map(s -> {
                    try { return Long.parseLong(s.trim()); }
                    catch (NumberFormatException e) { return null; }
                })
                .map(OptionalLong::of)
                .orElseGet(OptionalLong::empty);
    }

    public Map<String, String> asMap() {
        return Map.copyOf(firstValues);
    }
}
