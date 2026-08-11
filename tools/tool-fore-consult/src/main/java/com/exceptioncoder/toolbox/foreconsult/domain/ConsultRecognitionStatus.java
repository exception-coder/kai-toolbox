package com.exceptioncoder.toolbox.foreconsult.domain;

/** V4 结构化识别结果的完整度状态。 */
public enum ConsultRecognitionStatus {
    CONFIRMED,
    PARTIAL,
    UNRECOGNIZED;

    /** 非法或空值统一降级为未识别。 */
    public static String normalize(String value) {
        if (value == null || value.isBlank()) {
            return UNRECOGNIZED.name();
        }
        try {
            return valueOf(value.trim().toUpperCase()).name();
        } catch (IllegalArgumentException ignored) {
            return UNRECOGNIZED.name();
        }
    }
}
