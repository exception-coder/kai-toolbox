package com.exceptioncoder.toolbox.aisecretary.domain;

import java.util.Arrays;

/**
 * 长期记忆类目（受控词表）。LLM 提议的 category 经 {@link #fromLabel} 归一化；
 * 无法匹配返回 {@code null}（由 MemoryService 裁决时丢弃该候选）——避免脏类目污染画像。
 *
 * <p>仅这三类「画像级稳定记忆」入库；「近期重要事项」从 ai_secretary_note 派生，不在此列。
 */
public enum MemoryCategory {
    PREFERENCE("偏好"),
    BOUNDARY("禁区"),
    PERSON("核心人物");

    private final String label;

    MemoryCategory(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** 按中文 label 或枚举名归一化；匹配不上返回 null（候选被丢弃）。 */
    public static MemoryCategory fromLabel(String s) {
        if (s != null) {
            String t = s.trim();
            for (MemoryCategory c : values()) {
                if (c.label.equals(t) || c.name().equalsIgnoreCase(t)) {
                    return c;
                }
            }
        }
        return null;
    }

    /** 注入 prompt 的可选类目清单。 */
    public static String labelsCsv() {
        return String.join(" / ", Arrays.stream(values()).map(MemoryCategory::label).toList());
    }
}
