package com.exceptioncoder.toolbox.eval.assertion;

/**
 * 通用断言类型库。确定性优先：能用程序判定的一律在此，LLM_JUDGE 只留给真正开放式的表述，
 * 且首版不实现——场景 ②（抽取/分类型）完全不需要它。
 */
public enum AssertionType {
    /** 严格相等（数值/布尔/字符串按 JSON 语义比较）。 */
    EQUALS,
    /** 字符串忽略大小写与首尾空白相等，用于枚举字段。 */
    EQUALS_IGNORE_CASE,
    /** 实际值必须落在 expected 数组给出的集合内，用于受控枚举。 */
    IN_SET,
    /** 字段存在且非 null、非空串。 */
    NON_NULL,
    /** 字段不存在或为 null，用于断言「不该抽出来的别抽」。 */
    ABSENT,
    /** 实际字符串包含 expected 子串（忽略大小写）。 */
    CONTAINS,
    /** 数值差在 expected 容差内，形如 {"value":3,"tolerance":0.5}。 */
    NUMERIC_WITHIN;

    public static AssertionType from(String raw) {
        if (raw == null || raw.isBlank()) {
            return EQUALS;
        }
        try {
            return AssertionType.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("未知断言类型: " + raw);
        }
    }
}
