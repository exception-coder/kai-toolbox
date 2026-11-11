package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.Set;

/** Claude 原生请求参数；auto 沿用引擎默认，Ultracode 与强度独立。 */
public record ClaudeSessionOptions(String effort, boolean ultracode) {
    private static final Set<String> LEVELS = Set.of("auto", "low", "medium", "high", "xhigh", "max");
    public static final ClaudeSessionOptions DEFAULT = new ClaudeSessionOptions("auto", false);

    public ClaudeSessionOptions {
        if (!isEffort(effort)) {
            throw new IllegalArgumentException("Claude 强度必须是 auto、low、medium、high、xhigh 或 max");
        }
    }

    public static boolean isEffort(String value) {
        return LEVELS.contains(value == null ? "" : value);
    }
}
