package com.exceptioncoder.toolbox.aisecretary.domain;

import java.util.Arrays;

/**
 * 记录类目（受控词表）。LLM 返回的 category 字符串经 {@link #fromLabel} 归一化到本枚举，
 * 无法匹配的一律落到 {@link #UNCATEGORIZED}——这是「抗造点②：分类失控」的兜底：
 * 用软枚举 + 服务端归一化，而非硬枚举，避免单条异常类目使整批结构化解析失败。
 */
public enum NoteCategory {
    TODO("待办"),
    SCHEDULE("日程"),
    EXPENSE("开销"),
    IDEA("想法"),
    NOTE("笔记"),
    UNCATEGORIZED("未分类");

    private final String label;

    NoteCategory(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** 按中文 label 或枚举名归一化；匹配不上返回 UNCATEGORIZED。 */
    public static NoteCategory fromLabel(String s) {
        if (s != null) {
            String t = s.trim();
            for (NoteCategory c : values()) {
                if (c.label.equals(t) || c.name().equalsIgnoreCase(t)) {
                    return c;
                }
            }
        }
        return UNCATEGORIZED;
    }

    /** 注入 prompt 的可选类目清单，如「待办 / 日程 / 开销 / 想法 / 笔记 / 未分类」。 */
    public static String labelsCsv() {
        return String.join(" / ", Arrays.stream(values()).map(NoteCategory::label).toList());
    }
}
