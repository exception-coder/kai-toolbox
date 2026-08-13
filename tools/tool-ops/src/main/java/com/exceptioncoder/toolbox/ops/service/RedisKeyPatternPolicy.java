package com.exceptioncoder.toolbox.ops.service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.regex.Pattern;

/** Redis 键批量删除的安全模式策略。 */
final class RedisKeyPatternPolicy {

    private static final int MAX_PATTERNS = 10;
    private static final Pattern SAFE_PREFIX_PATTERN = Pattern.compile("[A-Za-z0-9:._-]{4,}\\*");

    private RedisKeyPatternPolicy() {
    }

    /**
     * 去除空白、保持顺序并去重，同时拒绝可能扩大删除范围的通配符模式。
     *
     * @param patterns 原始模式列表
     * @return 可安全交给 Redis SCAN 的模式列表
     */
    static List<String> normalize(List<String> patterns) {
        if (patterns == null || patterns.isEmpty()) {
            throw new IllegalArgumentException("至少需要一个 Redis 键模式");
        }
        if (patterns.size() > MAX_PATTERNS) {
            throw new IllegalArgumentException("一次最多清理 " + MAX_PATTERNS + " 个 Redis 键模式");
        }

        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String pattern : patterns) {
            String value = pattern == null ? "" : pattern.trim();
            if (!SAFE_PREFIX_PATTERN.matcher(value).matches()) {
                throw new IllegalArgumentException("Redis 键模式只允许使用安全前缀加末尾 *：" + value);
            }
            normalized.add(value);
        }
        return List.copyOf(normalized);
    }
}

