package com.exceptioncoder.toolbox.foreconsult.domain;

/** V4 业务咨询问题分类，作为提示词、持久化和历史展示的唯一枚举契约。 */
public enum ConsultProblemCategory {
    MENU_OPERATION,
    BUSINESS_RULE,
    PAGE_OR_API_ERROR,
    DATA_ANOMALY,
    SQL_OR_SCHEMA,
    CROSS_SYSTEM,
    OTHER;

    /** 非法或空值不落库，避免把模型自由文本当作分类事实。 */
    public static String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return valueOf(value.trim().toUpperCase()).name();
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }
}
