package com.exceptioncoder.toolbox.aisecretary.domain;

/**
 * 记忆状态机：proposed（LLM 提议待确认） → active（用户确认/手动新增） → archived（归档）。
 * 只有 active 会被注入 system context。
 */
public enum MemoryStatus {
    PROPOSED,
    ACTIVE,
    ARCHIVED;

    public static MemoryStatus fromString(String s) {
        if (s != null) {
            for (MemoryStatus v : values()) {
                if (v.name().equalsIgnoreCase(s.trim())) {
                    return v;
                }
            }
        }
        return PROPOSED;
    }
}
