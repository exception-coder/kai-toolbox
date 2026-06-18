package com.exceptioncoder.toolbox.visitoranalysis.api.dto;

/**
 * 关系维度，仅当 {@link IdentityType#CUSTOMER} 时有意义。
 * NONE 用于非客户身份。NEW/EXISTING/CHURNED 的判据来自客户库匹配 + last_deal_at。
 */
public enum RelationshipType {
    NEW,        // 新客
    EXISTING,   // 熟客
    CHURNED,    // 流失客户
    NONE;       // 不适用（身份非客户）

    public static RelationshipType parse(String s) {
        if (s == null) return NONE;
        try {
            return valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return NONE;
        }
    }
}
