package com.exceptioncoder.toolbox.visitoranalysis.api.dto;

/**
 * 身份维度（主分类）。正交于 {@link RelationshipType}：关系维度只在 CUSTOMER 时有意义。
 * LLM 只能在这些合法值里选，代码裁决时做枚举校验，越界一律降级为 UNKNOWN + 待人工确认。
 */
public enum IdentityType {
    CUSTOMER,     // 客户
    COMPETITOR,   // 竞争对手
    VENDOR,       // 供应商 / 服务商
    PARTNER,      // 合作伙伴 / 渠道
    JOB_SEEKER,   // 求职者
    OFFICIAL,     // 政府 / 监管 / 媒体
    UNKNOWN;      // 无法识别（兜底）

    public static IdentityType parse(String s) {
        if (s == null) return UNKNOWN;
        try {
            return valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return UNKNOWN;
        }
    }
}
