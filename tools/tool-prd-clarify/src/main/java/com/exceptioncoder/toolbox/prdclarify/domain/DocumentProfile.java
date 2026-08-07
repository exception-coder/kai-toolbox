package com.exceptioncoder.toolbox.prdclarify.domain;

/** Defines the document contract used by one PRD lifecycle. */
public enum DocumentProfile {
    CLASSIC,
    SPEC_DRIVEN;

    public static DocumentProfile fromNullable(String value) {
        if (value == null || value.isBlank()) {
            return CLASSIC;
        }
        try {
            return valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("不支持的文档模式: " + value);
        }
    }

    public static String normalize(String value) {
        return fromNullable(value).name();
    }
}
